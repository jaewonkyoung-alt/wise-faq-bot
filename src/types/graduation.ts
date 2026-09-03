export interface GraduationRequirement {
  id: string;
  admission_year: number;
  department: string;
  major_type: string | null;
  total_credits: number | null;
  major_credits: number | null;
  general_credits: number | null;
  notes: string | null;
  source_url: string | null;
  verified_at: string | null;
  updated_at: string;
}

export interface GraduationInput {
  admission_year: number;
  department: string;
  major_type?: string | null;
  total_credits?: number | null;
  major_credits?: number | null;
  general_credits?: number | null;
  notes?: string | null;
  source_url?: string | null;
  verified_at?: string | null;
}

export type KakaoFlow = 'menu' | 'grad_year' | 'grad_dept' | 'done' | 'clubs';

export interface KakaoSession {
  user_key: string;
  flow: KakaoFlow;
  admission_year: number | null;
  department: string | null;
  updated_at: string;
}
