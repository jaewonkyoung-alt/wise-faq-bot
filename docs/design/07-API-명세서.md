# 인터페이스 설계 — API 명세서

## 공개 · 카카오

| ID | Method | Endpoint | 설명 | 인증 | UC |
|----|--------|----------|------|------|----|
| API-01 | GET | /health | 서버 상태 (LLM·임베딩 방식, 동아리 수) | 없음 | — |
| API-02 | POST | /api/kakao/skill | 오픈빌더 스킬: userRequest.utterance · user.id → Skill JSON | 스킬 시크릿 | 01~05 |
| API-03 | GET | /api/graduation | 졸업요건 정확 조회 `?year=&department=&major_type=` (미존재 404) | 없음 | 02 |
| API-04 | GET | /api/graduation/departments | 등록된 학과 목록 | 없음 | 02 |
| API-05 | GET | /api/graduation/years | 등록된 입학연도 목록 | 없음 | 02 |
| API-06 | POST | /api/ask | 동아리 질의 `{question}` → 답변·경로·출처·유사도 | 없음 | 04 |
| API-07 | GET | /api/notices | 게시 중인 공지 목록 `?limit=5` (고정 우선·최신순) — 예정 | 없음 | 05 |
| API-08 | GET | /kb/* | 폴더 KB 정적 파일 (졸업요건 PDF 링크 대상) | 없음 | 02 |

## 관리자

| ID | Method | Endpoint | 설명 | 인증 | UC |
|----|--------|----------|------|------|----|
| API-09 | GET · POST | /api/admin/graduation | 졸업요건 목록 · 등록 (201, 연도+학과+구분 중복 409) | 관리자 토큰 | 07 |
| API-10 | GET · PUT · DELETE | /api/admin/graduation/:id | 졸업요건 단건 조회·수정·삭제 | 관리자 토큰 | 07 |
| API-11 | GET · POST | /api/admin/clubs | 동아리 목록 · 등록 (등록 후 자동 재색인) | 관리자 토큰 | 08 |
| API-12 | GET · PUT · DELETE | /api/admin/clubs/:id | 동아리 단건 조회·수정(재색인)·삭제(청크 CASCADE) | 관리자 토큰 | 08 |
| API-13 | POST | /api/admin/reindex | 임베딩 재색인 `{club_id?}` 없으면 전체 | 관리자 토큰 | 10 |
| API-14 | GET | /api/admin/kb/scan | 폴더 KB 재적재 + 지도 JSON 재로드, 스캔 결과 반환 | 관리자 토큰 | 11 |
| API-15 | GET | /api/admin/kb/status | 폴더 KB 상태 (학과·연도·항목 수) | 관리자 토큰 | 11 |
| API-16 | GET · DELETE | /api/unanswered | 미답변 목록 `?limit=` (최대 500) · 전체 삭제 | 관리자 토큰 | 12 |
| API-17 | GET · POST | /api/admin/notices | 공지 목록 · 등록 — 예정 | 관리자 토큰 | 09 |
| API-18 | GET · PUT · DELETE | /api/admin/notices/:id | 공지 단건 조회·수정·삭제 — 예정 | 관리자 토큰 | 09 |

## 공통 규약

| 항목 | 내용 |
|------|------|
| 형식·오류 | JSON (UTF-8) · 400 입력 오류 · 401 인증 실패 · 404 없음 · 409 중복 · 500 서버 오류 → `{ error, message }` |
| 카카오 스킬 | 헤더 `x-kakao-skill-secret` (설정 시 필수) · 서버 오류여도 200 + 안내 문구 반환(카톡 무응답 방지) |

## 관리자 인증 설계

- 헤더 `x-admin-token` = 환경변수 `ADMIN_TOKEN`
- 미설정 시 모든 관리 API 401 (fail-closed)
- 라우트마다 인증을 호출한다. `/api` 전역 미들웨어는 금지한다(카톡 스킬 401 차단 사고 방지).
