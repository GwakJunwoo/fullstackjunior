"""Bond Quant House — 다전략 운용 관리 API.

Bond Quant House 의 registry.json(전략 통합 등록부)을 읽어 프론트에 제공.
운영 메인 화면(tools/quant-house)의 백엔드. DB 를 직접 건드리지 않고
등록부·스냅샷 파일만 읽는다(웹 레이어 경량 유지, 헌법: 백테스트는 DB 미사용).
"""
import json
import os
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException, Query

router = APIRouter(prefix="/quant-house", tags=["quant-house"])

# Bond Quant House 위치 (환경변수로 override 가능)
QH_ROOT = Path(os.getenv("QH_ROOT", r"C:\Users\infomax\Desktop\Bond Quant House"))
REGISTRY = QH_ROOT / "05_registry" / "registry.json"
SNAP_DIR = QH_ROOT / "04_strategies"

# Bond Quant House 엔진 import 가능하게 (refresh / trade-path 용)
if str(QH_ROOT) not in sys.path:
    sys.path.insert(0, str(QH_ROOT))


def _load_registry() -> dict:
    if not REGISTRY.exists():
        return {"strategies": {}, "updated": None}
    return json.loads(REGISTRY.read_text(encoding="utf-8"))


def _lineage(strategies: dict, name: str) -> list[str]:
    chain, cur, seen = [], name, set()
    while cur and cur in strategies and cur not in seen:
        seen.add(cur)
        e = strategies[cur]
        chain.append(f"{e['name']}@{e.get('version','?')}")
        cur = e.get("parent")
    return chain


@router.get("/strategies")
def list_strategies():
    """카테고리별 전략 + 진화경로 + 최근 감사/백테스트.

    web_visible=false 전략은 *웹 표시에서 제외*(운용자 큐레이션 — 레지스트리엔 존재).
    """
    reg = _load_registry()
    strategies = reg.get("strategies", {})
    # 웹 노출 대상만 (web_visible 가 명시적 false 면 숨김; 없으면 기본 노출)
    visible = {n: s for n, s in strategies.items() if s.get("web_visible") is not False}
    by_cat: dict[str, list] = {}
    for s in visible.values():
        item = dict(s)
        item["lineage"] = _lineage(strategies, s["name"])
        by_cat.setdefault(s.get("category", "uncategorized"), []).append(item)
    # 헌법 요약 카운트 + 계층(tier) 분포 (노출 전략 기준)
    tier_dist: dict[str, int] = {}
    for s in visible.values():
        tg = s.get("tier") or (s.get("tier_eval") or {}).get("tier")
        if tg:
            tier_dist[tg] = tier_dist.get(tg, 0) + 1
    summary = {
        "total": len(visible),
        "live": sum(1 for s in visible.values()
                    if s.get("status") in ("deployed", "active")),
        "deployed": sum(1 for s in visible.values() if s.get("status") == "deployed"),
        "blocked": sum(1 for s in visible.values() if (s.get("audit") or {}).get("blocked")),
        "tier_dist": tier_dist,
        "hidden": len(strategies) - len(visible),
        "updated": reg.get("updated"),
    }
    return {"summary": summary, "by_category": by_cat}


@router.get("/strategy/{name}")
def strategy_detail(name: str):
    reg = _load_registry()
    s = reg.get("strategies", {}).get(name)
    if not s:
        raise HTTPException(404, f"미등록 전략: {name}")
    s = dict(s)
    s["lineage"] = _lineage(reg["strategies"], name)
    return s


