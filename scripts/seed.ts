import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { getDb, closeDb } from '../src/db/database';
import { upsertClubByName, listClubs } from '../src/services/clubStore';
import { reindexAll } from '../src/services/reindex';
import {
  listGraduation,
  upsertGraduationByKey,
} from '../src/services/graduationService';

async function seedClubs() {
  const seedPath = path.resolve(process.cwd(), 'data/seed/clubs.json');
  if (!fs.existsSync(seedPath)) {
    console.warn('no clubs seed at', seedPath);
    return;
  }
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
    console.log('upsert club', club.name, club.id);
  }

  const result = await reindexAll();
  console.log('reindex', result);
  console.log('total clubs', listClubs().length);
}

function seedGraduation() {
  const seedPath = path.resolve(process.cwd(), 'data/seed/graduation.json');
  if (!fs.existsSync(seedPath)) {
    console.warn('no graduation seed at', seedPath);
    return;
  }
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
    const row = upsertGraduationByKey(item);
    console.log(
      'upsert grad',
      row.admission_year,
      row.department,
      row.major_type,
      row.id
    );
  }
  console.log('total graduation rows', listGraduation().length);
}

async function main() {
  getDb();
  await seedClubs();
  seedGraduation();
  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
