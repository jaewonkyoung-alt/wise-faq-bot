/**
 * 외부 공개 주소(터널)를 거친 종단 간 응답 시간 — 운영 서버에 실제 카카오 스킬 요청 형식으로 보낸다.
 * 인터넷 → ngrok → 이 컴퓨터의 서버 → 다시 인터넷 구간을 재고, ngrok 검사기(127.0.0.1:4040)가 기록한
 * 서버 쪽 시간과 나란히 보여 준다. 카카오 플랫폼 구간(카카오 서버 ↔ ngrok)은 포함하지 않는다.
 *
 *   SKILL_URL=https://<공개-주소>/api/kakao/skill npx tsx scripts/e2e-latency.ts
 *
 * 사용자 키는 e2e-latency-* 로 보내며, 답할 수 있는 질문만 써서 미답변 기록을 남기지 않는다.
 */
import { performance } from 'perf_hooks';

const URL_ = process.env.SKILL_URL;
if (!URL_) {
  console.error('SKILL_URL 이 필요합니다');
  process.exit(1);
}

const GROUPS: Record<string, string[]> = {
  졸업요건: ['21학번 컴퓨터공학과 졸업요건', '22학번 경영학과 졸업학점', '23학번 간호학과 졸업요건', '24학번 경찰행정학과 졸업요건',
    '25학번 식품생명공학과 졸업요건', '20학번 불교학부 졸업요건', '21학번 정보경영학과 졸업요건', '22학번 의생명공학과 졸업요건',
    '23학번 사회복지학과 졸업요건', '24학번 컴공 졸업요건'],
  지도: ['S504', 'A101', 'D201', 'N305', 'H107', '도서관 어디야', '기숙사', '학생회관 어디야', '본관 어디야', '체육관 어디야'],
  동아리: ['별 보는 동아리 있어?', '코딩 동아리 추천해줘', '볼링 동아리', '테니스 치는 동아리', '사진 찍는 동아리', '수영 동아리',
    '책 읽는 동아리', '보드게임 동아리', '검도 동아리', '연극 동아리', '천문 관측하는 모임 있어?', '배드민턴 치고 싶어 동아리',
    '독서 모임 동아리', '등산 동아리', '다도 동아리', '농구 하는 동아리', '풋살 동아리', '격투기 동아리', '노래 부르는 동아리', '야구 동아리'],
  '메뉴·공지': ['메뉴', '공지', '졸업요건', '동아리', '지도', '처음으로', '메뉴', '공지', '지도', '동아리'],
};

let seq = 0;
async function send(utterance: string): Promise<{ ms: number; ok: boolean }> {
  const t0 = performance.now();
  const res = await fetch(URL_!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'ngrok-skip-browser-warning': '1' },
    body: JSON.stringify({ userRequest: { utterance, user: { id: `e2e-latency-${Date.now()}-${++seq}`, type: 'botUserKey' } } }),
  });
  const json = (await res.json()) as { template?: { outputs?: unknown[] } };
  return { ms: performance.now() - t0, ok: res.status === 200 && (json.template?.outputs?.length ?? 0) > 0 };
}

function pct(xs: number[], p: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)];
}
const f = (n: number) => Math.round(n).toString();

async function serverSide(since: number): Promise<number[]> {
  try {
    const r = (await (await fetch('http://127.0.0.1:4040/api/requests/http?limit=200')).json()) as {
      requests: Array<{ start: string; duration: number; request: { uri: string } }>;
    };
    return r.requests
      .filter((x) => x.request.uri === '/api/kakao/skill' && Date.parse(x.start) >= since)
      .map((x) => x.duration / 1e6);
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  const since = Date.now() - 1000;
  await send('메뉴'); // 터널 연결 예열
  console.log(`대상: ${new URL(URL_!).host} (ngrok) · 이 컴퓨터에서 인터넷을 돌아 다시 들어오는 경로\n`);
  const all: number[] = [];
  let fail = 0;
  for (const [name, qs] of Object.entries(GROUPS)) {
    const ms: number[] = [];
    for (const q of qs) {
      const r = await send(q);
      if (!r.ok) fail += 1;
      ms.push(r.ms);
    }
    all.push(...ms);
    console.log(`${name.padEnd(6)} ${String(ms.length).padStart(3)}건  평균 ${f(ms.reduce((a, b) => a + b, 0) / ms.length)}  p50 ${f(pct(ms, 50))}  p95 ${f(pct(ms, 95))}  최대 ${f(Math.max(...ms))}`);
  }
  console.log(`전체   ${String(all.length).padStart(3)}건  평균 ${f(all.reduce((a, b) => a + b, 0) / all.length)}  p50 ${f(pct(all, 50))}  p95 ${f(pct(all, 95))}  최대 ${f(Math.max(...all))}  (단위 ms, 실패 ${fail})`);
  const srv = (await serverSide(since)).slice(0, all.length);
  if (srv.length) {
    console.log(`\n같은 요청의 서버 쪽 시간 (ngrok 검사기) ${srv.length}건  p50 ${pct(srv, 50).toFixed(1)}  p95 ${pct(srv, 95).toFixed(1)}  최대 ${Math.max(...srv).toFixed(1)} ms`);
  }
  console.log(`카카오 제한 5,000ms 대비 최대 ${((Math.max(...all) / 5000) * 100).toFixed(1)}%`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
