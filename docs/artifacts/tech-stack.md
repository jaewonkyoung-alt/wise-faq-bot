# Tech stack stub (1차 발표 Slide 8)

## 1단계 (9~10월) — 상용 API 기반

- RAG 파이프라인(검색 정확도·확장 구조) 검증에 집중
- 상용 LLM API + 하이브리드 검색(DB + Vector Store)
- **실제 스택:** Express · TypeScript · SQLite(`better-sqlite3`) · folder KB · Kakao Open Builder · Admin UI · mock/OpenRouter

## 2단계 (10~11월) — 로컬 sLLM 교체·비교

- EXAONE/Qwen 계열, Ollama
- 정답률 · 응답속도 · 비용 정량 비교

## 도입 의사결정 (개인정보·비용)

1단계 상용 API는 **개인정보(질의 외부 전송)·비용 리스크**가 있으므로,  
2단계 로컬 비교가 도입 의사결정에 필요.
