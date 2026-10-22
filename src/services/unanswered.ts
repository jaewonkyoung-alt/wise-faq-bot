import { getDb } from '../db/database';
import type { UnansweredQuestion } from '../types/club';

/**
 * 미답변 질문 (FR-12). 봇이 답하지 못한 질문을 쌓고, 관리자 화면에서 같은 질문끼리 묶어 보여 준다.
 * 처리 상태: new(새 질문) → resolved(해결: 데이터·사전 보완) / ignored(무시: 범위 밖 · 장난).
 */
export type UnansweredStatus = 'new' | 'resolved' | 'ignored';
export const UNANSWERED_STATUSES: UnansweredStatus[] = ['new', 'resolved', 'ignored'];

export function logUnanswered(
  question: string,
  reason: string,
  route: string | null = null
): void {
  getDb()
    .prepare(
      `INSERT INTO unanswered_questions (question, reason, route, created_at)
       VALUES (?, ?, ?, ?)`
    )
    .run(question, reason, route, new Date().toISOString());
}

export function listUnanswered(limit = 100): UnansweredQuestion[] {
  const rows = getDb()
    .prepare(
      `SELECT id, question, reason, route, status, created_at
       FROM unanswered_questions
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(limit) as UnansweredQuestion[];
  return rows;
}

/** 관리자가 읽는 이유 — 기록에는 짧은 코드가 남는다 */
export function reasonLabel(reason: string, route: string | null): string {
  if (/^graduation_miss/.test(reason)) return '졸업요건 데이터 없음 (학번 · 학과)';
  if (reason === 'map_room_unparsed') return '강의실 · 건물을 알아보지 못함';
  if (reason === 'menu_fallback') return '무슨 말인지 몰라 메뉴로 돌아감';
  if (reason === 'structured miss') return '그 이름의 동아리가 없음';
  if (reason === 'similar_only') return '딱 맞는 동아리 없음 (비슷한 동아리로 안내함)';
  if (/low similarity|no embeddings/.test(reason)) return '찾는 동아리를 확인하지 못함';
  if (reason === 'empty question') return '빈 질문';
  if (route === 'refuse' || /refuse|MVP|domain/.test(reason)) return '동아리 질문으로 보지 않음 (범위 밖)';
  return reason;
}

/** 어느 기능에서 생긴 질문인지 — 동아리 질문만 '키워드 사전에 추가'를 보여 준다 */
export function areaOf(route: string | null, reason: string): '동아리' | '졸업요건' | '지도' | '기타' {
  if (route === 'graduation' || /^graduation_miss/.test(reason)) return '졸업요건';
  if (route === 'map') return '지도';
  if (route === 'semantic_search' || route === 'structured_query' || route === 'refuse') return '동아리';
  return '기타';
}

/** 같은 질문 판단: 공백 · 문장부호 · 대소문자 무시 */
export function questionKey(q: string): string {
  return q.toLowerCase().replace(/[\s?？!.,~·'"]/g, '');
}

export interface UnansweredGroup {
  key: string;
  question: string;
  count: number;
  ids: number[];
  area: ReturnType<typeof areaOf>;
  reason: string;
  status: UnansweredStatus;
  first_at: string;
  last_at: string;
}

/**
 * 같은 질문을 묶은 목록 (최근 순). status 를 주면 그 상태의 질문만 묶는다.
 */
export function listUnansweredGroups(status?: UnansweredStatus | 'all', limit = 1000): UnansweredGroup[] {
  const where = status && status !== 'all' ? 'WHERE status = ?' : '';
  const rows = getDb()
    .prepare(
      `SELECT id, question, reason, route, status, created_at FROM unanswered_questions ${where}
       ORDER BY id DESC LIMIT ?`
    )
    .all(...(where ? [status, limit] : [limit])) as Array<UnansweredQuestion & { status: UnansweredStatus }>;
  const groups = new Map<string, UnansweredGroup>();
  for (const r of rows) {
    const key = questionKey(r.question);
    const g = groups.get(key);
    if (!g) {
      groups.set(key, {
        key,
        question: r.question,
        count: 1,
        ids: [r.id],
        area: areaOf(r.route, r.reason),
        reason: reasonLabel(r.reason, r.route),
        status: r.status,
        first_at: r.created_at,
        last_at: r.created_at,
      });
    } else {
      g.count += 1;
      g.ids.push(r.id);
      g.first_at = r.created_at; // 최근 순으로 읽으므로 마지막에 읽은 것이 가장 오래된 기록
      if (r.status === 'new') g.status = 'new';
    }
  }
  return Array.from(groups.values());
}

export function unansweredCounts(): Record<UnansweredStatus, number> {
  const out: Record<UnansweredStatus, number> = { new: 0, resolved: 0, ignored: 0 };
  const rows = getDb()
    .prepare(`SELECT status, question FROM unanswered_questions`)
    .all() as Array<{ status: UnansweredStatus; question: string }>;
  // 묶음(같은 질문) 단위로 센다 — 화면 목록과 같은 숫자
  const seen = new Set<string>();
  for (const r of rows) {
    const k = r.status + '|' + questionKey(r.question);
    if (seen.has(k)) continue;
    seen.add(k);
    if (r.status in out) out[r.status] += 1;
  }
  return out;
}

/** 묶음의 기록들을 한 번에 해결 · 무시 · 다시 새 질문으로 */
export function setUnansweredStatus(ids: number[], status: UnansweredStatus): number {
  if (!UNANSWERED_STATUSES.includes(status)) throw new Error('알 수 없는 상태입니다.');
  const clean = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (!clean.length) return 0;
  const now = status === 'new' ? null : new Date().toISOString();
  const stmt = getDb().prepare('UPDATE unanswered_questions SET status = ?, resolved_at = ? WHERE id = ?');
  let changed = 0;
  getDb().transaction(() => {
    for (const id of clean) changed += stmt.run(status, now, id).changes;
  })();
  return changed;
}

/** 처리한(해결 · 무시) 기록 비우기 — 새 질문은 남긴다 */
export function clearHandledUnanswered(): number {
  return getDb().prepare(`DELETE FROM unanswered_questions WHERE status != 'new'`).run().changes;
}

export function clearUnanswered(): number {
  const result = getDb().prepare('DELETE FROM unanswered_questions').run();
  return result.changes;
}