@router.get("/backtest/{name}")
def backtest_artifact(name: str):
    """전략 백테스트 전체 산출물 — 기초통계 + 누적PnL/월간/MDD 시계열 + 진입 로그.

    catalog 전략(알파 미이식)은 아티팩트가 없다 → has_artifact=False 로
    정직하게 반환(가짜 차트 금지, HOUSE §3).
    """
    safe = name.replace("/", "").replace("\\", "").replace("..", "")
    fp = SNAP_DIR / safe / "backtest_artifact.json"
    reg = _load_registry().get("strategies", {}).get(name)
    if not reg:
        raise HTTPException(404, f"미등록 전략: {name}")
    if not fp.exists():
        # ★integration 인지 정직 note (2026-06-01) — research 전략을 'catalog/미이식'으로
        #   오인하던 하드코딩 제거(§3). 등록부 backtest 메타가 있으면 동봉(권위 수치).
        integ = reg.get("integration")
        bt = reg.get("backtest")
        if integ == "catalog":
            note = ("백테스트 아티팩트 없음 — catalog 전략(알파 로직 원본 Beta Trading·이 엔진 "
                    "미이식). ported 승격 후 cli.py backtest 실행 시 생성됨.")
        elif bt:
            m = bt.get("mean_bp_per_trade")
            oos = bt.get("mean_bp_test_oos")
            nt = bt.get("n_trades")
            stat = (" — net/거래 ALL %+.2fbp · TEST(OOS) %+.2fbp · n=%s"
                    % (m, oos, nt)) if (m is not None and oos is not None) else ""
            note = ("트레이드로그 아티팩트(차트) 미생성 — 등록부 backtest 메타가 권위(비용후·캐노니컬)"
                    + stat + ". directional·델타트랙 전략은 등록부 메타로 평가(아티팩트는 "
                    "harness/backtest 실행 시 생성).")
        else:
            note = "백테스트 아티팩트·등록부 메타 모두 없음."
        return {"name": name, "has_artifact": False,
                "integration": integ,
                "source_ref": reg.get("source_ref"),
                "backtest": bt,          # ★등록부 backtest 메타 동봉(권위)
                "note": note}
    art = json.loads(fp.read_text(encoding="utf-8"))
    art["has_artifact"] = True
    return art


@router.post("/refresh")
def refresh_all():
    """전체 일괄 신규 데이터 업데이트 — 원본 산출물 재인제스트 + 등록부 동기화.

    Beta Trading 일일 파이프라인이 phase CSV 를 갱신하면 그 최신본을
    다시 읽어 아티팩트·통계를 재생성한다. (알파 파이프라인 자체는 사용자
    Beta Trading 쪽 책임 — 여기선 그 최신 산출물로 화면을 동기화.)
    """
    try:
        from engine import ingest, registry
    except Exception as e:
        raise HTTPException(500, f"엔진 import 실패: {e}")
    done, fail = [], []
    for nm in list(ingest.MANIFEST):
        try:
            _out, st = ingest.ingest(nm)
            registry.record_backtest(nm, st)
            done.append({"name": nm, "n": st.get("n_trades"),
                         "bp_per_year": st.get("bp_per_year")})
        except Exception as e:
            fail.append({"name": nm, "error": f"{type(e).__name__}: {e}"})
    reg = _load_registry()
    return {"refreshed": done, "failed": fail,
            "updated": reg.get("updated"),
            "ktb_latest": _ktb_latest()}


def _ktb_latest():
    try:
        from engine import db
        with db.get_conn() as c:
            cur = c.cursor()
            cur.execute("SELECT MAX(price_date) FROM ktb")
            return str(cur.fetchone()[0])
    except Exception:
        return None


def _looks_like_bond(code: str) -> bool:
    return isinstance(code, str) and code.startswith("KR") and len(code) >= 10


