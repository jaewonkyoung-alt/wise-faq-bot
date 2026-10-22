# 인수인계 문서 (이 프로젝트를 처음 보는 AI/사람용)

마지막 갱신: 2026-10-03 · 기준 커밋: `main`

이 문서만 읽으면 이어서 작업할 수 있도록 정리했다. 과거 대화는 없다고 가정한다.

---

## 1. 프로젝트

- **이름**: wise-faq-bot — 점진적 확장이 가능한 캠퍼스 정보 질의응답 챗봇
- **과목**: 동국대 WISE 컴퓨터공학종합설계2 졸업작품
- **작성자**: 경재원 (학번 2021212843, GitHub `jaewonkyoung-alt`)
- **최종 마감**: 2026-11-15 · **최종 발표**: 2026-11-09
- **발표**: 매주 월요일. 1주 9/7 … 4주 9/28 … 10주 11/9
- **한 줄 설명**: 카카오톡을 1순위 채널로 하는 캠퍼스 FAQ 챗봇. 졸업요건·지도는 정형 조회, 동아리는 검색(RAG), 공지는 관리자 등록. 관리자 웹에서 비개발자가 데이터를 갱신한다.

### 일정 기준

- 기능 완성(freeze): **10/25**
- 10/26 ~ 11/1: 버그픽스 + 졸업논문·포스터 초안
- **11/2(월) ~ 11/6(금) 15시: 졸업논문 심사신청서 접수 (지도교수 날인 필수)** — 날인은 11/2~11/4 목표
- 11/5 ~ 11/8: 통합 시험 · 데모 리허설 (데모 준비 완료 11/8)
- **11/9(월) ~ 11/13(금) 17시: 졸업논문 심사** — 최종 발표 11/9, 실질 마감 11/13 (원래 제출일 11/15는 일요일)
- 간트차트 데이터는 `tools/slides/gantt.py` 한 곳에서 관리

---

## 2. 저장소 구조

```
wise-faq-bot/
├─ src/
│  ├─ app.ts, index.ts          진입점 · 라우트 등록
│  ├─ routes/                   표현 계층 (kakao, ask, graduation, admin, notices, unanswered, health)
│  ├─ services/                 업무 로직 (kakaoDialog, askService, graduationService,
│  │                            kbGraduation, roomCode, clubStore, reindex, noticeService,
│  │                            unanswered, kakaoSession, collegeTaxonomy)
│  ├─ middleware/adminAuth.ts   관리자 토큰 검사 (checkAdmin)
│  ├─ db/database.ts            SQLite 연결 + 마이그레이션
│  ├─ embeddings/, llm/         임베딩 · LLM provider
│  ├─ kakao/responseBuilder.ts  카카오 Skill JSON 생성 (여기서만 생성)
│  └─ types/
├─ public/admin/                관리자 웹 (HTML · CSS · Vanilla JS, 빌드 없음)
├─ data/
│  ├─ kb/                       폴더 지식베이스 (졸업요건 PDF·info.md, 지도 JSON, 동아리)
│  └─ seed/                     초기 데이터 · 평가 케이스
├─ scripts/                     시드 · 테스트 · 평가 스크립트
├─ docs/
│  ├─ design/                   3주차 설계 산출물 13종 (최종 보고서용)
│  └─ progress/                 주차별 진행 보고
├─ slides/                      주차별 발표 PPT (완성본)
└─ tools/slides/                PPT 생성 스크립트 (아래 5장 참조)
```

---

## 3. 실행 방법

```bash
./scripts/setup.sh --start    # 처음 한 번: 설치 · .env(무작위 관리자 토큰) · 임베딩 모델 · 빌드 · DB 초기화 · 동작 점검 → 서버 실행
npm start                     # 이후 서버 켜기
npm run dev                   # 개발 (tsx watch)
npm test                      # 전체 테스트 15종 + 동아리 평가 50문항
```

- 기본 포트 3000. 관리자 웹은 `http://localhost:3000/admin` (외부 공개 주소로는 열리지 않음)
- 주요 환경변수: `ADMIN_TOKEN`, `EMBED_PROVIDER`(ollama/mock), `PUBLIC_BASE_URL`, `KAKAO_SKILL_SECRET` — README 「설정」 표
- `SEMANTIC_MIN_SCORE` 는 비워 둔다 (임베딩 모델별 기본값: mock 0.35 · qwen3 0.5). 10/22 까지 운영 .env 에 0.35 가 남아 qwen3 기준을 덮고 있었음
- 카카오톡 연결(사람이 한 번): `docs/kakao-setup.md`
- 테스트는 **항상** 임시 DB · 임시 키워드 사전을 쓴다 (10/10 운영 DB 사고 후 고정). 실행 전후 운영 DB 해시가 같은지 확인해 왔음

