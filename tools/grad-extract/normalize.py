"""out/NN.json(셀 그리드) → 정규화 레코드."""
import csv
import json
import re

BASE = '/Volumes/SSD 2TB/동국대학교/4학년2학기/컴퓨터공학종합설계2/졸업요건_원본PDF'
YEAR_RE = re.compile(r'^(20\d\d)(?:\s*[~\-]\s*(20\d\d))?$')
TYPE_ORDER = ['신입생(내국인)', '편입생(내국인)', '신입생(외국인)', '편입생(외국인)',
              '신입생(내국인·외국인)', '편입생(내국인·외국인)', '복수전공자']


def load_meta():
    rows = list(csv.DictReader(open(f'{BASE}/manifest.csv', encoding='utf-8-sig')))
    return {r['번호']: r for r in rows if r['구분'] == '학과별'}


def norm_type(t):
    t = re.sub(r'[\s*]', '', t).replace('ㆍ', '·')
    return t


def norm_section(t, prev):
    if '신입' not in t and '편입' not in t:
        return prev
    kind = '신입생' if '신입' in t else '편입생'
    t2 = t.replace('ㆍ', '·')
    if '내·외' in t2 or '내,외' in t2:
        nat = '내·외국인'
    elif '외' in t2:
        nat = '외국인'
    else:
        nat = '내국인'
    return f'{kind}-{nat}'


def year_span(label):
    m = YEAR_RE.match(label.strip())
    if not m:
        return None
    a = int(m.group(1))
    b = int(m.group(2) or a)
    return a, b


def dedupe(seq):
    out = []
    for s in seq:
        if s and (not out or out[-1] != s):
            out.append(s)
    return out


def criteria(no, data):
    """기준표 → [{과정, 입학년도, 시작, 끝, 소속, 학생구분, 대분류, 세부, 항목, 값, 비고, 쪽}]"""
    recs = []
    for b in data['blocks']:
        if '기준표' not in b['head']:
            continue
        section = None
        years = None
        for g in b['grids']:
            rows = g['rows']
            hdr = next((r for r in rows if r['cells'][0]['t'] == '입학년도'), None)
            if hdr:
                ycols = {}
                for j, c in enumerate(hdr['cells']):
                    if year_span(c['t']) and c['t'] not in ycols:
                        ycols[c['t']] = j
                bcol = next((j for j, c in enumerate(hdr['cells']) if c['t'] == '비고'), None)
                first = min(ycols.values())
                years = (ycols, bcol, first)
            ycols, bcol, first = years
            sosok_row = next((r for r in rows if any(c['t'] == '소속' for c in r['cells'][:first])), None)
            sosok = {y: sosok_row['cells'][j]['t'] for y, j in ycols.items()} if sosok_row else {}
            for r in rows:
                cs = r['cells']
                if cs[0]['t'] == '입학년도' or r is sosok_row:
                    continue
                section = norm_section(cs[0]['t'], section)
                labels = dedupe([c['t'] for c in cs[1:first]])
                if not labels:
                    continue
                item = labels[-1]
                cat = labels[0] if len(labels) > 1 else ''
                mid = ' > '.join(labels[1:-1])
                note = cs[bcol]['t'] if bcol is not None and bcol < len(cs) else ''
                for y, j in ycols.items():
                    a, z = year_span(y)
                    recs.append(dict(과정=sosok.get(y, ''), 입학년도=y, 시작=a, 끝=z, 소속=sosok.get(y, ''),
                                     학생구분=section, 대분류=cat, 세부=mid, 항목=item,
                                     값=cs[j]['t'] if j < len(cs) else '', 비고=note, 쪽=g['page']))
    return recs


def _grid_table(b):
    """헤더('구분'으로 시작하는 행)를 찾아 열 이름을 붙인 데이터 행 목록."""
    names = None
    out = []
    for g in b['grids']:
        for r in g['rows']:
            cs = r['cells']
            if cs[0]['t'] == '구분':
                names = [c['t'] for c in cs]
                continue
            if names is None:
                continue
            out.append((g['page'], names, cs))
    return out


def thesis(no, data):
    recs = []
    for b in data['blocks']:
        h = b['head'].replace('▣', '').strip()
        if '기준표' in h or '필수' in h or '기타' in h or not b['grids']:
            continue
        for page, names, cs in _grid_table(b):
            types = {norm_type(n): j for j, n in enumerate(names) if ('신입' in n or '편입' in n or '복수' in n)}
            tcols = set(types.values())
            bcol = next((j for j, n in enumerate(names) if n == '비고'), None)
            lab = [j for j in range(len(cs)) if j not in tcols and j != bcol and names[j] != '해당 여부']
            gubun = cs[lab[0]]['t'] if lab else ''
            details = dedupe([cs[j]['t'] for j in lab[1:]])
            if not gubun and not details:
                continue
            for d in (details or ['']):
                rec = dict(표=h, 구분=gubun, 세부기준=d, 비고=cs[bcol]['t'] if bcol is not None else '', 쪽=page)
                for t, j in types.items():
                    rec[t] = cs[j]['t']
                recs.append(rec)
    return recs


def required(no, data):
    recs = []
    for b in data['blocks']:
        if '필수' not in b['head'] or not b['grids']:
            continue
        for page, names, cs in _grid_table(b):
            idx = {n: j for j, n in reversed(list(enumerate(names)))}
            rec = dict(구분=cs[idx['구분']]['t'], 세부구분=cs[idx.get('세부구분', 1)]['t'],
                       학수번호=cs[idx['학수번호']]['t'] if '학수번호' in idx else '',
                       교과목명=cs[idx['교과목명']]['t'] if '교과목명' in idx else '',
                       비고=cs[idx['비고']]['t'] if '비고' in idx else '', 쪽=page)
            for j, n in enumerate(names):
                if '신입' in n or '편입' in n or '복수' in n:
                    rec[norm_type(n)] = cs[j]['t']
            recs.append(rec)
    return recs


MARK = re.compile(r'^(\*+|○|※|[가-하]\.|-|\d+\)|\d+\.|▶|ㆍ|·)')


def notes(no, data):
    out = []
    for b in [data] + data['blocks']:
        lines = b.get('notes', [])
        where = b.get('head', '(머리)').replace('▣', '').strip()
        sent = []
        for ln in lines:
            ln = ln.strip()
            if not ln or re.match(r'^\d+\.\s*(기타사항|졸업기준)$', ln):
                continue
            if MARK.match(ln) or not sent:
                sent.append(ln)
            else:
                sent[-1] += ('' if sent[-1].endswith((' ', '(')) else ' ') + ln
        out += [dict(위치=where, 내용=s) for s in sent]
    return out


if __name__ == '__main__':
    import collections
    meta = load_meta()
    items = collections.Counter()
    for no in sorted(meta):
        d = json.load(open(f'out/{no}.json'))
        for r in criteria(no, d):
            items[(r['대분류'], r['항목'])] += 1
    for k, v in sorted(items.items()):
        print(v, k)
