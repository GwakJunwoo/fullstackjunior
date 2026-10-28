# -*- coding: utf-8 -*-
"""부트스트랩 탭 라우터 smoke — /quant-house/game-board · /game-board/ledger · POST /game-board/game.

실파일 무접촉: 스냅샷/원장 경로를 tmp 로 monkeypatch · 엔진 game_board 는 sys.modules 에 가짜 모듈을 꽂아
어댑터(_gb_call) 호출 규약(ledger.append_event(event) → snapshot.build_snapshot())만 검증. stdout ASCII only (cp949).
usage: python _smoke_game_board.py
"""
import json
import os
import sys
import tempfile
import types
from pathlib import Path

os.environ.setdefault("QH_OPS_KEY", "smoketest-key")
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi.testclient import TestClient
from app import create_app
from app.routers import quant_house as QH

FAILS = []


def check(name, cond, detail=""):
    print(("PASS  " if cond else "FAIL  ") + name + (("  | " + str(detail)) if detail else ""))
    if not cond:
        FAILS.append(name)


SAMPLE = json.loads((Path(__file__).resolve().parents[1] / "tools" / "quant-house" / "_bootstrap_sample.json").read_text(encoding="utf-8"))
tmp = Path(tempfile.mkdtemp(prefix="gb_smoke_"))
QH._GB_SNAP = tmp / "game_board_snapshot.json"
QH._GB_LEDGER = tmp / "game_board_ledger.jsonl"
_APP = create_app()


class _PeerAs:
    """ASGI scope.client 을 바꿔 소켓 peer 를 흉내낸다(starlette 0.38 TestClient 는 client= 인자 없음)."""
    def __init__(self, app, host):
        self.app, self.host = app, host

    async def __call__(self, scope, receive, send):
        if scope.get("type") == "http":
            scope = dict(scope, client=(self.host, 50000))
        await self.app(scope, receive, send)


c = TestClient(_PeerAs(_APP, "127.0.0.1"))                 # 로컬 호스트
c_remote = TestClient(_PeerAs(_APP, "198.51.100.7"))         # 원격 peer — 읽기 공개(2026-10-27) 이므로 GET 은 키 없이 200 · POST 는 여전히 403
KEY = {"X-QH-KEY": "smoketest-key"}
OPEN = {"event": "open", "board_id": "S.slope.2_5", "dir": 1, "date": "2026-10-27", "size_R": 1.0, "memo": "smoke", "by": "web"}

# -- 1. 부재 = 정직 available:false ---------------------------------------------------------
r = c.get("/quant-house/game-board")
check("GET game-board absent -> available:false + hint", r.status_code == 200 and r.json().get("available") is False and "board snapshot" in r.json().get("note", ""), r.json().get("note"))
r = c.get("/quant-house/game-board/ledger")
check("GET ledger absent -> available:false events[]", r.status_code == 200 and r.json()["available"] is False and r.json()["events"] == [])

# -- 1b. 읽기 공개(2026-10-27 사용자 지시 "fullstackjunior.com 에서 보이게"): 원격·터널 경유 GET 도 키 없이 200 · POST 는 §3 에서 여전히 403 --
r = c_remote.get("/quant-house/game-board")
check("GET game-board remote without key -> 200 (public read)", r.status_code == 200 and r.json().get("available") is False, r.status_code)
r = c_remote.get("/quant-house/game-board/ledger")
check("GET ledger remote without key -> 200 (public read)", r.status_code == 200 and r.json()["available"] is False)
for h in ("X-Forwarded-For", "Cf-Connecting-Ip"):
    r = c.get("/quant-house/game-board", headers={h: "203.0.113.9"})
    check("GET via tunnel (loopback peer + %s) without key -> 200" % h, r.status_code == 200)
