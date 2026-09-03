import type { KakaoQuickReply, KakaoSkillResponse } from '../types/kakao';
import {
  formatGraduationAnswer,
  formatGraduationMiss,
  listDepartments,
  listYears,
  lookupGraduation,
  parseAdmissionYear,
  resolveDepartment,
} from './graduationService';
import { logUnanswered } from './unanswered';
import {
  clearSession,
  getSession,
  resetToMenu,
  upsertSession,
} from './kakaoSession';
import {
  buildAskSkillResponse,
  menuReplies,
  quickMessage,
  simpleText,
  yearReplies,
  departmentReplies,
} from '../kakao/responseBuilder';
import { ask } from './askService';

const MENU_UTTERANCES = /^(메뉴|시작|처음으로|home|menu)$/i;
const GRAD_UTTERANCES = /^(졸업요건|졸업\s*요건|졸업학점|졸업)$/i;
const CLUB_UTTERANCES = /^(동아리|클럽|club)$/i;
const MAP_UTTERANCES = /^(지도|캠퍼스\s*지도|map)$/i;

function isEmpty(u: string): boolean {
  return !u || !u.trim();
}

/**
 * Primary Kakao dialog: graduation slot-filling (year → dept → SQL).
 * Clubs secondary via ask(); map is a stub.
 */
export async function handleKakaoDialog(
  userKey: string,
  utteranceRaw: string
): Promise<KakaoSkillResponse> {
  const utterance = (utteranceRaw || '').trim();
  const session = getSession(userKey) ?? resetToMenu(userKey);

  // Global: menu / empty → top quickReplies
  if (isEmpty(utterance) || MENU_UTTERANCES.test(utterance)) {
    resetToMenu(userKey);
    return simpleText(
      '동국대 WISE 캠퍼스 FAQ입니다.\n원하시는 메뉴를 선택해 주세요.',
      menuReplies()
    );
  }

  // Explicit menu intents (override mid-flow)
  if (GRAD_UTTERANCES.test(utterance)) {
    upsertSession(userKey, {
      flow: 'grad_year',
      admission_year: null,
      department: null,
    });
    const years = listYears();
    return simpleText(
      '졸업요건을 조회합니다.\n입학연도(학번)를 선택하거나 입력해 주세요.\n예: 2022, 22학번, 2022년 입학',
      yearReplies(years)
    );
  }

  if (CLUB_UTTERANCES.test(utterance)) {
    upsertSession(userKey, {
      flow: 'clubs',
      admission_year: null,
      department: null,
    });
    return simpleText(
      '동아리 질문을 입력해 주세요.\n예: "와이즈코딩 연락처", "학술 동아리 목록"',
      [
        quickMessage('동아리 목록', '동아리 목록 알려줘'),
        quickMessage('메뉴', '메뉴'),
      ]
    );
  }

  if (MAP_UTTERANCES.test(utterance)) {
    resetToMenu(userKey);
    return simpleText('지도 기능은 준비 중입니다.', menuReplies());
  }

  // Slot: waiting for year
  if (session.flow === 'grad_year') {
    const year = parseAdmissionYear(utterance);
    if (year == null) {
      return simpleText(
        '입학연도를 이해하지 못했습니다.\n예: 2022, 22학번, 2022년 입학',
        yearReplies(listYears())
      );
    }
    upsertSession(userKey, { flow: 'grad_dept', admission_year: year });
    const depts = listDepartments();
    return simpleText(
      `${year}학번으로 저장했습니다.\n학과를 선택하거나 입력해 주세요.`,
      departmentReplies(depts)
    );
  }

  // Slot: waiting for department → SQL lookup
  if (session.flow === 'grad_dept') {
    const year = session.admission_year;
    if (year == null) {
      upsertSession(userKey, { flow: 'grad_year' });
      return simpleText(
        '입학연도부터 다시 선택해 주세요.',
        yearReplies(listYears())
      );
    }

    const known = listDepartments();
    const resolved = resolveDepartment(utterance, known);

    if (resolved.kind === 'ambiguous') {
      return simpleText(
        `학과가 여러 개 후보입니다. 버튼을 눌러 정확히 선택해 주세요.\n후보: ${resolved.candidates.join(', ')}`,
        departmentReplies(resolved.candidates)
      );
    }
    if (resolved.kind === 'none') {
      return simpleText(
        '등록된 학과 목록에서 찾지 못했습니다. 아래 버튼 중 하나를 선택해 주세요.',
        departmentReplies(known)
      );
    }

    const department = resolved.department;
    const row = lookupGraduation(year, department);
    clearSession(userKey);
    resetToMenu(userKey);

    if (!row) {
      logUnanswered(
        `졸업요건 ${year} ${department}`,
        `graduation_miss:${year}:${department}`,
        'graduation'
      );
      return simpleText(formatGraduationMiss(year, department), menuReplies());
    }

    return simpleText(formatGraduationAnswer(row), menuReplies());
  }

  // Clubs free-text mode (or leftover after 동아리 prompt)
  if (session.flow === 'clubs') {
    const result = await ask(utterance);
    return buildAskSkillResponse(result, utterance);
  }

  // Default: treat as free-text clubs ask if looks club-related, else show menu
  // Keep clubs working for arbitrary questions without breaking openrouter path
  if (
    /동아리|클럽|분과|연락처|모임|소개|활동/.test(utterance) ||
    session.flow === 'menu' ||
    session.flow === 'done'
  ) {
    // If clearly graduation-ish free text with year+dept, try one-shot
    const year = parseAdmissionYear(utterance);
    if (year != null && /졸업|학점|요건/.test(utterance)) {
      const known = listDepartments();
      const resolved = resolveDepartment(utterance, known);
      if (resolved.kind === 'exact' || resolved.kind === 'contains') {
        const row = lookupGraduation(year, resolved.department);
        resetToMenu(userKey);
        if (!row) {
          logUnanswered(
            utterance,
            `graduation_miss:${year}:${resolved.department}`,
            'graduation'
          );
          return simpleText(
            formatGraduationMiss(year, resolved.department),
            menuReplies()
          );
        }
        return simpleText(formatGraduationAnswer(row), menuReplies());
      }
      // year known but dept missing → start slot at dept
      upsertSession(userKey, {
        flow: 'grad_dept',
        admission_year: year,
        department: null,
      });
      return simpleText(
        `${year}학번으로 인식했습니다.\n학과를 선택하거나 입력해 주세요.`,
        departmentReplies(listDepartments())
      );
    }

    if (/동아리|클럽|분과|연락처|모임/.test(utterance)) {
      const result = await ask(utterance);
      return buildAskSkillResponse(result, utterance);
    }
  }

  resetToMenu(userKey);
  return simpleText(
    '메뉴에서 선택해 주세요.\n졸업요건 · 동아리 · 지도',
    menuReplies()
  );
}

/** Export helpers for tests */
export const __test = {
  MENU_UTTERANCES,
  GRAD_UTTERANCES,
};
