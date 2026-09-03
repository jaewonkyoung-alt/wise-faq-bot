import dotenv from 'dotenv';
dotenv.config();

import fs from 'fs';
import path from 'path';
import { getDb, closeDb } from '../src/db/database';
import { listClubs } from '../src/services/clubStore';
import { reindexAll } from '../src/services/reindex';
import { ask } from '../src/services/askService';

type Case = {
  id: string;
  question: string;
  expectRoute?: string;
  expectVerified?: boolean;
  expectAnswerIncludes?: string[];
  expectCitationName?: string;
};

async function main() {
  getDb();
  if (listClubs().length === 0) throw new Error('No clubs');
  const emb = getDb().prepare('SELECT COUNT(*) AS c FROM embeddings').get() as { c: number };
  if (emb.c === 0) await reindexAll();
  const casesPath = path.resolve(process.cwd(), 'data/seed/eval-cases.json');
  const cases = JSON.parse(fs.readFileSync(casesPath, 'utf-8')) as Case[];
  let pass = 0;
  for (const c of cases) {
    const result = await ask(c.question);
    const problems: string[] = [];
    if (c.expectRoute && result.route !== c.expectRoute) problems.push('route');
    if (c.expectVerified !== undefined && result.verified !== c.expectVerified) problems.push('verified');
    if (c.expectAnswerIncludes) {
      for (const s of c.expectAnswerIncludes) if (!result.answer.includes(s)) problems.push('text');
    }
    if (c.expectCitationName) {
      if (!result.citations.some((x) => x.club_name.includes(c.expectCitationName!))) problems.push('cite');
    }
    if (problems.length === 0) { pass += 1; console.log('PASS', c.id); }
    else { console.log('FAIL', c.id, problems.join(','), result.route, result.verified); }
  }
  console.log(pass + '/' + cases.length + ' passed');
  closeDb();
  if (pass < cases.length) throw new Error('failed');
}

main().catch((err) => { console.error(err); throw err; });
