import { Router } from 'express';
import {
  createClub,
  deleteClub,
  getClubById,
  listClubs,
  updateClub,
} from '../services/clubStore';
import { reindexAll, reindexClub } from '../services/reindex';
import type { ClubInput } from '../types/club';

export const adminRouter = Router();

function checkAdmin(req: { header: (n: string) => string | undefined }, res: {
  status: (c: number) => { json: (b: unknown) => void };
}): boolean {
  const token = process.env.ADMIN_TOKEN;
  if (!token) return true;
  const got = req.header('x-admin-token');
  if (got !== token) {
    res.status(401).json({ error: 'unauthorized' });
    return false;
  }
  return true;
}

function bodyToInput(body: Record<string, unknown>): ClubInput | null {
  const name = String(body.name ?? '').trim();
  const category = String(body.category ?? '').trim();
  const intro = String(body.intro ?? '').trim();
  const activities = String(body.activities ?? '').trim();
  const source_url = String(body.source_url ?? '').trim();
  if (!name || !category || !intro || !activities || !source_url) return null;
  return {
    name,
    category,
    contact: body.contact == null ? null : String(body.contact),
    meeting_time: body.meeting_time == null ? null : String(body.meeting_time),
    location: body.location == null ? null : String(body.location),
    intro,
    activities,
    source_url,
  };
}

adminRouter.get('/clubs', (req, res) => {
  if (!checkAdmin(req, res)) return;
  res.json({ count: listClubs().length, clubs: listClubs() });
});

adminRouter.get('/clubs/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const club = getClubById(req.params.id);
  if (!club) {
    res.status(404).json({ error: 'club not found' });
    return;
  }
  res.json(club);
});

adminRouter.post('/clubs', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const input = bodyToInput(req.body || {});
  if (!input) {
    res.status(400).json({
      error: 'name, category, intro, activities, source_url are required',
    });
    return;
  }
  const club = createClub(input);
  const reindex = await reindexClub(club.id);
  res.status(201).json({ club, reindex });
});

adminRouter.put('/clubs/:id', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const existing = getClubById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'club not found' });
    return;
  }
  const body = req.body || {};
  const club = updateClub(req.params.id, {
    name: body.name,
    category: body.category,
    contact: body.contact,
    meeting_time: body.meeting_time,
    location: body.location,
    intro: body.intro,
    activities: body.activities,
    source_url: body.source_url,
  });
  const reindex = await reindexClub(req.params.id);
  res.json({ club, reindex });
});

adminRouter.delete('/clubs/:id', (req, res) => {
  if (!checkAdmin(req, res)) return;
  const ok = deleteClub(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'club not found' });
    return;
  }
  res.json({ deleted: true, id: req.params.id });
});

adminRouter.post('/reindex', async (req, res) => {
  if (!checkAdmin(req, res)) return;
  const clubId = req.body?.club_id ? String(req.body.club_id) : null;
  try {
    const result = clubId ? await reindexClub(clubId) : await reindexAll();
    res.json(result);
  } catch (err) {
    console.error('[reindex]', err);
    res.status(500).json({
      error: 'reindex failed',
      message: err instanceof Error ? err.message : String(err),
    });
  }
});
