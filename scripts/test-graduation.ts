import dotenv from 'dotenv';
import os from 'os';
dotenv.config();
// 관리자 수동 등록 경로 테스트 — 예시(PLACEHOLDER) 시드를 쓰므로 운영 DB가 아닌 임시 DB에서
if (!process.env.DATABASE_PATH) {
  process.env.DATABASE_PATH = require('path').join(os.tmpdir(), `wise-test-graduation-${process.pid}.db`);
}

import fs from 'fs';
import path from 'path';
import { getDb, closeDb } from '../src/db/database';
import {
  listGraduation,
  lookupGraduation,
  parseAdmissionYear,
  upsertGraduationByKey,
  formatGraduationMiss,
  formatGraduationAnswer,
} from '../src/services/graduationService';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error('ASSERT: ' + msg);
}

function seedIfNeeded(): void {
  const seedPath = path.resolve(process.cwd(), 'data/seed/graduation.json');
  const raw = JSON.parse(fs.readFileSync(seedPath, 'utf-8')) as Array<{
    admission_year: number;
    department: string;
    major_type?: string;
    total_credits?: number;
    major_credits?: number;
    general_credits?: number;
    thesis_required?: boolean | null;
    english_requirement?: string | null;
    license_requirement?: string | null;
    track?: string | null;
    notes?: string;
    source_url?: string;
    verified_at?: string;
  }>;
  for (const item of raw) upsertGraduationByKey(item);
}

function main(): void {
  getDb();
  seedIfNeeded();

  assert(parseAdmissionYear('2022') === 2022, 'parse 2022');
  assert(parseAdmissionYear('22학번') === 2022, 'parse 22학번');
  assert(parseAdmissionYear('2022년 입학') === 2022, 'parse 2022년');
  assert(parseAdmissionYear('hello') === null, 'parse miss');

  const hit = lookupGraduation(2022, '컴퓨터공학과');
  assert(!!hit, 'lookup hit');
  assert(hit!.total_credits === 130, 'hit credits from DB');
  assert((hit!.notes || '').includes('PLACEHOLDER'), 'placeholder marked');
  const ans = formatGraduationAnswer(hit!);
  assert(ans.includes('130'), 'answer has credits');
  assert(ans.includes('source_url') || ans.includes('http'), 'answer has source');
  assert(hit!.thesis_required === true, 'thesis flag from DB');
  assert(ans.includes('졸업논문/작품'), 'answer shows thesis line');
  assert((hit!.track || '').length > 0, 'track stored');
  assert(ans.includes('트랙'), 'answer shows track line');

  const miss = lookupGraduation(2099, '존재하지않는학과');
  assert(!miss, 'lookup miss');
  const missText = formatGraduationMiss(2099, '존재하지않는학과');
  assert(missText.includes('확인되지 않음') || missText.includes('데이터 없음'), 'miss message');

  console.log('PASS test-graduation', {
    rows: listGraduation().length,
    hit: hit!.department,
    missOk: true,
  });
  closeDb();
}

main();
