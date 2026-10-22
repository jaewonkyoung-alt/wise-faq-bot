import { spawn } from 'child_process';
import { randomUUID } from 'crypto';
import path from 'path';
import { getDb } from '../db/database';
import { createClub, deleteClub, getClubById, listClubs, updateClub } from './clubStore';
import { reindexClub } from './reindex';
import type { Club, ClubInput } from '../types/club';

/**
 * 동아리 엑셀 내려받기 · 올리기 (8주차).
 * 관리자가 엑셀에서 여러 동아리를 한꺼번에 고쳐 올리면, 바뀌는 칸만 미리 보여 주고 「적용」해야 반영한다.
 * 졸업요건 PDF 올리기와 같은 흐름: 미리보기 → 적용 → (필요하면) 되돌리기.
 */
const ROOT = path.resolve(__dirname, '..', '..');
const PYTHON = () => process.env.GRAD_PYTHON || path.resolve(ROOT, 'tools/grad-extract/.venv/bin/python');
const SCRIPT = path.resolve(ROOT, 'tools/club-excel/club_xlsx.py');

export const CLUB_FIELDS = ['name', 'category', 'summary', 'meeting_time', 'location', 'contact', 'intro', 'activities', 'source_url'] as const;
type Field = (typeof CLUB_FIELDS)[number];
export const CLUB_FIELD_LABELS: Record<Field, string> = {
  name: '이름', category: '분과', summary: '한두 줄 소개', meeting_time: '정기 모임', location: '동아리방',
  contact: '연락처', intro: '소개', activities: '활동', source_url: '출처 URL',
};
const REQUIRED: Field[] = ['name', 'category', 'intro', 'activities', 'source_url'];
const PHONE = /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/;

type Row = Partial<Record<Field, string>> & { row: number };

export interface ClubImportDiff {
  added: Array<{ row: number; name: string }>;
  changed: Array<{ row: number; name: string; fields: Array<{ field: Field; label: string; before: string; after: string }> }>;
  same: number;
  missing: string[];
  errors: Array<{ row: number; name: string; message: string }>;
  warnings: Array<{ row: number; name: string; message: string }>;
}

export interface ClubImportBatch {
  id: string;
  status: 'preview' | 'applied' | 'reverted' | 'discarded';
  file: string;
  diff: ClubImportDiff;
  created_at: string;
  applied_at: string | null;
  reverted_at: string | null;
}

function run(mode: 'export' | 'read', input: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON(), [SCRIPT, mode]);
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (c: Buffer) => out.push(c));
    child.stderr.on('data', (c: Buffer) => err.push(c));
    child.on('error', () => reject(new Error('서버에 엑셀 도구(파이썬 환경)가 없습니다 — 설치 안내(README)를 확인하세요.')));
    child.on('close', (code) => {
      if (code !== 0) reject(new Error(`엑셀 처리에 실패했습니다: ${Buffer.concat(err).toString().split('\n').filter(Boolean).pop() || code}`));
      else resolve(Buffer.concat(out));
    });
    child.stdin.end(input);
  });
}

export async function exportClubsXlsx(): Promise<Buffer> {
  const clubs = listClubs().sort((a, b) => a.category.localeCompare(b.category, 'ko') || a.name.localeCompare(b.name, 'ko'));
  return run('export', Buffer.from(JSON.stringify({ clubs })));
}

const val = (v: unknown) => (v == null ? '' : String(v).trim());

