"""6주차 발표 이미지 — w5_capture 의 그리기 함수를 그대로 쓴다.

  W5_SRC=<6주차 증거 폴더> python3 tools/slides/w6_capture.py
    kakao_responses_w5.json   실제 handleKakaoDialog 응답 + 'before' 는 실기기(카카오 서버) 요청의 실제 응답(ngrok 기록)
    ev/*.txt                  명령 실행 출력
    raw/ob_deploy_full.jpg    오픈빌더 배포 히스토리 캡처 (앱 내장 브라우저)
"""
import os

from PIL import Image, ImageDraw, ImageFont, ImageOps

import w5_capture as w5

SRC, OUT = w5.SRC, w5.OUT


def crop_top(src, dst, h):
    """긴 카톡 화면에서 위쪽(상단바 + 첫 부분)만 — 슬라이드에서 읽히도록"""
    im = Image.open(os.path.join(OUT, f"{src}.png"))
    top = im.crop((0, 0, im.size[0], 200))
    body = im.crop((0, 200, im.size[0], 200 + h))
    out = Image.new("RGB", (im.size[0], 200 + h), (186, 206, 224))
    out.paste(top, (0, 0))
    out.paste(body, (0, 200))
    p = os.path.join(OUT, f"{dst}.png")
    out.save(p)
    print(p, out.size)


def mask_deploy():
    """배포 히스토리 캡처에서 표 부분만 자르고 계정 이메일을 가린다."""
    im = Image.open(os.path.join(SRC, "raw", "ob_deploy_full.jpg")).convert("RGB")
    im = im.crop((150, 80, 800, 330))
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/AppleSDGothicNeo.ttc", 12)
    except OSError:
        font = None
    for y in (158, 189, 219):  # 배포한 사람 칸 (행마다) — 이메일 전체를 덮는다
        d.rectangle((220, y - 15, 352, y + 13), fill=(255, 255, 255))
        d.text((226, y - 8), "본인 계정", fill=(90, 90, 90), font=font)
    d.rectangle((0, 0, 650, 2), fill=(255, 255, 255))
    im = im.resize((im.size[0] * 2, im.size[1] * 2), Image.LANCZOS)
    im = ImageOps.grayscale(im).convert("RGB")  # 파란 버튼 · 탭 — 덱은 흑백회만
    p = os.path.join(OUT, "w6-ob-deploy.png")
    im.save(p)
    print(p, im.size)


if __name__ == "__main__":
    F = "kakao_responses_w5.json"
    w5.kakao("w6-kakao-before", [("before", 0)], file=F, height=900)
    w5.kakao("w6-kakao-list", [("list", 0)], file=F)
    w5.kakao("w6-kakao-sport", [("sport", 0)], file=F, height=2300)
    crop_top("w6-kakao-sport", "w6-kakao-sport-top", 1700)
    w5.kakao("w6-kakao-name", [("name", 0), ("name", 1)], file=F, height=1100)
    w5.kakao("w6-kakao-bare", [("bare", 0), ("bare", 1)], file=F)

    w5.term("ops.txt", "w6-term-ops", "운영 상태 · 카카오 요청 기록", width=860, font=12.5)
    w5.term("ops_a.txt", "w6-term-ops-a", "상시 실행 · 외부 공개 경로", width=760, font=13)
    w5.term("ops_b.txt", "w6-term-ops-b", "카카오 서버 요청 기록 (ngrok)", width=760, font=13)
    w5.term("bugfix.txt", "w6-term-bugfix", "수정 확인 테스트", width=700, font=12.5)
    w5.term("all.txt", "w6-term-all", "전체 테스트 · 평가", width=760, font=12.5)
    w5.term("clublist.txt", "w6-term-clublist", "npm run test:club-list (주요 항목)", width=760, font=12.5,
            keep=lambda l: l.startswith("$") or any(k in l for k in ("시드 61", "소개 (90", "합 = 61", "잘림 없음", "합치면", "카톡", "61개 이름", "PASS test")))

    w5.code("deploy/ngrok-policy.yml", 1, 9, "w6-code-policy", width=820, font=13)
    w5.code("src/services/clubList.ts", 82, 95, "w6-code-split", width=760, font=12.5)
    w5.code("scripts/test-notices.ts", 10, 14, "w6-code-testdb", width=900, font=12.5)

    mask_deploy()
