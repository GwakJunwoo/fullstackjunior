import math
from functools import lru_cache

import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from ..core.db import clean_rows, get_conn


router = APIRouter()

_LABEL_EXCLUDE = ("2년지표", "3년지표", "5년지표", "10년지표", "20년지표", "30년지표")
_DEFAULT_CATEGORIES = ("국고채", "통안채", "국채선물", "IRS")
_INSTRUMENT_KEY_SQL = "COALESCE(NULLIF(bond_code,''), NULLIF(label,''), NULLIF(nickname,''))"
_INSTRUMENT_NAME_SQL = "COALESCE(NULLIF(bond_name,''), NULLIF(label,''), NULLIF(nickname,''), NULLIF(bond_code,''))"


def _sgn(v: float | None) -> int:
    if v is None:
        return 0
    if v > 0:
        return 1
    if v < 0:
        return -1
    return 0


def _parse_categories(categories: str | None) -> list[str]:
    if not categories:
        return list(_DEFAULT_CATEGORIES)
    values = [value.strip() for value in categories.split(",") if value.strip()]
    return values or list(_DEFAULT_CATEGORIES)


def _categories_key(categories: list[str]) -> str:
    return ",".join(sorted(dict.fromkeys(categories)))


def _placeholders(values: list[str]) -> str:
    return ",".join(["%s"] * len(values))


