/**
 * 지도 데이터 · 답변 테스트 (학교 홈페이지 수집본 기준).
 *  1) 강의실 안내 287개 호실 전부: 건물 코드 → 건물 · 좌표 · 호실명이 맞게 답하는지
 *  2) 코드 19개 모두 캠퍼스맵 좌표와 연결 · 좌표가 캠퍼스 범위 안
 *  3) 층 규칙 예외 (D901 대강당 — 9층이라고 하지 않음)
 *  4) 조사 은/는, 건물 이름 질문, 카톡 대화
 *
 *   npm run test:campus-map
 */
import dotenv from 'dotenv';
import fs from 'fs';
import os from 'os';
import path from 'path';
dotenv.config();
// 테스트는 항상 임시 DB — .env 의 운영 DATABASE_PATH 를 쓰면 운영 데이터가 섞인다 (10/10 사고)
{
  process.env.DATABASE_PATH = path.join(os.tmpdir(), `wise-test-campus-map-${process.pid}.db`);
}

import {
  answerPlaceQuery,
  answerRoomCode,
  findPlaces,
  listBuildingCodes,
  listPlaces,
  topic,
} from '../src/services/roomCode';
import { handleKakaoDialog } from '../src/services/kakaoDialog';
import { getDb } from '../src/db/database';

let passed = 0;
function check(name: string, cond: boolean, extra?: unknown): void {
  if (!cond) {
    console.error(`FAIL  ${name}`, extra ?? '');
    throw new Error(`test failed: ${name}`);
  }
  passed += 1;
  console.log(`PASS  ${name}`);
}

const DIR = path.resolve(process.cwd(), 'data/kb/지도');
type Room = { building: string; name: string; type: string; capacity: number | null };
const rooms = JSON.parse(fs.readFileSync(path.join(DIR, 'rooms.json'), 'utf-8')) as Record<string, Room>;

// 캠퍼스 범위 (경주병원 ~ 석림원을 포함하는 사각형)
const BOX = { lat: [35.855, 35.869], lng: [129.187, 129.2] };