@router.get("/trade-path")
def trade_path(strategy: str, i: int = Query(..., ge=0)):
    """단일 거래 상세 — 보유기간 레그 YTM 시계열 + 스프레드/PnL 경로 + 포지션 분석.

    pair 전략(실 bond_code 레그): DB ktb 에서 양 레그 ytm 조회 → 스프레드·
    PnL 경로 재구성 + 델타/커브 노출 산출. CV1T struct(선물·버터플라이)는
    단일 bond_code 가 아니므로 재구성 불가 — 구조 정보만 정직 반환.
    """
    safe = strategy.replace("/", "").replace("\\", "").replace("..", "")
    fp = SNAP_DIR / safe / "backtest_artifact.json"
    if not fp.exists():
        raise HTTPException(404, "아티팩트 없음")
    art = json.loads(fp.read_text(encoding="utf-8"))
    trades = art.get("trades", [])
    if i >= len(trades):
        raise HTTPException(404, f"거래 인덱스 범위 초과 (n={len(trades)})")
    t = trades[i]
    e0, x0 = t.get("entry_date"), t.get("exit_date")
    base = {"strategy": strategy, "i": i, "trade": t}

    lc, sc = t.get("long"), t.get("short")
    if not (_looks_like_bond(lc) and _looks_like_bond(sc)):
        # CV1T 등 멀티레그 구조 — 선물/버터플라이는 단일 종목 재구성 불가
        base["reconstructible"] = False
        base["note"] = ("멀티레그 구조(선물·버터플라이·베이시스) — 단일 "
                        "bond_code 가 아니라 보유기간 YTM 재구성 불가. "
                        "struct/strategy/size 로 구조 확인.")
        return base

    try:
        from engine import db
        raw = db.load_table(
            "ktb", columns=["price_date", "bond_code", "ytm", "remain_year"],
            date_col="price_date", start=e0, end=x0,
            where="bond_code IN (%s, %s)", params=[lc, sc])
    except Exception as ex:
        raise HTTPException(500, f"DB 조회 실패: {ex}")
    if raw.empty:
        base["reconstructible"] = False
        base["note"] = "해당 기간 ktb 데이터 없음"
        return base

    import pandas as pd
    raw["price_date"] = pd.to_datetime(raw["price_date"])
    raw = (raw.sort_values("price_date")
              .drop_duplicates(["price_date", "bond_code"], keep="last"))
    pl = raw[raw.bond_code == lc].set_index("price_date")
    ps = raw[raw.bond_code == sc].set_index("price_date")
    idx = pl.index.intersection(ps.index).sort_values()
    series = []
    for d in idx:
        yl = float(pl.loc[d, "ytm"]) * 100.0      # bp
        ys = float(ps.loc[d, "ytm"]) * 100.0
        sp = yl - ys
        series.append({"d": d.strftime("%Y-%m-%d"),
                       "ytm_l": round(yl, 2), "ytm_s": round(ys, 2),
                       "spread": round(sp, 2)})
    # 포지션 분석 (아티팩트가 보유한 권위 값 우선)
    rem_l = t.get("rem_l") or t.get("dur_l")
    rem_s = t.get("rem_s") or t.get("dur_s")
    bpv_l, bpv_s = t.get("bpv_l"), t.get("bpv_s")
    net_dv01 = t.get("net_dv01")
    curve = None
    if rem_l is not None and rem_s is not None:
        gap = round(float(rem_l) - float(rem_s), 2)
        # LONG 이 더 장기 → 장기 강세 베팅 = 커브 플래트너
        curve = {"maturity_gap_y": gap,
                 "exposure": ("FLATTENER (장기 LONG/단기 SHORT)" if gap > 0
                              else "STEEPENER (단기 LONG/장기 SHORT)" if gap < 0
                              else "동일만기(순수 RV)")}
    rate_gap = (series[0]["spread"] if series else None)
    base.update({
        "reconstructible": True,
        "long_code": lc, "short_code": sc,
        "series": series,
        "analytics": {
            "notional_long": t.get("notl"), "notional_short": t.get("nots"),
            "rem_long": rem_l, "rem_short": rem_s,
            "bpv_long": bpv_l, "bpv_short": bpv_s,
            "net_dv01_man_per_bp": net_dv01,
            "delta_note": ("DV01 매칭 페어 → 순델타≈0 (금리방향 중립)"
                           if net_dv01 is not None and abs(float(net_dv01)) < 1
                           else "순델타 잔류 — 금리방향 노출 있음"),
            "curve": curve,
            "rate_gap_entry_bp": rate_gap,
            "days_held": t.get("days_held"),
            "pnl_bp": t.get("pnl_bp"), "pnl_man": t.get("pnl_man"),
            "exit_reason": t.get("exit_reason"),
        },
    })
    return base


_FWD_JSON = Path(os.getenv(
    "QH_FORWARD_JSON",
    r"C:\Users\infomax\Beta Trading\data\factor_trading\_forward"
    r"\forward_signals.json"))


@router.get("/forward")
def forward_signals():
    """전 전략 forward 진입신호(오늘 무엇을 진입). cli.py forward 산출.

    백테스트(완료거래)와 별개 — 각 전략 자체 entry 규칙을 최신 패널에
    적용한 '오늘의 신호'. 미생성 시 안내."""
    if not _FWD_JSON.exists():
        return {"as_of": None, "strategies": {},
                "note": "forward_signals.json 미생성 — cli.py forward 실행 필요"}
    return json.loads(_FWD_JSON.read_text(encoding="utf-8"))


