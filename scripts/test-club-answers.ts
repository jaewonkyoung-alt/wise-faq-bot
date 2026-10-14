/**
 * 동아리 답변 문장 · 임베딩 테스트.
 *  - 답변에 검색 점수 · updated_at 시각 · 출처 주소를 그대로 노출하지 않는다 (10/15 답변 다듬기)
 *  - 물어본 항목이 비면 비었다고 말한다
 *  - 임베딩 서버(Ollama)가 꺼져 있어도 키워드 사전으로 답하고, 기존 벡터를 지우지 않는다
 *  - Ollama 가 켜져 있으면 실제 임베딩(qwen3-embedding)으로 '비슷한 동아리' 안내까지 확인 (없으면 그 부분만 SKIP)
 *
 *   npm run test:club-answers
 */
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
dotenv.config();
// 테스트는 항상 임시 DB · mock 임베딩에서 시작
process.env.DATABASE_PATH = path.join(os.tmpdir(), `wise-test-club-answers-${process.pid}.db`);
process.env.LLM_PROVIDER = 'mock';
process.env.EMBED_PROVIDER = 'mock';
delete process.env.SEMANTIC_MIN_SCORE;

import { getDb } from '../src/db/database';
import { upsertClubByName } from '../src/services/clubStore';
import { ensureEmbeddingsCurrent, reindexAll } from '../src/services/reindex';
import { ask } from '../src/services/askService';
import { sourceLabel } from '../src/services/clubList';
import { buildAskSkillResponse } from '../src/kakao/responseBuilder';
import { embedModelId } from '../src/embeddings/embedder';
import type { ClubInput } from '../src/types/club';

let passed = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (!cond) {
    console.error(`FAIL  ${name}`, extra ?? '');
    throw new Error(`test failed: ${name}`);
  }
  passed += 1;
  console.log(`PASS  ${name}`);
}

const RAW = /검색 점수|updated_at|https?:\/\/|\d{4}-\d{2}-\d{2}T/;
const SOCCER = ['아이보리', '휴(HUE)', 'Warming-Up', 'DOLBBI', '노나매기', '설레발'];

