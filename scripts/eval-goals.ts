/**
 * 제안서 목표 실측 — 논문 평가 장용.
 *   목표 3: 관리자가 고친 내용이 카톡 답변에 반영되기까지 걸리는 시간 (목표 60초 이내)
 *   목표 4: 데이터에 없는 질문에 지어낸 답을 하는 비율 (목표 5% 이하)
 *   목표 6: 카카오 스킬 응답 시간 p50 · p95 (목표 평균 5초 이내, 카카오 제한 5초)
 * 임시 DB · 임시 키워드 사전을 쓰므로 운영 데이터를 바꾸지 않는다. 서버 안쪽 시간만 잰다 (터널 · 카카오 구간 제외).
 *
 *   EMBED_PROVIDER=ollama npx tsx scripts/eval-goals.ts
 */
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
dotenv.config();
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'wise-eval-goals-'));
process.env.DATABASE_PATH = path.join(TMP, 'eval.db');
process.env.CLUB_KEYWORDS_FILE = path.join(TMP, '_keywords.json');
process.env.GRAD_MD_DIR = path.join(TMP, 'md');
fs.copyFileSync(path.resolve('data/kb/동아리/_keywords.json'), process.env.CLUB_KEYWORDS_FILE);
process.env.LLM_PROVIDER = 'mock';
const TOKEN = 'eval-admin-token';
process.env.ADMIN_TOKEN = TOKEN;

import type { Server } from 'http';
import { performance } from 'perf_hooks';
import { createApp } from '../src/app';
import { getDb } from '../src/db/database';
import { listClubs, upsertClubByName } from '../src/services/clubStore';
import { reindexAll } from '../src/services/reindex';
import { importGradCriteria } from '../src/services/gradCriteria';
import { ask } from '../src/services/askService';
import { embedModelId } from '../src/embeddings/embedder';
import type { ClubInput } from '../src/types/club';
import { CLUB_CASES, HELDOUT_CASES } from './eval-clubs';

let base = '';
let userSeq = 0;

async function skill(utterance: string, user = `eval-${++userSeq}`): Promise<{ ms: number; text: string }> {
  const t0 = performance.now();
  const res = await fetch(`${base}/api/kakao/skill`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userRequest: { utterance, user: { id: user, type: 'botUserKey' } } }),
  });
  const json = (await res.json()) as { template?: { outputs?: Array<Record<string, any>> } };
  const ms = performance.now() - t0;
  const parts: string[] = [];
  for (const o of json.template?.outputs ?? []) {
    if (o.simpleText?.text) parts.push(o.simpleText.text);
    if (o.basicCard) parts.push([o.basicCard.title, o.basicCard.description].filter(Boolean).join(' '));
    if (o.textCard) parts.push([o.textCard.title, o.textCard.description].filter(Boolean).join(' '));
    if (o.listCard) parts.push(JSON.stringify(o.listCard));
  }
  return { ms, text: parts.join('\n') };
}

