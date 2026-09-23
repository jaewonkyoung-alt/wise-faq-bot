import { randomUUID } from 'crypto';
import { getDb } from '../db/database';
import type { Notice, NoticeInput } from '../types/notice';

function rowToNotice(row: Record<string, unknown>): Notice {
  return {
    id: String(row.id),
    title: String(row.title),
    body: String(row.body),
    link_url: row.link_url == null ? null : String(row.link_url),
    pinned: Number(row.pinned) === 1,
    published: Number(row.published) === 1,
    starts_at: row.starts_at == null ? null : String(row.starts_at),
    ends_at: row.ends_at == null ? null : String(row.ends_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

/** Only http(s) links may be shown to students (Kakao webLink / admin output). */
export function isSafeLink(value: unknown): boolean {
  if (value == null || value === '') return true;
  const s = String(value).trim();
  return /^https?:\/\/\S+$/i.test(s);
}

export function listNotices(): Notice[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM notices
       ORDER BY pinned DESC, datetime(updated_at) DESC`
    )
    .all() as Record<string, unknown>[];
  return rows.map(rowToNotice);
}

export function getNoticeById(id: string): Notice | undefined {
  const row = getDb()
    .prepare('SELECT * FROM notices WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToNotice(row) : undefined;
}

/**
 * Student-facing list: published only, inside the publish window,
 * pinned first then newest. `now` is injectable for tests.
 */
export function listPublishedNotices(limit = 5, now = new Date()): Notice[] {
  const iso = now.toISOString();
  const rows = getDb()
    .prepare(
      `SELECT * FROM notices
       WHERE published = 1
         AND (starts_at IS NULL OR starts_at = '' OR starts_at <= ?)
         AND (ends_at   IS NULL OR ends_at   = '' OR ends_at   >= ?)
       ORDER BY pinned DESC, datetime(updated_at) DESC
       LIMIT ?`
    )
    .all(iso, iso, Math.min(Math.max(limit, 1), 20)) as Record<string, unknown>[];
  return rows.map(rowToNotice);
}

export function createNotice(input: NoticeInput): Notice {
  const now = new Date().toISOString();
  const notice: Notice = {
    id: randomUUID(),
    title: input.title.trim(),
    body: input.body.trim(),
    link_url: input.link_url?.trim() || null,
    pinned: input.pinned === true,
    published: input.published !== false,
    starts_at: input.starts_at?.trim() || null,
    ends_at: input.ends_at?.trim() || null,
    created_at: now,
    updated_at: now,
  };
  getDb()
    .prepare(
      `INSERT INTO notices
       (id, title, body, link_url, pinned, published, starts_at, ends_at, created_at, updated_at)
       VALUES (@id, @title, @body, @link_url, @pinned, @published, @starts_at, @ends_at, @created_at, @updated_at)`
    )
    .run({
      ...notice,
      pinned: notice.pinned ? 1 : 0,
      published: notice.published ? 1 : 0,
    });
  return notice;
}

export function updateNotice(
  id: string,
  input: Partial<NoticeInput>
): Notice | undefined {
  const existing = getNoticeById(id);
  if (!existing) return undefined;

  const updated: Notice = {
    ...existing,
    title: input.title?.trim() ?? existing.title,
    body: input.body?.trim() ?? existing.body,
    link_url:
      input.link_url !== undefined
        ? input.link_url?.trim() || null
        : existing.link_url,
    pinned: input.pinned !== undefined ? input.pinned === true : existing.pinned,
    published:
      input.published !== undefined ? input.published === true : existing.published,
    starts_at:
      input.starts_at !== undefined
        ? input.starts_at?.trim() || null
        : existing.starts_at,
    ends_at:
      input.ends_at !== undefined ? input.ends_at?.trim() || null : existing.ends_at,
    updated_at: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `UPDATE notices SET
         title=@title, body=@body, link_url=@link_url, pinned=@pinned,
         published=@published, starts_at=@starts_at, ends_at=@ends_at, updated_at=@updated_at
       WHERE id=@id`
    )
    .run({
      ...updated,
      pinned: updated.pinned ? 1 : 0,
      published: updated.published ? 1 : 0,
    });

  return updated;
}

export function deleteNotice(id: string): boolean {
  const result = getDb().prepare('DELETE FROM notices WHERE id = ?').run(id);
  return result.changes > 0;
}

/**
 * Kakao-facing text. Kakao simpleText is capped, so clamp to
 * top-N notices and a total character budget (default 900).
 */
export function formatNoticesForKakao(
  notices: Notice[],
  maxChars = 900
): string {
  if (notices.length === 0) {
    return (
      '【공지】\n등록된 공지가 없습니다.\n' +
      '관리자에서 공지를 등록하면 여기서 바로 조회됩니다.'
    );
  }

  const head = '【공지】';
  const blocks: string[] = [];
  let used = head.length;

  for (const n of notices) {
    const pin = n.pinned ? '[고정] ' : '';
    const body = n.body.replace(/\s+/g, ' ').trim();
    const summary = body.length > 80 ? body.slice(0, 79) + '…' : body;
    const link = n.link_url ? `\n링크: ${n.link_url}` : '';
    const block = `\n\n· ${pin}${n.title}\n${summary}${link}`;
    if (used + block.length > maxChars) break;
    blocks.push(block);
    used += block.length;
  }

  if (blocks.length === 0) {
    // Single very long notice: keep the title only
    const n = notices[0];
    return `${head}\n\n· ${n.title}`.slice(0, maxChars);
  }

  const omitted = notices.length - blocks.length;
  const tail = omitted > 0 ? `\n\n외 ${omitted}건은 관리자 페이지에서 확인할 수 있습니다.` : '';
  return (head + blocks.join('') + tail).slice(0, maxChars);
}
