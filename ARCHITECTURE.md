# WISE FAQ Bot — Phase-1 Hybrid RAG Architecture

동국대학교 WISE 캠퍼스 Q&A (졸업작품 Phase-1). MVP 도메인은 **동아리(클럽)** 만 다룹니다.

## 목표

- 키워드 FAQ JSON을 제거하고, **Hybrid RAG** 로 전환
- 구조화 필드(연락처/시간/장소/분과) → **SQL**
- 소개/활동 서술 → **임베딩 + 코사인 유사도**
- LLM Tool Calling(또는 mock 휴리스틱)이 라우팅: `structured_query` / `semantic_search` / `refuse`
- 답변에 **source_url + updated_at** 인용
- 유사도 낮음/도메인 외 → **"확인되지 않음"** + unanswered 로그
- Admin CRUD → **증분 재임베딩**(배포 없이 검색 반영, ~60s 목표)
- Kakao `/api/kakao/skill` 은 core `ask()` 의 thin adapter

## 구성도

```
Client / Kakao Skill
        │
        ▼
 Express (TypeScript)
   ├─ POST /api/ask          → ask()
   ├─ POST /api/kakao/skill  → ask() → Kakao JSON
   ├─ /api/admin/clubs CRUD  → SQLite + reindex
   ├─ POST /api/admin/reindex
   ├─ GET  /api/unanswered
   └─ GET  /admin            → static Admin UI
        │
        ▼
 ask()
   ├─ LLM provider.decideRoute(question)
   │    mock | openai | gemini
   ├─ structured_query → clubs SQL (LIKE / list)
   ├─ semantic_search  → embeddings cosine
   └─ refuse / low-sim → "확인되지 않음" + log
        │
        ▼
 SQLite (better-sqlite3)
   clubs | embeddings | unanswered_questions
```

## Hybrid 라우팅

| Tool | 언제 | 데이터 |
|------|------|--------|
| structured_query | 연락처, 모임시간, 장소, 분과, 목록 | clubs 테이블 |
| semantic_search | 소개/활동/분위기/모집 서술 | embeddings |
| refuse | 학사/장학/학식 등 동아리 외 | unanswered 로그 |

Mock 모드에서는 API 키 없이 휴리스틱 라우터 + hash n-gram 임베딩으로 동일 파이프라인이 동작합니다.

## 임베딩 저장

- `embeddings` 테이블에 club 당 intro / activities / combined 청크
- `embedding_json` 에 float 배열 JSON 저장 (외부 벡터DB 없이 SQLite)
- 검색 시 전 청크 로드 후 JS 코사인 유사도, club 단위 max score
- `SEMANTIC_MIN_SCORE`(기본 0.35) 미만이면 미확인 처리

## Admin / 재인덱싱

1. Admin UI (`/admin`) 또는 `POST /api/admin/clubs`
2. 저장 시 해당 club만 `reindexClub` (증분)
3. `POST /api/admin/reindex` 로 전체 재생성 가능
4. 코드 재배포 없이 DB·임베딩만 갱신

## 확장 노트 (Out of scope for Phase-1)

- 학사일정, 장학, 증명서 등 도메인 테이블 추가 + 라우터 확장
- 로컬 sLLM / Ollama
- Kakao 채널 실연동·알림톡

## 주요 경로

- Core: `src/services/askService.ts`
- LLM: `src/llm/provider.ts`
- Embed: `src/embeddings/embedder.ts`
- DB: `src/db/database.ts`
