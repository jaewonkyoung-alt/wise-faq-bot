import { execFile } from 'child_process';
import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import { getDb } from '../db/database';
import { COLUMNS, listCriteriaRows } from './gradCriteria';
import type { GradCriteria } from '../types/gradCriteria';

/**
 * 관리자 'PDF 올리기' — 학교 공식 졸업기준 PDF → 바뀌는 값 미리보기 → 적용 → (필요하면) 되돌리기.
 *
 * 변환은 검증된 파이썬 추출기(tools/grad-extract/pdf_to_criteria.py)를 그대로 쓴다.
 * 원본 42개 PDF로 돌리면 지금 DB 원본(criteria.json 523행)과 값이 하나도 다르지 않다 (--selftest).
 * 학교 양식이 바뀌어 못 읽은 부분은 경고로 보여 주고, 관리자가 '적용'을 눌러야만 DB가 바뀐다.
 */

const ROOT = process.cwd();
// 경로는 쓸 때마다 읽는다 (테스트가 import 뒤에 환경변수를 바꾼다)
const importDir = () => process.env.GRAD_IMPORT_DIR || path.resolve(ROOT, 'data/imports/graduation');
const SCRIPT = path.resolve(ROOT, 'tools/grad-extract/pdf_to_criteria.py');
const PYTHON = process.env.GRAD_PYTHON || path.resolve(ROOT, 'tools/grad-extract/.venv/bin/python');

/** 비교 · 미리보기에 쓰는 값 칸과 한글 이름 */
export const FIELD_LABELS: Record<string, string> = {
  affiliation: '당시 소속', personality_self: '인성·자기계발', personality: '인성', communication: '의사소통',
  liberal_foreign: '교양 외국어', digital: '디지털', academic_basic: '학문기초', convergence: '융합교양',
  foreign_common: '외국인 공통기초', major_single: '단수전공', major_primary: '주전공', major_double: '복수전공',
  total_credits: '졸업학점', gpa: '평점평균', volunteer: '사회봉사', lang_requirement: '외국어 기준',
  lang_test: '외국어 시험', thesis: '졸업논문·시험', notes: '비고', year_label: '학번 표기',
};
const VALUE_FIELDS = Object.keys(FIELD_LABELS);

export type CriteriaRow = Omit<GradCriteria, 'source_page'> & { source_page: number | null };

export interface RowKey {
  program: string;
  year_from: number;
  year_to: number;
  student_type: string;
}

export interface FileDiff {
  added: CriteriaRow[];
  removed: CriteriaRow[];
  changed: Array<{ key: RowKey; label: string; fields: Array<{ field: string; label: string; before: string | null; after: string | null }> }>;
  same: number;
  newDepartment: boolean;
}

export interface ImportFile {
  file: string;
  stored: string;
  title: string | null;
  department: string | null;
  dept_no: number | null;
  matched_by: string | null;
  rows: CriteriaRow[];
  warnings: string[];
  error: string | null;
  diff: FileDiff | null;
}

export interface ImportBatch {
  id: string;
  status: 'preview' | 'applied' | 'reverted' | 'discarded';
  files: ImportFile[];
  created_at: string;
  applied_at: string | null;
  reverted_at: string | null;
}

interface BatchRow {
  id: string;
  status: ImportBatch['status'];
  files_json: string;
  before_json: string | null;
  created_at: string;
  applied_at: string | null;
  reverted_at: string | null;
}

function toBatch(r: BatchRow): ImportBatch {
  return {
    id: r.id, status: r.status, files: JSON.parse(r.files_json) as ImportFile[],
    created_at: r.created_at, applied_at: r.applied_at, reverted_at: r.reverted_at,
  };
}

export function getBatch(id: string): ImportBatch | undefined {
  const r = getDb().prepare('SELECT * FROM grad_import_batches WHERE id = ?').get(id) as BatchRow | undefined;
  return r ? toBatch(r) : undefined;
}

