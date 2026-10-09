import type { AskResult } from '../types/ask';
import type {
  KakaoButton,
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

/**
 * 기존 응답 맨 앞에 안내 문구를 붙인다 (새 공지 알림용).
 * 카카오 outputs 는 최대 3개라, 이미 3개면 첫 simpleText 에 합친다.
 * 합칠 곳이 없으면 null — 호출 측은 전달 기록을 남기지 않는다.
 */
export function prependText(
  response: KakaoSkillResponse,
  text: string
): KakaoSkillResponse | null {
  const outputs = response.template.outputs;
  if (outputs.length < 3) {
    return {
      ...response,
      template: { ...response.template, outputs: [{ simpleText: { text } }, ...outputs] },
    };
  }
  const first = outputs[0];
  if ('simpleText' in first) {
    const merged = `${text}\n\n${first.simpleText.text}`.slice(0, 1000);
    return {
      ...response,
      template: {
        ...response.template,
        outputs: [{ simpleText: { text: merged } }, ...outputs.slice(1)],
      },
    };
  }
  return null;
}

/** 공지 메뉴 버튼: 구독 상태에 따라 켜기/끄기 */
export function noticeReplies(subscribed: boolean): KakaoQuickReply[] {
  return [
    subscribed
      ? quickMessage('알림 끄기', '공지 알림 끄기')
      : quickMessage('새 공지 알림 받기', '공지 알림 받기'),
    ...menuReplies(),
  ];
}

/** 졸업요건 답변 뒤: 같은 학번·학과로 학생구분 바꾸기, 또는 다른 학과·학번 */
export function gradResultReplies(): KakaoQuickReply[] {
  return [
    quickMessage('편입생 기준', '편입생 기준'),
    quickMessage('외국인 기준', '외국인 기준'),
    quickMessage('다른 학과', '다른 학과'),
    quickMessage('다른 학번', '다른 학번'),
    quickMessage('메뉴', '메뉴'),
  ];
}

/** Primary menu: 졸업요건 first, then clubs / map */
export function menuReplies(): KakaoQuickReply[] {
  return [
    quickMessage('졸업요건', '졸업요건'),
    quickMessage('동아리', '동아리'),
    quickMessage('지도', '지도'),
    quickMessage('공지', '공지'),
  ];
}

export function yearReplies(yearsFromDb: number[]): KakaoQuickReply[] {
  // Prefer explicit 7-year window (4년제 + 여유 3년). Fall back to DB years if empty.
  const years =
    yearsFromDb.length > 0
      ? [...new Set(yearsFromDb)].sort((a, b) => a - b).slice(-7)
      : [2020, 2021, 2022, 2023, 2024, 2025, 2026];
  const replies = years.map((y) => quickMessage(String(y), String(y)));
  replies.push(quickMessage('메뉴', '메뉴'));
  return replies;
}

export function collegeReplies(colleges: string[]): KakaoQuickReply[] {
  const replies = colleges.slice(0, 9).map((c) => quickMessage(c.slice(0, 25), c));
  replies.push(quickMessage('메뉴', '메뉴'));
  return replies;
}

export function departmentReplies(
  departments: string[],
  offset = 0
): KakaoQuickReply[] {
  const pageSize = 7; // leave room for 더보기 / 메뉴
  const page = departments.slice(offset, offset + pageSize);
  const replies = page.map((d) => quickMessage(d.slice(0, 25), d));
  if (offset + pageSize < departments.length) {
    replies.push(
      quickMessage('더보기', `__dept_more__:${offset + pageSize}`)
    );
  }
  if (offset > 0) {
    replies.push(quickMessage('이전', `__dept_more__:${Math.max(0, offset - pageSize)}`));
  }
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

/** 본문 simpleText + 링크 버튼 카드 (지도 위치 등). 본문은 한 번만 보낸다. */
export function textWithLinkCard(opts: {
  text: string;
  url: string;
  buttonLabel: string;
  description: string;
  quickReplies?: KakaoQuickReply[];
}): KakaoSkillResponse {
  const response: KakaoSkillResponse = {
    version: '2.0',
    template: {
      outputs: [
        { simpleText: { text: opts.text.slice(0, 900) } },
        {
          basicCard: {
            description: opts.description,
            buttons: [{ label: opts.buttonLabel.slice(0, 14), action: 'webLink', webLinkUrl: opts.url }],
          },
        },
      ],
    },
  };
  if (opts.quickReplies && opts.quickReplies.length > 0) {
    response.template.quickReplies = opts.quickReplies;
  }
  return response;
}

/**
 * Text + optional PDF webLink button (Kakao cannot attach raw PDF bytes).
 * Uses basicCard when an absolute URL is available; otherwise simpleText with a tip.
 */
export function textWithPdfLink(opts: {
  text: string;
  pdfPublicPath?: string | null;
  absolutePdfUrl?: string | null;
  buttonLabel?: string;
  quickReplies?: KakaoQuickReply[];
}): KakaoSkillResponse {
  const label = (opts.buttonLabel || '졸업요건 PDF').slice(0, 14);
  const abs = opts.absolutePdfUrl || null;
  const rel = opts.pdfPublicPath || null;

  if (abs) {
    const buttons: KakaoButton[] = [
      { label, action: 'webLink', webLinkUrl: abs },
    ];
    const response: KakaoSkillResponse = {
      version: '2.0',
      template: {
        outputs: [
          // 본문은 simpleText 한 번만. 카드는 원문 링크 버튼 용도로만 사용한다
          // (이전에는 같은 내용이 카드 설명과 텍스트로 두 번 표시됐다).
          { simpleText: { text: opts.text.slice(0, 900) } },
          {
            basicCard: {
              description: '원문 PDF를 버튼으로 열 수 있습니다.',
              buttons,
            },
          },
        ],
      },
    };
    if (opts.quickReplies && opts.quickReplies.length > 0) {
      response.template.quickReplies = opts.quickReplies;
    }
    return response;
  }

  // No PUBLIC_BASE_URL — student-facing message only (no paths / .env / localhost)
  let text = opts.text;
  if (rel) {
    text +=
      '\n\nPDF는 등록되어 있으나, 공개 링크가 아직 설정되지 않았습니다. 관리자에게 문의해 주세요.';
  }
  return simpleText(text.slice(0, 1000), opts.quickReplies);
}
