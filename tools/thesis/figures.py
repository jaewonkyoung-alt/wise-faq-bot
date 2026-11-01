"""논문 그림 — 흑백회 상자 · 화살표 도식. python3 figures.py → img/fig-*.png"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent / 'img'
FONT = '/System/Library/Fonts/AppleSDGothicNeo.ttc'
INK, GRAY, LIGHT, WHITE = (38, 38, 38), (140, 140, 140), (232, 232, 232), (255, 255, 255)


def font(size, bold=False):
    return ImageFont.truetype(FONT, size, index=6 if bold else 0)


class Fig:
    def __init__(self, w, h):
        self.im = Image.new('RGB', (w, h), WHITE)
        self.d = ImageDraw.Draw(self.im)

    def box(self, x, y, w, h, title, lines=(), fill=WHITE, dash=False, size=30, bold=True):
        if dash:
            for i in range(x, x + w, 24):
                self.d.line([(i, y), (min(i + 12, x + w), y)], fill=GRAY, width=3)
                self.d.line([(i, y + h), (min(i + 12, x + w), y + h)], fill=GRAY, width=3)
            for j in range(y, y + h, 24):
                self.d.line([(x, j), (x, min(j + 12, y + h))], fill=GRAY, width=3)
                self.d.line([(x + w, j), (x + w, min(j + 12, y + h))], fill=GRAY, width=3)
        else:
            self.d.rounded_rectangle([x, y, x + w, y + h], radius=14, fill=fill, outline=INK, width=3)
        f = font(size, bold)
        total = size + 8 + len(lines) * (size - 4 + 8)
        ty = y + (h - total) / 2 if not dash else y + 14
        self.d.text((x + w / 2, ty), title, font=f, fill=INK, anchor='ma')
        for i, ln in enumerate(lines):
            self.d.text((x + w / 2, ty + size + 10 + i * (size + 4)), ln, font=font(size - 4), fill=GRAY if fill == WHITE else INK, anchor='ma')

    def label(self, x, y, text, size=24, color=GRAY, anchor='mm'):
        self.d.text((x, y), text, font=font(size), fill=color, anchor=anchor)

    def arrow(self, pts, text=None, both=False, tpos=None):
        self.d.line(pts, fill=INK, width=3, joint='curve')
        self._head(pts[-2], pts[-1])
        if both:
            self._head(pts[1], pts[0])
        if text:
            (x1, y1), (x2, y2) = pts[0], pts[1]
            tx, ty = tpos or ((x1 + x2) / 2, (y1 + y2) / 2)
            bb = self.d.textbbox((tx, ty), text, font=font(22), anchor='mm')
            self.d.rectangle([bb[0] - 6, bb[1] - 4, bb[2] + 6, bb[3] + 4], fill=WHITE)
            self.d.text((tx, ty), text, font=font(22), fill=GRAY, anchor='mm')

    def _head(self, a, b):
        import math
        ang = math.atan2(b[1] - a[1], b[0] - a[0])
        L, W = 18, 9
        p1 = (b[0] - L * math.cos(ang) + W * math.sin(ang), b[1] - L * math.sin(ang) - W * math.cos(ang))
        p2 = (b[0] - L * math.cos(ang) - W * math.sin(ang), b[1] - L * math.sin(ang) + W * math.cos(ang))
        self.d.polygon([b, p1, p2], fill=INK)

    def save(self, name):
        OUT.mkdir(exist_ok=True)
        self.im.save(OUT / name, dpi=(300, 300))


def architecture():
    f = Fig(2000, 1320)
    # 사용자
    f.box(60, 60, 360, 120, '학생', ['카카오톡 채널'])
    f.box(1580, 60, 360, 120, '관리자 (비개발자)', ['웹 브라우저'])
    f.box(60, 280, 360, 120, '카카오 i 오픈빌더', ['폴백 · 웰컴 블록 → 스킬'])
    f.box(60, 500, 360, 120, '외부 공개 터널', ['ngrok 고정 도메인'])
    f.arrow([(240, 180), (240, 280)])
    f.arrow([(240, 400), (240, 500)], 'POST /api/kakao/skill', tpos=(240, 450))
    # 서버
    f.box(520, 250, 1000, 680, '스킬 · 관리자 서버 (Node.js · Express · TypeScript)', fill=WHITE, dash=True, size=30)
    f.box(570, 330, 420, 110, '카카오 대화 처리', ['세션 · 슬롯 · 응답 형식'], fill=LIGHT, size=28)
    f.box(1050, 330, 420, 110, '관리자 API', ['토큰 인증 · localhost 전용'], fill=LIGHT, size=28)
    f.arrow([(420, 560), (520, 560), (520, 385), (570, 385)])
    f.arrow([(1760, 180), (1760, 385), (1470, 385)], '관리자 화면', tpos=(1760, 280))
    svc = [('졸업요건 조회', '학번 · 학과 · 학생구분'), ('동아리 하이브리드 검색', '임베딩 + 키워드 사전'),
           ('지도 · 호실 해석', 'S504 → 건물 · 층'), ('공지 · 알림 구독', '기간 · 휴지통')]
    for i, (t, s) in enumerate(svc):
        x = 570 + (i % 2) * 470
        y = 500 + (i // 2) * 130
        f.box(x, y, 420, 105, t, [s], size=26)
    f.box(570, 770, 900, 110, '관리 기능', ['PDF · 엑셀 미리보기 → 적용 · 되돌리기 / 키워드 사전 / 미답변 / 데이터 점검'], size=26)
    f.arrow([(780, 440), (780, 500)])
    f.arrow([(1470, 420), (1495, 420), (1495, 825), (1470, 825)])
    # 저장소
    f.box(520, 1030, 300, 140, 'SQLite', ['13개 테이블'], size=28)
    f.box(870, 1030, 300, 140, '파일 지식베이스', ['data/kb · 원문 PDF'], size=28)
    f.box(1220, 1030, 300, 140, 'Ollama', ['qwen3-embedding:0.6b'], size=28)
    f.box(1580, 1030, 360, 140, 'Python 도구', ['pdfplumber · openpyxl'], size=28)
    f.arrow([(670, 930), (670, 1030)], both=True)
    f.arrow([(1020, 930), (1020, 1030)], both=True)
    f.arrow([(1370, 930), (1370, 1030)], '임베딩', tpos=(1370, 980))
    f.arrow([(1520, 825), (1760, 825), (1760, 1030)], 'PDF · 엑셀', tpos=(1640, 825))
    f.label(1000, 1250, '모두 한 대의 Mac mini (M4 · 16GB)에서 실행 — 외부 API 호출 없음', 26)
    f.save('fig-architecture.png')


def search_pipeline():
    f = Fig(2000, 900)
    f.box(40, 360, 260, 130, '학생 질문', ['"별 보는 동아리"'])
    f.box(400, 150, 420, 150, '① 의미 검색', ['질문 → 1,024차원 벡터', '183조각과 코사인 유사도'])
    f.box(400, 560, 420, 150, '② 키워드 사전', ['학생 표현 → 동아리 분야', '"별" → 천체'])
    f.arrow([(300, 425), (350, 425), (350, 225), (400, 225)])
    f.arrow([(350, 425), (350, 635), (400, 635)])
    f.box(920, 330, 420, 190, '③ 점수 합산', ['동아리별 최고 유사도', '+ 0.4 × min(사전 일치, 2)'])
    f.arrow([(820, 225), (870, 225), (870, 400), (920, 400)])
    f.arrow([(820, 635), (870, 635), (870, 450), (920, 450)])
    f.box(1440, 90, 520, 170, '사전에 걸림', ['그 동아리만 답한다'], fill=LIGHT)
    f.box(1440, 340, 520, 170, '사전에 안 걸림 · 0.5 이상', ['1등과 0.04 이내만', '"딱 맞는 동아리는 확인되지 않았어요"'], fill=LIGHT)
    f.box(1440, 590, 520, 170, '둘 다 아님', ['"찾지 못했어요" + 미답변 기록'], fill=LIGHT)
    f.arrow([(1340, 400), (1390, 400), (1390, 175), (1440, 175)])
    f.arrow([(1340, 425), (1440, 425)])
    f.arrow([(1340, 450), (1390, 450), (1390, 675), (1440, 675)])
    f.label(1000, 840, '답변 문장은 DB에 저장된 값으로 틀(템플릿)에 맞춰 만든다 — 생성형 모델이 문장을 쓰지 않는다', 26)
    f.save('fig-search.png')


def admin_loops():
    f = Fig(2000, 860)
    f.label(40, 60, '(가) 졸업기준 PDF 반영', 30, INK, 'lm')
    steps = [('PDF 올리기', '여러 학과 한 번에'), ('표 복원', '선 · 글자 좌표'), ('학과 판별', '가장 긴 이름 일치'),
             ('바뀐 칸 미리보기', '지금 값 → PDF 값'), ('적용 · 되돌리기', '올리기 기록 보관')]
    for i, (t, s) in enumerate(steps):
        x = 40 + i * 390
        f.box(x, 110, 330, 140, t, [s], fill=LIGHT if i == 3 else WHITE)
        if i:
            f.arrow([(x - 60, 180), (x, 180)])
    f.label(40, 360, '(나) 미답변에서 사전 보완까지', 30, INK, 'lm')
    loop = [('학생 질문', '"칼싸움 동아리"'), ('답 못 함', '미답변 기록 · 이유'), ('미답변 화면', '같은 질문 묶음'),
            ('사전에 추가', '칼싸움 → 검도'), ('즉시 반영', '재배포 없음')]
    for i, (t, s) in enumerate(loop):
        x = 40 + i * 390
        f.box(x, 410, 330, 140, t, [s], fill=LIGHT if i == 3 else WHITE)
        if i:
            f.arrow([(x - 60, 480), (x, 480)])
    f.arrow([(1765, 550), (1765, 640), (205, 640), (205, 550)], '같은 질문이 오면 바로 답한다', tpos=(985, 640))
    f.label(1000, 780, '두 흐름 모두 관리자가 화면에서 결과를 확인한 뒤에만 학생 답변이 바뀐다', 26)
    f.save('fig-admin.png')


def sequence():
    """카카오톡 질문 한 건의 흐름 (동아리 자유 질문 기준) + 실측 시간"""
    f = Fig(2000, 1180)
    cols = [('학생', '카카오톡'), ('카카오 플랫폼', '오픈빌더 · 폴백 블록'), ('공개 터널', 'ngrok 고정 도메인'),
            ('스킬 서버', 'Express'), ('SQLite', '세션 · 동아리 · 사전'), ('Ollama', 'qwen3-embedding')]
    xs = [150 + i * 340 for i in range(6)]
    for x, (t, sub) in zip(xs, cols):
        f.box(x - 150, 40, 300, 110, t, [sub], fill=LIGHT if t == '스킬 서버' else WHITE, size=28)
        for y in range(150, 1020, 22):
            f.d.line([(x, y), (x, y + 11)], fill=GRAY, width=2)
    msgs = [
        (0, 1, 210, '① "별 보는 동아리 있어?"'),
        (1, 2, 280, '② 스킬 요청 JSON (5초 안에 응답해야 함)'),
        (2, 3, 350, '③ POST /api/kakao/skill'),
        (3, 4, 430, '④ 사용자 세션 조회 → 동아리 질문으로 분류'),
        (3, 5, 510, '⑤ 질문 임베딩 (약 40ms)'),
        (5, 3, 590, '⑥ 1,024차원 벡터'),
        (3, 4, 670, '⑦ 183조각 코사인 유사도 + 키워드 사전 점수'),
        (4, 3, 750, '⑧ 동아리 값 (이름 · 소개 · 모임 · 출처)'),
        (3, 2, 840, '⑨ 템플릿 답변 JSON (말풍선 ≤ 3개 · 1,000자)'),
        (2, 1, 910, '⑩ 응답 전달'),
        (1, 0, 980, '⑪ 카카오톡 말풍선 + 바로가기 버튼'),
    ]
    for a, b, y, text in msgs:
        x1, x2 = xs[a], xs[b]
        f.arrow([(x1, y), (x2, y)])
        mid = (x1 + x2) / 2
        bb = f.d.textbbox((mid, y - 24), text, font=font(22), anchor='mm')
        f.d.rectangle([bb[0] - 6, bb[1] - 3, bb[2] + 6, bb[3] + 3], fill=WHITE)
        f.d.text((mid, y - 24), text, font=font(22), fill=INK, anchor='mm')
    f.label(1000, 1070, '실측: 서버 처리 중앙값 7ms · 최대 0.1초 / 공개 주소를 거친 왕복 평균 125ms · 최대 0.23초 (10/25, 질문 50개)', 24)
    f.label(1000, 1120, '졸업요건 · 지도 · 공지는 ⑤ ⑥ 없이 SQLite · 파일 조회만으로 답한다', 24)
    f.save('fig-sequence.png')


def actor(f, x, y, name):
    d = f.d
    d.ellipse([x - 22, y, x + 22, y + 44], outline=INK, width=3)
    d.line([(x, y + 44), (x, y + 120)], fill=INK, width=3)
    d.line([(x - 45, y + 70), (x + 45, y + 70)], fill=INK, width=3)
    d.line([(x, y + 120), (x - 35, y + 180)], fill=INK, width=3)
    d.line([(x, y + 120), (x + 35, y + 180)], fill=INK, width=3)
    d.text((x, y + 205), name, font=font(28, True), fill=INK, anchor='ma')


def usecase():
    f = Fig(2000, 1260)
    f.d.rectangle([330, 40, 1670, 1220], outline=INK, width=3)
    f.d.text((1000, 60), 'WISE FAQ 챗봇', font=font(30, True), fill=INK, anchor='ma')
    left = ['UC-01 졸업요건 조회', 'UC-02 동아리 질문', 'UC-03 호실 · 건물 위치', 'UC-04 공지 조회 · 구독']
    right = ['UC-05 졸업기준 PDF 반영', 'UC-06 동아리 수정 (입력 칸 · 엑셀)', 'UC-07 키워드 사전 보완',
             'UC-08 공지 관리 · 휴지통', 'UC-09 미답변 정리', 'UC-10 데이터 점검']
    actor(f, 150, 380, '학생')
    actor(f, 1850, 380, '관리자')
    f.d.text((150, 620), '(카카오톡)', font=font(22), fill=GRAY, anchor='ma')
    f.d.text((1850, 620), '(관리자 웹 · 비개발자)', font=font(22), fill=GRAY, anchor='ma')
    for i, t in enumerate(left):
        y = 200 + i * 230
        f.d.ellipse([400, y, 920, y + 120], outline=INK, width=3, fill=WHITE)
        f.d.text((660, y + 60), t, font=font(26), fill=INK, anchor='mm')
        f.d.line([(195, 450), (400, y + 60)], fill=INK, width=2)
    for i, t in enumerate(right):
        y = 130 + i * 175
        f.d.ellipse([1080, y, 1640, y + 115], outline=INK, width=3, fill=LIGHT if i in (0, 2) else WHITE)
        f.d.text((1360, y + 57), t, font=font(25), fill=INK, anchor='mm')
        f.d.line([(1805, 450), (1640, y + 57)], fill=INK, width=2)
    # UC-07 은 UC-09 에서 이어진다 (미답변 → 사전에 추가)
    y7, y9 = 130 + 2 * 175 + 57, 130 + 4 * 175 + 57
    f.d.line([(1080, y9), (1040, y9), (1040, y7), (1080, y7)], fill=GRAY, width=2)
    f._head((1040, y7), (1080, y7))
    f.d.text((1028, (y7 + y9) / 2), '«extend»', font=font(20), fill=GRAY, anchor='rm')
    f.d.text((1028, (y7 + y9) / 2 + 28), '사전에 추가', font=font(20), fill=GRAY, anchor='rm')
    f.save('fig-usecase.png')


def deploy():
    f = Fig(2000, 1150)
    f.box(40, 60, 330, 150, '학생 휴대폰', ['카카오톡 앱'])
    f.box(470, 60, 380, 150, '카카오 서버', ['카카오 i 오픈빌더', '폴백 · 웰컴 블록 → 스킬'], size=28)
    f.box(950, 60, 330, 150, 'ngrok 서버', ['고정 도메인 · 경로 제한'], size=28)
    f.arrow([(370, 135), (470, 135)], both=True)
    f.arrow([(850, 135), (950, 135)], both=True)
    f.label(910, 30, 'HTTPS (인터넷)', 22)
    # Mac mini
    f.box(40, 330, 1920, 640, 'Mac mini (Apple M4 · 16GB · macOS) — 운영 서버 1대', fill=WHITE, dash=True, size=30)
    f.box(100, 420, 420, 200, 'ngrok 에이전트', ['launchd 상시 실행', '/api/kakao/skill · /health만'], size=26)
    f.box(640, 420, 480, 200, 'Node.js 서버 :3000', ['Express · TypeScript', 'launchd 상시 실행 · 자동 재시작'], fill=LIGHT, size=26)
    f.box(1240, 420, 300, 200, 'Ollama :11434', ['qwen3-embedding', '0.6B (639MB)'], size=26)
    f.box(1620, 420, 300, 200, '관리자 브라우저', ['localhost:3000/admin'], size=26)
    f.box(640, 720, 300, 180, 'SQLite 파일', ['data/wise.db'], size=26)
    f.box(980, 720, 300, 180, '파일 지식베이스', ['data/kb · 원문 PDF'], size=26)
    f.box(1320, 720, 300, 180, 'Python 도구', ['pdfplumber · openpyxl', '(venv)'], size=26)
    f.arrow([(1115, 210), (1115, 280), (310, 280), (310, 420)])
    f.arrow([(520, 520), (640, 520)])
    f.arrow([(1120, 520), (1240, 520)], both=True)
    f.arrow([(1770, 420), (1770, 385), (880, 385), (880, 420)])
    f.arrow([(790, 620), (790, 720)], both=True)
    f.arrow([(1000, 620), (1130, 720)], both=True)
    f.arrow([(1080, 620), (1470, 720)])
    f.label(1000, 1010, '개발 · 배포: GitHub 비공개 저장소 → ./scripts/setup.sh (Node 패키지 · Python 도구 · 토큰 · 임베딩 모델 · 빌드 · DB 초기화 · 동작 점검)', 24)
    f.label(1000, 1060, '외부 유료 API 없음 · 관리자 화면은 같은 컴퓨터에서만 열림', 24)
    f.save('fig-deploy.png')


if __name__ == '__main__':
    architecture()
    search_pipeline()
    admin_loops()
    sequence()
    usecase()
    deploy()
    print('ok', sorted(p.name for p in OUT.glob('fig-*.png')))
