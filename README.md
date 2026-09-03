# WISE FAQ Bot (Phase-1 Hybrid RAG)

Dongguk University WISE campus Q&A. MVP domain: clubs only.

Replaces keyword FAQ with hybrid RAG (SQL + embeddings), LLM tool routing,
citations, admin CRUD/reindex, unanswered log, Kakao thin adapter.

Details: ARCHITECTURE.md

## How to run

Use package scripts: install, seed, build, start, dev, smoke, eval.
Admin UI at /admin. Ask endpoint at /api/ask. Kakao at /api/kakao/skill.
See .env.example for configuration.
