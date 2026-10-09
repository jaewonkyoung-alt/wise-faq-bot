import { Router } from 'express';
import {
  listDepartments,
  listYears,
  lookupGraduation,
  lookupOrMiss,
} from '../services/graduationService';
import {
  findCriteria,
  formatCriteriaAnswer,
  formatCriteriaMiss,
  getGradDepartment,
  resolveGradDepartment,
} from '../services/gradCriteria';
import type { StudentType } from '../types/gradCriteria';

const STUDENT_TYPES: StudentType[] = ['신입생-내국인', '편입생-내국인', '신입생-외국인', '편입생-외국인'];

export const graduationRouter = Router();

/** Exact lookup — facts from SQL only */
graduationRouter.get('/graduation', (req, res) => {
  const yearRaw = req.query.year;
  const department = String(req.query.department ?? '').trim();
  const majorType =
    req.query.major_type != null ? String(req.query.major_type) : undefined;

  const year = Number(yearRaw);
  if (!Number.isFinite(year) || !department) {
    res.status(400).json({
      error: 'year (number) and department (string) are required',
    });
    return;
  }

  const result = lookupOrMiss(
    year,
    department,
    majorType,
    `GET /api/graduation?year=${year}&department=${department}`
  );

  if (!result.found) {
    res.status(404).json({
      found: false,
      message: '확인되지 않음 / 데이터 없음',
      query: { year, department, major_type: majorType ?? null },
      answer: result.answer,
    });
    return;
  }

  res.json({
    found: true,
    requirement: result.row,
    answer: result.answer,
    citations: {
      source_url: result.row.source_url,
      verified_at: result.row.verified_at,
      updated_at: result.row.updated_at,
    },
  });
});

/**
 * 공식 가이드 기준 조회. 학과명은 옛 이름·다른 표기도 받는다.
 *   GET /api/graduation/criteria?year=2021&department=컴퓨터공학전공&type=신입생-내국인
 */
graduationRouter.get('/graduation/criteria', (req, res) => {
  const year = Number(req.query.year);
  const deptText = String(req.query.department ?? '').trim();
  const type = (String(req.query.type ?? '신입생-내국인') as StudentType);
  if (!Number.isInteger(year) || !deptText) {
    res.status(400).json({ error: 'year (number) and department (string) are required' });
    return;
  }
  if (!STUDENT_TYPES.includes(type)) {
    res.status(400).json({ error: `type must be one of ${STUDENT_TYPES.join(', ')}` });
    return;
  }
  const resolved = resolveGradDepartment(deptText);
  if (resolved.kind === 'ambiguous') {
    res.status(300).json({ found: false, candidates: resolved.candidates });
    return;
  }
  if (resolved.kind === 'none') {
    res.status(404).json({ found: false, message: '학과를 찾지 못했습니다', query: { year, department: deptText } });
    return;
  }
  const department = resolved.department;
  const rows = findCriteria(year, department, type);
  const dept = getGradDepartment(department);
  if (rows.length === 0) {
    res.status(404).json({ found: false, department, answer: formatCriteriaMiss(year, department, type) });
    return;
  }
  res.json({
    found: true,
    department,
    criteria: rows,
    answer: formatCriteriaAnswer(year, department, rows, type),
    citations: { guide: '2026 학사제도 및 학업이수가이드', pdf_url: dept?.pdf_url ?? null },
  });
});

graduationRouter.get('/graduation/departments', (_req, res) => {
  res.json({ departments: listDepartments() });
});

graduationRouter.get('/graduation/years', (_req, res) => {
  res.json({ years: listYears() });
});

/** Direct exact helper used by tests */
export function lookupForTest(year: number, department: string) {
  return lookupGraduation(year, department);
}
