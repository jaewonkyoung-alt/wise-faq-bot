/**
 * 동아리 정보 보완 반영 — data/seed/club-updates.json → 시드(clubs.json) + DB.
 *  - 연락처가 자리표시('에브리타임 동아리·학회 게시판 모집 글')뿐이면 모집 글의 신청 방법으로 바꾼다.
 *  - DB 값이 시드와 다르면 관리자가 웹에서 고친 것으로 보고 그 칸은 덮지 않는다.
 *  - 바뀐 동아리만 다시 임베딩한다.
 *
 *   npm run clubs:apply-updates            # 시드 + DB
 *   npm run clubs:apply-updates -- --dry   # 바뀔 내용만 출력
 */
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
dotenv.config();

import { getDb } from '../src/db/database';
import { listClubs, updateClub } from '../src/services/clubStore';
import { reindexClub } from '../src/services/reindex';
import type { ClubInput } from '../src/types/club';

type Field = 'meeting_time' | 'location' | 'contact';
interface Update {
  name: string;
  set: Partial<Record<Field, string | null>>;
  source: string;
}

const SEED = path.resolve('data/seed/clubs.json');
const UPDATES = path.resolve('data/seed/club-updates.json');
export const CONTACT_PLACEHOLDER = '에브리타임 동아리·학회 게시판 모집 글';

/** 자리표시 연락처 → 신청 방법 ("구글폼으로 신청 · 에브리타임 모집 글 쪽지로 문의") — 답변에서 '연락: ' 뒤에 붙는다 */
export function contactFromActivities(activities: string): string {
  const m = activities.match(/신청:\s*([^;.]+)/);
  const how = m ? m[1].trim().replace(/\(.*\)$/, '').trim() : '';
  const ask = '에브리타임 동아리·학회 게시판 모집 글에 쪽지·댓글로 문의';
  return how ? `${how}${ro(how)} 가입 신청 · ${ask}` : ask;
}

/** 받침에 맞는 조사: 구글폼으로 · 문자로 · 메일로 */
function ro(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return '로';
  const jong = code % 28;
  return jong === 0 || jong === 8 ? '로' : '으로';
}
/** 이 스크립트가 예전에 만든 문구도 다시 만든다 */
const GENERATED = /^((가입 신청: .+ · )?문의: 에브리타임 동아리·학회 게시판 모집 글 쪽지·댓글|(.+ 가입 신청 · )?에브리타임 동아리·학회 게시판 모집 글에 쪽지·댓글로 문의)$/;

async function main(): Promise<void> {
  const dry = process.argv.includes('--dry');
  const seed = JSON.parse(fs.readFileSync(SEED, 'utf-8')) as ClubInput[];
  const { updates } = JSON.parse(fs.readFileSync(UPDATES, 'utf-8')) as { updates: Update[] };

  // 시드 기준으로 바꿀 값 모으기
  const next = new Map<string, Partial<Record<Field, string | null>>>();
  for (const c of seed) {
    if (c.contact === CONTACT_PLACEHOLDER || GENERATED.test(c.contact || '')) next.set(c.name, { contact: contactFromActivities(c.activities) });
  }
  for (const u of updates) {
    if (!seed.some((c) => c.name === u.name)) throw new Error(`시드에 없는 동아리: ${u.name}`);
    next.set(u.name, { ...(next.get(u.name) || {}), ...u.set });
  }

  getDb();
  const dbByName = new Map(listClubs().map((c) => [c.name, c]));
  let seedChanged = 0;
  let dbChanged = 0;
  const skipped: string[] = [];
  for (const c of seed) {
    const patch = next.get(c.name);
    if (!patch) continue;
    const dbPatch: Partial<Record<Field, string | null>> = {};
    for (const [f, v] of Object.entries(patch) as Array<[Field, string | null]>) {
      const old = c[f] || null;
      if (old === v) continue;
      const cur = dbByName.get(c.name)?.[f] || null;
      if (cur === old || cur === v) {
        if (cur !== v) dbPatch[f] = v;
      } else {
        skipped.push(`${c.name}.${f} (관리자 수정값 유지: ${cur})`);
      }
      console.log(`${c.name}.${f}: ${old ?? '(빈칸)'} -> ${v ?? '(빈칸)'}`);
      (c as unknown as Record<string, unknown>)[f] = v;
      seedChanged += 1;
    }
    const club = dbByName.get(c.name);
    if (!dry && club && Object.keys(dbPatch).length) {
      updateClub(club.id, dbPatch);
      await reindexClub(club.id);
      dbChanged += 1;
    }
  }
  if (!dry) fs.writeFileSync(SEED, JSON.stringify(seed, null, 2) + '\n');
  console.log(`\n시드 ${seedChanged}칸 · DB ${dbChanged}개 동아리${dry ? ' (dry run — 저장 안 함)' : ''}`);
  if (skipped.length) console.log('덮지 않음:\n  ' + skipped.join('\n  '));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