/** 엑셀 줄 → 바뀌는 칸 (이름으로 기존 동아리를 찾는다) */
export function diffClubRows(rows: Row[]): { diff: ClubImportDiff; valid: Row[] } {
  const byName = new Map(listClubs().map((c) => [c.name.trim().toLowerCase(), c]));
  const diff: ClubImportDiff = { added: [], changed: [], same: 0, missing: [], errors: [], warnings: [] };
  const valid: Row[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const name = val(r.name);
    const key = name.toLowerCase();
    const missingReq = REQUIRED.filter((f) => !val(r[f]));
    if (missingReq.length) {
      diff.errors.push({ row: r.row, name: name || '(이름 없음)', message: `빈칸: ${missingReq.map((f) => CLUB_FIELD_LABELS[f]).join(', ')}` });
      continue;
    }
    if (seen.has(key)) {
      diff.errors.push({ row: r.row, name, message: '같은 이름이 파일에 두 번 있습니다' });
      continue;
    }
    seen.add(key);
    if (!/^https?:\/\/\S+$/i.test(val(r.source_url))) {
      diff.errors.push({ row: r.row, name, message: '출처 URL은 http:// 또는 https:// 로 시작해야 합니다' });
      continue;
    }
    const phoneField = CLUB_FIELDS.find((f) => PHONE.test(val(r[f])));
    if (phoneField) {
      diff.errors.push({ row: r.row, name, message: `개인 휴대폰 번호로 보이는 값이 있습니다 (${CLUB_FIELD_LABELS[phoneField]}) — 동아리 인스타그램 · 신청 폼으로 바꿔 주세요` });
      continue;
    }
    if (val(r.summary).length > 90) diff.warnings.push({ row: r.row, name, message: `한두 줄 소개가 ${val(r.summary).length}자입니다 (90자 넘으면 목록에서 길어 보임)` });
    const cur = byName.get(key);
    if (!cur) {
      diff.added.push({ row: r.row, name });
    } else {
      const fields = CLUB_FIELDS.filter((f) => r[f] !== undefined && val(r[f]) !== val(cur[f as keyof Club]))
        .map((f) => ({ field: f, label: CLUB_FIELD_LABELS[f], before: val(cur[f as keyof Club]), after: val(r[f]) }));
      if (fields.length) diff.changed.push({ row: r.row, name: cur.name, fields });
      else diff.same += 1;
    }
    valid.push(r);
  }
  diff.missing = listClubs().filter((c) => !seen.has(c.name.trim().toLowerCase())).map((c) => c.name);
  return { diff, valid };
}

interface BatchRow {
  id: string;
  status: ClubImportBatch['status'];
  file: string;
  rows_json: string;
  diff_json: string;
  before_json: string | null;
  created_at: string;
  applied_at: string | null;
  reverted_at: string | null;
}

const toBatch = (r: BatchRow): ClubImportBatch => ({
  id: r.id, status: r.status, file: r.file, diff: JSON.parse(r.diff_json),
  created_at: r.created_at, applied_at: r.applied_at, reverted_at: r.reverted_at,
});

export function getClubImport(id: string): ClubImportBatch | undefined {
  const r = getDb().prepare('SELECT * FROM club_import_batches WHERE id = ?').get(id) as BatchRow | undefined;
  return r ? toBatch(r) : undefined;
}

export function listClubImports(limit = 20): ClubImportBatch[] {
  return (getDb().prepare('SELECT * FROM club_import_batches ORDER BY created_at DESC LIMIT ?').all(limit) as BatchRow[]).map(toBatch);
}

/** 엑셀 파일을 읽어 미리보기 묶음을 만든다 (DB는 아직 그대로) */
export async function previewClubImport(fileName: string, body: Buffer): Promise<ClubImportBatch> {
  if (body.length < 4 || body.subarray(0, 2).toString() !== 'PK') throw new Error('엑셀(.xlsx) 파일이 아닙니다.');
  const parsed = JSON.parse((await run('read', body)).toString()) as { rows: Row[]; error: string | null };
  if (parsed.error) throw new Error(parsed.error);
  if (!parsed.rows.length) throw new Error('동아리 줄이 하나도 없습니다.');
  const { diff, valid } = diffClubRows(parsed.rows);
  const batch: BatchRow = {
    id: randomUUID(), status: 'preview', file: fileName || 'clubs.xlsx',
    rows_json: JSON.stringify(valid), diff_json: JSON.stringify(diff), before_json: null,
    created_at: new Date().toISOString(), applied_at: null, reverted_at: null,
  };
  getDb()
    .prepare(`INSERT INTO club_import_batches (id, status, file, rows_json, diff_json, before_json, created_at)
              VALUES (@id, @status, @file, @rows_json, @diff_json, @before_json, @created_at)`)
    .run(batch);
  return toBatch(batch);
}

const toInput = (r: Row): ClubInput => ({
  name: val(r.name), category: val(r.category), summary: val(r.summary), meeting_time: val(r.meeting_time) || null,
  location: val(r.location) || null, contact: val(r.contact) || null, intro: val(r.intro), activities: val(r.activities),
  source_url: val(r.source_url),
});

