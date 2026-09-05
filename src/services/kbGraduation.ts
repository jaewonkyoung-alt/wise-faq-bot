import fs from 'fs';
import path from 'path';

export interface KbGradEntry {
  department: string;
  year: number;
  text: string;
  /** Relative public path starting with /kb/... or null if no PDF */
  pdfPublicPath: string | null;
  /** Absolute filesystem path to year folder */
  folderPath: string;
  pdfFileName: string | null;
}

export interface KbScanResult {
  departments: string[];
  years: number[];
  entries: KbGradEntry[];
  scannedAt: string;
}

let cache: KbScanResult | null = null;

function gradRoot(): string {
  return path.resolve(process.cwd(), 'data/kb/졸업요건');
}

function isYearDir(name: string): boolean {
  return /^(20\d{2})$/.test(name);
}

function encodeKbPath(...parts: string[]): string {
  // Keep Korean path segments URL-encoded for safety in webLink
  return (
    '/kb/' +
    parts.map((p) => encodeURIComponent(p)).join('/')
  );
}

/** Human-readable /kb path (unencoded Korean) for display / Express static */
export function kbPublicPath(...parts: string[]): string {
  return '/kb/' + parts.join('/');
}

function findPdf(dir: string): string | null {
  try {
    const files = fs.readdirSync(dir);
    const pdf = files.find((f) => f.toLowerCase().endsWith('.pdf'));
    return pdf ?? null;
  } catch {
    return null;
  }
}

function readInfo(dir: string): string | null {
  const candidates = ['info.md', 'INFO.md', 'info.txt', 'README.md'];
  for (const name of candidates) {
    const p = path.join(dir, name);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) {
      return fs.readFileSync(p, 'utf-8').trim();
    }
  }
  return null;
}

export function scanGraduationKb(force = false): KbScanResult {
  if (cache && !force) return cache;

  const root = gradRoot();
  const entries: KbGradEntry[] = [];
  const deptSet = new Set<string>();
  const yearSet = new Set<number>();

  if (fs.existsSync(root) && fs.statSync(root).isDirectory()) {
    const depts = fs
      .readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b, 'ko'));

    for (const dept of depts) {
      const deptPath = path.join(root, dept);
      const years = fs
        .readdirSync(deptPath, { withFileTypes: true })
        .filter((d) => d.isDirectory() && isYearDir(d.name))
        .map((d) => d.name)
        .sort();

      for (const yStr of years) {
        const year = Number(yStr);
        const yearPath = path.join(deptPath, yStr);
        const text = readInfo(yearPath);
        if (!text) continue;
        const pdfFileName = findPdf(yearPath);
        const pdfPublicPath = pdfFileName
          ? kbPublicPath('졸업요건', dept, yStr, pdfFileName)
          : null;

        deptSet.add(dept);
        yearSet.add(year);
        entries.push({
          department: dept,
          year,
          text,
          pdfPublicPath,
          folderPath: yearPath,
          pdfFileName,
        });
      }
    }
  }

  cache = {
    departments: [...deptSet].sort((a, b) => a.localeCompare(b, 'ko')),
    years: [...yearSet].sort((a, b) => b - a),
    entries,
    scannedAt: new Date().toISOString(),
  };
  return cache;
}

export function reloadGraduationKb(): KbScanResult {
  return scanGraduationKb(true);
}

export function listKbDepartments(): string[] {
  return scanGraduationKb().departments;
}

export function listKbYears(): number[] {
  return scanGraduationKb().years;
}

export function lookupKbGraduation(
  year: number,
  department: string
): KbGradEntry | null {
  const { entries } = scanGraduationKb();
  const dept = department.trim();
  const exact = entries.find(
    (e) => e.year === year && e.department === dept
  );
  if (exact) return exact;

  const norm = (s: string) => s.replace(/\s+/g, '');
  const loose = entries.find(
    (e) => e.year === year && norm(e.department) === norm(dept)
  );
  return loose ?? null;
}

/** Absolute URL for Kakao webLink, or null if PUBLIC_BASE_URL unset. */
export function absoluteKbUrl(publicPath: string): string | null {
  const base = (process.env.PUBLIC_BASE_URL || '').trim().replace(/\/$/, '');
  if (!base) return null;
  // publicPath may already be encoded or not — normalize
  if (publicPath.startsWith('http://') || publicPath.startsWith('https://')) {
    return publicPath;
  }
  // Encode each segment except leading /kb
  const cleaned = publicPath.replace(/^\/kb\/?/, '');
  const encoded = encodeKbPath(...cleaned.split('/').map(decodeURIComponentSafe));
  return base + encoded;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

export function hasKbGraduationData(): boolean {
  return scanGraduationKb().entries.length > 0;
}
