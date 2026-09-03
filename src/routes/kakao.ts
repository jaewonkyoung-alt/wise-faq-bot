import { Router } from 'express';
import type { KakaoSkillRequest } from '../types/kakao';
import { ask } from '../services/askService';
import {
  buildAskSkillResponse,
  defaultClubReplies,
  simpleText,
} from '../kakao/responseBuilder';

export const kakaoRouter = Router();

/**
 * Thin Kakao Skill adapter → core ask().
 */
kakaoRouter.post('/skill', async (req, res) => {
  try {
    const body = req.body as KakaoSkillRequest;
    const utterance =
      body?.userRequest?.utterance?.trim() ||
      body?.action?.params?.query?.trim() ||
      body?.action?.params?.q?.trim() ||
      '';

    if (!utterance) {
      res.json(
        simpleText(
          'WISE 동아리 Q&A입니다. 동아리명·분과·활동·연락처 등을 물어보세요.',
          defaultClubReplies()
        )
      );
      return;
    }

    if (/^(카테고리|메뉴|도움말|help)$/i.test(utterance)) {
      res.json(
        simpleText(
          [
            '동국대 WISE 캠퍼스 동아리(클럽) Q&A (Phase-1 MVP)',
            '· 예: "코딩 동아리 연락처"',
            '· 예: "밴드 동아리 활동 소개"',
            '· 예: "학술 동아리 목록"',
            '동아리 외 학사/장학 등은 아직 지원하지 않습니다.',
          ].join('\n'),
          defaultClubReplies()
        )
      );
      return;
    }

    const result = await ask(utterance);
    res.json(buildAskSkillResponse(result, utterance));
  } catch (err) {
    console.error('[kakao]', err);
    res.json(
      simpleText(
        '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
        defaultClubReplies()
      )
    );
  }
});
