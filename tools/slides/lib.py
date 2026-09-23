"""Shared helpers — matches confirmed week-2/3 deck layout (13.33x7.5, 맑은 고딕, black/white/gray)."""
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.shapes import MSO_SHAPE, MSO_CONNECTOR
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.dml import MSO_LINE
from pptx.oxml.ns import qn
from lxml import etree

FONT = "맑은 고딕"
NAVY = "262626"
NAVY2 = "A6A6A6"
LIGHT = "F2F2F2"
LIGHT2 = "FAFAFA"
DARK = "1A1A1A"
BODY = "333333"
GRAY = "555555"
MUTED = "888888"
WHITE = "FFFFFF"
LINE = "D9D9D9"


def rgb(h):
    return RGBColor.from_string(h)


class Deck:
    def __init__(self):
        self.prs = Presentation()
        self.prs.slide_width = Inches(13.333)
        self.prs.slide_height = Inches(7.5)
        self.pagenums = []

    def _pagenum(self, s):
        tb = s.shapes.add_textbox(Inches(11.6), Inches(0.18), Inches(1.4), Inches(0.35))
        self.pagenums.append(tb)

    def blank(self):
        s = self.prs.slides.add_slide(self.prs.slide_layouts[6])
        self._pagenum(s)
        return s

    def slide(self, title):
        s = self.blank()
        text(s, 0.55, 0.28, 11.0, 0.5, title, size=24, bold=True, color=DARK)
        rect(s, 0.55, 0.82, 12.2, 0.03, fill=NAVY)
        return s

    def save(self, path):
        n = len(self.prs.slides)
        for i, tb in enumerate(self.pagenums, 1):
            _fill_tf(tb.text_frame, [f"{i} / {n}"], 11, False, GRAY, PP_ALIGN.RIGHT)
        self.prs.save(path)


def _fill_tf(tf, lines, size, bold, color, align, spacing=None):
    tf.word_wrap = True
    for i, ln in enumerate(lines):
        opts = {}
        if isinstance(ln, tuple):
            ln, opts = ln
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = opts.get("align", align)
        if spacing:
            p.space_after = Pt(spacing)
        r = p.add_run()
        r.text = ln
        f = r.font
        f.name = FONT
        f.size = Pt(opts.get("size", size))
        f.bold = opts.get("bold", bold)
        f.color.rgb = rgb(opts.get("color", color))
        rpr = r._r.get_or_add_rPr()
        ea = etree.SubElement(rpr, qn("a:ea"))
        ea.set("typeface", FONT)


def text(s, x, y, w, h, lines, size=16, bold=False, color=BODY, align=PP_ALIGN.LEFT,
         anchor=MSO_ANCHOR.TOP, spacing=None, margin=None):
    if isinstance(lines, str):
        lines = [lines]
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.vertical_anchor = anchor
    if margin is not None:
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = Inches(margin)
    _fill_tf(tf, lines, size, bold, color, align, spacing)
    return tb


def bullets(s, x, y, w, h, items, size=16, gap=True, color=BODY):
    """Items prefixed with '·  ' like confirmed decks; blank line between items when gap."""
    lines = []
    for i, it in enumerate(items):
        if isinstance(it, tuple):
            lines.append(("·  " + it[0], it[1]))
        elif it.startswith("  "):
            lines.append(("      " + it.strip(), {"size": size - 2, "color": GRAY}))
        else:
            lines.append("·  " + it)
    return text(s, x, y, w, h, lines, size=size, color=color, spacing=10 if gap else 2)


def rect(s, x, y, w, h, fill=None, line=None, shape=MSO_SHAPE.RECTANGLE, lw=1.0,
         label=None, size=12, bold=False, color=DARK, dash=False, align=PP_ALIGN.CENTER):
    sh = s.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    if fill:
        sh.fill.solid()
        sh.fill.fore_color.rgb = rgb(fill)
    else:
        sh.fill.background()
    if line:
        sh.line.color.rgb = rgb(line)
        sh.line.width = Pt(lw)
        if dash:
            sh.line.dash_style = MSO_LINE.DASH
    else:
        sh.line.fill.background()
    sh.shadow.inherit = False
    if label is not None:
        tf = sh.text_frame
        tf.margin_left = tf.margin_right = Inches(0.05)
        tf.margin_top = tf.margin_bottom = Inches(0.02)
        tf.vertical_anchor = MSO_ANCHOR.MIDDLE
        _fill_tf(tf, label if isinstance(label, list) else [label], size, bold, color, align)
    return sh