async function main(): Promise<void> {
  getDb();
  const seed = JSON.parse(fs.readFileSync(path.resolve('data/seed/clubs.json'), 'utf-8')) as ClubInput[];
  for (const c of seed) upsertClubByName(c);
  await reindexAll();

  /* 1. 답변 형식 */
  const soccer = await ask('축구 동아리 뭐 있어');
  check('분야 질문: 검색 점수 · 시각 · 주소 노출 없음', !RAW.test(soccer.answer), soccer.answer);
  check('분야 질문: 출처는 이름으로 한 줄', /^출처: .*에브리타임 동아리·학회 게시판 모집 글/m.test(soccer.answer), soccer.answer);
  check('분야가 사전에 걸리면 그 분야 동아리 모두 (축구 6곳)', SOCCER.every((n) => soccer.answer.includes(`【${n}】`)), soccer.answer);
  check('끝에 동아리 이름 보내기 안내', /더 자세히 보려면 동아리 이름을 보내 주세요/.test(soccer.answer));

  const dev = await ask('디벨로퍼 언제 모여?');
  check('이름 질문: 정기 활동 한 줄', /【디벨로퍼】 학술\n.+\n정기 활동: 매주 수/.test(dev.answer), dev.answer);
  check('이름 질문: 주소 대신 "홈페이지 developer2023.com"', dev.answer.includes('출처: 홈페이지 developer2023.com') && !RAW.test(dev.answer), dev.answer);

  const bowl = await ask('돌핀스 언제 모여?');
  check('물어본 항목이 비면 비었다고 말함 (지어내지 않음)', bowl.answer.includes('정기 모임 시간은 아직 확인되지 않았어요'), bowl.answer);

  const out = await ask('학식 메뉴 뭐야');
  check('범위 밖 질문: MVP 같은 개발 용어 없이 안내', out.route === 'refuse' && !/MVP|확인되지 않음/.test(out.answer), out.answer);

  /* 2차 수집 반영 (10/15 에브리타임 모집 글) */
  const kendo = await ask('검선 언제 모여?');
  check('2차 수집: 검선 정기 활동 월·수 18~20시', kendo.answer.includes('정기 활동: 매주 월·수 18~20시'), kendo.answer);
  const sori = await ask('소리창고 연락처');
  check('2차 수집: 연락처에 개인 번호 대신 동아리 인스타', sori.answer.includes('인스타 @sori_box') && !/010-?\d{3,4}-?\d{4}/.test(sori.answer), sori.answer);
  const seedText = fs.readFileSync(path.resolve('data/seed/clubs.json'), 'utf-8');
  check('시드에 휴대폰 번호 없음', !/01[016789]-?\d{3,4}-?\d{4}/.test(seedText));
  check('시드에 연락처 자리표시만 남은 동아리 없음', !seed.some((c) => c.contact === '에브리타임 동아리·학회 게시판 모집 글'));

  /* 활동 미확인 동아리 (학교 옛 목록) */
  const old = await ask('소낙비 동아리 있어?');
  check('활동 미확인 동아리: 옛 목록에만 있다고 안내', old.answer.startsWith('【소낙비】') && old.answer.includes('최근 활동이 확인되지 않아요'), old.answer);
  const party = await ask('파티벅스 아직 있나요');
  check('활동 미확인 동아리: 지금 활동하는 비슷한 동아리 안내 (파티벅스 → MIX)', party.answer.includes('지금 활동하는 비슷한 동아리: MIX'), party.answer);
  const live = await ask('바라밀 동아리 있어?');
  check('활동 중인 동아리는 그대로 답변', live.answer.includes('【바라밀】') && !live.answer.includes('최근 활동이 확인되지 않아요'), live.answer);

  check('출처 이름: 인스타그램', sourceLabel('https://www.instagram.com/dongguk_dolbbi/') === '인스타그램 @dongguk_dolbbi');
  check('출처 이름: 에브리타임', sourceLabel('https://everytime.kr/418785') === '에브리타임 동아리·학회 게시판 모집 글');

  /* 2. 카톡 말풍선: 900자를 넘으면 문단 경계에서 나눔 */
  const long = { ...soccer, answer: Array.from({ length: 8 }, (_, i) => `【동아리${i}】 체육\n${'가'.repeat(180)}`).join('\n\n') };
  const k = buildAskSkillResponse(long, '');
  const texts = k.template.outputs.map((o) => (o as { simpleText: { text: string } }).simpleText.text);
  check('긴 답변은 여러 말풍선 · 각 900자 이하', texts.length >= 2 && texts.every((t) => t.length <= 900), texts.map((t) => t.length));
  check('말풍선이 동아리 소개 중간에서 끊기지 않음', texts.every((t) => t.startsWith('【') && /가$/.test(t)));

  /* 3. 임베딩 서버가 꺼져 있을 때 */
  const before = (getDb().prepare('SELECT COUNT(*) AS n FROM embeddings').get() as { n: number }).n;
  process.env.EMBED_PROVIDER = 'ollama';
  process.env.OLLAMA_URL = 'http://127.0.0.1:9'; // 아무도 듣지 않는 포트
  let threw = false;
  try {
    await ensureEmbeddingsCurrent();
  } catch {
    threw = true;
  }
  const after = (getDb().prepare('SELECT COUNT(*) AS n FROM embeddings').get() as { n: number }).n;
  check('모델이 바뀌면 다시 임베딩 시도 · 실패해도 기존 벡터 보존', threw && after === before, { threw, before, after });
  const down = await ask('축구 동아리 뭐 있어');
  check('Ollama 꺼짐: 키워드 사전으로 축구 동아리 답변', SOCCER.every((n) => down.answer.includes(`【${n}】`)), down.answer);
  const downMiss = await ask('체스 동아리');
  check('Ollama 꺼짐 + 사전에 없는 말: 지어내지 않고 안내', downMiss.citations.length === 0 && /확인하지 못했어요/.test(downMiss.answer), downMiss.answer);

  /* 4. 실제 임베딩 (Ollama 켜져 있을 때만) */
  process.env.OLLAMA_URL = process.env.REAL_OLLAMA_URL || 'http://127.0.0.1:11434';
  const up = await fetch(`${process.env.OLLAMA_URL}/api/tags`).then((r) => r.ok, () => false);
  if (!up) {
    console.log('SKIP  실제 임베딩 — Ollama 없음');
  } else {
    const r = await ensureEmbeddingsCurrent();
    const models = getDb().prepare('SELECT DISTINCT embed_model AS m FROM embeddings').all() as Array<{ m: string }>;
    check('qwen3-embedding 으로 전부 다시 임베딩', !!r && models.length === 1 && models[0].m === embedModelId() && /qwen3-embedding/.test(models[0].m), models);
    check('같은 모델이면 다시 만들지 않음', (await ensureEmbeddingsCurrent()) === null);
    const chess = await ask('체스 동아리');
    check('사전에 없는 말: "딱 맞는 동아리는 확인되지 않았어요" + 비슷한 동아리 (보드게임)',
      chess.answer.startsWith('딱 맞는 동아리는 확인되지 않았어요') && chess.citations[0]?.club_name === 'DICE', chess.answer);
    check('임베딩으로만 고르면 1등과 점수 차가 작은 동아리만 (체스 → 보드게임 하나)', chess.citations.length === 1, chess.citations);
    const car = await ask('자동차 튜닝 동아리');
    check('관계없는 질문은 0.5 미만이라 동아리를 붙이지 않음', car.citations.length === 0, car.answer);
    const star = await ask('천문 관측하는 모임 있어?');
    check('사전에 걸리는 질문은 확정 답변 (푸르체리마)', star.citations[0]?.club_name === '푸르체리마' && !/딱 맞는/.test(star.answer), star.answer);
  }

  console.log(`\nPASS test-club-answers (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
