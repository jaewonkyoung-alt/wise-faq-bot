import { Router } from 'express';
import { checkAdmin } from '../middleware/adminAuth';
import {
  createNotice,
  deleteNotice,
  getNoticeById,
  isSafeLink,
  listNotices,
  listPublishedNotices,
  restoreNotice,
  sweepNotices,
  trashNotice,
  daysUntilPurge,
  TRASH_KEEP_DAYS,
  updateNotice,
} from '../services/noticeService';
import { countSubscribers, deliveryCounts } from '../services/noticeSubscription';
import type { NoticeInput } from '../types/notice';

/** Public: student-facing notice list (published + inside window). */
export const noticeRouter = Router();

noticeRouter.get('/notices', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 5, 20);
  const items = listPublishedNotices(limit);
  res.json({ count: items.length, notices: items });
});

/** Admin: notice CRUD (mounted under /api/admin). */
export const adminNoticeRouter = Router();

function bodyToNotice(body: Record<string, unknown>): NoticeInput | null {
  const title = String(body.title ?? '').trim();
  const text = String(body.body ?? '').trim();
  if (!title || !text) return null;
  const toBool = (v: unknown, fallback: boolean): boolean =>
    v === undefined || v === null || v === ''
      ? fallback
      : v === true || v === 1 || v === '1' || v === 'true';
  return {
    title,
    body: text,
    link_url: body.link_url == null ? null : String(body.link_url),
    pinned: toBool(body.pinned, false),
    published: toBool(body.published, true),
    starts_at: body.starts_at == null ? null : String(body.starts_at),
    ends_at: body.ends_at == null ? null : String(body.ends_at),
  };
}

/** ?trash=1 이면 휴지통. 목록을 보여 주기 전에 기간이 끝난 공지를 휴지통으로 옮기고 30일 지난 것을 지운다. */
adminNoticeRouter.get('/notices', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const sweep = sweepNotices();
  const trash = req.query.trash === '1';
  const notices = listNotices({ trash }).map((n) => ({ ...n, days_left: daysUntilPurge(n) }));
  // 알림 구독자 수 · 공지별 전달 인원 (관리자 화면 표시용)
  res.json({
    count: notices.length,
    notices,
    trash_count: trash ? notices.length : listNotices({ trash: true }).length,
    trash_keep_days: TRASH_KEEP_DAYS,
    sweep,
    subscribers: countSubscribers(),
    delivered: deliveryCounts(),
  });
});

adminNoticeRouter.get('/notices/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const notice = getNoticeById(req.params.id);
  if (!notice) {
    res.status(404).json({ error: 'notice not found' });
    return;
  }
  res.json(notice);
});

adminNoticeRouter.post('/notices', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const input = bodyToNotice(req.body || {});
  if (!input) {
    res.status(400).json({ error: 'title, body are required' });
    return;
  }
  if (!isSafeLink(input.link_url)) {
    res.status(400).json({ error: 'link_url must start with http:// or https://' });
    return;
  }
  const notice = createNotice(input);
  res.status(201).json({ notice });
});

adminNoticeRouter.put('/notices/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const existing = getNoticeById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'notice not found' });
    return;
  }
  const body = req.body || {};
  if (body.link_url !== undefined && !isSafeLink(body.link_url)) {
    res.status(400).json({ error: 'link_url must start with http:// or https://' });
    return;
  }
  if (
    (body.title !== undefined && !String(body.title).trim()) ||
    (body.body !== undefined && !String(body.body).trim())
  ) {
    res.status(400).json({ error: 'title, body must not be empty' });
    return;
  }
  const notice = updateNotice(req.params.id, body);
  res.json({ notice });
});

/** 삭제 = 휴지통으로 (복원 가능). ?purge=1 이면 휴지통에 있는 공지를 완전히 삭제. */
adminNoticeRouter.delete('/notices/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const notice = getNoticeById(req.params.id);
  if (!notice) {
    res.status(404).json({ error: 'notice not found' });
    return;
  }
  if (req.query.purge === '1') {
    if (!notice.trashed_at) {
      res.status(409).json({ error: '휴지통에 있는 공지만 완전히 삭제할 수 있습니다.' });
      return;
    }
    deleteNotice(notice.id);
    res.json({ deleted: true, id: notice.id });
    return;
  }
  if (notice.trashed_at) {
    res.status(409).json({ error: '이미 휴지통에 있습니다.' });
    return;
  }
  trashNotice(notice.id);
  res.json({ trashed: true, id: notice.id });
});

adminNoticeRouter.post('/notices/:id/restore', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const r = restoreNotice(req.params.id);
  if (!r.restored) {
    res.status(404).json({ error: '휴지통에 없는 공지입니다.' });
    return;
  }
  res.json({ ...r, notice: getNoticeById(req.params.id) });
});
