import { randomUUID } from 'crypto';
import { getDb } from '../db/database';
import { logUnanswered } from './unanswered';
import type {
  GraduationInput,
  GraduationRequirement,
} from '../types/graduation';

function rowToGrad(row: Record<string, unknown>): GraduationRequirement {
  return {
    id: String(row.id),
    admission_year: Number(row.admission_year),
    department: String(row.department),
    major_type: row.major_type == null ? null : String(row.major_type),
    total_credits:
      row.total_credits == null ? null : Number(row.total_credits),
    major_credits:
      row.major_credits == null ? null : Number(row.major_credits),
    general_credits:
      row.general_credits == null ? null : Number(row.general_credits),
    notes: row.notes == null ? null : String(row.notes),
    source_url: row.source_url == null ? null : String(row.source_url),
    verified_at: row.verified_at == null ? null : String(row.verified_at),
    updated_at: String(row.updated_at),
  };
}

/** Normalize major_type for UNIQUE key (NULL → empty string in SQLite UNIQUE). */
function normalizeMajorType(v: string | null | undefined): string {
  const t = (v ?? '').trim();
  return t || '전공';
}

export function listGraduation(): GraduationRequirement[] {
  const rows = getDb()
    .prepare(
      `SELECT * FROM graduation_requirements
       ORDER BY admission_year DESC, department, major_type`
    )
    .all() as Record<string, unknown>[];
  return rows.map(rowToGrad);
}

export function getGraduationById(
  id: string
): GraduationRequirement | undefined {
  const row = getDb()
    .prepare('SELECT * FROM graduation_requirements WHERE id = ?')
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToGrad(row) : undefined;
}

/**
 * Exact lookup by admission year + department (+ optional major_type).
 * Facts MUST come only from this SQL — never invent credits/rules.
 */
export function lookupGraduation(
  year: number,
  department: string,
  majorType?: string | null
): GraduationRequirement | undefined {
  const dept = department.trim();
  const mt = majorType != null ? normalizeMajorType(majorType) : null;

  if (mt) {
    const row = getDb()
      .prepare(
        `SELECT * FROM graduation_requirements
         WHERE admission_year = ?
           AND department = ?
           AND COALESCE(major_type, '전공') = ?
         LIMIT 1`
      )
      .get(year, dept, mt) as Record<string, unknown> | undefined;
    if (row) return rowToGrad(row);
  }

  // Prefer exact department match; if multiple major_types, prefer '전공'
  const rows = getDb()
    .prepare(
      `SELECT * FROM graduation_requirements
       WHERE admission_year = ? AND department = ?
       ORDER BY CASE WHEN COALESCE(major_type, '전공') = '전공' THEN 0 ELSE 1 END
       LIMIT 1`
    )
    .all(year, dept) as Record<string, unknown>[];
  return rows[0] ? rowToGrad(rows[0]) : undefined;
}

/**
 * Lookup with contains match on department name when exact fails.
 * Returns { hit } | { miss } | { ambiguous: candidates }.
 */
export function resolveDepartment(
  utterance: string,
  known: string[]
): { kind: 'exact' | 'contains'; department: string } | { kind: 'ambiguous'; candidates: string[] } | { kind: 'none' } {
  const q = utterance.trim().replace(/\s+/g, '');
  if (!q) return { kind: 'none' };

  const exact = known.find((d) => d === utterance.trim() || d.replace(/\s+/g, '') === q);
  if (exact) return { kind: 'exact', department: exact };

  const contains = known.filter(
    (d) =>
      d.includes(utterance.trim()) ||
      utterance.trim().includes(d) ||
      d.replace(/\s+/g, '').includes(q) ||
      q.includes(d.replace(/\s+/g, ''))
  );
  const uniq = [...new Set(contains)];
  if (uniq.length === 1) return { kind: 'contains', department: uniq[0] };
  if (uniq.length > 1) return { kind: 'ambiguous', candidates: uniq };
  return { kind: 'none' };
}

export function listDepartments(): string[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT department FROM graduation_requirements ORDER BY department`
    )
    .all() as { department: string }[];
  return rows.map((r) => r.department);
}

export function listYears(): number[] {
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT admission_year AS y FROM graduation_requirements ORDER BY y DESC`
    )
    .all() as { y: number }[];
  return rows.map((r) => r.y);
}

export function formatGraduationAnswer(
  row: GraduationRequirement
): string {
  const lines = [
    `【졸업요건】 ${row.admission_year}학번 · ${row.department}${
      row.major_type ? ` (${row.major_type})` : ''
    }`,
    row.total_credits != null ? `· 총 이수학점: ${row.total_credits}` : null,
    row.major_credits != null ? `· 전공 학점: ${row.major_credits}` : null,
    row.general_credits != null ? `· 교양 학점: ${row.general_credits}` : null,
    row.notes ? `· 비고: ${row.notes}` : null,
    '',
    '[출처]',
    row.source_url
      ? `· ${row.source_url}`
      : '· (출처 URL 없음)',
    row.verified_at
      ? `· verified_at: ${row.verified_at}`
      : '· verified_at: (미확인)',
    `· updated_at: ${row.updated_at}`,
  ].filter((x) => x != null) as string[];
  return lines.join('\n');
}

export function formatGraduationMiss(
  year: number,
  department: string
): string {
  return [
    '확인되지 않음 / 데이터 없음',
    `요청: ${year}학번 · ${department}`,
    '해당 입학연도·학과의 졸업요건이 DB에 없습니다.',
    '관리자 등록 후 다시 조회해 주세요. (추측·임의 학점은 제공하지 않습니다.)',
  ].join('\n');
}