async function main(): Promise<void> {
  getDb();
  const places = listPlaces();
  const codes = listBuildingCodes();

  /* ── 1. 수집 데이터 ── */
  check('호실 287개', Object.keys(rooms).length === 287, Object.keys(rooms).length);
  check('캠퍼스맵 장소 35곳', places.length === 35, places.length);
  check('건물 코드 19개', codes.length === 19, codes.map((c) => c.code));
  const roomCodes = new Set(Object.keys(rooms).map((c) => c.match(/^[A-Z]+/)![0]));
  check('강의실 건물 16동', roomCodes.size === 16, [...roomCodes]);
  const unmapped = codes.filter((c) => !places.some((p) => p.code === c.code));
  check('코드 19개 모두 지도 장소와 연결', unmapped.length === 0, unmapped);
  const outside = places.filter((p) => p.lat < BOX.lat[0] || p.lat > BOX.lat[1] || p.lng < BOX.lng[0] || p.lng > BOX.lng[1]);
  check('좌표 35곳 모두 캠퍼스 범위 안', outside.length === 0, outside.map((p) => p.name));
  const noFloors = places.filter((p) => p.code && roomCodes.has(p.code) && p.floors_above == null);
  check('강의실 건물 16동 모두 층수 정보', noFloors.length === 0, noFloors.map((p) => p.name));

  /* ── 2. 287개 호실 전수 ── */
  const wrong: string[] = [];
  let floorSkipped = 0;
  for (const [code, r] of Object.entries(rooms)) {
    const a = answerRoomCode(code);
    const place = places.find((p) => p.code === code.match(/^[A-Z]+/)![0])!;
    if (!a || !a.ok) { wrong.push(`${code} 실패`); continue; }
    if (!a.text.includes(a.buildingName!)) wrong.push(`${code} 건물명 없음`);
    if (r.name !== code && !a.text.includes(r.name)) wrong.push(`${code} 호실명 ${r.name} 없음`);
    if (!a.mapUrl?.includes(`${place.lat},${place.lng}`)) wrong.push(`${code} 좌표 링크 불일치`);
    const floor = Number(code.replace(/^[A-Z]+/, '')[0]);
    const inRange = floor >= 1 && floor <= (place.floors_above ?? 99);
    if (inRange && !a.text.includes(`${floor}층에 있어요`)) wrong.push(`${code} 층 누락`);
    if (!inRange) {
      floorSkipped += 1;
      if (a.text.includes(`${floor}층에 있어요`)) wrong.push(`${code} 없는 층 ${floor}층 안내`);
    }
    if (a.text.length > 900) wrong.push(`${code} 900자 초과`);
  }
  check(`287개 호실 전부 건물 · 호실명 · 좌표 · 층 일치`, wrong.length === 0, wrong.slice(0, 10));
  check('층수를 넘는 번호 4개(D9xx)는 층을 말하지 않음', floorSkipped === 4, floorSkipped);

  const d901 = answerRoomCode('D901')!;
  check('D901 → 100주년기념관 대강당, 9층 아님', d901.text.includes('100주년기념관') && d901.text.includes('대강당') && !d901.text.includes('9층'), d901.text);
  const r201 = answerRoomCode('R201')!;
  check('R201 → 백상관 2층 보시교실 (지도 표기 백상관(금장생활관 반야동))', /백상관 2층/.test(r201.text) && r201.text.includes('보시교실'), r201.text);
  const h = answerRoomCode('H101')!;
  check('H 코드 → 의학관(의과대학)', h.ok && h.text.includes('의학관(의과대학)'), h.text);

  /* ── 3. 조사 · 예외 ── */
  check('S504는 (4 사)', topic('S504') === 'S504는');
  check('A207은 (7 칠)', topic('A207') === 'A207은');
  check('A102는 (2 이)', topic('A102') === 'A102는');
  check('B103은 (3 삼)', topic('B103') === 'B103은');
  check('S504 답변 첫 줄', answerRoomCode('S504')!.text.startsWith('S504는 자연과학관 5층에 있어요.'));
  const unknownRoom = answerRoomCode('A999')!;
  check('목록에 없는 호실은 그렇다고 밝힘', unknownRoom.ok && unknownRoom.text.includes('목록에는 없는 호실'), unknownRoom.text);
  const zz = answerRoomCode('ZZ999')!;
  check('없는 코드는 건물을 추측하지 않음', !zz.ok && !zz.mapUrl && /추측해 안내하지 않습니다/.test(zz.text));

  /* ── 4. 건물 이름 ── */
  const names: Array<[string, string]> = [
    ['도서관 어디야', '도서관'],
    ['본관 위치', '100주년기념관'],
    ['학생회관', '학생회관'],
    ['의대 어디', '의학관(의과대학)'],
    ['정문 어떻게 가', '정문'],
    ['백상관', '백상관'],
    ['체육관 위치 알려줘', '문무관'],
  ];
  for (const [q, want] of names) {
    const hits = findPlaces(q);
    check(`"${q}" → ${want}`, hits.length === 1 && hits[0].display === want, hits.map((p) => p.display));
  }
  const dorm = answerPlaceQuery('기숙사 어디야')!;
  check('"기숙사" → 생활관 4곳 후보', (dorm.candidates?.length ?? 0) === 4, dorm.candidates);
  check('관계없는 말은 건물로 잡지 않음', findPlaces('코딩 동아리 추천').length === 0);

  /* ── 5. 카톡 대화 ── */
  const U = `test-campus-map-${process.pid}`;
  const out = (r: Awaited<ReturnType<typeof handleKakaoDialog>>) => JSON.stringify(r.template);
  await handleKakaoDialog(U, '메뉴');
  const prompt = out(await handleKakaoDialog(U, '지도'));
  check('지도 메뉴: 건물 이름도 안내', prompt.includes('건물 이름'), prompt);
  const lib = out(await handleKakaoDialog(U, '도서관'));
  check('지도 → 도서관: 카카오맵 버튼', lib.includes('카카오맵에서 보기') && lib.includes('map.kakao.com/link/map/'), lib);
  const room = out(await handleKakaoDialog(U, 'A207'));
  check('메뉴에서 A207: 위치 + 지도 버튼', room.includes('원효관 2층') && room.includes('map.kakao.com'), room);
  const where = out(await handleKakaoDialog(U, '학생회관 어디야'));
  check('"학생회관 어디야": 지도 답변', where.includes('학생회관') && where.includes('map.kakao.com'), where);
  await handleKakaoDialog(U, '지도');
  const cand = out(await handleKakaoDialog(U, '기숙사'));
  check('기숙사: 후보 버튼', cand.includes('백상관') && cand.includes('금강동'), cand);
  const pick = out(await handleKakaoDialog(U, '백상관'));
  check('후보 선택 → 백상관 위치', pick.includes('map.kakao.com') && pick.includes('백상관'), pick);

  // 메뉴에서 건물 이름만 보낸 경우 (오픈빌더 봇테스트에서 발견)
  await handleKakaoDialog(U, '메뉴');
  const bare = out(await handleKakaoDialog(U, '기숙사'));
  check('메뉴에서 "기숙사"만: 후보 버튼', bare.includes('백상관') && bare.includes('금강동'), bare);
  const bare2 = out(await handleKakaoDialog(U, '백상관'));
  check('이어서 "백상관": 위치', bare2.includes('map.kakao.com'), bare2);
  await handleKakaoDialog(U, '메뉴');
  const lib2 = out(await handleKakaoDialog(U, '도서관'));
  check('메뉴에서 "도서관"만: 위치', lib2.includes('map.kakao.com'), lib2);
  await handleKakaoDialog(U, '메뉴');
  const notPlace = out(await handleKakaoDialog(U, '별 보는 동아리 있어?'));
  check('동아리 질문은 지도로 가지 않음', !notPlace.includes('map.kakao.com'), notPlace);

  console.log(`\nPASS test-campus-map (${passed} checks)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
