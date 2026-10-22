import fs from 'fs';
import path from 'path';
import { getDb } from '../db/database';
import { embedModelId } from '../embeddings/embedder';
import { listClubs } from './clubStore';
import { listKeywordEntries } from './clubKeywords';
import { listCriteriaOverview } from './gradCriteria';
import { reloadGraduationKb } from './kbGraduation';
import { listNotices } from './noticeService';
import { listBuildingCodes, listPlaces, listRooms, reloadRoomMaps } from './roomCode';

/**
 * 데이터 점검 (FR-11 · 관리자 대시보드의 「데이터 점검」).
 * 폴더 · DB 를 다시 읽고, 카톡 답변에 쓰이는 실제 데이터가 빠짐없이 이어져 있는지 확인한다.
 * 비개발자 관리자가 "무엇을 고쳐야 하는지"를 한국어 문장으로 받는다.
 */
export interface KbSection {
  key: 'graduation' | 'clubs' | 'map' | 'notices';
  title: string;
  facts: string[];
  warnings: string[];
}

const list = (names: string[], max = 6) => names.slice(0, max).join(', ') + (names.length > max ? ` 외 ${names.length - max}` : '');

export function runKbCheck(): { scannedAt: string; sections: KbSection[] } {
  const grad = reloadGraduationKb();
  reloadRoomMaps();

  /* 졸업요건 */
  const overview = listCriteriaOverview();
  const rows = overview.reduce((a, d) => a + d.rows, 0);
  const mdDir = process.env.GRAD_MD_DIR || path.resolve(process.cwd(), 'data/kb/졸업요건/공식기준');
  const md = fs.existsSync(mdDir) ? fs.readdirSync(mdDir).filter((f) => f.endsWith('.md')).length : 0;
  const g: KbSection = {
    key: 'graduation',
    title: '졸업요건',
    facts: [`공식 기준 ${overview.length}개 학과 · ${rows}행`, `학과별 문서(MD) ${md}개 (PDF를 적용하면 생김)`],
    warnings: [],
  };
  const closed = overview.filter((d) => String(d.status || '').startsWith('모집중단')).length;
  if (closed) g.facts.push(`모집중단 학과 ${closed}곳 (옛 학번 기준만 유지)`);
  if (grad.entries.length) g.facts.push(`보충 자료(폴더 info.md) ${grad.entries.length}건`);
  const noRows = overview.filter((d) => d.rows === 0 && !String(d.status || '').startsWith('모집중단')).map((d) => d.name);
  if (noRows.length) g.warnings.push(`기준이 하나도 없는 학과: ${list(noRows)} — 학과 PDF를 올려 주세요`);
  const noPdf = overview.filter((d) => !d.pdf_url).map((d) => d.name);
  if (noPdf.length) g.warnings.push(`원문 PDF 링크가 없는 학과: ${list(noPdf)} — 카톡 답변에 「학과 원문 PDF」 버튼이 빠집니다`);
  const thisYear = new Date().getFullYear();
  const stale = overview.filter((d) => d.rows > 0 && d.year_to != null && d.year_to < thisYear && !String(d.status || '').startsWith('모집중단')).map((d) => d.name);
  if (stale.length) g.warnings.push(`올해(${thisYear}학번) 기준이 없는 학과: ${list(stale)} — 새 가이드 PDF를 올려 주세요`);

  /* 동아리 */
  const clubs = listClubs();
  const db = getDb();
  const model = embedModelId();
  const emb = db.prepare('SELECT embed_model, COUNT(*) AS n FROM embeddings GROUP BY embed_model').all() as Array<{ embed_model: string; n: number }>;
  const cur = emb.find((e) => e.embed_model === model)?.n ?? 0;
  const other = emb.filter((e) => e.embed_model !== model).reduce((a, e) => a + e.n, 0);
  const kw = listKeywordEntries(clubs);
  const c: KbSection = {
    key: 'clubs',
    title: '동아리',
    facts: [`동아리 ${clubs.length}곳`, `검색 벡터 ${cur}조각 (${model})`, `키워드 사전 ${kw.length}항목`],
    warnings: [],
  };
  const noEmb = (db.prepare('SELECT name FROM clubs c WHERE NOT EXISTS (SELECT 1 FROM embeddings e WHERE e.club_id = c.id AND e.embed_model = ?)').all(model) as Array<{ name: string }>).map((r) => r.name);
  if (noEmb.length) c.warnings.push(`검색 벡터가 없는 동아리: ${list(noEmb)} — 「전체 재인덱싱」을 눌러 주세요 (임베딩 서버가 꺼져 있었을 수 있음)`);
  if (other) c.warnings.push(`다른 임베딩 모델로 만든 벡터 ${other}조각 — 서버를 다시 시작하면 자동으로 다시 만듭니다`);
  const noSummary = clubs.filter((x) => !x.summary).map((x) => x.name);
  if (noSummary.length) c.warnings.push(`한두 줄 소개가 빈 동아리: ${list(noSummary)} — 목록에서 무슨 동아리인지 알 수 없습니다`);
  const noMeet = clubs.filter((x) => !x.meeting_time).length;
  if (noMeet) c.facts.push(`정기 모임 빈칸 ${noMeet}곳 (모집 글에 없어 비워 둠 — 카톡은 "확인되지 않음"으로 답함)`);
  const deadKw = kw.filter((e) => !e.clubs.length).map((e) => (e.simple ? e.words.join('·') : e.q));
  if (deadKw.length) c.warnings.push(`연결되는 동아리가 없는 사전 항목: ${list(deadKw, 4)} — 분야 말을 동아리 소개에 있는 말로 고쳐 주세요`);

  /* 지도 */
  const places = listPlaces();
  const rooms = listRooms();
  const buildings = listBuildingCodes();
  const m: KbSection = {
    key: 'map',
    title: '지도',
    facts: [`건물 코드 ${buildings.length}개`, `호실 ${rooms.length}개`, `장소 ${places.length}곳`],
    warnings: [],
  };
  const noCoord = places.filter((p) => !Number.isFinite(p.lat) || !Number.isFinite(p.lng)).map((p) => p.display);
  if (noCoord.length) m.warnings.push(`위도 · 경도가 없는 장소: ${list(noCoord)} — 카카오맵 버튼이 빠집니다`);
  const placeNames = new Set(places.flatMap((p) => [p.name, p.display, ...(p.aliases || [])]));
  const orphan = Array.from(new Set(rooms.filter((r) => r.building && !placeNames.has(r.building)).map((r) => r.building)));
  if (orphan.length) m.warnings.push(`호실의 건물이 장소 목록에 없음: ${list(orphan)} — 위치 안내가 빠집니다`);
  if (!rooms.length) m.warnings.push('호실 데이터(rooms.json)를 읽지 못했습니다');

  /* 공지 */
  const live = listNotices();
  const trash = listNotices({ trash: true });
  const n: KbSection = {
    key: 'notices',
    title: '공지',
    facts: [`게시 목록 ${live.length}건 · 휴지통 ${trash.length}건`],
    warnings: [],
  };
  const noEnd = live.filter((x) => x.published && !x.ends_at).length;
  if (noEnd) n.facts.push(`종료일 없는 공지 ${noEnd}건 (자동으로 휴지통에 가지 않음)`);

  return { scannedAt: new Date().toISOString(), sections: [g, c, m, n] };
}
