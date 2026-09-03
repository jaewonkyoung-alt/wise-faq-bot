/**
 * Simulates Kakao skill slot flow with a fixed user id (session continuity).
 * Starts an ephemeral server if PORT is free; otherwise uses existing BASE_URL.
 */
import dotenv from 'dotenv';
dotenv.config();

import { createApp } from '../src/app';
import { getDb, closeDb } from '../src/db/database';
import {
  listGraduation,
  upsertGraduationByKey,
} from '../src/services/graduationService';
import { clearSession } from '../src/services/kakaoSession';
import fs from 'fs';
import path from 'path';
import type { Server } from 'http';

const USER = 'test-user-grad-slot-001';

function seedIfNeeded(): void {
  if (listGraduation().length > 0) return;
  const seedPath = path.resolve(process.cwd(), 'data/seed/graduation.json');
  const raw = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  for (const item of raw) upsertGraduationByKey(item);
}

function kakaoBody(utterance: string) {
  return {
    userRequest: {
      utterance,
      user: { id: USER, type: 'botUserKey' },
    },
  };
}

async function postSkill(base: string, utterance: string) {
  const res = await fetch(base + '/api/kakao/skill', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(kakaoBody(utterance)),
  });
  const json = await res.json();
  const text = json?.template?.outputs?.[0]?.simpleText?.text || '';
  const qrs = (json?.template?.quickReplies || []).map(
    (q: { label: string }) => q.label
  );
  return { status: res.status, text, qrs };
}

async function main() {
  getDb();
  seedIfNeeded();
  clearSession(USER);

  let server: Server | null = null;
  let base = process.env.BASE_URL || '';
  if (!base) {
    const app = createApp();
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    const addr = server!.address();
    const port = typeof addr === 'object' && addr ? addr.port : 3000;
    base = `http://127.0.0.1:${port}`;
  }

  const steps: Array<{ u: string; expect: RegExp }> = [
    { u: '메뉴', expect: /졸업요건|선택/ },
    { u: '졸업요건', expect: /입학연도|학번/ },
    { u: '2022', expect: /학과|2022/ },
    { u: '컴퓨터공학과', expect: /졸업요건|130|PLACEHOLDER|학점/ },
  ];

  for (const step of steps) {
    const r = await postSkill(base, step.u);
    console.log('---', step.u, '---');
    console.log(r.text.slice(0, 240));
    console.log('quickReplies:', r.qrs.join(', '));
    if (!step.expect.test(r.text)) {
      throw new Error(`unexpected reply for "${step.u}": ${r.text.slice(0, 120)}`);
    }
  }

  // miss path
  clearSession(USER);
  await postSkill(base, '졸업요건');
  await postSkill(base, '2099');
  const miss = await postSkill(base, '컴퓨터공학과');
  if (!/확인되지 않음|데이터 없음/.test(miss.text)) {
    throw new Error('expected miss message: ' + miss.text.slice(0, 120));
  }
  console.log('PASS test-kakao-grad miss+hit');

  if (server) {
    await new Promise<void>((resolve, reject) =>
      server!.close((err) => (err ? reject(err) : resolve()))
    );
  }
  closeDb();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
