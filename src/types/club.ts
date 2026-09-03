export interface Club {
  id: string;
  name: string;
  category: string;
  contact: string | null;
  meeting_time: string | null;
  location: string | null;
  intro: string;
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
  created_at: string;
}
