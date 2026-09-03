# Kakao Skill setup

POST /api/kakao/skill is a thin adapter around ask().
Response formatting: src/kakao/responseBuilder.ts (Skill JSON v2.0).

Local smoke: POST a userRequest.utterance to that path.
Help utterances return club-domain hints.

Production channel configuration is out of Phase-1 scope.
