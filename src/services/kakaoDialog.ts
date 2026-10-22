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
  listKbDepartments,
  listKbYears,
  lookupKbGraduation,
} from './kbGraduation';
import { answerPlaceQuery, answerRoomCode, isPlaceName, parseRoomCode, type RoomAnswer } from './roomCode';
import {
  findCriteria,
  formatCriteriaAnswer,
  formatCriteriaMiss,
  getGradDepartment,
  listCriteriaDepartments,
  resolveGradDepartment,
} from './gradCriteria';
import type { StudentType } from '../types/gradCriteria';
import {
  listAllCollegeNames,
  listColleges,
  listDepartmentsInCollege,
  recentAdmissionYears,
  resolveCollege,
} from './collegeTaxonomy';
import { logUnanswered } from './unanswered';
import { keywordTopics } from './clubKeywords';
import { formatNoticesForKakao, listPublishedNotices } from './noticeService';
import {
  formatNoticeBanner,
  isSubscribed,
  markDelivered,
  pendingNotices,
  subscribe,
  unsubscribe,
} from './noticeSubscription';
import {
  clearSession,
  getSession,
  resetToMenu,
  upsertSession,
} from './kakaoSession';
import {
  buildAskSkillResponse,
  menuReplies,
  noticeReplies,
  prependText,
  multiText,
  quickMessage,
  simpleText,
  textWithPdfLink,
  textWithLinkCard,
  yearReplies,
  collegeReplies,
  departmentReplies,
  gradResultReplies,
} from '../kakao/responseBuilder';
import { ask } from './askService';
import { clubDetailText, clubListAnswer, clubListRequest, findClubByExactName } from './clubList';

const MENU_UTTERANCES = /^(메뉴|시작|처음으로|home|menu|웰컴|환영|첫인사|입장|welcome)$/i;
const GRAD_UTTERANCES = /^(졸업요건|졸업\s*요건|졸업학점|졸업)$/i;
const CLUB_UTTERANCES = /^(동아리|클럽|club)$/i;
const MAP_UTTERANCES = /^(지도|캠퍼스\s*지도|map)$/i;
/** 위치를 묻는 말 — 메뉴 밖에서 건물 이름이 나오면 지도 답변 */
const WHERE_UTTERANCES = /어디|위치|가는\s*길|찾아가/;
const NOTICE_UTTERANCES = /^(공지|공지사항|알림|notice)$/i;
const NOTICE_SUB_ON = /^(새\s*)?(공지\s*)?알림\s*(받기|켜기|신청|구독)$/;
const NOTICE_SUB_OFF = /^(공지\s*)?알림\s*(끄기|해제|취소|그만)$/;
/** 졸업요건 답변 뒤 버튼: 같은 학번·학과로 학생구분만 바꿔 다시 조회 */
const GRAD_TYPE_UTTERANCES: Record<string, StudentType> = {
  '신입생 기준': '신입생-내국인',
  '편입생 기준': '편입생-내국인',
  '외국인 기준': '신입생-외국인',
  '외국인 편입생 기준': '편입생-외국인',
};

function isEmpty(u: string): boolean {
  return !u || !u.trim();
}

/** Departments: 공식 가이드 기준(42개) 먼저, 그다음 폴더 KB · 관리자 수동 등록분. */
function listDepartments(): string[] {
  const official = listCriteriaDepartments();
  const kb = listKbDepartments();
  const sql = listSqlDepartments();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of [...official, ...kb, ...sql]) {
    if (!seen.has(d)) {
      seen.add(d);
      out.push(d);
    }
  }
  return out;
}

function listYears(): number[] {
  return recentAdmissionYears();
}

function departmentsForCollege(college: string | null): string[] {
  if (college) {
    const inCollege = listDepartmentsInCollege(college);
    if (inCollege.length > 0) return inCollege;
  }
  return listDepartments();
}

