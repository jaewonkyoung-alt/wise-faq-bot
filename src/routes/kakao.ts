import { Router } from 'express';
import type { KakaoSkillRequest } from '../types/kakao';
import { handleKakaoDialog } from '../services/kakaoDialog';
import { menuReplies, simpleText } from '../kakao/responseBuilder';

export const kakaoRouter = Router();

/**
 * Kakao Skill adapter → graduation slot-filling (primary) + clubs ask (secondary).
 */
kakaoRouter.post('/skill', async (req, res) => {
  try {
    const body = req.body as KakaoSkillRequest;
    let utterance =
      body?.userRequest?.utterance?.trim() ||
      body?.action?.params?.query?.trim() ||
      body?.action?.params?.q?.trim() ||
      '';

    if (!utterance) {
      const intentName = body?.intent?.name?.trim() || '';
      const actionName = body?.action?.name?.trim() || '';
      const welcomeLike =
        /welcome|시작|봇\s*시작|첫인사|웰컴/i.test(intentName) ||
        /welcome|시작|봇\s*시작|첫인사|웰컴/i.test(actionName);
      if (welcomeLike) {
        utterance = '메뉴';
      }
    }

    const userKey =
      body?.userRequest?.user?.id?.trim() ||
      body?.userRequest?.user?.id ||
      'anonymous';

    const response = await handleKakaoDialog(String(userKey), utterance);
    res.json(response);
  } catch (err) {
    console.error('[kakao]', err);
    res.json(
      simpleText(
        '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.',
        menuReplies()
      )
    );
  }
});
