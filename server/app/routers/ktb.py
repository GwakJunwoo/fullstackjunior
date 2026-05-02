from fastapi import APIRouter, HTTPException, Query

from ..core.db import clean_rows, get_conn, serialize


router = APIRouter()


@router.get("/ktb/categories")
def ktb_categories():
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT DISTINCT category FROM ktb WHERE category IS NOT NULL ORDER BY category")
            cats = [row[0] for row in cur.fetchall()]
        return {"categories": cats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ktb/search")
def ktb_search(
    q: str = Query(..., min_length=1),
    limit: int = Query(default=40, le=100),
):
    try:
        like = f"%{q}%"
        with get_conn() as conn:
            cur = conn.cursor(dictionary=True)
            cur.execute(
                """
                SELECT k.label, k.bond_code, k.bond_name, k.nickname,
                       k.category, k.remain_year, k.ytm,
                       k.price_date, k.basket
                FROM ktb k
                INNER JOIN (
                    SELECT label, MAX(price_date) AS max_date
                    FROM ktb
                    GROUP BY label
                ) latest
                  ON k.label      = latest.label
                 AND k.price_date = latest.max_date
                WHERE k.label     LIKE %s
                   OR k.nickname  LIKE %s
                   OR k.bond_name LIKE %s
                   OR k.bond_code LIKE %s
                ORDER BY k.category ASC, k.remain_year ASC
                LIMIT %s
                """,
                (like, like, like, like, limit),
            )
            rows = cur.fetchall()
        return {"results": clean_rows(rows)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ktb/series")
def ktb_series(
    label: str = Query(None, description="label 컬럼 정확 일치"),
    nickname: str = Query(None, description="nickname 컬럼 정확 일치"),
    tenor: float = Query(None, description="잔존만기(년) — 가장 가까운 채권"),
    days: int = Query(default=365, le=3650),
    category: str = Query(None),
):
    try:
        filters, params = [], []

        if category:
            filters.append("AND category = %s")
            params.append(category)
        if days > 0:
            filters.append("AND price_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)")
            params.append(days)
        filter_sql = " ".join(filters)

        with get_conn() as conn:
            cur = conn.cursor(dictionary=True)

            if label:
                cur.execute(
                    f"""
                    SELECT price_date, ytm, label, nickname, remain_year, bond_name
                    FROM ktb
                    WHERE label = %s {filter_sql}
                    ORDER BY price_date ASC
                    """,
                    [label] + params,
                )
            elif nickname:
                cur.execute(
                    f"""
                    SELECT price_date, ytm, label, nickname, remain_year, bond_name
                    FROM ktb
                    WHERE nickname = %s {filter_sql}
                    ORDER BY price_date ASC
                    """,
                    [nickname] + params,
                )
            elif tenor is not None:
                cur.execute(
                    f"""
                    SELECT price_date, ytm, nickname, remain_year, bond_name
                    FROM (
                        SELECT price_date, ytm, nickname,
                               remain_year, bond_name,
                               ROW_NUMBER() OVER (
                                   PARTITION BY price_date
                                   ORDER BY ABS(remain_year - %s) ASC,
                                            remain_year ASC
                               ) AS rn
                        FROM ktb
                        WHERE 1=1 {filter_sql}
                    ) ranked
                    WHERE rn = 1
                    ORDER BY price_date ASC
                    """,
                    [tenor] + params,
                )
            else:
                raise HTTPException(status_code=400, detail="label, nickname, tenor 중 하나 필요")

            rows = cur.fetchall()

        return {"count": len(rows), "rows": clean_rows(rows)}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ktb/multi_label_series")
def ktb_multi_label_series(
    labels: str = Query(..., description="쉼표 구분 label 목록"),
    days: int = Query(default=365, le=3650),
):
    try:
        label_list = [l.strip() for l in labels.split(",") if l.strip()]
        placeholders = ",".join(["%s"] * len(label_list))

        params: list = label_list[:]
        date_filter = ""
        if days > 0:
            date_filter = "AND price_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)"
            params.append(days)

        with get_conn() as conn:
            cur = conn.cursor(dictionary=True)
            cur.execute(
                f"""
                SELECT price_date, label, ytm
                FROM ktb
                WHERE label IN ({placeholders})
                  {date_filter}
                ORDER BY label ASC, price_date ASC
                """,
                params,
            )
            rows = clean_rows(cur.fetchall())

        series: dict = {l: [] for l in label_list}
        for r in rows:
            lb = r["label"]
            if lb in series:
                series[lb].append({"price_date": r["price_date"], "ytm": r["ytm"]})

        return {"series": series}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ktb/multi_series")
def ktb_multi_series(
    tenors: str = Query(..., description="쉼표 구분 tenor 목록, 예: 2,3,5,10,20,30"),
    days: int = Query(default=365, le=3650),
    category: str = Query(None),
):
    try:
        tenor_list = [float(t.strip()) for t in tenors.split(",") if t.strip()]

        filters, base_params = [], []
        if category:
            filters.append("AND category = %s")
            base_params.append(category)
        if days > 0:
            filters.append("AND price_date >= DATE_SUB(CURDATE(), INTERVAL %s DAY)")
            base_params.append(days)
        filter_sql = " ".join(filters)

        result = {}
        with get_conn() as conn:
            for tenor in tenor_list:
                cur = conn.cursor(dictionary=True)
                cur.execute(
                    f"""
                    SELECT price_date, ytm, nickname, remain_year
                    FROM (
                        SELECT price_date, ytm, nickname, remain_year,
                               ROW_NUMBER() OVER (
                                   PARTITION BY price_date
                                   ORDER BY ABS(remain_year - %s) ASC,
                                            remain_year ASC
                               ) AS rn
                        FROM ktb
                        WHERE 1=1 {filter_sql}
                    ) ranked
                    WHERE rn = 1
                    ORDER BY price_date ASC
                    """,
                    [tenor] + base_params,
                )
                result[str(tenor)] = clean_rows(cur.fetchall())

        return {"series": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ktb/curve")
def ktb_curve(
    date: str = Query(None, description="YYYY-MM-DD (없으면 최신)"),
    category: str = Query(None),
    basket: int = Query(None, description="1=선물바스켓만, 0=비바스켓만"),
):
    try:
        with get_conn() as conn:
            cur = conn.cursor(dictionary=True)

            if date:
                cur.execute("SELECT MAX(price_date) AS d FROM ktb WHERE price_date <= %s", (date,))
            else:
                cur.execute("SELECT MAX(price_date) AS d FROM ktb")
            row = cur.fetchone()
            actual_date = serialize(row["d"]) if row and row["d"] else date

            filters, params = ["WHERE price_date = %s"], [actual_date]
            if category:
                filters.append("AND category = %s")
                params.append(category)
            if basket is not None:
                filters.append("AND basket = %s")
                params.append(basket)

            cur.execute(
                f"""
                SELECT price_date, label, ytm, nickname, bond_name,
                       remain_year, remain_days, category, basket
                FROM ktb
                {' '.join(filters)}
                ORDER BY remain_year ASC
                """,
                params,
            )
            rows = cur.fetchall()

        return {"date": actual_date, "count": len(rows), "rows": clean_rows(rows)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
