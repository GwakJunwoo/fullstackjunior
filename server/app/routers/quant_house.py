"""Bond Quant House — 다전략 운용 관리 API.

Bond Quant House 의 registry.json(전략 통합 등록부)을 읽어 프론트에 제공.
운영 메인 화면(tools/quant-house)의 백엔드. DB 를 직접 건드리지 않고
등록부·스냅샷 파일만 읽는다(웹 레이어 경량 유지, 헌법: 백테스트는 DB 미사용).
"""
import json
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException

router = APIRouter(prefix="/quant-house", tags=["quant-house"])

# Bond Quant House 위치 (환경변수로 override 가능)
QH_ROOT = Path(os.getenv("QH_ROOT", r"C:\Users\infomax\Desktop\Bond Quant House"))
REGISTRY = QH_ROOT / "05_registry" / "registry.json"
SNAP_DIR = QH_ROOT / "04_strategies"


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
    """카테고리별 전략 + 진화경로 + 최근 감사/백테스트."""
    reg = _load_registry()
    strategies = reg.get("strategies", {})
    by_cat: dict[str, list] = {}
    for s in strategies.values():
        item = dict(s)
        item["lineage"] = _lineage(strategies, s["name"])
        by_cat.setdefault(s.get("category", "uncategorized"), []).append(item)
    # 헌법 요약 카운트
    audits = [s.get("audit") or {} for s in strategies.values()]
    summary = {
        "total": len(strategies),
        "deployed": sum(1 for s in strategies.values() if s.get("status") == "deployed"),
        "blocked": sum(1 for a in audits if a.get("blocked")),
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
        return {"name": name, "has_artifact": False,
                "integration": reg.get("integration"),
                "source_ref": reg.get("source_ref"),
                "note": "백테스트 아티팩트 없음 — catalog 전략은 알파 로직이 "
                        "원본(Beta Trading)에 있고 이 엔진 미이식. "
                        "ported 승격 후 cli.py backtest 실행 시 생성됨."}
    art = json.loads(fp.read_text(encoding="utf-8"))
    art["has_artifact"] = True
    return art


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
