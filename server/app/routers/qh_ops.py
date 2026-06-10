"""Bond Quant House — OPERATION 운용 콘솔 API (engine.positions 전달자).

라우터는 *전달자*다(H3): engine.positions 의 public API 반환을 변형 없이 통과.
수치·청산·티어를 여기서 계산/보정하지 않는다(엔진이 정본). 원장 =
BQH/05_registry/positions/positions.json + decisions.jsonl(감사, append-only).

★보안 — 공개 cloudflare 터널 뒤에 노출되므로 모든 쓰기(POST)는
  X-QH-KEY 헤더 == server/.env 의 QH_OPS_KEY 필수.
  QH_OPS_KEY 미설정 시 쓰기 전면 403(정직 안내) — 키 생성은 사용자 책임,
  서버가 임의 생성하지 않는다. GET 은 기존 read 정책과 동일(키 불요).
"""
import hmac
import os
import sys
from pathlib import Path

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query

router = APIRouter(prefix="/quant-house/ops", tags=["quant-house-ops"])

QH_ROOT = Path(os.getenv("QH_ROOT", r"C:\Users\infomax\Desktop\Bond Quant House"))
SERVER_ROOT = Path(__file__).resolve().parents[2]          # .../server


# ── 엔진 로더 (import 실패 = 정직 에러, 가짜 응답 금지) ─────────────────────
def _eng():
    if str(QH_ROOT) not in sys.path:
        sys.path.insert(0, str(QH_ROOT))
    try:
        from engine import positions
        return positions
    except Exception as e:
        raise HTTPException(500, f"engine.positions import 실패: {type(e).__name__}: {e}")


# ── 쓰기 보안 (X-QH-KEY == env QH_OPS_KEY) ──────────────────────────────────
def _require_key(x_qh_key: str | None = Header(default=None, alias="X-QH-KEY")):
    # .env 는 매 요청 재로드 시도(키 추가 후 서버 재기동 없이 반영).
    # load_dotenv 는 기존 환경변수를 덮어쓰지 않는다 — 키 회전은 재기동 필요(정직).
    try:
        from dotenv import load_dotenv
        load_dotenv(SERVER_ROOT / ".env")
    except Exception:
        pass
    key = os.getenv("QH_OPS_KEY")
    if not key:
        raise HTTPException(403, "쓰기 차단 — QH_OPS_KEY 미설정. server/.env 에 "
                                 "QH_OPS_KEY 를 추가하세요(키 생성은 사용자 — "
                                 "서버는 임의 생성하지 않음).")
    if not x_qh_key or not hmac.compare_digest(str(x_qh_key), str(key)):
        raise HTTPException(403, "X-QH-KEY 불일치 — 쓰기 거부.")


def _call(fn, *args, **kwargs):
    """엔진 호출 공통 에러 매핑 — 메시지 가공 없이 그대로 전달(정직)."""
    try:
        return fn(*args, **kwargs)
    except HTTPException:
        raise
    except KeyError as e:
        raise HTTPException(404, str(e))
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"{type(e).__name__}: {e}")


# ════════════════════════════════════════════════════════════════════════════
# READ (키 불요 — 기존 read 정책 동일)
# ════════════════════════════════════════════════════════════════════════════
@router.get("/inbox")
def ops_inbox(date: str | None = Query(default=None)):
    """①진입 인박스 — positions.inbox 그대로 (forward 재계산 0·default-enter)."""
    return _call(_eng().inbox, date)


@router.get("/board")
def ops_board(asof: str | None = Query(default=None)):
    """②보유 인벤토리 보드 — positions.board 그대로 (캡 사용률·경고 포함)."""
    return _call(lambda: _eng().board(asof=asof))


@router.get("/ledger")
def ops_ledger():
    """원장 원본(positions.json) 그대로 — 변형 0. 프론트 leg 편집(override)용
    legs/entry_yield/override_yield/mtm_path 전 필드. 파일 부재 시 빈 구조(정직)."""
    return _call(_eng()._load)


# ════════════════════════════════════════════════════════════════════════════
# WRITE (X-QH-KEY 필수)
# ════════════════════════════════════════════════════════════════════════════
@router.post("/confirm", dependencies=[Depends(_require_key)])
def ops_confirm(body: dict = Body(...)):
    """①진입 확정 — 부결(vetoed_keys) 제외 전원 진입(default-enter).
    body: {date, vetoed_keys:[...], sizes?:{candidate_key: dv01_krw}}"""
    date = body.get("date")
    if not date:
        raise HTTPException(400, "date 필요 (inbox 응답의 date)")
    return _call(_eng().confirm, date, body.get("vetoed_keys") or [],
                 sizes=body.get("sizes"))


@router.post("/mark", dependencies=[Depends(_require_key)])
def ops_mark(body: dict = Body(default=None)):
    """②일일 마크 — canonical_pnl 단일경로 평가 + exit_state 표시(자동청산 없음).
    body: {date?}"""
    body = body or {}
    return _call(_eng().mark, body.get("date"))


@router.post("/manual", dependencies=[Depends(_require_key)])
def ops_manual(body: dict = Body(...)):
    """④수기 편입. body: {strategy_or_tag, legs:[{key,kind?,side,weight?,entry_yield?,
    entry_price?(fut '3선'|'10선'|'30선' — 가격 호가)}], entry_date,
    size_dv01_krw 또는 size_contracts(fut 계약수 — 동시 지정은 엔진이 거부), note?, policy?}"""
    for k in ("strategy_or_tag", "legs", "entry_date"):
        if body.get(k) in (None, "", []):
            raise HTTPException(400, f"{k} 필요")
    sdk = body.get("size_dv01_krw")
    sct = body.get("size_contracts")
    # 사이징 검증(하나만·둘 다 없음 등)은 엔진 add_manual 이 정본 — 전달만(H3).
    return _call(_eng().add_manual, body["strategy_or_tag"], body["legs"],
                 body["entry_date"],
                 float(sdk) if sdk not in (None, "") else None,
                 body.get("note", ""), policy=body.get("policy"),
                 size_contracts=float(sct) if sct not in (None, "") else None)


@router.post("/override", dependencies=[Depends(_require_key)])
def ops_override(body: dict = Body(...)):
    """⑤마크 수정 — yield=None 이면 해제. 원값 보존·감사로그.
    body: {pos_id, leg_key, yield}. 단위는 엔진이 leg kind 로 판정(전달자 무변형):
    fut leg → *가격*(override_price), 그 외 → 금리 %(override_yield)."""
    if not body.get("pos_id") or not body.get("leg_key"):
        raise HTTPException(400, "pos_id, leg_key 필요")
    return _call(_eng().set_override, body["pos_id"], body["leg_key"],
                 body.get("yield"))


@router.post("/close", dependencies=[Depends(_require_key)])
def ops_close(body: dict = Body(...)):
    """청산 확정(사용자). body: {pos_id, reason: TP|SL|TIME|MANUAL, date?, pnl_bp?}"""
    if not body.get("pos_id") or not body.get("reason"):
        raise HTTPException(400, "pos_id, reason 필요")
    return _call(_eng().close, body["pos_id"], body["reason"],
                 date=body.get("date"), pnl_bp=body.get("pnl_bp"))
