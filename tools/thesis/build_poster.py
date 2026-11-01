"""A1 논문 요약 포스터 — 학과 붙임3-b 「A1 사이즈 논문포스터(ver.2).pptx」 크기 · 색 · 글꼴로, 붙임4 예시의 구성
(제안 서비스 · 서론 · 이론적 배경 · 시스템 설계 | 프로그램 구현 · 실험 · 결론 · REFERENCES)을 따른다.

  python3 build_poster.py <붙임3-b 템플릿.pptx> [출력.pptx]
"""
import sys
from pathlib import Path

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import MSO_ANCHOR, PP_ALIGN
from pptx.util import Cm, Pt

ROOT = Path(__file__).resolve().parents[2]
IMG = Path(__file__).parent / 'img'
SHOT = ROOT / 'tools/slides/img'
TEMPLATE = Path(sys.argv[1])
OUT = Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / 'docs/thesis/2021212843_경재원_A1포스터.pptx'

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


def caption(x, y, w, s):
    text(x, y, w, 0.9, s, size=16, color=RGBColor(0x44, 0x44, 0x44), align=PP_ALIGN.CENTER)


def table(x, y, w, rows, widths, size=16, row_h=0.9):
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
            tf = cell.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            p.alignment = PP_ALIGN.CENTER if c else PP_ALIGN.LEFT
            rr = p.add_run()
            rr.text = val
            rr.font.name = FONT
            rr.font.size = Pt(size)
            rr.font.bold = r == 0
            rr.font.color.rgb = WHITE if r == 0 else INK
    return shape


# ── 제목 ──
text(2, 0.9, 55.4, 3.4, '점진적 확장이 가능한 캠퍼스 정보 질의응답 챗봇', size=70, color=WHITE, bold=True,
     align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
text(2, 4.4, 55.4, 1.7, '하이브리드 검색 기반의, 비개발자가 직접 운영 · 갱신하는 대학 지식베이스 시스템', size=34, color=WHITE,
     bold=True, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
text(2, 6.3, 55.4, 1.5, 'An Incrementally Extensible Campus Information Q&A Chatbot Maintained Directly by Non-Developers',
     size=28, color=WHITE, align=PP_ALIGN.CENTER, anchor=MSO_ANCHOR.MIDDLE)
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
    '• 졸업요건은 학과별 PDF 51개, 동아리는 SNS · 게시판, 강의실은 지도에 흩어져 있다.',
    '• 기존 대학 챗봇은 데이터를 개발자만 고칠 수 있어, 만든 학생이 졸업하면 갱신이 멈춘다.',
    '• 질문: 「챗봇을 만들 수 있는가」가 아니라 「개발자가 떠난 뒤에도 데이터가 유지되는가」.',
    '• 목표: 동아리 정답률 90%, 환각 5% 이하, 수정 반영 60초, 응답 5초 등 6개 지표.',
], size=19)

# ── 왼쪽: 이론적 배경 ──
y += 11.0
header(L, y, W, '이론적 배경')
text(L, y + 2.3, W, 3.6, [
    '• 카카오톡 · 시나리오 챗봇(성균관대 · 한경대 · 동덕여대): 출처는 분명하나 사전 밖 표현에 약하고 개발자만 갱신.',
    '• 생성형 RAG 챗봇(홍익대 · 성균관대 · 목포해양대 · 충남대): 표현에 강하나 환각 위험, 5초 제한에 불리.',
], size=18)
table(L, y + 6.2, W, [
    ['비교 (8개 사례)', '비개발자 갱신', '범위 밖 평가', '카톡 5초'],
    ['기존 사례', '0건', '0건', '일부'],
    ['본 연구', '관리자 웹', '30문항 실측', '최대 0.23초'],
], [8.5, 5.8, 5.6, 5.8], size=17)

# ── 왼쪽: 시스템 설계 ──
y += 10.0
header(L, y, W, '시스템 설계')
ph = picture(IMG / 'fig-architecture.png', L, y + 2.4, W, 15.5)
caption(L, y + 2.4 + ph + 0.1, W, '시스템 아키텍처 — 카카오 스킬 서버 · 관리자 API · SQLite · 로컬 임베딩')
text(L, y + 3.6 + ph, W, 4.0, [
    '• 유스케이스 10개(학생 4 · 관리자 6), 기능 요구사항 13개 모두 구현',
    '• 동아리 점수 = 임베딩 유사도 + 0.4 × 사전 일치, 근거 약하면 「확인되지 않았어요」 고지',
    '• 답은 DB 값으로 만든 템플릿 — 생성형 모델이 문장을 쓰지 않음',
], size=18)

# ── 오른쪽: 프로그램 구현 ──
header(R, 11.8, W, '프로그램 구현')
ph = picture(IMG / 'fig-deploy.png', R, 14.3, W)
caption(R, 14.3 + ph + 0.1, W, '시스템 구성 — Mac mini 1대 · Node.js · Ollama(qwen3-embedding 0.6B) · ngrok')
y = 14.3 + ph + 1.3
ph = picture(SHOT / 'w7-admin-preview.png', R, y, W)
caption(R, y + ph + 0.1, W, '졸업기준 PDF 올리기 — 바뀐 칸만 미리보고 「적용」 · 「되돌리기」')
y += ph + 1.3
text(R, y, W, 4.2, [
    '• PDF 표를 선 · 글자 좌표로 복원 → 42개 학과 523행, 검수 데이터와 차이 0',
    '• 미답변 질문 묶음 → 「사전에 추가」 → 같은 질문에 바로 답',
    '• 설치 스크립트 1개 · 자동 시험 15종으로 다음 운영자가 바로 이어받음',
], size=18)

# ── 오른쪽: 실험 ──
y += 4.6
header(R, y, W, '실험')
table(R, y + 2.4, W, [
    ['제안 목표', '기준', '결과'],
    ['동아리 정확도', '90% 이상', '50/50 (100%)'],
    ['사전 밖 표현 (임베딩)', '—', '18/28 (문자 기반 4/28)'],
    ['환각 (범위 밖 30문항)', '5% 이하', '단정 오답 1 (3.3%)'],
    ['졸업기준 정확도', '95% 이상', '7,880개 값 100%'],
    ['응답 시간 (공개 주소)', '평균 5초', '평균 0.125초 · 최대 0.23초'],
    ['관리자 수정 반영', '60초 이내', '0.3초 이내'],
    ['코드 없는 신규 도메인', '1시간', '미달성 (모듈 추가 필요)'],
], [8.6, 5.2, 11.9], size=17, row_h=1.0)
text(R, y + 11.0, W, 2.0, '• 휴대폰 카카오톡 실기기 5건 모두 정상 · 관리자 화면 사전 점검으로 막힌 곳 5개 개선', size=18)

# ── 오른쪽: 결론 ──
y += 13.4
header(R, y, W, '결론')
text(R, y + 2.3, W, 7.0, [
    '• 6개 목표 중 5개 달성. 비교한 8개 사례에 없던 「비개발자 갱신 경로」를 미리보기 · 적용 · 되돌리기 화면으로 제공했다.',
    '• 생성 없이 검색 + 템플릿으로 답해 환각을 구조적으로 막고, 작은 로컬 모델의 한계는 키워드 사전과 미답변 보완으로 메웠다.',
    '• 향후: 선언형 도메인 모듈, 「동아리」 없이 묻는 질문의 분류 개선, 학교 서버 이전, 참가자 사용성 테스트.',
], size=18)

# ── REFERENCES ──
y += 9.8
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
