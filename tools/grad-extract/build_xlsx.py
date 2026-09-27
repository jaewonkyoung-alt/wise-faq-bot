"""정규화 레코드 → 졸업요건 엑셀."""
import collections
import json
import re
import subprocess

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from normalize import BASE, TYPE_ORDER, criteria, load_meta, notes, required, thesis

OUT = f'{BASE}/../2021212843_경재원_졸업요건_학과별_정리.xlsx'
MIN_YEAR = 2021
FONT = '맑은 고딕'
HEAD_FILL = PatternFill('solid', fgColor='262626')
SUB_FILL = PatternFill('solid', fgColor='F2F2F2')
WARN_FILL = PatternFill('solid', fgColor='E7E6E6')
THIN = Side(style='thin', color='BFBFBF')
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
P84 = '외국인편입생 이수기준표(P.84) 참조'

COLS = ['인성및자기계발', '인성', '의사소통', '교양외국어', '디지털', '학문기초', '융합교양', '외국인공통기초',
        '단수전공', '주전공', '복수전공', '취득학점', '평점평균', '사회봉사', '외국어졸업요건', '외국어시험', '졸업논문·시험']


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


def phone_of(no):
    txt = subprocess.run(['pdftotext', '-l', '1', f'raw/2026_{no}.pdf', '-'], capture_output=True, text=True).stdout
    m = re.findall(r'(0\d{1,2}-\d{3,4}-\d{4}(?:\s*,\s*\d{4})*)', txt)
    return ', '.join(dict.fromkeys(m))


def style_sheet(ws, widths, header_row=1, wrap_cols=()):
    for c in ws[header_row]:
        c.font = Font(name=FONT, bold=True, color='FFFFFF', size=10)
        c.fill = HEAD_FILL
        c.alignment = Alignment(horizontal='center', vertical='center', wrap_text=True)
        c.border = BORDER
    for row in ws.iter_rows(min_row=header_row + 1):
        for c in row:
            c.font = Font(name=FONT, size=10)
            c.border = BORDER
            c.alignment = Alignment(vertical='top', wrap_text=(get_column_letter(c.column) in wrap_cols))
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = ws.cell(row=header_row + 1, column=1)
    if ws.max_row > header_row:
        ws.auto_filter.ref = f'A{header_row}:{get_column_letter(ws.max_column)}{ws.max_row}'
    ws.row_dimensions[header_row].height = 30


