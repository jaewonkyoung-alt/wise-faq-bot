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
  return process.env.CLUB_KEYWORDS_FILE || path.resolve(process.cwd(), 'data/kb/동아리/_keywords.json');
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
  if (process.env.CLUB_KEYWORDS === 'off') return []; // 평가용: 임베딩만의 성능을 잴 때 (npm run eval:clubs)
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

/* ── 관리자 화면에서 사전 고치기 (8주차) ──
 * 관리자는 정규식을 몰라도 된다: 단어를 쉼표로 적으면 '별|천체|망원경' 꼴로 저장한다.
 * 개발자가 넣은 예외 규칙(웹(?!툰) 등)이 있는 항목은 '고급'으로 보여 주고 단어 편집은 막는다.
 */
interface RawFile {
  note?: string;
  entries: Array<{ q: string; c?: string }>;
}

export interface KeywordEntryView {
  index: number;
  q: string;
  c: string;
  simple: boolean;
  words: string[];
  fieldWords: string[];
  clubs: string[];
}

const META = /[\\()[\]{}?*+^$.]/;

function readRaw(): RawFile {
  try {
    return JSON.parse(fs.readFileSync(file(), 'utf-8')) as RawFile;
  } catch {
    return { entries: [] };
  }
}

function writeRaw(raw: RawFile): void {
  const tmp = file() + '.tmp';
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(raw, null, 2) + '\n');
  fs.renameSync(tmp, file());
  cache = null;
}

const escapeWord = (w: string) => w.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

/** 쉼표 · 줄바꿈으로 나눈 단어 목록 (빈칸 · 중복 제거) */
export function splitWords(input: string | string[]): string[] {
  const parts = Array.isArray(input) ? input : String(input || '').split(/[,\n，、]/);
  return Array.from(new Set(parts.map((w) => w.trim()).filter(Boolean)));
}

/** 이 분야 말이 이름 · 분야(소개 첫 부분)에 있는 동아리 — 사전 항목이 실제로 어느 동아리로 이어지는지 */
export function clubsForField(field: RegExp, clubs: Club[]): string[] {
  return clubs.filter((c) => field.test(headline(c))).map((c) => c.name);
}

export function listKeywordEntries(clubs: Club[]): KeywordEntryView[] {
  return readRaw().entries.map((e, index) => {
    const c = e.c || e.q;
    const simple = !META.test(e.q) && !META.test(c);
    let re: RegExp | null = null;
    try {
      re = new RegExp(c, 'i');
    } catch {
      re = null;
    }
    return {
      index,
      q: e.q,
      c: e.c || '',
      simple,
      words: simple ? e.q.split('|') : [],
      fieldWords: simple ? (e.c || e.q).split('|') : [],
      clubs: re ? clubsForField(re, clubs) : [],
    };
  });
}

/** 단어 목록 → 사전 항목. 분야를 비우면 학생 표현과 같은 말로 찾는다. */
function entryFrom(words: string[], fieldWords: string[]): { q: string; c?: string } {
  if (!words.length) throw new Error('학생이 쓰는 표현을 한 개 이상 적어 주세요.');
  const q = words.map(escapeWord).join('|');
  const c = fieldWords.length ? fieldWords.map(escapeWord).join('|') : '';
  return c && c !== q ? { q, c } : { q };
}

/** 저장 전에 어느 동아리로 이어지는지 미리 보기 */
export function previewKeywordEntry(words: string[], fieldWords: string[], clubs: Club[]): string[] {
  const e = entryFrom(words, fieldWords);
  return clubsForField(new RegExp(e.c || e.q, 'i'), clubs);
}

export function addKeywordEntry(words: string[], fieldWords: string[]): number {
  const raw = readRaw();
  raw.entries.push(entryFrom(words, fieldWords));
  writeRaw(raw);
  return raw.entries.length - 1;
}

/** expectQ: 화면에 보였던 항목이 그새 바뀌지 않았는지 확인 (다른 창에서 고친 경우 덮지 않음) */
export function updateKeywordEntry(index: number, expectQ: string, words: string[], fieldWords: string[]): void {
  const raw = readRaw();
  const cur = raw.entries[index];
  if (!cur || cur.q !== expectQ) throw new Error('사전이 그사이 바뀌었습니다. 새로고침 후 다시 해 주세요.');
  if (META.test(cur.q) || META.test(cur.c || '')) throw new Error('예외 규칙이 들어 있는 고급 항목은 화면에서 고칠 수 없습니다.');
  raw.entries[index] = entryFrom(words, fieldWords);
  writeRaw(raw);
}

export function deleteKeywordEntry(index: number, expectQ: string): void {
  const raw = readRaw();
  const cur = raw.entries[index];
  if (!cur || cur.q !== expectQ) throw new Error('사전이 그사이 바뀌었습니다. 새로고침 후 다시 해 주세요.');
  raw.entries.splice(index, 1);
  writeRaw(raw);
}
