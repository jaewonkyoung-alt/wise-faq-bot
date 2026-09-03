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

export function defaultClubReplies(): KakaoQuickReply[] {
  return [
    { label: '동아리 목록', action: 'message', messageText: '동아리 목록 알려줘' },
    { label: '학술 분과', action: 'message', messageText: '학술 동아리 목록' },
    { label: '공연 분과', action: 'message', messageText: '공연 동아리 소개' },
    { label: '도움말', action: 'message', messageText: '도움말' },
  ];
}

export function buildAskSkillResponse(
  result: AskResult,
  utterance: string
): KakaoSkillResponse {
  const header =
    result.verified && result.citations.length > 0
      ? ''
      : result.route === 'refuse'
        ? ''
        : '';
  void utterance;
  void header;
  const text = result.answer.slice(0, 900);
  return simpleText(text, defaultClubReplies());
}