r = c_remote.get("/quant-house/game-board", headers={"X-QH-KEY": "wrong"})
check("GET game-board with wrong key -> still 200 (key ignored on read)", r.status_code == 200)
_saved_key = os.environ.pop("QH_OPS_KEY")
try:
    r = c_remote.get("/quant-house/game-board")
    check("GET remote when QH_OPS_KEY unset -> 200 (read never depends on key)", r.status_code == 200)
    r = c_remote.post("/quant-house/game-board/game", json=OPEN)
    check("POST remote when QH_OPS_KEY unset -> 403 (write stays closed)", r.status_code == 403)
finally:
    os.environ["QH_OPS_KEY"] = _saved_key
r = c_remote.post("/quant-house/game-board/game", json=OPEN)
check("POST remote without key -> 403 (write still keyed)", r.status_code == 403)

# -- 2. passthrough = 파일 그대로 -------------------------------------------------------------
QH._GB_SNAP.write_text(json.dumps(SAMPLE, ensure_ascii=False), encoding="utf-8")
r = c.get("/quant-house/game-board")
j = r.json()
check("GET game-board passthrough (schema/boards/my_games/risk/honesty intact)", r.status_code == 200 and j["available"] is True and j["schema"] == 1
      and len(j["boards"]) == len(SAMPLE["boards"]) and j["risk"] == SAMPLE["risk"] and j["honesty"] == SAMPLE["honesty"] and j["my_games"] == SAMPLE["my_games"])
j.pop("available")
check("GET game-board: no field altered (deep equal)", j == SAMPLE)
QH._GB_LEDGER.write_text('{"ts":"t1","event":"open","game_id":"G1"}\nnot json\n\n{"ts":"t2","event":"close","game_id":"G1"}\n', encoding="utf-8")
r = c.get("/quant-house/game-board/ledger")
j = r.json()
check("GET ledger -> events array + parse_errors honest", j["available"] and j["n"] == 2 and j["parse_errors"] == 1 and j["events"][1]["event"] == "close", j)
r = c.get("/quant-house/game-board/ledger?limit=1")
check("GET ledger limit", r.json()["events"] == [{"ts": "t2", "event": "close", "game_id": "G1"}])

# -- 3. POST 가드 ----------------------------------------------------------------------------
r = c.post("/quant-house/game-board/game", json=OPEN)
check("POST without key -> 403", r.status_code == 403)
r = c.post("/quant-house/game-board/game", json={"event": "zap"}, headers=KEY)
check("POST bad event -> 400", r.status_code == 400 and "event" in r.json()["detail"])
r = c.post("/quant-house/game-board/game", json={"event": "open", "board_id": "S.slope.2_5", "dir": 1, "date": "2026-10-27"}, headers=KEY)
check("POST open without size -> 400", r.status_code == 400 and "size_R" in r.json()["detail"])
r = c.post("/quant-house/game-board/game", json={"event": "open", "board_id": "x", "dir": 2, "date": "2026-10-27", "size_R": 1}, headers=KEY)
check("POST dir=2 -> 400", r.status_code == 400)
r = c.post("/quant-house/game-board/game", json={"event": "close"}, headers=KEY)
check("POST close without game_id -> 400", r.status_code == 400)

# -- 4. 엔진 부재 -> 503 (★실엔진 import 금지 — sys.modules 에 None 을 꽂아 ImportError 강제 · 실원장 무접촉) --------
_blocked = {k: sys.modules.get(k) for k in ("engine.research.game_board", "engine.research.game_board.ledger", "engine.research.game_board.snapshot")}
sys.modules["engine.research.game_board"] = None
sys.modules["engine.research.game_board.ledger"] = None
sys.modules["engine.research.game_board.snapshot"] = None
try:
    r = c.post("/quant-house/game-board/game", json=OPEN, headers=KEY)
    check("POST with engine absent -> 503 + guidance", r.status_code == 503 and "game_board" in r.json()["detail"], r.status_code)
