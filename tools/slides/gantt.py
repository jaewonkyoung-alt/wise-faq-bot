"""간트차트 — 주차별 덱이 같은 데이터를 쓴다. 일정이 바뀌면 여기만 고친다.

2026-10-09 수정: 학과 졸업논문 일정 반영
  심사신청서 접수 11/2(월)~11/6(금) 15시 (지도교수 날인) · 심사 11/9(월)~11/13(금) 17시
  -> 버퍼 기간 앞쪽에 논문·포스터 초안, 실질 마감은 11/13 (원래 제출일 11/15는 일요일)
"""
from lib import *

WEEKS = ["1주\n9/7", "2주\n9/14", "3주\n9/21", "4주\n9/28", "5주\n10/5", "6주\n10/12",
         "7주\n10/19", "8주\n10/26", "9주\n11/2", "10주\n11/9"]

# (작업, 시작 주, 끝 주, 상태)  상태: done 완료 · now 진행 중 · plan 예정
GANTT_W6 = [
    ("문제정의 · 관리자 웹 · 졸업요건/지도 KB", 1, 2, "done"),
    ("설계 산출물 확정 · 문서화", 3, 3, "done"),
    ("공지 CRUD · 카톡 공지 알림", 3, 4, "done"),
    ("졸업요건 실데이터 연결 · 정답표 검증", 4, 5, "done"),
    ("동아리 1차 · 지도 실데이터 수집", 5, 5, "done"),
    ("고정 스킬 URL · 실기기 E2E", 4, 6, "now"),
    ("공통 기준 3종 · 실제 임베딩 · 동아리 2차", 6, 7, "now"),
    ("미답변 화면(FR-12) · KB 검증(FR-11)", 6, 7, "now"),
    ("보안 · 운영 · 테스트케이스 실행 · 기능 완성(10/25)", 7, 7, "plan"),
    ("버그픽스 · 논문 · 포스터 초안", 8, 8, "plan"),
    ("지도교수 날인 · 심사신청서(~11/6 15시)", 9, 9, "plan"),
    ("통합 시험 · 데모 리허설", 9, 9, "plan"),
    ("최종 발표(11/9) · 논문 심사(~11/13)", 10, 10, "plan"),
]

NOTE_W6 = "기능 완성 10/25 · 심사신청서 11/2~11/6 15시(날인) · 최종 발표 11/9 · 논문 심사·실질 마감 11/13"


def gantt_slide(d, title="1. 간트차트", rows=GANTT_W6, note=NOTE_W6):
    s = d.slide(title)
    data = [["작업"] + WEEKS] + [[t] + [""] * 10 for t, *_ in rows]
    row_h = min(0.43, 5.0 / len(rows))
    shp = table(s, 0.55, 1.05, 12.2, [3.6] + [0.86] * 10, data, size=10.5, header_size=10, row_h=row_h)
    tbl = shp.table
    tbl.rows[0].height = Inches(0.55)
    fills = {"done": NAVY, "now": "6E6E6E", "plan": NAVY2}
    for i, (t, a, b, st) in enumerate(rows, 1):
        for w in range(1, 11):
            c = tbl.cell(i, w)
            c.fill.solid()
            c.fill.fore_color.rgb = rgb(fills[st] if a <= w <= b else (WHITE if i % 2 else LIGHT2))
    y = 1.05 + 0.55 + row_h * len(rows) + 0.2
    for i, (lb, col) in enumerate([("완료", NAVY), ("진행 중", "6E6E6E"), ("예정", NAVY2)]):
        rect(s, 0.55 + i * 1.3, y + 0.03, 0.28, 0.2, fill=col)
        label(s, 0.9 + i * 1.3, y, 1.0, 0.26, lb, size=11, align=PP_ALIGN.LEFT)
    label(s, 4.6, y, 8.2, 0.26, note, size=11, color=GRAY, align=PP_ALIGN.LEFT)
    return s


if __name__ == "__main__":
    import sys
    d = Deck()
    gantt_slide(d)
    out = sys.argv[1] if len(sys.argv) > 1 else "gantt_w6.pptx"
    d.save(out)
    print(out)
