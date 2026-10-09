import fs from 'fs';
import path from 'path';

/**
 * 지도 · 호실 안내.
 * 데이터는 학교 홈페이지에서 수집한 data/kb/지도/*.json (tools/map-crawl/crawl_campus_map.py).
 *  - buildings.json : 건물 코드 → 답변용 건물 이름
 *  - places.json    : 캠퍼스맵 35곳 (코드 · 좌표 · 층수 · 소개 · 별칭)
 *  - rooms.json     : 강의실 안내 287개 호실 (호실명 · 구분 · 수용인원)
 */

export interface ParsedRoomCode {
  buildingCode: string;
  roomNumber: string;
  floor: number | null;
  raw: string;
}

export interface RoomAnswer {
  ok: boolean;
  text: string;
  parsed?: ParsedRoomCode;
  buildingName?: string;
  roomMeta?: { name?: string; type?: string; capacity?: number | null };
  /** 카카오맵 위치 링크 (좌표가 있는 건물만) */
  mapUrl?: string;
  /** 이름이 여러 건물에 해당할 때 후보 */
  candidates?: string[];
}

export interface CampusPlace {
  seq: number;
  no: number;
  name: string;
  display: string;
  code: string | null;
  lat: number;
  lng: number;
  name_en: string | null;
  built: string | null;
  floors_above: number | null;
  floors_below: number;
  facilities: string | null;
  summary: string;
  aliases: string[];
  room_count: number;
}

type BuildingsMap = Record<string, string>;
type RoomsMap = Record<
  string,
  { building?: string; name?: string; type?: string; capacity?: number | null }
>;
interface PlacesFile {
  places: CampusPlace[];
  groups?: Record<string, string[]>;
}

const cache = new Map<string, { mtime: number; data: unknown }>();

function kbMapDir(): string {
  return path.resolve(process.cwd(), 'data/kb/지도');
}

function loadJson<T>(name: string, empty: T): T {
  const file = path.join(kbMapDir(), name);
  try {
    const st = fs.statSync(file);
    const hit = cache.get(name);
    if (hit && hit.mtime === st.mtimeMs) return hit.data as T;
    const data = JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
    cache.set(name, { mtime: st.mtimeMs, data });
    return data;
  } catch {
    return empty;
  }
}

const loadBuildings = () => loadJson<BuildingsMap>('buildings.json', {});
const loadRooms = () => loadJson<RoomsMap>('rooms.json', {});
const loadPlaces = () => loadJson<PlacesFile>('places.json', { places: [] });

/** Force reload from disk (admin scan). */
export function reloadRoomMaps(): void {
  cache.clear();
  loadBuildings();
  loadRooms();
  loadPlaces();
}

export function listPlaces(): CampusPlace[] {
  return loadPlaces().places;
}

function placeByCode(code: string): CampusPlace | undefined {
  return listPlaces().find((p) => p.code === code);
}

/** 카카오맵 '지도 바로가기' 링크 — 이름 · 위도 · 경도 */
export function kakaoMapUrl(p: Pick<CampusPlace, 'display' | 'lat' | 'lng'>): string {
  return `https://map.kakao.com/link/map/${encodeURIComponent(p.display)},${p.lat},${p.lng}`;
}

/** 은/는 — 숫자로 끝나면 읽는 소리 기준 (0 영 · 1 일 · 3 삼 · 6 육 · 7 칠 · 8 팔 → 은) */
export function topic(word: string): string {
  const last = word.trim().slice(-1);
  if (/\d/.test(last)) return word + ('013678'.includes(last) ? '은' : '는');
  const c = last.charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return word + ((c - 0xac00) % 28 ? '은' : '는');
  return word + (/[LMNR]/i.test(last) ? '은' : '는');
}

/**
 * Prefer longer (multi-letter) building codes when matching.
 * Patterns: S504, s-504, S 504, BST101
 */
export function parseRoomCode(utterance: string): ParsedRoomCode | null {
  const t = (utterance || '').trim();
  if (!t) return null;

  // Collect letter+optional separator+digits anywhere in utterance
  const re = /([A-Za-z]{1,5})\s*[-–—]?\s*(\d{2,4})\b/g;
  const candidates: ParsedRoomCode[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) !== null) {
    const buildingCode = m[1].toUpperCase();
    const roomNumber = m[2];
    const floor =
      roomNumber.length >= 3 ? Number(roomNumber[0]) : null;
    candidates.push({
      buildingCode,
      roomNumber,
      floor: Number.isFinite(floor as number) ? floor : null,
      raw: `${buildingCode}${roomNumber}`,
    });
  }
  if (candidates.length === 0) return null;

  const buildings = loadBuildings();
  const codes = Object.keys(buildings).sort((a, b) => b.length - a.length);

  // Prefer candidate whose building code matches a known multi-letter code first
  for (const code of codes) {
    const hit = candidates.find((c) => c.buildingCode === code);
    if (hit) return hit;
  }

  // Else return first candidate (may be unknown building)
  return candidates[0];
}

function floorRange(p: CampusPlace): string {
  if (p.floors_above == null) return '';
  return p.floors_below ? `지하 ${p.floors_below}층~지상 ${p.floors_above}층` : `지상 ${p.floors_above}층`;
}

