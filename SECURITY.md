# Security posture (WISE FAQ Bot)

Educational MVP summary. Do not put real secrets or API keys in this file.

## Current posture

| Area | Behavior |
|------|----------|
| **ADMIN_TOKEN** | Fail-closed. Empty yields `401 admin_token_not_configured` on `/api/admin/*` and `/api/unanswered`. Header: `x-admin-token`. |
| **Unanswered API** | `GET`/`DELETE /api/unanswered` require the same admin check (not public). |
| **`/kb` static** | Public by design for Kakao PDF `webLink`. Do **not** place private documents under `data/kb`. |
| **Kakao skill** | If `KAKAO_SKILL_SECRET` is set, require `x-kakao-skill-secret`. If unset, endpoint stays open (MVP). Production should set it. |
| **CORS** | Open `cors()` default — fine for local/tunnel MVP; tighten for production. |
| **Tunnel URLs** | Ephemeral public hosts rotate; treat as temporary exposure of `/kb` and the skill URL. |
| **Admin UI token** | Stored in `sessionStorage` (`wise_admin_token`). XSS on the `/admin` origin could read it — keep the admin UI trusted. |
| **SQLite** | Single-file DB (`DATABASE_PATH`). Backup by copying when idle; keep `*.db*` out of git. |
| **Secrets in git** | `.env`, `.env.*` (except `.env.example`), and `*.db*` are gitignored. Never commit real keys. Rotate if leaked. |

## Known gaps / harden later

- No rate limiting on skill / ask / public graduation GETs
- Open CORS; no IP allowlist for admin
- Kakao secret is a shared static header (not request signing)
- PDF/KB paths are world-readable via `/kb`
- LLM API keys live in env — protect the host and logs; never print keys
- No automated secret scanning in CI yet

## Ops checklist

1. Copy `.env.example` to `.env`; set a strong `ADMIN_TOKEN`
2. Set `KAKAO_SKILL_SECRET` before a public Kakao webhook
3. Set `PUBLIC_BASE_URL` to HTTPS only
4. Confirm `.env` never appears staged in `git status`
5. Rotate tokens after any paste into chat, screenshots, or public repos