finally:
    for k, v in _blocked.items():
        if v is None:
            sys.modules.pop(k, None)
        else:
            sys.modules[k] = v

# -- 5. 가짜 엔진 모듈로 어댑터 호출 규약 검증 -----------------------------------------------------
calls = {}
fake_pkg = types.ModuleType("engine.research.game_board")
fake_ledger = types.ModuleType("engine.research.game_board.ledger")
fake_snap = types.ModuleType("engine.research.game_board.snapshot")


def append_event(ev):
    calls["append"] = ev
    with QH._GB_LEDGER.open("a", encoding="utf-8") as f:
        f.write(json.dumps(ev, ensure_ascii=False) + "\n")
    return {"game_id": "G-FAKE", "X_bp": 8.9}


def build_snapshot():
    calls["build"] = True
    s = dict(SAMPLE)
    s["built_at"] = "rebuilt"
    QH._GB_SNAP.write_text(json.dumps(s, ensure_ascii=False), encoding="utf-8")
    return s


def open_game(board_id, direction, date, size_R=None, dv01_won_per_bp=None, one_R_won=None, bond=None, memo="", by="cli", k=None, regime_at_entry=None, path=None, **kw):
    calls["open_game"] = dict(board_id=board_id, direction=direction, date=date, size_R=size_R, dv01_won_per_bp=dv01_won_per_bp, one_R_won=one_R_won, memo=memo, by=by, **({"bond": bond} if bond else {}), **kw)
    return append_event(dict(event="open", game_id="G-FAKE", board_id=board_id, dir=direction, date=str(date), X_bp=8.9, by=by, memo=memo))


def close_game(game_id, date, result="manual", R=None, cum_bp=None, memo="", by="cli", auto=False, decomp=None, path=None):
    if game_id != "G-FAKE":
        raise KeyError("게임 없음: " + game_id)
    calls["close_game"] = dict(game_id=game_id, date=date, result=result, memo=memo, by=by)
    return append_event(dict(event="close", game_id=game_id, date=str(date), result=result, by=by))


AMEND_ALLOWED = ("memo", "size_R", "dv01_won_per_bp", "one_R_won", "bond")   # 스키마 2 엔진 화이트리스트 흉내(ledger.AMEND_ALLOWED)


def amend(game_id, fields, memo="", by="cli", path=None, **kw):
    bad = [k for k in fields if k not in AMEND_ALLOWED]
    if bad:
        raise ValueError("PIT fixed fields %s not amendable - delete + new open" % bad)
    calls["amend"] = dict(game_id=game_id, fields=fields, by=by)
    return append_event(dict(event="amend", game_id=game_id, fields=fields, by=by))


def note(game_id, memo, by="cli", path=None):
    calls["note"] = dict(game_id=game_id, memo=memo, by=by)
    return append_event(dict(event="note", game_id=game_id, memo=memo, by=by))


def delete_game(game_id, reason, by="cli", path=None):
    calls["delete_game"] = dict(game_id=game_id, reason=reason, by=by)
    return append_event(dict(event="delete", game_id=game_id, reason=reason, by=by))


