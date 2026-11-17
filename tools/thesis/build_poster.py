"""A1 논문 요약 포스터 — 학과 붙임3-b 「A1 사이즈 논문포스터(ver.2).pptx」 크기 · 색 · 글꼴로, 붙임4 예시의 구성
(제안 서비스 · 서론 · 이론적 배경 · 시스템 설계 | 프로그램 구현 · 실험 · 결론 · REFERENCES)을 따른다.

  python3 build_poster.py <붙임3-b 템플릿.pptx> [출력.pptx] [--v5 | --v6]

--v5: 붙임4 예시의 작성 안내를 그대로 따른다 — 시스템 설계에 「요구사항 명세서」 표, 실험은 「결과 화면 위주」.
--v6: v5 + 프로그램 구현을 안내대로 「시스템 환경 · 시스템 구성 · 시스템 구현」으로 (논문 개발 · 운영 환경 표 추가).
"""
import sys
import tempfile
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Cm, Pt

ROOT = Path(__file__).resolve().parents[2]
IMG = Path(__file__).parent / 'img'
SHOT = ROOT / 'tools/slides/img'
ARGS = [a for a in sys.argv[1:] if not a.startswith('--')]
V6 = '--v6' in sys.argv
V5 = V6 or '--v5' in sys.argv
TEMPLATE = Path(ARGS[0])
OUT = Path(ARGS[1]) if len(ARGS) > 1 else ROOT / 'docs/thesis/2021212843_경재원_A1포스터.pptx'

BLUE = RGBColor(0x2D, 0x76, 0xA3)
INK = RGBColor(0x1A, 0x1A, 0x1A)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
FONT = '나눔고딕'

prs = Presentation(str(TEMPLATE))
slide = prs.slides[0]
for sh in list(slide.shapes):  # 템플릿의 자리표시 내용은 지우고 크기 · 색 · 글꼴만 쓴다
    sh._element.getparent().remove(sh._element)
bg = slide.background.fill
bg.solid()
bg.fore_color.rgb = BLUE


