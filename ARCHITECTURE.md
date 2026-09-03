# WISE FAQ Bot — Phase-1 Hybrid RAG Architecture

동국대학교 WISE 캠퍼스 Q&A (졸업작품 Phase-1).

## 도메인 우선순위

1. **졸업요건 (primary)** — 카카오 버튼 + 슬롯필링 → SQLite exact lookup
2. **동아리 (secondary)** — Hybrid RAG (SQL 구조화 + 임베딩 서술)
3. **온디바이스 / 지도 등** — later (지도는 stub)

## 목표

- 졸업요건 답변은 **DB lookup only** (admission_year + department). 학점·규칙 환각 금지.
- 행 없으면 **"확인되지 않음 / 데이터 없음"** + unanswered 로그.
- 동아리: 구조화 필드 → SQL, 소개/활동 → 임베딩; LLM tool routing.
- Kakao `/api/kakao/skill` 은 `kakaoDialog` 슬롯 플로우 (졸업) + `ask()` (동아리).

## 구성도

```
Client / Kakao Skill
        │
        ▼
 Express (TypeScript)
   ├─ POST /api/kakao/skill  → kakaoDialog (session + slots)
   ├─ GET  /api/graduation   → SQL exact lookup
   ├─ POST /api/ask          → ask() clubs RAG
   ├─ /api/admin/graduation  CRUD
   ├─ /api/admin/clubs       CRUD + reindex
   └─ GET  /admin
        │
        ▼
 SQLite
   graduation_requirements | kakao_sessions
   clubs | embeddings | unanswered_questions
```

## 졸업요건 플로우 (Kakao)

| Step | Utterance / state | Action |
|------|-------------------|--------|
| menu | empty / 메뉴 / 시작 | quickReplies: 졸업요건, 동아리, 지도 |
| grad_year | 졸업요건 | ask admission year |
| grad_dept | year (2022 / 22학번 …) | store session, ask department |
| done | department | **SQL lookup** → answer + citations; reset session |
| clubs | 동아리 | ask() free text |
| map | 지도 | stub only |

Session: table `kakao_sessions` keyed by Kakao `userRequest.user.id`.

## Hybrid 라우팅 (clubs)

| Tool | 언제 | 데이터 |
|------|------|--------|
| structured_query | 연락처, 모임시간, 장소, 분과, 목록 | clubs 테이블 |
| semantic_search | 소개/활동/분위기/모집 서술 | embeddings |
| refuse | 학사/장학/학식 등 동아리 외 | unanswered 로그 |

### OpenRouter

- `LLM_PROVIDER=openrouter` → OpenAI-compatible + OpenRouter base URL
- 임베딩 기본 mock (`EMBED_PROVIDER` 로 분리 가능)

## 확장 노트

- 실제 졸업요건 카탈로그로 PLACEHOLDER 시드 교체
- 복수전공/부전공 major_type 확장
- 온디바이스 sLLM / Ollama
- 지도·학사일정 등 추가 슬롯 도메인

## 주요 경로

- Graduation: `src/services/graduationService.ts`
- Kakao dialog: `src/services/kakaoDialog.ts`
- Clubs ask: `src/services/askService.ts`
- DB: `src/db/database.ts`
