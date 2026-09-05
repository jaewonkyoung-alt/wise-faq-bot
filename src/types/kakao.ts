/** Kakao Open Builder Skill request (simplified) */
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

export interface KakaoButton {
  label: string;
  action: 'webLink' | 'message' | 'block';
  webLinkUrl?: string;
  messageText?: string;
  blockId?: string;
}

export type KakaoOutput =
  | { simpleText: { text: string } }
  | { simpleImage: { imageUrl: string; altText?: string } }
  | {
      basicCard: {
        title?: string;
        description?: string;
        thumbnail?: { imageUrl: string };
        buttons?: KakaoButton[];
      };
    }
  | {
      listCard: {
        header: { title: string };
        items?: Array<{
          title: string;
          description?: string;
          link?: { web?: string };
        }>;
        buttons?: KakaoButton[];
      };
    };

export interface KakaoQuickReply {
  label: string;
  action: 'message' | 'block';
  messageText?: string;
  blockId?: string;
}
