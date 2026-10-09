/**
 * 동아리 목록 테스트 — 개수 · 잘림 없음 · 한두 줄 소개 · 카카오 길이 제한.
 * (10/10 실기기 확인에서 목록이 12개에서 잘리고 어떤 동아리인지 알 수 없다는 피드백)
 *
 *   npm run test:club-list
 */
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
dotenv.config();
// 테스트는 항상 임시 DB
process.env.DATABASE_PATH = path.join(os.tmpdir(), `wise-test-club-list-${process.pid}.db`);
process.env.LLM_PROVIDER = 'mock';

import { getDb } from '../src/db/database';
import { upsertClubByName } from '../src/services/clubStore';
import { reindexAll } from '../src/services/reindex';
import { categoryCounts, clubListAnswer, clubListRequest, findClubByExactName } from '../src/services/clubList';
import { handleKakaoDialog } from '../src/services/kakaoDialog';
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
  const seed = JSON.parse(fs.readFileSync(path.resolve('data/seed/clubs.json'), 'utf-8')) as Array<ClubInput & { summary: string }>;
  for (const c of seed) upsertClubByName(c);
  await reindexAll();

  /* ── 데이터 ── */
  check('시드 61개', seed.length === 61, seed.length);
  const noSum = seed.filter((c) => !c.summary || c.summary.length > 90);
  check('61개 모두 한두 줄 소개 (90자 이하)', noSum.length === 0, noSum.map((c) => c.name));
  const counts = categoryCounts();
  check('분과별 개수 합 = 61', counts.reduce((a, c) => a + c.count, 0) === 61, counts);

  /* ── 목록 요청 인식 ── */
  const cases: Array<[string, string | null | undefined]> = [
    ['동아리 목록 알려줘', null],
    ['동아리 목록', null],
    ['무슨 동아리 있어?', null],
    ['학술 동아리 목록', '학술'],
    ['체육 동아리 목록', '체육'],
    ['운동 동아리 리스트', '체육'],
    ['공연 동아리 전체', '문화예술'],
    ['별 보는 동아리 있어?', undefined],
    ['축구 동아리 뭐 있어', undefined],
    ['봉사시간 채울 수 있는 동아리', undefined],
    ['디벨로퍼 연락처', undefined],
  ];
  for (const [q, want] of cases) {
    const r = clubListRequest(q);
    const got = r === undefined ? undefined : r.category;
    check(`"${q}" → ${want === undefined ? '목록 아님' : want ?? '전체'}`, got === want, r);
  }

  /* ── 답변 ── */
  const all = clubListAnswer(null);
  check('전체: "61개" 와 분과별 개수', all.texts[0].includes('61개') && counts.every((c) => all.texts[0].includes(`${c.category} ${c.count}`)), all.texts[0]);
  check('전체: 분과 버튼 + 메뉴', all.replies.length === counts.length + 1, all.replies);

  const seen = new Set<string>();
  for (const { category, count } of counts) {
    const a = clubListAnswer(category);
    const body = a.texts.join('\n');
    const inCat = seed.filter((c) => c.category === category);
    const missing = inCat.filter((c) => !body.includes(`· ${c.name}\n`) || !body.includes(c.summary));
    inCat.forEach((c) => seen.add(c.name));
    check(`${category} ${count}개: 이름 + 소개 전부 (잘림 없음)`, missing.length === 0 && !body.includes('이하 생략'), missing.map((c) => c.name));
    check(`${category}: 말풍선 ${a.texts.length}개 · 각 1000자 이하`, a.texts.length <= 3 && a.texts.every((t) => t.length <= 1000), a.texts.map((t) => t.length));
  }
  check('분과별 목록을 합치면 61개 전부', seen.size === 61, seen.size);

  /* ── 카톡 대화 ── */
  const U = `test-club-list-${process.pid}`;
  await handleKakaoDialog(U, '메뉴');
  const r1 = await handleKakaoDialog(U, '동아리 목록 알려줘');
  const t1 = JSON.stringify(r1.template);
  check('카톡 "동아리 목록 알려줘": 61개 + 분과 버튼', t1.includes('61개') && t1.includes('체육 동아리 목록'), t1.slice(0, 300));
  const r2 = await handleKakaoDialog(U, '체육 동아리 목록');
  const outs = (r2.template.outputs as Array<{ simpleText?: { text: string } }>).map((o) => o.simpleText?.text || '');
  check('카톡 "체육 동아리 목록": 22개를 말풍선 여러 개로', outs.length >= 2 && outs.join('').includes('D.U.B.C') && outs.join('').includes('흑대무도'), outs.map((o) => o.length));
  const r3 = await handleKakaoDialog(U, '별 보는 동아리 있어?');
  check('관심사 질문은 그대로 검색 (푸르체리마 + 소개)', JSON.stringify(r3.template).includes('푸르체리마') && JSON.stringify(r3.template).includes('망원경으로 별을'), JSON.stringify(r3.template).slice(0, 300));

  /* ── 이름만 보낸 경우 ── */
  await handleKakaoDialog(U, '메뉴');
  for (const [q, want] of [['검선', '검선'], ['푸르체리마', '푸르체리마'], ['dubc', 'D.U.B.C'], ['동산', '동국산악부'], ['디벨로퍼 동아리', '디벨로퍼']] as const) {
    const r = JSON.stringify((await handleKakaoDialog(U, q)).template);
    check(`이름만 "${q}" → ${want} 상세`, r.includes(`【${want}】`) && r.includes('활동:'), r.slice(0, 200));
  }
  const miss = JSON.stringify((await handleKakaoDialog(U, '지도')).template);
  check('"지도"는 동아리로 잡지 않음', !miss.includes('【'), miss.slice(0, 120));
  const notFound = seed.filter((c) => findClubByExactName(c.name)?.name !== c.name).map((c) => c.name);
  check('61개 이름 모두 이름만으로 찾음', notFound.length === 0, notFound);

  console.log(`\nPASS test-club-list (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
