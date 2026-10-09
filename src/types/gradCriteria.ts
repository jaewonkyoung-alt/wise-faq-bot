/** 학생구분 — 가이드 기준표의 세로 구역 */
export type StudentType =
  | '신입생-내국인'
  | '편입생-내국인'
  | '신입생-외국인'
  | '편입생-외국인'
  | '신입생-내·외국인'
  | '편입생-내·외국인';

/** 공식 졸업기준 한 줄 (학과 × 학번 구간 × 학생구분). 값은 원문 표기 그대로. */
export interface GradCriteria {
  dept_no: number;
  department: string;
  /** 의예과·한의예과처럼 한 학과에 과정이 둘인 경우만 값이 있다 */
  program: string;
  year_label: string;
  year_from: number;
  year_to: number;
  student_type: StudentType;
  /** 그 학번 당시 소속 명칭 (예: 컴퓨터공학전공) */
  affiliation: string | null;
  personality_self: string | null;
  personality: string | null;
  communication: string | null;
  liberal_foreign: string | null;
  digital: string | null;
  academic_basic: string | null;
  convergence: string | null;
  foreign_common: string | null;
  major_single: string | null;
  major_primary: string | null;
  major_double: string | null;
  total_credits: string | null;
  gpa: string | null;
  volunteer: string | null;
  lang_requirement: string | null;
  lang_test: string | null;
  thesis: string | null;
  notes: string | null;
  source_page: number | null;
}

export interface GradDepartment {
  name: string;
  dept_no: number;
  homepage_name: string | null;
  phone: string | null;
  status: string | null;
  pdf_url: string | null;
}
