import { getDb } from '../db/database';
import { embedBatch, embedModelId, getEmbedProvider } from '../embeddings/embedder';
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
  // 한두 줄 소개(summary)가 무슨 동아리인지 가장 잘 말해 준다 — 모든 조각 앞에 붙인다.
  const head = [club.name + ` (${club.category})`, club.summary].filter(Boolean).join(' — ');
  const combined = [head, club.intro, club.activities].filter(Boolean).join('\n');
  const out: Array<{ kind: ChunkKind; text: string }> = [
    { kind: 'intro', text: head + '\n' + club.intro },
    { kind: 'activities', text: head + '\n활동: ' + club.activities },
    { kind: 'combined', text: combined },
  ];
  return out.filter((c) => c.text.trim().length > 0);
}

async function embedClub(club: Club): Promise<number> {
  const db = getDb();
  const chunks = chunksForClub(club);
  const vecs = await embedBatch(chunks.map((c) => c.text)); // 실패하면 기존 벡터를 지우기 전에 멈춘다
  const insert = db.prepare(
    `INSERT INTO embeddings (club_id, chunk_kind, chunk_text, embedding_json, embed_model, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const now = new Date().toISOString();
  const model = embedModelId();
  db.transaction(() => {
    db.prepare('DELETE FROM embeddings WHERE club_id = ?').run(club.id);
    chunks.forEach((chunk, i) => insert.run(club.id, chunk.kind, chunk.text, JSON.stringify(vecs[i]), model, now));
  })();
  return chunks.length;
}

export async function reindexAll(): Promise<ReindexResult> {
  const started = Date.now();
  const clubs = listClubs();
  let chunks = 0;
  for (const club of clubs) {
    chunks += await embedClub(club);
  }
  return { clubs: clubs.length, chunks, ms: Date.now() - started, provider: getEmbedProvider() };
}

export async function reindexClub(clubId: string): Promise<ReindexResult> {
  const started = Date.now();
  const club = getClubById(clubId);
  if (!club) {
    return { clubs: 0, chunks: 0, ms: Date.now() - started, provider: 'none' };
  }
  const chunks = await embedClub(club);
  return { clubs: 1, chunks, ms: Date.now() - started, provider: getEmbedProvider() };
}

/**
 * 시작할 때: 저장된 벡터가 지금 임베딩 모델로 만든 것이 아니거나 빠진 동아리가 있으면 전체를 다시 만든다.
 * (mock 256차원 → qwen3-embedding 1024차원으로 바꿨을 때 등)
 */
export async function ensureEmbeddingsCurrent(): Promise<ReindexResult | null> {
  const db = getDb();
  const model = embedModelId();
  const stale = (db.prepare('SELECT COUNT(*) AS n FROM embeddings WHERE embed_model != ?').get(model) as { n: number }).n;
  const missing = (
    db.prepare('SELECT COUNT(*) AS n FROM clubs c WHERE NOT EXISTS (SELECT 1 FROM embeddings e WHERE e.club_id = c.id)').get() as { n: number }
  ).n;
  if (stale === 0 && missing === 0) return null;
  return reindexAll();
}
