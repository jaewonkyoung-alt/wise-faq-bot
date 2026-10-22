/**
 * 공지 휴지통 테스트 (8주차) — 기간이 끝나면 휴지통 · 30일 뒤 삭제 · 복원.
 *
 *   npm run test:notice-trash
 */
import dotenv from 'dotenv';
import os from 'os';
import path from 'path';
dotenv.config();
// 테스트는 항상 임시 DB
process.env.DATABASE_PATH = path.join(os.tmpdir(), `wise-test-notice-trash-${process.pid}.db`);
const TOKEN = 'test-admin-token';
process.env.ADMIN_TOKEN = TOKEN;

import type { Server } from 'http';
import { createApp } from '../src/app';
import { getDb } from '../src/db/database';
import {
  createNotice,
  daysUntilPurge,
  getNoticeById,
  listNotices,
  listPublishedNotices,
  restoreNotice,
  sweepNotices,
  trashNotice,
} from '../src/services/noticeService';

let passed = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (!cond) {
    console.error(`FAIL  ${name}`, extra ?? '');
    throw new Error(`test failed: ${name}`);
  }
  passed += 1;
  console.log(`PASS  ${name}`);
}

const DAY = 86400000;

async function main(): Promise<void> {
  getDb().prepare('DELETE FROM notices').run();
  const now = new Date('2026-10-22T03:00:00.000Z');

  const ended = createNotice({ title: '중간고사 시간표', body: '10/20까지 공지', ends_at: '2026-10-20T14:59:00.000Z' });
  const live = createNotice({ title: '장학금 신청', body: '11/30까지', ends_at: '2026-11-30T14:59:00.000Z' });
  const always = createNotice({ title: '학사 안내', body: '기간 없음' });

  /* 1. 기간 끝 → 휴지통 */
  const s1 = sweepNotices(now);
  check('기간이 끝난 공지 1건만 휴지통으로', s1.trashed === 1 && s1.purged === 0, s1);
  check('휴지통 공지는 카톡 공지 목록에서 빠짐', !listPublishedNotices(10, now).some((n) => n.id === ended.id));
  check('관리자 게시 목록에서 빠지고 휴지통 목록에 보임',
    !listNotices().some((n) => n.id === ended.id) && listNotices({ trash: true }).some((n) => n.id === ended.id));
  check('기간 안 · 기간 없는 공지는 그대로', listPublishedNotices(10, now).length === 2);
  check('자동 삭제까지 30일', daysUntilPurge(getNoticeById(ended.id)!, now) === 30);
  check('같은 날 다시 돌려도 중복 이동 없음', sweepNotices(now).trashed === 0);

  /* 2. 복원 */
  const r = restoreNotice(ended.id, new Date(now.getTime() + DAY));
  const back = getNoticeById(ended.id)!;
  check('기간이 지난 공지 복원 → 초안(게시 안 함) · 종료일 비움', r.asDraft && !back.published && back.ends_at === null && back.trashed_at === null, back);
  check('복원한 공지는 다음 정리 때 다시 휴지통으로 가지 않음', sweepNotices(new Date(now.getTime() + 2 * DAY)).trashed === 0);
  check('복원한 초안은 학생에게 보이지 않음 (관리자가 기간을 고쳐 다시 게시)', !listPublishedNotices(10, now).some((n) => n.id === ended.id));

  trashNotice(live.id, now);
  const r2 = restoreNotice(live.id, now);
  check('기간 안의 공지는 그대로 복원 (게시 유지)', !r2.asDraft && getNoticeById(live.id)!.published && getNoticeById(live.id)!.ends_at !== null);

  /* 3. 30일 뒤 삭제 */
  trashNotice(always.id, now);
  check('29일째에는 남아 있음', sweepNotices(new Date(now.getTime() + 29 * DAY)).purged === 0 && !!getNoticeById(always.id));
  const s3 = sweepNotices(new Date(now.getTime() + 31 * DAY));
  check('휴지통 30일 지나면 완전히 삭제', s3.purged === 1 && !getNoticeById(always.id), s3);

  /* 4. HTTP */
  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  const base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  const call = async (p: string, method = 'GET') => {
    const res = await fetch(base + p, { method, headers: { 'x-admin-token': TOKEN } });
    return { status: res.status, data: (await res.json()) as Record<string, any> };
  };
  try {
    const t = createNotice({ title: '삭제 테스트', body: '본문' });
    check('삭제 버튼 = 휴지통으로', (await call(`/api/admin/notices/${t.id}`, 'DELETE')).data.trashed === true);
    const trash = await call('/api/admin/notices?trash=1');
    const row = (trash.data.notices as Array<{ id: string; days_left: number }>).find((n) => n.id === t.id);
    check('휴지통 목록에 남은 날 표시', row?.days_left === 30 && trash.data.trash_keep_days === 30, row);
    check('게시 중 공지는 바로 완전 삭제 불가 (409)', (await call(`/api/admin/notices/${live.id}?purge=1`, 'DELETE')).status === 409);
    const res = await call(`/api/admin/notices/${t.id}/restore`, 'POST');
    check('휴지통에서 복원', res.status === 200 && res.data.notice.trashed_at === null, res.data);
    await call(`/api/admin/notices/${t.id}`, 'DELETE');
    check('휴지통에서 완전히 삭제', (await call(`/api/admin/notices/${t.id}?purge=1`, 'DELETE')).data.deleted === true && !getNoticeById(t.id));
  } finally {
    server.close();
  }

  console.log(`\nPASS test-notice-trash (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
