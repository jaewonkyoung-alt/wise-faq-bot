"""4주차 진행 보고 — 제목·목차·간트·구현·다음주 순서 (3주차 설계 덱과 내용 중복 회피)."""
import os
from PIL import Image
from lib import *

IMG = os.environ.get("W4_IMG") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "img")

TOC = [
    "개발 일정 (간트) · 이번 주 요약",
    "공지 기능 — 설계에서 구현으로",
    "공지 기능 — 관리자 웹 동작 화면",
    "공지 기능 — 카카오톡 · API 동작",
    "버그 수정 · 테스트",
    "요구사항 이행 상태",
    "졸업요건 실데이터 — 수집 · 구조화 · 특이사항",
    "다음 주 계획",
]


def picture(s, path, x, y, w, h, border=True):
    iw, ih = Image.open(os.path.join(IMG, path)).size
    pw, ph = w, w * ih / iw
    if ph > h:
        ph, pw = h, h * iw / ih
    px, py = x + (w - pw) / 2, y + (h - ph) / 2
    if border:
        rect(s, px - 0.03, py - 0.03, pw + 0.06, ph + 0.06, fill=WHITE, line=LINE)
    s.shapes.add_picture(os.path.join(IMG, path), Inches(px), Inches(py), width=Inches(pw), height=Inches(ph))
    return pw, ph


def caption(s, x, y, w, head, sub):
    text(s, x, y, w, 0.3, head, size=13, bold=True, color=DARK, margin=0)
    text(s, x, y + 0.31, w, 0.6, sub, size=11, color=GRAY, margin=0)