---

## 4. 현재 구현 상태 (2026-10-22 · 기능 완성)

기능 요구사항 13개: **완료 13**

| ID | 요구사항 | 상태 |
|----|----------|------|
| FR-01 | 메뉴 제공 (카톡 버튼 4개) | 완료 |
| FR-02 | 졸업요건 단계 조회 (연도→단과대→학과) | 완료 |
| FR-03 | 졸업요건 원문 PDF 링크 | 완료 (PUBLIC_BASE_URL 필요) |
| FR-04 | 호실 위치 안내 (S504 → 건물·층) | 완료 |
| FR-05 | 동아리 질의응답 (정형 + 의미 검색) | 완료 — 로컬 임베딩 qwen3-embedding:0.6b + 키워드 사전 |
| FR-06 | 공지 조회 + 알림 구독 (카톡) | 완료 |
| FR-07 | 관리자 인증 (토큰, fail-closed) | 완료 |
| FR-08 | 졸업요건 관리 | 완료 — 학과 PDF 올리기 → 미리보기 → 적용 · 되돌리기 |
| FR-09 | 동아리 관리 (+자동 재색인) | 완료 — 엑셀 내려받기 · 올리기, 키워드 사전 편집 |
| FR-10 | 공지 관리 (게시·고정·기간·전달 현황) | 완료 — 기간 끝나면 자동 휴지통 · 30일 뒤 삭제 |
| FR-11 | 데이터 점검 (구 폴더 KB 재스캔) | 완료 — 실데이터 기준 빠진 데이터를 한국어로 안내 |
| FR-12 | 미답변 관리 | 완료 — 같은 질문 묶음 · 해결/무시 · 사전에 추가 |
| FR-13 | 전체 재색인 | 완료 — 모델이 바뀌면 시작 때 자동 재임베딩, 5분마다 모델 유지 |

### 최근 작업 (4주차)

- 공지 도메인 전 구간 구현: `notices` 테이블, `noticeService`, `routes/notices.ts`, 관리자 웹 공지 탭, 카톡 '공지' 응답
- 카톡 출력 클램프: 상위 5건 · 총 900자 · 초과분 건수 안내
- 버그 수정 2건
  1. 졸업요건 답변이 basicCard + simpleText 로 두 번 나가던 문제 → 본문 1회 + PDF 버튼 카드로 분리
  2. `test:kakao-grad` 가 단과대 단계 추가 후 실패하던 문제 → 시나리오 갱신

### 공지 방식 변경 — 조회에서 알림 구독으로 (9/28)

- 이유: 학생은 공지를 직접 찾아보지 않는다. 사용자 결정으로 "찾아보는 공지 → 알려 주는 공지"로 변경.
- 카카오 Event API(챗봇이 먼저 발송)는 **비즈니스 인증 채널 + 건당 15원**이 필요하고, 개인 졸업작품 채널은 인증이 어렵다(사용자 확인).
  그래서 **1단계만 구현**: 구독한 학생이 다음에 아무 메시지나 보내면 답변 맨 앞에 새 공지를 붙인다.
  2단계(Event API 즉시 발송)는 인증 채널을 확보할 때만 — 지금은 만들지 않았다.
- 공지는 **전교생 공통 공지만** 등록한다(사용자 결정). 학과·동아리별 공지는 스팸이 되므로 받지 않는다. 학과 지정 칸은 없고, 관리자 화면에 원칙을 명시했다.
- 전달 규칙: 한 번에 최대 3건(나머지는 건수만) · 게시 후 14일 지난 공지 제외 · 같은 공지는 학생마다 한 번만 · 초안/기간 밖 제외
- 코드: `src/services/noticeSubscription.ts`(구독·전달 기록·배너), `kakaoDialog.ts` 의 `handleKakaoDialog` 가 응답 뒤에 배너를 붙임,
  `responseBuilder.prependText`(outputs 3개 제한 처리), 테이블 `notice_subscribers` · `notice_deliveries`
- 카톡 발화: `공지 알림 받기` / `공지 알림 끄기` (공지 메뉴 버튼으로도 제공)
- 관리자: 공지 목록에 공지별 전달 인원, 대시보드에 구독자 수

