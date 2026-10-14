import { getDb } from '../db/database';
import { embedModelId, embedQuery, getEmbedProvider } from '../embeddings/embedder';
import { cosineSimilarity, parseEmbedding } from '../embeddings/similarity';
import { createLlmProvider } from '../llm/provider';
import {
  findClubsByCategory,
  findClubsByName,
  listClubs,
} from './clubStore';
import { logUnanswered } from './unanswered';
import { keywordScores, keywordTopics } from './clubKeywords';
import { sourceLabel } from './clubList';
import { findInactiveClub, inactiveClubAnswer } from './clubInactive';
import type {
  AskResult,
  Citation,
  SemanticSearchArgs,
  StructuredQueryArgs,
} from '../types/ask';
import type { Club } from '../types/club';

/**
 * 의미 검색 최소 점수. mock(글자 조각 해시)은 0.35.
 * qwen3-embedding 은 관계없는 질문도 0.44~0.60 이 나와서 0.5 — 그 아래는 버린다 (10/15 실측: 정답 중앙값 0.62).
 */
function minScore(): number {
  const n = Number(process.env.SEMANTIC_MIN_SCORE);
  if (process.env.SEMANTIC_MIN_SCORE && Number.isFinite(n)) return n;
  return getEmbedProvider() === 'ollama' ? 0.5 : 0.35;
}

const OUT_OF_SCOPE = '여기서는 WISE 캠퍼스 동아리에 관한 질문만 답할 수 있어요. 졸업요건 · 지도 · 공지는 메뉴에서 골라 주세요.';

/** 답변 끝 안내 — 동아리 이름만 보내면 상세(모임·동아리방·연락·활동)를 보여 준다 */
const DETAIL_TIP = (name: string) => `더 자세히 보려면 동아리 이름을 보내 주세요. (예: ${name})`;

/** 검색 답변에 쓰는 짧은 소개: 이름 · 분과, 한두 줄 소개, 정기 활동 */
function clubBrief(c: Club): string {
  const lines = [`【${c.name}】 ${c.category}`, c.summary || c.intro.split('\n')[0]];
  if (c.meeting_time) lines.push(`정기 활동: ${c.meeting_time}`);
  return lines.join('\n');
}

/** 키워드 사전 점수 1점당 더하는 값 (최대 2점까지) */
const KEYWORD_WEIGHT = 0.4;

function citationOf(club: Club): Citation {
  return {
    club_id: club.id,
    club_name: club.name,
    source_url: club.source_url,
    updated_at: club.updated_at,
  };
}

/** 출처는 주소 대신 이름으로 한 줄 ("출처: 에브리타임 동아리·학회 게시판 모집 글 · 인스타그램 @…") */
function formatCitations(citations: Citation[]): string {
  if (citations.length === 0) return '';
  const labels = Array.from(new Set(citations.map((c) => sourceLabel(c.source_url))));
  return `출처: ${labels.join(' · ')}`;
}

function pickFields(
  club: Club,
  fields?: StructuredQueryArgs['fields']
): string {
  const asked = fields && fields.length > 0;
  const wanted = asked ? fields : (['meeting_time', 'location', 'contact'] as const);

  const labels: Record<string, string> = {
    contact: '연락',
    meeting_time: '정기 활동',
    location: '동아리방',
    intro: '소개',
    activities: '활동',
  };
  // 물어본 항목이 비어 있으면 비었다고 말한다 (지어내지 않음)
  const missing: Record<string, string> = {
    contact: '연락처는 아직 확인되지 않았어요. 모집 글이나 동아리 SNS로 문의해 주세요.',
    meeting_time: '정기 모임 시간은 아직 확인되지 않았어요.',
    location: '동아리방 위치는 아직 확인되지 않았어요.',
  };

  const parts: string[] = [`【${club.name}】 ${club.category}`];
  if (club.summary) parts.push(club.summary);
  for (const f of wanted) {
    if (!(f in labels)) continue; // name · category 는 첫 줄에 있음
    const value = club[f as keyof Club];
    if (value == null || value === '') {
      if (asked && missing[f]) parts.push(missing[f]);
      continue;
    }
    parts.push(`${labels[f]}: ${value}`);
  }
  return parts.join('\n');
}

