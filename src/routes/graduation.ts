import { Router } from 'express';
import {
  listDepartments,
  listYears,
  lookupGraduation,
  lookupOrMiss,
} from '../services/graduationService';

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