### 졸업요건 실데이터 (9/27~28 수집 · 5주차에 챗봇 연결 완료)

- 학교 「학사제도 및 졸업이수가이드」 PDF 51개 수집 → 표를 좌표로 복원해 엑셀로 구조화
- 엑셀: `data/graduation-source/2021212843_경재원_졸업요건_학과별_정리.xlsx` (9개 시트, 특이사항 28건). 원본 PDF는 SSD `졸업요건_원본PDF/`
- 추출 스크립트: `tools/grad-extract/` (README 참고)
- **5주차: 카톡 졸업요건 답변이 공식 기준으로 바뀌었다.**
  - 엑셀 → `tools/grad-extract/export_json.py` → `data/graduation-source/{criteria,departments,answer-key}.json`
  - 서버 시작 시 `graduation_criteria`(523행) · `grad_departments`(42) · `department_aliases` 로 적재 (`src/services/gradCriteria.ts`).
    다시 적재: `npm run import:graduation`
  - 학번 구간으로 조회 (21학번 → 2020~2021 열). 옛 이름·다른 표기 인식 (컴퓨터공학전공 · 전자정보통신공학과 · 컴공 등)
  - 단과대 목록은 2026 홈페이지 기준(`data/kb/졸업요건/_taxonomy.json`) + 21·22학번 당시 단과대 이름(인문대학·과학기술대학 등)도 입력으로 인식
  - 답변 뒤 버튼: 편입생 기준 · 외국인 기준 · 다른 학과 · 다른 학번. 원문 PDF 버튼은 학교 홈페이지 PDF로 바로 연결
  - 기준이 없으면 추측하지 않고 안내: 2020 이전(개별 심사) · 신설 · 모집중단 · 가이드 이후 학번
  - 예시 데이터 정리: `data/kb/졸업요건/` 의 가짜 폴더 삭제, 서버 시작 시 `[PLACEHOLDER]` 행 삭제.
    `graduation_requirements` 테이블(관리자 수동 등록)은 가이드에 없는 학과 보충용으로만 남김
  - REST: `GET /api/graduation/criteria?year=2021&department=컴퓨터공학전공&type=신입생-내국인`

---

## 5. 발표 자료(PPT) 만드는 방법

`tools/slides/` 에 생성 스크립트가 있다. python-pptx 로 만들며, **디자인은 확정된 흑백회 스타일이다. 색을 바꾸지 말 것.**

```
tools/slides/
├─ lib.py              공통 헬퍼 (슬라이드·표·도형·화살표·팔레트) — 디자인 규칙의 원천
├─ w4final.py          4주차 덱 정의 (슬라이드별 내용)
├─ build_final.py      빌드 스크립트
├─ kakao_mock.py       실제 스킬 응답 JSON → 카카오톡 화면 PNG 생성
├─ kakao_mock_sub.py   공지 알림 구독 화면 (kakao_responses_sub.json 사용)
├─ render_terminal.py  명령 실행 결과 텍스트 → 터미널 창 PNG 생성
└─ img/                슬라이드에 들어가는 캡처 이미지
```

```bash
cd tools/slides && python3 build_final.py 출력파일.pptx
```

### 디자인·형식 규칙 (고정)

- 16:9 (13.333 × 7.5인치), 글꼴 **맑은 고딕**
- 색: 검정 `#262626` / 회색 `#A6A6A6` / 배경 흰색 — **파란색·주황색 금지**
- 제목 24pt 볼드 + 가는 가로선, 우상단에 `n / 전체` 쪽번호
- 목차 10개 이하, 항목 사이 빈 줄
- 장수: 15장 ± 3
- 구성 순서: **제목 → 목차 → 간트차트 → 구현한 것 → 다음 주 계획**
- 3주차 설계 덱(개요·요구사항·유스케이스·시스템 구성도·기술 스택·시퀀스·테스트 계획)과 **내용을 중복하지 않는다**
- 도형·표만 쓰지 말고 **실제 실행 화면·터미널 출력 캡처를 넣는다**

### 캡처 만드는 방법 (이번 주에 쓴 방식)

1. 로컬 서버 실행 (`PORT=3999 LLM_PROVIDER=mock ADMIN_TOKEN=demo-admin-token DATABASE_PATH=/tmp/demo.db`)
2. 관리자 화면: 헤드리스 크롬으로 캡처
   `"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --screenshot=out.png --window-size=1280,1100 --force-device-scale-factor=2 URL`
   관리자 웹은 토큰 입력이 필요해서, 캡처할 때만 `admin.js` 의 `init()` 에 쿼리파라미터(`?t=토큰&page=notices`)로 자동 로그인하는 훅을 임시로 넣고 캡처 후 되돌렸다. **이 훅은 커밋하지 않는다.**
