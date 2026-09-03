# Kakao i Open Builder Skill setup

This bot acts as a **Skill server**. The KakaoTalk channel chatbot (Open Builder) forwards user utterances to this server, which returns **Skill response JSON v2.0**.

## 1. Server URL

HTTPS is required in production. For local dev, use a tunnel (e.g. ngrok).

```
POST https://<your-host>/api/kakao/skill
```

Content-Type: `application/json`

## 2. Open Builder steps (summary)

1. Create a bot in Kakao i Open Builder (https://i.kakao.com/)
2. Register a new Skill
   - URL: `https://<your-host>/api/kakao/skill`
   - Method: POST
3. Connect user utterances / blocks to that Skill
4. (Optional) Also call the Skill from a Fallback block for FAQ search

## 3. Request / response

### Request (Open Builder -> server)

Minimum fields used:

- `userRequest.utterance` — user text
- (fallback) `action.params.query` or `action.params.q`

### Response (server -> Open Builder)

Built only by `src/kakao/responseBuilder.ts` (Skill response v2.0):

```json
{
  "version": "2.0",
  "template": {
    "outputs": [
      { "simpleText": { "text": "answer body" } }
    ],
    "quickReplies": [
      { "label": "학사일정", "action": "message", "messageText": "학사일정" }
    ]
  }
}
```

## 4. Local smoke test

```bash
curl -s -X POST http://localhost:3000/api/kakao/skill \
  -H "Content-Type: application/json" \
  -d '{"userRequest":{"utterance":"학식"}}'
```

Empty utterance returns a help message + category quick replies.
Utterances `카테고리` / `메뉴` / `도움말` / `help` return the category list.

## 5. Security (MVP)

- MVP does not enforce Skill URL auth.
- Before production: add Open Builder Skill auth, IP allowlist, or secret header.
- Keep secrets in `.env`; commit only `.env.example`.

## 6. Note

Alimtalk / counseling talk / push are **out of MVP scope**. See `docs/mvp-scope.md`.
