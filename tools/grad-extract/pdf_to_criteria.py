"""학과별 졸업기준 PDF → 서버 criteria 행 (criteria.json 과 같은 형식).

관리자 웹의 'PDF 올리기'가 서버에서 이 스크립트를 실행한다. 엑셀을 거치지 않고
build_xlsx.py 의 '졸업기준_요약' 집계 · export_json.py 의 문자열 변환과 같은 규칙으로 행을 만든다.

    .venv/bin/python pdf_to_criteria.py a.pdf [b.pdf ...] --departments ../../data/graduation-source/departments.json
    -> stdout JSON: {"files": [{file, title, department, dept_no, matched_by, rows, warnings, error}]}

    .venv/bin/python pdf_to_criteria.py --selftest <학과별 PDF 폴더>   # 원본 42개로 criteria.json 과 같은지 확인
"""
import argparse
import collections
import glob
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from extract import extract  # noqa: E402
from normalize import criteria  # noqa: E402

MIN_YEAR = 2021
P84 = '외국인편입생 이수기준표(P.84) 참조'
COLS = ['인성및자기계발', '인성', '의사소통', '교양외국어', '디지털', '학문기초', '융합교양', '외국인공통기초',
        '단수전공', '주전공', '복수전공', '취득학점', '평점평균', '사회봉사', '외국어졸업요건', '외국어시험', '졸업논문·시험']
EN = {
    '인성및자기계발': 'personality_self', '인성': 'personality', '의사소통': 'communication',
    '교양외국어': 'liberal_foreign', '디지털': 'digital', '학문기초': 'academic_basic',
    '융합교양': 'convergence', '외국인공통기초': 'foreign_common', '단수전공': 'major_single',
    '주전공': 'major_primary', '복수전공': 'major_double', '취득학점': 'total_credits',
    '평점평균': 'gpa', '사회봉사': 'volunteer', '외국어졸업요건': 'lang_requirement',
    '외국어시험': 'lang_test', '졸업논문·시험': 'thesis', '비고': 'notes',
}
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))


# ── build_xlsx.py 와 같은 규칙 ──
def canon(item, cat):
    it = item.replace('*', '').strip()
    if it.startswith('졸업논문') or it == '졸업시험':
        return '졸업논문·시험'
    if it == '외국어' and cat.startswith('교양'):
        return '교양외국어'
    return {'인성 및 자기계발': '인성및자기계발', '인성(공통)': '인성', '외국어능력 졸업요건': '외국어졸업요건',
            '외국인 공통기초': '외국인공통기초', '단수전공 이수자': '단수전공'}.get(it, it)


def num(v):
    s = str(v).strip()
    if re.fullmatch(r'-?\d+', s):
        return int(s)
    if re.fullmatch(r'-?\d+\.\d+', s):
        return float(s)
    return s


# ── export_json.py 와 같은 문자열 변환 ──
def text(v, col=None):
    if v is None or v == '':
        return None
    if col == '평점평균' and isinstance(v, (int, float)):
        return f'{float(v):.1f}'
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def key_of(s):
    return re.sub(r'[\s·ㆍ‧・()（）,]', '', s or '')


def identify(data, path, departments):
    """첫 쪽 앞부분 글자에서 학과명 · 홈페이지 표기 · 별칭을 찾는다 (가장 긴 일치)."""
    head = ' '.join([data.get('title', '')] + [b['head'] for b in data['blocks'][:2]] +
                    [os.path.basename(path)])
    hk = key_of(head)
    best = None
    for d in departments:
        for cand, how in [(d['homepage_name'], '홈페이지 표기'), (d['name'], '학과명')] + [(a, '별칭') for a in d['aliases']]:
            k = key_of(cand)
            if len(k) >= 3 and k in hk and (best is None or len(k) > best[0]):
                best = (len(k), d, how)
    return (best[1], best[2]) if best else (None, None)


def has_programs(data):
    """한 학번 구간 · 학생구분에 소속이 둘 이상이면 과정(예과/본과)별 표 — 과정 이름으로 행을 나눈다."""
    seen = collections.defaultdict(set)
    for r in criteria(None, data):
        if r['소속']:
            seen[(r['입학년도'], r['학생구분'])].add(r['소속'])
    return any(len(v) > 1 for v in seen.values())


