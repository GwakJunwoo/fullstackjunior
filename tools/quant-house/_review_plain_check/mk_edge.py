# -*- coding: utf-8 -*-
"""경계 목업 — 확정 계약(schema 2) W43 dated 를 복사해 plain 만 일부 깨뜨림(엔진 산출 아님 · 화면 검증 전용 · _fx/ 에만).
  - 모르는 badge_key(zzz_new) · 카드 spark_ref.to 어긋남 · 커브 줄 spark_ref.to 어긋남(→ 추이 없음)
  - 커브 줄 0 now_text 없음 + now=34.05(→ 웹은 반올림 없이 원 값 '34.05')
  - 상품 2년 문장 '(수준은 반대)' + level_opposite · 스텁 1칸 stub_text 없음(→ 기본 문구)
  - 종목 카드 1장 = 옛 이름만(resid_change_bp · resid_prev · fact 없음) → 웹이 옛 이름으로 사실 줄을 만들면 안 됨
  - scoreboard 행 0 pct_text 없음(→ pct 원 값 + '%')
"""
import copy
import json
import os
from pathlib import Path

FX = Path(os.environ.get("RVP_FX", Path(__file__).resolve().parent / "_fx"))
s = json.loads((FX / "snap_w43.json").read_text(encoding="utf-8"))
p = s["plain"]
cards = [x for x in p["notable"] if not x.get("stub")]
cf = [x for x in cards if x["bucket"] == "curve_fly"]
cf[0]["badge_key"], cf[0]["badge"] = "zzz_new", "[목업] 새 배지"
cf[1]["spark_ref"] = dict(cf[1]["spark_ref"], to="2026-10-19")
rows = p["charts"]["curve_shape"]["rows"]
rows[0].pop("now_text", None); rows[0]["now"] = 34.05
rows[1]["spark_ref"] = dict(rows[1]["spark_ref"], to="2026-10-19")
for r in p["charts"]["product_map"]["rows"]:
    if r["tenor"] == 2:
        r["sentence"] = r["sentence"] + " (수준은 반대)"
        r["level_opposite"] = True
stubs = [x for x in p["notable"] if x.get("stub")]
if stubs:
    stubs[0].pop("stub_text", None)
bonds = [x for x in cards if x["kind"] == "bond"]
old = bonds[1]
old.pop("fact", None)
old["resid_change_bp"] = old.pop("resid_chg_bp", None)
old["resid_prev"] = old.pop("resid_prev_bp", None)
old.pop("resid_chg_text", None)
(FX / "snap_edge.json").write_text(json.dumps(s, ensure_ascii=False), encoding="utf-8")

sb = json.loads((FX / "sb_dev.json").read_text(encoding="utf-8"))
sb["plain"]["rows"][0].pop("pct_text", None)
(FX / "sb_edge.json").write_text(json.dumps(sb, ensure_ascii=False), encoding="utf-8")
meta = {"zzz_key": cf[0]["key"], "to_bad_key": cf[1]["key"], "curve_row0": rows[0]["key"], "curve_row1": rows[1]["key"],
        "stub_no_text": stubs[0]["ref_key"] if stubs else None, "old_name_key": old["key"]}
(FX / "edge_meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
print("edge ok", meta)
