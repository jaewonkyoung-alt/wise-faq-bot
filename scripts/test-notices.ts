/**
 * Notice domain test: CRUD, publish window, link validation, Kakao clamp,
 * admin auth gate, and the Kakao 공지 flow end-to-end.
 *
 *   npm run test:notices
 */
import dotenv from 'dotenv';
import os from 'os';
import path from 'path';
dotenv.config();
// 운영 DB(data/wise.db)의 공지를 지우지 않도록, 경로 지정이 없으면 임시 DB 사용
if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = path.join(os.tmpdir(), `wise-test-notices-${process.pid}.db`);
}

import type { Server } from 'http';
import { createApp } from '../src/app';
import { getDb } from '../src/db/database';
import {
  createNotice,
  deleteNotice,
  formatNoticesForKakao,
  listPublishedNotices,
  updateNotice,
} from '../src/services/noticeService';

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

async function main() {
  getDb().prepare('DELETE FROM notices').run();

  /* ── 1. service level ── */
  const a = createNotice({ title: '개강 총회 안내', body: '9월 25일 18시 학생회관 201호에서 진행합니다.' });
  const b = createNotice({ title: '장학금 신청 마감', body: '9월 30일까지 포털에서 신청하세요.', pinned: true, link_url: 'https://wise.dongguk.ac.kr/scholarship' });
  createNotice({ title: '초안 공지', body: '아직 게시하지 않은 공지입니다.', published: false });
  createNotice({ title: '지난 행사', body: '기간이 지난 공지입니다.', ends_at: '2026-01-01T00:00:00.000Z' });
  createNotice({ title: '예정 행사', body: '아직 시작되지 않은 공지입니다.', starts_at: '2099-01-01T00:00:00.000Z' });

  const published = listPublishedNotices(10);
  check('게시 중인 공지만 노출 (초안·기간 밖 제외)', published.length === 2, published.map((n) => n.title));
  check('고정 공지가 맨 앞', published[0].title === '장학금 신청 마감', published.map((n) => n.title));

  const updated = updateNotice(a.id, { title: '개강 총회 안내 (장소 변경)' });
  check('수정 반영', updated?.title === '개강 총회 안내 (장소 변경)');

  /* ── 2. Kakao clamp ── */
  const many = Array.from({ length: 12 }, (_, i) => ({
    ...b,
    id: `x${i}`,
    title: `공지 ${i} 제목`,
    body: '가'.repeat(300),
    pinned: false,
  }));
  const text = formatNoticesForKakao(many, 900);
  check('카톡 출력 900자 이하', text.length <= 900, text.length);
  check('잘린 건수 안내 포함', text.includes('외 '), text.slice(-60));
  check('빈 목록 안내', formatNoticesForKakao([]).includes('등록된 공지가 없습니다'));

  /* ── 3. HTTP: auth gate + CRUD + public list ── */
  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const base = `http://127.0.0.1:${port}`;
  const admin = (path: string, init: RequestInit = {}) =>
    fetch(base + path, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'x-admin-token': TOKEN,
        ...(init.headers || {}),
      },
    });

  const noAuth = await fetch(`${base}/api/admin/notices`);
  check('토큰 없이 관리자 API → 401', noAuth.status === 401, noAuth.status);

  const created = await admin('/api/admin/notices', {
    method: 'POST',
    body: JSON.stringify({ title: 'API 등록 공지', body: '관리자 API로 등록했습니다.' }),
  });
  check('관리자 등록 → 201', created.status === 201, created.status);
  const createdId = ((await created.json()) as { notice: { id: string } }).notice.id;

  const badLink = await admin('/api/admin/notices', {
    method: 'POST',
    body: JSON.stringify({ title: '나쁜 링크', body: '본문', link_url: 'javascript:alert(1)' }),
  });
  check('javascript: 링크 → 400 거부', badLink.status === 400, badLink.status);

  const missing = await admin('/api/admin/notices', {
    method: 'POST',
    body: JSON.stringify({ title: '', body: '' }),
  });
  check('제목·본문 누락 → 400', missing.status === 400, missing.status);

  const publicList = await fetch(`${base}/api/notices?limit=5`);
  const publicData = (await publicList.json()) as { notices: Array<{ title: string }> };
  check('공개 목록에 초안 미노출', !publicData.notices.some((n) => n.title === '초안 공지'), publicData.notices.map((n) => n.title));

  /* ── 4. Kakao skill flow ── */
  const skill = await fetch(`${base}/api/kakao/skill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userRequest: { utterance: '공지', user: { id: 'test-notice-user' } },
      action: { params: {} },
    }),
  });
  const skillJson = (await skill.json()) as {
    template: { outputs: Array<{ simpleText?: { text: string } }>; quickReplies: Array<{ label: string }> };
  };
  const kakaoText = skillJson.template.outputs[0].simpleText?.text || '';
  check('카톡 공지 응답에 제목 포함', kakaoText.includes('장학금 신청 마감'), kakaoText.slice(0, 120));
  check('카톡 공지 응답 900자 이하', kakaoText.length <= 900, kakaoText.length);
  check('메뉴 버튼 유지', skillJson.template.quickReplies.length >= 4);

  const removed = await admin(`/api/admin/notices/${createdId}`, { method: 'DELETE' });
  check('삭제 → 200', removed.status === 200, removed.status);
  const removedAgain = await admin(`/api/admin/notices/${createdId}`, { method: 'DELETE' });
  check('없는 공지 삭제 → 404', removedAgain.status === 404, removedAgain.status);

  deleteNotice(b.id);
  server.close();
  console.log(`\nPASS test-notices (${passed} checks)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
