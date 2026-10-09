import dotenv from 'dotenv';
dotenv.config();

import { getDb, closeDb } from '../src/db/database';
import { listClubs } from '../src/services/clubStore';
import { reindexAll } from '../src/services/reindex';
import { ask } from '../src/services/askService';

async function main() {
  getDb();
  if (listClubs().length === 0) throw new Error('no clubs');
  const emb = getDb().prepare('SELECT COUNT(*) AS c FROM embeddings').get() as { c: number };
  if (emb.c === 0) await reindexAll();
  const r1 = await ask("디벨로퍼 연락처");
  const r2 = await ask("밴드 공연하는 동아리 활동 알려줘");
  const r3 = await ask("장학금 신청 방법");
  console.log('--- structured ---');
  console.log(r1.route, r1.verified, r1.answer.slice(0, 200));
  console.log('--- semantic ---');
  console.log(r2.route, r2.verified, r2.answer.slice(0, 200));
  console.log('--- refuse ---');
  console.log(r3.route, r3.verified, r3.answer.slice(0, 200));
  closeDb();
}

main().catch((err) => { console.error(err); throw err; });
