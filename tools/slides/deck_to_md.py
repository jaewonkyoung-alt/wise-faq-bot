"""발표 덱(pptx)의 글자 · 표를 마크다운으로 — python3 deck_to_md.py <덱.pptx> <출력.md> [제목]

슬라이드마다 제목을 소제목으로, 글상자는 위→아래 · 왼→오른 순서로, 표는 마크다운 표로 옮긴다.
그림(화면 캡처)은 옮기지 않고 장수만 적는다 — 원본은 slides/ 의 pptx.
"""
import re
import sys
from pathlib import Path

from pptx import Presentation
from pptx.enum.dml import MSO_COLOR_TYPE, MSO_FILL

PAGE = re.compile(r'^\s*\d+\s*/\s*\d+\s*$')


MARK = {'완료': '■', '진행 중': '▨', '예정': '□'}


def fill_key(fill):
    try:
        if fill.type != MSO_FILL.SOLID:
            return None
        fc = fill.fore_color
        return str(fc.rgb) if fc.type == MSO_COLOR_TYPE.RGB else None
    except Exception:
        return None


def legend(items) -> dict:
    """간트차트 범례 — 글자 없는 색 상자 바로 오른쪽의 글자(완료 · 진행 중 · 예정)를 그 색의 뜻으로 본다."""
    labels = [s for s in items if s.has_text_frame and s.text_frame.text.strip()]
    out = {}
    for box in items:
        if not hasattr(box, 'fill') or box.has_text_frame and box.text_frame.text.strip() or box.width > 600000:
            continue
        k = fill_key(box.fill)
        if not k:
            continue
        for lb in labels:
            if abs(lb.top - box.top) < 150000 and 0 <= lb.left - box.left < 700000:
                out[k] = lb.text_frame.text.strip()
    return out


def cell(t: str) -> str:
    t = t.replace('|', '\\|').replace('<', '&lt;').replace('>', '&gt;').strip()
    return t.replace('\n', '<br>') or ' '


def esc(t: str) -> str:
    return t.replace('<', '&lt;').replace('>', '&gt;').replace('](', ']\\(')


def table_md(tbl, colors=None) -> list[str]:
    colors = colors or {}

    def val(c):
        t = cell(c.text)
        lab = colors.get(fill_key(c.fill))
        if t.strip() or not lab:
            return t
        return MARK.get(lab, lab)

    rows = [[val(c) for c in r.cells] for r in tbl.rows]
    if not rows:
        return []
    out = ['| ' + ' | '.join(rows[0]) + ' |', '|' + '---|' * len(rows[0])]
    out += ['| ' + ' | '.join(r) + ' |' for r in rows[1:]]
    return out + ['']


def frame_md(tf) -> list[str]:
    out = []
    for para in tf.paragraphs:
        t = ''.join(r.text for r in para.runs).strip().lstrip('•·').strip()
        if not t:
            continue
        out.append(('  ' * para.level) + '- ' + esc(t) if para.level or len(tf.paragraphs) > 1 else esc(t))
    return out


def shapes(container):
    for sh in container.shapes:
        if sh.shape_type == 6:  # 그룹
            yield from shapes(sh)
        else:
            yield sh


def convert(deck: Path, out: Path, title: str | None, intro: list[str] | None = None) -> None:
    prs = Presentation(deck)
    half = prs.slide_width / 2
    lines = [f'# {title or deck.stem}', ''] + (intro if intro is not None else
             [f'> 발표 덱 `{deck.name}` 의 글자와 표를 옮긴 것입니다. 화면 캡처는 원본 pptx 에 있습니다.', ''])
    for i, slide in enumerate(prs.slides, 1):
        items = [sh for sh in shapes(slide) if sh.top is not None]
        texts = [sh for sh in items if sh.has_text_frame and sh.text_frame.text.strip() and not PAGE.match(sh.text_frame.text)]
        if not texts and not any(getattr(sh, 'has_table', False) and sh.has_table for sh in items):
            continue
        # 제목: 가장 위에 있는 글상자
        head = min(texts, key=lambda s: (s.top, s.left)) if texts else None
        heading = head.text_frame.text.strip().replace('\n', ' · ') if head else f'슬라이드 {i}'
        lines += [f'## {esc(heading)}', '']
        rest = [sh for sh in items if sh is not head]
        colors = legend(items) if any(getattr(sh, 'has_table', False) and sh.has_table for sh in items) else {}
        legend_words = set(colors.values())
        # 읽는 순서: 왼쪽 단 먼저(위→아래), 그다음 오른쪽 단 — 폭이 반을 넘는 상자는 왼쪽 단으로 본다
        rest.sort(key=lambda s: (0 if s.left < half * 0.9 or s.width > half else 1, s.top, s.left))
        pics = 0
        for sh in rest:
            if getattr(sh, 'has_table', False) and sh.has_table:
                lines += table_md(sh.table, colors)
            elif sh.has_text_frame and sh.text_frame.text.strip() in legend_words:
                continue
            elif sh.has_text_frame and sh.text_frame.text.strip() and not PAGE.match(sh.text_frame.text):
                lines += frame_md(sh.text_frame) + ['']
            elif sh.shape_type == 13:
                pics += 1
        if colors:
            lines += ['범례: ' + ' · '.join(f'{MARK.get(v, v)} {v}' for v in colors.values()), '']
        if pics:
            lines += [f'<sub>(화면 캡처 {pics}장)</sub>', '']
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text('\n'.join(lines).rstrip() + '\n', encoding='utf-8')
    print(f'saved {out} · {len(prs.slides)}장')


if __name__ == '__main__':
    convert(Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3] if len(sys.argv) > 3 else None)
