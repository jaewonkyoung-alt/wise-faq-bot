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
import { listGraduation } from './services/graduationService';
import { countCriteria, importGradCriteria } from './services/gradCriteria';

const PORT = Number(process.env.PORT) || 3000;

async function ensureClubsSeeded(): Promise<void> {
  getDb();
  // 4주차까지 쓰던 가상 예시 동아리(연락처가 @example.)는 지우고 실제 수집본(data/seed/clubs.json)으로 채운다
  const { deleteClub } = await import('./services/clubStore');
  const samples = listClubs().filter((c) => (c.contact || '').includes('@example.'));
  for (const c of samples) deleteClub(c.id);
  if (samples.length) console.log(`[wise-faq-bot] removed ${samples.length} sample clubs`);
  const clubs = listClubs();
  // 한두 줄 소개가 비어 있는 동아리는 시드의 소개로 채운다 (10/10 summary 칼럼 추가 이전 DB) — 관리자가 쓴 값은 덮지 않음
  const seedFile = path.resolve(process.cwd(), 'data/seed/clubs.json');
  if (clubs.length > 0 && fs.existsSync(seedFile)) {
    const { updateClub } = await import('./services/clubStore');
    const seed = JSON.parse(fs.readFileSync(seedFile, 'utf-8')) as Array<{ name: string; summary?: string }>;
    const byName = new Map(seed.map((x) => [x.name, x.summary || '']));
    let filled = 0;
    for (const c of clubs) {
      const s = byName.get(c.name);
      if (!c.summary && s) {
        updateClub(c.id, { summary: s });
        filled += 1;
      }
    }
    if (filled) console.log(`[wise-faq-bot] filled summary for ${filled} clubs`);
  }
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
    summary?: string;
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

/**
 * 공식 졸업기준(가이드 42개 학과)을 적재한다. 예전 DB에 남은 [PLACEHOLDER] 예시 행은 지운다
 * — 공식 데이터가 있는데 가짜 값이 답변에 섞이지 않도록.
 */
function ensureGraduationCriteria(): void {
  getDb();
  const removed = getDb()
    .prepare(`DELETE FROM graduation_requirements WHERE notes LIKE '%[PLACEHOLDER]%'`)
    .run().changes;
  if (removed > 0) console.log(`[wise-faq-bot] removed ${removed} placeholder graduation rows`);
  const imported = importGradCriteria(false);
  const { departments, rows } = countCriteria();
  console.log(
    `[wise-faq-bot] graduation criteria: ${departments} departments, ${rows} rows${imported ? ' (imported)' : ''}`
  );
}

async function main() {
  await ensureClubsSeeded();
  ensureGraduationCriteria();

  const app = createApp();
  const clubs = listClubs().length;
  const grads = countCriteria().departments + listGraduation().length;

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
