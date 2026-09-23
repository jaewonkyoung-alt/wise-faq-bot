export interface Notice {
  id: string;
  title: string;
  body: string;
  link_url: string | null;
  pinned: boolean;
  published: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface NoticeInput {
  title: string;
  body: string;
  link_url?: string | null;
  pinned?: boolean;
  published?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
}
