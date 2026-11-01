"""졸업자격 실험보고서 docx 서식 — 동국대 WISE 컴퓨터공학과 2026 양식(붙임2 졸업논문보고서 양식_2026_스타일적용.hwp) 기준.

양식에서 읽은 값: 본문 함초롬바탕 10pt · 줄간격 160% · 첫 줄 들여쓰기 10pt · 문단 뒤 5pt,
여백 좌우 30mm · 위아래 20mm (머리말 · 꼬리말 12mm), 참고문헌 한양신명조 11pt 내어쓰기 15pt,
표지 한양신명조 15pt. 장 「1. 서론」 · 절 「1.1」 · 소절 「1.1.1」, 그림 · 표 번호는 장별 「[그림 3-1]」 「[표 5-1]」,
표 제목은 표 위 · 그림 제목은 그림 아래, 쪽 번호는 서론부터 1.
(장 · 절 글자 크기는 양식 파일에서 읽히지 않아 장 16pt · 절 13pt · 소절 11pt 굵게로 둔다 — 최종본은 한글 양식에 옮겨 스타일 적용)

본문 표기:
  **굵게** · [[노란 표시]] · ⟦cite:키⟧ → [번호] (처음 나온 순서) · ⟦그림:키⟧ ⟦표:키⟧ → [그림 3-1] (2회 빌드로 확정)
"""
import re

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK, WD_COLOR_INDEX, WD_LINE_SPACING
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Mm, Pt, RGBColor

BODY = '함초롬바탕'
HEAD = '한양신명조'
BODY_PT = 10
INK = RGBColor(0, 0, 0)
TOKEN = re.compile(r'⟦(cite|그림|표):([^⟧]+)⟧')


def set_font(target, name=BODY, size=None, bold=None):
    font = target.font
    font.name = name
    rpr = target._element.get_or_add_rPr()
    rfonts = rpr.find(qn('w:rFonts'))
    if rfonts is None:
        rfonts = OxmlElement('w:rFonts')
        rpr.insert(0, rfonts)
    for attr in ('w:asciiTheme', 'w:hAnsiTheme', 'w:eastAsiaTheme', 'w:cstheme'):
        if rfonts.get(qn(attr)) is not None:
            del rfonts.attrib[qn(attr)]
    for attr in ('w:ascii', 'w:hAnsi', 'w:eastAsia', 'w:cs'):
        rfonts.set(qn(attr), name)
    if size is not None:
        font.size = Pt(size)
    if bold is not None:
        font.bold = bold
    font.color.rgb = INK


def add_field(paragraph, instr, placeholder=''):
    run = paragraph.add_run()
    b = OxmlElement('w:fldChar'); b.set(qn('w:fldCharType'), 'begin')
    t = OxmlElement('w:instrText'); t.set(qn('xml:space'), 'preserve'); t.text = f' {instr} '
    s = OxmlElement('w:fldChar'); s.set(qn('w:fldCharType'), 'separate')
    run._r.append(b); run._r.append(t); run._r.append(s)
    if placeholder:
        paragraph.add_run(placeholder)
    e = OxmlElement('w:fldChar'); e.set(qn('w:fldCharType'), 'end')
    paragraph.add_run()._r.append(e)
    return run


def shade(cell, hex_fill):
    tcpr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear'); shd.set(qn('w:color'), 'auto'); shd.set(qn('w:fill'), hex_fill)
    tcpr.append(shd)


def page_numbers(section, fmt='decimal', start=1, show=True):
    sp = section._sectPr
    for old in sp.findall(qn('w:pgNumType')):
        sp.remove(old)
    pg = OxmlElement('w:pgNumType'); pg.set(qn('w:fmt'), fmt); pg.set(qn('w:start'), str(start))
    sp.append(pg)
    footer = section.footer
    footer.is_linked_to_previous = False
    p = footer.paragraphs[0] if footer.paragraphs else footer.add_paragraph()
    for r in list(p.runs):
        r._r.getparent().remove(r._r)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    if show:
        add_field(p, 'PAGE', '1')
        for r in p.runs:
            set_font(r, size=9)