async function admin(method: string, url: string, body?: unknown): Promise<any> {
  const res = await fetch(`${base}/api/admin${url}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-admin-token': TOKEN },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return res.json();
}

function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}
const fmt = (n: number) => (n < 10 ? n.toFixed(1) : Math.round(n).toString());

/* ── 목표 4: 데이터에 없는 질문 ── */
// 수집한 61개 동아리 중 해당 분야가 없는 동아리 질문
const OOD_CLUB = [
  '스키 동아리 있어?', '승마 동아리', '골프 치는 동아리', '체스 동아리', '펜싱 동아리',
  '요트 타는 동아리', '서핑 동아리', '아이스하키 동아리', '바둑 두는 동아리', '마술 동아리',
  '드론 날리는 동아리', '로봇 만드는 동아리', '주식 투자 동아리', '와인 동아리', '코딩 말고 해킹 보안 동아리',
  '뜨개질 동아리', '천주교 동아리', '럭비 동아리', '탁구 동아리', '스쿠버다이빙 동아리',
];
// 이 챗봇이 다루지 않는 학교 정보 (학식 · 기숙사 · 장학 등)
const OOD_CAMPUS = [
  '오늘 학식 메뉴 뭐야', '기숙사 신청 언제까지야', '등록금 납부 기간 알려줘', '국가장학금 신청 방법',
  '수강신청 언제 해?', '휴학 신청은 어떻게 해', '셔틀버스 시간표', '학점 교류 신청', '성적 이의신청 기간', '졸업 가운 대여',
];

async function goalOod(): Promise<void> {
  console.log('\n■ 목표 4 — 데이터에 없는 질문 (지어낸 답 = 없는 동아리를 있다고 하거나 확인되지 않은 정보를 단정)');
  // 거절: 찾지 못했다고 답함 · 고지 후 추천: "딱 맞는 동아리는 확인되지 않았어요" 를 먼저 밝히고 비슷한 동아리를 보여 줌
  // 단정 오답: 없는 분야인데 특정 동아리를 그 분야 동아리처럼 답함 (= 지어낸 답)
  let wrong = 0;
  let disclosed = 0;
  for (const q of OOD_CLUB) {
    const r = await ask(q);
    const kind = !r.verified || r.citations.length === 0 ? '거절' : /확인되지 않았/.test(r.answer) ? '고지 후 추천' : '단정 오답';
    if (kind === '단정 오답') wrong += 1;
    if (kind === '고지 후 추천') disclosed += 1;
    const names = r.citations.slice(0, 3).map((c) => c.club_name).join(', ');
    console.log(`${kind === '단정 오답' ? 'X' : 'O'}  ${q.padEnd(22)} ${kind}${names ? ` → ${names}` : ''}`);
  }
  for (const q of OOD_CAMPUS) {
    const { text } = await skill(q);
    const first = text.split('\n')[0];
    // 메뉴 안내 · "찾지 못했습니다" 류면 지어내지 않은 것. 동아리를 단정해 답하면 오답.
    const asserted = /【동아리】|동아리를 찾았|정기 모임/.test(text) && !/찾지 못|확인되지|없습니다/.test(text);
    if (asserted) wrong += 1;
    console.log(`${asserted ? 'X' : 'O'}  ${q.padEnd(22)} ${first.slice(0, 70)}`);
  }
  const n = OOD_CLUB.length + OOD_CAMPUS.length;
  console.log(`단정 오답 ${wrong} / ${n} (${((wrong / n) * 100).toFixed(1)}%) · 고지 후 추천 ${disclosed} · 거절 ${n - wrong - disclosed}`);
}

/* ── 목표 6: 응답 시간 ── */
async function goalLatency(): Promise<void> {
  console.log('\n■ 목표 6 — 카카오 스킬 응답 시간 (서버 안쪽, ms)');
  const groups: Record<string, string[]> = {
    졸업요건: [
      '21학번 컴퓨터공학과 졸업요건', '22학번 경영학과 졸업학점', '23학번 간호학과 졸업요건', '24학번 경찰행정학과 졸업요건',
      '25학번 식품생명공학과 졸업요건', '20학번 불교학부 졸업요건', '21학번 정보경영학과 졸업요건', '22학번 의생명공학과 졸업요건',
      '23학번 사회복지학과 졸업요건', '24학번 컴공 졸업요건',
    ],
    지도: ['S504', 'A101', 'D201', 'N305', 'H107', '도서관 어디야', '기숙사', '학생회관 어디야', '본관 어디야', '체육관 어디야'],
    동아리: [...CLUB_CASES, ...HELDOUT_CASES].map(([q]) => (/동아리/.test(q) ? q : `${q} 동아리`)),
    '메뉴·공지': ['메뉴', '공지', '졸업요건', '동아리', '지도', '공지 알림 받기', '공지 알림 끄기', '안녕', '처음으로', '도움말'],
  };
  await skill('별 보는 동아리 있어?'); // 예열 (서버는 시작할 때 모델을 올려 둔다)
  const all: number[] = [];
  for (const [name, qs] of Object.entries(groups)) {
    const ms: number[] = [];
    for (const q of qs) ms.push((await skill(q)).ms);
    all.push(...ms);
    const avg = ms.reduce((a, b) => a + b, 0) / ms.length;
    console.log(`${name.padEnd(6)} ${String(ms.length).padStart(3)}건  평균 ${fmt(avg)}  p50 ${fmt(pct(ms, 50))}  p95 ${fmt(pct(ms, 95))}  최대 ${fmt(Math.max(...ms))}`);
  }
  const avg = all.reduce((a, b) => a + b, 0) / all.length;
  console.log(`전체   ${String(all.length).padStart(3)}건  평균 ${fmt(avg)}  p50 ${fmt(pct(all, 50))}  p95 ${fmt(pct(all, 95))}  최대 ${fmt(Math.max(...all))}`);
}

/* ── 목표 3: 관리자 수정 → 카톡 반영 ── */
async function timeUntil(label: string, change: () => Promise<unknown>, q: string, want: RegExp): Promise<void> {
  const t0 = performance.now();
  await change();
  const tSaved = performance.now();
  for (let i = 0; i < 100; i += 1) {
    const { text } = await skill(q);
    if (want.test(text)) {
      const t1 = performance.now();
      console.log(`${label.padEnd(26)} 저장 ${fmt(tSaved - t0)}ms · 저장~카톡 반영 ${fmt(t1 - tSaved)}ms · 합계 ${fmt(t1 - t0)}ms (질문 ${i + 1}회)`);
      return;
    }
  }
  console.log(`${label.padEnd(26)} 반영 안 됨`);
}

async function goalReflect(): Promise<void> {
  console.log('\n■ 목표 3 — 관리자 저장 후 같은 질문을 다시 보냈을 때 반영까지');
  const club = listClubs().find((c) => c.name === '검선')!;
  await timeUntil('동아리 정기 모임 시간 수정', () => admin('PUT', `/clubs/${club.id}`, { meeting_time: '매주 화 · 목 18시 (측정)' }), '검선 정기 모임 시간 알려줘', /화 · 목 18시 \(측정\)/);
  await timeUntil('동아리 소개 수정 (재임베딩)', () => admin('PUT', `/clubs/${club.id}`, { intro: '검도를 배우는 동아리. 죽도 · 호구 대여, 펜싱 체험도 함께 한다.' }), '펜싱 체험 동아리', /검선/);
  await timeUntil('키워드 사전 추가', () => admin('POST', '/clubs/keywords', { words: '칼싸움', field: '검도' }), '칼싸움 동아리', /검선/);
  await timeUntil('공지 등록', () => admin('POST', '/notices', { title: '측정용 장학금 공지', body: '본문' }), '공지', /측정용 장학금 공지/);
}

async function main(): Promise<void> {
  getDb();
  importGradCriteria(true);
  for (const c of JSON.parse(fs.readFileSync(path.resolve('data/seed/clubs.json'), 'utf-8')) as ClubInput[]) upsertClubByName(c);
  const idx = await reindexAll();
  console.log(`동아리 ${idx.clubs} · 벡터 ${idx.chunks}조각 (${embedModelId()}) · Node ${process.version} · ${os.cpus()[0].model} · RAM ${Math.round(os.totalmem() / 2 ** 30)}GB`);

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === 'object' && addr ? addr.port : 0}`;
  try {
    await goalLatency();
    await goalOod();
    await goalReflect();
  } finally {
    server.close();
    fs.rmSync(TMP, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
