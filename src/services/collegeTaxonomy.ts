import fs from 'fs';
import path from 'path';

export interface CollegeTaxonomy {
  colleges: Record<string, string[]>;
}

let cache: CollegeTaxonomy | null = null;

function taxonomyPath(): string {
  return path.resolve(process.cwd(), 'data/kb/졸업요건/_taxonomy.json');
}

export function loadCollegeTaxonomy(force = false): CollegeTaxonomy {
  if (cache && !force) return cache;
  const p = taxonomyPath();
  if (!fs.existsSync(p)) {
    cache = { colleges: {} };
    return cache;
  }
  const raw = JSON.parse(fs.readFileSync(p, 'utf-8')) as {
    colleges?: Record<string, string[]>;
  };
  cache = { colleges: raw.colleges || {} };
  return cache;
}

export function listColleges(): string[] {
  return Object.keys(loadCollegeTaxonomy().colleges);
}

export function listDepartmentsInCollege(college: string): string[] {
  const map = loadCollegeTaxonomy().colleges;
  return map[college] || [];
}

export function resolveCollege(
  utterance: string,
  known: string[]
): { kind: 'exact' | 'contains' | 'ambiguous' | 'none'; college?: string; candidates?: string[] } {
  const t = utterance.trim();
  if (!t) return { kind: 'none' };
  const exact = known.find((c) => c === t);
  if (exact) return { kind: 'exact', college: exact };
  const hits = known.filter((c) => c.includes(t) || t.includes(c));
  if (hits.length === 1) return { kind: 'contains', college: hits[0] };
  if (hits.length > 1) return { kind: 'ambiguous', candidates: hits };
  return { kind: 'none' };
}

/** Recent admission years for Kakao buttons: currentYear-6 .. currentYear (7 buttons). */
export function recentAdmissionYears(now = new Date()): number[] {
  const y = now.getFullYear();
  const years: number[] = [];
  for (let i = 6; i >= 0; i--) years.push(y - i);
  return years;
}
