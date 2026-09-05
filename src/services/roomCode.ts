import fs from 'fs';
import path from 'path';

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
  roomMeta?: { name?: string; type?: string };
}

type BuildingsMap = Record<string, string>;
type RoomsMap = Record<
  string,
  { building?: string; name?: string; type?: string }
>;

let buildingsCache: BuildingsMap | null = null;
let roomsCache: RoomsMap | null = null;
let buildingsMtime = 0;
let roomsMtime = 0;

function kbMapDir(): string {
  return path.resolve(process.cwd(), 'data/kb/지도');
}

function loadBuildings(): BuildingsMap {
  const file = path.join(kbMapDir(), 'buildings.json');
  try {
    const st = fs.statSync(file);
    if (buildingsCache && st.mtimeMs === buildingsMtime) return buildingsCache;
    buildingsCache = JSON.parse(fs.readFileSync(file, 'utf-8')) as BuildingsMap;
    buildingsMtime = st.mtimeMs;
    return buildingsCache;
  } catch {
    buildingsCache = {};
    return buildingsCache;
  }
}

function loadRooms(): RoomsMap {
  const file = path.join(kbMapDir(), 'rooms.json');
  try {
    const st = fs.statSync(file);
    if (roomsCache && st.mtimeMs === roomsMtime) return roomsCache;
    roomsCache = JSON.parse(fs.readFileSync(file, 'utf-8')) as RoomsMap;
    roomsMtime = st.mtimeMs;
    return roomsCache;
  } catch {
    roomsCache = {};
    return roomsCache;
  }
}

/** Force reload from disk (admin scan). */
export function reloadRoomMaps(): void {
  buildingsCache = null;
  roomsCache = null;
  buildingsMtime = 0;
  roomsMtime = 0;
  loadBuildings();
  loadRooms();
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
        '등록된 건물 코드인지 확인해 주세요. (예: A, B, S, K, BST …)',
        '알 수 없는 코드의 건물 이름은 추측해 안내하지 않습니다.',
      ].join('\n'),
    };
  }

  const roomKey = `${parsed.buildingCode}${parsed.roomNumber}`;
  const meta = rooms[roomKey] || rooms[parsed.raw];

  const floorPart =
    parsed.floor != null ? `${parsed.floor}층` : '층 정보 없음';

  let text = `${parsed.raw}은 ${buildingName} ${floorPart}에 있어요.`;
  if (meta?.name) {
    text += `\n호실명: ${meta.name}${meta.type ? ` (${meta.type})` : ''}`;
  }

  return {
    ok: true,
    parsed,
    buildingName,
    roomMeta: meta
      ? { name: meta.name, type: meta.type }
      : undefined,
    text,
  };
}

/** Parse utterance and format answer in one step. */
export function answerRoomCode(utterance: string): RoomAnswer | null {
  const parsed = parseRoomCode(utterance);
  if (!parsed) return null;
  return formatRoomAnswer(parsed);
}

export function listBuildingCodes(): { code: string; name: string }[] {
  const buildings = loadBuildings();
  return Object.entries(buildings)
    .sort(([a], [b]) => b.length - a.length || a.localeCompare(b))
    .map(([code, name]) => ({ code, name }));
}
