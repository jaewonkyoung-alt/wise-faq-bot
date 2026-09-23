"""Render captured command output as a terminal-window PNG (for slide evidence)."""
import html, os, subprocess, sys

S = "/private/tmp/claude-501/-Users-kyoungjaewon/6d824425-fad8-41cb-a24d-717467884ebe/scratchpad"
OUT = os.path.join(S, "deck", "img")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{background:#fff;font-family:'SF Mono','Menlo',monospace}
.win{width:%(w)dpx;background:#1d1f21;border-radius:10px;overflow:hidden}
.bar{height:32px;background:#2c2f33;display:flex;align-items:center;padding:0 12px;gap:7px}
.dot{width:11px;height:11px;border-radius:50%%}
.t{color:#b9bcc0;font-size:12px;margin-left:10px}
pre{padding:14px 16px;color:#e6e6e6;font-size:%(fs)spx;line-height:1.5;white-space:pre-wrap;word-break:break-all}
.p{color:#7ec699}
.ok{color:#8fd67a;font-weight:600}
.cm{color:#8a8f98}
"""


def colorize(line):
    e = html.escape(line)
    if line.startswith("$"):
        return f'<span class="p">{e}</span>'
    if line.startswith("PASS") or " PASS " in line or line.startswith("(오류 없음)"):
        return f'<span class="ok">{e}</span>'
    if line.strip().startswith("#"):
        return f'<span class="cm">{e}</span>'
    return e


def render(src, name, width=920, font=12.5):
    lines = open(os.path.join(S, src)).read().rstrip("\n").split("\n")
    body = "\n".join(colorize(l) for l in lines)
    page = (f"<html><head><meta charset='utf-8'><style>{CSS % {'w': width, 'fs': font}}</style></head><body>"
            "<div class='win'><div class='bar'>"
            "<span class='dot' style='background:#ff5f57'></span>"
            "<span class='dot' style='background:#febc2e'></span>"
            "<span class='dot' style='background:#28c840'></span>"
            f"<span class='t'>{name}</span></div>"
            f"<pre>{body}</pre></div></body></html>")
    hp = os.path.join(OUT, f"term_{name.replace(' ', '_')}.html")
    open(hp, "w").write(page)
    # estimate height: wrapped lines * line-height + chrome
    est = sum(max(1, (len(l) * font * 0.56) // (width - 32) + 1) for l in lines)
    h = int(est * font * 1.5 + 60)
    png = os.path.join(OUT, f"term_{name.replace(' ', '_')}.png")
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    f"--screenshot={png}", f"--window-size={width},{h}",
                    "--force-device-scale-factor=2", "--virtual-time-budget=2000",
                    "file://" + hp], check=True, capture_output=True, timeout=60)
    print(png, f"{width}x{h}")


if __name__ == "__main__":
    render("evidence_tests.txt", "tests")
    render("evidence_api.txt", "api")
    render("evidence_git.txt", "git")