from fastapi import Body


@router.post("/portfolio")
def portfolio_run(body: dict = Body(...)):
    """N개 전략 선택 → 일별 시가평가 포트폴리오 백테스트.

    body: {"strategies":[name,...], "start":"YYYY-MM-DD"?, "end":"YYYY-MM-DD"?}
    반환: 일별 PnL/누적/DD/한쪽DV01 시계열 + 전략별 통계 + PnL 상관 + 진입 겹침.
    """
    try:
        from engine import portfolio
    except Exception as e:
        raise HTTPException(500, f"engine.portfolio import 실패: {e}")
    names = body.get("strategies") or []
    if not isinstance(names, list) or not names:
        raise HTTPException(400, "strategies 리스트 필요")
    bad = [n for n in names if n not in portfolio._LOG]
    if bad:
        raise HTTPException(400, f"미지원 전략: {bad}. 가능: {portfolio.AVAILABLE}")
    try:
        return portfolio.run(names, body.get("start"), body.get("end"))
    except Exception as e:
        raise HTTPException(500, f"portfolio.run 실패: {type(e).__name__}: {e}")


@router.get("/portfolio-available")
def portfolio_available():
    """포트폴리오 화면에 노출 가능한 전략 이름 + 카탈로그."""
    from engine import portfolio
    reg = _load_registry().get("strategies", {})
    items = []
    for nm in portfolio.AVAILABLE:
        e = reg.get(nm, {})
        items.append({
            "name": nm,
            "category": e.get("category"),
            "version": e.get("version"),
            "integration": e.get("integration"),
            "tagline": e.get("tagline"),
            "status": e.get("status"),
        })
    return {"available": items}


@router.post("/daily-refresh")
def daily_refresh(body: dict = Body(default=None)):
    """일일 풀-사이클 오케스트레이션 트리거 — BQH cli.py daily-refresh 호출.

    body: {"dry_run": bool, "skip_deep": bool}  (둘 다 optional, 기본 False)
      - dry_run=True  → stale 진단만 (빠름, panel rebuild 없음)
      - skip_deep=True → cli 의 --skip-deep 플래그 전달
    반환: {"exit_code": int, "stdout": str, "stderr": str, "summary": dict|None}
      summary 는 cli 가 출력한 '=== SUMMARY ===' 이후 JSON 블록 파싱본
      (실패 시 None, raw stdout 은 그대로 반환).
    타임아웃: 600초 (panel rebuild 포함 풀-사이클).
    """
    import subprocess
    body = body or {}
    dry_run = bool(body.get("dry_run", False))
    skip_deep = bool(body.get("skip_deep", False))

    cli_fp = QH_ROOT / "cli.py"
    if not cli_fp.exists():
        raise HTTPException(500, f"BQH cli.py 없음: {cli_fp}")

    cmd = [sys.executable, str(cli_fp), "daily-refresh"]
    if dry_run:
        cmd.append("--dry-run")
    if skip_deep:
        cmd.append("--skip-deep")

    try:
        proc = subprocess.run(
            cmd, cwd=str(QH_ROOT),
            capture_output=True, text=True,
            encoding="utf-8", errors="replace",
            timeout=600,
        )
    except subprocess.TimeoutExpired as e:
        raise HTTPException(504, f"daily-refresh 타임아웃 (600s): {e}")
    except Exception as e:
        raise HTTPException(500, f"subprocess 실행 실패: {type(e).__name__}: {e}")

    stdout = proc.stdout or ""
    stderr = proc.stderr or ""

    # cli 가 출력한 '=== SUMMARY ===' 이후 JSON 블록 파싱 시도
    summary = None
    marker = "=== SUMMARY ==="
    idx = stdout.rfind(marker)
    if idx >= 0:
        tail = stdout[idx + len(marker):].strip()
        try:
            summary = json.loads(tail)
        except Exception:
            # JSON 파싱 실패 — raw 만 반환
            summary = None

    return {
        "exit_code": proc.returncode,
        "dry_run": dry_run,
        "skip_deep": skip_deep,
        "summary": summary,
        "stdout": stdout,
        "stderr": stderr,
    }


