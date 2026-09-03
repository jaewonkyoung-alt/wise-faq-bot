import { getDb } from '../db/database';
import { embedText } from '../embeddings/embedder';
import { listClubs, getClubById } from './clubStore';
import type { Club } from '../types/club';

export interface ReindexResult {
  clubs: number;
  chunks: number;
  ms: number;
  provider: string;
}

type ChunkKind = 'intro' | 'activities' | 'combined';

function chunksForClub(club: Club): Array<{ kind: ChunkKind; text: string }> {
  const combined = ['name: ' + club.name, 'category: ' + club.category, club.intro, club.activities]
    .filter(Boolean)
    .join('\n');
  const out: Array<{ kind: ChunkKind; text: string }> = [
    { kind: 'intro', text: club.name + '. ' + club.intro },
    { kind: 'activities', text: club.name + ' activities: ' + club.activities },
    { kind: 'combined', text: combined },
  ];
  return out.filter((c) => c.text.trim().length > 0);
}

async function embedClub(club: Club): Promise<number> {
  const db = getDb();
  db.prepare('DELETE FROM embeddings WHERE club_id = ?').run(club.id);
  const insert = db.prepare(
    `INSERT INTO embeddings (club_id, chunk_kind, chunk_text, embedding_json, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  const now = new Date().toISOString();
  let count = 0;
  for (const chunk of chunksForClub(club)) {
    const vec = await embedText(chunk.text);
    insert.run(club.id, chunk.kind, chunk.text, JSON.stringify(vec), now);
    count += 1;
  }
  return count;
}

export async function reindexAll(): Promise<ReindexResult> {
  const started = Date.now();
  const clubs = listClubs();
  let chunks = 0;
  for (const club of clubs) {
    chunks += await embedClub(club);
  }
  const { getEmbedProvider } = await import('../embeddings/embedder');
  return { clubs: clubs.length, chunks, ms: Date.now() - started, provider: getEmbedProvider() };
}

export async function reindexClub(clubId: string): Promise<ReindexResult> {
  const started = Date.now();
  const club = getClubById(clubId);
  if (!club) {
    return { clubs: 0, chunks: 0, ms: Date.now() - started, provider: 'none' };
  }
  const chunks = await embedClub(club);
  const { getEmbedProvider } = await import('../embeddings/embedder');
  return { clubs: 1, chunks, ms: Date.now() - started, provider: getEmbedProvider() };
}
