# -*- coding: utf-8 -*-
"""§3-ter 예고 계약을 흉내 낸 웹 개발용 목업(엔진 산출 아님 · 화면 검증 전용 · 결과 파일은 _fx/ 에만).
W43 dated snapshot/scoreboard 를 복사해 plain 만 변형:
  - 종목 카드 badge_key=bond_skew '커브 대비 치우침' + fact 한 줄(값은 목업 표식 [목업])
  - 흐름 줄 = 상위 3 · 치우침 줄과 겹치는 키 = {stub, ref_key, ref_lane:'mr'}
  - lane_labels = '치우침 순 상위 3' / '흐름 순 상위 3' · plain.track = 'label'
  - 알 수 없는 badge_key 1개(zzz_new) · spark_ref.to 어긋남 1개(→ 추이 없음)
  - 상품 문장 '평소보다 싼 쪽 (수준은 반대)' + level_note · trust 되돌림 행 verdict '판정 보류' + verdict_reason
"""
import copy
import json
import os
from pathlib import Path

FX = Path(os.environ.get("RVP_FX", Path(__file__).resolve().parent / "_fx"))
s = json.loads((FX / "snap_w43.json").read_text(encoding="utf-8"))
p = s["plain"]
p["track"] = "label"
p["notable_common"]["lane_labels"] = {"mr": "치우침 순 상위 3", "momentum": "흐름 순 상위 3"}
new = []
for it in p["notable"]:
    it = copy.deepcopy(it)
    if it["kind"] == "bond":
        it["badge_key"], it["badge"] = "bond_skew", "커브 대비 치우침"
        it["fact"] = "[목업] 잔차 주간 +1.0bp(더 벌어짐)"
    new.append(it)
# 흐름 줄: 개별종목 = 치우침 줄의 22-5 와 겹친다고 가정 → 첫 칸 스텁
first_mr = [x for x in new if x["bucket"] == "bond_rv" and x["lane"] == "mr"][0]
flows = [x for x in new if x["bucket"] == "bond_rv" and x["lane"] == "momentum"]
stub = {"bucket": "bond_rv", "lane": "momentum", "rank": 1, "stub": True, "ref_key": first_mr["key"], "ref_lane": "mr"}
for i, x in enumerate(flows):
    x["rank"] = i + 2
new.insert(new.index(flows[0]), stub)
del new[new.index(flows[-1])]           # 흐름 줄 상위 3 유지
# 선물 흐름 줄 = 전부 치우침 줄과 겹침 → 스텁 3
for i, x in enumerate([x for x in new if x["bucket"] == "futures" and x["lane"] == "mr"][:3]):
    new.append({"bucket": "futures", "lane": "momentum", "rank": i + 1, "stub": True, "ref_key": x["key"], "ref_lane": "mr"})
# 알 수 없는 배지 · spark_ref.to 어긋남
cf = [x for x in new if not x.get("stub") and x["bucket"] == "curve_fly"]
cf[0]["badge_key"], cf[0]["badge"] = "zzz_new", "[목업] 새 배지"
cf[1]["spark_ref"] = dict(cf[1]["spark_ref"], to="2026-10-19")
p["notable"] = new
# 상품
for r in p["charts"]["product_map"]["rows"]:
    if r["tenor"] == 2:
        r["sentence"] = "[목업] 2년 현물이 스왑 대비 평소보다 싼 쪽 (수준은 반대)"
        r["level_note"] = "[목업] 본드스왑 스프레드 수준 +3.75bp"
# 고급 보기 종목 픽 — 연준 예고 키(badge_display · resid_chg_bp 문자열)
for f in ("mr", "momentum"):
    for x in s["picks"]["buckets"]["bond_rv"].get(f) or []:
        x["badge_display"] = "커브 대비 치우침"
        x["resid_chg_bp"] = "[목업] 잔차 주간 +1.0bp(더 벌어짐)"
(FX / "snap_future.json").write_text(json.dumps(s, ensure_ascii=False), encoding="utf-8")

sb = json.loads((FX / "sb_dev.json").read_text(encoding="utf-8"))
for r in sb["plain"]["rows"]:
    if r["factor"] == "mr":
        r["verdict"] = "판정 보류"
        r["verdict_reason"] = "[목업] 가격이 그대로여도 '맞음'이 나오기 쉬움"
sb["plain"]["title"] = "[목업] 커브 흐름 따라가기 29%로 오히려 반대"
(FX / "sb_future.json").write_text(json.dumps(sb, ensure_ascii=False), encoding="utf-8")
print("ok", len(new))
