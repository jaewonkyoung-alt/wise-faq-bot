/**
 * 공식 졸업기준 테스트.
 *  1) 정답표(엑셀 '학번별_신입생' 394행)와 DB 조회 결과를 항목별로 전부 비교
 *  2) 학과명 해석: 현행명 42개 · 엑셀 별칭 전부 · 흔한 다른 표기
 *  3) 단과대 목록이 42개 학과와 정확히 일치
 *  4) 기준이 없는 경우의 안내 (2020 이전 · 신설 · 모집중단 · 가이드 이후 학번)
 *
 *   npm run test:grad-criteria
 */
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
dotenv.config();
// 테스트는 항상 임시 DB — .env 의 운영 DATABASE_PATH 를 쓰면 운영 데이터가 섞인다 (10/10 사고)
{
  process.env.DATABASE_PATH = path.join(os.tmpdir(), `wise-test-grad-criteria-${process.pid}.db`);
}

import {
  countCriteria,
  findCriteria,
  formatCriteriaAnswer,
  formatCriteriaMiss,
  importGradCriteria,
  listCriteriaDepartments,
  resolveGradDepartment,
} from '../src/services/gradCriteria';
import { loadCollegeTaxonomy } from '../src/services/collegeTaxonomy';
import type { GradCriteria, StudentType } from '../src/types/gradCriteria';

let passed = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (!cond) {
    console.error(`FAIL  ${name}`, extra ?? '');
    throw new Error(`test failed: ${name}`);
  }
  passed += 1;
  console.log(`PASS  ${name}`);
}

const SRC = path.resolve(process.cwd(), 'data/graduation-source');
const readRows = <T>(name: string): T[] =>
  (JSON.parse(fs.readFileSync(path.join(SRC, `${name}.json`), 'utf-8')) as { rows: T[] }).rows;

const FIELDS: Array<keyof GradCriteria> = [
  'affiliation', 'personality_self', 'personality', 'communication', 'liberal_foreign', 'digital',
  'academic_basic', 'convergence', 'foreign_common', 'major_single', 'major_primary', 'major_double',
  'total_credits', 'gpa', 'volunteer', 'lang_requirement', 'lang_test', 'thesis', 'notes', 'year_label',
];

