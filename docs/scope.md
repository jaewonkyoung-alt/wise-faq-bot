# 구현 범위 — 현재 vs 이후

1차 발표 간트·시스템 구성도의 **『현재 구현 범위』 / 『이후 확장』** 과, 이 저장소에 **실제로 있는 코드**를 맞춰 정리한다.

## 현재 구현됨 (코드베이스)

| 영역 | 내용 | 비고 |
|------|------|------|
| Kakao FAQ 봇 | Open Builder Skill → `POST /api/kakao/skill` | 메뉴: 졸업요건 · 동아리 · 지도 |
| Express + TypeScript | 오케스트레이터·세션·어댑터 | `src/` |
| SQLite | clubs, embeddings, graduation, sessions, unanswered | `better-sqlite3` |
| Folder KB | `data/kb/졸업요건`, `data/kb/동아리`, `data/kb/지도` | 정적 `/kb/*` |
| Admin UI | `/admin` + `ADMIN_TOKEN` | CRUD·재색인, 재배포 없이 반영 목표 |
| 동아리 Hybrid RAG | structured_query / semantic_search / refuse | `POST /api/ask` |
| 호실 코드(지도) | `S504` 등 파싱 → 건물·층 | stub 아님 (`roomCode.ts`) |
| 졸업요건 | 입학연도→학과 슬롯; 폴더 KB 우선, 없으면 SQL | PLACEHOLDER/샘플 데이터 포함 |
| LLM | 기본 `mock`; OpenRouter 등 상용 API 옵션 | 1단계 상용 API 검증 |

## 발표 간트상 『현재』 (RAG·운영 축)

- 동아리 도메인 QA
- 관리자 수정 / 증분 색인
- 상용 API 1단계

## 이후 (간트 『이후 확장』 + 운영 이전)

| 항목 | 설명 |
|------|------|
| 학생식당 도메인 | 스키마 JSON 등록 후 Hybrid 확장 (가격·메뉴 정형) |
| 건물·강의실 → 졸업요건 정식 RAG화 | 현재 슬롯/폴더 KB를 스키마·권한·인덱싱 모델로 편입 |
| 로컬 sLLM 비교 (2단계) | EXAONE/Qwen + Ollama — 정답률·속도·비용 비교 |
| 호스팅 / 학교 이전 | **현재는 터널(ngrok 등) 임시 공개 URL** — 학교/고정 호스팅·채널 이관은 이후 |
| 실데이터 교체 | Seed·PLACEHOLDER 연락처/URL/KB → 공식 카탈로그 |

## "코드 0줄" 예외 (발표 문구와 동일)

신규 도메인 추가 시 **스키마 등록 · 도메인 권한 · 초기 인덱싱** 은 예외로 허용.  
그 외 앱 코드 변경 최소화를 목표로 한다.

## 정직한 한계

- 동아리/졸업 데이터 일부는 **데모 PLACEHOLDER**
- Kakao 채널·고정 HTTPS 배포는 **터널 의존** 가능 (`PUBLIC_BASE_URL`)
- 상용 LLM은 **질의 외부 전송(개인정보)·비용 리스크** → 2단계 로컬 비교가 도입 의사결정에 필요 (Slide 8)

관련: [mvp-scope.md](./mvp-scope.md) (초기 MVP 메모), [verification.md](./verification.md)
