"""졸업요건 엑셀 → 서버가 읽는 JSON 3종.

    python3 tools/grad-extract/export_json.py

- criteria.json    : 졸업기준_요약 시트 (학과 × 학번 구간 × 학생구분 한 줄) — DB 적재 원본
- departments.json : 학과목록 시트 (대표명 · 별칭 · 문의전화 · 원본 PDF URL)
- answer-key.json  : 학번별_신입생 시트 (21~26학번 한 줄씩) — 챗봇 답변 자동 비교용 정답표

값은 원문 표기를 살리기 위해 모두 문자열로 저장한다 ("57+모듈1", "2.0", "-").
"""
import json
import os
import sys

from openpyxl import load_workbook

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'data', 'graduation-source')
XLSX = os.path.join(SRC, '2021212843_경재원_졸업요건_학과별_정리.xlsx')

COLS = {
    '인성및자기계발': 'personality_self', '인성': 'personality', '의사소통': 'communication',
    '교양외국어': 'liberal_foreign', '디지털': 'digital', '학문기초': 'academic_basic',
    '융합교양': 'convergence', '외국인공통기초': 'foreign_common', '단수전공': 'major_single',
    '주전공': 'major_primary', '복수전공': 'major_double', '취득학점': 'total_credits',
    '평점평균': 'gpa', '사회봉사': 'volunteer', '외국어졸업요건': 'lang_requirement',
    '외국어시험': 'lang_test', '졸업논문·시험': 'thesis', '비고': 'notes',
}


def text(v, col=None):
    if v is None or v == '':
        return None
    if col == '평점평균' and isinstance(v, (int, float)):
        return f'{float(v):.1f}'
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return str(v)


def sheet(wb, name):
    rows = list(wb[name].iter_rows(values_only=True))
    head = [str(h) for h in rows[0]]
    return [dict(zip(head, r)) for r in rows[1:]]


def main():
    wb = load_workbook(XLSX, read_only=True, data_only=True)

    depts = []
    for r in sheet(wb, '학과목록'):
        aliases = [a.strip() for a in str(r['이전 명칭·별칭'] or '').split(',') if a.strip()]
        depts.append({
            'no': int(r['번호']),
            'name': r['대표명'],
            'homepage_name': r['학과·전공(홈페이지 표기)'],
            'aliases': aliases,
            'phone': r['문의전화'] or None,
            'status': r['상태'],
            'has_2021': r['21학번 기준'] == 'O',
            'pdf_url': r['원본 URL'],
        })

    criteria = []
    for r in sheet(wb, '졸업기준_요약'):
        row = {
            'dept_no': int(r['번호']), 'department': r['학과'], 'program': r['과정'] or '',
            'year_label': str(r['입학년도']), 'year_from': int(r['시작학번']), 'year_to': int(r['끝학번']),
            'student_type': r['학생구분'], 'affiliation': r['소속(당시)'] or None,
            'source_page': int(r['원본쪽']) if r['원본쪽'] is not None else None,
        }
        for ko, en in COLS.items():
            row[en] = text(r.get(ko), ko)
        criteria.append(row)

    key = []
    for r in sheet(wb, '학번별_신입생'):
        row = {'year': int(r['학번']), 'dept_no': int(r['번호']), 'department': r['학과'],
               'program': r['과정'] or '', 'student_type': r['학생구분'], 'year_label': str(r['적용 구간']),
               'affiliation': r['소속(당시)'] or None}
        for ko, en in COLS.items():
            row[en] = text(r.get(ko), ko)
        key.append(row)

    meta = {'source': 'https://wise.dongguk.ac.kr/page/155', 'guide': '2026학년도 학사제도 및 학업이수가이드',
            'excel': os.path.basename(XLSX)}
    for name, data in [('departments', depts), ('criteria', criteria), ('answer-key', key)]:
        with open(os.path.join(SRC, f'{name}.json'), 'w', encoding='utf-8') as f:
            json.dump({'meta': meta, 'rows': data}, f, ensure_ascii=False, indent=1)
        print(f'{name}.json: {len(data)} rows')


if __name__ == '__main__':
    sys.exit(main())
