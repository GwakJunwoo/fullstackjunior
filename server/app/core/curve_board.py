# -*- coding: utf-8 -*-
"""지표 커브/플라이 z-score 랭킹 보드 — 금리 대시보드 최상단용.

무엇을: 메인 온더런 지표(2·3·5·10·20·30년)의 *모든* 1:1 커브 페어(슬로프)와
*모든* 플라이를 6개월(126거래일) 롤링 z-score 로 측정해 |z| 큰 순(가장 어웨이순)으로
세운다. 각 항목의 6개월 시계열·평균·±σ·현재값·백분위를 함께 제공(프론트 차팅용).

정직성 핵심 — 롤(지표교체) 필터:
  라벨('10년지표')은 *현재 온더런*을 추종하므로 교체 시 종목이 바뀌며 YTM 이 점프한다
  (실측: 2025-12-10 10Y 교체 −8.3bp). 6개월 윈도 안의 이 점프는 *가짜 z* 를 만든다
  (시장이 안 움직였는데 커브가 튄 것처럼). 따라서 롤일의 *동일일자 신·구 종목 YTM 차*
  로 순수 롤점프를 추정해 과거 구간을 back-adjust(연속화)한다. 현재값은 실제 거래가능
  지표 스프레드 그대로(최신 구간은 무보정) → z 가 진짜 커브 이탈만 반영.

이건 *모니터링 지표*(현재 커브가 6M 분포 대비 얼마나 극단인가)이지 백테스트된 알파가
아니다. 수익 보장 신호로 표기하지 않는다(정직).
"""
from __future__ import annotations

from datetime import datetime

import pandas as pd

from .db import get_conn

# 메인 온더런 지표 tenor(년) → 라벨
TENORS: list[int] = [2, 3, 5, 10, 20, 30]
TENOR_LABEL = {t: f"{t}년지표" for t in TENORS}

WINDOWS = [63, 126]            # 3개월·6개월 (거래일). 매일 둘 다 계산 → 프론트 즉시 전환.
WINDOW_LABEL = {63: "3개월", 126: "6개월"}
DEFAULT_WINDOW = 126          # 기본 표시 윈도
FETCH_DAYS = 420              # 캘린더일 fetch (126거래일 + 롤/공휴일 버퍼)
MIN_OBS = 40                  # z 산출 최소 관측(3M 윈도도 충족)


def _fetch_label(cur, label: str, days: int) -> pd.DataFrame:
    cur.execute(
        """
        SELECT price_date, ytm, bond_code, bond_name
        FROM ktb
        WHERE label = %s
          AND price_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)
          AND ytm IS NOT NULL
        ORDER BY price_date ASC
        """,
        [label, days],
    )
    df = pd.DataFrame(cur.fetchall())
    if df.empty:
        return df
    df["ytm"] = df["ytm"].astype(float)
    df["price_date"] = pd.to_datetime(df["price_date"])
    return df.sort_values("price_date").reset_index(drop=True)


def _ytm_by_code(cur, bond_code, date) -> float | None:
    cur.execute(
        "SELECT ytm FROM ktb WHERE bond_code = %s AND price_date = %s "
        "AND ytm IS NOT NULL LIMIT 1",
        [bond_code, date.strftime("%Y-%m-%d")],
    )
    r = cur.fetchone()
    return float(r["ytm"]) if r and r["ytm"] is not None else None


def _roll_adjusted(cur, label: str, days: int):
    """라벨 series 를 롤 back-adjust → (연속 series DataFrame, 롤이벤트 list).

    adjusted[t] = raw[t] + Σ_{roll i: i>t} jump_i,  jump_i = ytm_new(d_i) − ytm_old(d_i)
    (동일일자 신·구 종목 차 = 순수 롤점프; 구종목 미호가 시 overnight gap 폴백).
    최신 구간은 무보정 → 현재값 = 실제 거래가능 지표값.
    """
    df = _fetch_label(cur, label, days)
    if df.empty:
        return df, []
    n = len(df)
    raw = df["ytm"].values
    code = df["bond_code"].values
    rolls = {}          # idx -> jump(bp단위 아님, ytm%)
    events = []
    for i in range(1, n):
        if code[i] != code[i - 1]:
            d = df["price_date"].iloc[i]
            y_old = _ytm_by_code(cur, code[i - 1], d)
            if y_old is None:
                jump = float(raw[i] - raw[i - 1])      # 폴백: 1일 gap(시장move 혼입)
                method = "overnight"
            else:
                jump = float(raw[i] - y_old)           # 순수 롤점프(동일일자)
                method = "same_date"
            rolls[i] = jump
            events.append({
                "date": d.strftime("%Y-%m-%d"),
                "jump_bp": round(jump * 100, 1),
                "old": str(df["bond_name"].iloc[i - 1]),
                "new": str(df["bond_name"].iloc[i]),
                "method": method,
            })
    # back-adjust (뒤에서 앞으로 누적)
    adj = [0.0] * n
    running = 0.0
    for t in range(n - 1, -1, -1):
        adj[t] = float(raw[t]) + running
        if t in rolls:
            running += rolls[t]
    out = pd.DataFrame({"price_date": df["price_date"], "adj": adj, "raw": raw})
    return out, events