function runStructured(args: StructuredQueryArgs): {
  facts: string;
  citations: Citation[];
  clubs: Club[];
} {
  let clubs: Club[] = [];

  if (args.name) {
    clubs = findClubsByName(args.name);
    // 별칭 ("동산" → 동국산악부): 소개의 '다른 이름' 목록에서 찾는다
    if (clubs.length === 0) {
      const key = args.name.toLowerCase();
      clubs = listClubs().filter((c) => {
        const m = c.intro.match(/다른 이름:\s*([^\n]+)/);
        return !!m && m[1].split(/,\s*/).some((a) => a.trim().toLowerCase() === key);
      });
    }
  }
  if (clubs.length === 0 && args.category) {
    clubs = findClubsByCategory(args.category);
  }
  if (clubs.length === 0 && !args.name && !args.category) {
    clubs = listClubs();
  }
  // If name search empty but category set, already tried; if both set and name miss, try category
  if (clubs.length === 0 && args.name && args.category) {
    clubs = findClubsByCategory(args.category);
  }

  if (clubs.length === 0) {
    return { facts: '', citations: [], clubs: [] };
  }

  // Cap list answers
  const limited = clubs.slice(0, 12);
  const facts =
    limited.length === 1
      ? pickFields(limited[0], args.fields)
      : [...limited.map((c) => pickFields(c, args.fields)), DETAIL_TIP(limited[0].name)].join('\n\n');
  return {
    facts,
    citations: limited.map(citationOf),
    clubs: limited,
  };
}

async function runSemantic(args: SemanticSearchArgs, question: string): Promise<{
  facts: string;
  citations: Citation[];
  scores: { club_id: string; score: number }[];
}> {
  const topK = args.top_k ?? 3;
  // 임베딩 서버(Ollama)가 꺼졌거나 느리면 queryVec 가 null — 키워드 사전 점수만으로 고른다.
  const queryVec = await embedQuery(args.query);
  const rows = getDb()
    .prepare(
      `SELECT e.club_id, e.chunk_kind, e.chunk_text, e.embedding_json,
              c.name, c.category, c.intro, c.summary, c.activities, c.source_url, c.updated_at,
              c.contact, c.meeting_time, c.location, c.created_at
       FROM embeddings e
       JOIN clubs c ON c.id = e.club_id
       WHERE e.embed_model = ?`
    )
    .all(embedModelId()) as Array<Record<string, unknown>>;

  const bestByClub = new Map<
    string,
    { score: number; chunk_text: string; club: Club }
  >();

  for (const row of rows) {
    const score = queryVec ? cosineSimilarity(queryVec, parseEmbedding(String(row.embedding_json))) : 0;
    const clubId = String(row.club_id);
    const prev = bestByClub.get(clubId);
    if (!prev || score > prev.score) {
      bestByClub.set(clubId, {
        score,
        chunk_text: String(row.chunk_text),
        club: {
          id: clubId,
          name: String(row.name),
          category: String(row.category),
          contact: row.contact == null ? null : String(row.contact),
          meeting_time:
            row.meeting_time == null ? null : String(row.meeting_time),
          location: row.location == null ? null : String(row.location),
          intro: String(row.intro ?? ''),
          summary: String(row.summary ?? ''),
          activities: String(row.activities ?? ''),
          source_url: String(row.source_url),
          updated_at: String(row.updated_at),
          created_at: String(row.created_at),
        },
      });
    }
  }

  // 벡터가 없는 동아리(임베딩 서버가 꺼져 다시 만들지 못한 경우 등)도 키워드 점수로는 고를 수 있게 후보에 넣는다
  for (const club of listClubs()) {
    if (!bestByClub.has(club.id)) bestByClub.set(club.id, { score: 0, chunk_text: '', club });
  }

  // 하이브리드: 임베딩 유사도 + 키워드 사전 점수 (원래 질문 기준)
  const kw = keywordScores(question, Array.from(bestByClub.values()).map((v) => v.club));
  for (const v of bestByClub.values()) {
    v.score += KEYWORD_WEIGHT * Math.min(kw.get(v.club.id) ?? 0, 2);
  }

  // 사전에 걸린 동아리가 있으면 그 동아리만 답한다 ("별 보는 동아리"에 보드게임 동아리를 붙이지 않게)
  const pool = kw.size > 0
    ? Array.from(bestByClub.values()).filter((v) => kw.has(v.club.id))
    : Array.from(bestByClub.values());
  // "축구 동아리 뭐 있어"처럼 분야가 사전에 걸리면 그 분야 동아리를 다 보여 준다 (최대 6곳 — 카톡 말풍선 길이)
  const strong = Array.from(kw.values()).filter((v) => v >= 1).length;
  const ranked = pool
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(topK, Math.min(strong, 6)));

  const threshold = minScore();
  // 분야 · 이름이 키워드 사전에 걸린 동아리(1점 이상)는 임베딩 점수와 상관없이 답한다 (임베딩 서버가 꺼져도 동작)
  let accepted = ranked.filter((r) => r.score >= threshold || (kw.get(r.club.id) ?? 0) >= 1);
  // 임베딩으로만 고른 경우 1등과 0.04 이내만 ("체스" → 보드게임만, 야구·축구 동아리는 붙이지 않음 — 10/15 실측)
  if (kw.size === 0 && accepted.length > 1) {
    const top = accepted[0].score;
    accepted = accepted.filter((r) => r.score >= top - 0.04);
  }

  if (accepted.length === 0) {
    return {
      facts: '',
      citations: [],
      scores: ranked.map((r) => ({ club_id: r.club.id, score: r.score })),
    };
  }

  // 키워드 사전에 걸리지 않고 임베딩으로만 고른 결과는 '비슷한 동아리'로 안내한다 —
  // 작은 임베딩 모델은 "없는 동아리"를 가려내지 못한다 (체스 → 보드게임, 스키 → 산악부).
  const head = kw.size > 0 ? [] : ['딱 맞는 동아리는 확인되지 않았어요. 소개 글이 비슷한 동아리를 찾아봤어요.'];
  const facts = [...head, ...accepted.map((r) => clubBrief(r.club)), DETAIL_TIP(accepted[0].club.name)].join('\n\n');

  return {
    facts,
    citations: accepted.map((r) => citationOf(r.club)),
    scores: ranked.map((r) => ({ club_id: r.club.id, score: r.score })),
  };
}