def main():
    meta = load_meta()
    data = {no: json.load(open(f'out/{no}.json')) for no in sorted(meta)}
    crit = {no: criteria(no, d) for no, d in data.items()}

    # ---------- 학과 메타 ----------
    dept = {}
    for no, m in meta.items():
        rs = crit[no]
        spans = sorted({(r['입학년도'], r['시작'], r['끝']) for r in rs}, key=lambda x: x[1])
        prog = no in ('43', '44')
        sosoks = list(dict.fromkeys(r['소속'] for r in rs if r['소속'] and r['끝'] >= MIN_YEAR))
        name = m['이름']
        base_name = re.sub(r'\(.*\)', '', name).strip()
        title = data[no]['title'] if '졸업기준' not in data[no]['title'] else ''
        paren = re.findall(r'\(([^)]*)\)', name) + re.findall(r'\(([^)0-9]*[과부공])\)', title)
        alias, seen = [], {re.sub(r'\s', '', base_name)}
        for a in paren + sosoks:
            for x in re.split(r'\s*,\s*', a):
                x = re.sub(r'\s*([·ㆍ‧・])\s*', r'\1', x.strip())
                key = re.sub(r'[\s·ㆍ‧・]', '', x)
                if len(key) >= 3 and key not in {re.sub(r'[·ㆍ‧・]', '', k) for k in seen}:
                    seen.add(key)
                    alias.append(x)
        lo = min(s[1] for s in spans)
        hi = max(s[2] for s in spans)
        state = '운영' if hi >= 2026 else f'모집중단(기준표 {hi}학번까지)'
        if lo > MIN_YEAR:
            state = f'신설({lo}학번부터)'
        dept[no] = dict(name=name, base=base_name, alias=alias, phone=phone_of(no), prog=prog,
                        spans=(' / '.join(f"{p}: " + ' · '.join(dict.fromkeys(r['입학년도'] for r in rs if r['소속'] == p))
                                          for p in dict.fromkeys(r['소속'] for r in rs)) if prog
                               else ' · '.join(s[0] for s in spans)), has21=any(a <= 2021 <= b for _, a, b in spans), state=state)

    bases = {d['base'] for d in dept.values()}
    for d in dept.values():  # 다른 학과의 현행명과 같은 별칭은 원문 오기(예: 엘리트스포츠 소속)라 제외
        d['alias'] = [a for a in d['alias'] if a not in bases]

    wb = Workbook()

    # ---------- 1. 안내 ----------
    ws = wb.active
    ws.title = '안내'
    info = [
        ('동국대 WISE캠퍼스 학과별 졸업요건 정리 (21학번 이후)', ''),
        ('', ''),
        ('기준 문서', '2026학년도 학사제도 및 학업이수가이드 — Ⅶ. 학부(과)/전공별 졸업기준 (학과별 PDF 42개)'),
        ('출처', 'https://wise.dongguk.ac.kr/page/155  (파일: /resources/files/course/2026/08~49.pdf)'),
        ('원본 보관', 'SSD 컴퓨터공학종합설계2/졸업요건_원본PDF/02_학과별/  (manifest.csv에 SHA-256)'),
        ('수집·작성일', '2026-09-27 수집, 2026-09-28 작성'),
        ('범위', '입학년도 구간의 끝이 2021 이상인 열만 수록. 2018~2019 같은 이전 구간은 제외.'),
        ('추출 방법', 'PDF 표의 선 좌표로 셀을 복원(병합 셀 포함) → 자동 정규화. 여러 칸에 걸친 병합 값은 해당 칸마다 복사.'),
        ('검수 상태', '자동 추출 + 표본 원본 대조(컴공·일문·간호·경영·의학과). 전 학과 육안 대조는 미완료 — 챗봇 답변 전 원본 쪽 확인 권장.'),
        ('', ''),
        ('시트', '내용'),
        ('학과목록', '42개 학과·전공: 현행명, 이전명/별칭, 문의전화, 입학년도 구간, 21학번 기준 유무, 운영 상태'),
        ('졸업기준_요약', '학과 × 입학년도 구간 × 학생구분(신입/편입 × 내국/외국) 한 줄. 교양·전공·졸업학점·외국어·논문 등 열로 펼침'),
        ('학번별_신입생', '21~26학번을 한 학번씩 펼친 조회용 표 (신입생 기준). 챗봇 테스트 정답표로 사용'),
        ('졸업논문_대체', '졸업논문·시험·자격증·전시 등 대체 수단과 학생구분별 해당 여부'),
        ('필수이수교과목', '학수번호·교과목명과 학생구분별 해당 여부, 비고(택1 조건 등)'),
        ('각주_기타사항', '표 아래 각주(*, **, ○, ※)와 기타사항 원문. "공통문구" 열로 전 학과 공통 문장 걸러내기 가능'),
        ('원본_셀단위', '기준표의 모든 칸을 한 줄씩 (학과, 구간, 학생구분, 대분류, 세부, 항목, 값, 비고, 쪽)'),
        ('특이사항', '데이터로 옮길 때 주의할 점, 학과별 예외, 원문 이상, 추출 한계'),
        ('', ''),
        ('값 표기', '"-" = 원문에서 해당 없음/0. 숫자는 숫자형, "57+모듈1" 같은 조건부 값은 문자열 그대로. 편입생-외국인의 교양·전공은 원문이 "' + P84 + '"'),
    ]
    for r in info:
        ws.append(r)
    ws['A1'].font = Font(name=FONT, bold=True, size=14)
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.font = Font(name=FONT, size=10, bold=(c.column == 1))
            c.alignment = Alignment(vertical='top', wrap_text=True)
    for c in ws[11]:
        c.font = Font(name=FONT, bold=True, color='FFFFFF', size=10)
        c.fill = HEAD_FILL
    ws.column_dimensions['A'].width = 16
    ws.column_dimensions['B'].width = 110

    # ---------- 2. 학과목록 ----------
    ws = wb.create_sheet('학과목록')
    ws.append(['번호', '학과·전공(홈페이지 표기)', '대표명', '이전 명칭·별칭', '문의전화', '입학년도 구간(원문)',
               '21학번 기준', '상태', '과정 구분', '원본 파일', '원본 URL'])
    for no in sorted(meta):
        d = dept[no]
        ws.append([int(no), d['name'], d['base'], ', '.join(d['alias']), d['phone'], d['spans'],
                   'O' if d['has21'] else '-', d['state'], '예과+본과(표 2개)' if d['prog'] else '',
                   meta[no]['파일'], meta[no]['원본URL']])
    style_sheet(ws, [6, 34, 22, 34, 26, 38, 9, 24, 16, 40, 50], wrap_cols=('B', 'D', 'F'))

    # ---------- 3. 졸업기준_요약 ----------
    wide = collections.OrderedDict()
    for no in sorted(meta):
        for r in crit[no]:
            if r['끝'] < MIN_YEAR:
                continue
            prog = r['소속'] if dept[no]['prog'] else ''
            key = (int(no), dept[no]['base'], prog, r['입학년도'], r['시작'], r['끝'], r['학생구분'])
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
        extra = [k for k in w['vals'] if k not in COLS]
        for k in extra:
            parts.append(f"{k}: {' / '.join(w['vals'][k])}")
        return '; '.join(parts)

    head = ['번호', '학과', '과정', '입학년도', '시작학번', '끝학번', '학생구분', '소속(당시)'] + COLS + ['비고', '원본쪽']
    ws = wb.create_sheet('졸업기준_요약')
    ws.append(head)
    for key, w in wide.items():
        ws.append(list(key) + [w['소속']] + [cell_val(w, c) for c in COLS] + [note_text(w), w['쪽']])
    style_sheet(ws, [6, 22, 8, 11, 8, 8, 15, 20] + [9] * 14 + [10, 9, 16, 30, 6], wrap_cols=('B', 'H', 'Y', 'Z'))
    gp = head.index('평점평균') + 1
    for row in ws.iter_rows(min_row=2, min_col=gp, max_col=gp):
        for c in row:
            if isinstance(c.value, (int, float)):
                c.number_format = '0.0'

    # ---------- 4. 학번별_신입생 ----------
    ws = wb.create_sheet('학번별_신입생')
    h2 = ['학번', '번호', '학과', '과정', '학생구분', '적용 구간', '소속(당시)'] + COLS + ['비고']
    ws.append(h2)
    for y in range(MIN_YEAR, 2027):
        for key, w in wide.items():
            no, name, prog, span, a, b, sec = key
            if not sec.startswith('신입생') or not (a <= y <= b):
                continue
            ws.append([y, no, name, prog, sec, span, w['소속']] + [cell_val(w, c) for c in COLS] + [note_text(w)])
    style_sheet(ws, [7, 6, 22, 8, 15, 11, 20] + [9] * 14 + [10, 9, 16, 30], wrap_cols=('C', 'G', 'X'))
    gp = h2.index('평점평균') + 1
    for row in ws.iter_rows(min_row=2, min_col=gp, max_col=gp):
        for c in row:
            if isinstance(c.value, (int, float)):
                c.number_format = '0.0'

    # ---------- 5. 졸업논문_대체 ----------
    ws = wb.create_sheet('졸업논문_대체')
    ws.append(['번호', '학과', '표 제목', '구분', '세부기준'] + TYPE_ORDER + ['비고', '원본쪽'])
    for no in sorted(meta):
        for r in thesis(no, data[no]):
            ws.append([int(no), dept[no]['base'], r['표'], r['구분'], r['세부기준']] +
                      [r.get(t, '') for t in TYPE_ORDER] + [r['비고'], r['쪽']])
    style_sheet(ws, [6, 22, 24, 14, 60] + [10] * len(TYPE_ORDER) + [24, 7], wrap_cols=('C', 'E', 'M'))

    # ---------- 6. 필수이수교과목 ----------
    ws = wb.create_sheet('필수이수교과목')
    ws.append(['번호', '학과', '구분', '세부구분', '학수번호', '교과목명'] + TYPE_ORDER + ['비고', '원본쪽'])
    for no in sorted(meta):
        for r in required(no, data[no]):
            ws.append([int(no), dept[no]['base'], r['구분'], r['세부구분'], r['학수번호'], r['교과목명']] +
                      [r.get(t, '') for t in TYPE_ORDER] + [r['비고'], r['쪽']])
    style_sheet(ws, [6, 22, 10, 18, 12, 30] + [10] * len(TYPE_ORDER) + [44, 7], wrap_cols=('D', 'F', 'N'))

    # ---------- 7. 각주_기타사항 ----------
    allnotes = {no: [n for n in notes(no, data[no]) if n['위치'] != '(머리)' or not n['내용'].startswith(dept[no]['base'][:3])]
                for no in meta}
    freq = collections.Counter(re.sub(r'\s', '', n['내용']) for ns in allnotes.values() for n in ns)
    ws = wb.create_sheet('각주_기타사항')
    ws.append(['번호', '학과', '위치', '내용', '공통문구'])
    for no in sorted(meta):
        for n in allnotes[no]:
            ws.append([int(no), dept[no]['base'], n['위치'], n['내용'],
                       'Y' if freq[re.sub(r'\s', '', n['내용'])] >= 10 else ''])
    style_sheet(ws, [6, 22, 22, 110, 9], wrap_cols=('D',))

    # ---------- 8. 원본_셀단위 ----------
    ws = wb.create_sheet('원본_셀단위')
    ws.append(['번호', '학과', '과정', '입학년도', '시작학번', '끝학번', '학생구분', '소속(당시)', '대분류', '세부', '항목(원문)', '값(원문)', '비고(원문)', '원본쪽'])
    for no in sorted(meta):
        for r in crit[no]:
            if r['끝'] < MIN_YEAR:
                continue
            ws.append([int(no), dept[no]['base'], r['소속'] if dept[no]['prog'] else '', r['입학년도'], r['시작'], r['끝'],
                       r['학생구분'], r['소속'], r['대분류'], r['세부'], r['항목'], r['값'], r['비고'], r['쪽']])
    style_sheet(ws, [6, 22, 8, 11, 8, 8, 15, 20, 10, 16, 20, 30, 16, 6], wrap_cols=('L',))

    # ---------- 9. 특이사항 ----------
    build_notes_sheet(wb, meta, dept, wide, data)

    wb.save(OUT)
    print('saved', OUT)
    for s in wb.worksheets:
        print(f'  {s.title}: {s.max_row - 1} rows')