def box(s, x, y, w, h, label, fill=LIGHT, line=NAVY, size=12, bold=False, color=DARK, **kw):
    return rect(s, x, y, w, h, fill=fill, line=line, shape=MSO_SHAPE.ROUNDED_RECTANGLE,
                label=label, size=size, bold=bold, color=color, **kw)


def oval(s, x, y, w, h, label, size=11, fill=WHITE, line=NAVY):
    return rect(s, x, y, w, h, fill=fill, line=line, shape=MSO_SHAPE.OVAL, label=label, size=size)


def arrow(s, x1, y1, x2, y2, color=NAVY, dash=False, head=True, lw=1.25, both=False):
    c = s.shapes.add_connector(MSO_CONNECTOR.STRAIGHT, Inches(x1), Inches(y1), Inches(x2), Inches(y2))
    c.line.color.rgb = rgb(color)
    c.line.width = Pt(lw)
    if dash:
        c.line.dash_style = MSO_LINE.DASH
    ln = c.line._get_or_add_ln()
    if both:
        h = etree.SubElement(ln, qn("a:headEnd"))
        h.set("type", "triangle")
    if head:
        t = etree.SubElement(ln, qn("a:tailEnd"))
        t.set("type", "triangle")
    return c


def label(s, x, y, w, h, t, size=10, color=GRAY, align=PP_ALIGN.CENTER, bold=False):
    return text(s, x, y, w, h, t, size=size, color=color, align=align, bold=bold, margin=0)


def actor(s, cx, top, name, size=11):
    """UML stick figure centred at cx."""
    rect(s, cx - 0.14, top, 0.28, 0.28, fill=WHITE, line=NAVY, shape=MSO_SHAPE.OVAL, lw=1.5)
    arrow(s, cx, top + 0.28, cx, top + 0.72, head=False, lw=1.5)
    arrow(s, cx - 0.28, top + 0.42, cx + 0.28, top + 0.42, head=False, lw=1.5)
    arrow(s, cx, top + 0.72, cx - 0.22, top + 1.0, head=False, lw=1.5)
    arrow(s, cx, top + 0.72, cx + 0.22, top + 1.0, head=False, lw=1.5)
    label(s, cx - 0.8, top + 1.05, 1.6, 0.3, name, size=size, color=DARK, bold=True)


def table(s, x, y, w, cols, rows, size=11, header_size=None, row_h=0.36, first_col_bold=False):
    """cols: list of relative widths. rows[0] is header."""
    nr, nc = len(rows), len(cols)
    shp = s.shapes.add_table(nr, nc, Inches(x), Inches(y), Inches(w), Inches(row_h * nr))
    tbl = shp.table
    tot = sum(cols)
    for j, cw in enumerate(cols):
        tbl.columns[j].width = Inches(w * cw / tot)
    for i, row in enumerate(rows):
        tbl.rows[i].height = Inches(row_h)
        for j, val in enumerate(row):
            cell = tbl.cell(i, j)
            cell.margin_left = cell.margin_right = Inches(0.06)
            cell.margin_top = cell.margin_bottom = Inches(0.03)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            cell.fill.solid()
            if i == 0:
                cell.fill.fore_color.rgb = rgb(NAVY)
                _fill_tf(cell.text_frame, [str(val)], header_size or size, True, WHITE, PP_ALIGN.CENTER)
            else:
                cell.fill.fore_color.rgb = rgb(WHITE if i % 2 else LIGHT2)
                _fill_tf(cell.text_frame, str(val).split("\n"), size,
                         first_col_bold and j == 0, BODY, PP_ALIGN.LEFT)
    return shp
