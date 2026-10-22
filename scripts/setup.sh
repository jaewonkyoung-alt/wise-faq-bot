#!/usr/bin/env bash
# WISE FAQ 퀵스타트 — 처음 받은 컴퓨터에서 한 번 실행하면 바로 쓸 수 있게 준비한다.
#
#   git clone https://github.com/jaewonkyoung-alt/wise-faq-bot.git
#   cd wise-faq-bot
#   ./scripts/setup.sh            # 설치 · 설정 · 점검까지
#   ./scripts/setup.sh --start    # 끝나면 서버까지 켜기
#
# 옵션
#   --start       설치 후 서버 실행 (Ctrl+C 로 끔)
#   --service     (macOS) 로그인할 때 자동으로 켜지는 상시 서버로 등록 (launchd)
#   --no-ollama   로컬 임베딩(Ollama) 없이 키워드 사전 검색만 사용
#
# 자동으로 하는 일: Node 패키지 · Python 도구(PDF · 엑셀) 설치, .env 생성(관리자 토큰 무작위),
#   임베딩 모델 준비(Ollama 가 있으면), 빌드, DB 초기화(졸업기준 42개 학과 · 동아리 61곳 · 지도), 동작 점검.
# 사람이 해야 하는 일: 카카오톡 채널 · 오픈빌더 스킬 연결, 외부 공개 주소(터널) — README 「카카오톡 연결」.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

START=0; SERVICE=0; USE_OLLAMA=1
for a in "$@"; do
  case "$a" in
    --start) START=1 ;;
    --service) SERVICE=1 ;;
    --no-ollama) USE_OLLAMA=0 ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "알 수 없는 옵션: $a (--help)"; exit 1 ;;
  esac
done

step() { printf '\n\033[1m▶ %s\033[0m\n' "$*"; }
ok()   { printf '  ✓ %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*"; }
die()  { printf '\n✗ %s\n' "$*" >&2; exit 1; }
env_get() { grep -E "^$1=" .env 2>/dev/null | tail -1 | cut -d= -f2- || true; }
env_set() { # .env 의 KEY 값을 바꾸거나 없으면 추가
  if grep -qE "^$1=" .env; then
    local tmp; tmp="$(mktemp)"; awk -v k="$1" -v v="$2" 'BEGIN{FS=OFS="="} $1==k{$0=k"="v} {print}' .env > "$tmp" && mv "$tmp" .env
  else
    printf '%s=%s\n' "$1" "$2" >> .env
  fi
}

# ── 1. Node ──
step "1/7 Node.js 확인"
command -v node >/dev/null || die "Node.js 가 없습니다. https://nodejs.org 에서 LTS(20 이상)를 설치하세요. (macOS: brew install node)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
[ "$NODE_MAJOR" -ge 18 ] || die "Node.js $(node -v) 는 너무 오래됐습니다. 18 이상이 필요합니다."
ok "node $(node -v) · npm $(npm -v)"

step "2/7 Node 패키지 설치"
if [ -f package-lock.json ]; then npm ci --no-audit --no-fund --loglevel=error; else npm install --no-audit --no-fund --loglevel=error; fi
ok "설치 완료"

# ── 2. Python (PDF · 엑셀) ──
step "3/7 Python 도구 (졸업요건 PDF 변환 · 동아리 엑셀)"
VENV="tools/grad-extract/.venv"
PY_OK=0
if command -v python3 >/dev/null && python3 -c 'import sys; sys.exit(0 if sys.version_info >= (3, 9) else 1)'; then
  [ -x "$VENV/bin/python" ] || python3 -m venv "$VENV"
  "$VENV/bin/python" -m pip install --quiet --upgrade pip >/dev/null 2>&1 || true
  if "$VENV/bin/python" -m pip install --quiet -r tools/requirements.txt; then
    PY_OK=1; ok "$("$VENV/bin/python" --version) · pdfplumber · openpyxl"
  else
    warn "Python 패키지 설치 실패 — PDF 올리기 · 동아리 엑셀만 쓸 수 없고 나머지는 동작합니다"
  fi
else
  warn "python3(3.9 이상)이 없습니다 — PDF 올리기 · 동아리 엑셀만 쓸 수 없고 나머지는 동작합니다 (macOS: brew install python)"
fi

# ── 3. .env ──
step "4/7 설정 파일 (.env)"
if [ ! -f .env ]; then
  cp .env.example .env
  env_set ADMIN_TOKEN "$(node -e 'console.log(require("crypto").randomBytes(18).toString("base64url"))')"
  ok ".env 를 만들고 관리자 토큰을 무작위로 정했습니다"
else
  ok ".env 가 이미 있어 그대로 둡니다"
  [ "$(env_get ADMIN_TOKEN)" = "change-me-local-admin-token" ] && warn "ADMIN_TOKEN 이 예시 값입니다 — .env 에서 바꾸세요"
fi

# ── 4. 임베딩 (Ollama) ──
step "5/7 동아리 의미 검색 (로컬 임베딩)"
MODEL="$(env_get OLLAMA_EMBEDDING_MODEL)"; MODEL="${MODEL:-qwen3-embedding:0.6b}"
if [ "$USE_OLLAMA" = 1 ] && command -v ollama >/dev/null; then
  if ! curl -s -m 3 http://127.0.0.1:11434/api/tags >/dev/null; then
    (ollama serve >/dev/null 2>&1 &) ; sleep 3
  fi
  if curl -s -m 3 http://127.0.0.1:11434/api/tags | grep -q "\"$MODEL\""; then
    ok "Ollama 에 $MODEL 이 있습니다"
  else
    echo "  $MODEL 내려받는 중 (약 640MB)…"
    ollama pull "$MODEL" >/dev/null && ok "$MODEL 준비 완료" || warn "모델을 받지 못했습니다 — 키워드 사전 검색만 씁니다"
  fi
  if curl -s -m 3 http://127.0.0.1:11434/api/tags | grep -q "\"$MODEL\""; then
    env_set EMBED_PROVIDER ollama; env_set OLLAMA_EMBEDDING_MODEL "$MODEL"
  fi
else
  [ "$USE_OLLAMA" = 1 ] && warn "Ollama 가 없습니다 — 키워드 사전 검색만 씁니다 (설치: https://ollama.com 후 다시 실행)"
  grep -qE '^EMBED_PROVIDER=' .env || env_set EMBED_PROVIDER mock
fi
ok "임베딩: $(env_get EMBED_PROVIDER)"

# ── 5. 빌드 ──
step "6/7 빌드"
npm run --silent build
ok "dist/ 생성"

# ── 6. 첫 실행 · 점검 ──
step "7/7 DB 초기화 · 동작 점검"
CHECK_PORT="${SETUP_CHECK_PORT:-3123}"
LOG="$(mktemp)"
PORT="$CHECK_PORT" node dist/index.js >"$LOG" 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null || true' EXIT
for _ in $(seq 1 60); do curl -s -m 2 "http://127.0.0.1:$CHECK_PORT/health" >/dev/null && break; sleep 1; done
curl -s -m 2 "http://127.0.0.1:$CHECK_PORT/health" >/dev/null || { cat "$LOG"; die "서버가 뜨지 않았습니다 (위 로그 참고)"; }
ASK() { curl -s -m 10 -H 'Content-Type: application/json' "http://127.0.0.1:$CHECK_PORT/api/ask" -d "{\"question\":\"$1\"}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).answer.split("\n")[0])}catch{console.log("(응답 없음)")}})'; }
SKILL() { curl -s -m 10 -H 'Content-Type: application/json' "http://127.0.0.1:$CHECK_PORT/api/kakao/skill" -d "{\"userRequest\":{\"utterance\":\"$1\",\"user\":{\"id\":\"setup-check\"}}}" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const o=JSON.parse(s).template.outputs[0];console.log((o.simpleText||o.basicCard||{}).text||(o.basicCard||{}).description||"")}catch{console.log("(응답 없음)")}})' | head -1; }
ok "서버 응답: $(grep -o 'llm=[^ ]* embed=[^ ]* clubs=[0-9]* graduation=[0-9]*' "$LOG" | head -1)"
ok "동아리 질문 → $(ASK '별 보는 동아리 있어?')"
ok "졸업요건 질문 → $(SKILL '25학번 컴퓨터공학과 졸업요건')"
ok "지도 질문 → $(SKILL 'S504')"
kill $PID 2>/dev/null || true; wait $PID 2>/dev/null || true; trap - EXIT

