# 운영 배포 (Mac mini 상시 실행)

| 항목 | 값 |
|------|----|
| 공개 주소 (고정) | `https://kaila-untempering-reconditely.ngrok-free.dev` |
| 카카오 스킬 URL | `https://kaila-untempering-reconditely.ngrok-free.dev/api/kakao/skill` |
| 외부 공개 경로 | `/api/kakao/skill`, `/health` 만 (`ngrok-policy.yml`). 관리자 웹은 이 Mac에서 `http://localhost:3000/admin` |
| 서버 | launchd `com.wisefaq.server` — `node dist/index.js`, 죽으면 자동 재시작, 로그 `logs/server.log` |
| 터널 | launchd `com.wisefaq.ngrok` — ngrok 무료 계정의 고정 dev 도메인, 로그 `logs/ngrok.log` |
| 설정 | `.env` (커밋 안 함): PORT 3000, DATABASE_PATH ./data/wise.db, LLM_PROVIDER mock, ADMIN_TOKEN |

```bash
npm run build && launchctl kickstart -k gui/$(id -u)/com.wisefaq.server   # 코드 반영
launchctl bootout gui/$(id -u)/com.wisefaq.ngrok                          # 터널 끄기
curl https://kaila-untempering-reconditely.ngrok-free.dev/health           # 상태 확인
```

## 왜 ngrok인가 / 장기 운영
- 개인 졸업작품 범위(도메인·서버 비용 없음)에서 고정 주소를 얻는 가장 간단한 방법. 무료 계정은 고정 도메인 1개, 이 Mac이 켜져 있어야 함.
- 장기 운영은 **Cloudflare 고정 터널(named tunnel)** 로 옮길 수 있다: 소유 도메인을 Cloudflare에 연결 → `cloudflared tunnel create` → DNS 라우팅. 서버 코드는 그대로이고 스킬 URL만 바뀐다.
