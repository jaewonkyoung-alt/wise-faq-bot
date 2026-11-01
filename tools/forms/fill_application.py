"""학과 붙임1 「2026 졸업자격 실험보고 심사 신청서」(hwp)를 채워 PDF로 — 한컴 없이 인쇄용.
hwp5html 로 뽑은 양식 HTML의 문단 · 글자 모양을 그대로 쓰고, 빈칸만 채운 뒤 쪽마다 나눠 Chrome으로 인쇄한다.

  python3 fill_application.py <hwp5html 출력 폴더> <out.pdf>
"""
import html
import subprocess
import sys
from pathlib import Path

CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
SID, NAME, ADVISOR = '2021212843', '경재원', '오승현'
TITLE = '점진적 확장이 가능한 캠퍼스 정보 질의응답 챗봇'
DATE = '2026.  11.  2.'

SUMMARY = [
    ('1. 목표 및 필요성', [
        '졸업요건(학과별 PDF 51개) · 동아리(SNS · 게시판) · 강의실(호실 코드) 정보가 흩어져 있고, 기존 대학 챗봇은 데이터를 개발자만 고칠 수 있어 만든 학생이 졸업하면 갱신이 멈춘다.',
        '카카오톡으로 답하고, 비개발자 관리자가 웹 화면에서 학교 PDF · 엑셀로 데이터를 고치면 재배포 없이 바로 반영되는 챗봇을 목표로 했다. 정량 목표 6개(동아리 정답률 90% 이상, 환각 5% 이하, 수정 반영 60초 이내, 응답 5초 이내 등).',
    ]),
    ('2. 기존 연구결과', [
        '시나리오 기반 카카오톡 대학 챗봇(성균관대 · 한경대 · 동덕여대)은 출처가 분명하지만 사전 밖 표현에 약하고, 데이터 갱신은 개발 도구에서만 가능하다.',
        '생성형 모델 기반 학사 챗봇(홍익대 · 성균관대 · 목포해양대 · 충남대)은 표현에 강하지만 환각 위험이 있다. 비교한 8개 사례 중 비개발자 갱신 경로나 범위 밖 질문 평가를 갖춘 것은 없었다.',
    ]),
    ('3. 자신이 한 기여도 (1인 개발)', [
        '카카오 스킬 서버(Node.js · TypeScript · SQLite)와 4개 도메인(졸업요건 42개 학과 · 동아리 61곳 · 호실 287개 · 공지) 구현 및 데이터 수집.',
        '학교 PDF 표를 선 · 글자 좌표로 복원하는 추출 규칙, 「미리보기 → 적용 → 되돌리기」 관리자 도구(PDF · 엑셀 · 키워드 사전 · 미답변 · 데이터 점검).',
        '로컬 임베딩(qwen3-embedding 0.6B)과 키워드 사전의 하이브리드 검색, 생성형 모델 없는 템플릿 답변, 설치 스크립트 1개와 자동 시험 15종.',
    ]),
    ('4. 실험결과', [
        '동아리 50문항 정답 100%, 사전 밖 표현 28문항 64%(문자 기반 14%), 졸업기준 7,880개 값 100% 일치.',
        '데이터에 없는 질문 30개 중 단정 오답 1건(3.3%), 공개 주소를 거친 응답 평균 125ms(최대 0.23초), 관리자 수정 반영 0.3초 이내, 휴대폰 카카오톡 실기기 5건 모두 정상.',
        '6개 목표 중 5개 달성, 「코드 수정 없는 신규 도메인 추가」는 미달성.',
    ]),
]

EXTRA_CSS = '''
body { background: #fff; padding: 0; }
.Paper { border: none; margin: 0; }
.Section-0 { width: auto !important; }
.Section-0 .Page { padding-top: 0; padding-bottom: 0; }
.sheet { page-break-after: always; }
.sheet:last-child { page-break-after: auto; }
span.lang-ko, span.lang-en, span.lang-other { font-family: "Nanum Myeongjo", "AppleMyungjo", serif !important; }
span.charshape-8.lang-ko, span.charshape-9.lang-ko, span.charshape-10.lang-ko, span.charshape-11.lang-ko, span.charshape-14.lang-ko
  { font-family: "Apple SD Gothic Neo", "AppleGothic", sans-serif !important; }
.fill { font-family: "Nanum Myeongjo", serif; }
.sum p.item { margin: 0 0 2pt 10pt; padding-left: 1em; text-indent: -1em; text-align: justify; line-height: 1.6; }
.sum p.item span { font-family: "Nanum Myeongjo", serif; font-size: 10pt; }
.sum p.parashape-27 { min-height: 1.6em; }
@page { size: A4; margin: 35mm 24.79mm 30mm 19.4mm; }
'''


