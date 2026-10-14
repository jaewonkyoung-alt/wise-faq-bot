import { listClubs } from './clubStore';
import type { Club } from '../types/club';

/**
 * 동아리 목록 — "동아리 목록"은 분과별 개수, "체육 동아리 목록"은 그 분과 동아리를 한두 줄 소개와 함께.
 * 예전에는 전체 목록을 한 말풍선에 넣어 12개에서 잘렸고(900자) 이름·분과만 보여 어떤 동아리인지 알 수 없었다.
 */

/** 학생이 쓰는 분과 이름 → DB 분과 */
const CATEGORY_WORDS: Array<[RegExp, string]> = [
  [/체육|운동|스포츠/, '체육'],
  [/문화\s*예술|문예|예술|공연|문화/, '문화예술'],
  [/봉사/, '봉사'],
  [/학술|공부/, '학술'],
  [/취미/, '취미'],
  [/취업/, '취업'],
  [/종교/, '종교'],
];

const LIST_WORDS = /목록|리스트|전체|종류|모두|다\s*알려|뭐뭐/;
const PLAIN_ASK = /^(무슨|어떤)\s*동아리(가|들이)?\s*(있어|있나요|있니|있음|있어요|알려\s*줘)?\s*\??$|^동아리\s*(뭐|뭐가|머)\s*있(어|나요|니|음)?\s*\??$/;

/** 목록 요청이면 { category } (전체면 null), 아니면 undefined */
export function clubListRequest(utterance: string): { category: string | null } | undefined {
  const u = (utterance || '').trim();
  if (!u) return undefined;
  const category = CATEGORY_WORDS.find(([re]) => re.test(u))?.[1] ?? null;
  if (/(동아리|클럽|분과)/.test(u) && LIST_WORDS.test(u)) return { category };
  if (/^(동아리\s*)?(목록|리스트)$/.test(u)) return { category: null };
  if (PLAIN_ASK.test(u)) return { category: null };
  return undefined;
}

export function categoryCounts(clubs: Club[] = listClubs()): Array<{ category: string; count: number }> {
  const m = new Map<string, number>();
  for (const c of clubs) m.set(c.category, (m.get(c.category) ?? 0) + 1);
  return [...m.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

export interface ClubListAnswer {
  texts: string[];
  /** 빠른 답장: [보이는 글자, 보낼 말] */
  replies: Array<[string, string]>;
}

function categoryReplies(counts: Array<{ category: string; count: number }>, except?: string): Array<[string, string]> {
  return counts
    .filter((c) => c.category !== except)
    .map((c) => [`${c.category} ${c.count}`, `${c.category} 동아리 목록`] as [string, string]);
}

export function clubListAnswer(category: string | null): ClubListAnswer {
  const clubs = listClubs();
  const counts = categoryCounts(clubs);

  if (!category) {
    const line = counts.map((c) => `${c.category} ${c.count}`).join(' · ');
    return {
      texts: [
        [
          `동국대 WISE 동아리는 모두 ${clubs.length}개예요. (2026년 2학기 조사 기준)`,
          '',
          line,
          '',
          '아래에서 분과를 고르면 동아리마다 한두 줄 소개를 보여 드려요.',
          '관심 분야로 물어봐도 돼요. 예: "별 보는 동아리", "코딩 동아리"',
        ].join('\n'),
      ],
      replies: [...categoryReplies(counts), ['메뉴', '메뉴']],
    };
  }

  const inCat = clubs.filter((c) => c.category === category);
  if (inCat.length === 0) {
    return {
      texts: [`'${category}' 분과 동아리를 찾지 못했어요. 분과를 다시 골라 주세요.`],
      replies: [...categoryReplies(counts), ['메뉴', '메뉴']],
    };
  }
  const lines = inCat.map((c) => `· ${c.name}\n  ${c.summary || c.intro}`);
  // 카카오 말풍선 1개 1000자 · 최대 3개 → 950자 단위로 나눈다
  const texts: string[] = [];
  let cur = `【${category} 동아리 ${inCat.length}개】`;
  for (const l of lines) {
    if ((cur + '\n\n' + l).length > 950) {
      texts.push(cur);
      cur = l;
    } else {
      cur += '\n\n' + l;
    }
  }
  texts.push(cur);
  const shown = texts.slice(0, 3);
  if (texts.length > 3) shown[2] += '\n\n(이하 생략 — 동아리 이름으로 물어봐 주세요)';
  shown[shown.length - 1] += '\n\n동아리 이름을 보내면 연락처·활동 시간·모집 정보를 알려 드려요.';
  return { texts: shown, replies: [...categoryReplies(counts, category).slice(0, 6), ['동아리 목록', '동아리 목록'], ['메뉴', '메뉴']] };
}

const normName = (s: string) => s.replace(/[\s.·\-()（）]/g, '').toLowerCase();

/** 말 전체가 동아리 이름·별칭인가 ("검선", "dubc", "동산", "푸르체리마 동아리") */
export function findClubByExactName(utterance: string, clubs: Club[] = listClubs()): Club | undefined {
  const u = normName((utterance || '').replace(/\s*(동아리|클럽)\s*$/, '').replace(/[?？!]+$/, ''));
  if (!u) return undefined; // 정확히 일치할 때만이라 한 글자 이름(온·휴)도 허용
  return clubs.find((c) => {
    const m = c.intro.match(/다른 이름:\s*([^\n]+)/);
    const names = [c.name, ...(m ? m[1].split(/,\s*/) : [])];
    return names.some((n) => normName(n) === u);
  });
}

/** 동아리 한 곳 상세 — 소개 · 분과 · 연락처 · 활동 시간 · 장소 · 활동 · 출처 */
/** 출처 주소 → 사람이 읽는 이름. 검색 답변에는 주소 대신 이것만 붙인다 (주소는 동아리 상세에서). */
export function sourceLabel(url: string): string {
  if (/everytime\.kr\/418785/.test(url)) return '에브리타임 동아리·학회 게시판 모집 글';
  const ig = url.match(/instagram\.com\/([A-Za-z0-9_.]+)/);
  if (ig) return `인스타그램 @${ig[1]}`;
  try {
    return `홈페이지 ${new URL(url).host.replace(/^www\./, '')}`;
  } catch {
    return url;
  }
}

export function clubDetailText(c: Club): string {
  const kind = c.intro.split(/[.\n]/)[0];
  const lines = [`【${c.name}】 ${c.category} · ${kind}`];
  if (c.summary) lines.push(c.summary);
  lines.push('');
  if (c.meeting_time) lines.push(`정기 활동: ${c.meeting_time}`);
  if (c.location) lines.push(`동아리방: ${c.location}`);
  if (c.contact) lines.push(`연락: ${c.contact}`);
  lines.push(`활동: ${c.activities}`);
  const src = /everytime\.kr\/418785/.test(c.source_url)
    ? `${sourceLabel(c.source_url)} (2025-08~2026-09 수집)`
    : c.source_url;
  lines.push('', `출처: ${src}`);
  return lines.join('\n').slice(0, 1000);
}
