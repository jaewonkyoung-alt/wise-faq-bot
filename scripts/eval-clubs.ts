/**
 * 동아리 검색 평가 — 실제 수집 데이터(data/seed/clubs.json) 기준.
 * 질문은 에브리타임 동아리 게시판에서 학생들이 실제로 물어본 형태를 바탕으로 만들었다.
 * 첫 번째 출처(가장 높은 근거)가 기대 동아리 중 하나면 정답.
 *
 *   npm run eval:clubs                 # 임시 DB, 현재 검색 방식
 *   CLUBS_SEED=경로 npm run eval:clubs # 다른 시드로 비교
 */
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
dotenv.config();
process.env.DATABASE_PATH = path.join(os.tmpdir(), `wise-eval-clubs-${process.pid}.db`);
process.env.LLM_PROVIDER = process.env.LLM_PROVIDER || 'mock';

import { getDb } from '../src/db/database';
import { upsertClubByName } from '../src/services/clubStore';
import { reindexAll } from '../src/services/reindex';
import { ask } from '../src/services/askService';

export const CLUB_CASES: Array<[string, string[]]> = [
  ['별 보는 동아리 있어?', ['푸르체리마']],
  ['코딩 동아리 추천해줘', ['디벨로퍼']],
  ['게임 개발 IT 동아리 있나요', ['디벨로퍼']],
  ['창업 동아리 없어졌나요', ['무빙']],
  ['볼링 동아리', ['D.U.B.C']],
  ['테니스 치는 동아리', ['DUTC']],
  ['배구 동아리 활동 시간', ['DUV']],
  ['악기 못 다뤄도 밴드 동아리 들어갈 수 있나요', ['동국음악회', '뮤토피아', '바라밀', '세븐글라스', '소리창고', '솔메리아']],
  ['사진 찍는 동아리', ['셔터', 'CLIP']],
  ['춤 추는 동아리 있어?', ['유로스', '온']],
  ['봉사시간 채울 수 있는 동아리', ['RCY', '로타랙트', '한울회', '불교학생회', 'LOHOS', '어깨동무', '햇발']],
  ['수영 동아리', ['마린']],
  ['주짓수 배우고 싶어', ['흑대무도']],
  ['유도 동아리는 행경만 되나요', ['무도']],
  ['책 읽는 동아리', ['등화가친']],
  ['보드게임 동아리', ['DICE']],
  ['맛집 다니는 동아리', ['HYGGE']],
  ['축구 동아리 뭐 있어', ['아이보리', '휴(HUE)', 'Warming-Up', 'DOLBBI', '노나매기', '설레발']],
  ['검도 동아리', ['검선']],
  ['활 쏘는 동아리', ['동궁']],
  ['등산이나 클라이밍 동아리', ['동국산악부']],
  ['연극 동아리', ['동국연극회']],
  ['랩 하는 동아리', ['힙합가', 'B.U.C']],
  ['만화 애니 좋아하는 사람 동아리', ['또다른이야기']],
  ['차 마시는 동아리', ['서라벌 다우회']],
  ['태권도 동아리', ['화랑선무부']],
  ['롤 같이 할 이스포츠 동아리', ['WASD']],
  ['야구 동아리', ['동국 애슬레틱스', '덕아웃']],
  ['그림 그리는 동아리', ['팔레트']],
  ['기독교 동아리', ['CCC']],
];

/** 사전을 만든 뒤에 새로 쓴 질문 — 사전 튜닝에 쓰지 않는다 (과적합 확인용) */
export const HELDOUT_CASES: Array<[string, string[]]> = [
  ['천문 관측하는 모임 있어?', ['푸르체리마']],
  ['프로그래밍 공부하는 동아리', ['디벨로퍼']],
  ['기타 치는 동아리 들어가고 싶어', ['동국음악회', '뮤토피아', '바라밀', '세븐글라스', '소리창고', '솔메리아']],
  ['스트릿댄스 동아리', ['유로스', '온']],
  ['적십자 봉사 동아리', ['RCY']],
  ['농구 하는 동아리', ['돌핀스', '동국농구부']],
  ['배드민턴 치고 싶어', ['동국배드민턴']],
  ['풋살 동아리', ['Warming-Up']],
  ['독서 모임', ['등화가친']],
  ['카메라 들고 출사 가는 동아리', ['셔터', 'CLIP']],
  ['웹툰 좋아하는 동아리', ['또다른이야기']],
  ['명상이나 불교 동아리', ['불교학생회']],
  ['격투기 동아리', ['무혼', '흑대무도']],
  ['노래 부르는 동아리', ['B.U.C', '뮤토피아']],
  ['보드게임 카페 가는 동아리', ['DICE']],
  ['등산 동아리', ['동국산악부']],
  ['패션 좋아하는 사람 동아리', ['피팅룸']],
  ['야구 직관 같이 갈 동아리', ['덕아웃']],
  ['다도 동아리', ['서라벌 다우회']],
  ['볼링 치는 모임', ['D.U.B.C']],
];

async function runCases(title: string, cases: Array<[string, string[]]>): Promise<number> {
  console.log(`── ${title}`);
  let hit = 0;
  for (const [q, want] of cases) {
    const r = await ask(q);
    const top = r.citations[0]?.club_name ?? '(없음)';
    const ok = want.includes(top);
    if (ok) hit += 1;
    console.log(`${ok ? 'O' : 'X'}  ${q.padEnd(28)} → ${top.padEnd(10)} [${r.route}]${ok ? '' : `  기대: ${want.slice(0, 3).join('/')}`}`);
  }
  console.log(`정답 ${hit} / ${cases.length} (${Math.round((hit / cases.length) * 100)}%)\n`);
  return hit;
}

async function main(): Promise<void> {
  const seed = process.env.CLUBS_SEED || path.resolve(process.cwd(), 'data/seed/clubs.json');
  getDb();
  const raw = JSON.parse(fs.readFileSync(seed, 'utf-8'));
  for (const c of raw) upsertClubByName(c);
  const idx = await reindexAll();
  console.log(`seed ${path.basename(seed)} · ${idx.clubs} clubs · ${idx.chunks} chunks (${idx.provider})\n`);

  const hit = await runCases('기본 30문항 (사전 작성에 참고)', CLUB_CASES);
  const held = await runCases('새 질문 20문항 (사전 수정 없이 1회 측정)', HELDOUT_CASES);
  console.log(`합계 ${hit + held} / ${CLUB_CASES.length + HELDOUT_CASES.length}`);
  if (process.env.EVAL_MIN && hit < Number(process.env.EVAL_MIN)) {
    console.error(`기준 미달: ${hit} < ${process.env.EVAL_MIN}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
