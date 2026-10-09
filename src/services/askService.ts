import { getDb } from '../db/database';
import { embedText, getEmbedProvider } from '../embeddings/embedder';
import { cosineSimilarity, parseEmbedding } from '../embeddings/similarity';
import { createLlmProvider } from '../llm/provider';
import {
  findClubsByCategory,
  findClubsByName,
  listClubs,
} from './clubStore';
import { logUnanswered } from './unanswered';
import { keywordScores, keywordTopics } from './clubKeywords';
import type {
  AskResult,
  Citation,
  SemanticSearchArgs,
  StructuredQueryArgs,
} from '../types/ask';
import type { Club } from '../types/club';

function minScore(): number {
  const n = Number(process.env.SEMANTIC_MIN_SCORE);
  return Number.isFinite(n) ? n : 0.35;
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

function formatCitations(citations: Citation[]): string {
  if (citations.length === 0) return '';
  const lines = citations.map(
    (c) => `· ${c.club_name} — ${c.source_url} (updated_at: ${c.updated_at})`
  );
  return ['[출처]', ...lines].join('\n');
}

function pickFields(
  club: Club,
  fields?: StructuredQueryArgs['fields']
): string {
  const wanted =
    fields && fields.length > 0
      ? fields
      : ([
          'name',
          'category',
          'contact',
          'meeting_time',
          'location',
        ] as const);

  const labels: Record<string, string> = {
    name: '동아리명',
    category: '분과',
    contact: '연락처',
    meeting_time: '정기 모임',
    location: '장소',
    intro: '소개',
    activities: '활동',
    source_url: '출처 URL',
    updated_at: '갱신일',
  };

  const parts: string[] = [`【${club.name}】`];
  for (const f of wanted) {
    const value = club[f as keyof Club];
    if (value == null || value === '') continue;
    parts.push(`${labels[f] || f}: ${value}`);
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
  const facts = limited.map((c) => pickFields(c, args.fields)).join('\n\n');
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
  const queryVec = await embedText(args.query);
  const rows = getDb()
    .prepare(
      `SELECT e.club_id, e.chunk_kind, e.chunk_text, e.embedding_json,
              c.name, c.category, c.intro, c.activities, c.source_url, c.updated_at,
              c.contact, c.meeting_time, c.location, c.created_at
       FROM embeddings e
       JOIN clubs c ON c.id = e.club_id`
    )
    .all() as Array<Record<string, unknown>>;

  const bestByClub = new Map<
    string,
    { score: number; chunk_text: string; club: Club }
  >();

  for (const row of rows) {
    const vec = parseEmbedding(String(row.embedding_json));
    const score = cosineSimilarity(queryVec, vec);
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
          activities: String(row.activities ?? ''),
          source_url: String(row.source_url),
          updated_at: String(row.updated_at),
          created_at: String(row.created_at),
        },
      });
    }
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
  const ranked = pool
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const threshold = minScore();
  const accepted = ranked.filter((r) => r.score >= threshold);

  if (accepted.length === 0) {
    return {
      facts: '',
      citations: [],
      scores: ranked.map((r) => ({ club_id: r.club.id, score: r.score })),
    };
  }

  const facts = accepted
    .map((r) => {
      const c = r.club;
      return [
        `【${c.name}】 (${c.category})`,
        `소개: ${c.intro}`,
        `활동: ${c.activities}`,
        `(검색 점수: ${r.score.toFixed(3)} · 의미 유사도 + 키워드)`,
      ].join('\n');
    })
    .join('\n\n');

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
      answer: '확인되지 않음. 질문을 입력해 주세요. (동아리 MVP)',
      route: 'refuse',
      verified: false,
      citations: [],
    };
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
    const answer = await llm.composeAnswer({
      question: q,
      route: 'refuse',
      facts: '',
      citationsNote: '',
    });
    return {
      answer:
        answer.includes('확인되지 않음')
          ? answer
          : `확인되지 않음. ${decision.refuse_reason || '동아리(클럽) 관련 질문만 지원합니다.'}`,
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
          '확인되지 않음. 해당 조건의 동아리 정보를 DB에서 찾지 못했습니다. 동아리명·분과를 확인해 주세요.',
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
        '확인되지 않음. 유사도가 낮아 신뢰할 수 있는 동아리 근거를 찾지 못했습니다. 질문을 더 구체적으로 하거나 관리자 재인덱싱 상태를 확인해 주세요.',
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
