"""5주차 발표 이미지 — 실제 실행 결과·실제 코드·실제 수집 데이터로만 그린다.

  W5_SRC=<증거 폴더> python3 tools/slides/w5_capture.py
    W5_SRC/kakao_responses_w5.json   handleKakaoDialog 실제 응답
    W5_SRC/ev/*.txt                  명령 실행 출력
    W5_SRC/web861_full.png ...       학교 홈페이지 헤드리스 캡처 (흑백 변환해 사용)
출력: tools/slides/img/w5-*.png
"""
import html
import json
import math
import os
import re
import subprocess

from PIL import Image, ImageOps

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SRC = os.environ["W5_SRC"]
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "img")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
os.makedirs(OUT, exist_ok=True)


def shoot(page_html, name, w, h, scale=2):
    hp = os.path.join(SRC, f"{name}.html")
    with open(hp, "w", encoding="utf-8") as f:
        f.write(page_html)
    png = os.path.join(OUT, f"{name}.png")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--screenshot={png}",
                    f"--window-size={w},{h}", f"--force-device-scale-factor={scale}",
                    "--virtual-time-budget=2000", "file://" + hp], check=True, capture_output=True, timeout=90)
    # 아래 여백 잘라내기
    im = Image.open(png).convert("RGB")
    bg = Image.new("RGB", im.size, (255, 255, 255))
    from PIL import ImageChops
    box = ImageChops.difference(im, bg).getbbox()
    if box:
        im = im.crop((0, 0, im.size[0], min(im.size[1], box[3] + 8)))
    im.save(png)
    print(png, im.size)
    return png


