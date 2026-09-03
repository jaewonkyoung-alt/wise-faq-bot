import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { getDb, closeDb } from '../src/db/database';
import { upsertClubByName, listClubs } from '../src/services/clubStore';
import { reindexAll } from '../src/services/reindex';

async function main() {
  getDb();
  const seedPath = path.resolve(process.cwd(), 'data/seed/clubs.json');
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
    const club = upsertClubByName(item);
    console.log('upsert', club.name, club.id);
  }

  const result = await reindexAll();
  console.log('reindex', result);
  console.log('total clubs', listClubs().length);
  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
