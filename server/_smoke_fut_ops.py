# -*- coding: utf-8 -*-
"""fut(선물 가격) ops smoke — engine + router passthrough.

실원장 무접촉: engine 호출은 tmp posdir 주입, router 는 positions.POS_DIR
monkeypatch(별도 tmp). DB 무접촉: resolver mock 주입(엔진), router 는
entry_price 명시 + 3선/10선 고정 듀레이션 경로만 사용.
stdout ASCII only (cp949).
"""
import json
import os
import sys
import tempfile
from pathlib import Path

os.environ.setdefault("QH_OPS_KEY", "smoketest-key")
QH_ROOT = Path(os.getenv("QH_ROOT", r"C:\Users\infomax\Desktop\Bond Quant House"))
sys.path.insert(0, str(QH_ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import pandas as pd
from engine import positions as P

FAILS = []


def check(name, cond, detail=""):
    print(("PASS  " if cond else "FAIL  ") + name + (("  | " + str(detail)) if detail else ""))
    if not cond:
        FAILS.append(name)


class MockRes:
    """fut leg mark resolver — DB mock (10sun price 104.55 @ asof)."""
    def __call__(self, leg, date):
        if leg.get("kind") == "fut":
            return 104.55, pd.Timestamp(date)
        return None

    def infer_kind(self, key):
        return "fut" if key in P.FUT_KEYS else "bond"

    def fut_duration(self, key, date):
        return None


# ════════════════════════════════════════════════════════════════════════════
# 1) engine level — tmp posdir
# ════════════════════════════════════════════════════════════════════════════
tmp1 = tempfile.mkdtemp(prefix="qh_smoke_eng_")
res = MockRes()

p = P.add_manual("fut_smoke", [{"key": "10선", "kind": "fut", "side": 1,
                                "entry_price": 104.20}],
                 "2026-06-09", None, "smoke", size_contracts=10,
                 posdir=tmp1, resolver=res)
leg = p["legs"][0]
check("eng add_manual: entry_price stored", leg.get("entry_price") == 104.20)
check("eng add_manual: size_contracts on position", p.get("size_contracts") == 10.0)
check("eng add_manual: contracts on leg", leg.get("contracts") == 10.0)
check("eng add_manual: dv01 = contracts x per-contract",
      abs(p["size_dv01_krw"] - 10 * P._fut_dv01_per_contract_krw(leg["fut_dur"])) < 1e-6,
      "dv01=%.0f" % p["size_dv01_krw"])

# both sizing -> reject (engine validation passthrough target)
try:
    P.add_manual("fut_smoke2", [{"key": "10선", "kind": "fut", "side": 1,
                                 "entry_price": 104.20}],
                 "2026-06-09", 1000000.0, "x", size_contracts=5,
                 posdir=tmp1, resolver=res)
    check("eng add_manual: dual sizing rejected", False)
except ValueError as e:
    check("eng add_manual: dual sizing rejected", True, str(e)[:40])

mk = P.mark("2026-06-10", posdir=tmp1, resolver=res)
row = mk["marked"][0]
fl = (row.get("fut_legs") or [None])[0]
check("eng mark: fut_legs present", fl is not None)
check("eng mark: cur_price/px_chg", fl and fl["cur_price"] == 104.55 and abs(fl["px_chg"] - 0.35) < 1e-9)
check("eng mark: pnl_krw = dPx x 1e6 x contracts (settlement parity)",
      abs(row["pnl_krw"] - 0.35 * 1e6 * 10) < 1.0, "pnl_krw=%.0f" % row["pnl_krw"])

bd = P.board(posdir=tmp1, asof="2026-06-10")
br = bd["positions"][0]
check("eng board: fut_legs + size_contracts in row",
      (br.get("fut_legs") or [{}])[0].get("entry_price") == 104.20
      and br.get("size_contracts") == 10.0)

ov = P.set_override(p["id"], "10선", 104.30, posdir=tmp1, resolver=res)
check("eng override: fut leg -> field=override_price",
      ov["field"] == "override_price" and ov["override_price"] == 104.30)

# ════════════════════════════════════════════════════════════════════════════
# 2) router level — TestClient + POS_DIR monkeypatch (passthrough check)
# ════════════════════════════════════════════════════════════════════════════
from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.routers import qh_ops

tmp2 = tempfile.mkdtemp(prefix="qh_smoke_rt_")
P.POS_DIR = Path(tmp2)          # router default posdir -> tmp (실원장 무접촉)
P.DefaultResolver.__call__ = lambda self, leg, date: MockRes()(leg, date)  # DB 차단

app = FastAPI()
app.include_router(qh_ops.router)
c = TestClient(app)
H = {"X-QH-KEY": os.environ["QH_OPS_KEY"]}

r = c.post("/quant-house/ops/manual", headers=H, json={
    "strategy_or_tag": "fut_rt", "entry_date": "2026-06-09",
    "legs": [{"key": "3선", "kind": "fut", "side": 1, "entry_price": 106.55}],
    "size_contracts": 7})
check("rt /manual: size_contracts only -> 200", r.status_code == 200, r.text[:80])
pj = r.json() if r.status_code == 200 else {}
check("rt /manual: engine fields passthrough (size_contracts/entry_price)",
      pj.get("size_contracts") == 7.0
      and pj.get("legs", [{}])[0].get("entry_price") == 106.55)

r2 = c.post("/quant-house/ops/manual", headers=H, json={
    "strategy_or_tag": "fut_rt2", "entry_date": "2026-06-09",
    "legs": [{"key": "3선", "kind": "fut", "side": 1, "entry_price": 106.55}],
    "size_dv01_krw": 1000000, "size_contracts": 7})
check("rt /manual: dual sizing -> 400 (engine message passthrough)",
      r2.status_code == 400 and "size" in r2.text, str(r2.status_code) + " " + r2.text[:60])

r3 = c.post("/quant-house/ops/manual", headers=H, json={
    "strategy_or_tag": "fut_rt3", "entry_date": "2026-06-09",
    "legs": [{"key": "3선", "kind": "fut", "side": 1, "entry_price": 106.55}]})
check("rt /manual: no sizing -> 400 (engine message passthrough)",
      r3.status_code == 400, str(r3.status_code) + " " + r3.text[:60])

r4 = c.post("/quant-house/ops/override", headers=H, json={
    "pos_id": pj.get("id"), "leg_key": "3선", "yield": 106.60})
check("rt /override: fut leg price interpretation (field=override_price)",
      r4.status_code == 200 and r4.json().get("field") == "override_price"
      and r4.json().get("override_price") == 106.60, r4.text[:80])

r5 = c.get("/quant-house/ops/board")
b5 = r5.json()
row5 = b5["positions"][0]
check("rt /board: fut_legs + size_contracts + override passthrough",
      r5.status_code == 200
      and (row5.get("fut_legs") or [{}])[0].get("override_price") == 106.60
      and row5.get("size_contracts") == 7.0)

r6 = c.get("/quant-house/ops/ledger")
l6 = r6.json()["positions"][0]["legs"][0]
check("rt /ledger: raw fut leg fields (entry_price/fut_dur/override_price)",
      r6.status_code == 200 and l6.get("entry_price") == 106.55
      and l6.get("fut_dur") is not None and l6.get("override_price") == 106.60)

print()
print("ALL PASS" if not FAILS else "%d FAILED: %s" % (len(FAILS), FAILS))
sys.exit(0 if not FAILS else 1)
