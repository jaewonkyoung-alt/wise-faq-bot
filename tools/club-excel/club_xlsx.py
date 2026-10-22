"""동아리 엑셀 — 관리자 웹 '엑셀 내려받기 · 올리기'용 (tools/grad-extract/.venv 의 openpyxl 사용).

    club_xlsx.py export < {"clubs": [...]}   -> 엑셀(stdout)
    club_xlsx.py read   < 엑셀 파일          -> {"rows": [{"row": 2, "name": ...}], "error": null} (stdout)

머리 행의 한국어 이름으로 칸을 찾으므로 관리자가 칸 순서를 바꾸거나 칸을 더 넣어도 읽힌다.
"""
import io
import json
import sys

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Alignment, Font, PatternFill

COLS = [
    ('name', '이름', 18, True),
    ('category', '분과', 10, True),
    ('summary', '한두 줄 소개', 46, False),
    ('meeting_time', '정기 모임', 30, False),
    ('location', '동아리방', 20, False),
    ('contact', '연락처', 34, False),
    ('intro', '소개', 40, True),
    ('activities', '활동', 60, True),
    ('source_url', '출처 URL', 34, True),
]
GUIDE = [
    '동아리 정보를 엑셀로 한꺼번에 고치는 파일입니다.',
    '1. 「동아리」 시트에서 값을 고치거나, 맨 아래 줄에 새 동아리를 추가합니다.',
    '2. 이름 · 분과 · 소개 · 활동 · 출처 URL 은 꼭 채워야 합니다 (머리 행의 * 표시).',
    '3. 이름이 같은 동아리는 그 동아리의 값을 바꾸고, 새 이름은 새 동아리로 추가합니다.',
    '4. 엑셀에서 지운 동아리는 삭제되지 않습니다. 삭제는 관리자 화면의 동아리 목록에서 합니다.',
    '5. 회장 · 부원의 개인 휴대폰 번호는 넣지 않습니다 (올리면 그 줄은 거부됩니다).',
    '6. 관리자 화면 「엑셀 올리기」에 넣으면 바뀌는 칸만 보여 주고, 「적용」을 눌러야 반영됩니다.',
]


def export():
    clubs = json.load(sys.stdin)['clubs']
    wb = Workbook()
    ws = wb.active
    ws.title = '동아리'
    ws.append([label + (' *' if req else '') for _, label, _, req in COLS])
    for c in clubs:
        ws.append([c.get(f) or '' for f, _, _, _ in COLS])
    for cell in ws[1]:
        cell.font = Font(name='맑은 고딕', bold=True, color='FFFFFF')
        cell.fill = PatternFill('solid', fgColor='262626')
        cell.alignment = Alignment(horizontal='center', vertical='center')
    for i, (_, _, w, _) in enumerate(COLS, 1):
        ws.column_dimensions[ws.cell(row=1, column=i).column_letter].width = w
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(vertical='top', wrap_text=True)
    ws.freeze_panes = 'B2'
    g = wb.create_sheet('안내')
    for line in GUIDE:
        g.append([line])
    g.column_dimensions['A'].width = 100
    g['A1'].font = Font(bold=True)
    buf = io.BytesIO()
    wb.save(buf)
    sys.stdout.buffer.write(buf.getvalue())


def norm(h):
    return str(h or '').replace('*', '').replace(' ', '').strip()


def read():
    data = sys.stdin.buffer.read()
    try:
        wb = load_workbook(io.BytesIO(data), read_only=True, data_only=True)
    except Exception as e:  # 엑셀이 아니거나 깨진 파일
        json.dump({'rows': [], 'error': f'엑셀 파일을 열지 못했습니다: {type(e).__name__}'}, sys.stdout, ensure_ascii=False)
        return
    ws = wb['동아리'] if '동아리' in wb.sheetnames else wb.worksheets[0]
    want = {norm(label): f for f, label, _, _ in COLS}
    header_row, colmap = None, {}
    for r_idx, row in enumerate(ws.iter_rows(min_row=1, max_row=10, values_only=True), 1):
        m = {i: want[norm(v)] for i, v in enumerate(row) if norm(v) in want}
        if 'name' in m.values() and len(m) >= 3:
            header_row, colmap = r_idx, m
            break
    if header_row is None:
        json.dump({'rows': [], 'error': "머리 행(이름 · 분과 · 소개 …)을 찾지 못했습니다. 내려받은 엑셀 양식을 써 주세요."}, sys.stdout, ensure_ascii=False)
        return
    rows = []
    for r_idx, row in enumerate(ws.iter_rows(min_row=header_row + 1, values_only=True), header_row + 1):
        rec = {f: ('' if row[i] is None else str(row[i]).strip()) for i, f in colmap.items() if i < len(row)}
        if not any(rec.values()):
            continue
        rec['row'] = r_idx
        rows.append(rec)
    json.dump({'rows': rows, 'error': None, 'columns': sorted(set(colmap.values()))}, sys.stdout, ensure_ascii=False)


if __name__ == '__main__':
    {'export': export, 'read': read}[sys.argv[1]]()
