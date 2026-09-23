import { Router } from 'express';
import { checkAdmin } from '../middleware/adminAuth';
import {
  createNotice,
  deleteNotice,
  getNoticeById,
  isSafeLink,
  listNotices,
  listPublishedNotices,
  updateNotice,
} from '../services/noticeService';
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

adminNoticeRouter.get('/notices', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const notices = listNotices();
  res.json({ count: notices.length, notices });
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

adminNoticeRouter.delete('/notices/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const ok = deleteNotice(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'notice not found' });
    return;
  }
  res.json({ deleted: true, id: req.params.id });
});
