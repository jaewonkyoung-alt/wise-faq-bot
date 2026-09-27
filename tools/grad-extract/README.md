# 졸업요건 PDF → 엑셀 추출 스크립트

학교 「학사제도 및 졸업이수가이드」(https://wise.dongguk.ac.kr/page/155) 학과별 PDF를 표로 구조화한다.
결과물: `data/graduation-source/2021212843_경재원_졸업요건_학과별_정리.xlsx`

PDF 표가 선이 아니라 도형으로 그려져 있어 pdfplumber 표 인식이 실패한다.
그래서 선분 좌표로 셀을 직접 복원한다(병합 셀 포함).

| 파일 | 역할 |
|---|---|
| `extract.py` | PDF 한 개 → 병합 셀을 채운 2D 그리드(JSON) |
| `normalize.py` | 그리드 → 레코드 (기준표 · 졸업논문 · 필수과목 · 각주) |
| `build_xlsx.py` | 레코드 → 엑셀 9개 시트 |

## 다시 만들기

```bash
python3 -m venv .venv && .venv/bin/pip install pdfplumber openpyxl
# 1) PDF를 raw/2026_NN.pdf 로 저장 (NN = 08~49, URL: /resources/files/course/2026/NN.pdf)
# 2) 그리드 추출
for n in $(seq -w 8 49); do .venv/bin/python -c "import json,sys; from extract import extract; json.dump(extract('raw/2026_$n.pdf'), open('out/$n.json','w'), ensure_ascii=False)"; done
# 3) 엑셀
.venv/bin/python build_xlsx.py
```

- `normalize.py` 의 `BASE` 는 원본 PDF·manifest.csv 가 있는 외장 SSD 경로다. 다른 곳에서 돌리면 바꿀 것.
- 원본 PDF는 학교 자료라 레포에 넣지 않았다. 목록·URL·SHA-256은 `data/graduation-source/manifest.csv`.
- 검증: PDF 텍스트와 교차 대조 198건 일치, 5개 학과 원본 이미지 대조.
