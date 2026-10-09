/**
 * 공식 졸업기준을 다시 적재한다 (data/graduation-source/*.json → DB, 기존 내용 교체).
 * 엑셀을 고친 뒤: python3 tools/grad-extract/export_json.py && npm run import:graduation
 */
import dotenv from 'dotenv';
dotenv.config();

import { closeDb, getDbPath } from '../src/db/database';
import { countCriteria, importGradCriteria } from '../src/services/gradCriteria';

const n = importGradCriteria(true);
const { departments, rows } = countCriteria();
console.log(`imported ${n} rows → ${getDbPath()} (${departments} departments, ${rows} rows)`);
closeDb();
