export interface Notice {
  id: string;
  title: string;
  body: string;
  link_url: string | null;
  pinned: boolean;
  published: boolean;
  starts_at: string | null;
  ends_at: string | null;
  /** 휴지통에 들어간 시각 (null = 게시 목록). 30일 뒤 완전히 삭제 */
  trashed_at: string | null;
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
