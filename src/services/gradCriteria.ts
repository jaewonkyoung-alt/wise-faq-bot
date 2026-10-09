import fs from 'fs';
import path from 'path';
import { getDb } from '../db/database';
import type { GradCriteria, GradDepartment, StudentType } from '../types/gradCriteria';

/**
 * 공식 졸업기준 (2026 학사제도 및 학업이수가이드, 42개 학과 · 2020~2026학번).
 *
 * 원본: data/graduation-source/*.json  ← tools/grad-extract/export_json.py 가 엑셀에서 생성.
 * 사실은 이 테이블에서만 가져온다 — 학점을 추측하거나 LLM 으로 만들지 않는다.
 */

const SOURCE_DIR = path.resolve(process.cwd(), 'data/graduation-source');
export const GUIDE_NAME = '2026 학사제도 및 학업이수가이드';

const COLUMNS = [
  'dept_no', 'department', 'program', 'year_label', 'year_from', 'year_to', 'student_type',
  'affiliation', 'personality_self', 'personality', 'communication', 'liberal_foreign', 'digital',
  'academic_basic', 'convergence', 'foreign_common', 'major_single', 'major_primary', 'major_double',
  'total_credits', 'gpa', 'volunteer', 'lang_requirement', 'lang_test', 'thesis', 'notes', 'source_page',
] as const;

/** 엑셀·홈페이지에 없는 흔한 표기 */
const EXTRA_ALIASES: Record<string, string[]> = {
  '컴퓨터공학과': ['컴공', '컴퓨터공학부'],
  '전자·정보통신공학과': ['전자정보통신공학전공'],
  '원자력·에너지·전기공학과': ['에너지·전기공학전공'],
  '빅데이터·응용통계학전공': ['빅데이터응용통계학전공'],
};

/** 별칭 비교용 키: 공백·가운뎃점 변형을 없앤다 (전자정보통신공학과 = 전자·정보통신공학과) */
export function aliasKey(s: string): string {
  return s.replace(/[\s·ㆍ‧・.]/g, '').toLowerCase();
}

function readJson<T>(name: string): T[] {
  const p = path.join(SOURCE_DIR, `${name}.json`);
  return (JSON.parse(fs.readFileSync(p, 'utf-8')) as { rows: T[] }).rows;
}

interface DeptJson {
  no: number;
  name: string;
  homepage_name: string;
  aliases: string[];
  phone: string | null;
  status: string;
  pdf_url: string;
}

/** 별칭 문자열에서 검색 후보를 뽑는다: "창의융합공학부 에너지‧전기공학과" → 전체 + 마지막 단어 */
function aliasCandidates(raw: string): string[] {
  const out = new Set<string>();
  for (const part of raw.split(/\s*[/,]\s*/)) {
    const t = part.trim();
    if (!t) continue;
    out.add(t);
    const last = t.split(/\s+/).pop();
    if (last && last !== t) out.add(last);
  }
  return [...out];
}