export function listBatches(limit = 20): ImportBatch[] {
  return (getDb().prepare('SELECT * FROM grad_import_batches ORDER BY created_at DESC LIMIT ?').all(limit) as BatchRow[])
    .map(toBatch);
}

function saveFiles(id: string, files: ImportFile[]): void {
  getDb().prepare('UPDATE grad_import_batches SET files_json = ? WHERE id = ?').run(JSON.stringify(files), id);
}

/** 파이썬 변환기 실행 (PDF 1개) */
export function convertPdf(pdfPath: string): Promise<Omit<ImportFile, 'stored' | 'diff'>> {
  return new Promise((resolve) => {
    execFile(PYTHON, [SCRIPT, pdfPath], { timeout: 120_000, maxBuffer: 20 * 1024 * 1024 }, (err, stdout, stderr) => {
      const base = { file: path.basename(pdfPath), title: null, department: null, dept_no: null, matched_by: null,
        rows: [] as CriteriaRow[], warnings: [] as string[] };
      if (err) {
        const why = /ENOENT/.test(String(err)) ? '서버에 PDF 변환 도구(파이썬 환경)가 없습니다 — 관리자에게 문의하세요.'
          : `PDF 변환에 실패했습니다: ${(stderr || String(err)).split('\n').filter(Boolean).pop()}`;
        resolve({ ...base, error: why });
        return;
      }
      try {
        const out = JSON.parse(stdout) as { files: Array<Omit<ImportFile, 'stored' | 'diff'>> };
        resolve(out.files[0]);
      } catch {
        resolve({ ...base, error: 'PDF 변환 결과를 읽지 못했습니다.' });
      }
    });
  });
}

const keyStr = (r: RowKey) => `${r.program}|${r.year_from}|${r.year_to}|${r.student_type}`;
const keyLabel = (r: RowKey) =>
  `${r.program ? r.program + ' · ' : ''}${r.year_from === r.year_to ? r.year_from : `${r.year_from}~${r.year_to}`}학번 · ${r.student_type}`;

/** 지금 DB의 학과 기준과 새 PDF 행 비교 */
export function diffDepartment(department: string, next: CriteriaRow[]): FileDiff {
  const cur = listCriteriaRows(department);
  const before = new Map(cur.map((r) => [keyStr(r), r]));
  const after = new Map(next.map((r) => [keyStr(r), r]));
  const d: FileDiff = { added: [], removed: [], changed: [], same: 0, newDepartment: cur.length === 0 };
  for (const [k, n] of after) {
    const o = before.get(k);
    if (!o) {
      d.added.push(n);
      continue;
    }
    const fields = VALUE_FIELDS.filter((f) => ((o as unknown as Record<string, unknown>)[f] ?? null) !== ((n as unknown as Record<string, unknown>)[f] ?? null))
      .map((f) => ({
        field: f, label: FIELD_LABELS[f],
        before: ((o as unknown as Record<string, string | null>)[f]) ?? null,
        after: ((n as unknown as Record<string, string | null>)[f]) ?? null,
      }));
    if (fields.length) d.changed.push({ key: n, label: keyLabel(n), fields });
    else d.same += 1;
  }
  for (const [k, o] of before) if (!after.has(k)) d.removed.push(o);
  return d;
}

export function hasChanges(d: FileDiff | null): boolean {
  return !!d && (d.added.length + d.removed.length + d.changed.length > 0);
}