def build(d):
    # 1. 표지
    s = d.blank()
    rect(s, 0, 0, 13.333, 0.04, fill=NAVY)
    text(s, 0.8, 1.75, 11.7, 1.55,
         [("점진적 확장이 가능한 캠퍼스 정보 질의응답 챗봇", {"size": 30}),
          ("4주차 — 진행 보고 (공지 기능 · 졸업요건 실데이터)", {"size": 24, "color": NAVY})],
         bold=True, color=DARK, align=PP_ALIGN.CENTER)
    rect(s, 5.4, 3.5, 2.5, 0.03, fill=NAVY)
    text(s, 0.8, 3.77, 11.7, 0.4, "컴퓨터공학종합설계  /  경재원", size=18, color=GRAY, align=PP_ALIGN.CENTER)
    text(s, 0.8, 4.32, 11.7, 0.35, "2021212843 · wise-faq-bot · 2026. 09. 28", size=15, color=GRAY, align=PP_ALIGN.CENTER)

    # 2. 목차
    s = d.slide("목차")
    lines = []
    for i, t in enumerate(TOC, 1):
        lines.append((f"{i}.  {t}", {}))
        if i < len(TOC):
            lines.append(("", {"size": 8}))
    text(s, 0.9, 1.3, 11.5, 5.5, lines, size=18, color=DARK)
    label(s, 0.9, 6.9, 11.5, 0.3,
          "프로젝트 개요 · 요구사항 · 유스케이스 · 시스템 구성 · 기술 스택은 3주차 설계 발표 자료 참조",
          size=11, color=MUTED, align=PP_ALIGN.LEFT)

    # 3. 간트차트
    s = d.slide("1. 개발 일정 — 간트차트 (주간 발표일 기준)")
    weeks = ["1주\n9/7", "2주\n9/14", "3주\n9/21", "4주\n9/28", "5주\n10/5", "6주\n10/12",
             "7주\n10/19", "8주\n10/26", "9주\n11/2", "10주\n11/9"]
    gantt = [("문제정의 · 관리자 웹 · 졸업요건/지도 KB", 1, 2, "done"),
             ("설계 산출물 확정 · 문서화", 3, 3, "done"),
             ("공지 CRUD · 카톡 공지 조회", 3, 4, "done"),
             ("졸업요건 실데이터 검증 · 카톡 E2E", 4, 5, "now"),
             ("고정 스킬 URL · 배포 환경", 4, 5, "now"),
             ("동아리 RAG 품질 · 미답변 흐름", 5, 6, "plan"),
             ("보안 · 운영 · 테스트케이스 실행", 6, 7, "plan"),
             ("UX 마감 · 기능 완성 (freeze 10/25)", 7, 7, "plan"),
             ("버그픽스 · 회귀 · 통합시험 · 데모", 8, 9, "plan"),
             ("최종 발표(11/9) · 제출(11/15)", 10, 10, "plan")]
    rows = [["작업"] + weeks] + [[t] + [""] * 10 for t, *_ in gantt]
    shp = table(s, 0.55, 1.05, 12.2, [3.3] + [0.89] * 10, rows, size=11, header_size=10, row_h=0.45)
    tbl = shp.table
    tbl.rows[0].height = Inches(0.55)
    fills = {"done": NAVY, "now": "6E6E6E", "plan": NAVY2}
    for i, (t, a, b, st) in enumerate(gantt, 1):
        for w in range(1, 11):
            c = tbl.cell(i, w)
            c.fill.solid()
            c.fill.fore_color.rgb = rgb(fills[st] if a <= w <= b else (WHITE if i % 2 else LIGHT2))
    for i, (lb, col) in enumerate([("완료", NAVY), ("진행 중", "6E6E6E"), ("예정", NAVY2)]):
        rect(s, 0.55 + i * 1.3, 6.25, 0.28, 0.2, fill=col)
        label(s, 0.9 + i * 1.3, 6.22, 1.0, 0.26, lb, size=11, align=PP_ALIGN.LEFT)
    label(s, 4.8, 6.22, 8.0, 0.26,
          "기능 완성 10/25 · 버퍼 10/26~11/8 · 데모 준비 완료 11/8  —  현재 일정과 차이 없음",
          size=11, color=GRAY, align=PP_ALIGN.LEFT)
    box(s, 0.55, 6.65, 12.2, 0.6,
        [("4주차 목표였던 공지 기능을 계획대로 완료 · 졸업요건 원본 42개 학과 수집 착수 — 5주차는 DB 적재와 검증(실기기 E2E)에 집중", {"size": 12})],
        fill=LIGHT2, line=LINE, align=PP_ALIGN.LEFT)

    # 4. 이번 주 요약
    s = d.slide("1. 이번 주 작업 요약")
    text(s, 0.55, 1.02, 12.2, 0.35, "계획 대비 실제", size=15, bold=True, color=DARK)
    table(s, 0.55, 1.42, 12.2, [1.4, 5.6, 3.8, 1.4], [
        ["구분", "수행 내용", "산출물", "상태"],
        ["계획 작업", "공지 CRUD · 카톡 공지 조회 (3주차에 설계만 했던 기능)", "코드 · 테스트 · 화면", "완료"],
        ["추가 1", "카카오톡 중복 응답 결함 수정", "responseBuilder 수정", "완료"],
        ["추가 2", "깨져 있던 회귀 테스트 복구", "test:kakao-grad", "완료"],
        ["추가 3", "공지 테스트 신규 작성", "test:notices 16건", "완료"],
        ["추가 4", "졸업요건 원본 PDF 수집 · 엑셀 구조화 (42개 학과)", "엑셀 9개 시트 · SSD", "완료"],
        ["추가 5", "공지 방식 변경: 조회 → 알림 구독 (전교생 공통 공지만)", "test:notice-sub 24건", "완료"],
        ["문서", "설계 산출물 13종 · 진행 보고 문서화", "GitHub docs/", "완료"],
    ], size=14, row_h=0.62, first_col_bold=True)
    label(s, 0.55, 6.85, 12.2, 0.3, "전체 테스트 5종 · 타입체크 모두 통과", size=11, color=MUTED, align=PP_ALIGN.LEFT)

    # 5. 설계 → 구현
    s = d.slide("2. 공지 기능 — 설계 문서에서 구현으로")
    text(s, 0.55, 1.02, 12.2, 0.35, "3주차에 문서로만 정의했던 항목의 구현 결과", size=15, bold=True, color=DARK)
    table(s, 0.55, 1.5, 12.2, [2.0, 4.6, 5.6], [
        ["설계 항목", "3주차 정의", "구현 결과"],
        ["요구사항", "FR-06 공지 조회 / FR-10 공지 관리", "둘 다 구현 완료"],
        ["유스케이스", "UC-05 공지 조회 / UC-09 공지 관리", "기본·대안·예외 흐름 그대로 구현"],
        ["데이터", "notices 테이블 (10개 컬럼)", "마이그레이션 + 피드 인덱스 추가"],
        ["인터페이스", "공개 1 · 관리자 2 엔드포인트 그룹", "6개 엔드포인트 구현 (공개 1 · 관리자 5)"],
        ["테스트", "TC-09 링크·게시기간 검증", "16개 검사로 확장"],
    ], size=15, row_h=0.8, first_col_bold=True)

    # 6. 데이터 · 엔드포인트
    s = d.slide("2. 공지 기능 — 데이터 모델 · 엔드포인트")
    text(s, 0.55, 1.02, 6, 0.35, "notices 테이블", size=14, bold=True, color=DARK)
    table(s, 0.55, 1.42, 6.1, [1.6, 1.1, 1.5, 1.9], [
        ["컬럼", "타입", "제약", "설명"],
        ["id", "TEXT", "PK", "UUID"],
        ["title / body", "TEXT", "NOT NULL", "제목 · 본문"],
        ["link_url", "TEXT", "http(s)만", "원문 링크"],
        ["pinned", "INTEGER", "0/1", "상단 고정"],
        ["published", "INTEGER", "0/1", "게시 여부"],
        ["starts_at / ends_at", "TEXT", "NULL 허용", "게시 기간"],
        ["created_at / updated_at", "TEXT", "NOT NULL", "생성 · 갱신 시각"],
    ], size=11, row_h=0.45, first_col_bold=True)
    label(s, 0.55, 5.1, 6.1, 0.3, "인덱스 (published, pinned, updated_at) · 알림용 notice_subscribers · notice_deliveries 추가", size=10, color=MUTED, align=PP_ALIGN.LEFT)
    text(s, 0.55, 5.5, 6.1, 0.35, "상태 판정 규칙", size=14, bold=True, color=DARK)
    states = [("게시 중", "published=1 · 기간 내"), ("초안", "published=0"),
              ("예약", "시작일이 미래"), ("종료", "종료일이 지남")]
    for i, (h, b) in enumerate(states):
        x = 0.55 + i * 1.55
        rect(s, x, 5.9, 1.45, 0.95, fill=LIGHT2, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE,
             label=[(h, {"bold": True, "size": 11}), (b, {"size": 9, "color": GRAY})])
    text(s, 7.0, 1.02, 5.8, 0.35, "구현한 엔드포인트", size=14, bold=True, color=DARK)
    table(s, 7.0, 1.42, 5.75, [1.4, 2.8, 1.4], [
        ["Method", "Endpoint", "인증"],
        ["GET", "/api/notices?limit=5", "없음"],
        ["GET", "/api/admin/notices", "관리자 토큰"],
        ["POST", "/api/admin/notices", "관리자 토큰"],
        ["GET", "/api/admin/notices/:id", "관리자 토큰"],
        ["PUT", "/api/admin/notices/:id", "관리자 토큰"],
        ["DELETE", "/api/admin/notices/:id", "관리자 토큰"],
    ], size=11, row_h=0.45, first_col_bold=True)
    box(s, 7.0, 4.75, 5.75, 2.1,
        [("응답 규약", {"bold": True, "size": 12, "color": NAVY}),
         ("201 등록 성공 · 200 조회/수정/삭제", {"size": 11}),
         ("400 필수값 누락 · 링크 형식 오류", {"size": 11}),
         ("401 관리자 토큰 없음/불일치", {"size": 11}),
         ("404 대상 공지 없음", {"size": 11}), ("", {"size": 5}),
         ("인증은 라우트마다 호출 — /api 전역 미들웨어 금지 원칙 유지", {"size": 10, "color": GRAY})],
        fill=LIGHT2, line=LINE, align=PP_ALIGN.LEFT)

    # 7. 처리 흐름
    s = d.slide("2. 공지 기능 — 처리 흐름")
    text(s, 0.55, 1.02, 6, 0.35, "관리자 등록 경로", size=14, bold=True, color=DARK)
    admin_flow = [("관리자 웹\n공지 탭", 0.55), ("POST\n/api/admin/notices", 3.05), ("토큰 확인\ncheckAdmin", 5.55),
                  ("입력 검증\n필수값 · 링크", 8.05), ("notices\n테이블 저장", 10.55)]
    for t, x in admin_flow:
        box(s, x, 1.45, 2.2, 0.95, [(l, {"size": 11, "bold": i == 0}) for i, l in enumerate(t.split("\n"))],
            fill=LIGHT if x in (0.55, 10.55) else WHITE)
        if x < 10.5:
            arrow(s, x + 2.2, 1.92, x + 2.5, 1.92)
    label(s, 3.05, 2.5, 7.2, 0.3, "검증 실패 시 400 · 토큰 불일치 시 401 — 저장되지 않음", size=10, color=MUTED, align=PP_ALIGN.LEFT)
    text(s, 0.55, 3.0, 6, 0.35, "학생 조회 경로", size=14, bold=True, color=DARK)
    student_flow = [("학생 카톡\n'공지' 선택", 0.55), ("POST\n/api/kakao/skill", 3.05), ("kakaoDialog\n메뉴 분기", 5.55),
                    ("listPublishedNotices(5)\n게시·기간 필터", 8.05), ("formatNoticesForKakao\n900자 클램프", 10.55)]
    for t, x in student_flow:
        box(s, x, 3.43, 2.2, 0.95, [(l, {"size": 10, "bold": i == 0}) for i, l in enumerate(t.split("\n"))],
            fill=LIGHT if x in (0.55, 10.55) else WHITE)
        if x < 10.5:
            arrow(s, x + 2.2, 3.9, x + 2.5, 3.9)
    arrow(s, 11.65, 4.38, 11.65, 4.75)
    box(s, 9.9, 4.75, 2.85, 0.75, "Skill JSON 응답 (메뉴 버튼 포함)", fill=LIGHT2, line=LINE, size=11)
    text(s, 0.55, 4.85, 8.9, 0.35, "설계 원칙이 지켜졌는지", size=14, bold=True, color=DARK)
    checks = [("사실은 DB에서만", "LLM 호출 없음 — 공지는 전부 정형 조회"),
              ("라우트 단위 인증", "관리자 5개 엔드포인트에서 각각 checkAdmin 호출"),
              ("카톡 제약 반영", "길이 클램프로 문자수 제한 안에서 응답"),
              ("기존 흐름 보존", "졸업요건·동아리·지도 대화 로직은 변경 없음")]
    for i, (h, b) in enumerate(checks):
        y = 5.3 + (i // 2) * 0.85
        x = 0.55 + (i % 2) * 4.5
        rect(s, x, y, 4.3, 0.75, fill=LIGHT2, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE,
             label=[(h, {"bold": True, "size": 12}), (b, {"size": 10, "color": GRAY})], align=PP_ALIGN.LEFT)

    # 8. 관리자 웹 화면
    s = d.slide("3. 공지 기능 — 관리자 웹 동작 화면")
    picture(s, "w4-admin-notices.png", 0.55, 1.1, 5.9, 4.6)
    caption(s, 0.55, 5.85, 5.9, "① 공지 등록 · 목록",
            "제목·본문·링크·게시 기간 입력 · 목록에서 게시 중/초안 상태 확인 · 수정/삭제")
    picture(s, "w4-admin-notice-preview.png", 6.85, 1.1, 5.9, 4.6)
    caption(s, 6.85, 5.85, 5.9, "② 카톡 미리보기",
            "저장 전에 학생에게 보이는 실제 응답 형식을 관리자 화면에서 확인 (서버와 같은 포맷 함수 사용)")
    label(s, 0.55, 6.9, 12.2, 0.3, "로컬 서버 실행 화면 캡처 · 표시된 공지는 시연용으로 실제 등록한 데이터", size=10, color=MUTED, align=PP_ALIGN.LEFT)

    # 9. 공통 공지 원칙 · 전달 현황
    s = d.slide("3. 공지 기능 — 전교생 공통 공지 원칙 · 알림 전달 현황")
    picture(s, "w4-admin-notice-policy.png", 0.55, 1.1, 7.6, 1.25)
    picture(s, "w4-admin-notice-delivered.png", 0.55, 2.6, 7.6, 2.25)
    caption(s, 0.55, 5.0, 7.6, "관리자 공지 화면 — 등록 원칙 안내 · 알림 구독자 수 · 공지별 전달 인원",
            "로컬 서버 실행 화면 캡처 · 시연용으로 구독 학생 4명을 만들어 전달한 결과")
    box(s, 0.55, 5.95, 7.6, 0.9,
        [("대시보드에도 '공지 알림 구독' 카드 추가", {"bold": True, "size": 12}),
         ("비개발자 관리자가 몇 명에게 공지가 가는지 한눈에 확인", {"size": 10, "color": GRAY})],
        fill=LIGHT2, line=LINE, align=PP_ALIGN.LEFT)
    text(s, 8.5, 1.02, 4.3, 0.35, "왜 전교생 공통 공지만 받나", size=14, bold=True, color=DARK)
    ops = [("모든 구독자에게 같은 공지", "학과·동아리별 공지까지 보내면 알림이 스팸이 됨"),
           ("한 번에 최대 3건", "나머지는 건수만 안내 — 답변이 공지에 묻히지 않게"),
           ("게시 후 14일 지나면 제외", "오랜만에 온 학생에게 지난 공지가 쏟아지지 않게"),
           ("같은 공지는 한 번만", "전달 기록(notice_deliveries)으로 중복 차단"),
           ("전달 현황 확인", "공지별 전달 인원 · 구독자 수를 관리자 화면에 표시")]
    for i, (h, b) in enumerate(ops):
        y = 1.45 + i * 1.08
        rect(s, 8.5, y, 4.3, 0.95, fill=LIGHT2, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE,
             label=[(h, {"bold": True, "size": 12}), (b, {"size": 10, "color": GRAY})], align=PP_ALIGN.LEFT)

    # 10. 카카오톡 — 조회에서 알림으로
    s = d.slide("4. 공지 기능 — 찾아보는 공지에서 알려 주는 공지로")
    picture(s, "kakao_notice_sub.png", 0.55, 1.1, 2.8, 5.45)
    picture(s, "kakao_notice_banner.png", 3.5, 1.1, 2.8, 5.45)
    label(s, 0.55, 6.62, 2.8, 0.3, "① 공지 메뉴 → 알림 받기", size=11, color=DARK, bold=True)
    label(s, 3.5, 6.62, 2.8, 0.3, "② 다음 대화에서 새 공지 먼저", size=11, color=DARK, bold=True)
    label(s, 0.55, 6.95, 5.75, 0.3, "실제 /api/kakao/skill 응답으로 그린 화면 (로컬 서버)", size=10, color=MUTED)
    box(s, 6.6, 1.05, 6.15, 1.05,
        [("설계 변경", {"bold": True, "size": 12, "color": NAVY}),
         ("문제: 학생은 공지를 직접 찾아보지 않는다 — 조회 메뉴만으로는 전달되지 않음", {"size": 11}),
         ("변경: 알림을 켠 학생에게 새 전교생 공통 공지를 답변 앞에 먼저 보여 줌", {"size": 11})],
        fill=WHITE, line=NAVY, align=PP_ALIGN.LEFT)
    table(s, 6.6, 2.25, 6.15, [1.5, 4.65], [
        ["항목", "동작"],
        ["구독", "'새 공지 알림 받기' 버튼으로 켜고, '알림 끄기'로 해제"],
        ["전달 시점", "구독 학생이 다음에 말을 걸 때 답변 맨 앞 (모든 질문)"],
        ["전달 범위", "한 번에 최대 3건 · 나머지는 건수만 안내"],
        ["중복 방지", "같은 공지는 학생마다 한 번만"],
        ["기간 제한", "게시 후 14일 지난 공지는 알림 제외"],
        ["기존 기능", "공지 메뉴 조회는 그대로 유지"],
    ], size=11, row_h=0.4, first_col_bold=True)
    box(s, 6.6, 5.2, 6.15, 1.6,
        [("왜 바로 푸시하지 않나", {"bold": True, "size": 12, "color": NAVY}),
         ("카카오 Event API(챗봇이 먼저 발송)는 비즈니스 인증 채널 + 건당 15원", {"size": 11}),
         ("→ 개인 졸업작품 채널은 인증을 받을 수 없음", {"size": 11}),
         ("1단계(구현): 다음 대화 때 전달  ·  2단계(보류): 인증 채널 확보 시 Event API", {"size": 11, "color": GRAY})],
        fill=LIGHT2, line=LINE, align=PP_ALIGN.LEFT)

    # 11. API 검증
    s = d.slide("4. 공지 기능 — API 동작 검증")
    picture(s, "term_api.png", 0.55, 1.1, 7.7, 5.6)
    text(s, 8.6, 1.02, 4.2, 0.35, "확인한 규칙", size=15, bold=True, color=DARK)
    rules = [("인증", "토큰 없이 관리자 API 호출 → 401"),
             ("입력 검증", "javascript: 링크 → 400 거부"),
             ("게시 필터", "공개 목록 count = 3 (초안 제외)"),
             ("카톡 응답", "고정 우선 · 링크 포함 · 259자"),
             ("버튼 유지", "quickReplies 4개 반환")]
    for i, (h, b) in enumerate(rules):
        y = 1.45 + i * 1.08
        rect(s, 8.6, y, 4.2, 0.95, fill=LIGHT2, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE,
             label=[(h, {"bold": True, "size": 12}), (b, {"size": 10, "color": GRAY})], align=PP_ALIGN.LEFT)
    label(s, 8.6, 6.85, 4.2, 0.3, "로컬 서버(포트 3999) 실행 중 실제 호출 결과", size=10, color=MUTED, align=PP_ALIGN.LEFT)

    # 12. 버그 수정
    s = d.slide("5. 버그 수정 — 중복 응답 · 회귀 테스트")
    text(s, 0.55, 1.02, 9.0, 0.35, "결함 2건", size=14, bold=True, color=DARK)
    table(s, 0.55, 1.42, 9.0, [1.6, 3.4, 4.0], [
        ["결함", "원인", "조치"],
        ["졸업요건 답변이\n카톡에 두 번 표시", "basicCard 설명과 simpleText 에\n같은 본문을 모두 넣음", "본문은 simpleText 1회,\n카드는 PDF 버튼 전용으로 분리"],
        ["test:kakao-grad\n실패 상태 방치", "단과대학 선택 단계를 추가한 뒤\n테스트 시나리오를 갱신하지 않음", "연도 → 단과대 → 학과 순서로\n시나리오 수정 · 통과 확인"],
    ], size=12, row_h=1.05, first_col_bold=True)
    box(s, 0.55, 3.75, 4.3, 1.75,
        [("수정 전", {"bold": True, "size": 12, "color": NAVY}),
         ("outputs = [", {"size": 11}), ("  basicCard(본문 요약 + PDF 버튼),", {"size": 11}),
         ("  simpleText(같은 본문)", {"size": 11}), ("]  → 같은 내용 2개", {"size": 11, "color": GRAY})],
        fill=WHITE, line=LINE, align=PP_ALIGN.LEFT)
    arrow(s, 5.0, 4.62, 5.45, 4.62, lw=2)
    box(s, 5.6, 3.75, 4.3, 1.75,
        [("수정 후", {"bold": True, "size": 12, "color": NAVY}),
         ("outputs = [", {"size": 11}), ("  simpleText(본문 1회),", {"size": 11}),
         ("  basicCard(PDF 버튼 전용)", {"size": 11}), ("]  → 본문 1개 + 링크 카드", {"size": 11, "color": GRAY})],
        fill=LIGHT, line=NAVY, align=PP_ALIGN.LEFT)
    text(s, 0.55, 5.65, 9.0, 0.35, "재발 방지", size=14, bold=True, color=DARK)
    prevent = [("커밋 전 전체 실행", "typecheck + test:* 4종"),
               ("같은 커밋에서 갱신", "기능 변경 시 테스트도 함께"),
               ("실패는 즉시 처리", "남기지 않고 주간 보고에 포함")]
    for i, (h, b) in enumerate(prevent):
        x = 0.55 + i * 3.05
        rect(s, x, 6.05, 2.9, 0.85, fill=LIGHT2, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE,
             label=[(h, {"bold": True, "size": 12}), (b, {"size": 10, "color": GRAY})])
    picture(s, "kakao_grad_b.png", 10.1, 1.1, 2.7, 5.4)
    text(s, 10.1, 6.6, 2.7, 0.3, "수정 후 실제 화면", size=12, bold=True, color=DARK, margin=0, align=PP_ALIGN.CENTER)

    # 13. 테스트 결과
    s = d.slide("5. 테스트 실행 결과")
    picture(s, "term_test-notice-sub.png", 0.55, 1.1, 7.4, 5.6)
    text(s, 8.3, 1.02, 4.5, 0.35, "실행한 테스트", size=15, bold=True, color=DARK)
    table(s, 8.3, 1.45, 4.5, [2.0, 2.5], [
        ["스크립트", "검사 내용"],
        ["test:notice-sub", "공지 알림 24건 (신규)"],
        ["test:notices", "공지 16건 (신규)"],
        ["test:kakao-grad", "졸업요건 대화 전 구간"],
        ["test:graduation", "정형 조회 · 미존재"],
        ["test:room-code", "호실 코드 변환"],
        ["typecheck", "타입 오류 0건"],
    ], size=11, row_h=0.45, first_col_bold=True)
    box(s, 8.3, 4.85, 4.5, 1.25,
        [("아직 못 한 단계", {"bold": True, "size": 12, "color": NAVY}),
         ("시스템(실기기 카톡) · 인수 테스트", {"size": 11}),
         ("→ 스킬 URL 고정 후 5주차에 실행", {"size": 11, "color": GRAY})],
        fill=WHITE, line=NAVY, align=PP_ALIGN.LEFT)
    label(s, 8.3, 6.25, 4.5, 0.6, "테스트는 임시 DB로 실행 — 기존 공지 테스트가 운영 DB 공지를\n지울 수 있던 문제도 이번에 수정", size=10, color=MUTED, align=PP_ALIGN.LEFT)

    # 15. 요구사항 이행 상태
    s = d.slide("6. 요구사항 이행 상태")
    table(s, 0.55, 1.05, 12.2, [1.0, 2.6, 5.2, 1.3, 2.1], [
        ["ID", "요구사항", "이번 주까지 상태", "진행", "검증"],
        ["FR-01", "메뉴 제공", "카톡 진입·'메뉴' 입력 시 버튼 4개 응답", "완료", "TC-11"],
        ["FR-02", "졸업요건 단계 조회", "연도 → 단과대 → 학과 슬롯 대화 동작", "완료", "TC-01·02·03"],
        ["FR-03", "졸업요건 원문 제공", "PDF 링크 버튼 (공개 URL 설정 시)", "완료", "TC-03"],
        ["FR-04", "호실 위치 안내", "호실 코드 → 건물·층 변환", "완료", "TC-04"],
        ["FR-05", "동아리 질의응답", "정형 조회 + 의미 검색, 출처 표기", "완료", "TC-05·06"],
        ["FR-06", "공지 조회 · 알림", "공지 메뉴 조회 + 구독 학생에게 새 공지 먼저 전달", "완료", "test:notice-sub"],
        ["FR-07", "관리자 인증", "토큰 게이트 (미설정 시 전면 차단)", "완료", "TC-07·08"],
        ["FR-08", "졸업요건 관리", "등록·수정·삭제·목록", "완료", "TC-12"],
        ["FR-09", "동아리 관리", "등록·수정·삭제 + 자동 재색인", "완료", "TC-06"],
        ["FR-10", "공지 관리", "등록·수정·삭제 · 게시 기간 · 고정 · 전달 현황", "완료", "test:notices"],
        ["FR-11", "폴더 KB 재스캔", "재스캔 동작 · 실데이터 검증은 5주차", "진행", "5주차"],
        ["FR-12", "미답변 관리", "수집·조회 동작 · 화면 정리 예정", "진행", "5주차"],
        ["FR-13", "전체 재색인", "동작하나 임베딩 교체 후 재점검 필요", "예정", "6주차"],
    ], size=11, row_h=0.42, first_col_bold=True)
    label(s, 0.55, 7.05, 12.2, 0.3, "완료 10 · 진행 2 · 예정 1  —  학생 기능(FR-01~06)은 전부 동작", size=11, color=GRAY, align=PP_ALIGN.LEFT)

    # 16. 졸업요건 실데이터 — 수집 · 구조화
    s = d.slide("7. 졸업요건 실데이터 — PDF 수집 · 엑셀 구조화")
    steps = [("학교 홈페이지", "학사제도 및\n졸업이수가이드"), ("PDF 51개 수집", "학과별 42 · 공통 8 · 2025판 1\nSSD 보관 · SHA-256"),
             ("표 복원", "PDF 선 좌표로\n셀 · 병합 셀 복원"), ("정규화", "학과 × 학번 구간\n× 학생구분"),
             ("엑셀 9개 시트", "요약 · 학번별 · 논문\n필수과목 · 특이사항")]
    for i, (h, b) in enumerate(steps):
        x = 0.55 + i * 2.5
        box(s, x, 1.05, 2.2, 0.95, [(h, {"bold": True, "size": 12})] + [(l, {"size": 9, "color": GRAY}) for l in b.split("\n")],
            fill=LIGHT if i in (0, 4) else WHITE)
        if i < 4:
            arrow(s, x + 2.2, 1.52, x + 2.5, 1.52)
    picture(s, "w4-grad-pdf42.png", 0.55, 2.25, 4.3, 2.75)
    caption(s, 0.55, 5.1, 4.3, "원본 PDF — 컴퓨터공학과 기준표",
            "2026 가이드 한 파일에 2020~2026학번 기준이 입학년도 열로 모두 들어 있음")
    arrow(s, 4.95, 3.6, 5.3, 3.6, lw=2)
    picture(s, "w4-grad-xlsx-summary.png", 5.4, 2.25, 7.35, 1.45)
    caption(s, 5.4, 3.8, 7.35, "정리한 엑셀 — 졸업기준_요약 시트",
            "Excel 실제 화면 · 컴퓨터공학과만 필터, 일부 열 숨김 · 학번 구간마다 한 줄")
    table(s, 5.4, 4.55, 7.35, [2.0, 5.35], [
        ["시트", "용도"],
        ["졸업기준_요약", "학과 × 학번 구간 × 학생구분 한 줄 — DB 적재 원본"],
        ["학번별_신입생", "21~26학번을 한 학번씩 펼친 394행 — 챗봇 테스트 정답표"],
        ["졸업논문 · 필수과목", "논문 대체 수단 160건 · 필수 이수 교과목 265과목"],
        ["원본_셀단위 · 특이사항", "원문 칸 5,418개 보존 · 주의 사항 28건"],
    ], size=10, row_h=0.3, first_col_bold=True)
    nums = [("42", "학과 · 전공", "현행 기준 전체"), ("36", "21학번 기준 보유", "신설 6개는 22학번 이후"),
            ("5,418", "원문 칸 수", "21학번 이후 구간"), ("198 / 198", "교차 검증 일치", "PDF 텍스트와 자동 대조")]
    for i, (n, h, sub) in enumerate(nums):
        x = 0.55 + i * 3.08
        rect(s, x, 6.15, 2.93, 0.95, fill=LIGHT2, line=LINE)
        text(s, x + 0.15, 6.2, 2.7, 0.45, [(n, {"size": 20, "bold": True}), ], color=DARK, margin=0)
        text(s, x + 0.15, 6.68, 2.7, 0.35, [(h + "  ", {"size": 11, "bold": True, "color": DARK})], margin=0)
        text(s, x + 1.45, 6.7, 1.45, 0.35, sub, size=9, color=GRAY, margin=0, align=PP_ALIGN.RIGHT)

    # 17. 졸업요건 실데이터 — 특이사항 · 활용
    s = d.slide("7. 졸업요건 실데이터 — 특이사항 · 챗봇 반영 방법")
    picture(s, "w4-grad-xlsx-alias.png", 0.55, 1.05, 7.4, 2.15)
    caption(s, 0.55, 3.3, 7.4, "학과목록 시트 — 이전 명칭 · 별칭 (Excel 실제 화면, 일부 학과만 표시)",
            "컴퓨터공학과는 20~21학번 소속이 '컴퓨터공학전공' — 21학번은 옛 이름으로 물어볼 가능성이 큼")
    table(s, 0.55, 4.1, 7.4, [1.35, 3.6, 2.45], [
        ["특이사항", "내용", "챗봇 처리"],
        ["학과명 변경", "이전 명칭·별칭이 있는 학과 31개\n예: 컴퓨터공학전공 → 컴퓨터공학과", "별칭 사전 등록 ·\n당시 소속명 함께 표시"],
        ["신설 · 모집중단", "신설 6개(21학번 기준 없음) · 모집중단 5개", "기준 없음 안내 · 검색 유지"],
        ["요건 면제", "사회봉사 면제 7개 · 외국어 면제 11개 학과\n(내국인 신입생 기준)", "면제 여부를 먼저 답변"],
        ["다른 외국어 기준", "영문 TOEIC 700 · 일문 JLPT N3/JPT · 중문 HSK", "시험별 기준 병기"],
        ["2025학번 변경", "단수전공 '57+모듈1' · 모의토익 불인정", "문자열 조건으로 처리"],
    ], size=10, row_h=0.46, first_col_bold=True)
    text(s, 8.3, 1.02, 4.45, 0.35, "구조화 데이터 활용 계획", size=14, bold=True, color=DARK)
    flow = [("① DB 적재", "졸업기준_요약 → graduation_requirements\n키: 학과 · 학번 구간 · 학생구분"),
            ("② 학번 → 구간 매핑", "21학번 → '2020~2021' 열 조회\n별칭으로 학과명 정규화"),
            ("③ 예외 값 처리", "'-' · 면제 · '57+모듈1' · 복수 외국어 시험"),
            ("④ 정답표 테스트", "학번별_신입생 394행과 챗봇 답변\n자동 비교 → 틀린 학과 목록 출력")]
    for i, (h, b) in enumerate(flow):
        y = 1.45 + i * 1.32
        rect(s, 8.3, y, 4.45, 1.05, fill=LIGHT2 if i < 3 else WHITE, line=LINE if i < 3 else NAVY,
             shape=MSO_SHAPE.ROUNDED_RECTANGLE,
             label=[(h, {"bold": True, "size": 12})] + [(l, {"size": 10, "color": GRAY}) for l in b.split("\n")],
             align=PP_ALIGN.LEFT)
        if i < 3:
            arrow(s, 10.5, y + 1.05, 10.5, y + 1.32)
    label(s, 8.3, 6.8, 4.45, 0.4, "지금은 엑셀까지 완료 — ①~④는 5주차 작업", size=10, color=MUTED, align=PP_ALIGN.LEFT)

    # 18. 다음 주 계획
    s = d.slide("8. 다음 주 계획 (5주차 · 10/5 발표)")
    plans = [
        "졸업요건 엑셀을 챗봇에 연결해 카톡 답변을 실제 학과별 기준으로 바꾼다.",
        "아직 못 넣은 공통 기준 3종(교양 세부·외국어 대체·외국인 편입생)을 추가한다.",
        "학번별 정답표 394행과 챗봇 답변을 자동으로 비교하는 테스트를 만든다.",
        "고정 스킬 URL을 확보해 카톡 실기기에서 공지 알림과 응답 시간을 확인한다.",
        "미답변 관리 화면(FR-12)과 졸업요건 KB 검증 도구(FR-11)를 마무리한다.",
    ]
    lines = []
    for i, t in enumerate(plans, 1):
        lines.append((f"{i}.  {t}", {}))
        if i < len(plans):
            lines.append(("", {"size": 20}))
    text(s, 0.75, 1.45, 12.0, 5.3, lines, size=20, color=DARK)
    label(s, 0.75, 6.85, 12.0, 0.3,
          "1번이 가장 우선 — 끝나야 3번 테스트가 가능하고, 4번은 스킬 URL이 고정되어야 시작할 수 있음",
          size=12, color=GRAY, align=PP_ALIGN.LEFT)