/** JSON → DB. 이미 들어 있으면 건너뛴다 (force 면 교체). 적재한 행 수를 돌려준다. */
export function importGradCriteria(force = false): number {
  const db = getDb();
  const existing = (db.prepare('SELECT COUNT(*) AS n FROM graduation_criteria').get() as { n: number }).n;
  if (existing > 0 && !force) return 0;

  const criteria = readJson<Record<string, unknown>>('criteria');
  const depts = readJson<DeptJson>('departments');

  const insertRow = db.prepare(
    `INSERT INTO graduation_criteria (${COLUMNS.join(', ')})
     VALUES (${COLUMNS.map((c) => '@' + c).join(', ')})`
  );
  const insertDept = db.prepare(
    `INSERT OR REPLACE INTO grad_departments (name, dept_no, homepage_name, phone, status, pdf_url)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertAlias = db.prepare(
    'INSERT OR IGNORE INTO department_aliases (alias_key, alias, department) VALUES (?, ?, ?)'
  );

  db.transaction(() => {
    db.prepare('DELETE FROM graduation_criteria').run();
    db.prepare('DELETE FROM grad_departments').run();
    db.prepare('DELETE FROM department_aliases').run();
    for (const r of criteria) {
      const row: Record<string, unknown> = {};
      for (const c of COLUMNS) row[c] = r[c] ?? null;
      row.program = r.program ?? '';
      insertRow.run(row);
    }
    // 현행 이름을 먼저 넣어, 옛 이름이 다른 학과의 현행 이름을 가로채지 못하게 한다
    for (const d of depts) {
      insertDept.run(d.name, d.no, d.homepage_name, d.phone, d.status, d.pdf_url);
      insertAlias.run(aliasKey(d.name), d.name, d.name);
    }
    for (const d of depts) {
      const names = [d.homepage_name, ...d.aliases, ...(EXTRA_ALIASES[d.name] || [])];
      for (const raw of names) {
        for (const a of aliasCandidates(raw)) insertAlias.run(aliasKey(a), a, d.name);
      }
    }
  })();
  return criteria.length;
}

let checked = false;
function ensureLoaded(): void {
  if (checked) return;
  importGradCriteria(false);
  checked = true;
}

export function listCriteriaDepartments(): string[] {
  ensureLoaded();
  return (
    getDb().prepare('SELECT name FROM grad_departments ORDER BY dept_no').all() as { name: string }[]
  ).map((r) => r.name);
}

export function getGradDepartment(name: string): GradDepartment | undefined {
  ensureLoaded();
  return getDb().prepare('SELECT * FROM grad_departments WHERE name = ?').get(name) as
    | GradDepartment
    | undefined;
}

export function countCriteria(): { departments: number; rows: number } {
  ensureLoaded();
  const db = getDb();
  return {
    departments: (db.prepare('SELECT COUNT(*) AS n FROM grad_departments').get() as { n: number }).n,
    rows: (db.prepare('SELECT COUNT(*) AS n FROM graduation_criteria').get() as { n: number }).n,
  };
}

export type DeptResolution =
  | { kind: 'exact' | 'contains'; department: string }
  | { kind: 'ambiguous'; candidates: string[] }
  | { kind: 'none' };

/**
 * 학과명·옛 이름·다른 표기를 현행 학과명으로. `within` 을 주면 그 목록 안에서만 찾는다.
 * 예: "컴퓨터공학전공" → 컴퓨터공학과, "전자정보통신공학과" → 전자·정보통신공학과
 */
export function resolveGradDepartment(text: string, within?: string[]): DeptResolution {
  ensureLoaded();
  const q = aliasKey(text);
  if (q.length < 2) return { kind: 'none' };
  const rows = getDb().prepare('SELECT alias_key, department FROM department_aliases').all() as {
    alias_key: string;
    department: string;
  }[];
  const allowed = within ? new Set(within) : null;
  const pool = allowed ? rows.filter((r) => allowed.has(r.department)) : rows;

  const exact = pool.find((r) => r.alias_key === q);
  if (exact) return { kind: 'exact', department: exact.department };

  const pick = (depts: string[]): DeptResolution => {
    const uniq = [...new Set(depts)];
    if (uniq.length === 1) return { kind: 'contains', department: uniq[0] };
    if (uniq.length > 1) return { kind: 'ambiguous', candidates: uniq };
    return { kind: 'none' };
  };

  // 문장 속 학과명 ("22학번 정보경영학과 졸업요건"): 가장 긴 이름을 채택해 경영학과와 겹치지 않게
  const embedded = pool.filter((r) => r.alias_key.length >= 3 && q.includes(r.alias_key));
  if (embedded.length) {
    const longest = Math.max(...embedded.map((r) => r.alias_key.length));
    return pick(embedded.filter((r) => r.alias_key.length === longest).map((r) => r.department));
  }
  // 이름 일부만 입력 ("컴퓨터", "경영")
  return pick(pool.filter((r) => r.alias_key.includes(q)).map((r) => r.department));
}

/** 신입생 질문이면 '내·외국인 공통' 표(의예과 등)도 함께 본다 */
function typesFor(type: StudentType): StudentType[] {
  if (type === '신입생-내국인' || type === '신입생-외국인') return [type, '신입생-내·외국인'];
  if (type === '편입생-내국인' || type === '편입생-외국인') return [type, '편입생-내·외국인'];
  return [type];
}

/** 학번이 속한 구간의 기준. 의예과·의학과처럼 과정이 둘이면 여러 줄. */
export function findCriteria(
  year: number,
  department: string,
  type: StudentType = '신입생-내국인'
): GradCriteria[] {
  ensureLoaded();
  const types = typesFor(type);
  return getDb()
    .prepare(
      `SELECT * FROM graduation_criteria
       WHERE department = ? AND year_from <= ? AND year_to >= ?
         AND student_type IN (${types.map(() => '?').join(',')})
       ORDER BY program, dept_no`
    )
    .all(department, year, year, ...types) as GradCriteria[];
}

/** 학과에 기준이 있는 학번 범위 (신설·모집중단 안내용) */
export function criteriaYearSpan(department: string): { from: number; to: number } | null {
  ensureLoaded();
  const r = getDb()
    .prepare('SELECT MIN(year_from) AS f, MAX(year_to) AS t FROM graduation_criteria WHERE department = ?')
    .get(department) as { f: number | null; t: number | null };
  return r.f == null || r.t == null ? null : { from: r.f, to: r.t };
}

/* ── 카톡 답변 문장 ── */

const P84 = '외국인편입생 이수기준표(P.84) 참조';

function clean(v: string | null): string | null {
  if (v == null) return null;
  const t = v.replace(/^\*+|\*+$/g, '').trim();
  return t === '' ? null : t;
}

const isDash = (v: string | null) => v != null && v.trim() === '-';

/** 받침 있으면 '은', 없으면 '는' (학과명 뒤 조사) */
function eunNeun(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '은' : '는';
}

function languageLine(req: string | null, test: string | null): string | null {
  if (req == null) return null;
  if (isDash(req)) return '· 외국어 졸업요건: 면제';
  const reqs = req.split(' / ');
  const tests = (test || '').split(' / ');
  const parts = reqs.map((r, i) => {
    const t = tests[i] && tests[i] !== '면제' ? tests[i] : '';
    return t ? `${t} ${clean(r)}` : clean(r);
  });
  return `· 외국어 졸업요건: ${parts.join(' / ')}`;
}

function volunteerLine(v: string | null): string | null {
  if (v == null) return null;
  if (isDash(v)) return '· 사회봉사: 면제';
  return `· 사회봉사 ${/시간$/.test(v) ? v : `${v}시간`}`;
}

/** 비고 중 답변에 이미 반영했거나 기호뿐인 것은 뺀다 */
function notesLine(notes: string | null): string | null {
  if (!notes) return null;
  const kept = notes
    .split('; ')
    .filter((p) => {
      const [k, v = ''] = p.split(': ');
      return !['*', '**', '면제', '시간'].includes(v.trim()) && k !== '사회봉사';
    });
  return kept.length ? `· 비고: ${kept.join(' / ')}` : null;
}

function programBlock(year: number, c: GradCriteria): string[] {
  const lines: string[] = [];
  const isPremed = /예과$/.test(c.program);
  const credits = clean(c.total_credits);
  const gpa = clean(c.gpa);
  if (credits) {
    lines.push(`· ${isPremed ? '수료학점' : '졸업학점'} ${credits}${gpa ? ` · 평점평균 ${gpa} 이상` : ''}`);
  }

  const values = [c.personality_self, c.personality, c.major_single].map((v) => v || '');
  if (values.some((v) => v.includes('P.84'))) {
    lines.push(`· 교양·전공: ${P84}`);
  } else {
    const single = clean(c.major_single);
    const primary = clean(c.major_primary);
    const double = clean(c.major_double);
    if (single) {
      const multi =
        primary && !isDash(primary) && double && !isDash(double)
          ? ` (다전공 시 주전공 ${primary} · 복수전공 ${double})`
          : '';
      lines.push(`· 전공: 단수전공 ${single}${multi}`);
      if (single.includes('모듈')) lines.push('  ※ 단수전공은 타 학부(과) 모듈 또는 융합모듈 1개 이수 필수');
    }
    const liberal = [
      ['인성·자기계발', c.personality_self],
      ['인성', c.personality],
      ['의사소통', c.communication],
      ['외국어', c.liberal_foreign],
      ['디지털', c.digital],
      ['학문기초', c.academic_basic],
      ['융합교양', c.convergence],
      ['외국인 공통기초', c.foreign_common],
    ]
      .map(([k, v]) => [k, clean(v as string | null)] as const)
      .filter(([, v]) => v && !isDash(v))
      .map(([k, v]) => `${k} ${v}`);
    if (liberal.length) lines.push(`· 교양: ${liberal.join(' · ')}`);
  }

  const vol = volunteerLine(c.volunteer);
  if (vol) lines.push(vol);
  const lang = languageLine(c.lang_requirement, c.lang_test);
  if (lang) lines.push(lang);
  if (lang && !lang.includes('면제') && year >= 2025 && c.student_type.includes('내국인')) {
    lines.push('  ※ 2025학번부터 모의토익 인정 불가');
  }
  if (!isPremed) {
    lines.push(c.thesis ? `· 졸업논문·시험: ${c.thesis}` : '· 졸업논문·시험: 원문 공란 — 학과 확인 필요');
  }
  const note = notesLine(c.notes);
  if (note) lines.push(note);
  return lines;
}

const TYPE_LABEL: Record<string, string> = {
  '신입생-내국인': '신입생',
  '편입생-내국인': '편입생',
  '신입생-외국인': '외국인 신입생',
  '편입생-외국인': '외국인 편입생',
  '신입생-내·외국인': '신입생',
  '편입생-내·외국인': '편입생',
};

export function formatCriteriaAnswer(
  year: number,
  department: string,
  rows: GradCriteria[],
  type: StudentType = '신입생-내국인'
): string {
  const dept = getGradDepartment(department);
  const first = rows[0];
  const head = [`【졸업요건】 ${year}학번 · ${department}`];
  const sub = [`${TYPE_LABEL[type]} 기준`];
  if (rows.length === 1) sub.push(`${first.year_label}학번 적용`);
  if (rows.length === 1 && first.affiliation && aliasKey(first.affiliation) !== aliasKey(department)) {
    sub.push(`당시 소속 ${first.affiliation}`);
  }
  head.push(`(${sub.join(' · ')})`);

  const body: string[] = [];
  for (const r of rows) {
    if (rows.length > 1) body.push('', `■ ${r.program} (${r.year_label}학번)`);
    body.push(...programBlock(year, r));
  }

  const foot = ['', `출처: ${GUIDE_NAME}${dept?.phone ? ` · 문의 ${dept.phone}` : ''}`];
  const text = [...head, ...body, ...foot].join('\n');
  return text.length > 900 ? text.slice(0, 899) + '…' : text;
}

/** 학과는 있는데 그 학번·학생구분 기준이 없을 때의 안내 (추측하지 않는다) */
export function formatCriteriaMiss(year: number, department: string, type: StudentType): string {
  const span = criteriaYearSpan(department);
  const dept = getGradDepartment(department);
  const phone = dept?.phone;
  const josa = eunNeun(department);
  const tail = phone ? `\n문의: ${department} ${phone}` : '';
  if (year < 2020) {
    return `2020학번 이전 입학생은 학과가 개별 심사합니다.\n가이드에 기준표가 없어 학과사무실에 확인해 주세요.${tail}`;
  }
  if (span && year < span.from) {
    return `${department}${josa} ${span.from}학번부터 기준이 있습니다.\n${year}학번 기준표는 가이드에 없습니다 (신설 학과·전공).${tail}`;
  }
  if (span && year > span.to) {
    if (dept?.status?.startsWith('모집중단')) {
      return `${department}${josa} ${span.to}학번까지만 기준이 있습니다 (모집 중단).\n${year}학번 기준표는 가이드에 없습니다.${tail}`;
    }
    return `${year}학번 기준은 아직 가이드에 없습니다.\n현재 자료는 ${GUIDE_NAME}로 ${span.to}학번까지 다룹니다.${tail}`;
  }
  return `${department} ${year}학번의 ${TYPE_LABEL[type]} 기준표는 가이드에 없습니다.${tail}`;
}
