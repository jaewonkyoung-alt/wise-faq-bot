import { getDb } from '../db/database';
import type { UnansweredQuestion } from '../types/club';

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
      `SELECT id, question, reason, route, created_at
       FROM unanswered_questions
       ORDER BY id DESC
       LIMIT ?`
    )
    .all(limit) as UnansweredQuestion[];
  return rows;
}

export function clearUnanswered(): number {
  const result = getDb().prepare('DELETE FROM unanswered_questions').run();
  return result.changes;
}
