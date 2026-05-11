"""RV 페어 포지션 dashboard router.

기능:
  - 사용자 페어 트레이드 포지션 CRUD (JSON 파일 저장)
  - 각 포지션의 P&L 분해 (delta / curve / alpha) 자동 계산
  - 포트폴리오 단위 만기별 net DV01 노출
  - 페어별 ε / cum_ε 시계열

분해식:
  P&L_pair  =  −D_L·N_L·ΔY_L  +  D_S·N_S·ΔY_S
            =  (D_S·N_S·β_S − D_L·N_L·β_L)·ΔY_3Y          ← Delta
            +  (D_S·N_S·γ_S − D_L·N_L·γ_L)·Δslope          ← Curve twist
            +  잔여                                          ← Alpha
"""
from __future__ import annotations

import json
import re
import threading
import uuid
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..core.db import get_conn
from .beta import _load_label_series, _rolling_two_factor_beta


router = APIRouter()

# ── 저장소 ──────────────────────────────────────────
DATA_DIR = Path(__file__).resolve().parents[1] / "data"
DATA_DIR.mkdir(exist_ok=True)
POSITIONS_FILE = DATA_DIR / "rv_positions.json"
_lock = threading.Lock()


def _load_positions() -> list[dict]:
    if not POSITIONS_FILE.exists():
        return []
    try:
        with POSITIONS_FILE.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return []


def _save_positions(positions: list[dict]) -> None:
    tmp = POSITIONS_FILE.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(positions, f, ensure_ascii=False, indent=2, default=str)
    tmp.replace(POSITIONS_FILE)


# ── Duration 계산 ─────────────────────────────────────
_COUPON_RE = re.compile(r"(\d{5})")


def _parse_coupon_pct(name: str | None) -> float | None:
    """KTB 종목명 'XXXXX-YYMM' 패턴에서 쿠폰 % 추출. e.g. '03375-3206' → 3.375%"""
    if not name:
        return None
    m = _COUPON_RE.search(name)
    if not m:
        return None
    try:
        return int(m.group(1)) / 1000.0
    except Exception:
        return None


def _mod_duration(coupon_pct: float, ytm_pct: float, remain_yrs: float) -> float:
    """KTB 반기쿠폰 채권 modified duration (numerical)."""
    if coupon_pct is None or ytm_pct is None or remain_yrs is None or remain_yrs <= 0:
        return remain_yrs * 0.92 if remain_yrs else 0.0
    c = coupon_pct / 100.0
    y = ytm_pct / 100.0
    n_periods = remain_yrs * 2.0
    full = int(n_periods)
    frac = n_periods - full

    def price(yld):
        h = yld / 2.0
        coup = c * 100.0 / 2.0
        pv = 0.0
        if frac > 1e-6:
            for k in range(full + 1):
                t = frac + k
                cf = coup + (100.0 if k == full else 0.0)
                pv += cf / (1 + h) ** t
        else:
            for k in range(1, full + 1):
                cf = coup + (100.0 if k == full else 0.0)
                pv += cf / (1 + h) ** k
        return pv

    bump = 1e-4
    P = price(y)
    if P <= 0:
        return remain_yrs * 0.92
    P_up = price(y + bump)
    P_dn = price(y - bump)
    return -(P_up - P_dn) / (2.0 * bump * P)


