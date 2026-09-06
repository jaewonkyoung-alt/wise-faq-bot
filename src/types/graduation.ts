export interface GraduationRequirement {
  id: string;
  admission_year: number;
  department: string;
  major_type: string | null;
  total_credits: number | null;
  major_credits: number | null;
  general_credits: number | null;
  thesis_required: boolean | null;
  english_requirement: string | null;
  license_requirement: string | null;
  track: string | null;
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
  thesis_required?: boolean | null;
  english_requirement?: string | null;
  license_requirement?: string | null;
  track?: string | null;
  notes?: string | null;
  source_url?: string | null;
  verified_at?: string | null;
}

export type KakaoFlow = 'menu' | 'grad_year' | 'grad_college' | 'grad_dept' | 'done' | 'clubs' | 'map_room' | 'notices';

export interface KakaoSession {
  user_key: string;
  flow: KakaoFlow;
  admission_year: number | null;
  college: string | null;
  department: string | null;
  updated_at: string;
}