/** PDF 한 개를 묶음에 더한다 (묶음이 없으면 새로 만든다). 변환 · 비교까지 해서 돌려준다. */
export async function addPdf(batchId: string | null, fileName: string, body: Buffer): Promise<ImportBatch> {
  if (!body.length || body.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error('PDF 파일이 아닙니다.');
  }
  const db = getDb();
  let batch = batchId ? getBatch(batchId) : undefined;
  if (batchId && !batch) throw new Error('올리기 묶음을 찾지 못했습니다.');
  if (batch && batch.status !== 'preview') throw new Error('이미 적용했거나 취소한 묶음입니다. 새로 올려 주세요.');
  if (!batch) {
    const id = randomUUID();
    db.prepare('INSERT INTO grad_import_batches (id, status, files_json, created_at) VALUES (?, ?, ?, ?)')
      .run(id, 'preview', '[]', new Date().toISOString());
    batch = getBatch(id)!;
  }
  const dir = path.join(importDir(), batch.id);
  fs.mkdirSync(dir, { recursive: true });
  const safe = path.basename(fileName).replace(/[^\p{L}\p{N}._()·\- ]/gu, '_').slice(0, 120) || 'upload.pdf';
  const stored = path.join(dir, `${String(batch.files.length + 1).padStart(2, '0')}_${safe.endsWith('.pdf') ? safe : safe + '.pdf'}`);
  fs.writeFileSync(stored, body);

  const res = await convertPdf(stored);
  const item: ImportFile = { ...res, file: safe, stored: path.relative(ROOT, stored), diff: null };
  if (!item.error && item.department) {
    item.diff = diffDepartment(item.department, item.rows);
    const dup = batch.files.find((f) => f.department === item.department && !f.error);
    if (dup) item.warnings.push(`같은 학과 PDF(${dup.file})가 이미 이 묶음에 있습니다 — 적용하면 뒤에 올린 파일이 쓰입니다.`);
  }
  const files = [...batch.files, item];
  saveFiles(batch.id, files);
  return getBatch(batch.id)!;
}

const insertSql = () =>
  `INSERT INTO graduation_criteria (${COLUMNS.join(', ')}) VALUES (${COLUMNS.map((c) => '@' + c).join(', ')})`;

function replaceDepartment(department: string, rows: CriteriaRow[]): void {
  const db = getDb();
  db.prepare('DELETE FROM graduation_criteria WHERE department = ?').run(department);
  const ins = db.prepare(insertSql());
  for (const r of rows) {
    const row: Record<string, unknown> = {};
    for (const c of COLUMNS) row[c] = (r as unknown as Record<string, unknown>)[c] ?? null;
    row.program = r.program ?? '';
    ins.run(row);
  }
}

/** 적용: 학과마다 기존 행을 보관하고 새 행으로 교체. 학생 카톡 답변은 바로 바뀐다. */
export function applyBatch(id: string): { batch: ImportBatch; departments: string[] } {
  const batch = getBatch(id);
  if (!batch) throw new Error('올리기 묶음을 찾지 못했습니다.');
  if (batch.status !== 'preview') throw new Error('미리보기 상태의 묶음만 적용할 수 있습니다.');
  // 같은 학과는 마지막 파일만
  const byDept = new Map<string, ImportFile>();
  for (const f of batch.files) if (!f.error && f.department && f.rows.length) byDept.set(f.department, f);
  if (byDept.size === 0) throw new Error('적용할 수 있는 PDF가 없습니다.');
  const db = getDb();
  const before: Record<string, GradCriteria[]> = {};
  db.transaction(() => {
    for (const [dept, f] of byDept) {
      before[dept] = listCriteriaRows(dept);
      replaceDepartment(dept, f.rows);
      if (before[dept].length === 0 && f.dept_no != null) {
        db.prepare('INSERT OR IGNORE INTO grad_departments (name, dept_no, homepage_name, status) VALUES (?, ?, ?, ?)')
          .run(dept, f.dept_no, dept, '운영');
      }
    }
    db.prepare(`UPDATE grad_import_batches SET status = 'applied', applied_at = ?, before_json = ? WHERE id = ?`)
      .run(new Date().toISOString(), JSON.stringify(before), id);
  })();
  for (const dept of byDept.keys()) writeDepartmentMarkdown(dept);
  return { batch: getBatch(id)!, departments: [...byDept.keys()] };
}