fake_ledger.delete_game = delete_game
fake_ledger.open_game = open_game
fake_ledger.close_game = close_game
fake_ledger.amend = amend
fake_ledger.note = note
fake_ledger.append = append_event
fake_snap.build_snapshot = build_snapshot
fake_pkg.ledger = fake_ledger
fake_pkg.snapshot = fake_snap
saved = {k: sys.modules.get(k) for k in ("engine.research.game_board", "engine.research.game_board.ledger", "engine.research.game_board.snapshot")}
sys.modules["engine.research.game_board"] = fake_pkg
sys.modules["engine.research.game_board.ledger"] = fake_ledger
sys.modules["engine.research.game_board.snapshot"] = fake_snap
try:
    r = c.post("/quant-house/game-board/game", json=OPEN, headers=KEY)
    j = r.json()
    check("POST open -> ledger.open_game(board_id, dir, date, size_R=, memo=, by='web') then snapshot.build_snapshot()", r.status_code == 200 and j["ok"]
          and calls["open_game"] == dict(board_id="S.slope.2_5", direction=1, date="2026-10-27", size_R=1.0, dv01_won_per_bp=None, one_R_won=None, memo="smoke", by="web")
          and calls.get("build") is True and j["engine"] == {"ledger_fn": "open_game", "snapshot_fn": "build_snapshot"}, j.get("engine"))
    r = c.post("/quant-house/game-board/game", json=dict(OPEN, paroli=True), headers=KEY)
    check("POST open paroli:true -> open_game(..., paroli=True) (user-toggled only)", r.status_code == 200 and calls["open_game"].get("paroli") is True)
    r = c.post("/quant-house/game-board/game", json=dict(OPEN, paroli=False), headers=KEY)
    check("POST open paroli:false -> no paroli kwarg", r.status_code == 200 and "paroli" not in calls["open_game"])
    r = c.post("/quant-house/game-board/game", json=OPEN, headers=KEY); j = r.json()
    check("POST response carries appended + rebuilt snapshot", j["appended"]["game_id"] == "G-FAKE" and j["snapshot"]["built_at"] == "rebuilt" and j["snapshot"]["available"] is True)
    r = c.get("/quant-house/game-board/ledger")
    check("ledger now has the appended event (append-only)", r.json()["n"] == 6 and r.json()["events"][-1]["event"] == "open")
    r = c.post("/quant-house/game-board/game", json={"event": "note", "game_id": "G-FAKE", "memo": "n"}, headers=KEY)
    check("POST note -> ledger.note(game_id, memo, by)", r.status_code == 200 and calls["note"] == dict(game_id="G-FAKE", memo="n", by="web"))
    r = c.post("/quant-house/game-board/game", json={"event": "amend", "game_id": "G-FAKE", "size_R": 1.5, "memo": "m"}, headers=KEY)
    check("POST amend -> ledger.amend(game_id, fields={size_R}, ...)", r.status_code == 200 and calls["amend"]["fields"] == {"size_R": 1.5})
    r = c.post("/quant-house/game-board/game", json={"event": "amend", "game_id": "G-FAKE", "size_R": 2, "bond": "KR1035", "memo": "m2"}, headers=KEY)
    check("POST amend (web form: size/bond/memo only) -> fields={size_R,bond} memo passed", r.status_code == 200 and calls["amend"]["fields"] == {"size_R": 2, "bond": "KR1035"} and calls["amend"]["by"] == "web")
    r = c.post("/quant-house/game-board/game", json={"event": "amend", "game_id": "G-FAKE", "dir": -1, "size_R": 1}, headers=KEY)
    check("POST amend with frozen field (dir) -> router passes through, engine ValueError -> 400 + reason verbatim", r.status_code == 400 and "not amendable" in r.json()["detail"] and "'dir'" in r.json()["detail"], r.json().get("detail"))
    r = c.post("/quant-house/game-board/game", json=dict(OPEN, bond="KR1035"), headers=KEY)
    check("POST open with bond -> open_game(..., bond=)", r.status_code == 200 and calls["open_game"].get("bond") == "KR1035")
    # s8f table chip stacking (user 2026-10-28): web sends size_R = chip sum + chips=[mults]; chips forwarded only when engine open_game declares it
    r = c.post("/quant-house/game-board/game", json=dict(OPEN, size_R=1.5, chips=[1, 0.5]), headers=KEY)
    check("POST open chips=[1,0.5] (engine open_game without chips param) -> size_R 1.5 passed, chips dropped, no paroli", r.status_code == 200 and calls["open_game"].get("size_R") == 1.5 and "chips" not in calls["open_game"] and "paroli" not in calls["open_game"], str(calls["open_game"]))
    _og = fake_ledger.open_game
    def open_game_chips(board_id, direction, date, chips=None, **kw):
        calls["open_game"] = dict(board_id=board_id, direction=direction, date=date, chips=chips, **kw)
        return append_event(dict(event="open", game_id="G-FAKE", board_id=board_id, dir=direction, date=str(date), X_bp=8.9, by=kw.get("by"), memo=kw.get("memo", "")))
    fake_ledger.open_game = open_game_chips
    r = c.post("/quant-house/game-board/game", json=dict(OPEN, size_R=1.5, chips=[1, 0.5]), headers=KEY)
    check("POST open chips (engine open_game WITH chips param) -> open_game(..., chips=[1,0.5]) verbatim", r.status_code == 200 and calls["open_game"].get("chips") == [1, 0.5] and calls["open_game"].get("size_R") == 1.5, str(calls["open_game"]))
    fake_ledger.open_game = _og
    r = c.post("/quant-house/game-board/game", json={"event": "close", "game_id": "G-NOPE", "date": "2026-10-28"}, headers=KEY)
    check("POST close unknown game -> 400 (engine KeyError passthrough)", r.status_code == 400 and "G-NOPE" in r.json()["detail"], r.json().get("detail"))
    r = c.post("/quant-house/game-board/game", json={"event": "close", "game_id": "G-FAKE", "date": "2026-10-28", "memo": "bye"}, headers=KEY)
    check("POST close -> ledger.close_game(game_id, date, result='manual', memo, by)", r.status_code == 200 and calls["close_game"] == dict(game_id="G-FAKE", date="2026-10-28", result="manual", memo="bye", by="web"))
    r = c.post("/quant-house/game-board/game", json={"event": "delete", "game_id": "G-FAKE"}, headers=KEY)
    check("POST delete without reason -> 400", r.status_code == 400 and "reason" in r.json()["detail"])
    r = c.post("/quant-house/game-board/game", json={"event": "delete", "game_id": "G-FAKE", "reason": "  wrong entry "}, headers=KEY)
    check("POST delete -> ledger.delete_game(game_id, reason.strip(), by='web') (user s3 2026-10-27)", r.status_code == 200 and calls["delete_game"] == dict(game_id="G-FAKE", reason="wrong entry", by="web") and r.json()["engine"]["ledger_fn"] == "delete_game")
    del fake_ledger.delete_game
    r = c.post("/quant-house/game-board/game", json={"event": "delete", "game_id": "G-FAKE", "reason": "x"}, headers=KEY)
    check("POST delete with no engine delete_game -> 503 (no raw append fallback)", r.status_code == 503 and "delete_game" in r.json()["detail"])
    # 전용 진입점이 없는 구버전 엔진 -> append(ev) 폴백 (응답 engine.ledger_fn 으로 드러남)
    for n in ("open_game", "close_game", "amend", "note"):
        delattr(fake_ledger, n)
    r = c.post("/quant-house/game-board/game", json={"event": "note", "game_id": "G-FAKE", "memo": "x"}, headers=KEY)
    check("adapter falls back to ledger.append when entry points absent", r.status_code == 200 and r.json()["engine"]["ledger_fn"] == "append")
    del fake_ledger.append
    r = c.post("/quant-house/game-board/game", json={"event": "note", "game_id": "G-FAKE", "memo": "x"}, headers=KEY)
    check("no known ledger fn -> 503 with contract hint", r.status_code == 503 and "append_event/append/record" in r.json()["detail"])
