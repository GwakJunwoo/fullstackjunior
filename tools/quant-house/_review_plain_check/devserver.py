# -*- coding: utf-8 -*-
"""dev server — worktree 정적 서빙 + 리뷰 2 엔드포인트만 시나리오 목업 + 나머지 GET 은 로컬 백엔드(8001) 프록시.

운영 코드 무접촉(별도 스크립트). 픽스처 = $RVP_FX(기본 ./_fx · prep_fixtures.py 가 만듦). 시나리오 전환: GET /__mode/<name>
  w43      = W43 dated snapshot(plain) + scoreboard dev(plain)
  noplain  = W43 에서 plain 만 뺀 snapshot·scoreboard(→ 일반 보기 '준비 중' · 고급 정상)
  nonstd   = 09-23 snapshot + engine build_plain(3영업일 비표준 창 · 범위/추이 없음)
  noscore  = W43 snapshot + plain 없는 scoreboard
  unavail  = available:false
"""
import json
import os
import sys
import urllib.request
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = Path(sys.argv[2]) if len(sys.argv) > 2 else HERE.parents[2]   # 저장소 루트
FX = Path(os.environ.get("RVP_FX", HERE / "_fx"))
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
BACKEND = "http://127.0.0.1:8001"
MODE = {"m": "w43"}
SCEN = {
    "w43": ("snap_w43.json", "sb_dev.json"),
    "noplain": ("snap_noplain.json", "sb_noplain.json"),
    "nonstd": ("snap_nonstd.json", "sb_dev.json"),
    "noscore": ("snap_w43.json", "sb_noplain.json"),
    "unavail": (None, None),
    "future": ("snap_future.json", "sb_future.json"),   # §3-ter 예고 계약 목업(mk_future.py)
    "wip": ("snap_wip.json", "sb_wip.json"),            # 엔진 작업 트리 build_plain/trust_plain 미리보기(있을 때만 · 수동 생성)
}


def passthrough(name):   # 라우터 _review_passthrough 와 같은 규칙(dict 그대로 + available)
    if name is None:
        return {"available": False, "note": "market_review_snapshot.json 미생성 — 목업"}
    d = json.loads((FX / name).read_text(encoding="utf-8"))
    out = dict(d)
    out["available"] = True
    return out


class H(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _json(self, obj, code=200):
        b = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(b)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(b)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path.startswith("/__mode/"):
            MODE["m"] = path.split("/")[-1]
            return self._json({"mode": MODE["m"]})
        if path == "/assets/api_base.txt":
            b = f"http://127.0.0.1:{PORT}".encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/plain")
            self.send_header("Content-Length", str(len(b)))
            self.end_headers()
            self.wfile.write(b)
            return
        if path == "/quant-house/market-review":
            return self._json(passthrough(SCEN[MODE["m"]][0]))
        if path == "/quant-house/review-scoreboard":
            sb = SCEN[MODE["m"]][1]
            return self._json(passthrough(sb) if sb else {"available": False, "note": "review_scoreboard.json 미생성 — 목업"})
        if path.startswith("/quant-house/") or path in ("/health",) or path.startswith("/api/"):
            try:
                with urllib.request.urlopen(BACKEND + self.path, timeout=30) as r:
                    b = r.read()
                    self.send_response(r.status)
                    self.send_header("Content-Type", r.headers.get("Content-Type", "application/json"))
                    self.send_header("Content-Length", str(len(b)))
                    self.end_headers()
                    self.wfile.write(b)
            except urllib.error.HTTPError as e:
                b = e.read()
                self.send_response(e.code)
                self.send_header("Content-Length", str(len(b)))
                self.end_headers()
                self.wfile.write(b)
            except Exception as e:
                self._json({"detail": f"proxy fail {e}"}, 502)
            return
        return super().do_GET()


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), partial(H, directory=str(ROOT)))
    print(f"dev server :{PORT} root={ROOT}", flush=True)
    srv.serve_forever()
