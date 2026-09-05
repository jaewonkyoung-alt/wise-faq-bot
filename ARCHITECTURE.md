# WISE FAQ Bot — Architecture

Dongguk University WISE campus Q&A (capstone Phase-1).

## Domain priority

1. **Graduation (primary)** — Kakao slot-filling → **folder KB `data/kb/졸업요건` first**, else SQLite exact lookup
2. **Clubs (secondary)** — Hybrid RAG (SQL structured + embedding narrative); folder `data/kb/동아리` for seed/reference
3. **Map** — **room-code parsing** (`data/kb/지도/buildings.json` + rules). Not a stub.

## Goals

- Graduation answers use **registered data only** (KB `info.md`/PDF or DB). No inventing credits/rules.
- Missing row/folder → clear "not found" + unanswered log (admin-only read).
- Clubs: structured fields → SQL; intro/activities → embeddings; LLM tool routing.
- Kakao `POST /api/kakao/skill` → `kakaoDialog` (grad + map slots) + `ask()` (clubs).

## Diagram

```
Client / Kakao Skill
        |
        v
 Express (TypeScript)
   |- POST /api/kakao/skill      -> kakaoDialog (session + slots)
   |     optional x-kakao-skill-secret when KAKAO_SKILL_SECRET set
   |- GET  /api/graduation       -> SQL (+ KB via dialog)
   |- POST /api/ask              -> ask() clubs RAG
   |- GET/DELETE /api/unanswered -> ADMIN_TOKEN (x-admin-token)
   |- /api/admin/*               -> ADMIN_TOKEN
   |- static /kb/*               -> data/kb (public PDFs / md)
   +- GET  /admin                -> admin UI
        |
        v
 SQLite                          Folder KB (data/kb)
   graduation_requirements         졸업요건/<dept>/<year>/
   kakao_sessions                  동아리/<category>/<name>/
   clubs | embeddings              지도/buildings.json (+ rooms.json)
   unanswered_questions
```

## Graduation flow (Kakao)

| Step | Utterance / state | Action |
|------|-------------------|--------|
| menu | empty / menu / start | quickReplies: graduation, clubs, map |
| grad_year | 졸업요건 | ask admission year |
| grad_dept | year (2022 / 22학번 …) | store session, ask department |
| done | department | **KB lookup → else SQL** → text + optional PDF webLink; reset |
| clubs | 동아리 | ask() free text |
| map_room | 지도 / room code | `answerRoomCode` (building code + floor rule) |

Session: table `kakao_sessions` keyed by Kakao `userRequest.user.id`.

PDF button: `PUBLIC_BASE_URL` + `/kb/...` absolute URL. If unset, short student-facing notice only.

## Map / room codes

- Parser: `src/services/roomCode.ts`
- Building map: `data/kb/지도/buildings.json`
- Example: `S504` → building name + floor 5 (unknown codes: no guessed building name)

## Hybrid routing (clubs)

| Tool | When | Data |
|------|------|------|
| structured_query | contact, meeting time, place, category, list | clubs table |
| semantic_search | intro / activities / vibe | embeddings |
| refuse | non-club topics | unanswered log |

### OpenRouter

- `LLM_PROVIDER=openrouter` → OpenAI-compatible + OpenRouter base URL
- Embeddings default to mock (`EMBED_PROVIDER` can override)

## Extension notes

- Replace PLACEHOLDER / sample KB with real catalogs
- Expand major_type (double minor, etc.)
- On-device sLLM / Ollama
- More slot domains (academic calendar, …)

## Key paths

- Admin auth: `src/middleware/adminAuth.ts`
- Graduation SQL: `src/services/graduationService.ts`
- Graduation KB: `src/services/kbGraduation.ts`
- Room codes: `src/services/roomCode.ts`
- Kakao dialog: `src/services/kakaoDialog.ts`
- Clubs ask: `src/services/askService.ts`
- DB: `src/db/database.ts`
