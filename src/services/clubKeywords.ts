import fs from 'fs';
import path from 'path';
import type { Club } from '../types/club';

/**
 * 동아리 키워드 사전 (data/kb/동아리/_keywords.json).
 * "별 보는 동아리" 처럼 학생이 쓰는 말과 소개에 적힌 분야(천체관측)가 다를 때 임베딩만으로는 놓친다.
 * 사전에 걸린 분야가 동아리 이름·별칭·분야에 있으면 검색 점수에 더한다. 관리자가 JSON만 고치면 된다.
 */

interface Entry {
  q: RegExp;
  c: RegExp;
}

let cache: { mtime: number; entries: Entry[] } | null = null;

function file(): string {
  return path.resolve(process.cwd(), 'data/kb/동아리/_keywords.json');
}

export function loadClubKeywords(): Entry[] {
  try {
    const st = fs.statSync(file());
    if (cache && cache.mtime === st.mtimeMs) return cache.entries;
    const raw = JSON.parse(fs.readFileSync(file(), 'utf-8')) as { entries: Array<{ q: string; c?: string }> };
    const entries = raw.entries.map((e) => ({ q: new RegExp(e.q, 'i'), c: new RegExp(e.c || e.q, 'i') }));
    cache = { mtime: st.mtimeMs, entries };
    return entries;
  } catch {
    return [];
  }
}

/** 이름 · 별칭 · 분야 — 소개 첫 부분. 분과 표기("학술/봉사분과")는 분야가 아니라 뺀다. */
function headline(club: Club): string {
  return `${club.name} ${club.intro}`.replace(/\([^)]*분과\)/g, ' ');
}

/** 질문에 걸린 사전 항목 수 (0이면 키워드 질문이 아님) */
export function keywordTopics(question: string): Entry[] {
  return loadClubKeywords().filter((e) => e.q.test(question));
}

/** 이름과 '다른 이름' 별칭 (2글자 이상) */
function namesOf(club: Club): string[] {
  const m = club.intro.match(/다른 이름:\s*([^\n]+)/);
  const aliases = m ? m[1].split(/,\s*/) : [];
  return [club.name, ...aliases].map((n) => n.trim().toLowerCase()).filter((n) => n.length >= 2);
}

/**
 * 동아리별 키워드 점수: 분야/이름에 있으면 1, 활동 설명에만 있으면 0.3 (항목마다 합산).
 * 질문에 동아리 이름·별칭이 그대로 있으면 2 ("적십자" → RCY, "동산" → 동국산악부).
 */
export function keywordScores(question: string, clubs: Club[]): Map<string, number> {
  const topics = keywordTopics(question);
  const out = new Map<string, number>();
  const q = question.toLowerCase();
  for (const club of clubs) {
    const head = headline(club);
    let s = namesOf(club).some((n) => q.includes(n)) ? 2 : 0;
    for (const t of topics) {
      if (t.c.test(head)) s += 1;
      else if (t.c.test(club.activities || '')) s += 0.3;
    }
    if (s > 0) out.set(club.id, s);
  }
  return out;
}