/** 적용: 추가 · 변경한 동아리만 저장하고 다시 임베딩. 되돌리기용으로 바꾸기 전 값을 남긴다. */
export async function applyClubImport(id: string): Promise<{ batch: ClubImportBatch; added: number; changed: number }> {
  const row = getDb().prepare('SELECT * FROM club_import_batches WHERE id = ?').get(id) as BatchRow | undefined;
  if (!row) throw new Error('올리기 묶음을 찾지 못했습니다.');
  if (row.status !== 'preview') throw new Error('미리보기 상태의 묶음만 적용할 수 있습니다.');
  const diff = JSON.parse(row.diff_json) as ClubImportDiff;
  if (!diff.added.length && !diff.changed.length) throw new Error('바뀌는 값이 없습니다.');
  const rows = JSON.parse(row.rows_json) as Row[];
  // 미리보기 뒤에 웹에서 다시 고쳤을 수 있으니 적용 직전 값으로 다시 비교한다
  const { diff: now } = diffClubRows(rows);
  const byName = new Map(listClubs().map((c) => [c.name.trim().toLowerCase(), c]));
  const before: { changed: Club[]; addedIds: string[] } = { changed: [], addedIds: [] };
  const touched: string[] = [];
  const db = getDb();
  db.transaction(() => {
    for (const r of rows) {
      const key = val(r.name).toLowerCase();
      const cur = byName.get(key);
      if (!cur) {
        const c = createClub(toInput(r));
        before.addedIds.push(c.id);
        touched.push(c.id);
      } else if (now.changed.some((x) => x.name.toLowerCase() === key)) {
        before.changed.push(cur);
        updateClub(cur.id, toInput(r));
        touched.push(cur.id);
      }
    }
    db.prepare(`UPDATE club_import_batches SET status = 'applied', applied_at = ?, before_json = ?, diff_json = ? WHERE id = ?`)
      .run(new Date().toISOString(), JSON.stringify(before), JSON.stringify(now), id);
  })();
  for (const cid of touched) {
    try {
      await reindexClub(cid);
    } catch {
      /* 임베딩 서버가 꺼져 있어도 저장은 유지 — 다음 시작 때 다시 임베딩 */
    }
  }
  return { batch: getClubImport(id)!, added: before.addedIds.length, changed: before.changed.length };
}

/** 되돌리기: 바꾼 동아리는 전 값으로, 추가한 동아리는 삭제. 나중에 적용한 묶음이 있으면 그것부터. */
export async function revertClubImport(id: string): Promise<ClubImportBatch> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM club_import_batches WHERE id = ?').get(id) as BatchRow | undefined;
  if (!row) throw new Error('올리기 묶음을 찾지 못했습니다.');
  if (row.status !== 'applied') throw new Error('적용된 묶음만 되돌릴 수 있습니다.');
  const later = db.prepare(`SELECT COUNT(*) AS n FROM club_import_batches WHERE status = 'applied' AND applied_at > ?`).get(row.applied_at) as { n: number };
  if (later.n > 0) throw new Error('나중에 적용한 엑셀이 있습니다. 최근 묶음부터 되돌려 주세요.');
  const before = JSON.parse(row.before_json || '{"changed":[],"addedIds":[]}') as { changed: Club[]; addedIds: string[] };
  db.transaction(() => {
    for (const c of before.changed) {
      updateClub(c.id, { name: c.name, category: c.category, summary: c.summary, meeting_time: c.meeting_time, location: c.location,
        contact: c.contact, intro: c.intro, activities: c.activities, source_url: c.source_url });
    }
    for (const cid of before.addedIds) deleteClub(cid);
    db.prepare(`UPDATE club_import_batches SET status = 'reverted', reverted_at = ? WHERE id = ?`).run(new Date().toISOString(), id);
  })();
  for (const c of before.changed) {
    try {
      if (getClubById(c.id)) await reindexClub(c.id);
    } catch {
      /* 다음 시작 때 다시 임베딩 */
    }
  }
  return getClubImport(id)!;
}

export function discardClubImport(id: string): ClubImportBatch {
  const b = getClubImport(id);
  if (!b) throw new Error('올리기 묶음을 찾지 못했습니다.');
  if (b.status !== 'preview') throw new Error('미리보기 상태의 묶음만 취소할 수 있습니다.');
  getDb().prepare(`UPDATE club_import_batches SET status = 'discarded' WHERE id = ?`).run(id);
  return getClubImport(id)!;
}
