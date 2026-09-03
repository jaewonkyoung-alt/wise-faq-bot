# MVP Scope

## In scope

- FAQ JSON Q&A (WISE campus samples)
- REST API: search / categories / get by id / health
- Kakao Open Builder Skill webhook (response JSON v2.0, simpleText + quickReplies)
- Add/edit FAQ via data/faq/*.json only (no code change)
- Placeholder answers marked with [PLACEHOLDER]

## Out of scope (NOT in this MVP)

| Item | Note |
|------|------|
| Alimtalk | No template notification sends |
| Counseling talk (sangdam-talk) | No agent handoff / ticketing |
| Push notifications | No app/web push |
| Login / academic system link | No uDRIMS personalization |
| Vector / LLM search | Keyword scoring only |
| Admin UI | Edit JSON files instead |
| i18n | Korean FAQ first |

## Later ideas (reference only)

- Replace placeholders with real calendar / contacts
- Kakao Skill auth / rate limit
- Simple FAQ CMS
- Alimtalk / counseling talk as a SEPARATE project — not this MVP
