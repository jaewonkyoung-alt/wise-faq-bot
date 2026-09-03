import type { AskResult } from '../types/ask';
import type {
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
