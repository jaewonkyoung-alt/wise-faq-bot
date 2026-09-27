import { getDb } from '../db/database';
import type { Notice } from '../types/notice';
import { listPublishedNotices } from './noticeService';

/**
 * 공지 알림 구독 (1단계: 인증 채널 없이 동작하는 방식).
 *
 * 카카오 Event API(먼저 보내기)는 비즈니스 인증 채널에서만 쓸 수 있다.
 * 그래서 구독한 학생이 다음에 아무 메시지나 보내면, 답변 앞에
 * 아직 받지 않은 새 공지를 붙여서 전달한다.
 *
 * 스팸 방지 규칙
 *  - 공지는 전교생 공통 공지만 등록한다 (학과별 공지 없음 — 관리자 화면에 명시)
 *  - 한 번에 최대 BANNER_MAX 건, 나머지는 건수만 안내
 *  - 게시 후 BANNER_MAX_AGE_DAYS 일이 지난 공지는 붙이지 않음
 *  - 같은 공지는 학생마다 한 번만 전달
 */
export const BANNER_MAX = 3;
export const BANNER_MAX_AGE_DAYS = 14;
const BANNER_MAX_CHARS = 400;

export function isSubscribed(userKey: string): boolean {
  const row = getDb()
    .prepare('SELECT 1 FROM notice_subscribers WHERE user_key = ?')
    .get(userKey);
  return !!row;
}

/**
 * 구독 시작. 지금 게시 중인 공지는 구독 응답에서 바로 보여 주므로
 * 전달 완료로 기록한다 — 다음 대화에서 같은 공지가 다시 붙지 않게.
 */
export function subscribe(userKey: string, now = new Date()): Notice[] {
  const db = getDb();
  const iso = now.toISOString();
  const current = listPublishedNotices(5, now);
  db.transaction(() => {
    db.prepare(
      `INSERT INTO notice_subscribers (user_key, subscribed_at) VALUES (?, ?)
       ON CONFLICT(user_key) DO NOTHING`
    ).run(userKey, iso);
    markDelivered(userKey, listPublishedNotices(20, now).map((n) => n.id), now);
  })();
  return current;
}

export function unsubscribe(userKey: string): boolean {
  const r = getDb().prepare('DELETE FROM notice_subscribers WHERE user_key = ?').run(userKey);
  return r.changes > 0;
}

export function countSubscribers(): number {
  const row = getDb().prepare('SELECT COUNT(*) AS n FROM notice_subscribers').get() as { n: number };
  return row.n;
}

/** 공지별 전달 인원 (관리자 목록 표시용) */
export function deliveryCounts(): Record<string, number> {
  const rows = getDb()
    .prepare('SELECT notice_id, COUNT(*) AS n FROM notice_deliveries GROUP BY notice_id')
    .all() as Array<{ notice_id: string; n: number }>;
  const out: Record<string, number> = {};
  for (const r of rows) out[r.notice_id] = r.n;
  return out;
}

export function markDelivered(userKey: string, noticeIds: string[], now = new Date()): void {
  if (noticeIds.length === 0) return;
  const stmt = getDb().prepare(
    `INSERT OR IGNORE INTO notice_deliveries (user_key, notice_id, delivered_at) VALUES (?, ?, ?)`
  );
  const iso = now.toISOString();
  for (const id of noticeIds) stmt.run(userKey, id, iso);
}

/**
 * 이 학생이 아직 받지 않은 새 공지 (게시 중 · 게시 기간 안 · 최근 N일).
 * 고정 우선, 최신순. 전체 미전달 건수도 함께 돌려준다.
 */
export function pendingNotices(
  userKey: string,
  now = new Date()
): { notices: Notice[]; total: number } {
  if (!isSubscribed(userKey)) return { notices: [], total: 0 };
  const cutoff = new Date(now.getTime() - BANNER_MAX_AGE_DAYS * 86400_000).toISOString();
  const delivered = new Set(
    (
      getDb()
        .prepare('SELECT notice_id FROM notice_deliveries WHERE user_key = ?')
        .all(userKey) as Array<{ notice_id: string }>
    ).map((r) => r.notice_id)
  );
  const fresh = listPublishedNotices(20, now).filter((n) => {
    const postedAt = n.starts_at && n.starts_at > n.created_at ? n.starts_at : n.created_at;
    return !delivered.has(n.id) && postedAt >= cutoff;
  });
  return { notices: fresh.slice(0, BANNER_MAX), total: fresh.length };
}

export function formatNoticeBanner(notices: Notice[], total: number): string {
  const lines = [`📢 새 공지 ${total}건`];
  for (const n of notices) {
    const pin = n.pinned ? '[고정] ' : '';
    const link = n.link_url ? `\n  ${n.link_url}` : '';
    lines.push(`· ${pin}${n.title}${link}`);
  }
  if (total > notices.length) {
    lines.push(`외 ${total - notices.length}건은 「공지」 메뉴에서 확인하세요.`);
  }
  let text = lines.join('\n');
  if (text.length > BANNER_MAX_CHARS) text = text.slice(0, BANNER_MAX_CHARS - 1) + '…';
  return text;
}