def _zstats(series: pd.Series, window: int):
    """마지막 점의 롤링 z + 분포통계(주어진 윈도). series = 날짜정렬 값(bp)."""
    s = series.dropna()
    win = s.iloc[-window:] if len(s) >= window else s
    if len(win) < MIN_OBS:
        return None
    cur = float(s.iloc[-1])
    mean = float(win.mean())
    std = float(win.std(ddof=1))
    if std == 0 or pd.isna(std):
        return None
    z = (cur - mean) / std
    pct = float((win <= cur).mean()) * 100.0
    return {
        "current_bp": round(cur, 1),
        "z": round(z, 2),
        "mean_bp": round(mean, 1),
        "std_bp": round(std, 2),
        "pctile": round(pct, 0),
        "n_obs": int(len(win)),
        "min_bp": round(float(win.min()), 1),
        "max_bp": round(float(win.max()), 1),
    }


def _series_payload(vals: pd.Series, stat: dict, window: int) -> dict:
    """프론트 차팅용 윈도 시계열(±2σ 밴드 레벨 포함). vals=날짜인덱스 Series."""
    s = vals.dropna().iloc[-window:]
    d = s.index
    return {
        "dates": [x.strftime("%Y-%m-%d") for x in d],
        "values": [round(float(v), 2) for v in s],
        "mean": stat["mean_bp"],
        "band1": [round(stat["mean_bp"] - stat["std_bp"], 1),
                  round(stat["mean_bp"] + stat["std_bp"], 1)],
        "band2": [round(stat["mean_bp"] - 2 * stat["std_bp"], 1),
                  round(stat["mean_bp"] + 2 * stat["std_bp"], 1)],
    }


def _build_board(wide: pd.DataFrame, roll_by_tenor: dict, avail: list, window: int) -> dict:
    """주어진 윈도에 대한 슬로프(15)·플라이(20) z랭킹 산출."""
    cutoff = wide.index.max() - pd.Timedelta(days=int(window * 1.6))

    def roll_in(tenors):
        out = []
        for t in tenors:
            for ev in roll_by_tenor.get(t, []):
                if pd.to_datetime(ev["date"]) >= cutoff and abs(ev["jump_bp"]) >= 1.0:
                    out.append({"tenor": t, **ev})
        return out

    slopes, flies = [], []
    for i in range(len(avail)):
        for j in range(i + 1, len(avail)):
            a, b = avail[i], avail[j]              # a<b
            sp = (wide[b] - wide[a]) * 100.0       # bp, 장기−단기
            stat = _zstats(sp, window)
            if stat is None:
                continue
            slopes.append({
                "id": f"slope_{a}_{b}", "kind": "slope",
                "label": f"{a}·{b}", "name": f"{a}년·{b}년 슬로프",
                "legs": [a, b], **stat,
                "series": _series_payload(sp, stat, window),
                "rolls": roll_in([a, b]),
            })
    for i in range(len(avail)):
        for j in range(i + 1, len(avail)):
            for k in range(j + 1, len(avail)):
                a, b, c = avail[i], avail[j], avail[k]   # a<b<c, b=몸통
                fl = (2 * wide[b] - wide[a] - wide[c]) * 100.0   # bp, 몸통 cheap=+
                stat = _zstats(fl, window)
                if stat is None:
                    continue
                flies.append({
                    "id": f"fly_{a}_{b}_{c}", "kind": "fly",
                    "label": f"{a}·{b}·{c}", "name": f"{a}·{b}·{c} 플라이",
                    "legs": [a, b, c], **stat,
                    "series": _series_payload(fl, stat, window),
                    "rolls": roll_in([a, b, c]),
                })

    slopes.sort(key=lambda x: -abs(x["z"]))
    flies.sort(key=lambda x: -abs(x["z"]))
    allrk = sorted(slopes + flies, key=lambda x: -abs(x["z"]))
    return {
        "window_days": window, "window_label": WINDOW_LABEL.get(window, f"{window}d"),
        "n_slopes": len(slopes), "n_flies": len(flies),
        "ranked": allrk, "slopes": slopes, "flies": flies,
    }


