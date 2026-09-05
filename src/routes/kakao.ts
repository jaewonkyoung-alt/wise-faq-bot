import { Router } from 'express';
import type { KakaoSkillRequest } from '../types/kakao';
import { handleKakaoDialog } from '../services/kakaoDialog';
import { menuReplies, simpleText } from '../kakao/responseBuilder';

export const kakaoRouter = Router();

/**
 * When KAKAO_SKILL_SECRET is set, require header x-kakao-skill-secret to match.
 * When unset, MVP stays open — production should set the secret (.env.example).
 */
function checkKakaoSkillSecret(req: {
  header: (n: string) => string | undefined;
}): boolean {
  const secret = (process.env.KAKAO_SKILL_SECRET || '').trim();
  if (!secret) return true; // MVP open
  const got = (req.header('x-kakao-skill-secret') || '').trim();
  return got === secret;
}

/**
 * Kakao Skill adapter → graduation slot-filling (primary) + clubs ask (secondary).
 */
kakaoRouter.post('/skill', async (req, res) => {
  if (!checkKakaoSkillSecret(req)) {
    res.status(401).json({ error: 'unauthorized' });
    return;
  }
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