@router.get("/regime")
def regime_summary():
    """β-텐서 구조 레짐 모니터 — engine.regime.summary() 그대로 반환.

    ★ exploratory·모니터링 전용 도구. 실전 cross-tab 4게이트 중 1/4 통과,
    방향맹(인상/인하 구분 못함), 2022+ covariate shift 로 최근 신뢰 낮음.
    자동 매매/비중 룰 트리거 절대 금지 (HOUSE §1·§3). 화면은 caveats 4개를
    최상단 배너로 노출한다 — 백엔드는 그 데이터를 정직하게 그대로 전달만 한다.
    """
    try:
        from engine import regime
    except Exception as e:
        raise HTTPException(500, f"engine.regime import 실패: {type(e).__name__}: {e}")
    try:
        return regime.summary()
    except Exception as e:
        raise HTTPException(500, f"regime.summary 실패: {type(e).__name__}: {e}")


@router.get("/regime/current")
def regime_current():
    """현재 레짐만(가벼운 폴링용). engine.regime.current() 반환.

    summary() 와 동일하게 exploratory 도구 — 행동 신호 아님. caveats 포함.
    """
    try:
        from engine import regime
    except Exception as e:
        raise HTTPException(500, f"engine.regime import 실패: {type(e).__name__}: {e}")
    try:
        return regime.current()
    except Exception as e:
        raise HTTPException(500, f"regime.current 실패: {type(e).__name__}: {e}")


@router.get("/regime/inspect")
def regime_inspect(date: str | None = Query(default=None)):
    """유사 국면 인스펙터 — engine.regime.inspect(date) 그대로 반환.

    {target, similar:{target,neighbors:[...],caveat}, curve:{...}, rate_path:{...}}
    date=None → 최신일. date='YYYY-MM-DD'.

    ★ similar.caveat 는 *구조 유사도일 뿐 금리 방향(인상/인하) 보장 안 함* 경고를
    담고 있다 — 프론트가 그대로 눈에 띄게 노출한다(HOUSE §1·§3). 백엔드는 가공
    없이 정직하게 전달만 한다(가짜 데이터·행동지시 금지).
    """
    try:
        from engine import regime
    except Exception as e:
        raise HTTPException(500, f"engine.regime import 실패: {type(e).__name__}: {e}")
    try:
        return regime.inspect(date)
    except Exception as e:
        raise HTTPException(500, f"regime.inspect 실패: {type(e).__name__}: {e}")


@router.get("/regime/curve")
def regime_curve(date: str = Query(...)):
    """국고 일드커브 스냅샷 — engine.regime.curve_snapshot(date). {date, points:[{tenor,ytm}]}."""
    try:
        from engine import regime
    except Exception as e:
        raise HTTPException(500, f"engine.regime import 실패: {type(e).__name__}: {e}")
    try:
        return regime.curve_snapshot(date)
    except Exception as e:
        raise HTTPException(500, f"regime.curve_snapshot 실패: {type(e).__name__}: {e}")


@router.get("/regime/path")
def regime_path(date: str = Query(...)):
    """금리 경로(선택일 ±90일 3Y·10Y) — engine.regime.rate_path(date). {center, series:[{d,y3,y10}]}."""
    try:
        from engine import regime
    except Exception as e:
        raise HTTPException(500, f"engine.regime import 실패: {type(e).__name__}: {e}")
    try:
        return regime.rate_path(date)
    except Exception as e:
        raise HTTPException(500, f"regime.rate_path 실패: {type(e).__name__}: {e}")


@router.get("/daily/{name}")
def daily_output(name: str):
    """전략 최신 시그널 스냅샷. engine/cli 가 기록한 daily_signal.json 을 서빙.

    아직 스냅샷이 없으면 등록부의 최근 백테스트 메트릭으로 폴백.
    """
    snap = SNAP_DIR / name / "daily_signal.json"
    if snap.exists():
        return json.loads(snap.read_text(encoding="utf-8"))
    s = _load_registry().get("strategies", {}).get(name)
    if not s:
        raise HTTPException(404, f"미등록 전략: {name}")
    return {"name": name, "snapshot": None,
            "note": "daily 스냅샷 미생성 — cli.py daily 실행 필요",
            "backtest": s.get("backtest")}
