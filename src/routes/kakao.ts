import { Router } from 'express';
import type { KakaoSkillRequest } from '../types/kakao';
import { searchFaqs, getCategories } from '../services/faqStore';
import {
  buildFaqSkillResponse,
  simpleText,
  defaultCategoryReplies,
} from '../kakao/responseBuilder';

export const kakaoRouter = Router();

/**
 * Kakao Open Builder Skill webhook.
 * Expects Skill request JSON; returns Skill response JSON v2.0.
 */
kakaoRouter.post('/skill', (req, res) => {
  const body = req.body as KakaoSkillRequest;
  const utterance =
    body?.userRequest?.utterance?.trim() ||
    body?.action?.params?.query?.trim() ||
    body?.action?.params?.q?.trim() ||
    '';

  if (!utterance) {
    res.json(
      simpleText(
        '무엇을 도와드릴까요? 키워드를 입력하거나 아래 카테고리를 선택해 주세요.',
        defaultCategoryReplies()
      )
    );
    return;
  }

  // Category list shortcut
  if (/^(카테고리|메뉴|도움말|help)$/i.test(utterance)) {
    const cats = getCategories().join('\n· ');
    res.json(
      simpleText(
        `WISE 캠퍼스 FAQ 카테고리:\n· ${cats}\n\n궁금한 내용을 키워드로 입력해 주세요.`,
        defaultCategoryReplies()
      )
    );
    return;
  }

  const results = searchFaqs(utterance, 5).map((r) => r.item);
  res.json(buildFaqSkillResponse(results, utterance));
});
