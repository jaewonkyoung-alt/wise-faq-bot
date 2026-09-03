import { getDb } from '../db/database';
import type { KakaoFlow, KakaoSession } from '../types/graduation';

function rowToSession(row: Record<string, unknown>): KakaoSession {
  return {
    user_key: String(row.user_key),
    flow: String(row.flow) as KakaoFlow,
    admission_year:
      row.admission_year == null ? null : Number(row.admission_year),
    department: row.department == null ? null : String(row.department),
    updated_at: String(row.updated_at),
  };
}

export function getSession(userKey: string): KakaoSession | undefined {
  const row = getDb()
    .prepare('SELECT * FROM kakao_sessions WHERE user_key = ?')
    .get(userKey) as Record<string, unknown> | undefined;
  return row ? rowToSession(row) : undefined;
}

export function upsertSession(
  userKey: string,
  patch: Partial<Omit<KakaoSession, 'user_key' | 'updated_at'>> & {
    flow?: KakaoFlow;
  }
): KakaoSession {
  const existing = getSession(userKey);
  const next: KakaoSession = {
    user_key: userKey,
    flow: patch.flow ?? existing?.flow ?? 'menu',
    admission_year:
      patch.admission_year !== undefined
        ? patch.admission_year
        : (existing?.admission_year ?? null),
    department:
      patch.department !== undefined
        ? patch.department
        : (existing?.department ?? null),
    updated_at: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `INSERT INTO kakao_sessions (user_key, flow, admission_year, department, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_key) DO UPDATE SET
         flow = excluded.flow,
         admission_year = excluded.admission_year,
         department = excluded.department,
         updated_at = excluded.updated_at`
    )
    .run(
      next.user_key,
      next.flow,
      next.admission_year,
      next.department,
      next.updated_at
    );
  return next;
}

export function clearSession(userKey: string): void {
  getDb().prepare('DELETE FROM kakao_sessions WHERE user_key = ?').run(userKey);
}

export function resetToMenu(userKey: string): KakaoSession {
  return upsertSession(userKey, {
    flow: 'menu',
    admission_year: null,
    department: null,
  });
}
