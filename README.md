# WISE FAQ Bot (Phase-1 Hybrid RAG)

Dongguk University WISE campus Q&A. MVP domain: clubs only.

Replaces keyword FAQ with hybrid RAG (SQL + embeddings), LLM tool routing,
citations, admin CRUD/reindex, unanswered log, Kakao thin adapter.

Details: ARCHITECTURE.md

## How to run

Use package scripts: install, seed, build, start, dev, smoke, eval.
Admin UI at /admin. Ask endpoint at /api/ask. Kakao at /api/kakao/skill.
See .env.example for configuration.

## LLM providers

| `LLM_PROVIDER` | Chat | Embeddings (default) |
|----------------|------|----------------------|
| `mock` | Heuristic router | Mock hash vectors |
| `openai` | OpenAI chat | OpenAI embeddings |
| `gemini` | Gemini | Gemini embeddings |
| `openrouter` | OpenAI-compatible via OpenRouter (`openai/gpt-oss-120b`) | **Mock** (chat-only model) |

OpenRouter setup:

```bash
LLM_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...   # or OPENAI_API_KEY
# optional:
# OPENAI_BASE_URL=https://openrouter.ai/api/v1
# OPENAI_MODEL=openai/gpt-oss-120b
```

To use real embeddings while chatting via OpenRouter, set e.g. `EMBED_PROVIDER=openai` and `OPENAI_API_KEY` (and optionally `OPENAI_BASE_URL` for embeddings).