function respondGraduationHit(
  userKey: string,
  year: number,
  department: string,
  type: StudentType = '신입생-내국인'
): KakaoSkillResponse {
  // 1순위: 학교 가이드에서 추출한 공식 기준 (학번 구간으로 조회)
  if (listCriteriaDepartments().includes(department)) {
    // 답변 뒤 '편입생 기준' 같은 버튼이 같은 학번·학과를 쓰도록 기억해 둔다
    upsertSession(userKey, { flow: 'grad_result', admission_year: year, college: null, department });
    const rows = findCriteria(year, department, type);
    if (rows.length === 0) {
      return simpleText(formatCriteriaMiss(year, department, type), gradResultReplies());
    }
    return textWithPdfLink({
      text: formatCriteriaAnswer(year, department, rows, type),
      absolutePdfUrl: getGradDepartment(department)?.pdf_url ?? null,
      buttonLabel: '학과 원문 PDF',
      quickReplies: gradResultReplies(),
    });
  }

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
 * 카카오 진입점: 대화 응답을 만든 뒤, 공지 알림 구독자에게는
 * 아직 받지 않은 새 공지를 답변 앞에 붙인다.
 */
export async function handleKakaoDialog(
  userKey: string,
  utteranceRaw: string
): Promise<KakaoSkillResponse> {
  const response = await dialog(userKey, utteranceRaw);
  const utterance = (utteranceRaw || '').trim();
  // 공지 메뉴·구독 응답 자체에는 붙이지 않는다 (같은 내용 반복 방지)
  if (
    NOTICE_UTTERANCES.test(utterance) ||
    NOTICE_SUB_ON.test(utterance) ||
    NOTICE_SUB_OFF.test(utterance)
  ) {
    return response;
  }
  try {
    const { notices, total } = pendingNotices(userKey);
    if (notices.length === 0) return response;
    const withBanner = prependText(response, formatNoticeBanner(notices, total));
    if (!withBanner) return response;
    markDelivered(userKey, notices.map((n) => n.id));
    return withBanner;
  } catch (err) {
    // 알림 실패가 본 답변을 막으면 안 된다
    console.error('[notice-banner]', err);
    return response;
  }
}

/** 지도 답변: 좌표가 있으면 카카오맵 버튼 카드, 후보가 여럿이면 후보 버튼 */
function mapReply(ans: RoomAnswer): KakaoSkillResponse {
  if (ans.candidates?.length) {
    return simpleText(ans.text, [
      ...ans.candidates.slice(0, 9).map((c) => quickMessage(c, c)),
      quickMessage('메뉴', '메뉴'),
    ]);
  }
  if (ans.mapUrl) {
    return textWithLinkCard({
      text: ans.text,
      url: ans.mapUrl,
      buttonLabel: '카카오맵에서 보기',
      description: '건물 위치를 지도로 볼 수 있습니다.',
      quickReplies: menuReplies(),
    });
  }
  return simpleText(ans.text, menuReplies());
}

const answerMap = (u: string): RoomAnswer | null => answerRoomCode(u) ?? answerPlaceQuery(u);

/**
 * Primary Kakao dialog: graduation slot-filling (year → dept → KB/SQL).
 * Map: room-code parse. Clubs secondary via ask().
 */
async function dialog(
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
      college: null,
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
      '동아리 질문을 입력해 주세요.\n예: "디벨로퍼 연락처", "별 보는 동아리", "학술 동아리 목록"',
      [
        quickMessage('동아리 목록', '동아리 목록 알려줘'),
        quickMessage('별 보는 동아리', '별 보는 동아리 있어?'),
        quickMessage('메뉴', '메뉴'),
      ]
    );
  }

  // 동아리 목록 — 분과별 개수 → 분과를 고르면 한두 줄 소개와 함께
  const listReq = clubListRequest(utterance);
  if (listReq) {
    upsertSession(userKey, { flow: 'clubs', admission_year: null, department: null });
    const ans = clubListAnswer(listReq.category);
    return multiText(ans.texts, ans.replies.map(([l, m]) => quickMessage(l, m)));
  }

  // 동아리 이름만 보낸 경우 ("검선", "동산") — 목록에서 이름을 보고 고른 학생
  const namedClub = findClubByExactName(utterance);
  if (namedClub) {
    upsertSession(userKey, { flow: 'clubs', admission_year: null, department: null });
    return simpleText(clubDetailText(namedClub), [
      quickMessage(`${namedClub.category} 동아리 목록`, `${namedClub.category} 동아리 목록`),
      quickMessage('동아리 목록', '동아리 목록'),
      quickMessage('메뉴', '메뉴'),
    ]);
  }

  if (NOTICE_UTTERANCES.test(utterance)) {
    resetToMenu(userKey);
    // 게시 중인 공지 상위 5건 · 카톡 길이 제한(총 900자) 안에서 클램프
    const shown = listPublishedNotices(5);
    const subscribed = isSubscribed(userKey);
    if (subscribed) markDelivered(userKey, shown.map((n) => n.id));
    const tip = subscribed
      ? ''
      : '\n\n「새 공지 알림 받기」를 누르면 새 공통 공지를 다음 대화 때 먼저 알려 드립니다.';
    return simpleText(formatNoticesForKakao(shown) + tip, noticeReplies(subscribed));
  }

  if (NOTICE_SUB_ON.test(utterance)) {
    resetToMenu(userKey);
    const current = subscribe(userKey);
    const intro =
      '공지 알림을 켰습니다.\n새 전교생 공통 공지가 올라오면, 다음에 챗봇을 이용할 때 답변 앞에 먼저 알려 드립니다.\n(한 번에 최대 3건 · 같은 공지는 한 번만)';
    const list = current.length ? `\n\n${formatNoticesForKakao(current, 600)}` : '';
    return simpleText((intro + list).slice(0, 1000), noticeReplies(true));
  }

  if (NOTICE_SUB_OFF.test(utterance)) {
    resetToMenu(userKey);
    unsubscribe(userKey);
    return simpleText(
      '공지 알림을 껐습니다.\n공지는 「공지」 메뉴에서 언제든 확인할 수 있습니다.',
      noticeReplies(false)
    );
  }

  if (MAP_UTTERANCES.test(utterance)) {
    // If utterance already contains a room code (e.g. "지도 S504"), answer now
    if (parseRoomCode(utterance)) {
      clearSession(userKey);
      resetToMenu(userKey);
      return mapReply(answerRoomCode(utterance)!);
    }
    upsertSession(userKey, {
      flow: 'map_room',
      admission_year: null,
      department: null,
    });
    return simpleText(
      '호실 코드나 건물 이름을 입력해 주세요.\n예: S504, A207, 도서관, 학생회관\n(호실 코드: 앞 글자=건물, 숫자 첫 자리=층)',
      [
        quickMessage('S504', 'S504'),
        quickMessage('A207', 'A207'),
        quickMessage('도서관', '도서관'),
        quickMessage('학생회관', '학생회관'),
        quickMessage('메뉴', '메뉴'),
      ]
    );
  }

  // 졸업요건 답변 직후: 학생구분 바꾸기 · 다른 학과 · 다른 학번
  if (session.flow === 'grad_result' && session.admission_year != null && session.department) {
    const year = session.admission_year;
    const type = GRAD_TYPE_UTTERANCES[utterance];
    if (type) return respondGraduationHit(userKey, year, session.department, type);
    if (/^다른\s*학과$/.test(utterance)) {
      upsertSession(userKey, { flow: 'grad_college', admission_year: year, college: null, department: null });
      return simpleText(
        `${year}학번으로 다른 학과를 찾습니다.\n단과대학을 선택하거나 학과 이름을 입력해 주세요.`,
        collegeReplies(listColleges())
      );
    }
    if (/^다른\s*학번$/.test(utterance)) {
      upsertSession(userKey, { flow: 'grad_year', admission_year: null, college: null, department: session.department });
      return simpleText('입학연도(학번)를 선택하거나 입력해 주세요.', yearReplies(listYears()));
    }
  }

  // Slot: map room code follow-up
  if (session.flow === 'map_room') {
    const ans = answerMap(utterance);
    if (!ans) {
      clearSession(userKey);
      resetToMenu(userKey);
      logUnanswered(utterance, 'map_room_unparsed', 'map');
      return simpleText(
        '호실 코드나 건물 이름을 찾지 못했습니다.\n예: S504, A207, 도서관',
        menuReplies()
      );
    }
    // 후보를 고르는 중이면 지도 흐름을 유지한다
    if (!ans.candidates?.length) {
      clearSession(userKey);
      resetToMenu(userKey);
    }
    return mapReply(ans);
  }

  // Slot: year → college (대분류)
  if (session.flow === 'grad_year') {
    const year = parseAdmissionYear(utterance);
    if (year == null) {
      return simpleText(
        '입학연도를 이해하지 못했습니다.\n예: 2022, 22학번, 2022년 입학',
        yearReplies(listYears())
      );
    }
    // '다른 학번'으로 들어온 경우: 학과는 그대로 두고 바로 답한다
    if (session.department && listCriteriaDepartments().includes(session.department)) {
      return respondGraduationHit(userKey, year, session.department);
    }
    upsertSession(userKey, {
      flow: 'grad_college',
      admission_year: year,
      college: null,
      department: null,
    });
    return simpleText(
      `${year}학번으로 저장했습니다.\n단과대학을 선택하거나 학과 이름을 바로 입력해 주세요.\n(예: 컴퓨터공학과, 컴퓨터공학전공)`,
      collegeReplies(listColleges())
    );
  }

  if (session.flow === 'grad_college') {
    const year = session.admission_year;
    if (year == null) {
      upsertSession(userKey, { flow: 'grad_year', college: null });
      return simpleText(
        '입학연도부터 다시 선택해 주세요.',
        yearReplies(listYears())
      );
    }
    // 학과 이름을 바로 입력한 경우 (옛 이름 포함) — 정확히 일치할 때만
    const direct = resolveGradDepartment(utterance);
    if (direct.kind === 'exact') {
      clearSession(userKey);
      return respondGraduationHit(userKey, year, direct.department);
    }
    const knownColleges = listColleges();
    // 버튼은 현행 단과대만, 입력은 21·22학번 당시 이름(인문대학·과학기술대학 등)도 인식
    const resolvedC = resolveCollege(utterance, listAllCollegeNames());
    if (resolvedC.kind === 'ambiguous') {
      return simpleText(
        `단과대학 후보가 여러 개입니다. 버튼을 눌러 주세요.\n후보: ${(resolvedC.candidates || []).join(', ')}`,
        collegeReplies(resolvedC.candidates || knownColleges)
      );
    }
    if (resolvedC.kind === 'none' || !resolvedC.college) {
      return simpleText(
        '등록된 단과대학 목록에서 찾지 못했습니다. 아래 버튼 중 하나를 선택해 주세요.',
        collegeReplies(knownColleges)
      );
    }
    const college = resolvedC.college;
    upsertSession(userKey, {
      flow: 'grad_dept',
      admission_year: year,
      college,
      department: null,
    });
    const depts = departmentsForCollege(college);
    return simpleText(
      `${college}을(를) 선택했습니다.\n학과·전공을 선택하거나 입력해 주세요.`,
      departmentReplies(depts)
    );
  }

  // Slot: department → KB then SQL lookup
  if (session.flow === 'grad_dept') {
    const year = session.admission_year;
    if (year == null) {
      upsertSession(userKey, { flow: 'grad_year' });
      return simpleText(
        '입학연도부터 다시 선택해 주세요.',
        yearReplies(listYears())
      );
    }

    const known = departmentsForCollege(session.college);
    const moreMatch = utterance.match(/^__dept_more__:(\d+)$/);
    if (moreMatch) {
      const offset = Number(moreMatch[1]);
      return simpleText(
        `학과·전공을 선택해 주세요. (${offset + 1}~${Math.min(offset + 7, known.length)} / ${known.length})`,
        departmentReplies(known, offset)
      );
    }
    let resolved = resolveGradDepartment(utterance, known);
    if (resolved.kind === 'none') resolved = resolveDepartment(utterance, known);
    // 고른 단과대 밖의 학과를 입력한 경우 (예: 옛 소속으로 단과대를 잘못 고름)
    if (resolved.kind === 'none') resolved = resolveGradDepartment(utterance);

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
    return respondGraduationHit(userKey, year, department);
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
    return mapReply(answerRoomCode(utterance)!);
  }

  // "도서관 어디야" 처럼 건물 위치를 묻는 문장, 또는 건물 이름만 보낸 경우 ("기숙사")
  if (WHERE_UTTERANCES.test(utterance) || isPlaceName(utterance)) {
    const place = answerPlaceQuery(utterance);
    if (place) {
      if (place.candidates?.length) upsertSession(userKey, { flow: 'map_room', admission_year: null, department: null });
      return mapReply(place);
    }
  }

  // Default: treat as free-text clubs ask if looks club-related, else show menu
  if (
    /동아리|클럽|분과|연락처|모임|소개|활동/.test(utterance) ||
    session.flow === 'menu' ||
    session.flow === 'done' ||
    session.flow === 'grad_result'
  ) {
    // If clearly graduation-ish free text with year+dept, try one-shot
    const year = parseAdmissionYear(utterance);
    if (year != null && /졸업|학점|요건/.test(utterance)) {
      let resolved = resolveGradDepartment(utterance);
      if (resolved.kind === 'none') resolved = resolveDepartment(utterance, listDepartments());
      if (resolved.kind === 'exact' || resolved.kind === 'contains') {
        resetToMenu(userKey);
        return respondGraduationHit(userKey, year, resolved.department);
      }
      // year known but dept missing → start slot at dept
      upsertSession(userKey, {
        flow: 'grad_college',
        admission_year: year,
        college: null,
        department: null,
      });
      return simpleText(
        `${year}학번으로 인식했습니다.\n단과대학(대분류)을 선택해 주세요.`,
        collegeReplies(listColleges())
      );
    }

    if (/동아리|클럽|분과|연락처|모임/.test(utterance)) {
      const result = await ask(utterance);
      return buildAskSkillResponse(result, utterance);
    }
  }

  // '주짓수 배우고 싶어'처럼 '동아리'라는 말이 없어도 키워드 사전에 걸리면 동아리 검색으로 보낸다
  if (keywordTopics(utterance).length > 0) {
    const result = await ask(utterance);
    return buildAskSkillResponse(result, utterance);
  }

  // 어느 기능에도 걸리지 않은 말 — 관리자가 미답변 화면에서 보고 데이터 · 사전을 보완한다
  if (utterance && utterance.length >= 2) logUnanswered(utterance, 'menu_fallback', 'menu');
  resetToMenu(userKey);
  return simpleText(
    '메뉴에서 선택해 주세요.\n졸업요건 · 동아리 · 지도 · 공지',
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

