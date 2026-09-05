import type { AskResult } from '../types/ask';
import type {
  KakaoButton,
  KakaoQuickReply,
  KakaoSkillResponse,
} from '../types/kakao';

/**
 * Isolates all Kakao Open Builder Skill response v2.0 formatting.
 * REST routes must not build Kakao JSON; only this module does.
 */
export function simpleText(
  text: string,
  quickReplies?: KakaoQuickReply[]
): KakaoSkillResponse {
  const response: KakaoSkillResponse = {
    version: '2.0',
    template: {
      outputs: [{ simpleText: { text } }],
    },
  };
  if (quickReplies && quickReplies.length > 0) {
    response.template.quickReplies = quickReplies;
  }
  return response;
}

export function quickMessage(label: string, messageText?: string): KakaoQuickReply {
  return {
    label: label.slice(0, 25),
    action: 'message',
    messageText: messageText ?? label,
  };
}

/** Primary menu: 졸업요건 first, then clubs / map */
export function menuReplies(): KakaoQuickReply[] {
  return [
    quickMessage('졸업요건', '졸업요건'),
    quickMessage('동아리', '동아리'),
    quickMessage('지도', '지도'),
  ];
}

export function yearReplies(yearsFromDb: number[]): KakaoQuickReply[] {
  const base =
    yearsFromDb.length > 0
      ? yearsFromDb.slice(0, 5)
      : [2021, 2022, 2023, 2024, 2025];
  // Ensure a common range is offered for testing even if DB years differ
  const set = new Set<number>([...base, 2021, 2022, 2023, 2024, 2025]);
  const years = [...set].sort((a, b) => a - b).slice(0, 6);
  const replies = years.map((y) => quickMessage(String(y), String(y)));
  replies.push(quickMessage('메뉴', '메뉴'));
  return replies;
}

export function departmentReplies(departments: string[]): KakaoQuickReply[] {
  const replies = departments.slice(0, 8).map((d) => quickMessage(d, d));
  replies.push(quickMessage('메뉴', '메뉴'));
  return replies;
}

/** @deprecated Prefer menuReplies — kept for clubs follow-up buttons */
export function defaultClubReplies(): KakaoQuickReply[] {
  return [
    quickMessage('동아리 목록', '동아리 목록 알려줘'),
    quickMessage('학술 분과', '학술 동아리 목록'),
    quickMessage('졸업요건', '졸업요건'),
    quickMessage('메뉴', '메뉴'),
  ];
}

export function buildAskSkillResponse(
  result: AskResult,
  utterance: string
): KakaoSkillResponse {
  void utterance;
  const text = result.answer.slice(0, 900);
  return simpleText(text, defaultClubReplies());
}

/**
 * Text + optional PDF webLink button (Kakao cannot attach raw PDF bytes).
 * Uses basicCard when an absolute URL is available; otherwise simpleText with a tip.
 */
export function textWithPdfLink(opts: {
  text: string;
  pdfPublicPath?: string | null;
  absolutePdfUrl?: string | null;
  buttonLabel?: string;
  quickReplies?: KakaoQuickReply[];
}): KakaoSkillResponse {
  const label = (opts.buttonLabel || '졸업요건 PDF').slice(0, 14);
  const abs = opts.absolutePdfUrl || null;
  const rel = opts.pdfPublicPath || null;

  if (abs) {
    const buttons: KakaoButton[] = [
      { label, action: 'webLink', webLinkUrl: abs },
    ];
    const response: KakaoSkillResponse = {
      version: '2.0',
      template: {
        outputs: [
          {
            basicCard: {
              description: opts.text.slice(0, 200),
              buttons,
            },
          },
          // Also include full text for readability (Kakao basicCard desc is short)
          { simpleText: { text: opts.text.slice(0, 900) } },
        ],
      },
    };
    if (opts.quickReplies && opts.quickReplies.length > 0) {
      response.template.quickReplies = opts.quickReplies;
    }
    return response;
  }

  // No PUBLIC_BASE_URL — show path tip so admins know how to configure
  let text = opts.text;
  if (rel) {
    text +=
      `\n\n[PDF] ${rel}` +
      `\n(절대 URL 버튼: .env PUBLIC_BASE_URL 설정 후 재시작. 로컬: http://localhost:PORT${rel})`;
  }
  return simpleText(text.slice(0, 1000), opts.quickReplies);
}
