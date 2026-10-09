"""WISE 캠퍼스 지도 데이터 수집 → data/kb/지도/{buildings,places,rooms}.json

출처 (학교 홈페이지, 로그인 불필요)
  1) 강의실 안내   https://wise.dongguk.ac.kr/page/861        호실코드 · 건물명 · 호실명 · 구분 · 수용인원
  2) 캠퍼스맵      https://wise.dongguk.ac.kr/campus/map       건물 번호 · [코드] · 이름 · 위도/경도
  3) 건물 상세     /ajax/campusMap/detail?campusmap_seq=N      영문명 · 소개 · 준공연도 · 층수 · 편의시설

두 출처의 건물 이름이 서로 다르다 (예: 강의실 표 '의학관' ↔ 지도 '[H] 의과대학',
'백상관' ↔ '백상관(금장생활관 반야동)'). 코드 → 지도 표기 → 앞부분 일치 → 수동 표 순서로 맞춘다.

  python3 tools/map-crawl/crawl_campus_map.py            # 내려받아 생성
  python3 tools/map-crawl/crawl_campus_map.py --cache D  # D 폴더의 저장본으로 생성 (재현용)
"""
import argparse
import datetime as dt
import html
import json
import os
import re
import time
import urllib.request

BASE = "https://wise.dongguk.ac.kr"
UA = {"User-Agent": "Mozilla/5.0 (wise-faq-bot capstone; campus map sync)"}
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
OUT = os.path.join(ROOT, "data", "kb", "지도")

# 강의실 표 건물명 → 지도 표기. 코드·이름으로 안 맞는 것만 적는다.
MANUAL_PLACE = {
    "생활관": "금장생활관 법당",  # F201 '생활관법당' 한 호실뿐
}

# 학생들이 실제로 부르는 이름 (지도 표기에 없는 것만)
ALIASES = {
    "100주년기념관": ["본관", "백주년기념관", "100주년", "백주년"],
    "도서관": ["학술정보원", "중앙도서관"],
    "학생회관, 스페이스 위콤버": ["학생회관", "학관", "스페이스 위콤버", "위콤버"],
    "의과대학": ["의학관", "의대"],
    "한의학관": ["한의대"],
    "문무관": ["체육관", "실내체육관"],
    "에너지공학관": ["에공관"],
    "자연과학관": ["자과관"],
    "금장생활관 법당": ["생활관 법당", "생활관법당"],
    "대운동장": ["운동장"],
    "노천강당": ["노천극장"],
    "동국대학교경주병원(병원동)": ["경주병원", "동국대병원", "병원"],
    "백상관(금장생활관 반야동)": ["백상관", "반야동"],
    "금장생활관(연화동)": ["연화동"],
    "금강동(금장생활관)": ["금강동"],
    "금장생활관(금장생활관(보현/미륵/관음/문수동)": ["보현동", "미륵동", "관음동", "문수동"],
}
# 답변에 쓸 짧은 이름 (지도 표기가 길거나 강의실 표와 다른 곳)
DISPLAY = {
    "학생회관, 스페이스 위콤버": "학생회관",
    "백상관(금장생활관 반야동)": "백상관",
    "의과대학": "의학관(의과대학)",
    "금장생활관(금장생활관(보현/미륵/관음/문수동)": "금장생활관(보현·미륵·관음·문수동)",
}
# 여러 곳을 가리키는 말 — 답변에서 후보를 모두 보여 준다
GROUPS = {
    "기숙사": ["금장생활관(금장생활관(보현/미륵/관음/문수동)", "금장생활관(연화동)",
             "백상관(금장생활관 반야동)", "금강동(금장생활관)"],
    "금장생활관": ["금장생활관(금장생활관(보현/미륵/관음/문수동)", "금장생활관(연화동)",
               "백상관(금장생활관 반야동)", "금강동(금장생활관)"],
}


def get(url, cache, name):
    path = os.path.join(cache, name) if cache else None
    if path and os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            return f.read()
    req = urllib.request.Request(BASE + url, headers=UA)
    body = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "ignore")
    if path:
        with open(path, "w", encoding="utf-8") as f:
            f.write(body)
    time.sleep(1.2)  # 학교 서버 배려
    return body


def strip(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s))).strip()


def parse_rooms(page):
    rows = []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", page, flags=re.S)[1:]:
        c = [strip(x) for x in re.findall(r"<t[dh][^>]*>(.*?)</t[dh]>", tr, flags=re.S)]
        if len(c) >= 6 and re.fullmatch(r"[A-Z]+\d{3}", c[2]):
            rows.append({"code": c[2], "building": c[1], "name": c[3], "type": c[4],
                         "capacity": int(c[5]) if c[5].isdigit() else None})
    return rows


def parse_map(page):
    places = []
    for b in re.split(r'<li onclick="', page)[1:]:
        m = re.match(r"fn_openInfo\((\d+),([\d.]+),([\d.]+)\)", b)
        if not m:
            continue
        num = re.search(r'cp_idx num">\s*(\d+)', b).group(1)
        title = strip(re.search(r'cp_tit">(.*?)</span>', b, re.S).group(1))
        places.append({"seq": int(m.group(1)), "no": int(num), "name": title,
                       "lat": round(float(m.group(2)), 7), "lng": round(float(m.group(3)), 7)})
    return places


