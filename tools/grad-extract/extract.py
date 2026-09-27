"""졸업기준 PDF → 병합 셀을 채운 2D 그리드.

표가 선(line)과 얇은 사각형으로 그려져 있어 pdfplumber 표 인식이 실패한다.
그래서 선분 좌표로 직접 셀을 복원한다: 점 (x,y)의 셀 = 그 y를 지나는 좌우 세로선,
그 x를 지나는 위아래 가로선. 칸 구분선이 빠진 곳은 자연히 병합 셀이 된다.
"""
import json
import re
import sys

import pdfplumber

TOL = 1.2
HEAD_RE = re.compile(r'^▣')


def load_edges(page, y0, y1):
    H, V = [], []
    for e in page.edges:
        if e['top'] < y0 - 2 or e['bottom'] > y1 + 2:
            continue
        if e['orientation'] == 'h' and e['x1'] - e['x0'] >= 6:
            H.append((e['x0'], e['x1'], (e['top'] + e['bottom']) / 2))
        elif e['orientation'] == 'v' and e['bottom'] - e['top'] >= 4:
            V.append(((e['x0'] + e['x1']) / 2, e['top'], e['bottom']))
    return H, V


def cell_at(x, y, H, V, bbox):
    L, T, R, B = bbox
    lefts = [vx for vx, t, b in V if vx < x - TOL and t - TOL <= y <= b + TOL]
    rights = [vx for vx, t, b in V if vx > x + TOL and t - TOL <= y <= b + TOL]
    tops = [hy for x0, x1, hy in H if hy < y - TOL and x0 - TOL <= x <= x1 + TOL]
    bots = [hy for x0, x1, hy in H if hy > y + TOL and x0 - TOL <= x <= x1 + TOL]
    return (max(lefts, default=L), max(tops, default=T), min(rights, default=R), min(bots, default=B))


def text_in(cell, words):
    l, t, r, b = cell
    ws = [w for w in words if l <= (w['x0'] + w['x1']) / 2 <= r and t <= (w['top'] + w['bottom']) / 2 <= b]
    if not ws:
        return ''
    ws.sort(key=lambda w: (round(w['top'] / 3), w['x0']))
    lines, cur, cy = [], [], None
    for w in ws:
        if cy is None or abs(w['top'] - cy) > 3:
            if cur:
                lines.append(cur)
            cur, cy = [w], w['top']
        else:
            cur.append(w)
    lines.append(cur)
    parts = [' '.join(x['text'] for x in ln) for ln in lines]
    joiner = '' if all(len(p) <= 1 for p in parts) else ' '
    return re.sub(r'\s+', ' ', joiner.join(parts)).strip()


def cluster(vals, tol=1.5):
    out = []
    for v in sorted(vals):
        if not out or v - out[-1] > tol:
            out.append(v)
    return out


def grid(page, bbox, words):
    L, T, R, B = bbox
    H, V = load_edges(page, T, B)
    H = [h for h in H if h[1] > L + 2 and h[0] < R - 2]
    V = [v for v in V if L - 2 <= v[0] <= R + 2]
    xs = cluster([L, R] + [v[0] for v in V])
    ys = cluster([T, B] + [h[2] for h in H])
    rows = []
    for i in range(len(ys) - 1):
        if ys[i + 1] - ys[i] < 3:
            continue
        ym = (ys[i] + ys[i + 1]) / 2
        row = []
        for j in range(len(xs) - 1):
            if xs[j + 1] - xs[j] < 3:
                continue
            xm = (xs[j] + xs[j + 1]) / 2
            c = cell_at(xm, ym, H, V, bbox)
            row.append({'t': text_in(c, words), 'cell': [round(v, 1) for v in c], 'x': [round(xs[j], 1), round(xs[j + 1], 1)]})
        rows.append({'y': [round(ys[i], 1), round(ys[i + 1], 1)], 'cells': row})
    return rows


def lines_of(words):
    words = sorted(words, key=lambda w: (w['top'], w['x0']))
    lines, cur, cy = [], [], None
    for w in words:
        if cy is None or abs(w['top'] - cy) > 3:
            if cur:
                lines.append(cur)
            cur, cy = [w], w['top']
        else:
            cur.append(w)
    if cur:
        lines.append(cur)
    return [{'top': min(w['top'] for w in ln), 'bottom': max(w['bottom'] for w in ln),
             'x0': min(w['x0'] for w in ln), 'text': ' '.join(w['text'] for w in sorted(ln, key=lambda w: w['x0']))}
            for ln in lines]


def table_bbox(page, y0, y1):
    H, V = load_edges(page, y0, y1)
    H = [h for h in H if h[1] - h[0] > 40]
    if len(H) < 2:
        return None
    L = min(h[0] for h in H)
    R = max(h[1] for h in H)
    T = min(h[2] for h in H)
    B = max(h[2] for h in H)
    return (L, T, R, B)


def extract(path):
    out = {'title': '', 'blocks': []}
    with pdfplumber.open(path) as pdf:
        cur = None
        for pno, page in enumerate(pdf.pages):
            words = page.extract_words(x_tolerance=1.5, y_tolerance=2, keep_blank_chars=False)
            words = [w for w in words if w['top'] < page.height - 55]  # 쪽 바닥글 제외
            lns = lines_of(words)
            if pno == 0 and lns:
                out['title'] = lns[0]['text']
            heads = [ln for ln in lns if HEAD_RE.match(ln['text'])]
            # 쪽 시작 ~ 첫 머리글 사이에 표가 있으면 앞 쪽 블록의 연속
            bounds = [(None, 40)] + [(h['text'], h['bottom']) for h in heads]
            for k, (name, ystart) in enumerate(bounds):
                yend = heads[k]['top'] if k < len(heads) else page.height - 55
                if name is None:
                    yend = heads[0]['top'] if heads else page.height - 55
                bb = table_bbox(page, ystart, yend)
                region_lines = [ln for ln in lns if ystart <= ln['top'] < yend and not HEAD_RE.match(ln['text'])]
                if name is None:
                    if bb and cur is not None:
                        cur['grids'].append({'page': pno + 1, 'rows': grid(page, bb, words)})
                        cur['notes'] += [ln['text'] for ln in region_lines if ln['top'] > bb[3] + 1]
                    else:
                        tgt = cur if cur is not None else out
                        tgt.setdefault('notes', [])
                        tgt['notes'] += [ln['text'] for ln in region_lines]
                    continue
                cur = {'head': name, 'page': pno + 1, 'grids': [], 'notes': [], 'pre': []}
                out['blocks'].append(cur)
                if bb:
                    cur['pre'] = [ln['text'] for ln in region_lines if ln['top'] < bb[1] - 1]
                    cur['grids'].append({'page': pno + 1, 'rows': grid(page, bb, words)})
                    cur['notes'] = [ln['text'] for ln in region_lines if ln['top'] > bb[3] + 1]
                else:
                    cur['notes'] = [ln['text'] for ln in region_lines]
    return out


if __name__ == '__main__':
    print(json.dumps(extract(sys.argv[1]), ensure_ascii=False, indent=1))