PORT_NOW="$(env_get PORT)"; PORT_NOW="${PORT_NOW:-3000}"
printf '\n\033[1m완료\033[0m\n'
echo "  관리자 화면 : http://localhost:$PORT_NOW/admin"
echo "  관리자 토큰 : $(env_get ADMIN_TOKEN)   (.env 의 ADMIN_TOKEN, 다른 사람과 공유하지 마세요)"
echo "  서버 켜기   : npm start          (상시 실행은 ./scripts/setup.sh --service)"
echo "  테스트      : npm test"
echo "  카카오톡 연결 · 외부 공개 주소는 README 「카카오톡 연결」을 따라 한 번만 설정하세요."
[ "$PY_OK" = 1 ] || echo "  (Python 도구가 없어 PDF 올리기 · 동아리 엑셀은 꺼져 있습니다)"

# ── 상시 실행 (macOS launchd) ──
if [ "$SERVICE" = 1 ]; then
  [ "$(uname)" = Darwin ] || die "--service 는 macOS 전용입니다. 리눅스는 systemd 로 'node dist/index.js' 를 등록하세요."
  LABEL="${WISEFAQ_LABEL:-com.wisefaq.server}"
  PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
  mkdir -p logs "$HOME/Library/LaunchAgents"
  cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$(command -v node)</string><string>dist/index.js</string></array>
  <key>WorkingDirectory</key><string>$ROOT</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$ROOT/logs/server.log</string>
  <key>StandardErrorPath</key><string>$ROOT/logs/server.log</string>
</dict></plist>
PL
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  launchctl bootstrap "gui/$(id -u)" "$PLIST"
  ok "상시 서버 등록: $LABEL (로그 logs/server.log, 코드 반영은 npm run build && launchctl kickstart -k gui/\$(id -u)/$LABEL)"
fi

if [ "$START" = 1 ]; then
  echo; echo "서버를 켭니다 — 끄려면 Ctrl+C"
  exec node dist/index.js
fi
