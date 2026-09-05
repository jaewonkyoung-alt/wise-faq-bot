import type { Request, Response } from 'express';

/**
 * Shared ADMIN_TOKEN gate for /api/admin/* and /api/unanswered.
 * Fail-closed: empty ADMIN_TOKEN → 401 admin_token_not_configured.
 * Header: x-admin-token
 */
export function checkAdmin(
  req: Pick<Request, 'header'>,
  res: Pick<Response, 'status'>
): boolean {
  const token = (process.env.ADMIN_TOKEN || '').trim();
  if (!token) {
    res.status(401).json({ error: 'admin_token_not_configured' });
    return false;
  }
  const got = req.header('x-admin-token');
  if (got !== token) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}