def text(x, y, w, h, lines, size=20, color=INK, bold=False, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, spacing=1.15):
    tb = slide.shapes.add_textbox(Cm(x), Cm(y), Cm(w), Cm(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = Cm(0.2)
    tf.margin_top = tf.margin_bottom = Cm(0.1)
    for i, ln in enumerate(lines if isinstance(lines, list) else [lines]):
        opts = {}
        if isinstance(ln, tuple):
            ln, opts = ln
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = opts.get('align', align)
        p.line_spacing = spacing
        p.space_after = Pt(opts.get('after', 4))
        r = p.add_run()
        r.text = ln
        f = r.font
        f.name = FONT
        f.size = Pt(opts.get('size', size))
        f.bold = opts.get('bold', bold)
        f.color.rgb = opts.get('color', color)
    return tb


def rect(x, y, w, h, fill, shape=MSO_SHAPE.RECTANGLE):
    s = slide.shapes.add_shape(shape, Cm(x), Cm(y), Cm(w), Cm(h))
    s.fill.solid()
    s.fill.fore_color.rgb = fill
    s.line.fill.background()
    return s


def header(x, y, w, title):
    s = rect(x, y, w, 1.9, BLUE)
    tf = s.text_frame
    tf.vertical_anchor = MSO_ANCHOR.MIDDLE
    p = tf.paragraphs[0]
    p.alignment = PP_ALIGN.CENTER
    r = p.add_run()
    r.text = title
    r.font.name = FONT
    r.font.size = Pt(40)
    r.font.bold = True
    r.font.color.rgb = WHITE
    rect(x, y + 1.9, w, 0.08, BLUE)


def picture(path, x, y, w, h=None):
    from PIL import Image
    iw, ih = Image.open(path).size
    ph = w * ih / iw
    if h and ph > h:
        ph, w2 = h, h * iw / ih
        x += (w - w2) / 2
        w = w2
    slide.shapes.add_picture(str(path), Cm(x), Cm(y), Cm(w), Cm(ph))
    return ph


def caption(x, y, w, s, size=16, h=0.9):
    text(x, y, w, h, s, size=size, color=RGBColor(0x44, 0x44, 0x44), align=PP_ALIGN.CENTER)


def crop_bottom(path, px):
    """카톡 화면 캡처의 아래쪽 대화 부분만 잘라 쓴다(위는 빈 배경)."""
    from PIL import Image
    im = Image.open(path)
    out = Path(tempfile.mkdtemp()) / Path(path).name
    im.crop((0, max(0, im.height - px), im.width, im.height)).save(out)
    return out


def table(x, y, w, rows, widths, size=16, row_h=0.9, aligns=None, pad=None):
    shape = slide.shapes.add_table(len(rows), len(rows[0]), Cm(x), Cm(y), Cm(w), Cm(row_h * len(rows)))
    tbl = shape.table
    for i, cw in enumerate(widths):
        tbl.columns[i].width = Cm(cw)
    for r, row in enumerate(rows):
        for c, val in enumerate(row):
            cell = tbl.cell(r, c)
            cell.fill.solid()
            cell.fill.fore_color.rgb = BLUE if r == 0 else (RGBColor(0xF2, 0xF6, 0xF9) if r % 2 else WHITE)
            cell.margin_left = cell.margin_right = Cm(0.15)
            if pad is not None:
                cell.margin_top = cell.margin_bottom = Cm(pad)
                cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            tf = cell.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            if aligns:
                p.alignment = PP_ALIGN.CENTER if r == 0 else aligns[c]
            else:
                p.alignment = PP_ALIGN.CENTER if c else PP_ALIGN.LEFT
            rr = p.add_run()
            rr.text = val
            rr.font.name = FONT
            rr.font.size = Pt(size)
            rr.font.bold = r == 0
            rr.font.color.rgb = WHITE if r == 0 else INK
    return shape


# ── 제목 ──
text(2, 0.9, 55.4, 3.4, '환각을 억제한 카카오톡 캠퍼스 정보 질의응답 챗봇', size=68, color=WHITE, bold=True,
     align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
text(2, 4.4, 55.4, 1.7, '졸업요건·동아리·강의실·공지를 중심으로', size=34, color=WHITE,
     bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
text(2, 6.1, 55.4, 2.1, 'A Hallucination-Suppressed KakaoTalk Chatbot for Campus Information Question Answering: Focusing on Graduation Requirements, Clubs, Classrooms, and Notices',
     size=24, color=WHITE, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
text(2, 8.2, 55.4, 1.3, 'Jaewon Kyoung, 2021212843 / Computer Engineering / Advisor: Prof. Seung Hyun Oh',
     size=24, color=WHITE, bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
panel = rect(1.3, 10.6, 56.8, 72.6, WHITE, MSO_SHAPE.ROUNDED_RECTANGLE)
panel.adjustments[0] = 0.015

L, R, W = 2.5, 31.2, 25.7

# ── 왼쪽: 제안 서비스 ──
header(L, 11.8, W, '제안하는 캠퍼스 정보 챗봇')
ph = picture(IMG / 'phone-grad.jpg', L + 0.6, 14.4, 7.6)
picture(IMG / 'phone-club-map-notice.jpg', L + 8.9, 14.4, 7.6, ph)
text(L + 17.0, 14.4, 8.7, ph, [
    ('카카오톡에서 묻고', {'bold': True, 'size': 22}),
    ('졸업요건 42개 학과', {'size': 19}),
    ('동아리 61곳', {'size': 19}),
    ('호실 287개 · 공지', {'size': 19, 'after': 14}),
    ('관리자 화면에서 수정', {'bold': True, 'size': 22}),
    ('학교 PDF · 엑셀 올리기', {'size': 19}),
    ('미리보기 → 적용 → 복원', {'size': 19}),
    ('재배포 없이 0.3초 내 반영', {'size': 19}),
], size=19)
caption(L, 14.4 + ph + 0.2, W, '실제 휴대폰 카카오톡 화면 (졸업요건 · 동아리 · 호실 · 공지)')

# ── 왼쪽: 서론 ──
y = 14.4 + ph + 1.6
header(L, y, W, '서론')
text(L, y + 2.3, W, 9.0, [
    '• 졸업요건은 학과별 PDF 42개, 동아리는 SNS · 게시판, 강의실은 지도에 흩어져 있다.',
    '• 기존 대학 챗봇 사례는 비개발자가 데이터를 고치는 방법을 다루지 않아, 만든 학생이 졸업하면 갱신이 멈추기 쉽다.',
    '• 질문: 「챗봇을 만들 수 있는가」가 아니라 「지어내지 않으면서, 개발자가 떠난 뒤에도 데이터가 유지되는가」.',
    '• 정량 목표 5개: 동아리 정답률 90%, 환각 5% 이하, 졸업기준 95%, 수정 반영 60초, 응답 5초.',
], size=19)

# ── 왼쪽: 이론적 배경 ──
y += 11.0
header(L, y, W, '이론적 배경')
text(L, y + 2.3, W, 3.6, [
    '• 규칙 · 시나리오 기반 챗봇(킹고봇 · 한경대 · 인하공전 · 동덕여대): 정해진 데이터로 답해 출처가 분명하나, 비개발자 갱신 방법은 기술되지 않음.',
    '• 생성형 RAG 챗봇(홍익대 · iSKKUbot · MMU TALK · 충남대): 표현에 강하나 환각 위험, 카카오톡 5초 제한에서의 동작은 확인되지 않음.',
], size=18)
table(L, y + 6.2, W, [
    ['비교 (8개 사례)', '비개발자 갱신', '범위 밖 평가', '정량 평가'],
    ['기존 사례', '기술 없음', '확인 안 됨', '3건'],
    ['본 연구', '관리자 웹', '30문항 실측', '목표 5개 실측'],
], [8.5, 5.8, 5.6, 5.8], size=17)

# ── 왼쪽: 시스템 설계 ──
y += 10.0
header(L, y, W, '시스템 설계')
if V5:  # 붙임4 안내: 「논문의 3장 시스템 설계 내용을 넣기(요구사항 명세서 등)」 — 논문 FR 표(label fr) 그대로
    LEFT, MID = PP_ALIGN.LEFT, PP_ALIGN.CENTER
    fr = [['ID', '요구사항', '내용', '상태'],
          ['FR-01', '메뉴 제공', '카카오톡 버튼 4개 (졸업요건 · 동아리 · 지도 · 공지)', '완료'],
          ['FR-02', '졸업요건 단계 조회', '학번 → 단과대 → 학과 순 선택 또는 한 문장 질문', '완료'],
          ['FR-03', '졸업요건 원문', '학과 원문 PDF 링크 버튼', '완료'],
          ['FR-04', '호실 위치 안내', '「S504」 → 건물 · 층 · 카카오맵', '완료'],
          ['FR-05', '동아리 질의응답', '정형 질문 + 자유 질문 의미 검색', '완료'],
          ['FR-06', '공지 조회 · 알림 구독', '공지 목록, 구독자에게 다음 대화 때 새 공지', '완료'],
          ['FR-07', '관리자 인증', '토큰 인증, 토큰이 없으면 모든 관리자 API 차단', '완료'],
          ['FR-08', '졸업요건 관리', '학과 PDF 올리기 → 바뀐 칸 미리보기 → 적용 · 되돌리기', '완료'],
          ['FR-09', '동아리 관리', '입력 칸 · 엑셀 일괄 수정, 키워드 사전, 자동 재색인', '완료'],
          ['FR-10', '공지 관리', '게시 · 고정 · 기간, 종료 시 자동 휴지통 · 30일 후 삭제', '완료'],
          ['FR-11', '데이터 점검', '빠진 데이터를 찾아 고칠 곳을 한국어로 안내', '완료'],
          ['FR-12', '미답변 관리', '답 못 한 질문 묶음 · 해결 · 무시 · 사전에 추가', '완료'],
          ['FR-13', '전체 재색인', '임베딩 모델이 바뀌면 시작할 때 자동 재임베딩', '완료']]
    ty = y + 2.4
    table(L, ty, W, fr, [2.3, 5.6, 15.6, 2.2], size=13, row_h=0.8, aligns=[MID, LEFT, LEFT, MID], pad=0.05)
    ty += 0.8 * len(fr) + 0.1
    caption(L, ty, W, '기능 요구사항 명세 (요약) — 13개 모두 구현 · 유스케이스 10개(학생 4 · 관리자 6)')
    ty += 1.4
    ph = picture(IMG / 'fig-architecture.png', L, ty, W, 81.0 - ty)
    caption(L, ty + ph + 0.1, W, '시스템 아키텍처 — 카카오 스킬 서버 · 관리자 API · SQLite · 로컬 임베딩')
else:
    ph = picture(IMG / 'fig-architecture.png', L, y + 2.4, W, 15.5)
    caption(L, y + 2.4 + ph + 0.1, W, '시스템 아키텍처 — 카카오 스킬 서버 · 관리자 API · SQLite · 로컬 임베딩')
    text(L, y + 3.6 + ph, W, 4.0, [
        '• 유스케이스 10개(학생 4 · 관리자 6), 기능 요구사항 13개 모두 구현',
        '• 동아리 점수 = 임베딩 유사도 + 0.4 × 사전 일치, 근거 약하면 「확인되지 않았어요」 고지',
        '• 답은 DB 값으로 만든 템플릿 — 생성형 모델이 문장을 쓰지 않음',
    ], size=18)

# ── 오른쪽: 프로그램 구현 ──
header(R, 11.8, W, '프로그램 구현')
y = 14.3
if V6:  # 붙임4 안내: 「시스템 환경, 시스템 구성, 시스템 구현 내용으로 구성」 — 논문 개발 · 운영 환경 표(label env) 그대로
    env = [['구분', '사용 기술'],
           ['하드웨어', 'Mac mini (Apple M4 · 16GB) 1대 — 개발과 운영 겸용'],
           ['서버', 'Node.js 24 · Express 4 · TypeScript (소스 6,701줄)'],
           ['데이터베이스', 'SQLite (better-sqlite3), 파일 지식베이스 data/kb'],
           ['임베딩', 'Ollama + qwen3-embedding:0.6b (1,024차원, 639MB)'],
           ['관리자 화면', 'HTML · CSS · JavaScript, 빌드 과정 없음 (2,779줄)'],
           ['데이터 도구', 'Python 3.9 이상 · pdfplumber · openpyxl (가상환경)'],
           ['운영', 'launchd 상시 실행 · 자동 재시작, ngrok 고정 도메인 (스킬 경로만 공개)'],
           ['형상 관리 · 시험', 'Git · GitHub 공개 저장소 (커밋 51개, 9/3 ~ 11/1), 자동 시험 15종']]
    table(R, y, W, env, [4.8, 20.9], size=13, row_h=0.75, aligns=[PP_ALIGN.CENTER, PP_ALIGN.LEFT], pad=0.04)
    y += 0.75 * len(env) + 0.1
    caption(R, y, W, '시스템 환경 — 개발 · 운영 환경')
    y += 1.4
ph = picture(IMG / 'fig-deploy.png', R, y, W, 10.0 if V6 else 13.0 if V5 else None)
caption(R, y + ph + 0.1, W, '시스템 구성 — Mac mini 1대 · Node.js · Ollama(qwen3-embedding 0.6B) · ngrok')
y = y + ph + 1.3
ph = picture(SHOT / 'w7-admin-preview.png', R, y, W, 8.5 if V6 else 11.0 if V5 else None)
caption(R, y + ph + 0.1, W, '시스템 구현 — 졸업기준 PDF 올리기: 바뀐 칸만 미리보고 「적용」 · 「되돌리기」' if V6
        else '졸업기준 PDF 올리기 — 바뀐 칸만 미리보고 「적용」 · 「되돌리기」')
y += ph + 1.3
text(R, y, W, 4.2, [
    '• PDF 표를 선 · 글자 좌표로 복원 → 42개 학과 523행, 검수 데이터와 차이 0',
    '• 미답변 질문 묶음 → 「사전에 추가」 → 같은 질문에 바로 답',
    '• 설치 스크립트 1개 · 자동 시험 15종으로 다음 운영자가 바로 이어받음',
], size=18)

# ── 오른쪽: 실험 ──
y += 3.1 if V6 else 3.4 if V5 else 4.6
header(R, y, W, '실험')
RESULTS = [
    ['항목', '기준', '결과'],
    ['동아리 정확도', '90% 이상', '50/50 (100%)'],
    ['사전 밖 표현 (임베딩)', '—', '18/28 (문자 기반 4/28)'],
    ['환각 (범위 밖 30문항)', '5% 이하', '단정 오답 1 (3.3%)'],
    ['졸업기준 정확도', '95% 이상', '7,880개 값 100%'],
    ['관리자 수정 반영', '60초 이내', '0.3초 이내'],
    ['응답 시간 (공개 주소)', '평균 5초', '평균 0.125초 · 최대 0.23초'],
    ['유출 시도 (카톡 문장)', '—', '21건 중 유출 0건'],
]
SUMMARY = '• 휴대폰 카카오톡 실기기 5건 모두 정상 · 관리자 화면 사전 점검으로 막힌 곳 5개 개선'
if V5:  # 붙임4 안내: 「실험 결과 화면 위주로 구성」 — 논문 5.5절 문항(학식 · 스키)과 [그림 yt]의 실제 응답 화면
    sy = y + 2.5
    sw = 6.1
    gap = (W - 4 * sw) / 3
    for i, name in enumerate(['w8-kakao-lunch', 'w8-kakao-ski', 'w8-kakao-yt-before', 'w8-kakao-yt-after']):
        sh_h = picture(crop_bottom(SHOT / f'{name}.png', 1000), R + i * (sw + gap), sy, sw)
    sy += sh_h + 0.15
    pw = 2 * sw + gap
    two = {'after': 0}
    caption(R, sy, pw, [('데이터에 없는 질문 — 메뉴 안내(왼쪽),', two),
                        ('「확인되지 않았어요」 고지 후 추천(오른쪽)', two)], size=15, h=1.6)
    caption(R + pw + gap, sy, pw, [('사전에 「유튜브, 브이로그 → 영상」 추가', two),
                                   ('전(왼쪽) · 후(오른쪽) — 같은 질문에 바로 답', two)], size=15, h=1.6)
    sy += 1.9
    rh = 0.8 if V6 else 0.85
    table(R, sy, W, RESULTS, [8.6, 5.2, 11.9], size=16, row_h=rh, pad=0.05)
    sy += rh * len(RESULTS) + 0.2
    text(R, sy, W, 1.6, SUMMARY, size=17)
    y = sy + (1.8 if V6 else 2.0)
else:
    table(R, y + 2.4, W, RESULTS, [8.6, 5.2, 11.9], size=17, row_h=1.0)
    text(R, y + 11.0, W, 2.0, SUMMARY, size=18)
    y += 13.4

# ── 오른쪽: 결론 ──
header(R, y, W, '결론')
text(R, y + 2.3, W, 7.0, [
    '• 정량 목표 5개 모두 달성. 비교한 8개 사례에 기술되지 않았던 「비개발자 갱신 경로」를 미리보기 · 적용 · 되돌리기 화면으로 제공했다.',
    '• 생성 없이 검색 + 템플릿으로 답해 환각을 억제하고, 작은 로컬 모델의 한계는 키워드 사전과 미답변 보완으로 메웠다.',
    '• 향후: 선언형 도메인 모듈, 「동아리」 없이 묻는 질문의 분류 개선, 학교 서버 이전, 참가자 사용성 테스트.',
], size=18)

# ── REFERENCES ──
y += 8.4 if V6 else 9.8
text(R, y, W, 1.2, 'REFERENCES.', size=26, bold=True)
text(R, y + 1.3, W, 5.0, [
    '1. 박소희, 김미희, “톡톡한 한경이: 학내 챗봇 서비스 설계 및 개발”, 2020 온라인 춘계학술발표대회 논문집, 27(1), 352-353, 2020.',
    '2. 전지수 외, “HyDE를 활용한 RAG 기반 학사공지 챗봇의 성능 향상”, ACK 2024 학술발표대회 논문집, 31(2), 815-816, 2024.',
    '3. Lewis, P. et al., “Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks”, NeurIPS, 33, 9459-9474, 2020.',
    '4. Zhang, Y. et al., “Qwen3 Embedding”, arXiv:2506.05176, 2025.',
    '5. 동국대학교 WISE캠퍼스, 2026학년도 학사제도 및 학업이수가이드, https://wise.dongguk.ac.kr/page/155, 2026.09.',
], size=13, spacing=1.05)

prs.save(str(OUT))
print('saved', OUT)
