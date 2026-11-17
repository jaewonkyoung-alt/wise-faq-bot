"""졸업자격 실험보고서를 GitHub용 마크다운으로 — python3 build_markdown.py [출력.md]

build_thesis.build() 를 그대로 다시 돌리되 문단 · 표 · 그림을 docx 대신 마크다운으로 적는다.
표 · 그림 번호, 인용 번호, 조사(은/는)까지 docx 와 같게 나온다.
표지 · 인준(서명란) · 목차는 넣지 않는다 — 인준 쪽은 서명이 들어가는 자리라 공개 저장소에 두지 않는다.
"""
import os
import re
import sys
from pathlib import Path

import build_thesis as bt
from docx_lib import Thesis

ROOT = bt.ROOT
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'docs/report/졸업자격실험보고서.md'


class _Ignored:
    """표지용 문단처럼 마크다운에 쓰지 않는 블록이 돌려주는 자리 — 속성 · 메서드 호출을 모두 받아 넘긴다."""

    def __getattr__(self, name):
        return self

    def __setattr__(self, name, value):
        pass

    def __call__(self, *a, **k):
        return self

    def __iter__(self):
        return iter(())


IGNORED = _Ignored()


def _cell(text: str) -> str:
    return text.replace('|', '\\|').replace('\n', '<br>')


def _plain(text: str) -> str:
    # [[기입 예정]] 은 docx 에서 노란 표시였던 자리 — 마크다운에선 대괄호만 남긴다
    return re.sub(r'\[\[(.+?)\]\]', r'[\1]', text)


class MarkdownThesis(Thesis):
    def __init__(self, out: Path, labels=None, cite_order=None):
        super().__init__(labels, cite_order)
        self.out = out
        self.lines: list[str] = []
        self.body = False  # 서론(첫 장) 전까지는 표지 · 인준 · 목차
        self.images: set[Path] = set()

    # ── 공통 ──
    def _text(self, text: str) -> str:
        # 본문의 <script> · <공개 주소> 같은 글자가 GitHub 에서 태그로 먹히지 않게 한다
        # 「[표 3-1](요약)」 처럼 번호 뒤에 괄호가 붙으면 링크로 읽히므로 괄호를 이스케이프한다
        return _plain(self._resolve(text)).replace('<', '&lt;').replace('>', '&gt;').replace('](', ']\\(')

    def _emit(self, *lines: str) -> None:
        if self.body:
            self.lines.extend(lines)

    def _img(self, path: Path, width_cm: float) -> str:
        self.images.add(Path(path))
        rel = os.path.relpath(path, self.out.parent)
        return f'<img src="{rel}" width="{round(width_cm * 40)}">'

    # 표지 · 인준 · 목차(centered · toc · page_break · new_section)는 부모 그대로 안 보이는 docx 에만 쓰고 마크다운엔 넣지 않는다

    # ── 제목 ──
    def h1(self, n, title):
        self.chapter = str(n) if n else ('A' if title.startswith('부') else '0')
        self.counts = {'그림': 0, '표': 0}
        self.body = True
        self._emit(f'## {n}. {title}' if n else f'## {title}', '')
        return IGNORED

    def h2(self, num, title):
        self._emit(f'### {num} {title}', '')
        return IGNORED

    def h3(self, num, title):
        self._emit(f'#### {num} {title}', '')
        return IGNORED

    # ── 본문 ──
    def p(self, text, indent=True):
        self._emit(self._text(text), '')

    def bullets(self, items, mark='•'):
        self._emit(*[f'- {self._text(it)}' for it in items], '')

    def numbered(self, items):
        self._emit(*[f'{i}. {self._text(it)}' for i, it in enumerate(items, 1)], '')

    def code(self, lines):
        self._emit('```text', *lines, '```', '')

    def table(self, caption, header, rows, widths, note=None, size=9, label=None, left_cols=()):
        num = self._number('표', label)
        out = [f'**[표 {num}] {self._text(caption)}**', '',
               '| ' + ' | '.join(_cell(self._text(str(h))) for h in header) + ' |',
               '|' + '---|' * len(header)]
        for row in rows:
            out.append('| ' + ' | '.join(_cell(self._text(str(v))) for v in row) + ' |')
        out.append('')
        if note:
            out += [f'<sub>{_cell(self._text(note))}</sub>', '']
        self._emit(*out)

    def figure(self, caption, path, width_cm, label=None):
        num = self._number('그림', label)
        self._emit(f'<p align="center">{self._img(path, width_cm)}</p>', '',
                   f'<p align="center"><b>[그림 {num}]</b> {self._text(caption)}</p>', '')

    def figures_row(self, caption, paths, width_cm, label=None):
        num = self._number('그림', label)
        imgs = ' '.join(self._img(pth, width_cm) for pth in paths)
        self._emit(f'<p align="center">{imgs}</p>', '',
                   f'<p align="center"><b>[그림 {num}]</b> {self._text(caption)}</p>', '')

    def references(self, refs):
        order = self.cite_in or self.cite_out
        self._emit(*[f'{i}. {_plain(refs[key])}' for i, key in enumerate(order, 1)], '')
        return [k for k in refs if k not in order]

    def save(self, path=None):
        path = Path(path or self.out)
        head = [
            f'# {bt.TITLE.replace(chr(10), " ")}',
            '',
            f'**— {bt.SUBTITLE} —**',
            '',
            f'*{bt.TITLE_EN}*',
            '',
            f'동국대학교 WISE캠퍼스 컴퓨터공학과 졸업자격실험보고서 (2026) · {bt.NAME} · 지도교수 {bt.ADVISOR}',
            '',
            '> 2026-11-13 학과에 제출한 보고서(v12)의 본문을 그대로 옮긴 것입니다. 표지 · 인준(서명) 쪽 · 목차는 뺐습니다.',
            '> 다시 만들기: `python3 tools/thesis/build_markdown.py` (docx 는 `build_thesis.py`)',
            '',
            '## 목차',
            '',
        ]
        for ln in self.lines:
            m = re.match(r'^(##|###) (.+)$', ln)
            if m:
                title = m.group(2)
                anchor = re.sub(r'[^\w\- ]', '', title.lower()).strip().replace(' ', '-')
                head.append(f'{"  " if m.group(1) == "###" else ""}- [{title}](#{anchor})')
        head.append('')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text('\n'.join(head + self.lines).rstrip() + '\n', encoding='utf-8')


def main() -> None:
    first = Thesis()
    bt.build(first)
    final = MarkdownThesis(OUT, labels=first.labels_out, cite_order=first.cite_out)
    bt.build(final)
    if final.missing:
        print('찾지 못한 그림 · 표 이름:', sorted(final.missing))
    missing_img = [p for p in final.images if not p.exists()]
    if missing_img:
        print('없는 그림 파일:', missing_img)
    final.save()
    print(f'saved {OUT} · 표 · 그림 이름 {len(final.labels_out)} · 참고문헌 {len(final.cite_out)} · 그림 파일 {len(final.images)}')


if __name__ == '__main__':
    main()
