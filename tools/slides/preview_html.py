"""PPTX -> 슬라이드별 PNG 미리보기 (PowerPoint 없이 레이아웃 점검용).
python-pptx 로 도형 위치·크기·글자·표·그림을 읽어 HTML로 같은 자리에 그리고 Chrome으로 찍는다.
글자가 상자를 넘치면 빨간 테두리로 표시한다 (점검 표시일 뿐 실제 슬라이드에는 없음).

  python3 tools/slides/preview_html.py deck.pptx out_dir
"""
import base64
import html
import os
import subprocess
import sys

from pptx import Presentation
from pptx.util import Emu

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PX = 96  # 1 inch


def inch(v):
    return Emu(v).inches * PX


def color_of(fill):
    try:
        if fill.type == 1:
            return "#" + str(fill.fore_color.rgb)
    except Exception:
        pass
    return "transparent"


def runs_html(tf, default_size=16):
    out = []
    for p in tf.paragraphs:
        align = {1: "left", 2: "center", 3: "right"}.get(int(p.alignment) if p.alignment else 1, "left")
        spans = []
        size = default_size
        for r in p.runs:
            f = r.font
            size = f.size.pt if f.size else default_size
            col = "#" + str(f.color.rgb) if f.color and f.color.type is not None else "#000"
            spans.append(f'<span style="font-size:{size}pt;font-weight:{700 if f.bold else 400};color:{col}">'
                         f"{html.escape(r.text) or '&nbsp;'}</span>")
        sa = p.space_after.pt if p.space_after is not None else 0
        out.append(f'<div style="text-align:{align};margin-bottom:{sa}pt;line-height:1.2;min-height:{size * 1.2}pt">{"".join(spans) or "&nbsp;"}</div>')
    return "".join(out)


def shape_html(sh):
    x, y, w, h = inch(sh.left), inch(sh.top), inch(sh.width), inch(sh.height)
    base = f"position:absolute;left:{x:.1f}px;top:{y:.1f}px;width:{w:.1f}px;height:{h:.1f}px;"
    if sh.shape_type == 13:  # picture
        b64 = base64.b64encode(sh.image.blob).decode()
        return f'<img style="{base}" src="data:{sh.image.content_type};base64,{b64}">'
    if sh.has_table:
        rows = []
        for r in sh.table.rows:
            cells = []
            for c in r.cells:
                cells.append(f'<td style="background:{color_of(c.fill)};height:{inch(r.height):.1f}px;'
                             f'border:1px solid #d9d9d9;padding:2px 5px;vertical-align:middle">{runs_html(c.text_frame, 11)}</td>')
            rows.append("<tr>" + "".join(cells) + "</tr>")
        cols = "".join(f'<col style="width:{inch(c.width):.1f}px">' for c in sh.table.columns)
        return (f'<div class="chk" style="{base}height:auto"><table style="border-collapse:collapse;table-layout:fixed;width:{w:.1f}px">'
                f"{cols}{''.join(rows)}</table></div>")
    if sh.shape_type == 9 or getattr(sh, "begin_x", None) is not None:  # line / connector
        try:
            x1, y1, x2, y2 = inch(sh.begin_x), inch(sh.begin_y), inch(sh.end_x), inch(sh.end_y)
            return (f'<svg style="position:absolute;left:0;top:0;overflow:visible" width="1" height="1">'
                    f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="#262626" stroke-width="1.5"/></svg>')
        except Exception:
            return ""
    fill = "transparent"
    border = "none"
    radius = 0
    try:
        fill = color_of(sh.fill)
        if sh.line.fill.type == 1:
            border = f"1px solid #{sh.line.color.rgb}"
    except Exception:
        pass
    try:
        if sh.auto_shape_type is not None and "ROUNDED" in str(sh.auto_shape_type):
            radius = 8
    except Exception:
        pass
    inner = ""
    valign = "flex-start"
    if sh.has_text_frame and sh.text_frame.text.strip():
        tf = sh.text_frame
        va = tf.vertical_anchor
        valign = {3: "center", 4: "flex-end"}.get(int(va) if va else 1, "flex-start")
        if not sh.shape_type == 17:  # autoshape labels default centred
            pass
        ml = inch(tf.margin_left) if tf.margin_left is not None else 9.6
        mt = inch(tf.margin_top) if tf.margin_top is not None else 4.8
        inner = f'<div class="tx" style="padding:{mt:.1f}px {ml:.1f}px;width:100%;box-sizing:border-box">{runs_html(tf)}</div>'
    return (f'<div class="chk" style="{base}background:{fill};border:{border};border-radius:{radius}px;'
            f'display:flex;flex-direction:column;justify-content:{valign};overflow:visible;box-sizing:border-box">{inner}</div>')


JS = """
<script>
document.querySelectorAll('.chk').forEach(function(el){
  var tx = el.querySelector('.tx') || el.firstElementChild; if(!tx) return;
  var over = tx.scrollHeight > el.clientHeight + 6 || el.scrollWidth > el.clientWidth + 6;
  var r = el.getBoundingClientRect();
  if (r.bottom > 720 + 2 || r.right > 1280 + 2) over = true;
  if (over) { el.style.outline = '3px solid red'; document.body.dataset.over = (+(document.body.dataset.over||0)) + 1; }
});
document.title = 'over=' + (document.body.dataset.over || 0);
</script>"""


def main():
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    prs = Presentation(src)
    W, H = inch(prs.slide_width), inch(prs.slide_height)
    for i, s in enumerate(prs.slides, 1):
        body = "".join(shape_html(sh) for sh in s.shapes)
        page = (f"<html><head><meta charset='utf-8'><style>body{{margin:0;width:{W:.0f}px;height:{H:.0f}px;position:relative;"
                f"background:#fff;font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;overflow:hidden}}</style></head>"
                f"<body>{body}{JS}</body></html>")
        hp = os.path.join(out, f"s{i:02d}.html")
        open(hp, "w", encoding="utf-8").write(page)
        png = os.path.join(out, f"s{i:02d}.png")
        subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--screenshot={png}",
                        f"--window-size={W:.0f},{H:.0f}", "--virtual-time-budget=1500", "file://" + hp],
                       check=True, capture_output=True, timeout=90)
    print(out, len(prs.slides))


if __name__ == "__main__":
    main()
