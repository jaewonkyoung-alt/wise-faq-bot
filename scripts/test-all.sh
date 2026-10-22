#!/usr/bin/env bash
# 전체 테스트 — npm test. 모든 테스트는 임시 DB 를 쓰므로 운영 데이터를 바꾸지 않는다.
cd "$(dirname "$0")/.."
TESTS=$(node -p 'Object.keys(require("./package.json").scripts).filter(k=>k.startsWith("test:")).join(" ")')
fail=0
npx tsc --noEmit -p . && echo "PASS  typecheck" || { echo "FAIL  typecheck"; fail=1; }
for t in $TESTS; do
  out=$(npm run -s "$t" 2>&1); code=$?
  line=$(echo "$out" | grep -E '^(PASS|SKIP) [a-z-]+' | tail -1)
  if [ $code -eq 0 ]; then echo "${line:-PASS  $t}"; else echo "FAIL  $t"; echo "$out" | grep -E '^FAIL|Error' | head -5; fail=1; fi
done
r=$(npx tsx scripts/eval-clubs.ts 2>&1 | grep '^합계'); echo "EVAL  동아리 검색 $r"
[ $fail -eq 0 ] && echo "모든 테스트 통과" || { echo "실패한 테스트가 있습니다"; exit 1; }
