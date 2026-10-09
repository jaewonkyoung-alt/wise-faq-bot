/**
 * Simulates Kakao skill slot flow with a fixed user id (session continuity).
 * Starts an ephemeral server if PORT is free; otherwise uses existing BASE_URL.
 */
import dotenv from 'dotenv';
import os from 'os';
import pathMod from 'path';
dotenv.config();
// 운영 DB의 세션·미답변을 건드리지 않도록 경로 지정이 없으면 임시 DB
// 테스트는 항상 임시 DB — .env 의 운영 DATABASE_PATH 를 쓰면 운영 데이터가 섞인다 (10/10 사고)
{
  process.env.DATABASE_PATH = pathMod.join(os.tmpdir(), `wise-test-kakao-grad-${process.pid}.db`);
}

import { createApp } from '../src/app';
import { getDb, closeDb } from '../src/db/database';
import { clearSession } from '../src/services/kakaoSession';
import type { Server } from 'http';

const USER = 'test-user-grad-slot-001';

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
  const outputs = json?.template?.outputs || [];
  const parts: string[] = [];
  for (const o of outputs) {
    if (o?.simpleText?.text) parts.push(o.simpleText.text);
    if (o?.basicCard?.description) parts.push(o.basicCard.description);
    const btns = o?.basicCard?.buttons || o?.listCard?.buttons || [];
    for (const b of btns) {
      if (b?.webLinkUrl) parts.push('PDF_LINK:' + b.webLinkUrl);
      if (b?.label) parts.push('BTN:' + b.label);
    }
  }
  const text = parts.join('\n') || '';
  const qrs = (json?.template?.quickReplies || []).map(
    (q: { label: string }) => q.label
  );
  return { status: res.status, text, qrs, json };
}

async function main() {
  getDb();
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

  // 공식 가이드 기준 — 21학번 컴공은 당시 소속이 "컴퓨터공학전공"
  const steps: Array<{ u: string; expect: RegExp; qr?: string }> = [
    { u: '메뉴', expect: /졸업요건|선택/ },
    { u: '졸업요건', expect: /입학연도|학번/ },
    { u: '2021', expect: /단과대학|학과 이름/ },
    { u: '글로컬에너지대학', expect: /학과|전공/ },
    { u: '컴퓨터공학과', expect: /당시 소속 컴퓨터공학전공[\s\S]*단수전공 63[\s\S]*TOEIC 650[\s\S]*PDF_LINK:https:\/\/wise\.dongguk\.ac\.kr\/resources\/files\/course\/2026\/42\.pdf/, qr: '편입생 기준' },
    { u: '편입생 기준', expect: /편입생 기준[\s\S]*단수전공 54/ },
    { u: '외국인 기준', expect: /외국인 신입생 기준[\s\S]*TOPIK 4급/ },
    { u: '다른 학번', expect: /입학연도/ },
    { u: '2025', expect: /2025학번 · 컴퓨터공학과[\s\S]*57\+모듈1[\s\S]*모의토익/ },
    { u: '다른 학과', expect: /단과대학을 선택하거나 학과 이름/ },
    // 21·22학번 당시 단과대 이름으로도 찾는다
    { u: '과학기술대학', expect: /학과·전공을 선택/, qr: '더보기' },
    { u: '빅데이터응용통계학전공', expect: /빅데이터·응용통계학전공은 2021학번까지만[\s\S]*모집 중단/ },
  ];

  for (const step of steps) {
    const r = await postSkill(base, step.u);
    console.log('---', step.u, '---');
    console.log(r.text.slice(0, 240));
    console.log('quickReplies:', r.qrs.join(', '));
    if (!step.expect.test(r.text)) {
      throw new Error(`unexpected reply for "${step.u}": ${r.text.slice(0, 200)}`);
    }
    if (step.qr && !r.qrs.includes(step.qr)) {
      throw new Error(`missing quick reply "${step.qr}" after "${step.u}": ${r.qrs.join(', ')}`);
    }
  }

  // 단과대 단계에서 학과 옛 이름을 바로 입력
  clearSession(USER);
  await postSkill(base, '졸업요건');
  await postSkill(base, '2021');
  const direct = await postSkill(base, '컴퓨터공학전공');
  if (!/2021학번 · 컴퓨터공학과/.test(direct.text)) {
    throw new Error('expected direct department answer: ' + direct.text.slice(0, 160));
  }

  // 한 문장 질문
  clearSession(USER);
  const oneShot = await postSkill(base, '22학번 정보경영학과 졸업요건');
  if (!/2022학번 · 정보경영학과/.test(oneShot.text)) {
    throw new Error('expected one-shot answer: ' + oneShot.text.slice(0, 160));
  }

  // 기준이 없는 학번: 추측하지 않고 안내
  clearSession(USER);
  await postSkill(base, '졸업요건');
  await postSkill(base, '2019');
  await postSkill(base, '글로컬에너지대학');
  const miss = await postSkill(base, '컴퓨터공학과');
  if (!/개별 심사/.test(miss.text)) {
    throw new Error('expected 2020-before message: ' + miss.text.slice(0, 160));
  }
  // map room code flow
  clearSession(USER);
  const mapPrompt = await postSkill(base, '지도');
  if (!/호실|코드|S504/.test(mapPrompt.text)) {
    throw new Error('expected map prompt: ' + mapPrompt.text.slice(0, 120));
  }
  const mapAns = await postSkill(base, 'S504');
  if (!/자연과학관|5층/.test(mapAns.text)) {
    throw new Error('expected S504 answer: ' + mapAns.text.slice(0, 160));
  }
  console.log('map S504 →', mapAns.text.slice(0, 120));

  console.log('PASS test-kakao-grad miss+hit+map');

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
