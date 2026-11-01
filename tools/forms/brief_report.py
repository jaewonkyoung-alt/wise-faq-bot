"""약식 결과보고서 (논문 초안과 별개, 2쪽) — HTML 을 Chrome 으로 인쇄.  python3 brief_report.py <out.pdf>"""
import subprocess
import sys
from pathlib import Path

CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
ROOT = Path(__file__).resolve().parents[2]
REPO = 'https://github.com/jaewonkyoung-alt/wise-faq-bot'
ARCH = (ROOT / 'tools/thesis/img/fig-architecture.png').as_uri()
PHONE1 = (ROOT / 'tools/thesis/img/phone-grad.jpg').as_uri()
PHONE2 = (ROOT / 'tools/thesis/img/phone-club-map-notice.jpg').as_uri()

HTML = f'''<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><style>
@page {{ size: A4; margin: 18mm 18mm 16mm 18mm; }}
body {{ font-family: "Apple SD Gothic Neo", sans-serif; font-size: 10pt; color: #111; line-height: 1.55; }}
h1 {{ font-size: 17pt; margin: 0 0 2mm; text-align: center; }}
.sub {{ text-align: center; color: #444; margin-bottom: 5mm; }}
h2 {{ font-size: 12pt; margin: 5mm 0 2mm; padding-bottom: 1mm; border-bottom: 1.2px solid #222; }}
table {{ border-collapse: collapse; width: 100%; font-size: 9.2pt; }}
th, td {{ border: 1px solid #999; padding: 1.4mm 2mm; vertical-align: top; text-align: left; }}
th {{ background: #262626; color: #fff; font-weight: 600; }}
td.c, th.c {{ text-align: center; }}
.meta td {{ border: none; padding: 0.6mm 2mm; }}
.meta td:first-child {{ width: 22mm; color: #555; }}
ol, ul {{ margin: 1mm 0; padding-left: 5mm; }}
li {{ margin: 0.5mm 0; }}
.fig {{ text-align: center; margin: 2mm 0; }}
.fig img {{ border: 1px solid #ccc; }}
.cap {{ font-size: 8.5pt; color: #555; text-align: center; }}
.row {{ display: flex; gap: 5mm; align-items: flex-start; }}
code {{ font-family: Menlo, monospace; font-size: 8.8pt; background: #f2f2f2; padding: 0 1mm; }}
.brk {{ page-break-before: always; }}
</style></head><body>
<h1>점진적 확장이 가능한 캠퍼스 정보 질의응답 챗봇</h1>
<div class="sub">약식 결과보고서 · 컴퓨터공학종합설계 · 2026. 11. 2</div>
<table class="meta">
<tr><td>학번 · 이름</td><td>2021212843 경재원 (1인 개발)</td></tr>
<tr><td>지도교수</td><td>오승현 교수님</td></tr>
<tr><td>저장소</td><td><b>{REPO}</b> (비공개 · 초대받은 계정으로 접근)</td></tr>
<tr><td>운영</td><td>카카오톡 채널 「WISE FAQ」 — 맥 미니 1대 + ngrok 고정 주소, 2026-10-10부터 상시 운영</td></tr>
</table>

<h2>1. 개요</h2>
<ul>
<li><b>문제</b> — 졸업요건(학과별 PDF 51개) · 동아리(SNS · 게시판) · 강의실(호실 코드) 정보가 흩어져 있고, 기존 대학 챗봇은 데이터를 개발자만 고칠 수 있어 만든 학생이 졸업하면 갱신이 멈춘다.</li>
<li><b>해결</b> — 학생은 카카오톡 하나로 묻고, 비개발자 관리자는 웹 화면에서 학교 PDF · 엑셀을 올려 데이터를 고친다. 저장 즉시 반영되며 재배포가 필요 없다.</li>
<li><b>원칙</b> — 생성형 모델로 문장을 만들지 않고 데이터 그대로 답한다(출처 표시). 사전 밖 표현은 로컬 임베딩이 보완한다.</li>
</ul>

<h2>2. 완성된 결과물</h2>
<table>
<tr><th style="width:15%">메뉴</th><th style="width:40%">학생이 받는 답</th><th>관리자가 고치는 방법</th></tr>
<tr><td>졸업요건</td><td>학번 · 학과 · 학생구분별 공식 기준 (42개 학과)</td><td>학과별 PDF 올리기 → 바뀐 칸만 미리보기 → 적용 · 되돌리기</td></tr>
<tr><td>동아리</td><td>자유 질문 → 소개 · 정기 활동 · 출처 (61곳)</td><td>입력 칸 · 엑셀 일괄 수정 · 키워드 사전 · 미답변 보완</td></tr>
<tr><td>지도</td><td>호실 코드 · 건물 이름 → 위치 + 카카오맵 (287호실)</td><td>학교 홈페이지 수집 데이터</td></tr>
<tr><td>공지</td><td>전교생 공통 공지 · 새 공지 알림</td><td>등록 즉시 반영, 기간 종료 시 자동 휴지통 · 30일 뒤 삭제</td></tr>
</table>
<p>기능 요구사항 13개 모두 완료. 관리자 화면에는 미답변 질문 묶음, 데이터 점검(빠진 데이터와 고칠 곳 안내)이 함께 있다.</p>

<h2>3. 시스템 구성</h2>
<div class="fig"><img src="{ARCH}" style="width:100mm"></div>
<div class="cap">카카오톡 → 오픈빌더 → ngrok → 스킬 서버(Node.js · TypeScript · SQLite) · 동아리 검색은 키워드 사전 + Ollama 로컬 임베딩(qwen3-embedding 0.6B)</div>

<div class="brk"></div>
<h2>4. 결과 — 제안서 목표 6개 중 5개 달성</h2>
<table>
<tr><th>목표</th><th class="c" style="width:16%">기준</th><th style="width:44%">결과</th><th class="c" style="width:11%">판정</th></tr>
<tr><td>동아리 질문 정답률</td><td class="c">90% 이상</td><td>50문항 중 50 (100%), 사전 밖 표현 28문항 64%</td><td class="c">달성</td></tr>
<tr><td>데이터에 없는 질문 오답률</td><td class="c">5% 이하</td><td>30문항 중 단정 오답 1 (3.3%)</td><td class="c">달성</td></tr>
<tr><td>졸업요건 정확도</td><td class="c">95% 이상</td><td>정답표 7,880개 값 100% 일치</td><td class="c">달성</td></tr>
<tr><td>평균 응답 시간</td><td class="c">5초 이내</td><td>서버 27ms · 공개 주소 평균 125ms (최대 0.23초)</td><td class="c">달성</td></tr>
<tr><td>관리자 수정 반영</td><td class="c">60초 이내</td><td>0.3초 이내 (재배포 · 재시작 없음)</td><td class="c">달성</td></tr>
<tr><td>코드 없이 신규 도메인 추가</td><td class="c">1시간</td><td>도메인 안 데이터는 화면에서, 새 도메인 종류는 코드 필요</td><td class="c">미달성</td></tr>
</table>
<div class="row" style="margin-top:3mm">
<div style="flex:1">
<ul>
<li><b>실기기</b> — 휴대폰(iPhone 16 Pro) 카카오톡에서 질문 5개 모두 정상, 서버 처리 최대 0.27초 (10/26).</li>
<li><b>자동 시험</b> — <code>npm test</code> 15종 통과(임시 DB 사용). 빈 환경(Node 22 · Python 3.9 · Ollama 없음)에서 클론부터 설치까지 통과.</li>
<li><b>관리자 화면 사전 점검</b> — 사용성 테스트 과제 8개를 직접 수행해 막힌 곳 5개를 고쳐 운영 서버에 반영.</li>
<li><b>한계</b> — '동아리' 없이 '~모임'으로 물으면 분류에서 빠짐(28문항 중 26). 고지 후 추천의 관련성이 낮은 경우가 있음.</li>
</ul>
</div>
<div style="width:62mm; text-align:center"><img src="{PHONE1}" style="width:29mm; border:1px solid #ccc"> <img src="{PHONE2}" style="width:29mm; border:1px solid #ccc">
<div class="cap">실제 휴대폰 카카오톡 화면</div></div>
</div>

<h2>5. 저장소 받기 · 실행</h2>
<ol>
<li><code>git clone {REPO}.git</code> (초대 수락 후, 또는 <code>gh repo clone jaewonkyoung-alt/wise-faq-bot</code>)</li>
<li><code>cd wise-faq-bot && ./scripts/setup.sh --start</code> — 패키지 · Python 도구 · 관리자 토큰 · 임베딩 모델 · DB 초기화 · 동작 점검까지 한 번에</li>
<li>관리자 화면 <code>http://localhost:3000/admin</code>, 전체 시험 <code>npm test</code>, 카카오 연결은 <code>docs/kakao-setup.md</code></li>
</ol>

<h2>6. 남은 일</h2>
<ul>
<li>심사신청서 · 지도교수 허가원 · 요약문 제출 (11/2 ~ 11/6 15시), 최종 발표 (11/9), 심사 · 날인 (~11/13)</li>
<li>졸업자격실험보고서를 학과 한글 양식으로 옮기기, 날인본 PDF와 A1 포스터 이메일 제출</li>
<li>비개발자 참가자 사용성 테스트</li>
</ul>
</body></html>'''

out = Path(sys.argv[1])
tmp = out.with_suffix('.html')
tmp.write_text(HTML, encoding='utf-8')
subprocess.run([CHROME, '--headless=new', '--disable-gpu', '--no-pdf-header-footer', '--allow-file-access-from-files',
                f'--print-to-pdf={out}', tmp.as_uri()], check=True, capture_output=True)
tmp.unlink()
print('saved', out)
