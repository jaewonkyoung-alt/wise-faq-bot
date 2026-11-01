/**
 * 데이터 점검 (FR-11) · 관리자 입력 규칙 테스트.
 * 실제 데이터(졸업 기준 · 동아리 시드 · 지도 JSON)를 읽어 점검하고, 일부러 빠뜨린 데이터를 경고하는지 본다.
 *
 *   npm run test:kb-check
 */
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
dotenv.config();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wise-test-kb-check-'));
process.env.DATABASE_PATH = path.join(TMP, 'test.db');
process.env.CLUB_KEYWORDS_FILE = path.join(TMP, '_keywords.json');
process.env.GRAD_MD_DIR = path.join(TMP, 'md');
fs.copyFileSync(path.resolve('data/kb/동아리/_keywords.json'), process.env.CLUB_KEYWORDS_FILE);
process.env.LLM_PROVIDER = 'mock';
process.env.EMBED_PROVIDER = 'mock';
const TOKEN = 'test-admin-token';
process.env.ADMIN_TOKEN = TOKEN;

import type { Server } from 'http';
import { createApp } from '../src/app';
import { getDb } from '../src/db/database';
import { createClub, upsertClubByName } from '../src/services/clubStore';
import { reindexAll } from '../src/services/reindex';
import { addKeywordEntry } from '../src/services/clubKeywords';
import { importGradCriteria } from '../src/services/gradCriteria';
import { runKbCheck } from '../src/services/kbCheck';
import type { ClubInput } from '../src/types/club';

let passed = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (!cond) {
    console.error(`FAIL  ${name}`, extra ?? '');
    throw new Error(`test failed: ${name}`);
  }
  passed += 1;
  console.log(`PASS  ${name}`);
}

async function main(): Promise<void> {
  getDb();
  importGradCriteria(true);
  for (const c of JSON.parse(fs.readFileSync(path.resolve('data/seed/clubs.json'), 'utf-8')) as ClubInput[]) upsertClubByName(c);
  await reindexAll();

  /* 1. 실제 데이터 그대로 */
  const r0 = runKbCheck();
  const sec = (k: string) => r0.sections.find((s) => s.key === k)!;
  check('졸업요건: 공식 기준 42개 학과 · 523행', sec('graduation').facts[0] === '공식 기준 42개 학과 · 523행', sec('graduation').facts);
  check('모집중단 학과는 "올해 기준 없음" 경고에서 제외', !sec('graduation').warnings.some((w) => /올해/.test(w)), sec('graduation').warnings);
  check('동아리: 61곳 · 검색 벡터 183조각', sec('clubs').facts.includes('동아리 61곳') && sec('clubs').facts.some((f) => /검색 벡터 183조각/.test(f)), sec('clubs').facts);
  check('지도: 건물 19 · 호실 287 · 장소 35', sec('map').facts.join() === '건물 코드 19개,호실 287개,장소 35곳', sec('map').facts);
  check('실제 데이터에는 경고 없음', r0.sections.every((s) => s.warnings.length === 0), r0.sections.map((s) => s.warnings));

  /* 2. 일부러 빠뜨리면 경고 */
  createClub({ name: '새동아리', category: '취미', intro: '동아리 · 테스트', activities: '활동', source_url: 'https://example.com' });
  addKeywordEntry(['우주선'], ['우주선']);
  const r1 = runKbCheck();
  const cw = r1.sections.find((s) => s.key === 'clubs')!.warnings.join('\n');
  check('검색 벡터가 없는 동아리 경고 (재인덱싱 안내)', /검색 벡터가 없는 동아리: 새동아리/.test(cw), cw);
  check('한두 줄 소개가 빈 동아리 경고', /한두 줄 소개가 빈 동아리: 새동아리/.test(cw), cw);
  check('어느 동아리로도 이어지지 않는 사전 항목 경고', /연결되는 동아리가 없는 사전 항목: 우주선/.test(cw), cw);

  /* 3. HTTP */
  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  try {
    const scan = await fetch(`${base}/api/admin/kb/scan`, { headers: { 'x-admin-token': TOKEN } });
    const data = (await scan.json()) as { sections: unknown[]; warningCount: number };
    check('데이터 점검 API: 4개 영역 · 경고 개수', scan.status === 200 && data.sections.length === 4 && data.warningCount === 3, data.warningCount);
    const phone = await fetch(`${base}/api/admin/clubs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': TOKEN },
      body: JSON.stringify({ name: '폰동아리', category: '취미', intro: '동아리', activities: '활동', source_url: 'https://example.com', contact: '회장 010-1234-5678' }),
    });
    check('입력 칸에서도 개인 휴대폰 번호 거부', phone.status === 400 && /휴대폰/.test(((await phone.json()) as { error: string }).error));

    /* 같은 이름 동아리 — 고칠 동아리를 새로 추가해 두 개가 생기지 않게 (8주차 사전 점검에서 발견) */
    const dup = await fetch(`${base}/api/admin/clubs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': TOKEN },
      body: JSON.stringify({ name: ' 검 선 ', category: '체육', intro: '검도', activities: '활동', source_url: 'https://example.com' }),
    });
    const dupMsg = ((await dup.json()) as { error: string }).error;
    check('이미 있는 이름(띄어쓰기 무시)으로 추가하면 409 · 「수정」 안내', dup.status === 409 && /이미 등록된 동아리/.test(dupMsg), dupMsg);
    const clubs = ((await (await fetch(`${base}/api/admin/clubs`, { headers: { 'x-admin-token': TOKEN } })).json()) as { clubs: Array<{ id: string; name: string }> }).clubs;
    check('거부된 추가는 동아리를 만들지 않음', clubs.filter((c) => c.name.replace(/\s+/g, '') === '검선').length === 1);
    const shutter = clubs.find((c) => c.name === '셔터')!;
    const rename = await fetch(`${base}/api/admin/clubs/${shutter.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': TOKEN },
      body: JSON.stringify({ name: '검선' }),
    });
    check('다른 동아리 이름으로 바꾸기도 409', rename.status === 409);
    const self = await fetch(`${base}/api/admin/clubs/${shutter.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': TOKEN },
      body: JSON.stringify({ name: '셔터', meeting_time: '격주 토요일' }),
    });
    check('제 이름 그대로 저장은 통과', self.status === 200);
  } finally {
    server.close();
  }
  console.log(`\nPASS test-kb-check (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
