from fastapi import APIRouter, HTTPException, Query

from ..core.db import clean_rows, get_conn, serialize


router = APIRouter()

_rates_schema: dict | None = None


def get_rates_schema() -> dict:
    global _rates_schema
    if _rates_schema:
        return _rates_schema

    with get_conn() as conn:
        cur = conn.cursor(dictionary=True)
        cur.execute("DESCRIBE `rates`")
        cols = [c["Field"] for c in cur.fetchall()]

    date_col = next((c for c in cols if any(k in c.lower() for k in ("date", "날짜", "기준일", "일자"))), cols[0])
    alias_col = next((c for c in cols if "alias" in c.lower()), None)
    val_col = next((c for c in cols if c not in (date_col, alias_col) and "name" not in c.lower()), None)

    _rates_schema = {"date": date_col, "alias": alias_col, "value": val_col, "all": cols}
    return _rates_schema


@router.get("/rates/search")
def search_rates(q: str = Query(..., min_length=1)):
    try:
        sc = get_rates_schema()
        like = f"%{q}%"
        with get_conn() as conn:
            cur = conn.cursor(dictionary=True)
            cur.execute(
                f"""
                SELECT DISTINCT `{sc['alias']}` AS alias
                FROM rates
                WHERE `{sc['alias']}` LIKE %s
                ORDER BY `{sc['alias']}`
                LIMIT 50
                """,
                (like,),
            )
            rows = cur.fetchall()
        return {"results": rows, "schema": sc}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/rates/series")
def get_rates_series(
    aliases: str = Query(..., description="쉼표 구분 alias 목록"),
    days: int = Query(default=365, le=3650),
):
    try:
        sc = get_rates_schema()
        alias_list = [a.strip() for a in aliases.split(",") if a.strip()]
        placeholders = ",".join(["%s"] * len(alias_list))

        date_filter = ""
        params: list = alias_list[:]
        if days > 0:
            date_filter = f"AND `{sc['date']}` >= DATE_SUB(CURDATE(), INTERVAL %s DAY)"
            params.append(days)

        with get_conn() as conn:
            cur = conn.cursor(dictionary=True)
            cur.execute(
                f"""
                SELECT `{sc['date']}` AS dt,
                       `{sc['alias']}` AS alias,
                       `{sc['value']}` AS val
                FROM rates
                WHERE `{sc['alias']}` IN ({placeholders})
                {date_filter}
                ORDER BY `{sc['date']}` ASC
                """,
                params,
            )
            rows = cur.fetchall()

        series: dict = {a: [] for a in alias_list}
        for r in rows:
            a = r["alias"]
            if a in series:
                series[a].append({"date": serialize(r["dt"]), "value": serialize(r["val"])})

        return {"series": series, "schema": sc}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
