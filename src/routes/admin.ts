import express, { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import {
  createClub,
  deleteClub,
  getClubById,
  listClubs,
  updateClub,
} from '../services/clubStore';
import { reindexAll, reindexClub } from '../services/reindex';
import type { ClubInput } from '../types/club';
import type { GraduationInput } from '../types/graduation';
import {
  createGraduation,
  deleteGraduation,
  getGraduationById,
  listGraduation,
  updateGraduation,
} from '../services/graduationService';
import { reloadGraduationKb, scanGraduationKb } from '../services/kbGraduation';
import {
  countCriteria,
  findCriteria,
  formatCriteriaAnswer,
  formatCriteriaMiss,
  listCriteriaOverview,
  listCriteriaRows,
} from '../services/gradCriteria';
import type { StudentType } from '../types/gradCriteria';
import {
  addPdf,
  applyBatch,
  departmentMarkdown,
  discardBatch,
  getBatch,
  listBatches,
  revertBatch,
} from '../services/gradImport';
import { reloadRoomMaps, listBuildingCodes } from '../services/roomCode';

import { checkAdmin } from '../middleware/adminAuth';
import {
  addKeywordEntry,
  deleteKeywordEntry,
  listKeywordEntries,
  previewKeywordEntry,
  splitWords,
  updateKeywordEntry,
} from '../services/clubKeywords';
import {
  applyClubImport,
  discardClubImport,
  exportClubsXlsx,
  listClubImports,
  phoneFieldOf,
  previewClubImport,
  revertClubImport,
} from '../services/clubImport';
import { runKbCheck } from '../services/kbCheck';

export const adminRouter = Router();

function bodyToInput(body: Record<string, unknown>): ClubInput | null {
  const name = String(body.name ?? '').trim();
  const category = String(body.category ?? '').trim();
  const intro = String(body.intro ?? '').trim();
  const activities = String(body.activities ?? '').trim();
  const source_url = String(body.source_url ?? '').trim();
  if (!name || !category || !intro || !activities || !source_url) return null;
  return {
    name,
    category,
    contact: body.contact == null ? null : String(body.contact),
    meeting_time: body.meeting_time == null ? null : String(body.meeting_time),
    location: body.location == null ? null : String(body.location),
    intro,
    summary: body.summary == null ? null : String(body.summary),
    activities,
    source_url,
  };
}

function bodyToGrad(body: Record<string, unknown>): GraduationInput | null {
  const admission_year = Number(body.admission_year);
  const department = String(body.department ?? '').trim();
  if (!Number.isFinite(admission_year) || !department) return null;
  const numOrNull = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  return {
    admission_year,
    department,
    major_type:
      body.major_type == null || body.major_type === ''
        ? '전공'
        : String(body.major_type),
    total_credits: numOrNull(body.total_credits),
    major_credits: numOrNull(body.major_credits),
    general_credits: numOrNull(body.general_credits),
    thesis_required:
      body.thesis_required == null || body.thesis_required === ''
        ? null
        : body.thesis_required === true ||
          body.thesis_required === 1 ||
          body.thesis_required === '1' ||
          body.thesis_required === 'true',
    english_requirement:
      body.english_requirement == null ? null : String(body.english_requirement),
    license_requirement:
      body.license_requirement == null ? null : String(body.license_requirement),
    track: body.track == null ? null : String(body.track),
    notes: body.notes == null ? null : String(body.notes),
    source_url: body.source_url == null ? null : String(body.source_url),
    verified_at: body.verified_at == null ? null : String(body.verified_at),
  };
}

adminRouter.get('/clubs', (req, res) => {
  if (!checkAdmin(req, res)) return;
  res.json({ count: listClubs().length, clubs: listClubs() });
});

/* ── 동아리 엑셀 내려받기 · 올리기 (미리보기 → 적용 → 되돌리기) — '/clubs/:id' 보다 먼저 ── */
adminRouter.get('/clubs.xlsx', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const buf = await exportClubsXlsx();
    const name = encodeURIComponent(`동아리_${new Date().toISOString().slice(0, 10)}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${name}`);
    res.send(buf);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

adminRouter.post(
  '/clubs/import',
  express.raw({ type: () => true, limit: '10mb' }),
  async (req, res) => {
    if (!checkAdmin(req, res)) return;
    const name = decodeURIComponent(String(req.headers['x-file-name'] || 'clubs.xlsx'));
    try {
      res.status(201).json(await previewClubImport(name, req.body as Buffer));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

adminRouter.get('/clubs/import', (req, res) => {
  if (!checkAdmin(req, res)) return;
  res.json({ batches: listClubImports() });
});

adminRouter.post('/clubs/import/:id/:action', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const { id, action } = req.params;
    if (action === 'apply') res.json(await applyClubImport(id));
    else if (action === 'revert') res.json({ batch: await revertClubImport(id) });
    else if (action === 'discard') res.json({ batch: discardClubImport(id) });
    else res.status(404).json({ error: 'unknown action' });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

/* ── 동아리 검색 키워드 사전 (학생 표현 -> 동아리 분야) — '/clubs/:id' 보다 먼저 ── */
adminRouter.get('/clubs/keywords', (req, res) => {
  if (!checkAdmin(req, res)) return;
  res.json({ entries: listKeywordEntries(listClubs()) });
});

adminRouter.post('/clubs/keywords/preview', (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    res.json({ clubs: previewKeywordEntry(splitWords(req.body?.words), splitWords(req.body?.field), listClubs()) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

adminRouter.post('/clubs/keywords', (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    const index = addKeywordEntry(splitWords(req.body?.words), splitWords(req.body?.field));
    res.status(201).json({ index, entries: listKeywordEntries(listClubs()) });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

adminRouter.put('/clubs/keywords/:index', (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    updateKeywordEntry(Number(req.params.index), String(req.body?.q || ''), splitWords(req.body?.words), splitWords(req.body?.field));
    res.json({ entries: listKeywordEntries(listClubs()) });
  } catch (e) {
    res.status(409).json({ error: (e as Error).message });
  }
});

adminRouter.delete('/clubs/keywords/:index', (req, res) => {
  if (!checkAdmin(req, res)) return;
  try {
    deleteKeywordEntry(Number(req.params.index), String(req.query.q || ''));
    res.json({ entries: listKeywordEntries(listClubs()) });
  } catch (e) {
    res.status(409).json({ error: (e as Error).message });
  }
});

adminRouter.get('/clubs/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const club = getClubById(req.params.id);
  if (!club) {
    res.status(404).json({ error: 'club not found' });
    return;
  }
  res.json(club);
});

function eunNeun(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '은' : '는';
}

/** 같은 이름(띄어쓰기 · 대소문자 무시)의 다른 동아리 — 관리자가 고칠 동아리를 새로 추가해 두 개가 생기는 것을 막는다 */
function sameNameClub(name: unknown, exceptId?: string): string | null {
  const key = String(name ?? '').replace(/\s+/g, '').toLowerCase();
  if (!key) return null;
  const hit = listClubs().find((c) => c.name.replace(/\s+/g, '').toLowerCase() === key && c.id !== exceptId);
  return hit ? hit.name : null;
}

adminRouter.post('/clubs', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const input = bodyToInput(req.body || {});
  if (!input) {
    res.status(400).json({
      error: 'name, category, intro, activities, source_url are required',
    });
    return;
  }
  const phone = phoneFieldOf(input as unknown as Record<string, unknown>);
  if (phone) {
    res.status(400).json({ error: `개인 휴대폰 번호는 넣지 않습니다 (${phone}) — 동아리 인스타그램 · 신청 폼으로 바꿔 주세요` });
    return;
  }
  const dup = sameNameClub(input.name);
  if (dup) {
    res.status(409).json({ error: `「${dup}」${eunNeun(dup)} 이미 등록된 동아리입니다. 목록에서 「수정」을 눌러 고쳐 주세요.` });
    return;
  }
  const club = createClub(input);
  const reindex = await reindexClub(club.id);
  res.status(201).json({ club, reindex });
});

adminRouter.put('/clubs/:id', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const existing = getClubById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'club not found' });
    return;
  }
  const body = req.body || {};
  const dup = body.name !== undefined ? sameNameClub(body.name, req.params.id) : null;
  if (dup) {
    res.status(409).json({ error: `「${dup}」라는 다른 동아리가 이미 있어 이 이름으로 바꿀 수 없습니다.` });
    return;
  }
  const phone = phoneFieldOf(body);
  if (phone) {
    res.status(400).json({ error: `개인 휴대폰 번호는 넣지 않습니다 (${phone}) — 동아리 인스타그램 · 신청 폼으로 바꿔 주세요` });
    return;
  }
  const club = updateClub(req.params.id, {
    name: body.name,
    category: body.category,
    contact: body.contact,
    meeting_time: body.meeting_time,
    location: body.location,
    intro: body.intro,
    summary: body.summary,
    activities: body.activities,
    source_url: body.source_url,
  });
  const reindex = await reindexClub(req.params.id);
  res.json({ club, reindex });
});

adminRouter.delete('/clubs/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const ok = deleteClub(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'club not found' });
    return;
  }
  res.json({ deleted: true, id: req.params.id });
});

adminRouter.post('/reindex', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const clubId = req.body?.club_id ? String(req.body.club_id) : null;
  try {
    const result = clubId ? await reindexClub(clubId) : await reindexAll();
    res.json(result);
  } catch (err) {
    console.error('[reindex]', err);
    res.status(500).json({
      error: 'reindex failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

/* ── Graduation requirements CRUD ── */

adminRouter.get('/graduation', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const rows = listGraduation();
  // criteria: 가이드에서 적재한 공식 기준 규모 (대시보드 표시용)
  res.json({ count: rows.length, requirements: rows, criteria: countCriteria() });
});

/* 공식 졸업기준 (학교 가이드에서 적재) — 조회 전용. 바꾸는 방법은 PDF 올리기(예정) */
adminRouter.get('/graduation/criteria', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const departments = listCriteriaOverview();
  res.json({ count: departments.length, rows: departments.reduce((a, d) => a + d.rows, 0), departments });
});

/* 공식 기준 내려받기 — 엑셀(전체) · 학과별 문서(MD) */
adminRouter.get('/graduation/criteria.xlsx', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const rows = listCriteriaOverview().flatMap((d) => listCriteriaRows(d.name));
  const py = process.env.GRAD_PYTHON || path.resolve(process.cwd(), 'tools/grad-extract/.venv/bin/python');
  const child = spawn(py, [path.resolve(process.cwd(), 'tools/grad-extract/criteria_to_xlsx.py')]);
  const chunks: Buffer[] = [];
  child.stdout.on('data', (c: Buffer) => chunks.push(c));
  child.on('error', () => res.status(500).json({ error: '엑셀 변환 도구(파이썬 환경)가 없습니다.' }));
  child.on('close', (code) => {
    if (res.headersSent) return;
    if (code !== 0) {
      res.status(500).json({ error: '엑셀을 만들지 못했습니다.' });
      return;
    }
    const name = encodeURIComponent(`공식졸업기준_${new Date().toISOString().slice(0, 10)}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${name}`);
    res.send(Buffer.concat(chunks));
  });
  child.stdin.end(JSON.stringify({ rows }));
});

adminRouter.get('/graduation/criteria/:department/md', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const dept = req.params.department;
  if (listCriteriaRows(dept).length === 0) {
    res.status(404).json({ error: 'department not found' });
    return;
  }
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(dept + '_졸업기준.md')}`);
  res.send(departmentMarkdown(dept));
});

/* 공식 PDF 올리기 → 미리보기 → 적용 / 되돌리기 */
adminRouter.post(
  '/graduation/import',
  express.raw({ type: 'application/pdf', limit: '30mb' }),
  async (req, res) => {
    if (!checkAdmin(req, res)) return;
    const name = decodeURIComponent(String(req.header('x-file-name') || 'upload.pdf'));
    const batchId = req.query.batch ? String(req.query.batch) : null;
    try {
      const batch = await addPdf(batchId, name, Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0));
      res.status(201).json(batch);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  }
);

adminRouter.get('/graduation/import', (req, res) => {
  if (!checkAdmin(req, res)) return;
  res.json({ batches: listBatches() });
});

adminRouter.get('/graduation/import/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const b = getBatch(req.params.id);
  if (!b) {
    res.status(404).json({ error: 'batch not found' });
    return;
  }
  res.json(b);
});

for (const [action, fn] of [['apply', applyBatch], ['revert', revertBatch], ['discard', discardBatch]] as const) {
  adminRouter.post(`/graduation/import/:id/${action}`, (req, res) => {
    if (!checkAdmin(req, res)) return;
    try {
      res.json((fn as (id: string) => unknown)(req.params.id));
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
}

adminRouter.get('/graduation/criteria/:department', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const department = req.params.department;
  const rows = listCriteriaRows(department);
  if (rows.length === 0) {
    res.status(404).json({ error: 'department not found' });
    return;
  }
  // 카톡 미리보기: ?year=2021&type=신입생-내국인
  const year = Number(req.query.year);
  const type = (String(req.query.type || '') || '신입생-내국인') as StudentType;
  let preview: string | null = null;
  if (Number.isFinite(year) && year > 0) {
    const hit = findCriteria(year, department, type);
    preview = hit.length ? formatCriteriaAnswer(year, department, hit, type) : formatCriteriaMiss(year, department, type);
  }
  res.json({ department, rows, preview });
});

adminRouter.get('/graduation/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const row = getGraduationById(req.params.id);
  if (!row) {
    res.status(404).json({ error: 'graduation requirement not found' });
    return;
  }
  res.json(row);
});

adminRouter.post('/graduation', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const input = bodyToGrad(req.body || {});
  if (!input) {
    res.status(400).json({
      error: 'admission_year and department are required',
    });
    return;
  }
  try {
    const row = createGraduation(input);
    res.status(201).json({ requirement: row });
  } catch (err) {
    res.status(409).json({
      error: 'create failed (duplicate year+department+major_type?)',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});

adminRouter.put('/graduation/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const existing = getGraduationById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'graduation requirement not found' });
    return;
  }
  const body = req.body || {};
  const row = updateGraduation(req.params.id, {
    admission_year: body.admission_year,
    department: body.department,
    major_type: body.major_type,
    total_credits: body.total_credits,
    major_credits: body.major_credits,
    general_credits: body.general_credits,
    thesis_required: body.thesis_required,
    english_requirement: body.english_requirement,
    license_requirement: body.license_requirement,
    track: body.track,
    notes: body.notes,
    source_url: body.source_url,
    verified_at: body.verified_at,
  });
  res.json({ requirement: row });
});

adminRouter.delete('/graduation/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const ok = deleteGraduation(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'graduation requirement not found' });
    return;
  }
  res.json({ deleted: true, id: req.params.id });
});

/* ── Folder KB scan ── */

/** 데이터 점검: 폴더 · DB 를 다시 읽고 빠진 데이터를 한국어로 알려 준다 (FR-11) */
adminRouter.get('/kb/scan', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const result = runKbCheck();
  const buildings = listBuildingCodes();
  res.json({
    ok: true,
    ...result,
    warningCount: result.sections.reduce((a, s) => a + s.warnings.length, 0),
    map: { buildingCount: buildings.length },
  });
});

adminRouter.get('/kb/status', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const grad = scanGraduationKb();
  res.json({
    scannedAt: grad.scannedAt,
    entryCount: grad.entries.length,
    departments: grad.departments,
    years: grad.years,
  });
});
