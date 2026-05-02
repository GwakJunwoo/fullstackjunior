import datetime
import decimal
import os
from contextlib import contextmanager
from pathlib import Path

import mysql.connector
from dotenv import load_dotenv


_ENV_LOADED = False


def _load_env_once() -> None:
    global _ENV_LOADED
    if _ENV_LOADED:
        return

    server_root = Path(__file__).resolve().parents[2]
    load_dotenv(server_root / ".env")
    _ENV_LOADED = True


def _pick_env(*keys: str, default: str | None = None) -> str | None:
    for key in keys:
        v = os.getenv(key)
        if v is not None and str(v).strip() != "":
            return v
    return default


def _db_config() -> dict:
    _load_env_once()

    host = _pick_env("DB_HOST", "SCON_DB_HOST")
    port = int(_pick_env("DB_PORT", "SCON_DB_PORT", default="3306"))
    name = _pick_env("DB_NAME", "SCON_DB_NAME")
    user = _pick_env("DB_USER", "SCON_DB_USER")
    pwd = _pick_env("DB_PASS", "SCON_DB_PASSWORD")

    missing = []
    if not host:
        missing.append("DB_HOST/SCON_DB_HOST")
    if not name:
        missing.append("DB_NAME/SCON_DB_NAME")
    if not user:
        missing.append("DB_USER/SCON_DB_USER")
    if not pwd:
        missing.append("DB_PASS/SCON_DB_PASSWORD")

    if missing:
        raise RuntimeError("Missing DB env vars: " + ", ".join(missing))

    return {
        "host": host,
        "port": port,
        "database": name,
        "user": user,
        "password": pwd,
        "connection_timeout": 5,
    }


@contextmanager
def get_conn():
    conn = mysql.connector.connect(**_db_config())
    try:
        yield conn
    finally:
        conn.close()


def serialize(v):
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.isoformat()
    if isinstance(v, decimal.Decimal):
        return float(v)
    if isinstance(v, bytes):
        return v.decode("utf-8", errors="replace")
    return v


def clean_rows(rows: list[dict]) -> list[dict]:
    return [{k: serialize(v) for k, v in row.items()} for row in rows]
