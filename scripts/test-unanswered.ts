/**
 * 미답변 관리 (FR-12) · 키워드 사전 편집 테스트.
 *  - 같은 질문 묶기 · 한국어 이유 · 해결/무시/되돌리기 · 처리한 기록만 비우기
 *  - 카톡 메인 메뉴에서 못 알아들은 말도 기록, 사전에 걸리는 말은 메뉴 대신 동아리 검색
 *  - 관리자 화면에서 사전 추가 → 다음 질문부터 바로 답변 (재시작 없이)
 *
 *   npm run test:unanswered
 */
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
dotenv.config();
// 테스트는 항상 임시 DB · 임시 사전 파일 (운영 사전을 고치지 않는다)
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wise-test-unanswered-'));
process.env.DATABASE_PATH = path.join(TMP, 'test.db');
process.env.CLUB_KEYWORDS_FILE = path.join(TMP, '_keywords.json');
fs.copyFileSync(path.resolve('data/kb/동아리/_keywords.json'), process.env.CLUB_KEYWORDS_FILE);
process.env.LLM_PROVIDER = 'mock';
process.env.EMBED_PROVIDER = 'mock';
const TOKEN = 'test-admin-token';
process.env.ADMIN_TOKEN = TOKEN;

import type { Server } from 'http';
import { createApp } from '../src/app';
import { getDb } from '../src/db/database';
import { upsertClubByName } from '../src/services/clubStore';
import { reindexAll } from '../src/services/reindex';
import { ask } from '../src/services/askService';
import { handleKakaoDialog } from '../src/services/kakaoDialog';
import { logUnanswered, listUnansweredGroups, unansweredCounts } from '../src/services/unanswered';
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

const textOf = (r: unknown) =>
  ((r as { template: { outputs: Array<{ simpleText?: { text: string } }> } }).template.outputs || [])
    .map((o) => o.simpleText?.text || '')
    .join('\n');