def _load_label_series(label: str, days: int = 500) -> pd.Series:
    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT price_date, AVG(ytm) AS ytm
            FROM ktb
            WHERE label = %s
              AND price_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
            GROUP BY price_date
            ORDER BY price_date ASC
            """,
            (label, days),
        )
        rows = cur.fetchall()
    if not rows:
        return pd.Series(dtype=float, name=label)
    df = pd.DataFrame(rows)
    df["price_date"] = pd.to_datetime(df["price_date"])
    series = df.set_index("price_date")["ytm"].astype(float).sort_index()
    series.name = label
    return series


def _load_instrument_panel(days: int, categories: list[str]) -> pd.DataFrame:
    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            f"""
            SELECT price_date,
                   {_INSTRUMENT_KEY_SQL} AS instrument_key,
                   ANY_VALUE({_INSTRUMENT_NAME_SQL}) AS instrument_name,
                   ANY_VALUE(category) AS category,
                   ANY_VALUE(label) AS label,
                   ANY_VALUE(nickname) AS nickname,
                   ANY_VALUE(bond_code) AS bond_code,
                   AVG(remain_year) AS remain_year,
                   AVG(ytm) AS ytm
            FROM ktb
            WHERE category IN ({_placeholders(categories)})
              AND price_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
              AND {_INSTRUMENT_KEY_SQL} IS NOT NULL
              AND (label IS NULL OR label NOT IN ({_placeholders(list(_LABEL_EXCLUDE))}))
            GROUP BY price_date, instrument_key
            ORDER BY price_date ASC, instrument_key ASC
            """,
            categories + [days] + list(_LABEL_EXCLUDE),
        )
        rows = cur.fetchall()
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    df["price_date"] = pd.to_datetime(df["price_date"])
    return df


def _load_latest_snapshot(
    categories: list[str],
    q: str | None = None,
    limit: int = 300,
    remain_min: float | None = None,
    remain_max: float | None = None,
) -> pd.DataFrame:
    filters = [
        f"k.category IN ({_placeholders(categories)})",
        f"{_INSTRUMENT_KEY_SQL} IS NOT NULL",
        f"(k.label IS NULL OR k.label NOT IN ({_placeholders(list(_LABEL_EXCLUDE))}))",
    ]
    params: list = list(categories) + list(_LABEL_EXCLUDE)

    if q:
        like = f"%{q}%"
        filters.append(
            f"({_INSTRUMENT_NAME_SQL} LIKE %s OR {_INSTRUMENT_KEY_SQL} LIKE %s OR k.label LIKE %s OR k.nickname LIKE %s)"
        )
        params.extend([like, like, like, like])

    if remain_min is not None:
        filters.append("k.remain_year >= %s")
        params.append(float(remain_min))
    if remain_max is not None:
        filters.append("k.remain_year <= %s")
        params.append(float(remain_max))

    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute(
            f"""
            SELECT latest.instrument_key,
                   ANY_VALUE({_INSTRUMENT_NAME_SQL}) AS instrument_name,
                   ANY_VALUE(k.category) AS category,
                   ANY_VALUE(k.label) AS label,
                   ANY_VALUE(k.nickname) AS nickname,
                   ANY_VALUE(k.bond_code) AS bond_code,
                   AVG(k.remain_year) AS remain_year,
                   AVG(k.ytm) AS ytm,
                   MAX(k.price_date) AS price_date
            FROM ktb k
            INNER JOIN (
                SELECT {_INSTRUMENT_KEY_SQL} AS instrument_key,
                       MAX(price_date) AS max_date
                FROM ktb
                WHERE category IN ({_placeholders(categories)})
                  AND {_INSTRUMENT_KEY_SQL} IS NOT NULL
                  AND (label IS NULL OR label NOT IN ({_placeholders(list(_LABEL_EXCLUDE))}))
                GROUP BY instrument_key
            ) latest
              ON {_INSTRUMENT_KEY_SQL} = latest.instrument_key
             AND k.price_date = latest.max_date
            WHERE {' AND '.join(filters)}
            GROUP BY latest.instrument_key
            ORDER BY category ASC, remain_year ASC, instrument_name ASC
            LIMIT %s
            """,
            categories + list(_LABEL_EXCLUDE) + params + [limit],
        )
        rows = cur.fetchall()

    if not rows:
        return pd.DataFrame(
            columns=[
                "instrument_key",
                "instrument_name",
                "category",
                "label",
                "nickname",
                "bond_code",
                "remain_year",
                "ytm",
                "price_date",
            ]
        )

    df = pd.DataFrame(rows)
    df["price_date"] = pd.to_datetime(df["price_date"])
    return df


def _rolling_two_factor_beta(
    dy_panel: pd.DataFrame,
    dy_level_bp: pd.Series,
    dy_slope_bp: pd.Series,
    window: int = 63,
    min_periods: int = 20,
) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    # x1 = level (Δ10Y), x2 = slope (Δ10Y − Δ3Y)  → near-orthogonal factors
    idx = dy_panel.index.intersection(dy_level_bp.index).intersection(dy_slope_bp.index)
    if idx.empty or dy_panel.empty:
        empty = pd.DataFrame(index=idx, columns=dy_panel.columns, dtype=float)
        return empty.copy(), empty.copy(), empty.copy()

    y_panel = dy_panel.reindex(idx)
    x1 = dy_level_bp.reindex(idx).astype(float)
    x2 = dy_slope_bp.reindex(idx).astype(float)

    beta_level = pd.DataFrame(index=idx, columns=y_panel.columns, dtype=float)
    beta_slope = pd.DataFrame(index=idx, columns=y_panel.columns, dtype=float)
    eps = pd.DataFrame(index=idx, columns=y_panel.columns, dtype=float)

    for key in y_panel.columns:
        y = y_panel[key].astype(float)
        valid = y.notna() & x1.notna() & x2.notna()
        x1v = x1.where(valid)
        x2v = x2.where(valid)
        yv = y.where(valid)

        s11 = (x1v * x1v).rolling(window, min_periods=min_periods).sum()
        s22 = (x2v * x2v).rolling(window, min_periods=min_periods).sum()
        s12 = (x1v * x2v).rolling(window, min_periods=min_periods).sum()
        s1y = (x1v * yv).rolling(window, min_periods=min_periods).sum()
        s2y = (x2v * yv).rolling(window, min_periods=min_periods).sum()
        nobs = valid.astype(float).rolling(window, min_periods=min_periods).sum()

        det = s11 * s22 - s12 * s12
        det_ok = det.abs() > 1e-9

        b_level = ((s1y * s22) - (s2y * s12)) / det
        b_slope = ((s2y * s11) - (s1y * s12)) / det
        b_level = b_level.where(det_ok & (nobs >= min_periods))
        b_slope = b_slope.where(det_ok & (nobs >= min_periods))

        beta_level[key] = b_level
        beta_slope[key] = b_slope
        eps[key] = y - (b_level * x1 + b_slope * x2)

    return beta_level, beta_slope, eps


def _pick_default_keys(snapshot: pd.DataFrame) -> list[str]:
    if snapshot.empty:
        return []
    defaults: list[str] = []
    for category in snapshot["category"].dropna().unique().tolist():
        subset = snapshot[snapshot["category"] == category].copy()
        if subset.empty:
            continue
        if subset["remain_year"].notna().any():
            subset = subset.sort_values(["remain_year", "instrument_name"])
            row = subset.iloc[len(subset) // 2]
        else:
            row = subset.sort_values("instrument_name").iloc[0]
        defaults.append(str(row["instrument_key"]))
    return defaults[:4]


def _values_for_dates(series: pd.Series, dates: pd.Index) -> list[float | None]:
    return [None if pd.isna(v) else float(v) for v in series.reindex(dates).tolist()]


@lru_cache(maxsize=16)
def _build_beta_decomposition_universe(
    days: int = 900,
    categories_key: str = ",".join(_DEFAULT_CATEGORIES),
    window: int = 63,
    min_periods: int = 20,
    mode: str = "diff",
) -> dict:
    """팩터 분해 universe builder.

    mode:
      - "diff"  : ΔY_i = α + β_lvl·ΔY_3Y + β_slope·Δ(10Y−3Y) + ε   (변동분 회귀, 기본)
      - "level" : Y_i  = α + β_lvl·Y_3Y  + β_slope·(10Y−3Y) + ε    (수준 회귀)

    수준 회귀의 ε 는 "현재 fair value gap (bp)" 으로 해석. 변동분 회귀의 ε 는
    "당일 idiosyncratic dY (bp)". cum_ε_21d 는 두 모드 동일 형식 (21일 합).
    """
    categories = _parse_categories(categories_key)
    lookback_days = max(days + window + 30, 240)
    s3 = _load_label_series("3년지표", days=lookback_days)
    s10 = _load_label_series("10년지표", days=lookback_days)
    panel = _load_instrument_panel(days=lookback_days, categories=categories)
    latest = _load_latest_snapshot(categories=categories, limit=1000)

    if s3.empty or s10.empty or panel.empty:
        return {
            "ytm_panel": pd.DataFrame(),
            "gamma_slope": pd.DataFrame(),
            "epsilon": pd.DataFrame(),
            "cum_epsilon": pd.DataFrame(),
            "category_series": {},
            "meta": {},
            "defaults": [],
            "pool_sigma_21_bp": None,
            "latest_dy_bp": pd.Series(dtype=float),
            "mode": mode,
        }

    ytm_panel = panel.pivot_table(index="price_date", columns="instrument_key", values="ytm", aggfunc="mean").sort_index()
    idx = ytm_panel.index.union(s3.index).union(s10.index).sort_values()
    ytm_panel_raw = ytm_panel.reindex(idx)          # 실제 데이터 있는 날짜만 (ffill 없음)
    ytm_panel = ytm_panel_raw.ffill()
    dy_panel = ytm_panel.diff() * 100.0
    s3_full = s3.reindex(idx).ffill()
    s10_full = s10.reindex(idx).ffill()
    dy3_bp = s3_full.diff() * 100.0
    dy10_bp = s10_full.diff() * 100.0

    if mode == "level":
        y_panel = ytm_panel * 100.0                            # level (bp)
        x1 = s3_full.astype(float) * 100.0                     # level: Y_3Y (bp)
        x2 = (s10_full - s3_full).astype(float) * 100.0        # slope level: 10Y-3Y (bp)
    else:
        y_panel = dy_panel                                     # ΔY (bp)
        x1 = dy3_bp                                            # ΔY_3Y (bp)
        x2 = dy10_bp - dy3_bp                                  # Δ(10Y-3Y) (bp)

    beta_level, beta_slope, epsilon = _rolling_two_factor_beta(
        dy_panel=y_panel,
        dy_level_bp=x1,
        dy_slope_bp=x2,
        window=window,
        min_periods=min_periods,
    )
    gamma_slope = beta_slope
    # cum_eps:
    #   diff 모드 → 21일 합 (한 달간 누적 idiosyncratic dY)
    #   level 모드 → 21일 평균 (단기 노이즈 제거된 fair value gap)
    if mode == "level":
        cum_epsilon = epsilon.rolling(21, min_periods=11).mean()
    else:
        cum_epsilon = epsilon.rolling(21, min_periods=11).sum()

    latest_by_key = latest.set_index("instrument_key") if not latest.empty else pd.DataFrame()
    meta: dict = {}
    for key in ytm_panel.columns.tolist():
        row = latest_by_key.loc[key] if key in latest_by_key.index else None
        meta[key] = {
            "instrument_key": key,
            "instrument_name": (None if row is None else row.get("instrument_name")) or key,
            "category": None if row is None else row.get("category"),
            "label": None if row is None else row.get("label"),
            "nickname": None if row is None else row.get("nickname"),
            "bond_code": None if row is None else row.get("bond_code"),
            "remain_year": None if row is None or pd.isna(row.get("remain_year")) else float(row.get("remain_year")),
            "ytm": None if row is None or pd.isna(row.get("ytm")) else float(row.get("ytm")),
        }

    category_series: dict = {}
    for category in categories:
        keys = [key for key, row in meta.items() if row.get("category") == category and key in gamma_slope.columns]
        if not keys:
            continue
        category_series[category] = {
            "gamma_slope": gamma_slope[keys].mean(axis=1),
            "epsilon_bp": epsilon[keys].mean(axis=1),
            "cum_epsilon_21d": cum_epsilon[keys].mean(axis=1),
        }

    pool_sigma_21_bp = None
    pool_eps_std = epsilon.stack().std()
    if pd.notna(pool_eps_std):
        pool_sigma_21_bp = float(pool_eps_std * math.sqrt(21.0))

    return {
        "ytm_panel": ytm_panel,
        "ytm_panel_raw": ytm_panel_raw,
        "gamma_slope": gamma_slope,
        "epsilon": epsilon,
        "cum_epsilon": cum_epsilon,
        "category_series": category_series,
        "meta": meta,
        "defaults": _pick_default_keys(latest),
        "pool_sigma_21_bp": pool_sigma_21_bp,
        "latest_dy_bp": dy_panel.iloc[-1].dropna() if not dy_panel.empty else pd.Series(dtype=float),
        "mode": mode,
    }


def _build_beta_snapshot() -> dict:
    s3 = _load_label_series("3년지표", days=520)
    s10 = _load_label_series("10년지표", days=520)
    if s3.empty or s10.empty:
        raise HTTPException(status_code=500, detail="ktb 지표(3년/10년) 데이터가 부족합니다.")

    idx = s3.index.union(s10.index).sort_values()
    s3 = s3.reindex(idx).ffill()
    s10 = s10.reindex(idx).ffill()

    dy3_bp = s3.diff() * 100.0
    dy10_bp = s10.diff() * 100.0
    slope_bp = (s10 - s3) * 100.0
    slope_chg_bp = slope_bp.diff()

    cum63 = dy3_bp.rolling(63, min_periods=20).sum()
    cum21_slope = slope_chg_bp.rolling(21, min_periods=10).sum()

    as_of = idx.max()
    mom_sig = -_sgn(float(cum63.dropna().iloc[-1])) if not cum63.dropna().empty else 0
    curve_sig = -_sgn(float(cum21_slope.dropna().iloc[-1])) if not cum21_slope.dropna().empty else 0

    return {
        "as_of": as_of.date().isoformat(),
        "mom": {
            "signal": mom_sig,
            "cum_dy_3y_63d_bp": float(cum63.loc[as_of]) if pd.notna(cum63.loc[as_of]) else None,
            "dy_3y_1d_bp": float(dy3_bp.loc[as_of]) if pd.notna(dy3_bp.loc[as_of]) else None,
            "level_3y": float(s3.loc[as_of]) if pd.notna(s3.loc[as_of]) else None,
        },
        "curve": {
            "signal": curve_sig,
            "cum_slope_21d_bp": float(cum21_slope.loc[as_of]) if pd.notna(cum21_slope.loc[as_of]) else None,
            "slope_bp": float(slope_bp.loc[as_of]) if pd.notna(slope_bp.loc[as_of]) else None,
            "dy_10y_1d_bp": float(dy10_bp.loc[as_of]) if pd.notna(dy10_bp.loc[as_of]) else None,
            "level_10y": float(s10.loc[as_of]) if pd.notna(s10.loc[as_of]) else None,
        },
    }


@router.get("/beta/snapshot")
def beta_snapshot():
    try:
        return _build_beta_snapshot()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/beta/rv")
def beta_rv(
    limit: int = Query(default=8, ge=3, le=30),
    categories: str | None = Query(default=None, description="쉼표 구분 category 목록"),
    mode: str = Query(default="diff", pattern="^(diff|level)$",
                      description="회귀 모드: 'diff'(변동분 ΔY) | 'level'(수준 Y)"),
    remain_min: float | None = Query(default=None, description="잔존만기 최소(년)"),
    remain_max: float | None = Query(default=None, description="잔존만기 최대(년)"),
):
    try:
        key = _categories_key(_parse_categories(categories))
        universe = _build_beta_decomposition_universe(days=900, categories_key=key, mode=mode)
        scores: pd.Series = universe["cum_epsilon"].iloc[-1].dropna() if not universe["cum_epsilon"].empty else pd.Series(dtype=float)
        latest_dy: pd.Series = universe["latest_dy_bp"]
        meta: dict = universe["meta"]

        if scores.empty:
            return {"as_of": None, "long": [], "short": []}

        rows = []
        for instrument_key, score in scores.items():
            item = meta.get(instrument_key, {})
            ry = item.get("remain_year")
            # 잔존만기 필터
            if remain_min is not None and (ry is None or ry < remain_min):
                continue
            if remain_max is not None and (ry is None or ry > remain_max):
                continue
            rows.append(
                {
                    "instrument_key": instrument_key,
                    "instrument_name": item.get("instrument_name") or instrument_key,
                    "category": item.get("category"),
                    "remain_year": ry,
                    "ytm": item.get("ytm"),
                    "dy_1d_bp": None if instrument_key not in latest_dy.index or pd.isna(latest_dy.get(instrument_key)) else float(latest_dy.get(instrument_key)),
                    "rv_score_bp": float(score),
                }
            )
        frame = pd.DataFrame(rows)
        if frame.empty:
            return {"as_of": None, "mode": universe.get("mode", mode), "long": [], "short": [], "universe_n": 0}
        long_rows = frame.sort_values("rv_score_bp", ascending=False).head(limit)
        short_rows = frame.sort_values("rv_score_bp", ascending=True).head(limit)
        as_of = universe["cum_epsilon"].index[-1].date().isoformat()
        return {
            "as_of": as_of,
            "mode": universe.get("mode", mode),
            "universe_n": len(frame),
            "long": clean_rows(long_rows.to_dict(orient="records")),
            "short": clean_rows(short_rows.to_dict(orient="records")),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/beta/search")
def beta_search(
    q: str = Query(default=""),
    limit: int = Query(default=30, ge=5, le=200),
    categories: str | None = Query(default=None, description="쉼표 구분 category 목록"),
    remain_min: float | None = Query(default=None, description="잔존만기 최소(년)"),
    remain_max: float | None = Query(default=None, description="잔존만기 최대(년)"),
):
    try:
        rows = _load_latest_snapshot(
            categories=_parse_categories(categories),
            q=q.strip() or None,
            limit=limit,
            remain_min=remain_min,
            remain_max=remain_max,
        )
        return {"results": clean_rows(rows.to_dict(orient="records"))}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/beta/universe")
def beta_universe(
    limit: int = Query(default=240, ge=20, le=1000),
    categories: str | None = Query(default=None, description="쉼표 구분 category 목록"),
    remain_min: float | None = Query(default=None, description="잔존만기 최소(년)"),
    remain_max: float | None = Query(default=None, description="잔존만기 최대(년)"),
):
    try:
        rows = _load_latest_snapshot(
            categories=_parse_categories(categories),
            limit=limit,
            remain_min=remain_min,
            remain_max=remain_max,
        )
        return {
            "items": clean_rows(rows.to_dict(orient="records")),
            "defaults": _pick_default_keys(rows),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/beta/decomposition")
def beta_decomposition(
    keys: str = Query(..., description="쉼표 구분 instrument_key 목록"),
    start_date: str | None = Query(default=None, description="YYYY-MM-DD"),
    days: int = Query(default=900, ge=120, le=1600),
    categories: str | None = Query(default=None, description="쉼표 구분 category 목록"),
    mode: str = Query(default="diff", pattern="^(diff|level)$",
                      description="회귀 모드: 'diff'(변동분 ΔY) | 'level'(수준 Y)"),
):
    try:
        selected_keys = [key.strip() for key in keys.split(",") if key.strip()]
        categories_key = _categories_key(_parse_categories(categories))
        universe = _build_beta_decomposition_universe(days=days, categories_key=categories_key, mode=mode)

        gamma_slope: pd.DataFrame = universe["gamma_slope"]
        epsilon: pd.DataFrame = universe["epsilon"]
        cum_epsilon: pd.DataFrame = universe["cum_epsilon"]
        if gamma_slope.empty:
            return {
                "as_of": None,
                "mode": mode,
                "dates": [],
                "series": {},
                "meta": {},
                "category_series": {},
                "defaults": universe["defaults"],
                "pool_sigma_21_bp": universe["pool_sigma_21_bp"],
            }

        available_keys = [key for key in selected_keys if key in gamma_slope.columns]
        if not available_keys:
            available_keys = [key for key in universe["defaults"] if key in gamma_slope.columns]

        dates = gamma_slope.index
        if start_date:
            dates = dates[dates >= pd.Timestamp(start_date)]
        if len(dates) > days:
            dates = dates[-days:]

        series = {}
        for key in available_keys:
            series[key] = {
                "gamma_slope": _values_for_dates(gamma_slope[key], dates),
                "epsilon_bp": _values_for_dates(epsilon[key], dates),
                "cum_epsilon_21d": _values_for_dates(cum_epsilon[key], dates),
            }

        category_series = {}
        for category, payload in universe["category_series"].items():
            category_series[category] = {
                "gamma_slope": _values_for_dates(payload["gamma_slope"], dates),
                "epsilon_bp": _values_for_dates(payload["epsilon_bp"], dates),
                "cum_epsilon_21d": _values_for_dates(payload["cum_epsilon_21d"], dates),
            }

        return {
            "as_of": dates[-1].date().isoformat() if len(dates) else None,
            "mode": universe.get("mode", mode),
            "dates": [date.date().isoformat() for date in dates],
            "series": series,
            "meta": {key: universe["meta"].get(key, {"instrument_key": key, "instrument_name": key}) for key in available_keys},
            "category_series": category_series,
            "defaults": universe["defaults"],
            "pool_sigma_21_bp": universe["pool_sigma_21_bp"],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/beta/spread")
def beta_spread(
    long_key: str = Query(..., description="long instrument_key"),
    short_key: str = Query(..., description="short instrument_key"),
    start_date: str | None = Query(default=None, description="YYYY-MM-DD"),
    days: int = Query(default=900, ge=90, le=1600),
    categories: str | None = Query(default=None, description="쉼표 구분 category 목록"),
):
    try:
        categories_key = _categories_key(_parse_categories(categories))
        universe = _build_beta_decomposition_universe(days=days, categories_key=categories_key)
        ytm_panel_raw: pd.DataFrame = universe["ytm_panel_raw"]
        if ytm_panel_raw.empty or long_key not in ytm_panel_raw.columns or short_key not in ytm_panel_raw.columns:
            return {"dates": [], "long": [], "short": [], "spread_bp": [], "meta": {}}

        # 두 시리즈 모두 실제 데이터가 있는 날짜만
        both_valid = ytm_panel_raw[long_key].notna() & ytm_panel_raw[short_key].notna()
        dates = ytm_panel_raw.index[both_valid]
        if start_date:
            dates = dates[dates >= pd.Timestamp(start_date)]
        if len(dates) > days:
            dates = dates[-days:]

        long_series = ytm_panel_raw[long_key].reindex(dates)
        short_series = ytm_panel_raw[short_key].reindex(dates)
        spread_bp = (long_series - short_series) * 100.0

        return {
            "dates": [date.date().isoformat() for date in dates],
            "long": _values_for_dates(long_series, dates),
            "short": _values_for_dates(short_series, dates),
            "spread_bp": _values_for_dates(spread_bp, dates),
            "meta": {
                "long": universe["meta"].get(long_key, {"instrument_key": long_key, "instrument_name": long_key}),
                "short": universe["meta"].get(short_key, {"instrument_key": short_key, "instrument_name": short_key}),
            },
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/beta/series")
def beta_series(days: int = Query(default=365, ge=90, le=1200)):
    try:
        s3 = _load_label_series("3년지표", days=days + 120)
        s10 = _load_label_series("10년지표", days=days + 120)
        if s3.empty or s10.empty:
            return {"rows": []}

        idx = s3.index.union(s10.index).sort_values()
        s3 = s3.reindex(idx).ffill()
        s10 = s10.reindex(idx).ffill()

        dy3_bp = s3.diff() * 100.0
        slope_chg_bp = ((s10 - s3) * 100.0).diff()

        mom_sig = -dy3_bp.rolling(63, min_periods=20).sum().apply(lambda x: _sgn(float(x)) if pd.notna(x) else 0)
        curve_sig = -slope_chg_bp.rolling(21, min_periods=10).sum().apply(lambda x: _sgn(float(x)) if pd.notna(x) else 0)

        mom_pnl_bp = mom_sig.shift(1) * (-dy3_bp)
        curve_pnl_bp = curve_sig.shift(1) * (-slope_chg_bp)
        combo_pnl_bp = (mom_pnl_bp.fillna(0.0) + curve_pnl_bp.fillna(0.0)) / 2.0

        out = pd.DataFrame(
            {
                "date": idx,
                "mom_signal": mom_sig,
                "curve_signal": curve_sig,
                "mom_pnl_bp": mom_pnl_bp,
                "curve_pnl_bp": curve_pnl_bp,
                "combo_pnl_bp": combo_pnl_bp,
                "cum_mom_bp": mom_pnl_bp.fillna(0.0).cumsum(),
                "cum_curve_bp": curve_pnl_bp.fillna(0.0).cumsum(),
                "cum_combo_bp": combo_pnl_bp.fillna(0.0).cumsum(),
            }
        ).dropna(subset=["date"])

        out = out.tail(days)
        out["date"] = out["date"].dt.date.astype(str)
        return {"count": int(len(out)), "rows": clean_rows(out.to_dict(orient="records"))}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