def build_notes_sheet(wb, meta, dept, wide, data):
    def depts_where(pred):
        hit = []
        for key, w in wide.items():
            no, name, prog, span, a, b, sec = key
            if sec.startswith('신입생') and pred(w) and name not in hit:
                hit.append(name)
        return hit

    def vals(w, c):
        return w['vals'].get(c, [])

    new = [f"{d['base']}({d['state'].split('(')[1].rstrip(')')})" for d in dept.values() if d['state'].startswith('신설')]
    stop = [f"{d['base']}({d['state'].split('기준표 ')[1].rstrip(')')})" for d in dept.values() if d['state'].startswith('모집중단')]
    renamed = [f"{d['base']} ← {', '.join(d['alias'])}" for d in dept.values() if d['alias']]
    svc_ex = depts_where(lambda w: any(v in ('-', '') for v in vals(w, '사회봉사')))
    lang_ex = depts_where(lambda w: any(v in ('-', '') for v in vals(w, '외국어졸업요건')))
    lang_diff = []
    for key, w in wide.items():
        if key[6].startswith('신입생-내') and key[1] not in [x.split(':')[0] for x in lang_diff]:
            v = vals(w, '외국어졸업요건')
            n = w['notes'].get('외국어졸업요건', [])
            if v and not (v == ['650'] and n == ['TOEIC']) and not all(x in ('-', '') for x in v):
                lang_diff.append(f"{key[1]}: " + ' / '.join(f'{a} {b}' for a, b in zip(v, n)))
    module = collections.defaultdict(list)
    for key, w in wide.items():
        for v in vals(w, '단수전공'):
            if '모듈' in v and key[6] == '신입생-내국인':
                module[v.replace('*', '')].append(key[1])
    module_txt = '; '.join(f"{k}: {', '.join(dict.fromkeys(v))}" for k, v in module.items())
    digit = depts_where(lambda w: any(v not in ('-', '') for v in vals(w, '디지털')))
    thesis_kinds = collections.OrderedDict()
    for key, w in wide.items():
        if key[6].startswith('신입생-내'):
            for v in vals(w, '졸업논문·시험'):
                if v:
                    thesis_kinds.setdefault(key[1], v)

    rows = [
        # (분류, 대상, 내용, 처리 제안, 근거)
        ('데이터 범위', '전체', '학교에 연도별 개정판이 없다. 2021~2024학년도판 주소는 404이고, 2026판 학과 파일 하나에 2020~2026학번 기준이 입학년도 열로 모두 들어 있다. 2020학번 이전은 "개별 심사"라 기준표가 없다.',
         '학번 → 입학년도 구간 매핑으로 조회. 2020 이전 학번 질문은 학과사무실 안내로 응답.', '각 학과 PDF 기타사항 가.'),
        ('데이터 범위', f'신설 {len(new)}개', '21학번 기준표가 없는 학과: ' + ', '.join(new),
         '이 학과 + 21학번 조합 질문은 "해당 학번 기준 없음"으로 처리.', '학과목록 시트'),
        ('데이터 범위', f'모집중단 {len(stop)}개', '기준표가 과거 구간에서 끝나는 학과·전공: ' + ', '.join(stop) + '. 재학생은 있으므로 데이터에서 빼면 안 된다.',
         '학과 선택 목록에는 숨기되 검색·별칭으로는 찾히게.', '학과목록 시트'),
        ('학과명', f'{len(renamed)}개', '학과명·소속이 입학년도마다 다르다. 예: 컴퓨터공학과의 2020~2021 소속은 "컴퓨터공학전공". 21학번은 옛 이름으로 물어볼 가능성이 높다. 목록: ' + ' | '.join(renamed),
         '학과목록의 "이전 명칭·별칭"을 동의어 사전에 등록. 답변에는 그 학번 당시 소속명을 함께 표시.', '졸업기준_요약 "소속(당시)" 열'),
        ('학과명', '바이오·화학융합학부', '홈페이지 목록은 "(바이오메디컬학과)", PDF 본문 제목은 "(바이오제약공학과)", 2020~2024 소속은 "바이오제약공학전공/학과". 세 이름이 섞여 있다.',
         '세 이름 모두 별칭 등록.', '02_학과별/36 1쪽'),
        ('학과명', '의예과·의학과, 한의예과·한의학과', '한 PDF에 예과(수료요건 80학점)와 본과(졸업요건 160학점) 표가 따로 있고, 입학년도 구간도 서로 다르다(의학과 2020 | 2021~2022 | 2023 | 2024~2025 | 2026).',
         '"과정" 열(예과/본과)을 키에 포함. 졸업학점 질문엔 본과 기준, 진급 질문엔 예과 수료 기준.', '02_학과별/43, 44'),
        ('요건 예외', f'사회봉사 면제 {len(svc_ex)}개', ', '.join(svc_ex) + '. 영어영문학과는 값이 "30시간"으로 단위가 붙어 있다(다른 학과는 30 + 비고 "시간"). 조경·정원디자인학과는 2022 이전 입학자에 대체 이수 방법이 각주로 있다.',
         '사회봉사 값 "-"와 "면제"를 같은 의미로 처리. 숫자만 뽑아 비교.', '졸업기준_요약 사회봉사 열'),
        ('요건 예외', f'외국어 졸업요건 면제 {len(lang_ex)}개', ', '.join(lang_ex),
         '"외국어 몇 점?" 질문에 면제 학과는 면제라고 먼저 답변.', '졸업기준_요약 외국어졸업요건 열'),
        ('요건 예외', '외국어 기준이 다른 학과', '신입생-내국인 기준 TOEIC 650이 아닌 학과: ' + ' | '.join(lang_diff) + '. 일문·중문은 여러 시험이 줄로 나열되어 있고 "택1" 표기는 원문에 없다.',
         '복수 시험은 "중 하나"로 안내하되 학과 확인 문구 병기. 외국어졸업요건 열에 " / "로 이어 붙여 둠(외국어시험 열과 순서 대응).', '02_학과별/14, 15, 16'),
        ('요건 예외', '중문과정(외국인)', '경영학과·회계세무학과·정보경영학과·중어중문학과는 외국인 중문과정 입학생의 외국어 졸업요건을 면제한다. 경영학과는 졸업논문·대체까지 면제.',
         '외국인 학생 질문일 때 과정(중문/일반) 확인 질문 필요.', '각주_기타사항 시트'),
        ('요건 예외', '전 학과 공통', '2025학번부터 모의토익을 외국어 졸업요건으로 인정하지 않는다.', '25·26학번 외국어 답변에 반드시 포함.', '각 학과 기준표 각주 ○'),
        ('요건 예외', '2025~2026학번 단수전공', '단수전공 학점이 "57+모듈1" 식으로 바뀌었다(타 학부 모듈 또는 융합모듈 1개 필수). 학과별 값: ' + module_txt,
         '숫자 비교 로직에서 문자열 처리 필요. 모듈 이수 여부를 별도 조건으로 분리.', '졸업기준_요약 단수전공 열'),
        ('요건 예외', f'디지털 교양 {len(digit)}개', '디지털 교양 학점이 있는 학과(나머지는 "-"): ' + ', '.join(digit) + '. 조경·정원디자인학과는 2020~2024 2학점, 2025~ 4학점.',
         '"-"는 0학점으로 저장.', '졸업기준_요약 디지털 열'),
        ('요건 예외', '간호학과', '졸업학점이 2020~2021학번 140, 2022학번부터 130. 각주: "2020~2021 입학자는 경과조치에 따른 졸업이수학점 별도 확인 필요". 2024학번부터 교양 "건강한성과결혼" 필수.',
         '21학번 간호학과 답변엔 경과조치 확인 안내 필수.', '02_학과별/45 1쪽'),
        ('요건 예외', '의학과', '전공학점이 167*, 170*(*의전원), 165.5 등 소수점. 사회봉사·외국어 면제.', '학점 열을 정수가 아닌 실수형으로.', '02_학과별/44 2쪽'),
        ('요건 예외', '불교학부·명상심리상담학과·한국음악과', '승려는 동국소양(인성) "자아와명상 1,2" 면제(매 학년도 초 승적증명서 제출).', '', '각주_기타사항 시트'),
        ('요건 예외', '조경·정원디자인학과', '기초(계열)교육: 21학번까지 일반생물학·일반생물학및실험1,2 중 택2, 22학번부터 야생식물과환경. 21학번이 경계라 테스트 케이스로 좋다.', '', '02_학과별/21'),
        ('요건 예외', '편입생-외국인', '모든 학과에서 교양·전공 학점 칸이 "외국인편입생 이수기준표(P.84) 참조"로 되어 있어 숫자가 없다.',
         '01_공통/07_외국인졸업이수기준.pdf를 따로 파싱해야 답변 가능.', '졸업기준_요약'),
        ('졸업논문', '전 학과', '"졸업논문 및 시험" 방식이 학과마다 다르다(논문, 졸업시험, 자격증, 졸업전시, 졸업연주회, 공무원 합격, 현장실습, 캡스톤 보고서 등). 요약 열에는 기준표 문구만, 세부는 졸업논문_대체 시트에.',
         '"졸업논문 안 쓰려면?" 류 질문은 졸업논문_대체 시트로 답변.', '졸업논문_대체 시트'),
        ('졸업논문', '컴퓨터공학과', 'PCCE 2급 이상(C, C++, JAVA) 자격증이 2027년 2월 졸업대상자부터 추가 요건. 졸업논문 응시 7학기 이상, 정보처리기사·전국 규모 공모전 입상 시 면제.',
         '우리 학과라 데모 시나리오로 쓰기 좋다.', '02_학과별/42 2쪽'),
        ('졸업논문', '중어중문학과', '외국어 졸업요건은 HSK 5급 180점인데, 졸업논문 대체는 HSK 5급 210점 이상(졸업예정일 기준 2년 이내 성적). 기준이 둘이다.', '두 기준을 혼동하지 않게 항목 분리.', '02_학과별/16 2쪽'),
        ('원문 이상', '의학과 2026학번', '"졸업논문 및 시험" 칸이 원문에서 비어 있다(2020~2025는 "졸업시험").', '학과 확인 전까지 "확인 필요"로 응답.', '02_학과별/44 2쪽'),
        ('원문 이상', '엘리트스포츠전공', '기준표 "소속" 칸이 "스포츠의학전공"으로 되어 있다(2025·2026). 스포츠의학전공 표를 복사하며 남은 오기로 보인다. 2026학번 "디지털" 칸도 비어 있다(2025는 "-").',
         '소속은 엘리트스포츠전공으로 보정해 쓰되 원문 값은 원본_셀단위에 보존. 학과 확인 권장.', '02_학과별/20 1쪽'),
        ('원문 이상', '경영학과', '졸업논문 및 대체 표 첫 행이 원문에서 비어 있다. 엑셀에서는 뺐다.', '', '02_학과별/26 2쪽'),
        ('추출 한계', '전체', 'PDF 표가 선이 아니라 도형으로 그려져 일반 표 추출기가 실패한다. 선 좌표로 셀을 복원했고, 병합 셀 값은 걸친 칸마다 복사했다(예: 졸업논문 값, 필수과목 ㅇ 표시).',
         '원본_셀단위 시트에 원문 그대로 보존. 의심 값은 원본쪽 열로 PDF 대조.', '추출 스크립트'),
        ('추출 한계', '필수 이수 교과목', '"1,2 중 택1", "BUS2_ 중 6과목" 같은 조건이 비고·각주 문장에만 있다. 표만 보면 모든 과목이 필수처럼 보인다.',
         '필수과목 판정에 조건식(그룹, 최소 과목 수) 필드 추가 필요.', '필수이수교과목 비고 열'),
        ('추출 한계', '한의학과·의학과', '필수 이수 교과목이 표 없이 "교육과정 전체 이수" 문장으로만 되어 있다.', '', '각주_기타사항 시트'),
        ('범위 밖', '공통 요건', '교양 세부 과목(01_공통/05), 외국어 대체 시험 환산 기준·면제 대상(01_공통/06), 외국인 기준(01_공통/07)은 이번 엑셀에 없다.',
         '다음 단계에서 공통 PDF도 같은 방식으로 추출.', '01_공통/'),
    ]
    ws = wb.create_sheet('특이사항')
    ws.append(['No', '분류', '대상', '내용', '챗봇·데이터 처리 제안', '근거'])
    for i, r in enumerate(rows, 1):
        ws.append([i] + list(r))
    style_sheet(ws, [5, 12, 26, 90, 50, 26], wrap_cols=('C', 'D', 'E', 'F'))
    for row in ws.iter_rows(min_row=2):
        if row[1].value == '원문 이상':
            for c in row:
                c.fill = WARN_FILL


if __name__ == '__main__':
    main()
