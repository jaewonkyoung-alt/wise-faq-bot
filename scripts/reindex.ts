import dotenv from 'dotenv';
dotenv.config();

import { getDb, closeDb } from '../src/db/database';
import { reindexAll } from '../src/services/reindex';

async function main() {
  getDb();
  const result = await reindexAll();
  console.log(JSON.stringify(result, null, 2));
  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