# ── DB 조회 ────────────────────────────────────────────
def _fetch_bond_meta_latest(bond_code: str) -> dict | None:
    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT bond_code, bond_name, mat_date, issue_date,
                   remain_year, ytm, price_date, label, nickname
            FROM ktb
            WHERE bond_code = %s AND ytm > 0
            ORDER BY price_date DESC
            LIMIT 1
            """,
            (bond_code,),
        )
        r = cur.fetchone()
    if not r:
        return None
    return {
        "bond_code": r["bond_code"],
        "bond_name": r["bond_name"],
        "label": r["label"],
        "nickname": r["nickname"],
        "mat_date": r["mat_date"].isoformat() if r["mat_date"] else None,
        "remain_year": float(r["remain_year"]) if r["remain_year"] is not None else None,
        "ytm": float(r["ytm"]) if r["ytm"] is not None else None,
        "price_date": r["price_date"].isoformat() if r["price_date"] else None,
        "coupon_pct": _parse_coupon_pct(r["bond_name"]),
    }


def _fetch_ytm_on(bond_code: str, target_date: date) -> tuple[float | None, float | None]:
    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT ytm, remain_year FROM ktb
            WHERE bond_code = %s AND price_date = %s AND ytm > 0
            LIMIT 1
            """,
            (bond_code, target_date),
        )
        r = cur.fetchone()
    if r is None:
        return (None, None)
    return (float(r["ytm"]), float(r["remain_year"]))