async function main(): Promise<void> {
  getDb();
  for (const c of JSON.parse(fs.readFileSync(path.resolve('data/seed/clubs.json'), 'utf-8')) as ClubInput[]) upsertClubByName(c);
  await reindexAll();

  /* 1. 묶기 · 이유 */
  logUnanswered('총 쏘는 동아리 있어?', 'low similarity or no embeddings', 'semantic_search');
  logUnanswered('총 쏘는 동아리 있어', 'low similarity or no embeddings', 'semantic_search');
  logUnanswered('총  쏘는 동아리  있어?!', 'low similarity or no embeddings', 'semantic_search');
  logUnanswered('졸업요건 2019 컴퓨터공학과', 'graduation_miss:2019:컴퓨터공학과', 'graduation');
  const groups = listUnansweredGroups('new');
  const gun = groups.find((g) => g.question.startsWith('총'));
  check('띄어쓰기 · 문장부호만 다른 질문은 한 묶음 (3번)', groups.length === 2 && gun?.count === 3, groups);
  check('이유는 한국어로 (찾는 동아리를 확인하지 못함)', gun?.reason === '찾는 동아리를 확인하지 못함' && gun.area === '동아리', gun);
  check('졸업요건 미답변은 분야 · 이유가 졸업요건', groups.some((g) => g.area === '졸업요건' && /졸업요건 데이터 없음/.test(g.reason)));
  check('개수는 묶음 단위 (새 질문 2)', unansweredCounts().new === 2, unansweredCounts());

  /* 2. 카톡 메인 메뉴 */
  await handleKakaoDialog('u1', '메뉴');
  const junk = await handleKakaoDialog('u1', '학식 메뉴 알려줘');
  check('메뉴에서 못 알아들은 말 → 메뉴 안내', /메뉴에서 선택해 주세요/.test(textOf(junk)), textOf(junk));
  check('그 말을 미답변에 기록 (무슨 말인지 몰라 메뉴로 돌아감)',
    listUnansweredGroups('new').some((g) => g.question === '학식 메뉴 알려줘' && g.reason === '무슨 말인지 몰라 메뉴로 돌아감'));
  await handleKakaoDialog('u2', '메뉴');
  const bjj = await handleKakaoDialog('u2', '주짓수 배우고 싶어');
  check("'동아리'라는 말이 없어도 사전에 걸리면 동아리 검색 (주짓수 → 흑대무도)", /흑대무도/.test(textOf(bjj)), textOf(bjj));

  /* 3. HTTP */
  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  const call = async (p: string, init: { method?: string; body?: unknown } = {}) => {
    const r = await fetch(base + p, {
      method: init.method || 'GET',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': TOKEN },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    return { status: r.status, data: (await r.json()) as Record<string, any> };
  };
  try {
    check('토큰 없으면 미답변 목록 401', (await fetch(`${base}/api/unanswered`)).status === 401);
    const list = await call('/api/unanswered?status=new');
    const g = (list.data.groups as Array<{ question: string; ids: number[] }>).find((x) => x.question.startsWith('총'))!;
    const done = await call('/api/unanswered/status', { method: 'POST', body: { ids: g.ids, status: 'resolved' } });
    check('묶음 해결 → 기록 3건 한 번에', done.data.changed === 3 && done.data.counts.resolved === 1, done.data);
    const resolved = await call('/api/unanswered?status=resolved');
    check('해결 탭에 보임', (resolved.data.groups as Array<{ question: string }>).some((x) => x.question.startsWith('총')));
    const back = await call('/api/unanswered/status', { method: 'POST', body: { ids: g.ids, status: 'new' } });
    check('새 질문으로 되돌리기', back.data.counts.resolved === 0, back.data);
    check('알 수 없는 상태는 400', (await call('/api/unanswered/status', { method: 'POST', body: { ids: g.ids, status: 'x' } })).status === 400);
    const jg = (list.data.groups as Array<{ question: string; ids: number[] }>).find((x) => x.question.startsWith('졸업요건'))!;
    await call('/api/unanswered/status', { method: 'POST', body: { ids: jg.ids, status: 'ignored' } });
    const cleared = await call('/api/unanswered?handled=1', { method: 'DELETE' });
    check('처리한 기록만 비우기 (새 질문은 남음)', cleared.data.deleted === 1 && cleared.data.counts.new >= 2, cleared.data);

    /* 4. 키워드 사전 편집 */
    const before = await ask('칼싸움 하는 동아리 있어?');
    check('사전에 없을 때: 칼싸움 → 검선을 확정 답변하지 못함', !before.answer.startsWith('【검선】'), before.answer.slice(0, 80));
    const kw = await call('/api/admin/clubs/keywords');
    const n0 = (kw.data.entries as unknown[]).length;
    const star = (kw.data.entries as Array<{ words: string[]; clubs: string[] }>).find((e) => e.words.includes('망원경'));
    check('사전 목록: 단어 · 연결 동아리 (별 → 푸르체리마)', !!star && star.clubs.includes('푸르체리마'), star);
    check('예외 규칙 항목은 고급으로 표시 (웹(?!툰))', (kw.data.entries as Array<{ q: string; simple: boolean }>).some((e) => /\(\?!/.test(e.q) && !e.simple));
    const pv = await call('/api/admin/clubs/keywords/preview', { method: 'POST', body: { words: '칼싸움, 죽도', field: '검도' } });
    check('저장 전 미리보기: 분야 검도 → 검선', pv.data.clubs?.join() === '검선', pv.data);
    if (!before.answer.startsWith('찾는 동아리를')) {
      check("'비슷한 동아리'로만 안내한 질문도 미답변에 기록", listUnansweredGroups('new').some((x) => x.question === '칼싸움 하는 동아리 있어?' && /딱 맞는 동아리 없음/.test(x.reason)));
    }
    const add = await call('/api/admin/clubs/keywords', { method: 'POST', body: { words: '칼싸움, 죽도', field: '검도' } });
    check('사전에 추가', add.status === 201 && (add.data.entries as unknown[]).length === n0 + 1, add.data);
    const saved = JSON.parse(fs.readFileSync(process.env.CLUB_KEYWORDS_FILE!, 'utf-8')).entries.at(-1);
    check('파일에는 정규식 꼴로 저장 (칼싸움|죽도 → 검도)', saved.q === '칼싸움|죽도' && saved.c === '검도', saved);
    const after = await ask('칼싸움 하는 동아리 있어?');
    check('추가 즉시 (재시작 없이) 칼싸움 → 검선 확정 답변', after.answer.startsWith('【검선】'), after.answer.slice(0, 80));
    const idx = add.data.index as number;
    const stale = await call(`/api/admin/clubs/keywords/${idx}`, { method: 'PUT', body: { q: '다른값', words: '칼', field: '검도' } });
    check('그사이 바뀐 항목은 덮지 않음 (409)', stale.status === 409, stale.data);
    const adv = (kw.data.entries as Array<{ index: number; q: string; simple: boolean }>).find((e) => !e.simple)!;
    const advPut = await call(`/api/admin/clubs/keywords/${adv.index}`, { method: 'PUT', body: { q: adv.q, words: '웹', field: '' } });
    check('고급 항목은 화면에서 수정 불가', advPut.status === 409 && /고급/.test(advPut.data.error), advPut.data);
    const special = await call('/api/admin/clubs/keywords/preview', { method: 'POST', body: { words: 'C++, (테스트)', field: '' } });
    check('특수문자 단어도 안전하게 저장 (정규식 오류 없음)', special.status === 200, special.data);
    const del = await call(`/api/admin/clubs/keywords/${idx}?q=${encodeURIComponent('칼싸움|죽도')}`, { method: 'DELETE' });
    check('사전 항목 삭제', del.status === 200 && (del.data.entries as unknown[]).length === n0, del.data);
    check('빈 표현은 400', (await call('/api/admin/clubs/keywords', { method: 'POST', body: { words: ' , ', field: '검도' } })).status === 400);
  } finally {
    server.close();
  }

  console.log(`\nPASS test-unanswered (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
