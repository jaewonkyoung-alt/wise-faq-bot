"""7주차 발표 이미지 — w5_capture 의 그리기 함수를 그대로 쓴다.

  W5_SRC=<7주차 증거 폴더> python3 tools/slides/w7_capture.py
    kakao_responses_w7.json   handleKakaoDialog 실제 응답 (운영 DB 복사본 · 실제 임베딩)
                              before_* 는 지난주 커밋 c9e0dab 코드로 같은 질문을 돌린 실제 응답
    ev/*.txt                  명령 실행 출력
    raw/admin_*.png           관리자 웹 실제 캡처 (운영 DB 복사본으로 띄운 임시 서버)
"""
import os

from PIL import Image, ImageOps

import w5_capture as w5

SRC, OUT = w5.SRC, w5.OUT


def crop_answer_top(src, dst, h):
    """긴 답이 화면 아래쪽에 붙어 있을 때 — 상단바 + 질문부터 h 픽셀만"""
    im = Image.open(os.path.join(OUT, f"{src}.png")).convert("RGB")
    W, H = im.size
    bg = im.getpixel((5, 400))
    y0 = next(y for y in range(220, H) if any(abs(a - b) > 12 for x in range(0, W, 6) for a, b in zip(im.getpixel((x, y)), bg)))
    out = Image.new("RGB", (W, 200 + h), bg)
    out.paste(im.crop((0, 0, W, 200)), (0, 0))
    out.paste(im.crop((0, y0 - 30, W, y0 - 30 + h)), (0, 200))
    p = os.path.join(OUT, f"{dst}.png")
    out.save(p)
    print(p, out.size)


def gray(src, dst, width=1400):
    """관리자 화면 캡처 — 주황 버튼 · 링크가 있어 흑백으로 (덱은 흑백회만)"""
    im = Image.open(os.path.join(SRC, "raw", src)).convert("RGB")
    im = ImageOps.grayscale(im).convert("RGB")
    if im.size[0] > width:
        im = im.resize((width, int(im.size[1] * width / im.size[0])), Image.LANCZOS)
    p = os.path.join(OUT, f"{dst}.png")
    im.save(p)
    print(p, im.size)


if __name__ == "__main__":
    F = "kakao_responses_w7.json"
    w5.kakao("w7-kakao-grad", [("grad", 0)], file=F, height=900)
    w5.kakao("w7-kakao-before", [("before_coding", 0)], file=F, height=844, raw=True)
    w5.kakao("w7-kakao-after", [("coding", 1)], file=F, height=844)
    w5.kakao("w7-kakao-chess-before", [("before_chess", 0)], file=F, height=2400, raw=True)
    crop_answer_top("w7-kakao-chess-before", "w7-kakao-chess-before-top", 1500)
    w5.kakao("w7-kakao-chess", [("chess", 1)], file=F, height=844)
    w5.kakao("w7-kakao-soccer", [("soccer", 1)], file=F, height=1250)
    crop_answer_top("w7-kakao-soccer", "w7-kakao-soccer-top", 1500)
    w5.kakao("w7-kakao-meet", [("kendo", 1), ("tea", 1)], file=F, height=900)
    w5.kakao("w7-kakao-inactive", [("sonak", 1), ("party", 1)], file=F, height=900)

    w5.term("selftest.txt", "w7-term-selftest", "원본 PDF 42개 -> 기존 검수 데이터와 대조", width=760, font=13)
    w5.term("gradimport.txt", "w7-term-gradimport", "PDF 올리기 · 미리보기 · 적용 · 되돌리기 테스트", width=760, font=12)
    w5.term("eval.txt", "w7-term-eval", "동아리 검색 평가 — 임베딩 · 키워드 사전 조합", width=860, font=13)
    w5.term("embed.txt", "w7-term-embed", "로컬 임베딩 실행 확인", width=760, font=13)
    w5.term("crawl.txt", "w7-term-crawl", "에브리타임 2차 수집 반영 결과", width=760, font=13)
    w5.term("clubanswers.txt", "w7-term-clubanswers", "npm run test:club-answers (주요 항목)", width=820, font=12.5,
            keep=lambda l: l.startswith("$") or any(k in l for k in ("노출 없음", "한 줄", "축구 6곳", "비었다고", "MVP", "Ollama 꺼짐: 키워드", "보존", "딱 맞는", "0.5 미만", "2차 수집", "휴대폰", "옛 목록", "PASS test")))
    w5.term("all.txt", "w7-term-all", "전체 테스트 · 평가", width=760, font=12.5)

    w5.code("tools/grad-extract/extract.py", 29, 35, "w7-code-cell", width=980, font=12.5)
    w5.code("tools/grad-extract/pdf_to_criteria.py", 73, 84, "w7-code-identify", width=980, font=12.5)
    w5.code("src/embeddings/embedder.ts", 117, 124, "w7-code-ollama", width=980, font=12.5)
    w5.code("src/services/askService.ts", 216, 222, "w7-code-accept", width=1000, font=12.5)

    gray("admin_list.png", "w7-admin-list")
    gray("admin_detail.png", "w7-admin-detail")
    gray("admin_preview.png", "w7-admin-preview")
    gray("admin_applied.png", "w7-admin-applied")
