# WISE FAQ Bot

동국대학교 WISE 캠퍼스 FAQ 카카오톡 봇 (졸업작품 Phase-1).

Kakao Open Builder Skill → Express가 **졸업요건 · 동아리 · 지도(호실 코드)** 를 답합니다.

## What it is

| 메뉴 | 동작 |
|------|------|
| **졸업요건** (primary) | 입학연도 → 학과 슬롯. 폴더 KB `data/kb/졸업요건` 우선, 없으면 SQLite |
| **동아리** | Hybrid RAG (`/api/ask`) |
| **지도** | 호실 코드 파싱 (예: `S504`). stub 아님 |

자세한 구조: [ARCHITECTURE.md](./ARCHITECTURE.md) · 보안: [SECURITY.md](./SECURITY.md)

## Docs (1st presentation aligned)

| Doc | Content |
|------|------|
| [docs/presentation/1st-review.md](./docs/presentation/1st-review.md) | Slide-by-slide outline (1st review) |
| [docs/verification.md](./docs/verification.md) | Metrics: target, testset, measurement method |
| [docs/scope.md](./docs/scope.md) | Current vs later (Kakao FAQ, folder KB, graduation/clubs/map, tunnel hosting) |
| [docs/architecture.md](./docs/architecture.md) | System overview, hybrid flow, use case (mermaid) |
| [docs/artifacts/](./docs/artifacts/) | Gantt, usecase, ERD, sequence, tech-stack stubs |

**1st presentation deck filename:** `2021212843_경재원_1차발표.pptx`  
(copy: [docs/presentation/2021212843_경재원_1차발표.pptx](./docs/presentation/2021212843_경재원_1차발표.pptx), ~47KB)

## Stack

- Express + TypeScript
- SQLite (`better-sqlite3`)
- Folder KB `data/kb/` → `/kb/...`
- Kakao Open Builder + Admin UI (`/admin`)


- Seed/PLACEHOLDER data is demo-only; see [docs/scope.md](./docs/scope.md).
- Hosting may use a tunnel (`PUBLIC_BASE_URL`); school transfer is later.

## Setup

```bash
npm install
cp .env.example .env
# set a strong ADMIN_TOKEN
npm run seed
npm run build
npm start
```

### Env

| 변수 | 필수 | 설명 |
|------|------|------|
| `ADMIN_TOKEN` | yes | `/api/admin/*`, `/api/unanswered` — header `x-admin-token` |
| `PUBLIC_BASE_URL` | PDF buttons | HTTPS public URL, no trailing slash (tunnel hosting OK) |
| `KAKAO_SKILL_SECRET` | prod recommended | header `x-kakao-skill-secret` when set |
| `LLM_PROVIDER` | no | default `mock`; see `.env.example` |

Never commit `.env`. Rotate tokens if leaked.

## Folder KB (`data/kb`)

```
data/kb/
  졸업요건/<학과>/<입학연도>/info.md (+ optional *.pdf)
  동아리/<분과>/<동아리명>/info.md
  지도/buildings.json
```

- PDFs at `/kb/...`; Kakao webLink needs `PUBLIC_BASE_URL`.
- `/kb` is public static — no private docs.
- Seed/PLACEHOLDER rows are demo — replace with official catalogs ([docs/scope.md](./docs/scope.md)).

## Admin

- UI `/admin`
- Unanswered `GET/DELETE /api/unanswered` needs same admin gate

## Tests

```bash
npm run build
npm run test:room-code
npm run test:kakao-grad
```

## Security

See [SECURITY.md](./SECURITY.md). Fail-closed admin; unanswered admin-gated.