# ── ε / β 엔진 (별도 빌드: 모든 국고채 포함, regressor 도 포함) ──
# mode='level' (default) — 사용자 트레이딩 기준. ε = 현재 fair value gap (level bp)
# mode='diff'             — 변동분 회귀 (참고용). ε = 일별 idiosyncratic ΔY
@lru_cache(maxsize=2)
def _build_decomp_engine(window: int = 63, days: int = 900, mode: str = "level") -> dict:
    s3 = _load_label_series("3년지표", days=days + window + 30)
    s10 = _load_label_series("10년지표", days=days + window + 30)
    if s3.empty or s10.empty:
        return {}

    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT price_date, bond_code, AVG(ytm) AS ytm
            FROM ktb
            WHERE category = '국고채'
              AND price_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
              AND ytm > 0 AND bond_code IS NOT NULL AND bond_code != ''
            GROUP BY price_date, bond_code
            """,
            (days + window + 30,),
        )
        rows = cur.fetchall()
    if not rows:
        return {}
    df = pd.DataFrame(rows)
    df["price_date"] = pd.to_datetime(df["price_date"])
    df["ytm"] = df["ytm"].astype(float)
    ytm_panel = df.pivot_table(
        index="price_date", columns="bond_code", values="ytm", aggfunc="mean"
    ).sort_index()

    idx = ytm_panel.index.union(s3.index).union(s10.index).sort_values()
    ytm_panel = ytm_panel.reindex(idx).ffill()
    s3_full = s3.reindex(idx).ffill()
    s10_full = s10.reindex(idx).ffill()

    if mode == "level":
        y_panel = ytm_panel * 100.0                    # level bp
        x1 = s3_full.astype(float) * 100.0             # Y_3Y level (bp)
        x2 = (s10_full - s3_full).astype(float) * 100.0  # slope level (bp)
    else:
        y_panel = ytm_panel.diff() * 100.0             # ΔY bp
        x1 = s3_full.diff() * 100.0                    # ΔY_3Y bp
        x2 = (s10_full - s3_full).diff() * 100.0       # Δslope bp

    beta_lvl, beta_slp, eps = _rolling_two_factor_beta(
        dy_panel=y_panel,
        dy_level_bp=x1,
        dy_slope_bp=x2,
        window=window,
        min_periods=20,
    )
    if mode == "level":
        cum_eps = eps.rolling(21, min_periods=11).mean()  # 평활화 (현재 fair value gap)
    else:
        cum_eps = eps.rolling(21, min_periods=11).sum()   # 21일 누적

    # bench raw moves (ΔY_3Y / Δslope) — period 별 변화량 계산용
    dy3_bp = (s3_full * 100.0).diff()
    dy10_bp = (s10_full * 100.0).diff()
    dslope_bp = dy10_bp - dy3_bp

    return {
        "ytm_panel": ytm_panel,
        "s3": s3_full,
        "s10": s10_full,
        "dy3_bp": dy3_bp,
        "dslope_bp": dslope_bp,
        "beta_lvl": beta_lvl,
        "beta_slp": beta_slp,
        "eps": eps,
        "cum_eps": cum_eps,
        "mode": mode,
    }


def _invalidate_decomp_cache() -> None:
    """다음 호출 시 ε / β 패널 재빌드. 데이터 새로고침 필요할 때."""
    _build_decomp_engine.cache_clear()


# ── 분해 ─────────────────────────────────────────────
def _decompose(
    *,
    long_code: str,
    short_code: str,
    long_face_eok: float,
    short_face_eok: float,
    long_duration: float,
    short_duration: float,
    long_entry_ytm: float,
    short_entry_ytm: float,
    entry_date: date,
    transaction_cost_bp: float,
) -> dict:
    eng = _build_decomp_engine()
    if not eng:
        return {"error": "engine_empty"}
    eps = eng["eps"]
    beta_lvl = eng["beta_lvl"]
    beta_slp = eng["beta_slp"]
    s3 = eng["s3"]
    s10 = eng["s10"]
    ytm_panel = eng["ytm_panel"]

    if long_code not in ytm_panel.columns or short_code not in ytm_panel.columns:
        return {"error": "bond_not_in_panel"}

    panel_dates = ytm_panel.index
    last_d = panel_dates.max()
    entry_ts = pd.Timestamp(entry_date)

    valid_entry = panel_dates[panel_dates <= entry_ts]
    if valid_entry.empty:
        return {"error": "entry_date_out_of_range"}
    entry_in_panel = valid_entry.max()

    # 가격
    cur_long_ytm = ytm_panel.loc[last_d, long_code]
    cur_short_ytm = ytm_panel.loc[last_d, short_code]
    if pd.isna(cur_long_ytm) or pd.isna(cur_short_ytm):
        return {"error": "current_ytm_na"}
    cur_long_ytm = float(cur_long_ytm)
    cur_short_ytm = float(cur_short_ytm)

    # 시장 entry yield (DB 종가)
    mkt_entry_long = ytm_panel.loc[entry_in_panel, long_code]
    mkt_entry_short = ytm_panel.loc[entry_in_panel, short_code]
    mkt_entry_long = float(mkt_entry_long) if pd.notna(mkt_entry_long) else long_entry_ytm
    mkt_entry_short = float(mkt_entry_short) if pd.notna(mkt_entry_short) else short_entry_ytm

    # 벤치 (3y/10y) 변화
    s3_entry = float(s3.loc[entry_in_panel])
    s10_entry = float(s10.loc[entry_in_panel])
    s3_last = float(s3.loc[last_d])
    s10_last = float(s10.loc[last_d])
    dy3_bp_total = (s3_last - s3_entry) * 100.0
    dslope_bp_total = ((s10_last - s3_last) - (s10_entry - s3_entry)) * 100.0

    # β / γ — entry 시점 또는 가장 가까운 not-na
    def latest_not_na(series, until):
        s = series.loc[:until].dropna()
        return float(s.iloc[-1]) if not s.empty else None

    b_long_lvl = latest_not_na(beta_lvl[long_code], entry_in_panel) if long_code in beta_lvl.columns else None
    b_long_slp = latest_not_na(beta_slp[long_code], entry_in_panel) if long_code in beta_slp.columns else None
    b_short_lvl = latest_not_na(beta_lvl[short_code], entry_in_panel) if short_code in beta_lvl.columns else None
    b_short_slp = latest_not_na(beta_slp[short_code], entry_in_panel) if short_code in beta_slp.columns else None

    # ΔY (bp)
    dy_long_mkt_bp = (cur_long_ytm - mkt_entry_long) * 100.0
    dy_short_mkt_bp = (cur_short_ytm - mkt_entry_short) * 100.0
    dy_long_user_bp = (cur_long_ytm - long_entry_ytm) * 100.0
    dy_short_user_bp = (cur_short_ytm - short_entry_ytm) * 100.0

    # 거래비용 = user 진입가 - 시장 종가 차이
    cost_long_bp = (long_entry_ytm - mkt_entry_long) * 100.0
    cost_short_bp = (short_entry_ytm - mkt_entry_short) * 100.0

    # DV01 (원/bp)
    dv01_long = long_face_eok * 1e8 * long_duration * 1e-4
    dv01_short = short_face_eok * 1e8 * short_duration * 1e-4

    total_mkt_won = -dv01_long * dy_long_mkt_bp + dv01_short * dy_short_mkt_bp

    if all(x is not None for x in [b_long_lvl, b_long_slp, b_short_lvl, b_short_slp]):
        # signed DV01 exposures (만원/bp 단위, 현재 시점의 portfolio sensitivity)
        delta_dv01_won_per_bp = dv01_short * b_short_lvl - dv01_long * b_long_lvl
        curve_dv01_won_per_bp = dv01_short * b_short_slp - dv01_long * b_long_slp
        # period 누적 P&L
        delta_won = delta_dv01_won_per_bp * dy3_bp_total
        curve_won = curve_dv01_won_per_bp * dslope_bp_total
        alpha_won = total_mkt_won - delta_won - curve_won
    else:
        delta_dv01_won_per_bp = curve_dv01_won_per_bp = None
        delta_won = curve_won = alpha_won = None

    cost_pnl_long = dv01_long * cost_long_bp
    cost_pnl_short = -dv01_short * cost_short_bp
    cost_total_won = cost_pnl_long + cost_pnl_short

    # txn_cost: 정보용. mark-to-market 중에는 차감하지 않음 (entry 비용은 cost_*_bp 에 이미 반영,
    # exit 비용은 청산 시점에 차감되어야 함). 청산 후의 expected total = user_total - txn_cost.
    txn_cost_won = (dv01_long + dv01_short) * float(transaction_cost_bp or 0)
    user_total_won = total_mkt_won + cost_total_won

    # 현재 ε / cum_ε
    cur_cum_long = eng["cum_eps"].loc[last_d, long_code] if long_code in eng["cum_eps"].columns else None
    cur_cum_short = eng["cum_eps"].loc[last_d, short_code] if short_code in eng["cum_eps"].columns else None
    cur_eps_long_v = eps.loc[last_d, long_code] if long_code in eps.columns else None
    cur_eps_short_v = eps.loc[last_d, short_code] if short_code in eps.columns else None

    holding_days = (last_d - entry_in_panel).days

    return {
        "as_of": last_d.date().isoformat(),
        "entry_date_used": entry_in_panel.date().isoformat(),
        "current_long_ytm": cur_long_ytm,
        "current_short_ytm": cur_short_ytm,
        "market_entry_long_ytm": mkt_entry_long,
        "market_entry_short_ytm": mkt_entry_short,
        "dy_long_mkt_bp": dy_long_mkt_bp,
        "dy_short_mkt_bp": dy_short_mkt_bp,
        "dy_long_user_bp": dy_long_user_bp,
        "dy_short_user_bp": dy_short_user_bp,
        "cost_long_bp": cost_long_bp,
        "cost_short_bp": cost_short_bp,
        "dy3_bp": dy3_bp_total,
        "dslope_bp": dslope_bp_total,
        "beta_long_lvl": b_long_lvl,
        "beta_long_slp": b_long_slp,
        "beta_short_lvl": b_short_lvl,
        "beta_short_slp": b_short_slp,
        "dv01_long_won": dv01_long,
        "dv01_short_won": dv01_short,
        "delta_dv01_man_per_bp": delta_dv01_won_per_bp / 1e4 if delta_dv01_won_per_bp is not None else None,
        "curve_dv01_man_per_bp": curve_dv01_won_per_bp / 1e4 if curve_dv01_won_per_bp is not None else None,
        "curve_direction": ("steepener" if (curve_dv01_won_per_bp or 0) > 0 else
                            "flattener" if (curve_dv01_won_per_bp or 0) < 0 else "neutral"),
        "delta_won": delta_won,
        "curve_won": curve_won,
        "alpha_won": alpha_won,
        "total_mkt_won": total_mkt_won,
        "cost_won": cost_total_won,
        "txn_cost_won": txn_cost_won,
        "user_total_won": user_total_won,
        # ★ P&L bp (avg DV01 기준) — V2 룰 target+3/stop-3 비교용
        "pnl_bp_on_avg_dv01": (user_total_won / ((dv01_long + dv01_short) / 2.0))
                              if (dv01_long + dv01_short) > 0 else None,
        # 운용 룰 임계 (V2)
        "rule_target_bp": 3.0,
        "rule_stop_bp": -3.0,
        "rule_max_hold_days": 90,
        "current_eps_long": float(cur_eps_long_v) if cur_eps_long_v is not None and pd.notna(cur_eps_long_v) else None,
        "current_eps_short": float(cur_eps_short_v) if cur_eps_short_v is not None and pd.notna(cur_eps_short_v) else None,
        "current_cum_eps_long": float(cur_cum_long) if cur_cum_long is not None and pd.notna(cur_cum_long) else None,
        "current_cum_eps_short": float(cur_cum_short) if cur_cum_short is not None and pd.notna(cur_cum_short) else None,
        "holding_days": int(holding_days),
    }


# ── 모델 ────────────────────────────────────────────
class PositionCreate(BaseModel):
    label: Optional[str] = None
    entry_date: str  # YYYY-MM-DD
    long_code: str
    long_face_eok: float
    long_entry_ytm: float
    short_code: str
    short_face_eok: float
    short_entry_ytm: float
    transaction_cost_bp: float = 1.0
    notes: Optional[str] = None


class PositionUpdate(BaseModel):
    label: Optional[str] = None
    entry_date: Optional[str] = None
    long_face_eok: Optional[float] = None
    long_entry_ytm: Optional[float] = None
    short_face_eok: Optional[float] = None
    short_entry_ytm: Optional[float] = None
    transaction_cost_bp: Optional[float] = None
    notes: Optional[str] = None


# ── 엔드포인트 ────────────────────────────────────
@router.get("/rv/instruments")
def list_instruments(q: Optional[str] = Query(default=None), limit: int = Query(default=200, ge=1, le=500)):
    """포지션 추가용 종목 목록 (국고채 only). q 검색어 (이름/코드/label)."""
    filters = ["k.category='국고채'", "k.ytm > 0", "k.bond_code IS NOT NULL", "k.bond_code != ''"]
    params: list = []
    if q:
        filters.append("(k.bond_name LIKE %s OR k.bond_code LIKE %s OR k.label LIKE %s OR k.nickname LIKE %s)")
        like = f"%{q}%"
        params.extend([like, like, like, like])
    where = " AND ".join(filters)
    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            f"""
            SELECT k.bond_code, k.bond_name, k.label, k.nickname,
                   k.remain_year, k.ytm, k.mat_date, k.issue_date
            FROM ktb k
            INNER JOIN (
                SELECT bond_code, MAX(price_date) AS d FROM ktb
                WHERE category='국고채' AND ytm > 0 AND bond_code IS NOT NULL AND bond_code != ''
                GROUP BY bond_code
            ) latest ON k.bond_code = latest.bond_code AND k.price_date = latest.d
            WHERE {where}
            ORDER BY k.remain_year ASC
            LIMIT %s
            """,
            params + [limit],
        )
        rows = cur.fetchall()
    out = []
    for r in rows:
        coupon = _parse_coupon_pct(r["bond_name"])
        out.append(
            {
                "bond_code": r["bond_code"],
                "bond_name": r["bond_name"],
                "label": r["label"],
                "nickname": r["nickname"],
                "remain_year": float(r["remain_year"]) if r["remain_year"] is not None else None,
                "ytm": float(r["ytm"]) if r["ytm"] is not None else None,
                "coupon_pct": coupon,
                "mat_date": r["mat_date"].isoformat() if r["mat_date"] else None,
            }
        )
    return out


@router.get("/rv/positions")
def list_positions():
    positions = _load_positions()

    decomposed: list[dict] = []
    p_long_dv01 = 0.0
    p_short_dv01 = 0.0
    p_delta = 0.0
    p_curve = 0.0
    p_alpha = 0.0
    p_total = 0.0
    p_total_mkt = 0.0
    p_cost = 0.0
    p_txn_cost = 0.0
    by_mat_long: dict[float, float] = {}
    by_mat_short: dict[float, float] = {}
    p_delta_dv01_per_bp = 0.0
    p_curve_dv01_per_bp = 0.0
    as_of_dates: list[str] = []

    for pos in positions:
        long_meta = _fetch_bond_meta_latest(pos["long_code"])
        short_meta = _fetch_bond_meta_latest(pos["short_code"])
        if not long_meta or not short_meta:
            continue
        try:
            entry_d = date.fromisoformat(pos["entry_date"])
        except Exception:
            continue

        # 진입일 ytm/remain (없으면 latest 사용)
        ent_long_db = _fetch_ytm_on(pos["long_code"], entry_d)
        ent_short_db = _fetch_ytm_on(pos["short_code"], entry_d)
        long_remain = ent_long_db[1] if ent_long_db[1] else long_meta["remain_year"] or 0
        short_remain = ent_short_db[1] if ent_short_db[1] else short_meta["remain_year"] or 0
        long_ytm_for_dur = ent_long_db[0] if ent_long_db[0] else pos["long_entry_ytm"]
        short_ytm_for_dur = ent_short_db[0] if ent_short_db[0] else pos["short_entry_ytm"]
        long_coupon = long_meta["coupon_pct"] if long_meta["coupon_pct"] is not None else 3.0
        short_coupon = short_meta["coupon_pct"] if short_meta["coupon_pct"] is not None else 3.0

        long_dur = _mod_duration(long_coupon, long_ytm_for_dur, long_remain)
        short_dur = _mod_duration(short_coupon, short_ytm_for_dur, short_remain)

        decomp = _decompose(
            long_code=pos["long_code"],
            short_code=pos["short_code"],
            long_face_eok=float(pos["long_face_eok"]),
            short_face_eok=float(pos["short_face_eok"]),
            long_duration=long_dur,
            short_duration=short_dur,
            long_entry_ytm=float(pos["long_entry_ytm"]),
            short_entry_ytm=float(pos["short_entry_ytm"]),
            entry_date=entry_d,
            transaction_cost_bp=float(pos.get("transaction_cost_bp", 1.0)),
        )

        item = {
            "id": pos["id"],
            "label": pos.get("label"),
            "entry_date": pos["entry_date"],
            "transaction_cost_bp": float(pos.get("transaction_cost_bp", 1.0)),
            "notes": pos.get("notes"),
            "created_at": pos.get("created_at"),
            "long": {
                "code": pos["long_code"],
                "name": long_meta["bond_name"],
                "label": long_meta.get("label"),
                "nickname": long_meta.get("nickname"),
                "face_eok": float(pos["long_face_eok"]),
                "entry_ytm": float(pos["long_entry_ytm"]),
                "current_ytm": decomp.get("current_long_ytm"),
                "duration": long_dur,
                "remain_year": long_remain,
                "coupon_pct": long_coupon,
                "dv01_man_per_bp": decomp.get("dv01_long_won", 0) / 1e4 if decomp.get("dv01_long_won") else 0,
            },
            "short": {
                "code": pos["short_code"],
                "name": short_meta["bond_name"],
                "label": short_meta.get("label"),
                "nickname": short_meta.get("nickname"),
                "face_eok": float(pos["short_face_eok"]),
                "entry_ytm": float(pos["short_entry_ytm"]),
                "current_ytm": decomp.get("current_short_ytm"),
                "duration": short_dur,
                "remain_year": short_remain,
                "coupon_pct": short_coupon,
                "dv01_man_per_bp": decomp.get("dv01_short_won", 0) / 1e4 if decomp.get("dv01_short_won") else 0,
            },
            "decomposition": decomp,
        }
        decomposed.append(item)

        if "error" in decomp:
            continue
        as_of_dates.append(decomp.get("as_of"))

        dv01_l_man = (decomp.get("dv01_long_won") or 0) / 1e4
        dv01_s_man = (decomp.get("dv01_short_won") or 0) / 1e4
        p_long_dv01 += dv01_l_man
        p_short_dv01 -= dv01_s_man  # SHORT 는 음수 부호
        p_delta += decomp.get("delta_won") or 0
        p_curve += decomp.get("curve_won") or 0
        p_alpha += decomp.get("alpha_won") or 0
        p_total += decomp.get("user_total_won") or 0
        p_total_mkt += decomp.get("total_mkt_won") or 0
        p_cost += decomp.get("cost_won") or 0
        p_txn_cost += decomp.get("txn_cost_won") or 0

        # β-DV01 (시장 평행이동에 대한 노출)
        if decomp.get("beta_long_lvl") is not None and decomp.get("beta_short_lvl") is not None:
            p_delta_dv01_per_bp += (-dv01_l_man * decomp["beta_long_lvl"]
                                    + dv01_s_man * decomp["beta_short_lvl"]) * (-1)
            # 위 식 부호 검토: 평행이동 +1bp 시 P&L = (DV01_S·β_S − DV01_L·β_L) × 1
            #   → 우리 portfolio 의 1bp delta 에 대한 P&L = ...
        if decomp.get("beta_long_slp") is not None and decomp.get("beta_short_slp") is not None:
            p_curve_dv01_per_bp += (dv01_s_man * decomp["beta_short_slp"]
                                    - dv01_l_man * decomp["beta_long_slp"])

        # by maturity: 0.5 단위 round
        rl = round(long_remain * 2) / 2
        rs = round(short_remain * 2) / 2
        by_mat_long[rl] = by_mat_long.get(rl, 0) + dv01_l_man
        by_mat_short[rs] = by_mat_short.get(rs, 0) + dv01_s_man

    keys = sorted(set(by_mat_long.keys()) | set(by_mat_short.keys()))
    by_maturity = []
    for k in keys:
        l = by_mat_long.get(k, 0)
        s = by_mat_short.get(k, 0)
        by_maturity.append(
            {
                "remain_year": k,
                "long_dv01_man": l,
                "short_dv01_man": s,
                "net_dv01_man": l - s,
            }
        )

    p_delta_pnl_per_bp = (
        p_delta_dv01_per_bp  # 1bp 평행이동 시 전체 P&L (만원)
    )

    return {
        "as_of": max(as_of_dates) if as_of_dates else None,
        "positions": decomposed,
        "portfolio": {
            "long_dv01_man_per_bp": p_long_dv01,
            "short_dv01_man_per_bp": p_short_dv01,
            "net_dv01_man_per_bp": p_long_dv01 + p_short_dv01,
            "delta_pnl_per_bp_man": p_delta_pnl_per_bp,
            "curve_pnl_per_bp_man": p_curve_dv01_per_bp,
            "delta_pnl_won": p_delta,
            "curve_pnl_won": p_curve,
            "alpha_pnl_won": p_alpha,
            "total_mkt_won": p_total_mkt,
            "cost_won": p_cost,
            "txn_cost_won": p_txn_cost,
            "total_pnl_won": p_total,
            "by_maturity": by_maturity,
        },
    }


@router.post("/rv/positions")
def add_position(body: PositionCreate):
    rec = body.model_dump()
    # 검증
    try:
        date.fromisoformat(rec["entry_date"])
    except Exception:
        raise HTTPException(400, "entry_date must be YYYY-MM-DD")
    long_meta = _fetch_bond_meta_latest(rec["long_code"])
    short_meta = _fetch_bond_meta_latest(rec["short_code"])
    if long_meta is None:
        raise HTTPException(400, f"unknown long_code: {rec['long_code']}")
    if short_meta is None:
        raise HTTPException(400, f"unknown short_code: {rec['short_code']}")
    if rec["long_code"] == rec["short_code"]:
        raise HTTPException(400, "long_code and short_code must differ")

    rec["id"] = uuid.uuid4().hex[:12]
    rec["created_at"] = datetime.now().isoformat(timespec="seconds")
    with _lock:
        positions = _load_positions()
        positions.append(rec)
        _save_positions(positions)
    return {"ok": True, "id": rec["id"]}


@router.delete("/rv/positions/{pos_id}")
def delete_position(pos_id: str):
    with _lock:
        positions = _load_positions()
        new_positions = [p for p in positions if p.get("id") != pos_id]
        if len(new_positions) == len(positions):
            raise HTTPException(404, "position not found")
        _save_positions(new_positions)
    return {"ok": True}


@router.patch("/rv/positions/{pos_id}")
def update_position(pos_id: str, body: PositionUpdate):
    payload = {k: v for k, v in body.model_dump().items() if v is not None}
    if "entry_date" in payload:
        try:
            date.fromisoformat(payload["entry_date"])
        except Exception:
            raise HTTPException(400, "entry_date must be YYYY-MM-DD")
    with _lock:
        positions = _load_positions()
        found = False
        for p in positions:
            if p.get("id") == pos_id:
                p.update(payload)
                p["updated_at"] = datetime.now().isoformat(timespec="seconds")
                found = True
                break
        if not found:
            raise HTTPException(404, "position not found")
        _save_positions(positions)
    return {"ok": True}


@router.get("/rv/positions/{pos_id}/epsilon_series")
def position_epsilon_series(pos_id: str, days: int = Query(default=120, ge=10, le=720)):
    """페어 LONG/SHORT 의 ε / cum_ε / spread 시계열."""
    positions = _load_positions()
    pos = next((p for p in positions if p.get("id") == pos_id), None)
    if not pos:
        raise HTTPException(404, "position not found")

    eng = _build_decomp_engine()
    if not eng:
        raise HTTPException(500, "engine empty")

    eps = eng["eps"]
    cum = eng["cum_eps"]
    long_code = pos["long_code"]
    short_code = pos["short_code"]
    if long_code not in eps.columns or short_code not in eps.columns:
        raise HTTPException(400, "bond not in panel")

    cutoff = pd.Timestamp.now().normalize() - pd.Timedelta(days=days)
    idx = eps.index[eps.index >= cutoff]
    out = []
    for d in idx:
        el = eps.loc[d, long_code]
        es = eps.loc[d, short_code]
        cl = cum.loc[d, long_code]
        cs = cum.loc[d, short_code]
        out.append(
            {
                "date": d.date().isoformat(),
                "eps_long": None if pd.isna(el) else float(el),
                "eps_short": None if pd.isna(es) else float(es),
                "cum_eps_long": None if pd.isna(cl) else float(cl),
                "cum_eps_short": None if pd.isna(cs) else float(cs),
                "eps_spread": (None if (pd.isna(el) or pd.isna(es)) else float(el - es)),
                "cum_eps_spread": (None if (pd.isna(cl) or pd.isna(cs)) else float(cl - cs)),
            }
        )
    return {
        "as_of": idx.max().date().isoformat() if len(idx) else None,
        "long_code": long_code,
        "short_code": short_code,
        "entry_date": pos["entry_date"],
        "series": out,
    }


@router.post("/rv/refresh")
def refresh_engine():
    """ε / β 패널 캐시 무효화 (DB 새 데이터 반영용)."""
    _invalidate_decomp_cache()
    return {"ok": True}