export function formatRoomAnswer(parsed: ParsedRoomCode): RoomAnswer {
  const buildings = loadBuildings();
  const rooms = loadRooms();
  const buildingName = buildings[parsed.buildingCode];

  if (!buildingName) {
    return {
      ok: false,
      parsed,
      text: [
        `${parsed.buildingCode} 건물 코드를 찾지 못했습니다.`,
        `입력: ${parsed.raw}`,
        '등록된 건물 코드인지 확인해 주세요. (예: A, B, S, K, D …)',
        '알 수 없는 코드의 건물 이름은 추측해 안내하지 않습니다.',
      ].join('\n'),
    };
  }

  const place = placeByCode(parsed.buildingCode);
  const meta = rooms[parsed.raw];

  // 번호 첫 자리가 건물 층수를 넘으면 층으로 읽지 않는다 (예: D901 대강당 — 100주년기념관은 지상 5층)
  const maxFloor = place?.floors_above ?? null;
  const floorOk = parsed.floor != null && parsed.floor >= 1 && (maxFloor == null || parsed.floor <= maxFloor);

  const lines: string[] = [];
  if (floorOk) {
    lines.push(`${topic(parsed.raw)} ${buildingName} ${parsed.floor}층에 있어요.`);
  } else {
    lines.push(`${topic(parsed.raw)} ${buildingName}에 있어요.`);
    if (parsed.floor != null && place && maxFloor != null) {
      lines.push(`층은 번호만으로 알 수 없어요. (${buildingName}: ${floorRange(place)})`);
    }
  }
  if (meta) {
    const name = meta.name && meta.name !== parsed.raw ? meta.name : null;
    const facts = [meta.type, meta.capacity ? `${meta.capacity}명` : null].filter(Boolean).join(' · ');
    if (name || facts) lines.push(`호실: ${[name, facts && `(${facts})`].filter(Boolean).join(' ')}`);
  } else if (place && place.room_count > 0) {
    lines.push(`학교 강의실 안내 목록에는 없는 호실이에요.${floorOk ? ' 층은 번호 첫 자리 기준입니다.' : ''}`);
  }

  return {
    ok: true,
    parsed,
    buildingName,
    roomMeta: meta ? { name: meta.name, type: meta.type, capacity: meta.capacity ?? null } : undefined,
    mapUrl: place ? kakaoMapUrl(place) : undefined,
    text: lines.join('\n'),
  };
}

/** Parse utterance and format answer in one step. */
export function answerRoomCode(utterance: string): RoomAnswer | null {
  const parsed = parseRoomCode(utterance);
  if (!parsed) return null;
  return formatRoomAnswer(parsed);
}

const norm = (s: string) => s.replace(/[\s·ㆍ,()（）\/]/g, '').toLowerCase();

/** 문장 속 건물 이름 · 별칭을 찾는다. 가장 긴 이름이 이긴다. */
export function findPlaces(utterance: string): CampusPlace[] {
  const u = norm(utterance || '');
  if (!u) return [];
  const { places, groups = {} } = loadPlaces();
  let best: { len: number; hits: CampusPlace[] } = { len: 0, hits: [] };
  const consider = (key: string, hits: CampusPlace[]) => {
    const k = norm(key);
    if (k.length < 2 || !u.includes(k)) return;
    if (k.length > best.len) best = { len: k.length, hits };
    else if (k.length === best.len) best.hits = [...new Set([...best.hits, ...hits])];
  };
  for (const p of places) {
    for (const key of [p.display, p.name, ...p.aliases]) consider(key, [p]);
  }
  for (const [key, names] of Object.entries(groups)) {
    consider(key, places.filter((p) => names.includes(p.name)));
  }
  return best.hits;
}

export function formatPlaceAnswer(p: CampusPlace): RoomAnswer {
  const head = p.code ? `${p.display} [${p.code}]` : p.display;
  const facts = [p.built ? `준공 ${p.built}` : null, floorRange(p) || null].filter(Boolean).join(' · ');
  const lines = [`${head} 위치를 카카오맵으로 열 수 있어요.`];
  if (facts) lines.push(facts);
  if (p.facilities) lines.push(`편의시설: ${p.facilities}`);
  if (p.summary) lines.push('', p.summary);
  if (p.room_count > 0) lines.push('', `호실 코드는 ${p.code}로 시작해요. (강의실 안내 ${p.room_count}개)`);
  return { ok: true, text: lines.join('\n').slice(0, 900), buildingName: p.display, mapUrl: kakaoMapUrl(p) };
}

/** 말 전체가 건물 이름·별칭인가 ("기숙사", "백상관", "본관?") — 메뉴에서 건물 이름만 보낸 경우 */
export function isPlaceName(utterance: string): boolean {
  const u = norm((utterance || '').replace(/[?？!]+$/, '').replace(/\s*(은|는|이|가)$/, ''));
  if (u.length < 2) return false;
  const { places, groups = {} } = loadPlaces();
  const keys = [...Object.keys(groups), ...places.flatMap((p) => [p.display, p.name, ...p.aliases])];
  return keys.some((k) => norm(k) === u);
}

/** 건물 이름 질문 — 한 곳이면 위치, 여러 곳이면 후보 목록 */
export function answerPlaceQuery(utterance: string): RoomAnswer | null {
  const hits = findPlaces(utterance);
  if (hits.length === 0) return null;
  if (hits.length === 1) return formatPlaceAnswer(hits[0]);
  return {
    ok: true,
    text: ['여러 건물이 해당돼요. 이름을 골라 주세요.', ...hits.map((p) => `· ${p.display}`)].join('\n'),
    candidates: hits.map((p) => p.display),
  };
}

export function listBuildingCodes(): { code: string; name: string }[] {
  const buildings = loadBuildings();
  return Object.entries(buildings)
    .sort(([a], [b]) => b.length - a.length || a.localeCompare(b))
    .map(([code, name]) => ({ code, name }));
}
