/** Kakao Open Builder Skill request (simplified for MVP) */
export interface KakaoSkillRequest {
  intent?: {
    id?: string;
    name?: string;
  };
  userRequest?: {
    utterance?: string;
    user?: { id?: string; type?: string };
    timezone?: string;
  };
  bot?: { id?: string; name?: string };
  action?: {
    id?: string;
    name?: string;
    params?: Record<string, string>;
    detailParams?: Record<string, { origin?: string; value?: string }>;
  };
}

/** Kakao Skill response JSON v2.0 — built only via kakao/responseBuilder */
export interface KakaoSkillResponse {
  version: '2.0';
  template: {
    outputs: KakaoOutput[];
    quickReplies?: KakaoQuickReply[];
  };
}

export type KakaoOutput =
  | { simpleText: { text: string } }
  | { simpleImage: { imageUrl: string; altText?: string } };

export interface KakaoQuickReply {
  label: string;
  action: 'message' | 'block';
  messageText?: string;
  blockId?: string;
}
