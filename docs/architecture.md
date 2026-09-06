# 시스템 아키텍처 (1차 발표 정렬)

실제 구현: **Kakao Open Builder + Express + SQLite + `data/kb` + Admin UI + 호실 코드**.  
발표 Slide 9–10의 하이브리드·구성도와 대응시킨다.

## 시스템 개요

```mermaid
flowchart TB
  subgraph clients [클라이언트]
    Kakao[카카오톡 Open Builder]
    Web[웹 / Admin]
  end

  subgraph api [API · 오케스트레이터]
    Express[Express TypeScript]
    Dialog[kakaoDialog 슬롯]
    Ask[ask 동아리 RAG]
    Room[roomCode 지도]
  end

  subgraph data [저장소]
    SQLite[(SQLite 정형)]
    Vec[embeddings 비정형]
    KB[data/kb 폴더]
  end

  subgraph llm [LLM 1단계]
    Mock[mock 기본]
    Comm[상용 API OpenRouter 등]
  end

  Kakao --> Express
  Web --> Express
  Express --> Dialog
  Express --> Ask
  Express --> Room
  Dialog --> SQLite
  Dialog --> KB
  Ask --> SQLite
  Ask --> Vec
  Ask --> Mock
  Ask --> Comm
  Room --> KB
  Web --> SQLite
```

### [현재] vs [이후] (Slide 10)

| 라벨 | 내용 |
|------|------|
| **[현재]** | 동아리 KB · 관리자 · 상용 LLM (+ 졸업요건 폴더 KB, 호실 코드, 터널 호스팅) |
| **[이후]** | 추가 도메인(식당 등) · 로컬 sLLM · 학교/고정 호스팅 |

## 하이브리드 검색 흐름 (Slide 9)

```mermaid
flowchart LR
  Q[자연어 질의] --> TC[LLM Tool Calling]
  TC -->|정형: 학점·가격·시간·연락처| DB[(SQLite 조건 조회)]
  TC -->|비정형: 소개·분위기| EMB[임베딩 유사도]
  TC -->|KB 밖 / 저신뢰| REF[확인되지 않음 + unanswered]
  DB --> ANS[출처 URL · 최종수정일 포함 답변]
  EMB --> ANS
```

- **정형** — 값의 정확성이 필수 → DB  
- **비정형** — 의미 기반 탐색 → Vector/embeddings  
- 임계값 미만 → **"확인되지 않음"**

## 단순 유스케이스

```mermaid
sequenceDiagram
  actor Student as 학생
  actor Admin as 관리자
  participant Kakao as 카카오톡
  participant API as Express
  participant DB as SQLite/KB

  Student->>Kakao: 캠퍼스 정보 질의
  Kakao->>API: Skill 요청
  API->>DB: DB / 임베딩 / 폴더 KB
  API-->>Student: 출처 포함 답변

  Admin->>API: /admin 레코드 수정
  API->>DB: 저장 + 증분 재색인
  Note over API,DB: 재배포 없이 60초 이내 반영 목표
```

더 자세한 경로·테이블: [ARCHITECTURE.md](../ARCHITECTURE.md)  
아티팩트 stubs: [artifacts/](./artifacts/)
