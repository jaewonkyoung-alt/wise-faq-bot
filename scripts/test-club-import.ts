/**
 * 동아리 엑셀 내려받기 · 올리기 테스트 (8주차).
 * 내려받은 엑셀을 관리자가 고친 것처럼 openpyxl 로 바꿔 올리고, 미리보기 → 적용 → 되돌리기를 확인한다.
 *
 *   npm run test:club-import      (tools/grad-extract/.venv 필요 — 없으면 SKIP)
 */
import dotenv from 'dotenv';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
dotenv.config();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wise-test-club-import-'));
process.env.DATABASE_PATH = path.join(TMP, 'test.db');
process.env.LLM_PROVIDER = 'mock';
process.env.EMBED_PROVIDER = 'mock';
const TOKEN = 'test-admin-token';
process.env.ADMIN_TOKEN = TOKEN;

import type { Server } from 'http';
import { createApp } from '../src/app';
import { getDb } from '../src/db/database';
import { findClubsByName, listClubs } from '../src/services/clubStore';
import { upsertClubByName } from '../src/services/clubStore';
import { reindexAll } from '../src/services/reindex';
import { ask } from '../src/services/askService';
import type { ClubInput } from '../src/types/club';

const PY = process.env.GRAD_PYTHON || path.resolve('tools/grad-extract/.venv/bin/python');

let passed = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (!cond) {
    console.error(`FAIL  ${name}`, extra ?? '');
    throw new Error(`test failed: ${name}`);
  }
  passed += 1;
  console.log(`PASS  ${name}`);
}

/** 관리자가 엑셀에서 고친 것처럼: 셀 바꾸기 · 줄 추가 · 줄 삭제 */
function editXlsx(src: string, dst: string, ops: unknown): void {
  const code = `
import json, sys
from openpyxl import load_workbook
wb = load_workbook(sys.argv[1]); ws = wb['동아리']
head = [str(c.value or '').replace('*','').replace(' ','') for c in ws[1]]
col = lambda h: head.index(h.replace(' ','')) + 1
ops = json.loads(sys.argv[3])
for op in ops:
    if op['op'] == 'set':
        for r in range(2, ws.max_row + 1):
            if ws.cell(r, col('이름')).value == op['name']:
                ws.cell(r, col(op['col'])).value = op['value']
    elif op['op'] == 'add':
        ws.append([op.get(h, '') for h in ['이름','분과','한두줄소개','정기모임','동아리방','연락처','소개','활동','출처URL']])
    elif op['op'] == 'del':
        for r in range(ws.max_row, 1, -1):
            if ws.cell(r, col('이름')).value == op['name']:
                ws.delete_rows(r)
wb.save(sys.argv[2])
`;
  execFileSync(PY, ['-c', code, src, dst, JSON.stringify(ops)]);
}