def field(label, value, cs=13):
    v = html.escape(value)
    return (f'<p class="Normal parashape-30"><span class="lang-other charshape-13">• </span>'
            f'<span class="lang-ko charshape-{cs}">{label} : {v}</span></p>')


def fields(cs=13):
    return field('학번', SID, cs) + field('이름', NAME, cs) + field('제목', TITLE, cs)


def page_application():
    return f'''<div class="sheet">
<p class="Normal parashape-19"><span class="lang-ko charshape-15">2026 졸업자격 실험보고 심사 신청서</span></p>
<p class="Normal parashape-19"></p>{fields()}
<p class="Normal parashape-20"></p><p class="Normal parashape-20"></p>
<p class="Normal parashape-26"><span class="lang-ko charshape-13">위 본인은 상기의 주제에 대한 실험을 완료하였으므로 이에 2026학년도 졸업자격 실험보고에 대한 첨부 서류를 완비하여 심사를 신청합니다.</span></p>
<p class="Normal parashape-26"></p><p class="Normal parashape-26"></p>
<p class="Normal parashape-29"><span class="lang-ko charshape-8">{DATE}</span></p>
<p class="Normal parashape-28"></p>
<p class="Normal parashape-28"><span class="lang-ko charshape-8">신 청 인 </span><span class="lang-ko charshape-14">&#160;&#160;{NAME}&#160;&#160;</span><span class="lang-ko charshape-8"> (인)</span></p>
<p class="Normal parashape-28"></p><p class="Normal parashape-28"></p><p class="Normal parashape-28"></p>
<p class="Normal parashape-29"><span class="lang-ko charshape-10">컴퓨터공학과 학과장 귀하</span></p>
</div>'''


def page_permission():
    return f'''<div class="sheet">
<p class="Normal parashape-25"><span class="lang-ko charshape-15">2026 졸업자격 실험보고 심사 허가원</span></p>
<p class="Normal parashape-22"></p>{fields()}
<p class="Normal parashape-20"></p><p class="Normal parashape-20"></p>
<p class="Normal parashape-26"><span class="lang-ko charshape-13">상기 학생은 졸업자격 실험보고 일정에 따라서 상기의 제목에 포함된 내용을 성실하게 실험 및 보고를 완료하였고 또한 실험보고서와 결과에 대하여 심사받을 자격을 충분히 갖추었다고 인증되기에 이에 심사신청을 허가합니다.</span></p>
<p class="Normal parashape-21"></p><p class="Normal parashape-21"></p>
<p class="Normal parashape-23"><span class="lang-ko charshape-8">2026.&#160;&#160;&#160;&#160;.&#160;&#160;&#160;&#160;&#160;.</span></p>
<p class="Normal parashape-21"></p><p class="Normal parashape-21"></p>
<p class="Normal parashape-23"><span class="lang-ko charshape-9">지도교수</span><span class="lang-ko charshape-10"> </span><span class="lang-ko charshape-11">&#160;&#160;{ADVISOR}&#160;&#160;</span><span class="lang-ko charshape-10"> (인)</span></p>
</div>'''


def page_summary():
    body = ''
    for head, items in SUMMARY:
        body += f'<p class="Normal parashape-27" style="margin-top:4pt"><span class="lang-ko charshape-17">{html.escape(head)}</span></p>'
        body += ''.join(f'<p class="item"><span>- {html.escape(s)}</span></p>' for s in items)
    return f'''<div class="sheet sum">
<p class="Normal parashape-23"><span class="lang-ko charshape-15">2026 졸업자격 실험보고 요약문</span></p>
{fields(12)}<p class="Normal parashape-24" style="min-height:0.8em"></p>{body}
</div>'''


def main():
    src, out = Path(sys.argv[1]), Path(sys.argv[2])
    head = (src / 'index.xhtml').read_text(encoding='utf-8')
    style = head[head.index('<style'):head.index('</style>') + 8]
    css = (src / 'styles.css').read_text(encoding='utf-8')
    doc = f'''<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><style>{css}</style>{style}<style>{EXTRA_CSS}</style></head>
<body><div class="Section Section-0 Paper"><div class="Page">{page_application()}{page_permission()}{page_summary()}</div></div></body></html>'''
    tmp = out.with_suffix('.html')
    tmp.write_text(doc, encoding='utf-8')
    subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer',
                    f'--print-to-pdf={out}', tmp.as_uri()], check=True, capture_output=True)
    tmp.unlink()
    print('saved', out)


if __name__ == '__main__':
    main()
