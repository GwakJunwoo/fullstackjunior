# -*- coding: utf-8 -*-
"""Overview 검증용 dev server — 저장소 루트 정적 서빙 + API 목업/프록시(운영 코드 무접촉).

  /assets/api_base.txt → 이 서버 · 그 밖의 API = 로컬 백엔드(BACKEND · 기본 127.0.0.1:8001) 프록시(읽기 전용 GET).
  주간 리뷰 2 엔드포인트 = 리뷰 검증 픽스처(tools/quant-house/_review_plain_check/_fx) · GET /__rev/<w43|noplain|live>
  금리(/ktb/*) 시나리오 = GET /__ktb/<live|am|intraday|close|prelim>  (TODAY = 서울 날짜)
    live/am  : 실 DB 그대로(평일 아침~장중 = 오늘 날짜 행은 국채선물 예비호가뿐)
    intraday : + 오늘 선물(3선·10선) 예비 값이 움직임(+5bp) — 확정 종가 D 는 그대로여야 함
    close    : + 오늘 종가 전부 적재(지표·IRS·CD·선물 +1bp · 국고채 커브 전 종목) — D = 오늘
    prelim   : + 오늘 3년지표 행 1개 · 국고채 커브 3행 · 이격 보드 as_of = 오늘(함정) — D 는 어제여야 함
  강제 실패 = GET /__fail/<이름,이름|none>  이름 ∈ series · board · curve · arb · review
"""
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE.parents[2]
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8775
BACKEND = os.environ.get("OV_BACKEND", "http://127.0.0.1:8001")
REV_FX = Path(os.environ.get("RVP_FX", ROOT / "tools/quant-house/_review_plain_check/_fx"))
TODAY = os.environ.get("OV_TODAY") or datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d")
ST = {"rev": "w43", "ktb": "live", "fail": set()}
REV = {"w43": ("snap_w43.json", "sb_dev.json"), "noplain": ("snap_noplain.json", "sb_noplain.json"), "live": (None, None)}
FAIL_MAP = {"series": "/ktb/multi_label_series", "board": "/ktb/curve-board", "curve": "/ktb/curve?", "arb": "/quant-house/arb-monitor",
            "review": "/quant-house/market-review"}


def fetch(path):
    with urllib.request.urlopen(BACKEND + path, timeout=60) as r:
        return json.loads(r.read().decode("utf-8"))


def ktb_series(path):
    d = fetch(path)
    s, sc = d.get("series", {}), ST["ktb"]
    def last(lb):
        rows = [r for r in s.get(lb, []) if str(r["price_date"])[:10] < TODAY and r.get("ytm") is not None]
        return rows[-1]["ytm"] if rows else None
    def put(lb, v):
        if lb in s and v is not None:
            s[lb] = [r for r in s[lb] if str(r["price_date"])[:10] != TODAY] + [{"price_date": TODAY, "ytm": round(v, 6)}]
    if sc == "intraday":
        for lb in ("3선", "10선"):
            if lb in s:
                put(lb, (last(lb) or 0) + 0.05)
    if sc == "close":
        for lb in list(s.keys()):
            put(lb, (last(lb) or 0) + 0.01 if last(lb) is not None else None)
    if sc == "prelim":
        put("3년지표", (last("3년지표") or 0) + 0.02)
    return d


def ktb_board(path):
    d = fetch(path)
    if ST["ktb"] in ("close", "prelim"):
        d["as_of"] = TODAY
    return d


def ktb_curve(path):
    q = urllib.parse.parse_qs(urllib.parse.urlparse(path).query)
    date, cat = (q.get("date") or [None])[0], (q.get("category") or [None])[0]
    sc = ST["ktb"]
    if date and date >= TODAY and sc in ("close", "prelim") and cat == "국고채":
        yday = (datetime.strptime(TODAY, "%Y-%m-%d") - timedelta(days=1)).strftime("%Y-%m-%d")   # 그 이하 최근 영업일 = 직전 종가일
        prev = fetch("/ktb/curve?date=" + yday + "&category=" + urllib.parse.quote(cat))
        rows = prev.get("rows", [])
        if sc == "prelim":
            rows = rows[:3]
        out = []
        for r in rows:
            r = dict(r)
            r["price_date"] = TODAY
            if r.get("ytm") is not None:
                r["ytm"] = round(float(r["ytm"]) + 0.01, 6)
            out.append(r)
        return {"date": TODAY, "count": len(out), "rows": out}
    return fetch(path)


class H(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        path = self.path.split("#")[0]
        p0 = path.split("?")[0]
        if p0.startswith("/__rev/"):
            ST["rev"] = p0.split("/")[-1]; return self._json({"rev": ST["rev"]})
        if p0.startswith("/__ktb/"):
            ST["ktb"] = p0.split("/")[-1]; return self._json({"ktb": ST["ktb"], "today": TODAY})
        if p0.startswith("/__fail/"):
            v = p0.split("/")[-1]
            ST["fail"] = set() if v in ("none", "") else set(v.split(","))
            return self._json({"fail": sorted(ST["fail"])})
        if p0 == "/assets/api_base.txt":
            b = f"http://127.0.0.1:{PORT}".encode()
            self.send_response(200); self.send_header("Content-Type", "text/plain"); self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
            return
        for name in ST["fail"]:
            if path.startswith(FAIL_MAP.get(name, "\0")):
                return self._json({"detail": f"목업 강제 실패({name})"}, 500)
        try:
            if p0 in ("/quant-house/market-review", "/quant-house/review-scoreboard") and ST["rev"] != "live":
                fn = REV[ST["rev"]][0 if p0.endswith("market-review") else 1]
                d = json.loads((REV_FX / fn).read_text(encoding="utf-8")); d = dict(d); d["available"] = True
                return self._json(d)
            if p0 == "/ktb/multi_label_series":
                return self._json(ktb_series(path))
            if p0 == "/ktb/curve-board":
                return self._json(ktb_board(path))
            if p0 == "/ktb/curve":
                return self._json(ktb_curve(path))
            if p0.startswith(("/quant-house/", "/ktb/", "/health", "/rates/", "/api/")):
                with urllib.request.urlopen(BACKEND + path, timeout=60) as r:
                    b = r.read()
                    self.send_response(r.status); self.send_header("Content-Type", r.headers.get("Content-Type", "application/json"))
                    self.send_header("Content-Length", str(len(b))); self.end_headers(); self.wfile.write(b)
                return
        except urllib.error.HTTPError as e:
            return self._json({"detail": f"backend {e.code}"}, e.code)
        except Exception as e:
            return self._json({"detail": f"mock/proxy 실패 {type(e).__name__}: {e}"}, 502)
        return super().do_GET()


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), partial(H, directory=str(ROOT)))
    print(f"overview dev server :{PORT} root={ROOT} today={TODAY}", flush=True)
    srv.serve_forever()