/** Lookup + optional unanswered log on miss. Never invents facts. */
export function lookupOrMiss(
  year: number,
  department: string,
  majorType?: string | null,
  logQuestion?: string
): { found: true; row: GraduationRequirement; answer: string } | {
  found: false;
  answer: string;
} {
  const row = lookupGraduation(year, department, majorType);
  if (row) {
    return { found: true, row, answer: formatGraduationAnswer(row) };
  }
  if (logQuestion) {
    logUnanswered(
      logQuestion,
      `graduation_miss:${year}:${department}`,
      'graduation'
    );
  }
  return { found: false, answer: formatGraduationMiss(year, department) };
}

export function createGraduation(
  input: GraduationInput
): GraduationRequirement {
  const now = new Date().toISOString();
  const row: GraduationRequirement = {
    id: randomUUID(),
    admission_year: Number(input.admission_year),
    department: input.department.trim(),
    major_type: normalizeMajorType(input.major_type),
    total_credits:
      input.total_credits == null || input.total_credits === ('' as unknown)
        ? null
        : Number(input.total_credits),
    major_credits:
      input.major_credits == null || input.major_credits === ('' as unknown)
        ? null
        : Number(input.major_credits),
    general_credits:
      input.general_credits == null ||
      input.general_credits === ('' as unknown)
        ? null
        : Number(input.general_credits),
    notes: input.notes?.trim() || null,
    source_url: input.source_url?.trim() || null,
    verified_at: input.verified_at?.trim() || null,
    updated_at: now,
  };

  getDb()
    .prepare(
      `INSERT INTO graduation_requirements (
        id, admission_year, department, major_type,
        total_credits, major_credits, general_credits,
        notes, source_url, verified_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.id,
      row.admission_year,
      row.department,
      row.major_type,
      row.total_credits,
      row.major_credits,
      row.general_credits,
      row.notes,
      row.source_url,
      row.verified_at,
      row.updated_at
    );
  return row;
}

export function updateGraduation(
  id: string,
  patch: Partial<GraduationInput>
): GraduationRequirement | undefined {
  const existing = getGraduationById(id);
  if (!existing) return undefined;

  const next: GraduationRequirement = {
    ...existing,
    admission_year:
      patch.admission_year != null
        ? Number(patch.admission_year)
        : existing.admission_year,
    department:
      patch.department != null
        ? String(patch.department).trim()
        : existing.department,
    major_type:
      patch.major_type !== undefined
        ? normalizeMajorType(patch.major_type)
        : existing.major_type,
    total_credits:
      patch.total_credits !== undefined
        ? patch.total_credits == null
          ? null
          : Number(patch.total_credits)
        : existing.total_credits,
    major_credits:
      patch.major_credits !== undefined
        ? patch.major_credits == null
          ? null
          : Number(patch.major_credits)
        : existing.major_credits,
    general_credits:
      patch.general_credits !== undefined
        ? patch.general_credits == null
          ? null
          : Number(patch.general_credits)
        : existing.general_credits,
    notes:
      patch.notes !== undefined
        ? patch.notes?.trim() || null
        : existing.notes,
    source_url:
      patch.source_url !== undefined
        ? patch.source_url?.trim() || null
        : existing.source_url,
    verified_at:
      patch.verified_at !== undefined
        ? patch.verified_at?.trim() || null
        : existing.verified_at,
    updated_at: new Date().toISOString(),
  };

  getDb()
    .prepare(
      `UPDATE graduation_requirements SET
        admission_year = ?, department = ?, major_type = ?,
        total_credits = ?, major_credits = ?, general_credits = ?,
        notes = ?, source_url = ?, verified_at = ?, updated_at = ?
       WHERE id = ?`
    )
    .run(
      next.admission_year,
      next.department,
      next.major_type,
      next.total_credits,
      next.major_credits,
      next.general_credits,
      next.notes,
      next.source_url,
      next.verified_at,
      next.updated_at,
      id
    );
  return next;
}

export function deleteGraduation(id: string): boolean {
  const result = getDb()
    .prepare('DELETE FROM graduation_requirements WHERE id = ?')
    .run(id);
  return result.changes > 0;
}

export function upsertGraduationByKey(
  input: GraduationInput
): GraduationRequirement {
  const mt = normalizeMajorType(input.major_type);
  const existing = getDb()
    .prepare(
      `SELECT id FROM graduation_requirements
       WHERE admission_year = ?
         AND department = ?
         AND COALESCE(major_type, '전공') = ?
       LIMIT 1`
    )
    .get(Number(input.admission_year), input.department.trim(), mt) as
    | { id: string }
    | undefined;

  if (existing) {
    return updateGraduation(existing.id, { ...input, major_type: mt })!;
  }
  return createGraduation({ ...input, major_type: mt });
}

/** Parse admission year from free text: 22학번, 2022, 2022년 입학, etc. */
export function parseAdmissionYear(text: string): number | null {
  const t = text.trim();
  if (!t) return null;

  // Full year first: 2021–2099 (also covers "2022년 입학")
  const full = t.match(/(20[2-9]\d)/);
  if (full) {
    const y = Number(full[1]);
    if (y >= 2000 && y <= 2099) return y;
  }

  // 21학번 / 22학번 (2-digit → 20xx). Avoid \b — Korean is non-\w in JS.
  const shortHakbun = t.match(/(?:^|[^0-9])([0-9]{2})\s*학번/);
  if (shortHakbun) {
    const n = Number(shortHakbun[1]);
    if (n >= 0 && n <= 99) return 2000 + n;
  }

  // Bare two-digit only when the whole utterance is just the number
  const bare = t.match(/^([0-9]{2})$/);
  if (bare) {
    const n = Number(bare[1]);
    if (n >= 0 && n <= 99) return 2000 + n;
  }

  return null;
}