/**
 * Core ask() — used by REST /api/ask and Kakao skill adapter.
 */
export async function ask(question: string): Promise<AskResult> {
  const q = question.trim();
  const llm = createLlmProvider();

  if (!q) {
    logUnanswered(q || '(empty)', 'empty question', 'refuse');
    return {
      answer: '궁금한 동아리나 하고 싶은 활동을 보내 주세요. (예: 축구 동아리, 디벨로퍼 언제 모여?)',
      route: 'refuse',
      verified: false,
      citations: [],
    };
  }

  // 학교 옛 목록에만 있고 활동이 확인되지 않는 동아리 ("소낙비 있어?") — 지금 있는 동아리 이름이 함께 있으면 그쪽을 답한다
  const inactive = findInactiveClub(q);
  if (inactive && runStructured({ name: q.replace(/동아리|있어|있나요|\?/g, '').trim() }).clubs.length === 0) {
    return { answer: inactiveClubAnswer(inactive), route: 'structured_query', verified: true, citations: [] };
  }

  const decision = await llm.decideRoute(q);

  // 키워드 사전에 걸리는 질문("별 보는 동아리", "주짓수 배우고 싶어")은 동아리 분야 질문이다.
  // 동아리 이름이 아닌 말을 이름으로 잡았거나 범위 밖으로 거절했다면 의미 검색으로 돌린다.
  if (keywordTopics(q).length > 0) {
    const name = decision.structured?.name;
    const nameMiss = decision.route === 'structured_query' && (!name || runStructured({ name }).clubs.length === 0);
    if (decision.route === 'refuse' || nameMiss) {
      decision.route = 'semantic_search';
      decision.semantic = { query: q, top_k: 3 };
    }
  }

  if (decision.route === 'refuse') {
    logUnanswered(q, decision.refuse_reason || 'refuse', 'refuse');
    return {
      answer: OUT_OF_SCOPE,
      route: 'refuse',
      verified: false,
      citations: [],
      tool_args: { refuse_reason: decision.refuse_reason },
    };
  }

  if (decision.route === 'structured_query') {
    const args = decision.structured || {};
    const { facts, citations } = runStructured(args);
    if (!facts) {
      logUnanswered(q, 'structured miss', 'structured_query');
      return {
        answer:
          "그 동아리를 찾지 못했어요. 이름을 다시 확인하거나 '동아리 목록'을 보내 분야별 목록을 봐 주세요.",
        route: 'structured_query',
        verified: false,
        citations: [],
        tool_args: args as Record<string, unknown>,
      };
    }
    const citationsNote = formatCitations(citations);
    const answer = await llm.composeAnswer({
      question: q,
      route: 'structured_query',
      facts,
      citationsNote,
    });
    return {
      answer,
      route: 'structured_query',
      verified: true,
      citations,
      tool_args: args as Record<string, unknown>,
    };
  }

  // semantic_search
  const args: SemanticSearchArgs = decision.semantic || { query: q, top_k: 3 };
  if (!args.query) args.query = q;
  const { facts, citations, scores } = await runSemantic(args, q);
  if (!facts) {
    logUnanswered(q, 'low similarity or no embeddings', 'semantic_search');
    return {
      answer:
        "찾는 동아리를 확인하지 못했어요. 하고 싶은 활동을 넣어 다시 물어보거나 (예: 축구 동아리) '동아리 목록'을 보내 주세요.",
      route: 'semantic_search',
      verified: false,
      citations: [],
      scores,
      tool_args: args as unknown as Record<string, unknown>,
    };
  }

  const citationsNote = formatCitations(citations);
  const answer = await llm.composeAnswer({
    question: q,
    route: 'semantic_search',
    facts,
    citationsNote,
  });

  return {
    answer,
    route: 'semantic_search',
    verified: true,
    citations,
    scores,
    tool_args: {
      ...args,
      embed_provider: getEmbedProvider(),
    } as Record<string, unknown>,
  };
}