function main(): void {
  importGradCriteria(true);
  const { departments, rows } = countCriteria();
  check('적재: 42개 학과', departments === 42, departments);
  check('적재: 523행 (엑셀 졸업기준_요약과 같음)', rows === 523, rows);

  /* ── 1. 정답표 전수 비교 ── */
  type KeyRow = Record<string, string | number | null> & {
    year: number; department: string; program: string; student_type: StudentType;
  };
  const key = readRows<KeyRow>('answer-key');
  check('정답표 394행', key.length === 394, key.length);
  let fieldsCompared = 0;
  const mismatches: string[] = [];
  for (const k of key) {
    const found = findCriteria(k.year, k.department, k.student_type).find((r) => r.program === k.program);
    if (!found) {
      mismatches.push(`${k.year} ${k.department} ${k.program} 조회 실패`);
      continue;
    }
    for (const f of FIELDS) {
      fieldsCompared += 1;
      if ((found[f] ?? null) !== (k[f] ?? null)) {
        mismatches.push(`${k.year} ${k.department}${k.program ? '/' + k.program : ''} ${f}: DB=${found[f]} 정답=${k[f]}`);
      }
    }
    const answer = formatCriteriaAnswer(k.year, k.department, [found], k.student_type);
    const credits = String(k.total_credits ?? '');
    if (credits && !answer.includes(credits)) mismatches.push(`${k.year} ${k.department} 답변에 학점 ${credits} 없음`);
    if (answer.length > 900) mismatches.push(`${k.year} ${k.department} 답변 900자 초과`);
  }
  check(`정답표 394행 × ${FIELDS.length}항목 전부 일치 (${fieldsCompared}개 값)`, mismatches.length === 0, mismatches.slice(0, 10));

  /* ── 2. 학과명 해석 ── */
  type DeptRow = { name: string; homepage_name: string; aliases: string[] };
  const depts = readRows<DeptRow>('departments');
  const wrong: string[] = [];
  for (const d of depts) {
    for (const name of [d.name, d.homepage_name, ...d.aliases]) {
      const r = resolveGradDepartment(name);
      if (r.kind === 'none' || r.kind === 'ambiguous' || r.department !== d.name) {
        wrong.push(`${name} → ${JSON.stringify(r)}`);
      }
    }
  }
  check('현행명 · 홈페이지 표기 · 엑셀 별칭 모두 제 학과로', wrong.length === 0, wrong);

  const samples: Array<[string, string]> = [
    ['컴퓨터공학전공', '컴퓨터공학과'],
    ['컴공', '컴퓨터공학과'],
    ['전자정보통신공학과', '전자·정보통신공학과'],
    ['빅데이터응용통계학전공', '빅데이터·응용통계학전공'],
    ['불교아동보육학과', '아동청소년교육학과'],
    ['조경전공', '조경·정원디자인학과'],
    ['의학과', '의예과·의학과'],
    ['22학번 정보경영학과 졸업요건', '정보경영학과'],
    ['21학번 경영학과 졸업학점', '경영학과'],
  ];
  for (const [q, want] of samples) {
    const r = resolveGradDepartment(q);
    check(`"${q}" → ${want}`, (r.kind === 'exact' || r.kind === 'contains') && r.department === want, r);
  }
  const amb = resolveGradDepartment('경영');
  check('"경영" 은 후보 여러 개로', amb.kind === 'ambiguous' && amb.candidates.length >= 2, amb);

  /* ── 3. 단과대 목록 ── */
  const tax = loadCollegeTaxonomy(true);
  const inTax = Object.values(tax.colleges).flat();
  const official = listCriteriaDepartments();
  check('단과대 목록 = 42개 학과 (중복·누락 없음)',
    inTax.length === 42 && new Set(inTax).size === 42 && official.every((d) => inTax.includes(d)),
    { inTax: inTax.length, missing: official.filter((d) => !inTax.includes(d)) });
  const formerUnknown = Object.values(tax.former_colleges).flat().filter((d) => !official.includes(d));
  check('옛 단과대 목록의 학과명도 모두 실재', formerUnknown.length === 0, formerUnknown);

  /* ── 4. 기준이 없는 경우 ── */
  const t: StudentType = '신입생-내국인';
  check('2020 이전 → 개별 심사 안내', formatCriteriaMiss(2019, '국사학과', t).includes('개별 심사'));
  check('신설 학과 21학번 → "2022학번부터"', findCriteria(2021, '스포츠의학전공', t).length === 0 &&
    formatCriteriaMiss(2021, '스포츠의학전공', t).includes('2022학번부터'));
  check('모집중단 전공 24학번 → "모집 중단"', formatCriteriaMiss(2024, '신소재화학전공', t).includes('모집 중단'));
  check('운영 중 학과 2027학번 → 모집중단이라 하지 않음', !formatCriteriaMiss(2027, '컴퓨터공학과', t).includes('모집 중단'));
  check('조사: 스포츠의학전공은', formatCriteriaMiss(2021, '스포츠의학전공', t).startsWith('스포츠의학전공은'));

  /* ── 5. 답변 문장 ── */
  const cs21 = formatCriteriaAnswer(2021, '컴퓨터공학과', findCriteria(2021, '컴퓨터공학과', t), t);
  check('21학번 컴공: 당시 소속 표시', cs21.includes('당시 소속 컴퓨터공학전공'), cs21);
  check('21학번 컴공: 단수전공 63 · TOEIC 650 · 사회봉사 30시간',
    cs21.includes('단수전공 63') && cs21.includes('TOEIC 650') && cs21.includes('사회봉사 30시간'), cs21);
  const cs25 = formatCriteriaAnswer(2025, '컴퓨터공학과', findCriteria(2025, '컴퓨터공학과', t), t);
  check('25학번: 모듈 · 모의토익 안내', cs25.includes('융합모듈') && cs25.includes('모의토익'), cs25);
  const med = findCriteria(2022, '의예과·의학과', t);
  check('의예과·의학과 22학번: 예과·본과 두 과정', med.length === 2 && med[0].program === '의예과' && med[1].program === '의학과',
    med.map((r) => r.program));
  const jp = formatCriteriaAnswer(2021, '일어일문학과', findCriteria(2021, '일어일문학과', t), t);
  check('일문: 외국어 시험 세 가지 병기', jp.includes('JLPT N3') && jp.includes('JPT 700') && jp.includes('TOEIC 650'), jp);
  const exempt = formatCriteriaAnswer(2021, '간호학과', findCriteria(2021, '간호학과', t), t);
  check('간호 21학번: 140학점 · 사회봉사/외국어 면제',
    exempt.includes('졸업학점 140') && exempt.includes('사회봉사: 면제') && exempt.includes('외국어 졸업요건: 면제'), exempt);
  const fx = '편입생-외국인' as StudentType;
  const foreign = formatCriteriaAnswer(2023, '경영학과', findCriteria(2023, '경영학과', fx), fx);
  check('외국인 편입생: P.84 참조 안내', foreign.includes('P.84'), foreign);

  console.log(`\nPASS test-grad-criteria (${passed} checks)`);
}

main();