def rows_for(data, dept_name, dept_no, prog):
    recs = criteria(None, data)
    wide = collections.OrderedDict()
    for r in recs:
        if r['끝'] < MIN_YEAR:
            continue
        program = r['소속'] if prog else ''
        key = (program, r['입학년도'], r['시작'], r['끝'], r['학생구분'])
        w = wide.setdefault(key, {'소속': r['소속'], '쪽': r['쪽'], 'vals': collections.defaultdict(list),
                                  'notes': collections.defaultdict(list)})
        it = canon(r['항목'], r['대분류'])
        v = r['값']
        if P84.split('(')[0].replace(' ', '') in v.replace(' ', ''):
            v = P84
        w['vals'][it].append(v)
        if r['비고']:
            w['notes'][it].append(r['비고'])

    def cell_val(w, col):
        if col == '외국어시험':
            return ' / '.join(w['notes'].get('외국어졸업요건', []))
        vs = w['vals'].get(col, [])
        if not vs:
            return None
        if len(set(vs)) == 1 and len(vs) > 1 and col != '외국어졸업요건':
            vs = vs[:1]
        return num(vs[0]) if len(vs) == 1 else ' / '.join(vs)

    def note_text(w):
        parts = []
        for it, ns in w['notes'].items():
            ns = [n for n in ns if not (it == '사회봉사' and n == '시간') and it != '외국어졸업요건']
            if ns:
                parts.append(f"{it}: {' / '.join(dict.fromkeys(ns))}")
        for k in [k for k in w['vals'] if k not in COLS]:
            parts.append(f"{k}: {' / '.join(w['vals'][k])}")
        return '; '.join(parts)

    out = []
    for (program, label, a, b, sec), w in wide.items():
        row = {'dept_no': dept_no, 'department': dept_name, 'program': program or '', 'year_label': str(label),
               'year_from': int(a), 'year_to': int(b), 'student_type': sec, 'affiliation': w['소속'] or None,
               'source_page': int(w['쪽']) if w['쪽'] is not None else None}
        for c in COLS:
            row[EN[c]] = text(cell_val(w, c), c)
        row['notes'] = text(note_text(w), '비고')
        out.append(row)
    return out


def warnings_for(rows, data):
    warn = []
    if not any('기준표' in b['head'] for b in data['blocks']):
        warn.append('졸업기준표를 찾지 못했습니다 — 학과별 졸업기준 PDF가 맞는지 확인하세요.')
    for r in rows:
        if r['student_type'] is None:
            warn.append(f"{r['year_label']}: 학생구분(신입/편입)을 읽지 못한 행이 있습니다.")
        if r['student_type'] and r['student_type'].startswith('신입생') and not r['total_credits']:
            warn.append(f"{r['year_label']} {r['student_type']}: 졸업학점을 읽지 못했습니다.")
    return list(dict.fromkeys(warn))


def convert(paths, departments):
    files = []
    for p in paths:
        item = {'file': os.path.basename(p), 'title': None, 'department': None, 'dept_no': None,
                'matched_by': None, 'rows': [], 'warnings': [], 'error': None}
        try:
            data = extract(p)
            item['title'] = data.get('title')
            d, how = identify(data, p, departments)
            if d is None:
                item['error'] = '어느 학과의 PDF인지 찾지 못했습니다 (첫 쪽 제목: ' + (data.get('title') or '없음') + ')'
            else:
                item.update(department=d['name'], dept_no=d['no'], matched_by=how)
                item['rows'] = rows_for(data, d['name'], d['no'], has_programs(data))
                item['warnings'] = warnings_for(item['rows'], data)
                if not item['rows']:
                    item['error'] = '2021학번 이후 졸업기준 행을 하나도 읽지 못했습니다.'
        except Exception as e:  # PDF가 깨졌거나 양식이 다른 경우
            item['error'] = f'PDF를 읽지 못했습니다: {type(e).__name__}: {e}'
        files.append(item)
    return {'files': files}


def selftest(folder, departments):
    """원본 42개 PDF로 만든 행이 지금 DB 원본(criteria.json)과 같은지."""
    want = json.load(open(os.path.join(ROOT, 'data/graduation-source/criteria.json'), encoding='utf-8'))['rows']
    got = []
    res = convert(sorted(glob.glob(os.path.join(folder, '*.pdf'))), departments)
    errs = [f"{f['file']}: {f['error']}" for f in res['files'] if f['error']]
    for f in res['files']:
        got += f['rows']
    k = lambda r: (r['dept_no'], r['program'], r['year_from'], r['year_to'], r['student_type'])
    W, G = {k(r): r for r in want}, {k(r): r for r in got}
    diff = []
    for key in sorted(set(W) | set(G), key=str):
        if key not in G:
            diff.append(f'빠짐 {key}')
        elif key not in W:
            diff.append(f'추가 {key}')
        else:
            for col, v in W[key].items():
                if G[key].get(col) != v:
                    diff.append(f'{key} {col}: 기대={v!r} 실제={G[key].get(col)!r}')
    print(json.dumps({'files': len(res['files']), 'errors': errs, 'rows_expected': len(want), 'rows_got': len(got),
                      'differences': len(diff), 'sample': diff[:15]}, ensure_ascii=False, indent=1))
    return 0 if not errs and not diff else 1


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdfs', nargs='*')
    ap.add_argument('--departments', default=os.path.join(ROOT, 'data/graduation-source/departments.json'))
    ap.add_argument('--selftest')
    a = ap.parse_args()
    departments = json.load(open(a.departments, encoding='utf-8'))['rows']
    if a.selftest:
        return selftest(a.selftest, departments)
    json.dump(convert(a.pdfs, departments), sys.stdout, ensure_ascii=False)
    return 0


if __name__ == '__main__':
    sys.exit(main())
