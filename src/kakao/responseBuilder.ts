import type { FaqItem } from '../types/faq';
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

export function faqToSkillText(item: FaqItem): string {
  const lines = [
    `【${item.category}】`,
    `Q. ${item.question}`,
    '',
    item.answer,
  ];
  if (item.links.length > 0) {
    lines.push('', '관련 링크:');
    for (const link of item.links) {
      lines.push(`· ${link.title}: ${link.url}`);
    }
  }
  return lines.join('\n');
}

export function buildFaqSkillResponse(
  items: FaqItem[],
  utterance: string
): KakaoSkillResponse {
  if (items.length === 0) {
    return simpleText(
      `죄송합니다. "${utterance}"에 대한 FAQ를 찾지 못했습니다.\n다른 키워드로 다시 물어보시거나, 아래 카테고리를 참고해 주세요.`,
      defaultCategoryReplies()
    );
  }

  if (items.length === 1) {
    return simpleText(faqToSkillText(items[0]), defaultCategoryReplies());
  }

  const header = `"${utterance}" 관련 FAQ ${items.length}건입니다.\n`;
  const body = items
    .slice(0, 5)
    .map((item, i) => `${i + 1}. [${item.category}] ${item.question}`)
    .join('\n');
  const detail = '\n\n---\n' + faqToSkillText(items[0]);

  return simpleText(header + body + detail, [
    ...items.slice(0, 3).map((item) => ({
      label: item.question.slice(0, 20),
      action: 'message' as const,
      messageText: item.question,
    })),
    ...defaultCategoryReplies().slice(0, 2),
  ]);
}

export function defaultCategoryReplies(): KakaoQuickReply[] {
  return [
    { label: '학사일정', action: 'message', messageText: '학사일정' },
    { label: '학식/생활', action: 'message', messageText: '학식' },
    { label: '연락처', action: 'message', messageText: '연락처' },
    { label: '증명서', action: 'message', messageText: '증명서' },
  ];
}
