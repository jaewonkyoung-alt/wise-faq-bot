# MVP Scope (Phase-1)

> Latest current/later notes: **[scope.md](./scope.md)** (aligned with 1st presentation Gantt + actual code).

## In scope (initial memo + current code)

- Hybrid RAG for clubs (`/api/ask`)
- SQLite structured fields + embeddings table
- ask() routes: structured_query / semantic_search / refuse
- Citations: source_url + updated_at
- Low similarity / OOD -> unverified + unanswered log
- Admin web CRUD + reindex without redeploy
- Kakao skill thin adapter (+ graduation slots, room-code map)
- Folder KB `data/kb/` (graduation / clubs / map)
- Mock LLM/embed mode (commercial API optional)
- Small Korean eval script

## Out of scope / later

- Kakao channel production + school fixed hosting (tunnel is temporary)
- Ollama / local sLLM (phase-2 comparison)
- Cafeteria and other non-club Hybrid domain schema expansion
- Alimtalk / counseling / uDRIMS

Seed club contacts/URLs and some KB rows are **demo PLACEHOLDER**.
