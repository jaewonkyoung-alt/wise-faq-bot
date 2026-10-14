/**
 * 관리자 'PDF 올리기' 테스트 — 실제 학교 PDF로 올리기 → 미리보기 → 적용 → 되돌리기.
 *  - 원본 PDF는 학교 자료라 레포에 없다. GRAD_PDF_DIR(기본: 외장 SSD)의 학과별 PDF를 쓴다. 없으면 SKIP.
 *  - 원본 42개 전체 대조는: tools/grad-extract/.venv/bin/python tools/grad-extract/pdf_to_criteria.py --selftest <폴더>
 *
 *   npm run test:grad-import
 */
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
dotenv.config();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wise-test-grad-import-'));
// 테스트는 항상 임시 DB · 임시 폴더
process.env.DATABASE_PATH = path.join(TMP, 'test.db');
process.env.GRAD_IMPORT_DIR = path.join(TMP, 'imports');
process.env.GRAD_MD_DIR = path.join(TMP, 'md');

import { getDb } from '../src/db/database';
import { findCriteria, formatCriteriaAnswer, importGradCriteria } from '../src/services/gradCriteria';
import { addPdf, applyBatch, discardBatch, hasChanges, revertBatch } from '../src/services/gradImport';

const PDF_DIR = process.env.GRAD_PDF_DIR || '/Volumes/SSD 2TB/동국대학교/4학년2학기/컴퓨터공학종합설계2/졸업요건_원본PDF';
const CS = path.join(PDF_DIR, '02_학과별', '42_컴퓨터공학과.pdf');
const NURSE = path.join(PDF_DIR, '02_학과별', '45_간호학과.pdf');
const NOT_DEPT = path.join(PDF_DIR, '01_공통', '02_주요학사일정.pdf');

let passed = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (!cond) {
    console.error(`FAIL  ${name}`, extra ?? '');
    throw new Error(`test failed: ${name}`);
  }
  passed += 1;
  console.log(`PASS  ${name}`);
}

async function expectError(fn: () => unknown, re: RegExp): Promise<string> {
  try {
    await fn();
  } catch (e) {
    return re.test((e as Error).message) ? (e as Error).message : `다른 오류: ${(e as Error).message}`;
  }
  return '오류 없음';
}

const T = '신입생-내국인' as const;
const credits = (y: number) => findCriteria(y, '컴퓨터공학과', T)[0]?.total_credits;
const setCredits = (y: number, v: string) =>
  getDb().prepare(`UPDATE graduation_criteria SET total_credits = ? WHERE department = '컴퓨터공학과' AND student_type = ? AND year_from <= ? AND year_to >= ?`)
    .run(v, T, y, y);

async function main(): Promise<void> {
  if (!fs.existsSync(CS)) {
    console.log(`SKIP test-grad-import — 학교 원본 PDF 없음 (${CS})`);
    return;
  }
  getDb();
  importGradCriteria(true);
  const cs = fs.readFileSync(CS);

  /* 1. 같은 PDF 다시 올리기 → 바뀌는 값 없음 */
  const b0 = await addPdf(null, '42_컴퓨터공학과.pdf', cs);
  const f0 = b0.files[0];
  check('학과 자동 인식: 컴퓨터공학과', f0.department === '컴퓨터공학과' && !f0.error, f0);
  check('같은 PDF는 바뀌는 값 없음 (16행 동일)', !hasChanges(f0.diff) && f0.diff?.same === 16, f0.diff);
  discardBatch(b0.id);
  check('미리보기 취소 → 올린 파일 삭제', !fs.existsSync(path.join(TMP, 'imports', b0.id)));

  /* 2. DB 값이 학교 PDF와 다르면 그 칸만 잡는다 */
  setCredits(2025, '999');
  const b1 = await addPdf(null, '컴공_2026.pdf', cs);
  const d1 = b1.files[0].diff!;
  check('바뀐 칸 1개만: 2025학번 신입생 졸업학점 999 -> 130',
    d1.changed.length === 1 && d1.changed[0].fields.length === 1 &&
    d1.changed[0].fields[0].field === 'total_credits' && d1.changed[0].fields[0].before === '999' &&
    d1.changed[0].fields[0].after === '130' && d1.added.length === 0 && d1.removed.length === 0, d1.changed);
  check('미리보기 단계에서는 DB 그대로', credits(2025) === '999');

  /* 3. 적용 → 카톡 답변 바로 반영 */
  const a1 = applyBatch(b1.id);
  check('적용: 컴퓨터공학과 교체', a1.departments.join() === '컴퓨터공학과' && a1.batch.status === 'applied');
  check('적용 후 DB 130', credits(2025) === '130');
  const ans = formatCriteriaAnswer(2025, '컴퓨터공학과', findCriteria(2025, '컴퓨터공학과', T), T);
  check('적용 후 카톡 답변에 130', ans.includes('졸업학점 130'), ans);
  check('학과 문서(MD) 생성', fs.readFileSync(path.join(TMP, 'md', '컴퓨터공학과.md'), 'utf-8').includes('| 신입생-내국인 |'));
  check('같은 묶음 두 번 적용 불가', /미리보기 상태/.test(await expectError(() => applyBatch(b1.id), /미리보기 상태/)));

  /* 4. 되돌리기 */
  const r1 = revertBatch(b1.id);
  check('되돌리기 → 999 복원', r1.batch.status === 'reverted' && credits(2025) === '999');

  /* 5. 순서가 꼬인 되돌리기 막기 */
  const bA = await addPdf(null, 'A.pdf', cs);
  applyBatch(bA.id);
  setCredits(2025, '777');
  const bB = await addPdf(null, 'B.pdf', cs);
  applyBatch(bB.id);
  const msg = await expectError(() => revertBatch(bA.id), /최근 묶음부터/);
  check('나중에 같은 학과를 적용했으면 앞 묶음 되돌리기 막음', /최근 묶음부터/.test(msg), msg);
  revertBatch(bB.id);
  check('최근 묶음 되돌리기 → 777', credits(2025) === '777');

  /* 6. 여러 학과 한 번에 */
  if (fs.existsSync(NURSE)) {
    let b2 = await addPdf(null, '42.pdf', cs);
    b2 = await addPdf(b2.id, '45.pdf', fs.readFileSync(NURSE));
    check('한 묶음에 두 학과 (컴공 · 간호)', b2.files.map((f) => f.department).join() === '컴퓨터공학과,간호학과', b2.files.map((f) => f.department));
    const a2 = applyBatch(b2.id);
    check('두 학과 함께 적용', a2.departments.length === 2 && credits(2025) === '130');
  }

  /* 7. 잘못된 파일 */
  if (fs.existsSync(NOT_DEPT)) {
    const b3 = await addPdf(null, '주요학사일정.pdf', fs.readFileSync(NOT_DEPT));
    check('졸업기준 PDF가 아니면 오류로 표시 (적용 대상 아님)', !!b3.files[0].error, b3.files[0]);
    check('적용할 파일 없으면 적용 거부', /적용할 수 있는 PDF/.test(await expectError(() => applyBatch(b3.id), /적용할 수 있는 PDF/)));
  }
  check('PDF가 아닌 파일 거부', /PDF 파일이 아닙니다/.test(await expectError(() => addPdf(null, 'x.pdf', Buffer.from('hello')), /PDF 파일이 아닙니다/)));

  console.log(`\nPASS test-grad-import (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