class Thesis:
    """labels · cites 는 1차 빌드에서 모은 값을 2차 빌드에 넘겨 앞쪽 참조 번호까지 확정한다."""

    def __init__(self, labels=None, cite_order=None):
        self.doc = Document()
        self.chapter = '0'
        self.counts = {'그림': 0, '표': 0}
        self.labels_in = labels or {}
        self.labels_out = {}
        self.cite_in = cite_order or []
        self.cite_out = []
        self.missing = set()
        self._setup()

    # ── 서식 ──
    def _setup(self):
        d = self.doc
        sec = d.sections[0]
        sec.page_width, sec.page_height = Mm(210), Mm(297)
        sec.top_margin, sec.bottom_margin = Mm(32), Mm(32)
        sec.left_margin, sec.right_margin = Mm(30), Mm(30)
        sec.header_distance, sec.footer_distance = Mm(20), Mm(20)

        normal = d.styles['Normal']
        set_font(normal, size=BODY_PT)
        pf = normal.paragraph_format
        pf.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
        pf.line_spacing = 1.6
        pf.space_before = Pt(0)
        pf.space_after = Pt(0)
        pf.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        ppr = normal.element.get_or_add_pPr()
        wb = OxmlElement('w:wordWrap'); wb.set(qn('w:val'), '1'); ppr.append(wb)

        for name, size, before, after in (('Heading 1', 16, 0, 18), ('Heading 2', 13, 14, 6), ('Heading 3', 11, 10, 4)):
            st = d.styles[name]
            set_font(st, name=HEAD, size=size, bold=True)
            st.font.italic = False
            f = st.paragraph_format
            f.space_before, f.space_after = Pt(before), Pt(after)
            f.alignment = WD_ALIGN_PARAGRAPH.LEFT
            f.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
            f.line_spacing = 1.3
            f.keep_with_next = True
            f.first_line_indent = Pt(0)
            if name == 'Heading 1':
                f.page_break_before = True  # 새 장은 새 쪽에서

        for name, size, font, bold, align in (
            ('표제목', 10, BODY, True, WD_ALIGN_PARAGRAPH.CENTER),
            ('그림제목', 10, BODY, False, WD_ALIGN_PARAGRAPH.CENTER),
            ('표내용', 9, BODY, False, WD_ALIGN_PARAGRAPH.LEFT),
            ('목차제목', 16, HEAD, True, WD_ALIGN_PARAGRAPH.CENTER),
            ('참고문헌리스트', 11, HEAD, False, WD_ALIGN_PARAGRAPH.JUSTIFY),
        ):
            st = d.styles.add_style(name, 1)
            st.base_style = normal
            set_font(st, name=font, size=size, bold=bold)
            f = st.paragraph_format
            f.alignment = align
            f.first_line_indent = Pt(0)
            f.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
            f.line_spacing = 1.3 if name in ('표내용', '표제목', '그림제목') else 1.6
        d.styles['표제목'].paragraph_format.space_before = Pt(8)
        d.styles['표제목'].paragraph_format.space_after = Pt(4)
        d.styles['표제목'].paragraph_format.keep_with_next = True
        d.styles['그림제목'].paragraph_format.space_after = Pt(10)
        d.styles['목차제목'].paragraph_format.space_after = Pt(24)
        rl = d.styles['참고문헌리스트'].paragraph_format
        rl.left_indent, rl.first_line_indent = Pt(15), Pt(-15)
        rl.space_before, rl.space_after = Pt(5), Pt(5)

        upd = OxmlElement('w:updateFields'); upd.set(qn('w:val'), 'true')
        d.settings.element.append(upd)

    # ── 참조 · 인용 ──
    def _resolve(self, text):
        def sub(m):
            kind, key = m.group(1), m.group(2)
            if kind == 'cite':
                nums = []
                for k in [x.strip() for x in key.split(',')]:
                    if k not in self.cite_out:
                        self.cite_out.append(k)
                    order = self.cite_in or self.cite_out
                    nums.append(order.index(k) + 1 if k in order else 0)
                return ''.join(f'[{n}]' for n in nums)
            num = self.labels_in.get(key)
            if not num:
                self.missing.add(key)
                return f'[{kind} ?]'
            return f'[{kind} {num}]'
        return TOKEN.sub(sub, text)

    def _runs(self, p, text, size=None, font=None):
        text = self._resolve(text)
        for part in re.split(r'(\*\*.+?\*\*|\[\[.+?\]\])', text):
            if not part:
                continue
            if part.startswith('**'):
                r = p.add_run(part[2:-2]); r.bold = True
            elif part.startswith('[['):
                r = p.add_run('[' + part[2:-2] + ']'); r.font.highlight_color = WD_COLOR_INDEX.YELLOW
            else:
                r = p.add_run(part)
            if size:
                r.font.size = Pt(size)
            if font:
                set_font(r, name=font)
        return p

    def _number(self, kind, label):
        self.counts[kind] += 1
        num = f'{self.chapter}-{self.counts[kind]}'
        if label:
            self.labels_out[label] = num
        return num

    # ── 블록 ──
    def p(self, text, indent=True):
        para = self.doc.add_paragraph()
        para.paragraph_format.first_line_indent = Pt(10) if indent else Pt(0)
        para.paragraph_format.space_after = Pt(5)
        return self._runs(para, text)

    def bullets(self, items, mark='•'):
        for it in items:
            para = self.doc.add_paragraph()
            pf = para.paragraph_format
            pf.left_indent = Pt(BODY_PT * 2)
            pf.first_line_indent = Pt(-BODY_PT)
            pf.space_after = Pt(2)
            self._runs(para, f'{mark} {it}')
        self.doc.paragraphs[-1].paragraph_format.space_after = Pt(6)

    def numbered(self, items):
        for i, it in enumerate(items, 1):
            para = self.doc.add_paragraph()
            pf = para.paragraph_format
            pf.left_indent = Pt(BODY_PT * 2)
            pf.first_line_indent = Pt(-BODY_PT * 1.4)
            pf.space_after = Pt(2)
            self._runs(para, f'({i}) {it}')
        self.doc.paragraphs[-1].paragraph_format.space_after = Pt(6)

    def code(self, lines):
        """의사코드 — 고정폭 글꼴, 회색 바탕 1칸 표"""
        t = self.doc.add_table(rows=1, cols=1)
        t.style = 'Table Grid'
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        cell = t.cell(0, 0)
        cell.width = Cm(14.5)
        shade(cell, 'F2F2F2')
        cell.paragraphs[0].style = self.doc.styles['표내용']
        for i, ln in enumerate(lines):
            para = cell.paragraphs[0] if i == 0 else cell.add_paragraph(style='표내용')
            r = para.add_run(ln)
            set_font(r, name='D2Coding', size=8.5)
            r.font.name = 'Menlo'
        self.doc.add_paragraph().paragraph_format.space_after = Pt(4)

    def h1(self, n, title):
        self.chapter = str(n) if n else ('A' if title.startswith('부') else '0')
        self.counts = {'그림': 0, '표': 0}
        return self.doc.add_paragraph(f'{n}. {title}' if n else title, style='Heading 1')

    def h2(self, num, title):
        return self.doc.add_paragraph(f'{num} {title}', style='Heading 2')

    def h3(self, num, title):
        return self.doc.add_paragraph(f'{num} {title}', style='Heading 3')

    def table(self, caption, header, rows, widths, note=None, size=9, label=None):
        num = self._number('표', label)
        self._runs(self.doc.add_paragraph(style='표제목'), f'[표 {num}] {caption}')
        t = self.doc.add_table(rows=1 + len(rows), cols=len(header))
        t.style = 'Table Grid'
        t.alignment = WD_TABLE_ALIGNMENT.CENTER
        for r_i, row in enumerate([header] + rows):
            for c_i, val in enumerate(row):
                cell = t.cell(r_i, c_i)
                cell.width = Cm(widths[c_i])
                cell.paragraphs[0].style = self.doc.styles['표내용']
                self._runs(cell.paragraphs[0], str(val), size=size)
                if r_i == 0:
                    shade(cell, 'E7E6E6')
                    cell.paragraphs[0].alignment = WD_ALIGN_PARAGRAPH.CENTER
                    for r in cell.paragraphs[0].runs:
                        r.bold = True
        trpr = t.rows[0]._tr.get_or_add_trPr()
        h = OxmlElement('w:tblHeader'); h.set(qn('w:val'), 'true'); trpr.append(h)
        if note:
            np_ = self.doc.add_paragraph(style='표내용')
            self._runs(np_, note, size=8.5)
            np_.paragraph_format.space_before = Pt(3)
        self.doc.add_paragraph().paragraph_format.space_after = Pt(2)
        return t

    def figure(self, caption, path, width_cm, label=None):
        num = self._number('그림', label)
        para = self.doc.add_paragraph()
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        para.paragraph_format.first_line_indent = Pt(0)
        para.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
        para.paragraph_format.space_before = Pt(6)
        para.paragraph_format.keep_with_next = True
        para.add_run().add_picture(str(path), width=Cm(width_cm))
        self._runs(self.doc.add_paragraph(style='그림제목'), f'[그림 {num}] {caption}')

    def figures_row(self, caption, paths, width_cm, label=None):
        num = self._number('그림', label)
        para = self.doc.add_paragraph()
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        para.paragraph_format.first_line_indent = Pt(0)
        para.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
        para.paragraph_format.keep_with_next = True
        for i, pth in enumerate(paths):
            if i:
                para.add_run('   ')
            para.add_run().add_picture(str(pth), width=Cm(width_cm))
        self._runs(self.doc.add_paragraph(style='그림제목'), f'[그림 {num}] {caption}')

    def page_break(self):
        self.doc.add_paragraph().add_run().add_break(WD_BREAK.PAGE)

    def new_section(self, fmt, start=1, show=True):
        sec = self.doc.add_section(WD_SECTION.NEW_PAGE)
        page_numbers(sec, fmt, start, show)
        return sec

    def centered(self, text, size, bold=False, before=0, after=0, font=HEAD):
        para = self.doc.add_paragraph()
        para.alignment = WD_ALIGN_PARAGRAPH.CENTER
        pf = para.paragraph_format
        pf.first_line_indent = Pt(0)
        pf.line_spacing_rule = WD_LINE_SPACING.MULTIPLE
        pf.line_spacing = 1.25
        pf.space_before, pf.space_after = Pt(before), Pt(after)
        self._runs(para, text, size=size, font=font)
        for r in para.runs:
            r.bold = bold
        return para

    def toc(self, title, instr):
        self.doc.add_paragraph(title, style='목차제목')
        para = self.doc.add_paragraph()
        para.paragraph_format.first_line_indent = Pt(0)
        add_field(para, instr, '(Word로 열 때 「필드 업데이트」에서 예를 누르면 채워집니다)')

    def references(self, refs):
        """⟦cite⟧ 가 처음 나온 순서대로 참고문헌을 쓴다. 본문에서 인용하지 않은 항목은 넣지 않는다."""
        order = self.cite_in or self.cite_out
        for i, key in enumerate(order, 1):
            para = self.doc.add_paragraph(style='참고문헌리스트')
            self._runs(para, f'[{i}] {refs[key]}')
        return [k for k in refs if k not in order]

    def save(self, path):
        self.doc.save(str(path))
