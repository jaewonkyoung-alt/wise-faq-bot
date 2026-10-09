/**
 * 공지 알림 구독 테스트: 구독/해제, 다음 대화 때 새 공지 전달,
 * 한 번만 전달, 최대 3건, 14일 경과 제외, 초안 제외, 관리자 통계.
 *
 *   npm run test:notice-sub
 */
import dotenv from 'dotenv';
import os from 'os';
import path from 'path';
dotenv.config();
// 테스트는 항상 임시 DB — .env 의 운영 DATABASE_PATH 를 쓰면 운영 데이터가 섞인다 (10/10 사고)
{
  process.env.DATABASE_PATH = path.join(os.tmpdir(), `wise-test-notice-sub-${process.pid}.db`);
}

import type { Server } from 'http';
import { createApp } from '../src/app';
import { getDb } from '../src/db/database';
import { createNotice, deleteNotice } from '../src/services/noticeService';
import { BANNER_MAX, BANNER_MAX_AGE_DAYS } from '../src/services/noticeSubscription';
import { prependText, simpleText } from '../src/kakao/responseBuilder';

const TOKEN = process.env.ADMIN_TOKEN || 'test-admin-token';
process.env.ADMIN_TOKEN = TOKEN;

let passed = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (!cond) {
    console.error(`FAIL  ${name}`, extra ?? '');
    throw new Error(`test failed: ${name}`);
  }
  passed += 1;
  console.log(`PASS  ${name}`);
}

type SkillJson = {
  template: {
    outputs: Array<{ simpleText?: { text: string }; basicCard?: unknown }>;
    quickReplies?: Array<{ label: string }>;
  };
};