# ── 카카오톡 화면 (4주차와 같은 모양) ──
KCSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{width:390px;height:%(h)dpx;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;background:#BACEE0;overflow:hidden;display:flex;flex-direction:column}
.status{height:44px;display:flex;justify-content:space-between;align-items:center;padding:0 24px;font-size:15px;font-weight:600;color:#111}
.top{height:52px;display:flex;align-items:center;padding:0 14px;gap:10px;border-bottom:1px solid rgba(0,0,0,.05)}
.top .back{font-size:24px;color:#222}.top .t{font-size:17px;font-weight:700;color:#111;flex:1}.top .ic{font-size:16px;color:#333;letter-spacing:10px}
.chat{flex:1;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;padding:8px 10px 10px}
.chat>*{flex:none}
.row{display:flex;margin:6px 0;align-items:flex-end;gap:6px}
.me{justify-content:flex-end}.bot{align-items:flex-start}.bot .tm{align-self:flex-end}
.pf{width:38px;height:38px;border-radius:14px;background:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;color:#333;font-size:14px;flex:none;border:1px solid #d5dde6}
.col{display:flex;flex-direction:column;gap:5px;max-width:262px;min-width:0}
.nm{font-size:12px;color:#4a4a4a;margin-left:2px}
.b{background:#fff;border-radius:4px 16px 16px 16px;padding:9px 11px;font-size:13px;line-height:1.42;color:#111;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere}
.me .b{background:#FEE500;border-radius:16px 4px 16px 16px;max-width:240px}
.tm{font-size:10px;color:#5b6b7a;flex:none;margin-bottom:2px}
.card{background:#fff;border-radius:4px 16px 16px 16px;width:250px;overflow:hidden}
.card .d{padding:10px 12px;font-size:12.5px;line-height:1.45;white-space:pre-wrap;color:#111}
.card .btn{border-top:1px solid #eee;text-align:center;padding:9px;font-size:13px;color:#111;font-weight:600}
.qr{display:flex;gap:6px;overflow:hidden;white-space:nowrap;padding:8px 0 2px 44px}
.qr span{background:#fff;border:1px solid #d9d9d9;border-radius:16px;padding:6px 12px;font-size:12.5px;color:#222;flex:none}
.input{height:56px;background:#fff;display:flex;align-items:center;padding:0 12px;gap:10px;color:#aaa;font-size:14px}
.input .box{flex:1;height:36px;border-radius:18px;background:#f3f3f3;display:flex;align-items:center;padding:0 14px}
"""


def kakao(name, turns, file="kakao_responses_w5.json", height=844):
    R = json.load(open(os.path.join(SRC, file), encoding="utf-8"))
    body = []
    for i, (k, j) in enumerate(turns):
        x = R[k][j]
        t = f"오후 2:{10 + i:02d}"
        body.append(f'<div class="row me"><div class="tm">{t}</div><div class="b">{html.escape(x["user"])}</div></div>')
        parts = []
        tpl = x["bot"]["template"]
        for o in tpl["outputs"]:
            if "simpleText" in o:
                txt = re.sub(r" \(updated_at: [^)]+\)", "", o["simpleText"]["text"])
                parts.append(f'<div class="b">{html.escape(txt)}</div>')
            elif "basicCard" in o:
                c = o["basicCard"]
                btns = "".join(f'<div class="btn">{html.escape(b["label"])}</div>' for b in c.get("buttons", []))
                parts.append(f'<div class="card"><div class="d">{html.escape(c.get("description", ""))}</div>{btns}</div>')
        body.append(f'<div class="row bot"><div class="pf">W</div><div class="col"><div class="nm">WISE FAQ</div>'
                    f'{"".join(parts)}</div><div class="tm">{t}</div></div>')
        if i == len(turns) - 1:
            body.append('<div class="qr">' + "".join(f"<span>{html.escape(q['label'])}</span>"
                                                      for q in tpl.get("quickReplies", [])) + "</div>")
    page = (f"<html><head><meta charset='utf-8'><style>{KCSS % {'h': height}}</style></head><body>"
            "<div class='status'><span>2:20</span><span>▂▄▆  ▮</span></div>"
            "<div class='top'><span class='back'>‹</span><span class='t'>동국대 WISE FAQ</span><span class='ic'>⌕ ≡</span></div>"
            f"<div class='chat'>{''.join(body)}</div>"
            "<div class='input'><span>＋</span><div class='box'>메시지 입력</div><span>☺</span></div></body></html>")
    hp = os.path.join(SRC, f"{name}.html")
    open(hp, "w", encoding="utf-8").write(page)
    png = os.path.join(OUT, f"{name}.png")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--screenshot={png}",
                    f"--window-size=390,{height}", "--force-device-scale-factor=2", "file://" + hp],
                   check=True, capture_output=True, timeout=90)
    print(png)


# ── 터미널 ──
TCSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{background:#fff;font-family:'SF Mono','Menlo',monospace}
.win{width:%(w)dpx;background:#1d1f21;border-radius:10px;overflow:hidden}
.bar{height:30px;background:#2c2f33;display:flex;align-items:center;padding:0 12px;gap:7px}
.dot{width:11px;height:11px;border-radius:50%%}
.t{color:#b9bcc0;font-size:12px;margin-left:10px}
pre{padding:12px 16px;color:#e6e6e6;font-size:%(fs)spx;line-height:1.48;white-space:pre-wrap;word-break:break-all;font-family:'SF Mono','Menlo','Apple SD Gothic Neo',monospace}
.p{color:#7ec699}.ok{color:#8fd67a;font-weight:600}.x{color:#ffffff;font-weight:700;background:#4a4a4a}.cm{color:#8a8f98}.hd{color:#f0f0f0;font-weight:700}
"""


def term(src, name, title, width=900, font=12.5, keep=None):
    lines = open(os.path.join(SRC, "ev", src), encoding="utf-8").read().rstrip("\n").split("\n")
    if keep:
        lines = [l for l in lines if keep(l)]
    out = []
    for l in lines:
        e = html.escape(l)
        if l.startswith("$"):
            e = f'<span class="p">{e}</span>'
        elif l.startswith(("PASS", "O  ")) or " OK " in l or l.startswith("10/10"):
            e = f'<span class="ok">{e}</span>'
        elif l.startswith(("X  ", "FAIL")):
            e = f'<span class="x">{e}</span>'
        elif l.startswith(("정답", "합계", "──", "호실 ")):
            e = f'<span class="hd">{e}</span>'
        out.append(e)
    page = (f"<html><head><meta charset='utf-8'><style>{TCSS % {'w': width, 'fs': font}}</style></head><body>"
            "<div class='win'><div class='bar'><span class='dot' style='background:#8a8f98'></span>"
            "<span class='dot' style='background:#8a8f98'></span><span class='dot' style='background:#8a8f98'></span>"
            f"<span class='t'>{html.escape(title)}</span></div><pre>{chr(10).join(out)}</pre></div></body></html>")
    est = sum(max(1, math.ceil(len(l) * font * 0.62 / (width - 32))) for l in lines)
    return shoot(page, name, width, int(est * font * 1.48 + 80))


# ── 코드 (실제 파일의 줄 그대로, 줄번호 포함) ──
KW_TS = r"\b(const|let|function|export|return|if|else|for|of|import|from|type|interface|new|async|await)\b"
KW_PY = r"\b(def|for|in|if|not|and|or|return|import|assert|elif|else|with|as|None|True|False)\b"


def hl(line, py):
    e = html.escape(line)
    cm = "#" if py else "//"
    idx = e.find(cm)
    tail = ""
    if idx >= 0 and (py or not e[:idx].count("'") % 2):
        e, tail = e[:idx], f'<span class="c">{e[idx:]}</span>'
    e = re.sub(r"(&#x27;[^&]*?&#x27;|&quot;[^&]*?&quot;|`[^`]*`)", r'<span class="s">\1</span>', e)
    e = re.sub(KW_PY if py else KW_TS, r'<span class="k">\1</span>', e)
    return e + tail


CCSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{background:#fff}
.win{width:%(w)dpx;background:#1e1e1e;border-radius:10px;overflow:hidden;font-family:'SF Mono','Menlo','Apple SD Gothic Neo',monospace}
.bar{height:30px;background:#2d2d2d;display:flex;align-items:center;padding:0 14px;color:#c8c8c8;font-size:12px}
table{border-collapse:collapse;margin:8px 0 10px}
td{font-size:%(fs)spx;line-height:1.5;vertical-align:top;white-space:pre-wrap;word-break:break-all}
td.n{color:#6e7681;text-align:right;padding:0 14px 0 14px;user-select:none;width:62px;white-space:nowrap;word-break:normal}
td.l{color:#d4d4d4;padding-right:14px}
.k{color:#c586c0}.s{color:#b5cea8}.c{color:#8a8f98}
"""


def code(path, start, end, name, width=900, font=12.5):
    lines = open(os.path.join(ROOT, path), encoding="utf-8").read().split("\n")[start - 1:end]
    py = path.endswith(".py")
    rows = "".join(f'<tr><td class="n">{start + i}</td><td class="l">{hl(l, py) or " "}</td></tr>' for i, l in enumerate(lines))
    page = (f"<html><head><meta charset='utf-8'><style>{CCSS % {'w': width, 'fs': font}}</style></head><body>"
            f"<div class='win'><div class='bar'>{html.escape(path)}</div><table>{rows}</table></div></body></html>")
    est = sum(max(1, math.ceil(len(l) * font * 0.62 / (width - 80))) for l in lines)
    return shoot(page, name, width, int(est * font * 1.5 + 70))


# ── 수집 좌표로 다시 그린 캠퍼스 (흑백) ──
def campus_plot(name="w5-map-plot", W=900, H=640):
    d = json.load(open(os.path.join(ROOT, "data/kb/지도/places.json"), encoding="utf-8"))
    ps = d["places"]
    lat0 = sum(p["lat"] for p in ps) / len(ps)
    k = math.cos(math.radians(lat0))
    xs = [p["lng"] * k for p in ps]
    ys = [p["lat"] for p in ps]
    pad = 50
    sx = (W - 2 * pad) / (max(xs) - min(xs))
    sy = (H - 2 * pad) / (max(ys) - min(ys))
    s = min(sx, sy)
    ox = (W - s * (max(xs) - min(xs))) / 2
    oy = (H - s * (max(ys) - min(ys))) / 2
    rooms = {p["code"] for p in ps if p["room_count"]}
    items = []
    for p, x, y in zip(ps, xs, ys):
        X = ox + (x - min(xs)) * s
        Y = H - (oy + (y - min(ys)) * s)
        if p["code"] in rooms:
            items.append(f'<circle cx="{X:.1f}" cy="{Y:.1f}" r="15" fill="#262626"/>'
                         f'<text x="{X:.1f}" y="{Y + 4.5:.1f}" font-size="13" font-weight="700" fill="#fff" text-anchor="middle">{p["code"]}</text>')
        elif p["code"]:
            items.append(f'<circle cx="{X:.1f}" cy="{Y:.1f}" r="12" fill="#fff" stroke="#262626" stroke-width="2"/>'
                         f'<text x="{X:.1f}" y="{Y + 4:.1f}" font-size="10" font-weight="700" fill="#262626" text-anchor="middle">{p["code"]}</text>')
        else:
            items.append(f'<circle cx="{X:.1f}" cy="{Y:.1f}" r="5" fill="#a6a6a6"/>')
        if p["code"] in rooms or p["name"] in ("정문", "대운동장"):
            # 옆 건물 이름과 겹치는 곳은 위/아래에 쓴다
            if p["code"] == "E":
                lx, ly, anchor = X, Y - 21, "middle"
            elif p["name"] == "정문":
                lx, ly, anchor = X, Y + 22, "middle"
            elif p["name"] == "대운동장":
                lx, ly, anchor = X - 12, Y + 4, "end"
            else:
                lx, ly, anchor = X + 18, Y + 4, "start"
            items.append(f'<text x="{lx:.1f}" y="{ly:.1f}" font-size="11.5" fill="#333" text-anchor="{anchor}">{html.escape(p["display"])}</text>')
    legend = ('<circle cx="30" cy="22" r="9" fill="#262626"/><text x="46" y="26" font-size="12" fill="#333">강의실 건물 16동 (코드)</text>'
              '<circle cx="210" cy="22" r="8" fill="#fff" stroke="#262626" stroke-width="2"/><text x="226" y="26" font-size="12" fill="#333">코드만 있는 곳 (U · BST · WS)</text>'
              '<circle cx="430" cy="22" r="5" fill="#a6a6a6"/><text x="444" y="26" font-size="12" fill="#333">코드 없는 장소 16곳</text>')
    page = (f"<html><head><meta charset='utf-8'></head><body style='margin:0;background:#fff;font-family:Apple SD Gothic Neo'>"
            f"<svg width='{W}' height='{H}' xmlns='http://www.w3.org/2000/svg'>"
            f"<rect x='1' y='1' width='{W - 2}' height='{H - 2}' fill='#fafafa' stroke='#d9d9d9'/>{legend}{''.join(items)}"
            f"<text x='{W - 12}' y='{H - 12}' font-size='11' fill='#888' text-anchor='end'>places.json 위도·경도 35곳 · 위가 북쪽</text></svg></body></html>")
    return shoot(page, name, W, H)


def gray_crop(src, name, box=None, width=None):
    im = Image.open(os.path.join(SRC, src)).convert("RGB")
    if box:
        im = im.crop(box)
    im = ImageOps.grayscale(im).convert("RGB")
    if width and im.size[0] > width:
        im = im.resize((width, int(im.size[1] * width / im.size[0])), Image.LANCZOS)
    p = os.path.join(OUT, f"{name}.png")
    im.save(p)
    print(p, im.size)


if __name__ == "__main__":
    kakao("w5-kakao-grad", [("grad_tr", 0)])
    kakao("w5-kakao-grad-tr", [("grad_tr", 1)])
    kakao("w5-kakao-map", [("map", 0), ("map", 1)])
    kakao("w5-kakao-map2", [("map2", 1), ("map2", 2)])
    kakao("w5-kakao-club", [("club", 0), ("club2", 0)])

    term("crawl.txt", "w5-term-crawl", "지도 수집 — tools/map-crawl/crawl_campus_map.py", width=760, font=12)
    term("campus.txt", "w5-term-campus", "npm run test:campus-map (주요 항목)", width=900, font=12.5,
         keep=lambda l: l.startswith("$") or any(k in l for k in ("287", "좌표", "층수를", "D901", "R201", "기숙사", "추측", "PASS test")))
    term("grad.txt", "w5-term-grad", "npm run test:grad-criteria", width=820, font=11.5,
         keep=lambda l: not l.startswith("PASS  \"") and "학과명 해석" not in l)
    term("eval_before.txt", "w5-term-eval-before", "수정 전 (임베딩만)", width=640, font=11.5)
    term("heldout_before.txt", "w5-term-heldout", "새 질문 20문항 — 1회 측정 (틀린 줄만)", width=760, font=12.5,
         keep=lambda l: l.startswith(("$", "X", "정답")))
    term("all.txt", "w5-term-all", "전체 테스트 · 평가", width=760, font=12.5)

    code("src/services/roomCode.ts", 178, 190, "w5-code-floor", width=1080, font=13)
    code("src/services/clubKeywords.ts", 52, 70, "w5-code-kw", width=820, font=12.5)
    code("data/kb/동아리/_keywords.json", 1, 16, "w5-code-kwjson", width=820, font=12)
    code("src/services/askService.ts", 172, 186, "w5-code-hybrid", width=820, font=12.5)
    code("tools/map-crawl/crawl_campus_map.py", 165, 182, "w5-code-match", width=900, font=12)
    code("src/services/gradCriteria.ts", 188, 203, "w5-code-find", width=760, font=12.5)

    campus_plot()
    gray_crop("web861_full.png", "w5-web-861", box=(40, 420, 1240, 1480), width=1200)
    gray_crop("webmap_full.png", "w5-web-map", width=1400)