def compute_board() -> dict:
    """커브/플라이 랭킹 보드 산출 — 3·6개월 윈도 모두. {as_of, windows{}, ...}."""
    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        adj_by_tenor: dict[int, pd.DataFrame] = {}
        roll_by_tenor: dict[int, list] = {}
        for t in TENORS:
            a, ev = _roll_adjusted(cur, TENOR_LABEL[t], FETCH_DAYS)
            if not a.empty:
                adj_by_tenor[t] = a.set_index("price_date")
                roll_by_tenor[t] = ev

    # 공통일자 정렬 wide (롤 back-adjust 된 series — 윈도 무관, 1회 계산)
    wide = pd.DataFrame({t: adj_by_tenor[t]["adj"] for t in adj_by_tenor}).sort_index()
    as_of = wide.dropna(how="all").index.max()
    avail = [t for t in TENORS if t in wide.columns]

    # 윈도별 보드 (매일 둘 다 계산 → 프론트 즉시 전환)
    windows = {str(w): _build_board(wide, roll_by_tenor, avail, w) for w in WINDOWS}
    default = windows[str(DEFAULT_WINDOW)]

    return {
        "as_of": as_of.strftime("%Y-%m-%d") if as_of is not None else None,
        "tenors": avail,
        "windows_avail": WINDOWS,
        "default_window": DEFAULT_WINDOW,
        "windows": windows,
        # 하위호환(구 프론트 무중단): 기본 윈도(6M) 평면 필드 — 동일 객체 참조
        "window_days": DEFAULT_WINDOW,
        "n_slopes": default["n_slopes"], "n_flies": default["n_flies"],
        "ranked": default["ranked"], "slopes": default["slopes"], "flies": default["flies"],
        "roll_events": {str(t): roll_by_tenor.get(t, []) for t in avail},
        "note": ("롤(지표교체) back-adjust 적용 — 라벨 커브의 교체점프를 동일일자 신·구 "
                 "YTM차로 중화. 현재 커브가 선택 윈도(3·6개월) 분포 대비 몇 σ인지 "
                 "모니터(백테스트 알파 아님)."),
    }


# ── 일일 캐시 (latest 지표일 키 — 새 데이터 적재 시 자동 갱신) ───────────────
_CACHE: dict = {"key": None, "data": None}


def _latest_bench_date():
    with get_conn() as conn:
        cur = conn.cursor()
        cur.execute("SELECT MAX(price_date) FROM ktb WHERE label = '3년지표'")
        row = cur.fetchone()
        return row[0] if row else None


def get_board(force: bool = False) -> dict:
    """캐시된 보드 반환. 최신 지표일이 바뀌면(=새 데이터) 자동 재계산. 일일 갱신."""
    key = str(_latest_bench_date())
    if (not force) and _CACHE["key"] == key and _CACHE["data"] is not None:
        out = dict(_CACHE["data"])
        out["cached"] = True
        return out
    data = compute_board()
    _CACHE["key"] = key
    _CACHE["data"] = data
    out = dict(data)
    out["cached"] = False
    return out


if __name__ == "__main__":
    import json
    import sys

    sys.path.insert(0, ".")
    b = compute_board()
    print(f"as_of={b['as_of']} tenors={b['tenors']} slopes={b['n_slopes']} flies={b['n_flies']}")
    print("\n=== |z| 가장 어웨이 TOP 12 ===")
    print("%-16s %7s %7s %8s %7s  %s" % ("구성", "현재bp", "z", "평균bp", "pct%", "윈도롤"))
    for x in b["ranked"][:12]:
        rj = ("·".join(f"{e['tenor']}Y{e['jump_bp']:+.0f}" for e in x["rolls"]) or "-")
        print("%-16s %7.1f %+7.2f %8.1f %7.0f  %s" %
              (x["name"], x["current_bp"], x["z"], x["mean_bp"], x["pctile"], rj))
    print("\n=== 롤 이벤트 (윈도 부근) ===")
    for t, evs in b["roll_events"].items():
        for e in evs:
            print(f"  {t}년 {e['date']} {e['jump_bp']:+.1f}bp [{e['method']}] {e['old']} → {e['new']}")
