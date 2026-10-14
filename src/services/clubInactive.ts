import fs from 'fs';
import path from 'path';

/**
 * 활동 미확인 동아리 — 학교 홈페이지 옛 목록에만 있고 최근 모집·활동 글이 없는 곳 (data/seed/clubs-inactive.json).
 * "소낙비 동아리 있어?" 에 '찾지 못했어요' 대신 사실대로 안내하고 비슷한 활동 동아리를 알려 준다.
 */
interface InactiveClub {
  name: string;
  aliases?: string[];
  field: string;
  since: number;
  last_seen: string;
  instead: string[];
}

let cache: { checked_at: string; clubs: InactiveClub[] } | null = null;
function load(): { checked_at: string; clubs: InactiveClub[] } {
  if (!cache) {
    const file = path.resolve(process.cwd(), 'data/seed/clubs-inactive.json');
    cache = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf-8')) : { checked_at: '', clubs: [] };
  }
  return cache!;
}

const key = (s: string) => s.toLowerCase().replace(/[\s\-·.]/g, '');

export function findInactiveClub(question: string): InactiveClub | undefined {
  const q = key(question);
  return load().clubs.find((c) =>
    [c.name, ...(c.aliases || [])].some((n) => {
      // 영문 이름은 단어 단위로 ("CAMP" 가 "campus" 에 걸리지 않게)
      if (/^[A-Za-z0-9\s\-]+$/.test(n)) return new RegExp(`(^|[^A-Za-z])${n.replace(/[\s\-]/g, '[\\s\\-]?')}([^A-Za-z]|$)`, 'i').test(question);
      return key(n).length >= 2 && q.includes(key(n));
    })
  );
}

export function inactiveClubAnswer(c: InactiveClub): string {
  const { checked_at } = load();
  const lines = [
    `【${c.name}】 ${c.field} · ${c.since}년 등록`,
    `학교 홈페이지 동아리 목록에는 있지만, 최근 활동이 확인되지 않아요. (${checked_at.replace(/-/g, '.')} 에브리타임 동아리·학회 게시판 확인: ${c.last_seen.replace(/\(ET \d+\)/g, '').trim()})`,
  ];
  if (c.instead.length) lines.push('', `지금 활동하는 비슷한 동아리: ${c.instead.join(', ')}`, `이름을 보내면 자세히 알려 드려요. (예: ${c.instead[0]})`);
  return lines.join('\n');
}
