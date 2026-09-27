"""공지 알림 구독 화면 — 실제 /api/kakao/skill 응답(kakao_responses_sub.json)으로 카톡 화면을 그린다."""
import html, json, os, subprocess

S = "/private/tmp/claude-501/-Users-kyoungjaewon/6d824425-fad8-41cb-a24d-717467884ebe/scratchpad"
OUT = os.environ.get("W4_IMG") or os.path.join(os.path.dirname(os.path.abspath(__file__)), "img")
R = json.load(open(os.path.join(S, "kakao_responses_sub.json")))
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{width:390px;height:844px;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;background:#BACEE0;overflow:hidden;display:flex;flex-direction:column}
.status{height:44px;background:#BACEE0;display:flex;justify-content:space-between;align-items:center;padding:0 24px;font-size:15px;font-weight:600;color:#111}
.top{height:52px;display:flex;align-items:center;padding:0 14px;gap:10px;background:#BACEE0;border-bottom:1px solid rgba(0,0,0,.05)}
.top .back{font-size:24px;color:#222}.top .t{font-size:17px;font-weight:700;color:#111;flex:1}.top .ic{font-size:16px;color:#333;letter-spacing:10px}
.chat{flex:1;overflow:hidden;display:flex;flex-direction:column;justify-content:flex-end;padding:8px 10px 10px}
.chat>*{flex:none}
.bot .tm{align-self:flex-end}
.row{display:flex;margin:6px 0;align-items:flex-end;gap:6px}
.me{justify-content:flex-end}
.bot{align-items:flex-start}
.pf{width:38px;height:38px;border-radius:14px;background:#fff;display:flex;align-items:center;justify-content:center;font-weight:800;color:#333;font-size:14px;flex:none;border:1px solid #d5dde6}
.col{display:flex;flex-direction:column;gap:5px;max-width:262px;min-width:0}
.nm{font-size:12px;color:#4a4a4a;margin-left:2px}
.b{background:#fff;border-radius:4px 16px 16px 16px;padding:9px 11px;font-size:13.5px;line-height:1.42;color:#111;white-space:pre-wrap;word-break:keep-all;overflow-wrap:anywhere}
.me .b{background:#FEE500;border-radius:16px 4px 16px 16px;max-width:240px}
.tm{font-size:10px;color:#5b6b7a;flex:none;margin-bottom:2px}
.card{background:#fff;border-radius:4px 16px 16px 16px;width:250px;overflow:hidden}
.card .d{padding:11px 12px;font-size:13px;line-height:1.45;white-space:pre-wrap;color:#111}
.card .btn{border-top:1px solid #eee;text-align:center;padding:10px;font-size:13.5px;color:#111;font-weight:600}
.qr{display:flex;gap:6px;overflow:hidden;white-space:nowrap;padding:8px 0 2px 44px}
.qr span{background:#fff;border:1px solid #d9d9d9;border-radius:16px;padding:6px 12px;font-size:12.5px;color:#222;flex:none}
.input{height:56px;background:#fff;display:flex;align-items:center;padding:0 12px;gap:10px;color:#aaa;font-size:14px}
.input .box{flex:1;height:36px;border-radius:18px;background:#f3f3f3;display:flex;align-items:center;padding:0 14px}
"""


def bot_html(resp, show_qr, t):
    tpl = resp["template"]
    parts = []
    for o in tpl["outputs"]:
        if "simpleText" in o:
            parts.append(f'<div class="b">{html.escape(o["simpleText"]["text"])}</div>')
        elif "basicCard" in o:
            c = o["basicCard"]
            btns = "".join(f'<div class="btn">{html.escape(b["label"])}</div>' for b in c.get("buttons", []))
            parts.append(f'<div class="card"><div class="d">{html.escape(c.get("description", ""))}</div>{btns}</div>')
    row = (f'<div class="row bot"><div class="pf">W</div><div class="col"><div class="nm">WISE FAQ</div>'
           f'{"".join(parts)}</div><div class="tm">{t}</div></div>')
    if show_qr:
        row += '<div class="qr">' + "".join(f"<span>{html.escape(q['label'])}</span>" for q in tpl.get("quickReplies", [])) + "</div>"
    return row


def me_html(text, t):
    return f'<div class="row me"><div class="tm">{t}</div><div class="b">{html.escape(text)}</div></div>'


def screen(name, turns):
    body = []
    n = len(turns)
    for i, (k, j, with_user) in enumerate(turns):
        x = R[k][j]
        t = f"오후 3:{12 + i:02d}"
        if with_user:
            body.append(me_html(x["user"], t))
        body.append(bot_html(x["bot"], i == n - 1, t))
    page = (f"<html><head><meta charset='utf-8'><style>{CSS}</style></head><body>"
            "<div class='status'><span>3:20</span><span>▂▄▆  ▮</span></div>"
            "<div class='top'><span class='back'>‹</span><span class='t'>동국대 WISE FAQ</span><span class='ic'>⌕ ≡</span></div>"
            f"<div class='chat'>{''.join(body)}</div>"
            "<div class='input'><span>＋</span><div class='box'>메시지 입력</div><span>☺</span></div></body></html>")
    hp = os.path.join(OUT, f"kakao_{name}.html")
    open(hp, "w").write(page)
    png = os.path.join(OUT, f"kakao_{name}.png")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--screenshot={png}",
                    "--window-size=390,844", "--force-device-scale-factor=2", "file://" + hp],
                   check=True, capture_output=True, timeout=60)
    print(png)



screen("notice_sub", [("sub", 0, True), ("sub", 1, True)])
screen("notice_banner", [("banner", 0, True), ("banner", 1, True)])