async function main() {
  const db = getDb();
  db.prepare('DELETE FROM notices').run();
  db.prepare('DELETE FROM notice_subscribers').run();
  db.prepare('DELETE FROM notice_deliveries').run();

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  const say = async (user: string, utterance: string): Promise<SkillJson> => {
    const r = await fetch(`${base}/api/kakao/skill`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userRequest: { utterance, user: { id: user } }, action: { params: {} } }),
    });
    return (await r.json()) as SkillJson;
  };
  const first = (j: SkillJson) => j.template.outputs[0]?.simpleText?.text || '';
  const labels = (j: SkillJson) => (j.template.quickReplies || []).map((q) => q.label);

  const old = createNotice({ title: '기존 공지', body: '구독 전에 올라온 공지' });

  /* ── 1. 구독 전에는 알림 없음 ── */
  const menuBefore = await say('stu-a', '메뉴');
  check('구독 전: 새 공지 알림 없음', !first(menuBefore).includes('새 공지'), first(menuBefore));
  const noticeMenu = await say('stu-a', '공지');
  check('공지 메뉴에 「새 공지 알림 받기」 버튼', labels(noticeMenu).includes('새 공지 알림 받기'), labels(noticeMenu));

  /* ── 2. 구독 ── */
  // 버튼 글자 그대로 입력해도 구독 (오픈빌더 봇테스트에서 발견)
  const typed = await say('stu-typed', '새 공지 알림 받기');
  check('「새 공지 알림 받기」를 직접 입력해도 구독', JSON.stringify(typed).includes('공지 알림을 켰습니다'), typed);
  await say('stu-typed', '공지 알림 끄기');
  const sub = await say('stu-a', '공지 알림 받기');
  check('구독 응답 문구', first(sub).includes('알림을 켰습니다'), first(sub));
  check('구독 응답에 현재 공지 포함', first(sub).includes('기존 공지'), first(sub));
  check('구독 후 버튼이 「알림 끄기」로 바뀜', labels(sub).includes('알림 끄기'), labels(sub));
  const afterSub = await say('stu-a', '메뉴');
  check('구독 시 보여 준 공지는 다시 알리지 않음', !first(afterSub).includes('새 공지'), first(afterSub));

  /* ── 3. 새 공지 → 다음 대화 때 한 번만 전달 ── */
  const fresh = createNotice({ title: '수강신청 정정 기간 안내', body: '9/30~10/2', link_url: 'https://wise.dongguk.ac.kr/a' });
  const next = await say('stu-a', '메뉴');
  check('다음 대화 맨 앞에 새 공지 알림', first(next).startsWith('📢 새 공지 1건'), first(next));
  check('알림에 제목·링크 포함', first(next).includes('수강신청 정정 기간 안내') && first(next).includes('https://wise.dongguk.ac.kr/a'));
  check('본래 답변(메뉴 안내)도 그대로 이어짐', next.template.outputs.length === 2 && (next.template.outputs[1].simpleText?.text || '').includes('메뉴'), next.template.outputs);
  const again = await say('stu-a', '메뉴');
  check('같은 공지는 두 번 알리지 않음', !first(again).includes('새 공지'), first(again));

  /* ── 4. 구독하지 않은 학생은 알림 없음 ── */
  const other = await say('stu-b', '메뉴');
  check('미구독 학생에게는 알림 없음', !first(other).includes('새 공지'), first(other));

  /* ── 5. 스팸 방지: 최대 3건 · 초안 제외 · 14일 경과 제외 ── */
  for (let i = 1; i <= 5; i += 1) createNotice({ title: `공통 공지 ${i}`, body: `본문 ${i}` });
  createNotice({ title: '초안 공지', body: '아직 게시 안 함', published: false });
  const stale = createNotice({ title: '오래된 공지', body: '20일 전 게시' });
  const staleAt = new Date(Date.now() - (BANNER_MAX_AGE_DAYS + 6) * 86400_000).toISOString();
  db.prepare('UPDATE notices SET created_at = ?, updated_at = ? WHERE id = ?').run(staleAt, staleAt, stale.id);
  const burst = await say('stu-a', '메뉴');
  const bt = first(burst);
  const shownTitles = (bt.match(/공통 공지 \d/g) || []).length;
  check(`한 번에 최대 ${BANNER_MAX}건만 표시`, shownTitles === BANNER_MAX, bt);
  check('나머지는 건수만 안내 (외 2건)', bt.includes('📢 새 공지 5건') && bt.includes('외 2건'), bt);
  check('초안 공지는 알리지 않음', !bt.includes('초안 공지'));
  check(`게시 ${BANNER_MAX_AGE_DAYS}일 지난 공지는 알리지 않음`, !bt.includes('오래된 공지'));
  const rest = await say('stu-a', '메뉴');
  check('남은 2건은 다음 대화 때 전달', first(rest).includes('📢 새 공지 2건'), first(rest));

  /* ── 6. 출력 3개 제한: 이미 3개면 첫 텍스트에 합침 ── */
  const three = simpleText('본문');
  three.template.outputs.push({ simpleText: { text: '둘' } }, { simpleText: { text: '셋' } });
  const merged = prependText(three, '📢 새 공지 1건');
  check('outputs 3개 초과하지 않음', !!merged && merged.template.outputs.length === 3, merged?.template.outputs.length);
  check('첫 텍스트에 알림이 합쳐짐', !!merged && (merged.template.outputs[0] as { simpleText: { text: string } }).simpleText.text.startsWith('📢'));

  /* ── 7. 졸업요건 등 다른 기능 응답에도 붙음 ── */
  createNotice({ title: '중간고사 일정', body: '10/20~' });
  const grad = await say('stu-a', '졸업요건');
  check('졸업요건 질문에도 새 공지가 먼저', first(grad).includes('중간고사 일정') && (grad.template.outputs[1].simpleText?.text || '').includes('입학연도'), grad.template.outputs);

  /* ── 8. 해제 ── */
  const off = await say('stu-a', '공지 알림 끄기');
  check('해제 응답', first(off).includes('알림을 껐습니다'), first(off));
  createNotice({ title: '해제 후 공지', body: '알리면 안 됨' });
  const afterOff = await say('stu-a', '메뉴');
  check('해제 후에는 알림 없음', !first(afterOff).includes('새 공지'), first(afterOff));

  /* ── 9. 관리자 통계 · 삭제 시 전달 기록 정리 ── */
  await say('stu-c', '공지 알림 받기');
  const adm = await fetch(`${base}/api/admin/notices`, { headers: { 'x-admin-token': TOKEN } });
  const admJson = (await adm.json()) as { subscribers: number; delivered: Record<string, number> };
  check('관리자 목록에 구독자 수', admJson.subscribers === 1, admJson.subscribers);
  check('관리자 목록에 공지별 전달 인원', (admJson.delivered[fresh.id] || 0) >= 1, admJson.delivered);
  deleteNotice(fresh.id);
  const left = db.prepare('SELECT COUNT(*) AS n FROM notice_deliveries WHERE notice_id = ?').get(fresh.id) as { n: number };
  check('공지 삭제 시 전달 기록도 삭제', left.n === 0, left.n);
  void old;

  server.close();
  console.log(`\nPASS test-notice-subscription (${passed} checks)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