/** 되돌리기: 적용 전 값으로 복원. 같은 학과를 나중에 다시 적용했다면 막는다. */
export function revertBatch(id: string): { batch: ImportBatch; departments: string[] } {
  const db = getDb();
  const row = db.prepare('SELECT * FROM grad_import_batches WHERE id = ?').get(id) as BatchRow | undefined;
  if (!row) throw new Error('올리기 묶음을 찾지 못했습니다.');
  if (row.status !== 'applied' || !row.before_json) throw new Error('적용된 묶음만 되돌릴 수 있습니다.');
  const before = JSON.parse(row.before_json) as Record<string, CriteriaRow[]>;
  const later = (db.prepare(`SELECT * FROM grad_import_batches WHERE status = 'applied' AND applied_at > ?`)
    .all(row.applied_at) as BatchRow[]).filter((b) => Object.keys(JSON.parse(b.before_json || '{}')).some((d) => d in before));
  if (later.length) throw new Error('같은 학과를 그 뒤에 다시 적용했습니다. 최근 묶음부터 되돌려 주세요.');
  db.transaction(() => {
    for (const [dept, rows] of Object.entries(before)) replaceDepartment(dept, rows);
    db.prepare(`UPDATE grad_import_batches SET status = 'reverted', reverted_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
  })();
  for (const dept of Object.keys(before)) writeDepartmentMarkdown(dept);
  return { batch: getBatch(id)!, departments: Object.keys(before) };
}

export function discardBatch(id: string): ImportBatch {
  const batch = getBatch(id);
  if (!batch) throw new Error('올리기 묶음을 찾지 못했습니다.');
  if (batch.status !== 'preview') throw new Error('미리보기 상태의 묶음만 취소할 수 있습니다.');
  getDb().prepare(`UPDATE grad_import_batches SET status = 'discarded' WHERE id = ?`).run(id);
  fs.rmSync(path.join(importDir(), id), { recursive: true, force: true });
  return getBatch(id)!;
}

/* ── 사람이 읽는 학과별 문서 (MD) — 관리자 내려받기 · 폴더 보관 ── */

const mdDir = () => process.env.GRAD_MD_DIR || path.resolve(ROOT, 'data/kb/졸업요건/공식기준');

export function departmentMarkdown(department: string): string {
  const rows = listCriteriaRows(department);
  const v = (x: string | null | undefined) => (x == null || x === '' ? '—' : x.replace(/\|/g, '/'));
  const lines = [
    `# ${department} 졸업기준`,
    '',
    `학교 「학사제도 및 학업이수가이드」에서 추출 · ${new Date().toISOString().slice(0, 10)} 기준 · 기준 ${rows.length}개`,
    '',
    '| 학생구분 | 학번 | 당시 소속 | 졸업학점 | 단수전공 | 주전공 | 복수전공 | 사회봉사 | 외국어 | 졸업논문·시험 |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.student_type}${r.program ? ` (${r.program})` : ''} | ${v(r.year_label)} | ${v(r.affiliation)} | ${v(r.total_credits)} | ${v(r.major_single)} | ${v(r.major_primary)} | ${v(r.major_double)} | ${v(r.volunteer)} | ${v([r.lang_test, r.lang_requirement].filter((x) => x && x !== '-').join(' ') || null)} | ${v(r.thesis)} |`),
  ];
  const notes = rows.filter((r) => r.notes).map((r) => `- ${r.year_label} ${r.student_type}: ${r.notes}`);
  if (notes.length) lines.push('', '## 비고', '', ...notes);
  return lines.join('\n') + '\n';
}

export function writeDepartmentMarkdown(department: string): void {
  try {
    fs.mkdirSync(mdDir(), { recursive: true });
    fs.writeFileSync(path.join(mdDir(), `${department}.md`), departmentMarkdown(department));
  } catch (e) {
    console.error('[grad-import] markdown', e);
  }
}
