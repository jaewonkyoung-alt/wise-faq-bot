export interface Club {
  id: string;
  name: string;
  category: string;
  contact: string | null;
  meeting_time: string | null;
  location: string | null;
  intro: string;
  /** 한두 문장 소개 — 목록·답변에서 어떤 동아리인지 */
  summary: string;
  activities: string;
  source_url: string;
  updated_at: string;
  created_at: string;
}

export interface ClubInput {
  name: string;
  category: string;
  contact?: string | null;
  meeting_time?: string | null;
  location?: string | null;
  intro: string;
  summary?: string | null;
  activities: string;
  source_url: string;
}

export interface ClubEmbedding {
  id: number;
  club_id: string;
  chunk_kind: 'intro' | 'activities' | 'combined';
  chunk_text: string;
  embedding_json: string;
  updated_at: string;
}

export interface UnansweredQuestion {
  id: number;
  question: string;
  reason: string;
  route: string | null;
  status?: 'new' | 'resolved' | 'ignored';
  created_at: string;
}
