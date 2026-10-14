"""현재 DB의 공식 졸업기준(JSON, stdin) → 엑셀(stdout). 관리자 웹 '엑셀 내려받기'용.

    echo '{"rows": [...]}' | .venv/bin/python criteria_to_xlsx.py > 졸업기준.xlsx
"""
import io
import json
import sys

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill

COLS = [
    ('department', '학과'), ('program', '과정'), ('year_label', '학번'), ('student_type', '학생구분'),
    ('affiliation', '당시 소속'), ('total_credits', '졸업학점'), ('gpa', '평점평균'),
    ('major_single', '단수전공'), ('major_primary', '주전공'), ('major_double', '복수전공'),
    ('personality_self', '인성·자기계발'), ('personality', '인성'), ('communication', '의사소통'),
    ('liberal_foreign', '교양 외국어'), ('digital', '디지털'), ('academic_basic', '학문기초'),
    ('convergence', '융합교양'), ('foreign_common', '외국인 공통기초'), ('volunteer', '사회봉사'),
    ('lang_test', '외국어 시험'), ('lang_requirement', '외국어 기준'), ('thesis', '졸업논문·시험'),
    ('notes', '비고'), ('source_page', '원본 쪽'),
]


def main():
    rows = json.load(sys.stdin)['rows']
    wb = Workbook()
    ws = wb.active
    ws.title = '졸업기준'
    ws.append([k for _, k in COLS])
    for r in rows:
        ws.append([r.get(c) for c, _ in COLS])
    for c in ws[1]:
        c.font = Font(name='맑은 고딕', bold=True, color='FFFFFF')
        c.fill = PatternFill('solid', fgColor='262626')
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
    widths = [22, 8, 11, 15, 20] + [9] * 17 + [36, 7]
    for i, w in enumerate(widths):
        ws.column_dimensions[ws.cell(row=1, column=i + 1).column_letter].width = w
    ws.freeze_panes = 'A2'
    ws.auto_filter.ref = ws.dimensions
    buf = io.BytesIO()
    wb.save(buf)
    sys.stdout.buffer.write(buf.getvalue())


if __name__ == '__main__':
    main()