finally:
    for k, v in saved.items():
        if v is None:
            sys.modules.pop(k, None)
        else:
            sys.modules[k] = v

# -- 6. §8f-2 road-path (2026-10-28): 지연 import · game_path 없으면 503 · 있으면 그대로 통과(+캐시) · 못 찾음 404 · 인자 가드 400 ----
fake_road = types.ModuleType("engine.research.game_board.road")
fake_pkg.road = fake_road
saved_rp = {k: sys.modules.get(k) for k in ("engine.research.game_board", "engine.research.game_board.road")}
sys.modules["engine.research.game_board"] = fake_pkg
sys.modules["engine.research.game_board.road"] = fake_road
PATH = {"board_id": "S.slope.2_5", "n": 49, "entry": "2026-10-13", "exit": None, "X_bp": 7.1, "k": 1.0, "length": 10, "kind": "open", "winner": None,
        "series": [{"date": "2026-10-13", "mkt_bp": 0.0, "cum_R_plus": 0.0, "net_R_plus": -0.11}, {"date": "2026-10-14", "mkt_bp": 2.4, "cum_R_plus": 0.34, "net_R_plus": 0.23}],
        "barrier": {"win": 7.1, "loss": -7.1}, "legs_note": "2y-5y 스프레드 · _sa_probe"}
