import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { createApp } from './app';
import { getDb, getDbPath } from './db/database';
import { listClubs } from './services/clubStore';
import { reindexAll } from './services/reindex';
import { createLlmProvider } from './llm/provider';
import { getEmbedProvider } from './embeddings/embedder';
import {
  listGraduation,
  upsertGraduationByKey,
} from './services/graduationService';

const PORT = Number(process.env.PORT) || 3000;

async function ensureClubsSeeded(): Promise<void> {
  getDb();
  const clubs = listClubs();
  if (clubs.length > 0) {
    const row = getDb()
      .prepare('SELECT COUNT(*) AS c FROM embeddings')
      .get() as { c: number };
    if (row.c === 0) {
      console.log('[wise-faq-bot] embeddings empty — reindexing…');
      const result = await reindexAll();
      console.log(
        `[wise-faq-bot] reindex: ${result.clubs} clubs, ${result.chunks} chunks in ${result.ms}ms (${result.provider})`
      );
    }
    return;
  }

  const seedPath = path.resolve(process.cwd(), 'data/seed/clubs.json');
  if (!fs.existsSync(seedPath)) {
    console.warn('[wise-faq-bot] no clubs and no seed file at', seedPath);
    return;
  }

  console.log('[wise-faq-bot] seeding clubs from', seedPath);
  const { upsertClubByName } = await import('./services/clubStore');
  const raw = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as Array<{
    name: string;
    category: string;
    contact?: string;
    meeting_time?: string;
    location?: string;
    intro: string;
    activities: string;
    source_url: string;
  }>;
  for (const item of raw) {
    upsertClubByName(item);
  }
  const result = await reindexAll();
  console.log(
    `[wise-faq-bot] seeded+reindex: ${result.clubs} clubs, ${result.chunks} chunks in ${result.ms}ms`
  );
}

function ensureGraduationSeeded(): void {
  getDb();
  if (listGraduation().length > 0) return;

  const seedPath = path.resolve(process.cwd(), 'data/seed/graduation.json');
  if (!fs.existsSync(seedPath)) {
    console.warn('[wise-faq-bot] no graduation seed at', seedPath);
    return;
  }
  console.log('[wise-faq-bot] seeding graduation placeholders from', seedPath);
  const raw = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as Array<{
    admission_year: number;
    department: string;
    major_type?: string;
    total_credits?: number;
    major_credits?: number;
    general_credits?: number;
    notes?: string;
    source_url?: string;
    verified_at?: string;
  }>;
  for (const item of raw) {
    upsertGraduationByKey(item);
  }
  console.log(
    `[wise-faq-bot] graduation rows: ${listGraduation().length} (PLACEHOLDER)`
  );
}

async function main() {
  await ensureClubsSeeded();
  ensureGraduationSeeded();

  const app = createApp();
  const clubs = listClubs().length;
  const grads = listGraduation().length;

  app.listen(PORT, () => {
    console.log(`[wise-faq-bot] Phase-1: graduation (primary) + clubs`);
    console.log(`[wise-faq-bot] db: ${getDbPath()}`);
    console.log(
      `[wise-faq-bot] llm=${createLlmProvider().name} embed=${getEmbedProvider()} clubs=${clubs} graduation=${grads}`
    );
    console.log(`[wise-faq-bot] listening on http://localhost:${PORT}`);
    console.log(`[wise-faq-bot] health:      GET /health`);
    console.log(`[wise-faq-bot] graduation:  GET /api/graduation`);
    console.log(`[wise-faq-bot] ask:         POST /api/ask`);
    console.log(`[wise-faq-bot] admin:       GET /admin`);
    console.log(`[wise-faq-bot] kakao:       POST /api/kakao/skill`);
  });
}

main().catch((err) => {
  console.error('[wise-faq-bot] fatal', err);
  process.exit(1);
});
