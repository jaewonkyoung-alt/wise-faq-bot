# WISE FAQ Bot (Phase-1 Hybrid RAG)

Dongguk University WISE campus Q&A.

**Primary UX: graduation requirements** — KakaoTalk button + slot-filling (admission year → department → SQL lookup only). Never invents credits/rules.

**Secondary: clubs** — hybrid RAG via `/api/ask`.

Details: ARCHITECTURE.md

## How to run

```bash
npm install
npm run seed
npm run build
npm start
```

- Admin UI: `/admin`
- Graduation: `GET /api/graduation?year=&department=`
- Departments: `GET /api/graduation/departments`
- Years: `GET /api/graduation/years`
- Ask (clubs): `POST /api/ask`
- Kakao: `POST /api/kakao/skill`
- Config: `.env.example`

## Graduation rules

- Facts only from DB by admission_year + department.
- Missing row -> clear not-found message (+ unanswered log).
- Seed rows marked PLACEHOLDER.

## Kakao slot flow

1. Empty / menu / start -> graduation, clubs, map buttons
2. Graduation -> ask year
3. Year -> ask department
4. Department -> SQL answer with source_url / verified_at
5. Clubs -> ask(); map -> stub

## LLM providers

mock | openai | gemini | openrouter (embeddings mock by default for openrouter).

## Tests

```bash
npm run build
npm run test:graduation
npm run smoke
```
