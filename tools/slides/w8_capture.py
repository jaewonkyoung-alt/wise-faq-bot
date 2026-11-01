"""8주차 발표 이미지 — w5_capture 의 그리기 함수를 그대로 쓴다.

  W5_SRC=<8주차 증거 폴더> python3 tools/slides/w8_capture.py
    kakao_responses_w8.json   임시 서버(새 DB · 실제 임베딩)에 보낸 카톡 질문의 실제 응답
    ev/*.txt                  명령 실행 출력 (npm test · eval-goals · eval-clubs · setup.sh)
관리자 화면(w8-admin-*.png)은 같은 임시 서버를 헤드리스 크롬으로 찍어 카드만 잘라 흑백으로 바꿨다.
"""
import w5_capture as w5

if __name__ == "__main__":
    F = "kakao_responses_w8.json"
    w5.kakao("w8-kakao-yt-before", [("kal_before", 1)], file=F, height=844)
    w5.kakao("w8-kakao-yt-after", [("kal_after", 1)], file=F, height=844)
    w5.kakao("w8-kakao-ski", [("ski", 0)], file=F, height=1000)
    w5.kakao("w8-kakao-lunch", [("lunch", 0)], file=F, height=844)
    w5.kakao("w8-kakao-notice", [("notice", 0)], file=F, height=844)

    w5.term("all.txt", "w8-term-all", "전체 테스트 15종 + 동아리 평가", width=760, font=13)
    w5.term("speed.txt", "w8-term-speed", "응답 시간 · 관리자 수정 반영 시간 실측", width=900, font=12.5)
    w5.term("ood.txt", "w8-term-ood", "데이터에 없는 동아리 질문 20개", width=760, font=12.5)
    w5.term("eval.txt", "w8-term-eval", "동아리 검색 정확도 — 구성별 비교", width=720, font=13)
    w5.term("setup.txt", "w8-term-setup", "새로 받은 저장소에서 설치 한 번", width=860, font=12.5)
    w5.term("e2e.txt", "w8-term-e2e", "공개 주소(ngrok)를 거친 종단 간 응답 시간", width=860, font=12.5)
