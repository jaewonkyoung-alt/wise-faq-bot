import type { KakaoSkillResponse } from '../types/kakao';
import {
  formatGraduationAnswer,
  formatGraduationMiss,
  listDepartments as listSqlDepartments,
  listYears as listSqlYears,
  lookupGraduation,
  parseAdmissionYear,
  resolveDepartment,
} from './graduationService';
import {
  absoluteKbUrl,
  hasKbGraduationData,
  listKbDepartments,
  listKbYears,
  lookupKbGraduation,
} from './kbGraduation';
import { answerRoomCode, parseRoomCode } from './roomCode';
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
  textWithPdfLink,
  yearReplies,
  departmentReplies,
} from '../kakao/responseBuilder';
import { ask } from './askService';

const MENU_UTTERANCES = /^(메뉴|시작|처음으로|home|menu|웰컴|환영|첫인사|입장|welcome)$/i;
const GRAD_UTTERANCES = /^(졸업요건|졸업\s*요건|졸업학점|졸업)$/i;
const CLUB_UTTERANCES = /^(동아리|클럽|club)$/i;
const MAP_UTTERANCES = /^(지도|캠퍼스\s*지도|map)$/i;

function isEmpty(u: string): boolean {
  return !u || !u.trim();
}

/** Departments: folder KB first, then SQLite union. */
function listDepartments(): string[] {
  const kb = listKbDepartments();
  const sql = listSqlDepartments();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of [...kb, ...sql]) {
    if (!seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  return out;
}

function listYears(): number[] {
  const set = new Set<number>([...listKbYears(), ...listSqlYears()]);
  return [...set].sort((a, b) => b - a);
}

function respondGraduationHit(
  year: number,
  department: string
): KakaoSkillResponse {
  // Prefer folder KB when present for this year+dept
  const kb = lookupKbGraduation(year, department);
  if (kb) {
    const abs = kb.pdfPublicPath
      ? absoluteKbUrl(kb.pdfPublicPath)
      : null;
    return textWithPdfLink({
      text: kb.text,
      pdfPublicPath: kb.pdfPublicPath,
      absolutePdfUrl: abs,
      quickReplies: menuReplies(),
    });
  }

  const row = lookupGraduation(year, department);
  if (!row) {
    logUnanswered(
      `졸업요건 ${year} ${department}`,
      `graduation_miss:${year}:${department}`,
      'graduation'
    );
    return simpleText(formatGraduationMiss(year, department), menuReplies());
  }

  // SQLite hit — if source_url looks like a PDF link, expose as button
  const src = row.source_url;
  const looksPdf =
    !!src && (/\.pdf($|\?)/i.test(src) || src.includes('/kb/'));
  if (looksPdf && src) {
    const abs =
      src.startsWith('http://') || src.startsWith('https://')
        ? src
        : absoluteKbUrl(src.startsWith('/') ? src : `/${src}`);
    return textWithPdfLink({
      text: formatGraduationAnswer(row),
      pdfPublicPath: src.startsWith('/') ? src : null,
      absolutePdfUrl: abs,
      quickReplies: menuReplies(),
    });
  }

  return simpleText(formatGraduationAnswer(row), menuReplies());
}

/**
 * Primary Kakao dialog: graduation slot-filling (year → dept → KB/SQL).
 * Map: room-code parse. Clubs secondary via ask().
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
    const kbHint = hasKbGraduationData()
      ? '\n(폴더 지식베이스 data/kb/졸업요건 우선)'
      : '';
    return simpleText(
      '졸업요건을 조회합니다.\n입학연도(학번)를 선택하거나 입력해 주세요.\n예: 2022, 22학번, 2022년 입학' +
        kbHint,
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
    // If utterance already contains a room code (e.g. "지도 S504"), answer now
    if (parseRoomCode(utterance)) {
      clearSession(userKey);
      resetToMenu(userKey);
      const ans = answerRoomCode(utterance)!;
      return simpleText(ans.text, menuReplies());
    }
    upsertSession(userKey, {
      flow: 'map_room',
      admission_year: null,
      department: null,
    });
    return simpleText(
      '호실 코드를 입력해 주세요.\n예: S504, A207, s-504\n(앞 글자=건물, 숫자 첫 자리=층)',
      [
        quickMessage('S504', 'S504'),
        quickMessage('A207', 'A207'),
        quickMessage('메뉴', '메뉴'),
      ]
    );
  }

  // Slot: map room code follow-up
  if (session.flow === 'map_room') {
    const ans = answerRoomCode(utterance);
    clearSession(userKey);
    resetToMenu(userKey);
    if (!ans) {
      logUnanswered(utterance, 'map_room_unparsed', 'map');
      return simpleText(
        '호실 코드를 이해하지 못했습니다.\n예: S504, A207, BST101',
        menuReplies()
      );
    }
    return simpleText(ans.text, menuReplies());
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

  // Slot: waiting for department → KB then SQL lookup
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
    clearSession(userKey);
    resetToMenu(userKey);
    return respondGraduationHit(year, department);
  }

  // Clubs free-text mode (or leftover after 동아리 prompt)
  if (session.flow === 'clubs') {
    const result = await ask(utterance);
    return buildAskSkillResponse(result, utterance);
  }

  // Opportunistic room-code anywhere (e.g. user types S504 on menu)
  if (parseRoomCode(utterance) && /^[A-Za-z]{1,5}\s*[-–—]?\s*\d{2,4}$/.test(utterance)) {
    clearSession(userKey);
    resetToMenu(userKey);
    const ans = answerRoomCode(utterance)!;
    return simpleText(ans.text, menuReplies());
  }

  // Default: treat as free-text clubs ask if looks club-related, else show menu
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
        resetToMenu(userKey);
        return respondGraduationHit(year, resolved.department);
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
  respondGraduationHit,
  listDepartments,
  listYears,
};