3. 카카오톡 화면: 실제 `/api/kakao/skill` 응답 JSON 을 받아 `kakao_mock.py` 로 카카오톡 UI 형태 PNG 생성 (실기기 캡처가 아니므로 슬라이드에 "시안"이라고 표기)
4. 터미널 출력: 명령 결과를 텍스트로 저장 후 `render_terminal.py` 로 PNG 생성
5. 엑셀 화면: Excel AppleScript `copy picture (range …) appearance screen format picture` → 클립보드 PNG 저장
   (`screencapture` 는 권한이 없어 실패한다). 원본 PDF 캡처는 제목 띠가 주황색이라 흑백으로 변환해 넣었다

### 렌더링 검수

LibreOffice 가 없다. PDF 변환은 **Microsoft PowerPoint**를 AppleScript 로 호출한다 (Keynote 는 자주 -609/-1712 오류가 난다).

```bash
osascript -e 'with timeout of 600 seconds
tell application id "com.microsoft.Powerpoint"
  open POSIX file "…/deck.pptx"
  delay 10
  save active presentation in POSIX file "…/deck.pdf" as save as PDF
  close active presentation saving no
end tell
end timeout'
pdftoppm -jpeg -r 58 deck.pdf out    # 페이지 이미지로 겹침·넘침 확인
```

**주의**: 샌드박스 앱이라 `/private/tmp` 경로는 접근이 막힌다. 파일을 앱 컨테이너
(`~/Library/Containers/com.microsoft.Powerpoint/Data/…`)로 복사한 뒤 변환한다.

---

## 6. 작업 환경에서 주의할 점

- **`/workspace/wise-faq-bot` 은 이 Mac에 없다.** 다른 AI(Grok Bot 앱의 봇들)가 쓰는 샌드박스 경로다. 그쪽 작업물은 GitHub에 올라오지 않을 수 있으니, **작업 전에 GitHub `main` 최신 커밋을 기준으로 삼는다.**
- 같은 기능을 두 곳에서 구현해 충돌할 수 있다. 시작 전 `git log --oneline -5` 로 기준을 확인하고, 중복 구현이 의심되면 사용자에게 먼저 묻는다.
- 스크래치패드(`/private/tmp/...`)는 세션 중에도 정리되어 파일이 사라질 수 있다. **중요한 산출물은 레포나 외장 SSD에 바로 저장한다.**
- 외장 SSD 경로: `/Volumes/SSD 2TB/동국대학교/4학년2학기/컴퓨터공학종합설계2/` (발표 자료 보관 위치, 유일 사본이므로 덮어쓰기 전 확인)
- `node` 기본 경로가 외장 SSD(공백 포함 경로)라 빌드 도구가 멈출 수 있다. `PATH=/usr/local/bin:...` 를 앞에 붙여 실행한다.
- 이메일 첨부: Gmail 도구는 첨부 내용을 텍스트로 넘겨야 해서 **1MB 안팎 파일은 첨부할 수 없다.** 큰 파일은 GitHub 링크로 전달한다.

---

## 7. 남은 이슈 (우선순위 순)

| ID | 이슈 | 내용 | 대응 | 시기 |
|----|------|------|------|------|
| R1 | ~~카톡 스킬 URL 미고정~~ | 10/9 해결: ngrok 고정 도메인 + launchd 상시 실행 (`deploy/README.md`). 장기 운영은 Cloudflare 고정 터널로 이전 가능 — 6주차 PPT에 명시 | 오픈빌더 등록·봇 테스트 | 6주 |
| R2 | 실기기 검증 0회 | 현재 증거는 로컬 서버 응답과 화면 시안뿐 | R1 해결 후 실제 카톡에서 E2E | 5주 |
| R3 | 카톡 졸업요건이 예시 데이터 | 실데이터 엑셀은 만들었지만 챗봇에 미연결 · 공통 기준 3종(교양 세부·외국어 대체·외국인 편입생) 미추출 | 아래 8장 순서대로 연결 | 5주 |
| R4 | 응답 시간 미측정 | 카톡 5초 제한 대비 실측값 없음 | E2E에서 응답시간 기록 | 6주 |
| R5 | ~~임베딩이 mock~~ | 10/15 해결: Ollama qwen3-embedding:0.6b. 임베딩만 27→42/50, 사전과 함께 50/50. 기준 0.5 (10/22 .env 의 0.35 덮어쓰기 제거) | — | 7주 |
| R6 | 사용성 테스트 미실시 | 비개발자 관리자 과제 8개 준비 (`docs/usability-test.md`) | 10/26~11/1 실시 · 논문 평가 장 | 9주 |

