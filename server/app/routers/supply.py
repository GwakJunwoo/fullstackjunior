from fastapi import APIRouter, HTTPException, Query

from ..core.db import clean_rows, get_conn


router = APIRouter()


@router.get("/supply/search")
def search_bonds(q: str = Query(..., min_length=1)):
    try:
        like = f"%{q}%"
        with get_conn() as conn:
            cur = conn.cursor(dictionary=True)
            cur.execute(
                """
                SELECT DISTINCT bond_code, bond_name
                FROM ktb_trade_flow_features
                WHERE bond_name LIKE %s OR bond_code LIKE %s
                ORDER BY bond_name
                LIMIT 50
                """,
                (like, like),
            )
            results = cur.fetchall()
        return {"results": clean_rows(results)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/supply/flow")
def get_flow(
    bond_code: str = Query(...),
    limit: int = Query(default=500, le=2000),
):
    try:
        with get_conn() as conn:
            cur = conn.cursor(dictionary=True)
            cur.execute("DESCRIBE `ktb_trade_flow_features`")
            cols = cur.fetchall()
            date_col = next(
                (
                    c["Field"]
                    for c in cols
                    if any(k in c["Field"].lower() for k in ("date", "날짜", "기준일", "일자"))
                ),
                None,
            )

            order_clause = f"ORDER BY `{date_col}` DESC" if date_col else ""
            cur.execute(
                f"""
                SELECT * FROM `ktb_trade_flow_features`
                WHERE bond_code = %s
                {order_clause}
                LIMIT %s
                """,
                (bond_code, limit),
            )
            rows = cur.fetchall()

        return {
            "bond_code": bond_code,
            "date_col": date_col,
            "count": len(rows),
            "rows": clean_rows(rows),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
