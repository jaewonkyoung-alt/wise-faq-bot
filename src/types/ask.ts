export type AskRoute = 'structured_query' | 'semantic_search' | 'refuse';

export interface Citation {
  club_id: string;
  club_name: string;
  source_url: string;
  updated_at: string;
}

export interface AskResult {
  answer: string;
  route: AskRoute;
  verified: boolean;
  citations: Citation[];
  scores?: { club_id: string; score: number }[];
  tool_args?: Record<string, unknown>;
}

export interface StructuredQueryArgs {
  name?: string;
  category?: string;
  fields?: Array<
    'name' | 'category' | 'contact' | 'meeting_time' | 'location' | 'intro' | 'activities' | 'source_url' | 'updated_at'
  >;
}

export interface SemanticSearchArgs {
  query: string;
  top_k?: number;
}
