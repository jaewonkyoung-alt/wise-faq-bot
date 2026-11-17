"""부록 D~H — 3장 명세표(요약본)의 전체 명세. 지도교수 피드백(11/11): 본문 표는 요약임을 밝히고 전체 명세를 부록으로.
내용은 src/ 코드 · data/wise.db 스키마(PRAGMA) · 논문 본문 서술에서만 가져온다."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def _lines(rel):
    p = ROOT / rel
    files = sorted(p.rglob('*')) if p.is_dir() else [p]
    return sum(len(f.read_text(encoding='utf-8', errors='ignore').splitlines()) for f in files
               if f.is_file() and f.suffix in ('.ts', '.py', '.js', '.css', '.html', '.sh'))


def _count(rel, pattern):
    return len([f for f in (ROOT / rel).glob(pattern) if f.is_file()])


def _flow(*steps):
    return '\n'.join(steps)


# ── 부록 D 기능 요구사항 ──
FR_HEAD = ['ID', '요구사항', '입력 → 처리 → 출력', '인터페이스', '관련 UC · 모듈']
FR_W = [1.6, 2.0, 6.5, 2.7, 2.2]
FR_STUDENT = [
    ['FR-01', '메뉴 제공',
     _flow('입력: 첫 대화, 「메뉴」, 알아듣지 못한 말',
           '처리: 대화 상태를 메뉴로 되돌림',
           '출력: 바로가기 버튼 4개(졸업요건 · 동아리 · 지도 · 공지)'),
     'POST /api/kakao/skill', 'UC-01~04\nkakaoDialog\nresponseBuilder'],
    ['FR-02', '졸업요건 단계 조회',
     _flow('입력: 학번 → 단과대 → 학과 버튼, 또는 「21학번 컴퓨터공학과 졸업요건」 같은 한 문장',
           '처리: 학번을 가이드의 학번 구간에 대응, 학과명 · 별칭은 가장 길게 일치하는 현행 학과로 해석, 학생 구분(기본 신입생-내국인)의 기준 행 조회',
           '출력: 졸업학점 · 전공 · 교양 · 평점 · 외국어 · 졸업논문 등 기준 항목, 편입생 · 외국인 기준 버튼'),
     'POST /api/kakao/skill\nGET /api/graduation/criteria', 'UC-01\ngradCriteria\ncollegeTaxonomy\nkakaoSession'],
    ['FR-03', '졸업요건 원문',
     _flow('입력: 졸업요건 답변',
           '처리: 학과의 원문 PDF 주소 조회(grad_departments.pdf_url)',
           '출력: 「학과 원문 PDF」 링크 버튼'),
     '졸업요건 답변에 포함', 'UC-01\ngradCriteria'],
    ['FR-04', '호실 위치 안내',
     _flow('입력: 「S504」 같은 호실 코드, 건물 이름 · 문장',
           '처리: 영문 건물 코드와 숫자로 나누고 첫 자리를 층으로 해석, 건물 층수를 넘으면 층 생략, 좌표 조회',
           '출력: 건물 · 층 · 용도 · 정원, 「카카오맵에서 보기」 버튼(이름 · 좌표 링크)'),
     'POST /api/kakao/skill', 'UC-03\nroomCode\ndata/kb/지도'],
    ['FR-05', '동아리 질의응답',
     _flow('입력: 동아리 이름 · 별칭이 든 정형 질문, 또는 자유 문장',
           '처리: 정형 질문은 이름으로 칸 조회, 자유 질문은 임베딩 유사도 + 0.4 × 키워드 사전 일치로 순위, 기준점 미만이면 고지',
           '출력: 소개 · 모임 · 장소 · 연락처 · 출처, 근거가 약하면 「확인되지 않았어요」'),
     'POST /api/kakao/skill\nPOST /api/ask', 'UC-02\naskService\nclubKeywords\nclubList'],
    ['FR-06', '공지 조회 · 알림 구독',
     _flow('입력: 「공지」 메뉴, 알림 받기(구독), 구독 후 아무 메시지',
           '처리: 게시 중 공지를 고정 · 최신 순으로 조회, 구독자 저장, 아직 전달하지 않은 14일 이내 새 공지 선택',
           '출력: 공지 목록, 답변 앞 새 공지(최대 3건, 나머지는 건수)'),
     'POST /api/kakao/skill\nGET /api/notices', 'UC-04\nnoticeService\nnoticeSubscription'],
]
FR_ADMIN = [
    ['FR-07', '관리자 인증',
     _flow('입력: 관리자 화면에 넣은 토큰(x-admin-token 헤더)',
           '처리: 서버 설정(ADMIN_TOKEN)과 비교, 설정이 비어 있으면 모든 요청 거부',
           '출력: 통과 또는 401'),
     '/api/admin/*\n/api/unanswered', 'UC-05~10\nadminAuth'],
    ['FR-08', '졸업요건 관리',
     _flow('입력: 학과 졸업기준 PDF(여러 개, 파일당 30MB 이하)',
           '처리: 선 · 글자 좌표로 표 복원, 내용의 학과명으로 학과 판별, 지금 값과 비교한 묶음 생성, 적용 시 적용 전 값 보관',
           '출력: 바뀐 칸 미리보기, 적용 · 되돌리기 · 버리기, 학과별 엑셀 · 마크다운 내려받기'),
     'POST …/graduation/import\nPOST …/import/:id/apply · revert · discard\nGET …/criteria.xlsx',
     'UC-05\ngradImport\ntools/grad-extract'],
    ['FR-09', '동아리 관리',
     _flow('입력: 동아리 입력 칸, 동아리 엑셀(10MB 이하), 키워드 사전 항목',
           '처리: 필수 칸(이름 · 분과 · 소개 · 활동 · 출처) 확인, 휴대폰 번호 · 같은 이름 거부, 저장한 동아리의 세 조각 재임베딩',
           '출력: 목록 · 검색, 엑셀 미리보기 · 적용 · 되돌리기, 사전 항목에 연결되는 동아리 미리보기'),
     '…/clubs, …/clubs.xlsx\n…/clubs/import\n…/clubs/keywords', 'UC-06 · UC-07\nclubStore\nclubImport\nclubKeywords'],
    ['FR-10', '공지 관리',
     _flow('입력: 제목 · 본문 · 링크 · 고정 여부 · 게시 기간',
           '처리: 입력 검증(javascript: 링크 거부), 종료일이 지난 공지를 서버 시작 때와 1시간마다 휴지통으로, 30일 뒤 삭제',
           '출력: 공지 목록 · 휴지통, 복원(초안으로)'),
     '…/notices\n…/notices/:id/restore', 'UC-08\nnoticeService'],
    ['FR-11', '데이터 점검',
     _flow('입력: 대시보드의 「지금 점검」',
           '처리: 파일 지식베이스와 데이터베이스를 다시 읽어 졸업요건 · 동아리 · 지도 · 공지별 확인',
           '출력: 확인된 사실(✓)과 고칠 곳 · 방법(⚠)'),
     'GET …/kb/scan', 'UC-10\nkbCheck'],
    ['FR-12', '미답변 관리',
     _flow('입력: 답하지 못한 질문(자동 기록), 관리자의 해결 · 무시',
           '처리: 같은 질문 묶음, 이유 코드를 한국어로, 상태(new · resolved · ignored) 변경',
           '출력: 묶음 · 횟수 · 이유, 「사전에 추가」, 처리한 기록 비우기'),
     'GET · DELETE /api/unanswered\nPOST /api/unanswered/status', 'UC-07 · UC-09\nunanswered'],
    ['FR-13', '전체 재색인',
     _flow('입력: 서버 시작, 「검색 벡터 전체 다시 만들기」',
           '처리: 저장된 벡터의 모델 이름(embed_model)과 현재 모델 비교, 다르거나 빠진 조각 다시 임베딩',
           '출력: 동아리 61곳 183조각의 벡터'),
     'POST …/reindex', 'UC-10\nreindex\nembedder'],
]

# ── 부록 E 유스케이스 ──
UC_ROWS = [
    ('UC-01 졸업요건 조회', [
        ['행위자', '학생 (카카오톡)'],
        ['사전 조건', '학생이 카카오톡 채널을 추가했고, 공식 졸업기준(graduation_criteria)이 적재되어 있다.'],
        ['기본 흐름', _flow(
            '1. 학생이 메뉴의 「졸업요건」을 누른다.',
            '2. 시스템이 학번을 고르는 버튼을 보여 준다.',
            '3. 학번을 고르면 단과대 버튼을, 단과대를 고르면 그 단과대의 학과 버튼을 보여 준다.',
            '4. 학생이 학과를 고른다.',
            '5. 시스템이 학번을 가이드의 학번 구간에 대응시키고, 학생 구분(기본: 신입생-내국인)의 기준 행을 찾는다.',
            '6. 시스템이 기준 항목과 「학과 원문 PDF」 버튼, 편입생 · 외국인 기준 버튼을 답한다.')],
        ['대안 흐름', _flow(
            'A1. 「21학번 컴퓨터공학과 졸업요건」처럼 한 문장으로 물으면 학번과 학과를 해석해 5단계로 간다.',
            'A2. 「컴공」 같은 줄임말과 옛 학과명은 별칭과 비교해 가장 길게 일치하는 현행 학과로 해석한다.',
            'A3. 「편입생 기준」 · 「외국인 기준」을 누르면 같은 학번 · 학과로 그 학생 구분의 기준을 답한다.',
            'A4. 입학 당시 소속 명칭이 지금과 다르면 함께 알려 준다.')],
        ['예외 흐름', _flow(
            'E1. 가이드에 기준이 없는 학번(2020학번 이전)이나 학과(신설 · 모집 중단)는 추측하지 않고 이유와 학과 사무실 전화번호를 안내한다.',
            'E2. 학과를 하나로 정할 수 없으면 후보 학과 버튼을 보여 준다.',
            'E3. 학번 · 학과를 해석하지 못하면 미답변으로 기록한다.')],
        ['사후 조건', '고른 학번 · 단과대 · 학과가 대화 상태(kakao_sessions)에 남아 이어지는 버튼에 쓰인다.'],
        ['관련', 'FR-01 · FR-02 · FR-03 / 5.2절, 부록 B'],
    ]),
    ('UC-02 동아리 질문', [
        ['행위자', '학생 (카카오톡)'],
        ['사전 조건', '동아리 61곳과 검색 벡터, 키워드 사전이 있다.'],
        ['기본 흐름', _flow(
            '1. 학생이 「동아리」 메뉴를 누르거나 동아리에 관한 문장을 보낸다.',
            '2. 문장에 동아리 이름 · 별칭이 있으면 그 동아리를 찾고, 연락처 · 모임 시간처럼 묻는 칸이 있으면 그 값을 답한다.',
            '3. 이름이 없으면 질문을 임베딩해 동아리 조각과의 유사도를 구하고, 키워드 사전 일치 점수(0.4 × 일치)를 더해 순위를 매긴다.',
            '4. 시스템이 상위 동아리의 소개 · 모임 · 출처를 답한다.')],
        ['대안 흐름', _flow(
            'A1. 「동아리 목록」은 분과별 개수를, 「체육 동아리 목록」은 그 분과 동아리를 한두 줄 소개와 함께 보여 준다.',
            'A2. 학교 옛 목록에만 있고 활동이 확인되지 않은 동아리는 그 사실을 안내한다.')],
        ['예외 흐름', _flow(
            'E1. 점수가 기준점보다 낮으면 「확인되지 않았어요」라고 알리고 비슷한 동아리를 안내한다.',
            'E2. 찾는 동아리가 없거나 범위 밖 질문이면 미답변으로 기록한다.',
            'E3. 임베딩 서버가 3초 안에 응답하지 않으면 키워드 사전만으로 답한다.',
            'E4. 비어 있는 칸은 「아직 확인되지 않았어요」로 그대로 알린다.')],
        ['사후 조건', '답하지 못한 질문은 이유와 함께 unanswered_questions에 남는다.'],
        ['관련', 'FR-05 / 5.2절 · 5.4절'],
    ]),
    ('UC-03 호실 · 건물 위치', [
        ['행위자', '학생 (카카오톡)'],
        ['사전 조건', '학교 홈페이지에서 수집한 호실 287개 · 장소 35개의 위치 데이터(data/kb/지도)가 있다.'],
        ['기본 흐름', _flow(
            '1. 학생이 메뉴의 「지도」를 누른다.',
            '2. 시스템이 호실 코드나 건물 이름을 보내라는 안내와 예시 버튼(S504 · A207 · 도서관 · 학생회관)을 보여 준다.',
            '3. 학생이 「S504」 같은 호실 코드를 보낸다.',
            '4. 시스템이 코드를 영문 건물 코드와 숫자로 나누고 첫 자리를 층으로 해석한다.',
            '5. 시스템이 「S504는 자연과학관 5층에 있어요」와 호실의 용도 · 정원, 「카카오맵에서 보기」 버튼을 답한다.',
            '6. 버튼을 누르면 이름과 좌표가 담긴 카카오맵 링크가 열린다.')],
        ['대안 흐름', 'A1. 건물 이름이나 「학생회관 어디야?」 같은 문장에는 건물 소개 · 편의시설과 같은 버튼을 답한다.'],
        ['예외 흐름', _flow(
            'E1. 없는 건물 코드는 추측하지 않고 안내한다.',
            'E2. 건물 층수를 넘는 번호에는 층을 말하지 않는다.',
            'E3. 호실 · 건물을 알아보지 못하면 미답변으로 기록한다.')],
        ['사후 조건', '데이터를 바꾸지 않는다(조회만).'],
        ['관련', 'FR-04 / 5.2절'],
    ]),
    ('UC-04 공지 · 구독', [
        ['행위자', '학생 (카카오톡)'],
        ['사전 조건', '관리자가 게시한 공지가 있다.'],
        ['기본 흐름', _flow(
            '1. 학생이 메뉴의 「공지」를 누른다.',
            '2. 시스템이 게시 중인 전교생 공통 공지를 고정 공지부터 최신 순으로 보여 준다.',
            '3. 학생이 알림 받기(구독)를 고르면 시스템이 학생의 봇 사용자 키를 구독자로 저장한다.',
            '4. 새 공지가 게시된 뒤 구독한 학생이 아무 메시지나 보내면, 시스템이 답변 앞에 아직 전달하지 않은 새 공지를 붙인다.')],
        ['대안 흐름', 'A1. 붙일 새 공지가 3건을 넘으면 3건만 붙이고 나머지는 건수만 알린다.'],
        ['예외 흐름', _flow(
            'E1. 게시 후 14일이 지난 공지는 붙이지 않는다.',
            'E2. 초안 · 기간 밖 · 휴지통의 공지는 보여 주지 않는다.',
            'E3. 같은 공지는 학생마다 한 번만 전달하고, 공지 메뉴 · 구독 응답에는 붙이지 않는다.')],
        ['사후 조건', '전달한 공지가 학생별 전달 기록(notice_deliveries)에 남는다.'],
        ['관련', 'FR-06 / 5.2절'],
    ]),
    ('UC-05 졸업기준 PDF 반영', [
        ['행위자', '관리자 (학과 조교 등)'],
        ['사전 조건', '관리자가 토큰으로 관리자 화면의 잠금을 풀었고, 학교가 새 학과 PDF를 냈다.'],
        ['기본 흐름', _flow(
            '1. 관리자가 「PDF 올리기」에 학과 PDF를 끌어다 놓는다(여러 개 가능).',
            '2. 시스템이 선과 글자 좌표로 표를 복원하고, 내용의 학과명으로 학과를 판별한다.',
            '3. 시스템이 지금 값과 다른 칸만 미리보기로 보여 준다.',
            '4. 관리자가 확인한 뒤 「적용」을 누른다.',
            '5. 시스템이 적용 전 값을 올리기 기록에 보관하고 새 기준을 저장한다. 다음 질문부터 새 기준으로 답한다.')],
        ['대안 흐름', _flow(
            'A1. 「되돌리기」를 누르면 보관한 적용 전 값으로 돌아간다.',
            'A2. 미리보기 단계에서 「버리기」를 누르면 아무것도 바꾸지 않는다.',
            'A3. 학과별 기준을 엑셀 · 마크다운으로 내려받을 수 있다.')],
        ['예외 흐름', _flow(
            'E1. PDF가 아니거나 졸업기준표가 없는 PDF는 거부한다.',
            'E2. 바뀐 값이 없으면 「바뀌는 값 없음」으로 표시하고 적용할 수 없다.',
            'E3. 뒤에 적용한 묶음이 있으면 앞 묶음은 되돌릴 수 없다.',
            'E4. 토큰이 없거나 틀리면 401로 거부한다.')],
        ['사후 조건', '올리기 기록(grad_import_batches)에 파일별 판별 결과 · 바뀐 칸 · 적용 전 값이 남는다.'],
        ['관련', 'FR-07 · FR-08 / 5.2절'],
    ]),
    ('UC-06 동아리 수정', [
        ['행위자', '관리자 (동아리 연합회 임원 등)'],
        ['사전 조건', '관리자가 토큰으로 관리자 화면의 잠금을 풀었다.'],
        ['기본 흐름', _flow(
            '1. 관리자가 동아리 목록에서 이름 · 분과로 검색해 「수정」을 누른다.',
            '2. 입력 칸을 고쳐 저장한다.',
            '3. 시스템이 입력을 검사해 저장하고, 그 동아리의 세 조각(소개 · 활동 · 전체)을 다시 임베딩한다.',
            '4. 다음 질문부터 고친 내용으로 답한다.')],
        ['대안 흐름', _flow(
            'A1. 여러 곳을 고칠 때는 엑셀을 내려받아 고친 뒤 올리고, 바뀐 칸 미리보기를 확인해 적용한다(되돌리기 가능).',
            'A2. 새 동아리는 같은 입력 칸으로 추가한다.')],
        ['예외 흐름', _flow(
            'E1. 필수 칸(이름 · 분과 · 소개 · 활동 · 출처)이 비면 거부한다.',
            'E2. 개인 휴대폰 번호가 들어 있으면 저장을 거부한다.',
            'E3. 같은 이름의 동아리를 추가하거나 그 이름으로 바꾸면 409로 거부하고 기존 동아리를 고치도록 안내한다.',
            'E4. 엑셀에서 지운 동아리는 삭제하지 않는다.')],
        ['사후 조건', '엑셀 올리기는 club_import_batches에 바뀐 칸과 적용 전 값이 기록된다.'],
        ['관련', 'FR-07 · FR-09 / 5.2절 · 5.7절'],
    ]),
    ('UC-07 사전 보완', [
        ['행위자', '관리자'],
        ['사전 조건', '미답변 목록에 동아리 질문이 있다.'],
        ['기본 흐름', _flow(
            '1. 관리자가 미답변 묶음에서 「사전에 추가」를 누른다.',
            '2. 시스템이 질문의 단어가 채워진 사전 편집 칸을 연다.',
            '3. 관리자가 이을 분야를 적는다(예: 「유튜브, 브이로그 → 영상」).',
            '4. 시스템이 이 항목으로 연결되는 동아리를 미리 보여 준다.',
            '5. 관리자가 저장하면 같은 질문에 바로 해당 동아리를 답한다.')],
        ['대안 흐름', 'A1. 사전 화면에서 항목을 직접 추가 · 수정 · 삭제할 수 있다.'],
        ['예외 흐름', _flow(
            'E1. 빈 표현은 400으로 거부한다.',
            'E2. 편집하는 사이 바뀐 항목은 덮어쓰지 않고 409로 알린다.')],
        ['사후 조건', '키워드 사전 파일(data/kb/동아리/_keywords.json)이 갱신된다.'],
        ['관련', 'FR-09 · FR-12 / 5.2절'],
    ]),
    ('UC-08 공지 관리', [
        ['행위자', '관리자 (학생회 등)'],
        ['사전 조건', '관리자가 토큰으로 관리자 화면의 잠금을 풀었다.'],
        ['기본 흐름', _flow(
            '1. 관리자가 제목 · 본문 · 링크를 적고 고정 여부와 게시 기간을 정해 등록한다.',
            '2. 시스템이 입력을 검사해 저장하고, 게시 중인 공지를 학생 메뉴와 구독 전달에 쓴다.',
            '3. 종료일이 지나면 시스템이 서버 시작 때와 1시간마다 공지를 휴지통으로 옮기고, 30일 뒤 완전히 삭제한다.')],
        ['대안 흐름', 'A1. 휴지통의 공지를 복원하면 종료일을 비운 초안으로 돌아오고 수정 칸이 열린다.'],
        ['예외 흐름', _flow(
            'E1. 제목 · 본문이 비었거나 javascript: 링크면 400으로 거부한다.',
            'E2. 게시 중인 공지는 바로 완전히 삭제할 수 없다(409).')],
        ['사후 조건', '공지(notices)와 휴지통에 들어간 시각(trashed_at)이 기록된다.'],
        ['관련', 'FR-07 · FR-10 / 5.2절'],
    ]),
    ('UC-09 미답변 정리', [
        ['행위자', '관리자'],
        ['사전 조건', '챗봇이 답하지 못한 질문이 기록되어 있다.'],
        ['기본 흐름', _flow(
            '1. 관리자가 미답변 화면을 연다.',
            '2. 시스템이 같은 질문을 묶어 횟수 · 이유(찾는 동아리 없음, 비슷한 동아리로 안내, 메뉴로 돌아감 등)와 함께 보여 준다.',
            '3. 관리자가 묶음을 「해결」 또는 「무시」로 처리한다.')],
        ['대안 흐름', _flow(
            'A1. 처리한 묶음을 새 질문으로 되돌릴 수 있다.',
            'A2. 동아리 질문이면 「사전에 추가」로 UC-07을 시작한다.',
            'A3. 처리한 기록만 골라 비울 수 있다.')],
        ['예외 흐름', _flow(
            'E1. 토큰이 없으면 401로 거부한다.',
            'E2. 상태 값이 new · resolved · ignored가 아니면 400으로 거부한다.')],
        ['사후 조건', '묶음의 상태(status)와 처리 시각(resolved_at)이 기록된다.'],
        ['관련', 'FR-07 · FR-12 / 5.2절'],
    ]),
    ('UC-10 데이터 점검', [
        ['행위자', '관리자'],
        ['사전 조건', '관리자가 토큰으로 관리자 화면의 잠금을 풀었다.'],
        ['기본 흐름', _flow(
            '1. 관리자가 대시보드의 「지금 점검」을 누른다.',
            '2. 시스템이 파일 지식베이스와 데이터베이스를 다시 읽어 졸업요건 · 동아리 · 지도 · 공지별로 확인한다.',
            '3. 시스템이 확인된 사실(✓)과 고칠 곳(⚠)을 한국어로 보여 준다.')],
        ['대안 흐름', 'A1. 검색 벡터가 빠진 동아리가 있으면 「검색 벡터 전체 다시 만들기」를 안내하고, 누르면 전체를 다시 임베딩한다.'],
        ['예외 흐름', _flow(
            'E1. 빠진 벡터 · 빈 소개 · 끊긴 사전 항목은 경고로 표시한다.',
            'E2. 토큰이 없으면 401로 거부한다.')],
        ['사후 조건', '점검은 데이터를 바꾸지 않는다(재색인을 누른 경우 제외).'],
        ['관련', 'FR-11 · FR-13 / 5.2절'],
    ]),
]

# ── 부록 F 비기능 요구사항 ──
NFR = [
    ['NFR-01', '응답 시간', '카카오 스킬 제한 5초 안에 응답',
     '공개 주소를 거친 질문 50개 왕복, 서버 쪽 80개 처리 시간 — 평균 5초 이내',
     '생성형 모델 호출 없음, 질문 임베딩 3초 제한, 실패 시 사전만으로 답함',
     '평균 125ms · 최대 0.23초, 서버 평균 27ms (5.6절)'],
    ['NFR-02', '정확성', '없는 정보를 지어내지 않음',
     '데이터에 없는 질문 30개의 단정 오답 5% 이하, 졸업기준 값 일치 95% 이상',
     'DB 값으로 템플릿 답변, 기준이 없으면 「가이드에 없음」과 학과 전화',
     '단정 오답 1 (3.3%), 7,880개 값 100% (5.3절 · 5.5절)'],
    ['NFR-03', '보안', '관리자 기능 외부 노출 금지, 내부 정보 유출 금지',
     '공개 주소로 관리자 경로 요청, 토큰 없는 · 틀린 요청, 카카오톡 문장 21건의 유출 시도',
     '터널은 스킬 · 상태 확인 경로만 공개, 관리자 API 토큰 필수(미설정 시 전부 거부), 답변은 저장된 값으로만',
     '외부 404 · 토큰 오류 401, 유출 0건 (5.9절)'],
    ['NFR-04', '개인정보', '개인 연락처 저장 금지',
     '저장된 값의 휴대폰 · 이메일 형식 개수, 입력 칸 · 엑셀 거부 시험',
     '구축 단계에서 개인정보 제거, 휴대폰 번호 저장 거부, 학생은 비식별 봇 사용자 키로만 구분',
     '저장된 번호 0건, 거부 시험 통과 (5.8절 · 5.9절)'],
    ['NFR-05', '비용', '운영 비용 0원',
     '유료 API 호출 수 0',
     '임베딩 모델을 운영 컴퓨터에서 실행(Ollama), 외부 언어 모델 API 미사용, ngrok 무료 고정 도메인',
     '유료 API 호출 0건'],
    ['NFR-06', '이식성', '다른 컴퓨터에 바로 설치',
     '빈 홈 폴더 · Node 22 · Python 3.9 · Ollama 없음 조건에서 설치와 전체 시험',
     '설치 스크립트 1개(부록 A), Ollama가 없으면 사전만으로 동작',
     '설치 · 전체 시험 통과 (4.3.3절)'],
]


# ── 부록 G 모듈 ──
def module_rows_server():
    rows = [
        ['표현', 'routes/kakao.ts', '카카오 스킬 요청 수신(POST /api/kakao/skill)'],
        ['', 'routes/admin.ts', '관리자 API — 동아리 · 졸업기준 · 올리기 · 사전 · 점검 · 재색인'],
        ['', 'routes/notices.ts', '공개 공지 목록, 관리자 공지 등록 · 수정 · 삭제 · 복원'],
        ['', 'routes/unanswered.ts', '미답변 묶음 조회 · 상태 변경 · 비우기'],
        ['', 'routes/graduation.ts', '졸업기준 공개 조회 API'],
        ['', 'routes/ask.ts', '웹 질의 API(POST /api/ask)'],
        ['', 'routes/health.ts', '상태 확인(GET /health)'],
        ['', 'middleware/adminAuth.ts', '관리자 토큰 검사, 미설정 시 전부 거부'],
        ['업무', 'services/kakaoDialog.ts', '대화 상태 · 발화로 기능 분기, 졸업요건 단계 흐름, 미답변 기록'],
        ['', 'services/kakaoSession.ts', '사용자별 대화 상태 저장'],
        ['', 'services/gradCriteria.ts', '공식 졸업기준 적재 · 조회, 학과명 · 별칭 해석, 답변 문장'],
        ['', 'services/gradImport.ts', '졸업기준 PDF 올리기 · 미리보기 · 적용 · 되돌리기'],
        ['', 'services/graduationService.ts', '보충 졸업요건(graduation_requirements) 조회 · 관리'],
        ['', 'services/collegeTaxonomy.ts', '단과대 → 학과 분류(현행 · 입학 당시)'],
        ['', 'services/kbGraduation.ts', '학과 원문 파일 경로 · 공개 주소'],
        ['', 'services/askService.ts', '동아리 질문 처리 — 정형 조회 · 하이브리드 검색 · 고지'],
        ['', 'services/clubKeywords.ts', '키워드 사전 읽기 · 편집 · 일치 판정'],
        ['', 'services/clubList.ts', '분과별 동아리 목록 · 상세 문장'],
        ['', 'services/clubStore.ts', '동아리 저장 · 검증 · 재임베딩'],
        ['', 'services/clubImport.ts', '동아리 엑셀 내려받기 · 올리기 · 미리보기 · 적용'],
        ['', 'services/clubInactive.ts', '활동이 확인되지 않은 동아리 안내'],
        ['', 'services/roomCode.ts', '호실 코드 · 건물 해석, 카카오맵 링크'],
        ['', 'services/noticeService.ts', '공지 조회 · 휴지통 · 자동 삭제'],
        ['', 'services/noticeSubscription.ts', '공지 알림 구독 · 새 공지 전달'],
        ['', 'services/unanswered.ts', '미답변 기록 · 묶음 · 이유 라벨'],
        ['', 'services/kbCheck.ts', '데이터 점검'],
        ['', 'services/reindex.ts', '동아리 임베딩 재색인'],
    ]
    return [[a, b, f'{_lines("src/" + b):,}', c] for a, b, c in rows]


def module_rows_other():
    rows = [
        ['자료 · 공통', 'src/db/database.ts', '', 'SQLite 연결, 테이블 생성 · 칼럼 추가 이전'],
        ['', 'src/embeddings/embedder.ts', '', '임베딩 계산(Ollama · 대체 구현), 모델 이름'],
        ['', 'src/embeddings/similarity.ts', '', '코사인 유사도'],
        ['', 'src/kakao/responseBuilder.ts', '', '카카오 응답 JSON 생성 — 말풍선 수 · 글자 수 제한을 한 곳에서'],
        ['', 'src/llm/provider.ts', '', '질문 분류 연결부 — 운영 설정은 규칙 기반이며 언어 모델을 호출하지 않음'],
        ['', 'src/app.ts', '', 'Express 앱 — 라우터 · 정적 파일 연결'],
        ['', 'src/index.ts', '', '서버 시작, 재색인 · 공지 휴지통 · 임베딩 모델 유지 주기 작업'],
        ['', f'src/types/ ({_count("src/types", "*.ts")}개)', '', '요청 · 응답 · 데이터 타입'],
        ['관리자 화면', 'public/admin/index.html', '', '화면 구조(대시보드 · 졸업요건 · 동아리 · 공지 · 미답변 카드)'],
        ['', 'public/admin/admin.js', '', '토큰 잠금 해제, 올리기 · 미리보기 · 적용, 편집 · 검색 동작'],
        ['', 'public/admin/admin.css', '', '화면 스타일'],
        ['도구 (Python)', f'tools/grad-extract/ ({_count("tools/grad-extract", "*.py")}개)', '', 'PDF 표를 선 · 글자 좌표로 복원, 정규화, JSON · 엑셀 출력'],
        ['', 'tools/club-excel/club_xlsx.py', '', '동아리 엑셀 읽기 · 쓰기'],
        ['', 'tools/map-crawl/crawl_campus_map.py', '', '강의실 안내 · 캠퍼스맵 수집'],
        ['시험 · 운영', f'scripts/ ({_count("scripts", "*")}개)', '', '기능 시험 14종, 평가 · 측정, 설치(setup.sh) · 전체 시험(test-all.sh)'],
    ]
    out = []
    for a, b, _, c in rows:
        path = b.split(' (')[0]
        out.append([a, b, f'{_lines(path):,}', c])
    return out


# ── 부록 H 데이터베이스 ──
DB_HEAD = ['테이블', '칼럼', '타입', '제약', '설명']
DB_W = [2.9, 3.0, 1.5, 2.4, 5.2]
CRIT_LABELS = [
    ('personality_self', '교양 — 인성 · 자기계발'), ('personality', '교양 — 인성'), ('communication', '교양 — 의사소통'),
    ('liberal_foreign', '교양 — 외국어'), ('digital', '교양 — 디지털'), ('academic_basic', '교양 — 학문기초'),
    ('convergence', '교양 — 융합교양'), ('foreign_common', '외국인 공통기초'), ('major_single', '전공 — 단수전공'),
    ('major_primary', '전공 — 다전공 시 주전공'), ('major_double', '전공 — 다전공 시 복수전공'),
    ('total_credits', '졸업학점'), ('gpa', '평점평균 기준'), ('volunteer', '봉사 기준'),
    ('lang_requirement', '외국어 졸업 요건'), ('lang_test', '외국어 시험 기준'), ('thesis', '졸업논문 · 시험'),
    ('notes', '비고'),
]
DB_CRITERIA = [
    ['graduation_criteria\n(공식 졸업기준, 523행)', 'id', 'INTEGER', 'PK, 자동 증가', '행 번호'],
    ['', 'dept_no', 'INTEGER', 'NOT NULL', '가이드의 학과 번호'],
    ['', 'department', 'TEXT', 'NOT NULL', '현행 학과명'],
    ['', 'program', 'TEXT', "NOT NULL, 기본 ''", '과정 구분(한 학과에 과정이 둘인 경우)'],
    ['', 'year_label', 'TEXT', 'NOT NULL', '학번 구간 원문 표기'],
    ['', 'year_from · year_to', 'INTEGER', 'NOT NULL', '학번 구간의 시작 · 끝'],
    ['', 'student_type', 'TEXT', 'NOT NULL', '학생 구분(신입생 · 편입생 × 내국인 · 외국인)'],
    ['', 'affiliation', 'TEXT', '', '그 학번 당시 소속 명칭'],
] + [['', c, 'TEXT', '', d] for c, d in CRIT_LABELS] + [
    ['', 'source_page', 'INTEGER', '', '원문 PDF 쪽 번호'],
]
DB_GRAD_AUX = [
    ['grad_departments\n(학과, 42행)', 'name', 'TEXT', 'PK', '현행 학과명'],
    ['', 'dept_no', 'INTEGER', 'NOT NULL', '가이드의 학과 번호'],
    ['', 'homepage_name', 'TEXT', '', '홈페이지 표기'],
    ['', 'phone', 'TEXT', '', '학과 사무실 전화(기준이 없을 때 안내)'],
    ['', 'status', 'TEXT', '', '운영 · 신설 · 모집 중단'],
    ['', 'pdf_url', 'TEXT', '', '학과 원문 PDF 주소'],
    ['department_aliases\n(별칭, 101행)', 'alias_key', 'TEXT', 'PK', '비교용 별칭 키'],
    ['', 'alias', 'TEXT', 'NOT NULL', '별칭 원문(옛 이름 · 줄임말 · 다른 표기)'],
    ['', 'department', 'TEXT', 'NOT NULL', '연결된 현행 학과명'],
    ['grad_import_batches\n(PDF 올리기 기록)', 'id', 'TEXT', 'PK', '올리기 묶음 ID'],
    ['', 'status', 'TEXT', "NOT NULL, 기본 'preview'", 'preview · applied · reverted · discarded'],
    ['', 'files_json', 'TEXT', "NOT NULL, 기본 '[]'", '파일별 판별 학과 · 바뀐 칸'],
    ['', 'before_json', 'TEXT', '', '적용 전 값(되돌리기용)'],
    ['', 'created_at · applied_at · reverted_at', 'TEXT', 'created_at NOT NULL', '올린 · 적용한 · 되돌린 시각'],
    ['graduation_requirements\n(보충 기준, 현재 0행)', 'id', 'TEXT', 'PK', '기준 ID'],
    ['', 'admission_year · department', 'INTEGER · TEXT', 'NOT NULL, 복합 UNIQUE', '입학 연도 · 학과(전공 구분까지 같은 기준은 하나만)'],
    ['', 'major_type · track', 'TEXT', 'major_type 복합 UNIQUE', '전공 구분 · 트랙'],
    ['', 'total_credits · major_credits · general_credits', 'INTEGER', '', '졸업 · 전공 · 교양 학점'],
    ['', 'thesis_required', 'INTEGER', '', '졸업논문 필요 여부(0 · 1)'],
    ['', 'english_requirement · license_requirement', 'TEXT', '', '영어 · 자격 요건'],
    ['', 'notes · source_url · verified_at', 'TEXT', '', '비고 · 출처 · 확인 시각'],
    ['', 'updated_at', 'TEXT', 'NOT NULL', '수정 시각'],
]
DB_CLUB = [
    ['clubs\n(동아리, 61행)', 'id', 'TEXT', 'PK', '동아리 ID'],
    ['', 'name', 'TEXT', 'NOT NULL', '동아리 이름(같은 이름 추가 거부)'],
    ['', 'category', 'TEXT', 'NOT NULL', '분과(체육 · 문화예술 · 학술 · 봉사 · 취미 · 취업 · 종교)'],
    ['', 'summary', 'TEXT', "NOT NULL, 기본 ''", '한두 줄 소개(목록용)'],
    ['', 'intro · activities', 'TEXT', "NOT NULL, 기본 ''", '소개 · 활동 내용'],
    ['', 'contact', 'TEXT', '', '공식 연락 경로(개인 휴대폰 번호 거부)'],
    ['', 'meeting_time · location', 'TEXT', '', '정기 모임 시간 · 활동 장소'],
    ['', 'source_url', 'TEXT', 'NOT NULL', '출처 주소'],
    ['', 'created_at · updated_at', 'TEXT', 'NOT NULL', '만든 · 고친 시각'],
    ['embeddings\n(검색 벡터, 183행)', 'id', 'INTEGER', 'PK, 자동 증가', '조각 번호'],
    ['', 'club_id', 'TEXT', 'NOT NULL, FK → clubs.id', '동아리(삭제 시 함께 삭제)'],
    ['', 'chunk_kind', 'TEXT', 'NOT NULL', '조각 종류(intro · activities · combined)'],
    ['', 'chunk_text', 'TEXT', 'NOT NULL', '임베딩한 문장'],
    ['', 'embedding_json', 'TEXT', 'NOT NULL', '1,024차원 벡터(JSON)'],
    ['', 'embed_model', 'TEXT', "NOT NULL, 기본 ''", '벡터를 만든 모델 이름(바뀌면 재색인)'],
    ['', 'updated_at', 'TEXT', 'NOT NULL', '만든 시각'],
    ['club_import_batches\n(엑셀 올리기 기록)', 'id', 'TEXT', 'PK', '올리기 묶음 ID'],
    ['', 'status', 'TEXT', "NOT NULL, 기본 'preview'", 'preview · applied · reverted · discarded'],
    ['', 'file', 'TEXT', "NOT NULL, 기본 ''", '올린 파일 이름'],
    ['', 'rows_json · diff_json', 'TEXT', "NOT NULL, 기본 '[]' · '{}'", '읽은 행 · 바뀐 칸'],
    ['', 'before_json', 'TEXT', '', '적용 전 값(되돌리기용)'],
    ['', 'created_at · applied_at · reverted_at', 'TEXT', 'created_at NOT NULL', '올린 · 적용한 · 되돌린 시각'],
]
DB_NOTICE = [
    ['notices\n(공지)', 'id', 'TEXT', 'PK', '공지 ID'],
    ['', 'title · body', 'TEXT', 'NOT NULL', '제목 · 본문'],
    ['', 'link_url', 'TEXT', '', '링크(javascript: 거부)'],
    ['', 'pinned', 'INTEGER', 'NOT NULL, 기본 0', '고정 여부'],
    ['', 'published', 'INTEGER', 'NOT NULL, 기본 1', '게시 여부(0 = 초안)'],
    ['', 'starts_at · ends_at', 'TEXT', '', '게시 시작 · 종료(지나면 휴지통)'],
    ['', 'trashed_at', 'TEXT', '', '휴지통에 들어간 시각(30일 뒤 삭제)'],
    ['', 'created_at · updated_at', 'TEXT', 'NOT NULL', '만든 · 고친 시각'],
    ['notice_subscribers\n(구독자)', 'user_key', 'TEXT', 'PK', '카카오 봇 사용자 키(비식별)'],
    ['', 'subscribed_at', 'TEXT', 'NOT NULL', '구독 시각'],
    ['notice_deliveries\n(전달 기록)', 'user_key · notice_id', 'TEXT', '복합 PK', '같은 공지를 같은 학생에게 한 번만'],
    ['', 'delivered_at', 'TEXT', 'NOT NULL', '전달 시각'],
]
DB_OPS = [
    ['kakao_sessions\n(대화 상태)', 'user_key', 'TEXT', 'PK', '카카오 봇 사용자 키(비식별)'],
    ['', 'flow', 'TEXT', "NOT NULL, 기본 'menu'", '대화 단계(menu · grad_year · grad_college · grad_dept · grad_result · clubs · map_room · done)'],
    ['', 'admission_year', 'INTEGER', '', '고른 학번'],
    ['', 'college · department', 'TEXT', '', '고른 단과대 · 학과'],
    ['', 'updated_at', 'TEXT', 'NOT NULL', '마지막 대화 시각'],
    ['unanswered_questions\n(미답변)', 'id', 'INTEGER', 'PK, 자동 증가', '기록 번호'],
    ['', 'question', 'TEXT', 'NOT NULL', '학생이 보낸 문장'],
    ['', 'reason · route', 'TEXT', 'reason NOT NULL', '답하지 못한 이유 코드 · 처리 경로'],
    ['', 'status', 'TEXT', "NOT NULL, 기본 'new'", 'new · resolved · ignored'],
    ['', 'created_at · resolved_at', 'TEXT', 'created_at NOT NULL', '기록 · 처리 시각'],
]


def add(t):
    t.h2('D.', '기능 요구사항 명세').paragraph_format.page_break_before = True  # 명세 부록은 새 쪽에서
    t.p('⟦표:fr⟧(요약)의 전체 명세다. 인터페이스의 「…」는 /api/admin을 줄인 것이다.')
    parts = [('학생 기능 FR-01~03', FR_STUDENT[:3]), ('학생 기능 FR-04~06', FR_STUDENT[3:]),
             ('관리자 기능 FR-07~10', FR_ADMIN[:4]), ('관리자 기능 FR-11~13', FR_ADMIN[4:])]
    for i, (name, rows) in enumerate(parts, 1):
        t.table(f'기능 요구사항 명세 ({i}) — {name}', FR_HEAD, rows, FR_W, size=8, label=f'frfull{i}', left_cols=(2, 3, 4))

    t.h2('E.', '유스케이스 명세').paragraph_format.page_break_before = True  # 명세 부록은 새 쪽에서
    t.p('⟦표:ucspec⟧(요약)의 전체 명세다. 대안 흐름(A)은 정상적으로 끝나는 다른 경로, 예외 흐름(E)은 거부 · 안내로 끝나는 경로다.')
    for i, (name, rows) in enumerate(UC_ROWS, 1):
        t.table(f'{name} 유스케이스 명세', ['항목', '내용'], rows, [2.4, 12.6], size=8.5,
                label=f'ucfull{i}', left_cols=(1,))

    t.h2('F.', '비기능 요구사항 명세').paragraph_format.page_break_before = True  # 명세 부록은 새 쪽에서
    t.p('⟦표:nfr⟧(요약)의 전체 명세다.')
    t.table('비기능 요구사항 명세', ['ID', '구분', '요구사항', '측정 방법 · 기준', '설계 반영', '결과'], NFR,
            [1.4, 1.3, 2.3, 3.4, 3.8, 2.8], size=8, label='nfrfull', left_cols=(2, 3, 4, 5))

    t.h2('G.', '모듈 명세').paragraph_format.page_break_before = True  # 명세 부록은 새 쪽에서
    t.p('⟦표:modules⟧(요약)의 전체 명세로, 파일별 역할과 줄 수(빈 줄 포함)를 적었다. 서버 파일 경로는 src/ 아래다.')
    t.table('서버 모듈 명세 (1) — 표현 · 업무 계층', ['계층', '파일', '줄', '역할'], module_rows_server(),
            [1.6, 4.6, 1.0, 7.8], size=8, label='modfull1', left_cols=(1, 3))
    t.table('서버 모듈 명세 (2) — 자료 · 공통 계층, 관리자 화면, 도구', ['계층', '파일', '줄', '역할'], module_rows_other(),
            [1.9, 4.8, 1.0, 7.3], size=8, label='modfull2', left_cols=(1, 3))

    t.h2('H.', '데이터베이스 테이블 명세').paragraph_format.page_break_before = True  # 명세 부록은 새 쪽에서
    t.p('⟦표:tables⟧(요약)의 전체 명세로, 운영 데이터베이스의 실제 구조(SQLite PRAGMA)에서 옮겼다. 행 수는 11월 11일 기준이며, 졸업기준 값은 원문 표기 그대로의 문자열(예: 「57+모듈1」, 「-」)로 저장한다.')
    t.table('졸업요건 테이블 명세 (1) — graduation_criteria', DB_HEAD, DB_CRITERIA, DB_W, size=8, label='dbfull1',
            left_cols=(4,), note='색인: (department, student_type, year_from, year_to)')
    t.table('졸업요건 테이블 명세 (2) — 학과 · 별칭 · 올리기 기록 · 보충 기준', DB_HEAD, DB_GRAD_AUX, DB_W, size=8,
            label='dbfull2', left_cols=(4,), note='graduation_requirements는 (admission_year, department, major_type) 유일')
    t.table('동아리 테이블 명세', DB_HEAD, DB_CLUB, DB_W, size=8, label='dbfull3', left_cols=(4,),
            note='색인: clubs(name), clubs(category), embeddings(club_id)')
    t.table('공지 테이블 명세', DB_HEAD, DB_NOTICE, DB_W, size=8, label='dbfull4', left_cols=(4,),
            note='색인: notices(published, pinned, updated_at), notice_deliveries(notice_id)')
    t.table('운영 테이블 명세', DB_HEAD, DB_OPS, DB_W, size=8, label='dbfull5', left_cols=(4,),
            note='색인: unanswered_questions(created_at)')