### 사용자 판단이 필요해 보류 중인 것

- 카카오 i 오픈빌더 스킬 URL 등록·재연결 (사용자가 직접 콘솔에서 해야 함)
- 고정 도메인 확보 방식 선택
- GitHub PAT (현재는 `gh` CLI 인증으로 푸시하고 있음)

---

## 8. 다음 할 일 (10/26 이후 — 기능 완성 뒤)

- **테스트 (10/26~11/1)**: 사용성 테스트 (`docs/usability-test.md`, 3~5명), 통합 테스트 (`npm test` + 카톡 실기기), 다른 컴퓨터에서 `./scripts/setup.sh` 설치 확인
- **논문 · 포스터**: 지도교수 날인 11/2~11/4 목표, 심사신청서 11/6 15시
- **발표**: 8주차 진행 보고 (10/26), 최종 발표 11/9
- 보류: 졸업요건 공통 기준 3종 (교양 세부 · 외국어 대체 · 외국인 편입생) — 10/10 사용자 결정으로 미룸

---

## 9. 산출물 이력

| 주차 | 산출물 | 위치 |
|------|--------|------|
| 3주 | 설계 발표 자료 (17장) | SSD `2021212843_경재원_3주차_설계_요약본.pptx` |
| 3주 | 설계 산출물 13종 | `docs/design/` (커밋 26de462) |
| 4주 | 공지 기능 + 버그 수정 | 커밋 `d1d9b72` |
| 4주 | 진행 보고 문서 | `docs/progress/2026-W04-진행보고.md` (커밋 43aa83f) |
| 4주 | 진행 보고 발표 자료 (17장, 최종 `2021212843_경재원_4주차_진행보고_3.pptx`) | `slides/` · SSD · Google Drive「컴퓨터공학종합설계2 대기」 |
| 4주 | 공지 알림 구독 + 테스트 DB 분리 | 브랜치 머지 커밋 (git log 참고) |
| 4주 | 졸업요건 엑셀 · 추출 스크립트 | `data/graduation-source/` · `tools/grad-extract/` |

---

## 5주차 추가 사항 (2026-10-03, 미커밋)

- **지도 실데이터**: `tools/map-crawl/crawl_campus_map.py` 가 학교 홈페이지 강의실 안내(page/861) · 캠퍼스맵(campus/map) · 건물 상세(ajax)를 받아
  `data/kb/지도/{buildings,places,rooms}.json` 을 만든다. 호실 287 · 강의실 건물 16동 · 장소 35곳 · 코드 19개(전부 좌표).
  두 출처의 건물 이름이 달라 코드 → 이름 → 앞부분 → 수동(MANUAL_PLACE) 순으로 맞춘다. 원본 저장본은 SSD `지도_조사/원본_2026-10-03`.
- **지도 답변**(`src/services/roomCode.ts`): 호실명·구분·수용인원, 건물 층수를 넘는 번호(D901 등)는 층을 말하지 않음, 숫자 기준 은/는,
  건물 이름·별칭 질문(`answerPlaceQuery`), 여러 곳이면 후보 버튼, 카카오맵 링크 카드(`textWithLinkCard`).
- **동아리 실데이터**: `data/seed/clubs.json` = 1차 크롤링 61개 (예전 가상 8개는 `clubs.sample.json`). 서버 시작 시 연락처가 `@example.` 인 예시 동아리를 지우고 시드한다.
- **동아리 검색**: `data/kb/동아리/_keywords.json`(학생 표현 → 분야) + `clubKeywords.ts`. 의미 유사도에 키워드 점수(최대 +0.8)를 더하고,
  사전에 걸린 동아리가 있으면 그 동아리만 답한다. 이름·'다른 이름' 별칭도 점수·구조 검색에 반영. mock 임베딩 한계는 그대로 — 실제 임베딩으로 재평가 필요.
- **발표**: `slides/2021212843_경재원_5주차_진행보고.pptx` (17장, `tools/slides/w5final.py`, 이미지는 `w5_capture.py`). 미리보기 `preview_html.py`.
