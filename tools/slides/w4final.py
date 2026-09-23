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
    "형상관리 · 요구사항 이행 상태",
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
          ("4주차 — 진행 보고 (공지 기능 구현)", {"size": 24, "color": NAVY})],
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
        [("4주차 목표였던 공지 기능을 계획대로 완료 — 5주차는 검증(KB 실데이터 · 실기기 E2E)에 집중", {"size": 12})],
        fill=LIGHT2, line=LINE, align=PP_ALIGN.LEFT)

    # 4. 이번 주 요약
    s = d.slide("1. 이번 주 작업 요약")
    text(s, 0.55, 1.02, 7.6, 0.35, "계획 대비 실제", size=15, bold=True, color=DARK)
    table(s, 0.55, 1.42, 7.6, [1.5, 3.0, 2.2, 0.9], [
        ["구분", "수행 내용", "산출물", "상태"],
        ["계획 작업", "공지 CRUD · 카톡 공지 조회\n(3주차에 설계만 했던 기능)", "코드 · 테스트 · 화면", "완료"],
        ["추가 1", "카카오톡 중복 응답 결함 수정", "responseBuilder 수정", "완료"],
        ["추가 2", "깨져 있던 회귀 테스트 복구", "test:kakao-grad", "완료"],
        ["추가 3", "공지 테스트 신규 작성", "test:notices 16건", "완료"],
        ["문서", "설계 산출물 13종 · 진행 보고 문서화", "GitHub docs/", "완료"],
    ], size=12, row_h=0.78, first_col_bold=True)
    text(s, 8.4, 1.02, 4.4, 0.35, "이번 주 지표", size=15, bold=True, color=DARK)
    nums = [("12", "변경된 파일 수", "신규 4 · 수정 8"),
            ("16", "신규 테스트 검사", "test:notices"),
            ("2", "수정한 결함", "중복 응답 · 회귀 테스트"),
            ("3", "GitHub 커밋", "26de462 · d1d9b72 · 43aa83f")]
    for i, (n, h, sub) in enumerate(nums):
        y = 1.42 + i * 1.32
        rect(s, 8.4, y, 4.35, 1.15, fill=LIGHT2, line=LINE)
        text(s, 8.6, y + 0.12, 1.2, 0.9, n, size=30, bold=True, color=DARK, margin=0)
        text(s, 9.9, y + 0.18, 2.7, 0.4, h, size=13, bold=True, color=DARK, margin=0)
        text(s, 9.9, y + 0.6, 2.7, 0.4, sub, size=11, color=GRAY, margin=0)
    label(s, 0.55, 6.85, 7.6, 0.3, "전체 테스트 4종 · 타입체크 통과 상태로 커밋", size=11, color=MUTED, align=PP_ALIGN.LEFT)

    # 5. 설계 → 구현
    s = d.slide("2. 공지 기능 — 설계 문서에서 구현으로")
    text(s, 0.55, 1.02, 7.6, 0.35, "3주차에 문서로만 정의했던 항목의 구현 결과", size=14, bold=True, color=DARK)
    table(s, 0.55, 1.45, 7.6, [1.4, 2.6, 3.4], [
        ["설계 항목", "3주차 정의", "구현 결과"],
        ["요구사항", "FR-06 공지 조회 / FR-10 공지 관리", "둘 다 구현 완료"],
        ["유스케이스", "UC-05 공지 조회 / UC-09 공지 관리", "기본·대안·예외 흐름 그대로 구현"],
        ["데이터", "notices 테이블 (10개 컬럼)", "마이그레이션 + 피드 인덱스 추가"],
        ["인터페이스", "공개 1 · 관리자 2 엔드포인트 그룹", "5개 엔드포인트 구현"],
        ["테스트", "TC-09 링크·게시기간 검증", "16개 검사로 확장"],
    ], size=12, row_h=0.7, first_col_bold=True)
    text(s, 8.5, 1.02, 4.3, 0.35, "확장 규칙(NFR-05) 검증", size=14, bold=True, color=DARK)
    box(s, 8.5, 1.45, 4.3, 2.55,
        [("설계 시 세운 규칙", {"bold": True, "size": 12, "color": NAVY}),
         ("\"새 도메인 = 파일 3개 추가 +", {"size": 12}),
         ("기존 코드 1곳만 수정\"", {"size": 12}), ("", {"size": 6}),
         ("실제 결과", {"bold": True, "size": 12, "color": NAVY}),
         ("신규: types/notice.ts", {"size": 11}),
         ("      services/noticeService.ts", {"size": 11}),
         ("      routes/notices.ts", {"size": 11}),
         ("수정: database.ts(테이블) · app.ts(등록)", {"size": 11}),
         ("      kakaoDialog.ts(메뉴 분기 1곳)", {"size": 11})],
        fill=LIGHT2, line=LINE, align=PP_ALIGN.LEFT)
    box(s, 8.5, 4.2, 4.3, 1.0,
        [("규칙대로 동작함", {"bold": True, "size": 13, "color": DARK}),
         ("기존 도메인(졸업요건·동아리·지도) 코드는 수정하지 않음", {"size": 11, "color": GRAY})],
        fill=WHITE, line=NAVY, align=PP_ALIGN.LEFT)
    text(s, 0.55, 5.45, 12.2, 0.35, "구현 범위", size=14, bold=True, color=DARK)
    feats = [("관리자 CRUD", "등록·수정·삭제·목록"),
             ("게시 제어", "게시 여부 · 상단 고정 · 게시 기간"),
             ("카톡 조회", "게시 중인 공지 상위 5건"),
             ("입력 검증", "필수값 · http(s) 링크만 허용"),
             ("출력 클램프", "총 900자 · 초과분 건수 안내")]
    for i, (h, b) in enumerate(feats):
        x = 0.55 + i * 2.46
        rect(s, x, 5.85, 2.3, 1.0, fill=LIGHT2, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE,
             label=[(h, {"bold": True, "size": 12}), (b, {"size": 10, "color": GRAY})])

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
    label(s, 0.55, 5.1, 6.1, 0.3, "인덱스: (published, pinned, updated_at) — 학생 조회 정렬 기준", size=10, color=MUTED, align=PP_ALIGN.LEFT)
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

    # 9. 대시보드
    s = d.slide("3. 공지 기능 — 대시보드 · 비개발자 운영")
    picture(s, "w4-admin-dashboard.png", 0.55, 1.1, 7.6, 5.3)
    caption(s, 0.55, 6.5, 7.6, "대시보드 — 공지 건수가 현황 카드에 반영",
            "서버 상태(/health)와 운영 경고를 같은 화면에서 확인")
    text(s, 8.5, 1.02, 4.3, 0.35, "비개발자 운영(NFR-04) 관점", size=14, bold=True, color=DARK)
    ops = [("재배포 불필요", "공지를 등록하면 카톡 응답에 즉시 반영"),
           ("상태가 눈에 보임", "게시 중 · 초안 · 예약 · 종료를 목록에서 구분"),
           ("실수 방지", "링크 형식 오류·필수값 누락은 저장 단계에서 차단"),
           ("사전 확인", "학생 화면 형식을 미리보기로 확인 후 저장"),
           ("현황 파악", "공지·졸업요건·동아리·미답변 건수를 한 화면에서 확인")]
    for i, (h, b) in enumerate(ops):
        y = 1.45 + i * 1.08
        rect(s, 8.5, y, 4.3, 0.95, fill=LIGHT2, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE,
             label=[(h, {"bold": True, "size": 12}), (b, {"size": 10, "color": GRAY})], align=PP_ALIGN.LEFT)

    # 10. 카카오톡
    s = d.slide("4. 공지 기능 — 카카오톡 동작 확인")
    picture(s, "kakao_notice.png", 0.55, 1.1, 3.0, 5.6)
    text(s, 4.2, 1.02, 8.6, 0.35, "학생 화면에서 확인한 내용", size=15, bold=True, color=DARK)
    table(s, 4.2, 1.45, 8.55, [2.0, 3.2, 3.3], [
        ["항목", "설계 규칙", "실제 응답"],
        ["정렬", "고정 공지 우선, 그다음 최신순", "[고정] 장학금 안내가 첫 번째"],
        ["건수", "게시 중인 공지 상위 5건", "등록 4건 중 3건 노출"],
        ["초안 제외", "published=0 은 학생에게 미노출", "'[초안] 겨울 계절학기'가 빠짐"],
        ["링크", "http(s) 링크만 본문에 표시", "장학금 공지에만 링크 표시"],
        ["길이", "총 900자 이내로 클램프", "259자 (여유 있음)"],
        ["메뉴 복귀", "응답 끝에 메뉴 버튼 재제시", "졸업요건·동아리·지도·공지 4개"],
    ], size=12, row_h=0.62, first_col_bold=True)
    box(s, 4.2, 5.85, 8.55, 0.95,
        [("스텁에서 실제 기능으로", {"bold": True, "size": 13, "color": NAVY}),
         ("3주차까지는 '등록된 공지가 없습니다' 고정 문구였고, 이번 주에 DB 조회 결과로 대체되었습니다.", {"size": 11})],
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
    picture(s, "term_tests.png", 0.55, 1.1, 7.4, 5.6)
    text(s, 8.3, 1.02, 4.5, 0.35, "실행한 테스트", size=15, bold=True, color=DARK)
    table(s, 8.3, 1.45, 4.5, [2.0, 2.5], [
        ["스크립트", "검사 내용"],
        ["test:notices", "공지 16건 (신규)"],
        ["test:kakao-grad", "졸업요건 대화 전 구간"],
        ["test:graduation", "정형 조회 · 미존재"],
        ["test:room-code", "호실 코드 변환"],
        ["typecheck", "타입 오류 0건"],
    ], size=11, row_h=0.52, first_col_bold=True)
    box(s, 8.3, 4.6, 4.5, 1.35,
        [("아직 못 한 단계", {"bold": True, "size": 12, "color": NAVY}),
         ("시스템(실기기 카톡) · 인수 테스트", {"size": 11}),
         ("→ 스킬 URL 고정 후 5주차에 실행", {"size": 11, "color": GRAY})],
        fill=WHITE, line=NAVY, align=PP_ALIGN.LEFT)
    label(s, 8.3, 6.15, 4.5, 0.6, "테스트는 임시 DB로 실행되어 운영 데이터에 영향 없음", size=10, color=MUTED, align=PP_ALIGN.LEFT)

    # 14. 형상관리
    s = d.slide("6. 형상관리 · 문서화")
    picture(s, "term_git.png", 0.55, 1.1, 7.4, 3.3)
    caption(s, 0.55, 4.55, 7.4, "GitHub 커밋 이력", "커밋 메시지에 구현 범위 · 수정한 결함 · 설계 문서 연결을 기록")
    text(s, 0.55, 5.4, 7.4, 0.35, "커밋 규칙", size=14, bold=True, color=DARK)
    commits = [("feat", "기능 추가"), ("fix", "결함 수정"), ("docs", "문서"), ("test", "테스트")]
    for i, (h, b) in enumerate(commits):
        x = 0.55 + i * 1.9
        rect(s, x, 5.8, 1.75, 0.8, fill=LIGHT2, line=LINE, shape=MSO_SHAPE.ROUNDED_RECTANGLE,
             label=[(h, {"bold": True, "size": 12}), (b, {"size": 10, "color": GRAY})])
    text(s, 8.3, 1.02, 4.5, 0.35, "레포에 정리한 문서", size=14, bold=True, color=DARK)
    box(s, 8.3, 1.45, 4.5, 2.5,
        [("docs/design/  (3주차 설계 13종)", {"bold": True, "size": 12}),
         ("개요 · 방법론 · WBS · 모듈 구조", {"size": 11}),
         ("시퀀스 · 상태 · ERD · 테이블 명세", {"size": 11}),
         ("API 18종 · 위험 관리 · 추적표 · UC 명세", {"size": 11}), ("", {"size": 6}),
         ("docs/progress/  (주차별 진행 보고)", {"bold": True, "size": 12}),
         ("2026-W04-진행보고.md", {"size": 11})],
        fill=LIGHT2, line=LINE, align=PP_ALIGN.LEFT)
    box(s, 8.3, 4.15, 4.5, 1.15,
        [("발표에서 뺀 상세 산출물을 문서로 유지", {"bold": True, "size": 12}),
         ("최종 보고서에 그대로 포함할 예정", {"size": 11, "color": GRAY})],
        fill=WHITE, line=NAVY, align=PP_ALIGN.LEFT)
    label(s, 8.3, 5.45, 4.5, 0.9, "레포: jaewonkyoung-alt/wise-faq-bot (private)\n코드 · 설계 문서 · 진행 보고 · 발표 자료를 한곳에서 관리",
          size=10, color=MUTED, align=PP_ALIGN.LEFT)

    # 15. 요구사항 이행 상태
    s = d.slide("6. 요구사항 이행 상태")
    table(s, 0.55, 1.05, 12.2, [1.0, 2.6, 5.2, 1.3, 2.1], [
        ["ID", "요구사항", "이번 주까지 상태", "진행", "검증"],
        ["FR-01", "메뉴 제공", "카톡 진입·'메뉴' 입력 시 버튼 4개 응답", "완료", "TC-11"],
        ["FR-02", "졸업요건 단계 조회", "연도 → 단과대 → 학과 슬롯 대화 동작", "완료", "TC-01·02·03"],
        ["FR-03", "졸업요건 원문 제공", "PDF 링크 버튼 (공개 URL 설정 시)", "완료", "TC-03"],
        ["FR-04", "호실 위치 안내", "호실 코드 → 건물·층 변환", "완료", "TC-04"],
        ["FR-05", "동아리 질의응답", "정형 조회 + 의미 검색, 출처 표기", "완료", "TC-05·06"],
        ["FR-06", "공지 조회", "게시 중인 공지 상위 5건 카톡 응답", "완료", "test:notices"],
        ["FR-07", "관리자 인증", "토큰 게이트 (미설정 시 전면 차단)", "완료", "TC-07·08"],
        ["FR-08", "졸업요건 관리", "등록·수정·삭제·목록", "완료", "TC-12"],
        ["FR-09", "동아리 관리", "등록·수정·삭제 + 자동 재색인", "완료", "TC-06"],
        ["FR-10", "공지 관리", "등록·수정·삭제 · 게시 기간 · 고정", "완료", "test:notices"],
        ["FR-11", "폴더 KB 재스캔", "재스캔 동작 · 실데이터 검증은 5주차", "진행", "5주차"],
        ["FR-12", "미답변 관리", "수집·조회 동작 · 화면 정리 예정", "진행", "5주차"],
        ["FR-13", "전체 재색인", "동작하나 임베딩 교체 후 재점검 필요", "예정", "6주차"],
    ], size=11, row_h=0.42, first_col_bold=True)
    label(s, 0.55, 7.05, 12.2, 0.3, "완료 10 · 진행 2 · 예정 1  —  학생 기능(FR-01~06)은 전부 동작", size=11, color=GRAY, align=PP_ALIGN.LEFT)

    # 16. 다음 주 계획
    s = d.slide("7. 다음 주 계획 (5주차 · 10/5 발표)")
    plans = [("구현", ["미답변 관리 화면 마무리 (FR-12)", "졸업요건 KB 검증 도구 (FR-11)"]),
             ("검증", ["졸업요건 원문 대조 — 컴퓨터공학과 우선", "카톡 실기기 E2E 시나리오 실행", "응답 시간 측정 준비"]),
             ("운영", ["고정 스킬 URL 확보 방안 확정", "오픈빌더 재연결 체크리스트 작성"])]
    for i, (h, items) in enumerate(plans):
        x = 0.55 + i * 4.15
        rect(s, x, 1.15, 3.9, 0.55, fill=NAVY, label=h, size=16, bold=True, color=WHITE, line=None)
        rect(s, x, 1.7, 3.9, 2.35, fill=LIGHT2, line=LINE)
        bullets(s, x + 0.15, 1.85, 3.6, 2.15, items, size=13)
    text(s, 0.55, 4.35, 12.2, 0.35, "남은 이슈 (우선순위 순)", size=14, bold=True, color=DARK)
    issues = [("R1", "카톡 스킬 URL 미고정", "터널 재시작 시 주소 변경 → 실기기 검증이 막힘", "5주"),
              ("R2", "실기기 카톡 검증 0회", "현재 증거는 로컬 서버 응답", "5주"),
              ("R3", "졸업요건 데이터가 예시값", "학생 노출 전 원문 대조 필요", "5주"),
              ("R4", "응답 시간 미측정", "카톡 5초 제한 대비 실측 없음", "6주")]
    for i, (rid, h, b, w) in enumerate(issues):
        y = 4.78 + i * 0.6
        rect(s, 0.55, y, 0.7, 0.5, fill=NAVY, label=rid, size=11, bold=True, color=WHITE)
        rect(s, 1.3, y, 10.2, 0.5, fill=LIGHT2, line=LINE,
             label=[(f"{h} — {b}", {"size": 11})], align=PP_ALIGN.LEFT)
        rect(s, 11.6, y, 1.15, 0.5, fill=WHITE, line=NAVY, label=w, size=11, bold=True)
    label(s, 0.55, 7.15, 12.2, 0.3, "R1이 해결되어야 R2(실기기 검증)와 시스템 테스트가 시작됨", size=11, color=GRAY, align=PP_ALIGN.LEFT)