def parse_detail(raw):
    d = json.loads(raw)
    body = html.unescape(re.sub(r"</?br\s*/?>", "\n", d.get("content") or ""))
    parts = re.split(r"\n\s*[=＝]{3}\s*\n", body)
    intro = parts[0].strip()
    meta = parts[1] if len(parts) > 1 else ""
    facts = {}
    for line in (meta + "\n" + body).splitlines():
        mm = re.match(r"\s*◎\s*([^:：]+?)\s*[:：]\s*(.+)", line)
        if mm:
            facts.setdefault(mm.group(1).strip(), mm.group(2).strip())
    floors = facts.get("층수") or facts.get("규모") or ""
    above = re.search(r"지상\s*(\d+)\s*층", floors)
    below = re.search(r"지하\s*(\d+)\s*층", floors)
    sign = re.search(r"\[(\w+)\]", d.get("mark") or "")
    return {
        "code": sign.group(1) if sign else None,
        "name_en": (d.get("title_eng") or "").strip() or None,
        "intro": re.sub(r"\s+", " ", intro).strip(),
        "built": facts.get("준공연도"),
        "floors_above": int(above.group(1)) if above else None,
        "floors_below": int(below.group(1)) if below else 0,
        "facilities": facts.get("편의시설"),
        "photos": len(d.get("campusFileList") or []),
    }


def first_sentences(t, limit=110):
    out = ""
    for s in re.split(r"(?<=[.다])\s+", t):
        if len(out) + len(s) > limit and out:
            break
        out = (out + " " + s).strip()
    return out if len(out) <= limit else out[: limit - 1].rstrip(" ,") + "…"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache", help="원본 저장 폴더 (있으면 재사용, 없으면 내려받아 저장)")
    a = ap.parse_args()
    if a.cache:
        os.makedirs(a.cache, exist_ok=True)

    rooms = parse_rooms(get("/page/861", a.cache, "page861.html"))
    places = parse_map(get("/campus/map", a.cache, "campus_map.html"))
    for p in places:
        p.update(parse_detail(get(f"/ajax/campusMap/detail?campusmap_seq={p['seq']}", a.cache,
                                  f"detail_{p['seq']}.json")))

    by_code = {p["code"]: p for p in places if p["code"]}
    by_name = {p["name"]: p for p in places}

    # 강의실 표의 건물 → 지도 위치
    room_buildings = {}
    for r in rooms:
        room_buildings.setdefault(r["building"], set()).add(re.match(r"[A-Z]+", r["code"]).group(0))
    buildings, how = {}, {}
    for bname, codes in sorted(room_buildings.items()):
        assert len(codes) == 1, (bname, codes)
        code = codes.pop()
        p, rule = by_code.get(code), "코드"
        if not p and bname in by_name:
            p, rule = by_name[bname], "이름"
        if not p:
            p = next((x for x in places if x["name"].startswith(bname)), None)
            rule = "앞부분"
        if not p and bname in MANUAL_PLACE:
            p, rule = by_name[MANUAL_PLACE[bname]], "수동"
        assert p, f"지도에서 못 찾음: {bname}"
        if p["code"] and p["code"] != code:
            raise SystemExit(f"코드 충돌: {bname} 표={code} 지도={p['code']}")
        p["code"] = code
        p.setdefault("room_names", set()).add(bname)
        how[code] = rule

    for p in places:
        names = sorted(p.pop("room_names", set()) - {p["name"]})
        p["display"] = DISPLAY.get(p["name"], p["name"])
        extra = [p["name"]] if p["display"] != p["name"] else []
        p["aliases"] = sorted(set(names + extra + ALIASES.get(p["name"], [])) - {p["display"]})
        p["summary"] = first_sentences(p.pop("intro"))
        p["room_count"] = sum(1 for r in rooms if p["code"] and re.match(r"[A-Z]+", r["code"]).group(0) == p["code"])
        p["match"] = how.get(p["code"]) if p["code"] else None
        if p["code"]:
            buildings[p["code"]] = p["display"]

    today = dt.date.today().isoformat()
    meta = {"source": [BASE + "/page/861", BASE + "/campus/map"], "fetched": today}
    os.makedirs(OUT, exist_ok=True)

    def dump(name, obj):
        with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
            json.dump(obj, f, ensure_ascii=False, indent=2)
            f.write("\n")

    dump("buildings.json", dict(sorted(buildings.items(), key=lambda kv: (-len(kv[0]), kv[0]))))
    dump("places.json", {**meta, "groups": GROUPS,
                         "places": sorted(places, key=lambda p: (p["no"], p["seq"]))})
    dump("rooms.json", {r["code"]: {k: r[k] for k in ("building", "name", "type", "capacity")}
                        for r in sorted(rooms, key=lambda r: r["code"])})

    print(f"호실 {len(rooms)}개 · 건물 {len(room_buildings)}동 · 지도 장소 {len(places)}곳 · 코드 {len(buildings)}개")
    for code in sorted(how):
        p = by_code.get(code) or next(x for x in places if x["code"] == code)
        print(f"  {code:<4} {p['name']:<28} ← {how[code]}  ({p['lat']}, {p['lng']}) 지상 {p['floors_above']}층")


if __name__ == "__main__":
    main()