async function main(): Promise<void> {
  if (!fs.existsSync(PY)) {
    console.log(`SKIP test-club-import — 파이썬 환경 없음 (${PY})`);
    return;
  }
  getDb();
  for (const c of JSON.parse(fs.readFileSync(path.resolve('data/seed/clubs.json'), 'utf-8')) as ClubInput[]) upsertClubByName(c);
  await reindexAll();
  const n0 = listClubs().length;

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  const call = async (p: string, method = 'GET') => {
    const r = await fetch(base + p, { method, headers: { 'x-admin-token': TOKEN } });
    return { status: r.status, data: (await r.json()) as Record<string, any> };
  };
  const upload = async (file: string) => {
    const r = await fetch(`${base}/api/admin/clubs/import`, {
      method: 'POST',
      headers: { 'x-admin-token': TOKEN, 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'x-file-name': encodeURIComponent(path.basename(file)) },
      body: fs.readFileSync(file),
    });
    return { status: r.status, data: (await r.json()) as Record<string, any> };
  };

  try {
    /* 1. 내려받기 */
    const dl = await fetch(`${base}/api/admin/clubs.xlsx`, { headers: { 'x-admin-token': TOKEN } });
    const xlsx = Buffer.from(await dl.arrayBuffer());
    const orig = path.join(TMP, 'orig.xlsx');
    fs.writeFileSync(orig, xlsx);
    check('엑셀 내려받기 (xlsx · 파일명 동아리_날짜)', dl.status === 200 && xlsx.subarray(0, 2).toString() === 'PK' && /%EB%8F%99%EC%95%84%EB%A6%AC_/.test(dl.headers.get('content-disposition') || ''));

    /* 2. 그대로 올리면 바뀌는 값 없음 */
    const same = await upload(orig);
    check(`그대로 올리면 바뀌는 값 없음 (${n0}곳 동일)`, same.status === 201 && same.data.diff.same === n0 && !same.data.diff.changed.length && !same.data.diff.added.length, same.data.diff);
    check('바뀌는 값이 없으면 적용 거부', (await call(`/api/admin/clubs/import/${same.data.id}/apply`, 'POST')).status === 400);

    /* 3. 고쳐서 올리기 */
    const edited = path.join(TMP, 'edited.xlsx');
    editXlsx(orig, edited, [
      { op: 'set', name: '돌핀스', col: '정기 모임', value: '매주 화·목 19시 (교내 체육관)' },
      { op: 'add', 이름: '바둑부', 분과: '취미', 한두줄소개: '바둑 동아리입니다. 초보도 함께 수담을 나눕니다.', 소개: '동아리 · 바둑', 활동: '정기 대국, 기력 향상 강의', 출처URL: 'https://example.com/baduk' },
      { op: 'add', 이름: '전화동아리', 분과: '취미', 소개: '동아리', 활동: '활동', 연락처: '회장 010-1234-5678', 출처URL: 'https://example.com/x' },
      { op: 'add', 이름: '빈칸동아리', 분과: '취미', 출처URL: 'https://example.com/y' },
      { op: 'del', name: 'CCC' },
    ]);
    const pv = await upload(edited);
    const d = pv.data.diff;
    check('미리보기: 바뀐 칸만 (돌핀스 정기 모임 빈칸 -> 새 값)',
      d.changed.length === 1 && d.changed[0].name === '돌핀스' && d.changed[0].fields.length === 1 && d.changed[0].fields[0].label === '정기 모임', d.changed);
    check('미리보기: 새 동아리 1곳 (바둑부)', d.added.length === 1 && d.added[0].name === '바둑부', d.added);
    check('휴대폰 번호가 있는 줄은 거부', d.errors.some((e: any) => e.name === '전화동아리' && /휴대폰/.test(e.message)), d.errors);
    check('필수 칸이 빈 줄은 거부 (빈칸 안내)', d.errors.some((e: any) => e.name === '빈칸동아리' && /빈칸: 소개, 활동/.test(e.message)), d.errors);
    check('엑셀에서 지운 동아리는 "파일에 없음"으로만 표시 (삭제 안 함)', d.missing.includes('CCC'), d.missing);
    check('미리보기 단계에서는 DB 그대로', !findClubsByName('바둑부').length && !findClubsByName('돌핀스')[0].meeting_time);

    /* 4. 적용 */
    const ap = await call(`/api/admin/clubs/import/${pv.data.id}/apply`, 'POST');
    check('적용: 추가 1 · 변경 1', ap.status === 200 && ap.data.added === 1 && ap.data.changed === 1, ap.data);
    check('적용 후 DB 반영 · CCC 는 남아 있음',
      findClubsByName('돌핀스')[0].meeting_time === '매주 화·목 19시 (교내 체육관)' && findClubsByName('바둑부').length === 1 && findClubsByName('CCC').length === 1 && listClubs().length === n0 + 1);
    const emb = getDb().prepare('SELECT COUNT(*) AS n FROM embeddings e JOIN clubs c ON c.id = e.club_id WHERE c.name = ?').get('바둑부') as { n: number };
    check('새 동아리도 바로 임베딩', emb.n === 3, emb);
    const a1 = await ask('바둑부 언제 모여?');
    check('카톡 답변에 바로 나옴 (바둑부)', a1.answer.startsWith('【바둑부】'), a1.answer.slice(0, 60));
    check('같은 묶음 두 번 적용 불가', (await call(`/api/admin/clubs/import/${pv.data.id}/apply`, 'POST')).status === 400);

    /* 5. 되돌리기 순서 · 되돌리기 */
    const e2 = path.join(TMP, 'e2.xlsx');
    editXlsx(orig, e2, [{ op: 'set', name: '마린', col: '동아리방', value: '학생회관 3층' }]);
    const pv2 = await upload(e2);
    await call(`/api/admin/clubs/import/${pv2.data.id}/apply`, 'POST');
    const early = await call(`/api/admin/clubs/import/${pv.data.id}/revert`, 'POST');
    check('나중에 적용한 묶음이 있으면 앞 묶음 되돌리기 막음', early.status === 400 && /최근 묶음부터/.test(early.data.error), early.data);
    await call(`/api/admin/clubs/import/${pv2.data.id}/revert`, 'POST');
    const rv = await call(`/api/admin/clubs/import/${pv.data.id}/revert`, 'POST');
    check('되돌리기: 바꾼 값 복원 · 추가한 동아리 삭제',
      rv.status === 200 && !findClubsByName('돌핀스')[0].meeting_time && !findClubsByName('바둑부').length && !findClubsByName('마린')[0].location && listClubs().length === n0, rv.data);

    /* 6. 기타 */
    const disc = await call(`/api/admin/clubs/import/${same.data.id}/discard`, 'POST');
    check('미리보기 취소', disc.data.batch?.status === 'discarded', disc.data);
    const hist = await call('/api/admin/clubs/import');
    check('올리기 기록', (hist.data.batches as unknown[]).length === 3, hist.data.batches?.length);
    const notX = await fetch(`${base}/api/admin/clubs/import`, { method: 'POST', headers: { 'x-admin-token': TOKEN, 'Content-Type': 'text/plain' }, body: 'hello' });
    check('엑셀이 아닌 파일 거부', notX.status === 400 && /엑셀/.test(((await notX.json()) as { error: string }).error));
    check('토큰 없이 내려받기 401', (await fetch(`${base}/api/admin/clubs.xlsx`)).status === 401);
  } finally {
    server.close();
  }
  console.log(`\nPASS test-club-import (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