rp_calls = []
try:
    QH._RP_CACHE.clear()
    r = c.get("/quant-house/game-board/road-path?board_id=S.slope.2_5&n=49")
    check("GET road-path with no game_path fn -> 503 (no fake path)", r.status_code == 503 and "game_path" in r.json()["detail"], r.status_code)

    def game_path(board_id, n=None, game_id=None):
        rp_calls.append((board_id, n, game_id))
        if n is not None and game_id:
            raise ValueError("n and game_id both given")
        if n == 999 or game_id == "nope":
            raise KeyError("game not found")
        return dict(PATH, n=n, game_id=game_id)
    fake_road.game_path = game_path
    r = c.get("/quant-house/game-board/road-path?board_id=S.slope.2_5&n=49")
    j = r.json()
    check("GET road-path -> engine dict passthrough (series/barrier/legs_note intact · _sa key kept)", r.status_code == 200 and j["series"] == PATH["series"]
          and j["barrier"] == PATH["barrier"] and j["legs_note"] == PATH["legs_note"] and j["n"] == 49 and rp_calls[-1] == ("S.slope.2_5", 49, None), j)
    r = c_remote.get("/quant-house/game-board/road-path?board_id=S.slope.2_5&n=49")
    check("GET road-path remote without key -> 200 (public read) + cached (engine not re-called)", r.status_code == 200 and len(rp_calls) == 1, len(rp_calls))
    r = c.get("/quant-house/game-board/road-path?board_id=S.slope.2_5&game_id=S.slope.2_5%2B1%402026-10-13%231")
    check("GET road-path by game_id -> game_path(board_id, n=None, game_id=...)", r.status_code == 200 and rp_calls[-1] == ("S.slope.2_5", None, "S.slope.2_5+1@2026-10-13#1"), rp_calls[-1])
    r = c.get("/quant-house/game-board/road-path?board_id=S.slope.2_5&n=999")
    check("GET road-path unknown game -> 404 with engine reason", r.status_code == 404 and "game not found" in r.json()["detail"], r.status_code)
    r = c.get("/quant-house/game-board/road-path?board_id=S.slope.2_5&n=3&game_id=G1")
    check("GET road-path n+game_id both -> engine ValueError -> 400", r.status_code == 400 and "both" in r.json()["detail"], r.status_code)
    r = c.get("/quant-house/game-board/road-path?board_id=S.slope.2_5")
    check("GET road-path without n/game_id -> 400", r.status_code == 400)
    r = c.get("/quant-house/game-board/road-path?board_id=S.slope.2_5&n=0")
    check("GET road-path n=0 -> 422 (ge=1)", r.status_code == 422)
finally:
    QH._RP_CACHE.clear()
    for k, v in saved_rp.items():
        if v is None:
            sys.modules.pop(k, None)
        else:
            sys.modules[k] = v

print("")
print("RESULT:", "ALL PASS" if not FAILS else ("%d FAIL: %s" % (len(FAILS), FAILS)))
sys.exit(1 if FAILS else 0)
