import { randomUUID } from 'crypto';
import { getDb } from '../db/database';
import type { Club, ClubInput } from '../types/club';

function rowToClub(row: Record<string, unknown>): Club {
  return {
    id: String(row.id),
    name: String(row.name),
    category: String(row.category),
    contact: row.contact == null ? null : String(row.contact),
    meeting_time: row.meeting_time == null ? null : String(row.meeting_time),
    location: row.location == null ? null : String(row.location),
    intro: String(row.intro ?? ''),
    summary: String(row.summary ?? ''),
    activities: String(row.activities ?? ''),
    source_url: String(row.source_url),
    updated_at: String(row.updated_at),
    created_at: String(row.created_at),
  };
}

export function listClubs(): Club[] {
  const rows = getDb()
    .prepare('SELECT * FROM clubs ORDER BY category, name')
    .all() as Record<string, unknown>[];
  return rows.map(rowToClub);
}

export function getClubById(id: string): Club | undefined {
  const row = getDb()
    .prepare('SELECT * FROM clubs WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToClub(row) : undefined;
}

export function findClubsByName(name: string): Club[] {
  const q = `%${name}%`;
  const rows = getDb()
    .prepare('SELECT * FROM clubs WHERE name LIKE ? COLLATE NOCASE ORDER BY name')
    .all(q) as Record<string, unknown>[];
  return rows.map(rowToClub);
}

export function findClubsByCategory(category: string): Club[] {
  const q = `%${category}%`;
  const rows = getDb()
    .prepare(
      'SELECT * FROM clubs WHERE category LIKE ? COLLATE NOCASE ORDER BY name'
    )
    .all(q) as Record<string, unknown>[];
  return rows.map(rowToClub);
}

export function createClub(input: ClubInput): Club {
  const now = new Date().toISOString();
  const club: Club = {
    id: randomUUID(),
    name: input.name.trim(),
    category: input.category.trim(),
    contact: input.contact?.trim() || null,
    meeting_time: input.meeting_time?.trim() || null,
    location: input.location?.trim() || null,
    intro: input.intro.trim(),
    summary: input.summary?.trim() || '',
    activities: input.activities.trim(),
    source_url: input.source_url.trim(),
    updated_at: now,
    created_at: now,
  };
  getDb()
    .prepare(
      `INSERT INTO clubs
      (id, name, category, contact, meeting_time, location, intro, summary, activities, source_url, updated_at, created_at)
      VALUES (@id, @name, @category, @contact, @meeting_time, @location, @intro, @summary, @activities, @source_url, @updated_at, @created_at)`
    )
    .run(club);
  return club;
}

export function updateClub(id: string, input: Partial<ClubInput>): Club | undefined {
  const existing = getClubById(id);
  if (!existing) return undefined;

  const updated: Club = {
    ...existing,
    name: input.name?.trim() ?? existing.name,
    category: input.category?.trim() ?? existing.category,
    contact:
      input.contact !== undefined
        ? input.contact?.trim() || null
        : existing.contact,
    meeting_time:
      input.meeting_time !== undefined
        ? input.meeting_time?.trim() || null
        : existing.meeting_time,
    location:
      input.location !== undefined
        ? input.location?.trim() || null
        : existing.location,
    intro: input.intro?.trim() ?? existing.intro,
    summary: input.summary != null ? input.summary.trim() : existing.summary,
    activities: input.activities?.trim() ?? existing.activities,
    source_url: input.source_url?.trim() ?? existing.source_url,
    updated_at: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `UPDATE clubs SET
        name=@name, category=@category, contact=@contact, meeting_time=@meeting_time,
        location=@location, intro=@intro, summary=@summary, activities=@activities, source_url=@source_url,
        updated_at=@updated_at
      WHERE id=@id`
    )
    .run(updated);

  return updated;
}

export function deleteClub(id: string): boolean {
  const result = getDb().prepare('DELETE FROM clubs WHERE id = ?').run(id);
  return result.changes > 0;
}

export function upsertClubByName(input: ClubInput): Club {
  const existing = findClubsByName(input.name).find(
    (c) => c.name.toLowerCase() === input.name.trim().toLowerCase()
  );
  if (existing) {
    return updateClub(existing.id, input)!;
  }
  return createClub(input);
}
