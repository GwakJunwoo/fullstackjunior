from fastapi import APIRouter, HTTPException, Query

from ..core.db import clean_rows, get_conn


router = APIRouter()


@router.get("/health")
def health():
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SELECT 1")
            cur.fetchone()
        return {"status": "ok", "db": "connected"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}


@router.get("/tables")
def list_tables():
    try:
        with get_conn() as conn:
            cur = conn.cursor()
            cur.execute("SHOW TABLES")
            tables = [row[0] for row in cur.fetchall()]
        return {"tables": tables}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/schema/{table}")
def table_schema(table: str):
    try:
        with get_conn() as conn:
            cur = conn.cursor(dictionary=True)
            cur.execute(f"DESCRIBE `{table}`")
            columns = cur.fetchall()
        return {"table": table, "columns": clean_rows(columns)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/preview/{table}")
def preview_table(table: str, limit: int = Query(default=20, le=200)):
    try:
        with get_conn() as conn:
            cur = conn.cursor(dictionary=True)
            cur.execute(f"SELECT * FROM `{table}` LIMIT %s", (limit,))
            rows = cur.fetchall()
        return {"table": table, "count": len(rows), "rows": clean_rows(rows)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/price")
def get_price(symbol: str = Query(...)):
    raise HTTPException(status_code=501, detail="추후 구현 예정")
