"""장외 호가 데스크 — otcdesk.api 전달자 (2026-11-04 사용자 지시 · 화면 = tools/otc/).

라우터는 *전달자*다(H3): otcdesk.api 화면 함수가 돌려준 dict 를 변형 없이 JSON 으로 내보낸다.
수치·체결 판정·에피소드·괴리를 여기서 계산/보정하지 않는다(엔진 = Bond Quant House/otcdesk 정본).
쿼리 인자는 *받은 것만* 엔진에 넘긴다 → 안 준 인자는 엔진 기본값(period 등)을 그대로 쓴다.

★공개 범위 = "사이트 탭·비공개"(사용자 선택): 타사 딜러 실명·호가 원문이 실리므로
  데이터 API 는 전부 X-QH-KEY 필수(GET 포함) — qh_ops 와 같은 키(server/.env QH_OPS_KEY).
  공개 터널(cloudflare) 경유를 막지는 않는다(사용자는 fullstackjunior.com 에서 터널로 본다) — 키가 문.
★otcdesk 는 BQH 쪽 파일이라 uvicorn --reload 가 감시하지 않는다 → 엔진을 고치면 이 파일을 touch.
"""
from __future__ import annotations

import gzip
import json
import os
import sys
import threading
from pathlib import Path
from urllib.parse import unquote

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request
from fastapi.responses import Response

from .qh_ops import _require_key

QH_ROOT = Path(os.getenv("QH_ROOT", r"C:\Users\infomax\Desktop\Bond Quant House"))


def _key(x_qh_key: str | None = Header(default=None, alias="X-QH-KEY")) -> None:
    """같은 키 체계(qh_ops._require_key) — 읽기에도 필수. 거부 문구는 원문 그대로 + 맥락 한 마디."""
    try:
        _require_key(x_qh_key)
    except HTTPException as e:
        raise HTTPException(e.status_code, f"장외 호가 API 는 읽기에도 X-QH-KEY 필요 — {e.detail}")


router = APIRouter(prefix="/otc", tags=["otc"], dependencies=[Depends(_key)])


# ── 엔진 로더 (지연 import · 실패 = 정직 에러, 가짜 응답 금지) ────────────────
def _api():
    if str(QH_ROOT) not in sys.path:
        sys.path.insert(0, str(QH_ROOT))
    try:
        from otcdesk import api
        return api
    except Exception as e:
        raise HTTPException(500, f"otcdesk.api import 실패: {type(e).__name__}: {e}")


def _prewarm() -> None:
    """첫 사용자 호출의 캐시 적재(~15초) 대기 방지 — 서버 기동 직후 데몬 스레드로 한 번."""
    try:
        if str(QH_ROOT) not in sys.path:
            sys.path.insert(0, str(QH_ROOT))
        from otcdesk import api, store
        store.ensure()
        api._team_tables()
        api.board()            # 첫 화면(보드) 블록도 데워 둔다
    except Exception as e:   # 예열 실패는 조용히 넘기지 않는다 — 로그에 남기고 첫 호출이 정직 에러를 낸다
        print(f"[otc] prewarm 실패: {type(e).__name__}: {e}", flush=True)


threading.Thread(target=_prewarm, name="otc-prewarm", daemon=True).start()


# ── 응답: 엔진 dict 그대로 직렬화 (NaN 등 비표준 값이 새면 500 으로 드러낸다 — 보정 0) ──
def _send(request: Request, fn, **kwargs) -> Response:
    try:
        out = fn(**{k: v for k, v in kwargs.items() if v not in (None, "")})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"{type(e).__name__}: {e}")
    try:
        body = json.dumps(out, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode("utf-8")
    except (TypeError, ValueError) as e:
        raise HTTPException(500, f"엔진 응답 JSON 직렬화 실패(라우터는 보정하지 않음): {type(e).__name__}: {e}")
    headers = {"Cache-Control": "private, no-store"}
    if len(body) > 2048 and "gzip" in (request.headers.get("accept-encoding") or "").lower():
        body = gzip.compress(body, compresslevel=5)
        headers["Content-Encoding"] = "gzip"
        headers["Vary"] = "Accept-Encoding"
    return Response(content=body, media_type="application/json", headers=headers)


# ════════════════════════════════════════════════════════════════════════════
# 엔드포인트 — 전부 sync def(스레드풀) · 전부 X-QH-KEY
# ════════════════════════════════════════════════════════════════════════════
@router.get("/meta")
def otc_meta(request: Request):
    """기준일·영업일·팀(id·label·members)·종목/브로커 자동완성·기간 프리셋 — api.meta() 그대로."""
    return _send(request, _api().meta)


@router.get("/bond")
def otc_bond(request: Request, alias: str = Query(...), date: str | None = Query(default=None)):
    """장외종목분석 — api.bond_day(alias, date) 그대로."""
    return _send(request, _api().bond_day, alias=alias, date=date)


@router.get("/broker")
def otc_broker(request: Request, name: str = Query(...), asof: str | None = Query(default=None),
               period: str | None = Query(default=None)):
    """장외브로커분석 — api.broker_view(name, asof, period) 그대로(name = 브로커 또는 meta.team.id)."""
    return _send(request, _api().broker_view, name=name, asof=asof, period=period)


@router.get("/team/overview")
def otc_team_overview(request: Request, member: str | None = None, start: str | None = None,
                      end: str | None = None, period: str | None = None):
    return _send(request, _api().team_overview, member=member, start=start, end=end, period=period)


@router.get("/team/heatmap")
def otc_team_heatmap(request: Request, member: str | None = None, start: str | None = None,
                     end: str | None = None, period: str | None = None):
    return _send(request, _api().team_heatmap, member=member, start=start, end=end, period=period)


@router.get("/team/bond")
def otc_team_bond(request: Request, alias: str = Query(...), member: str | None = None,
                  start: str | None = None, end: str | None = None, period: str | None = None):
    return _send(request, _api().team_bond, alias=alias, member=member, start=start, end=end, period=period)


@router.get("/team/intraday")
def otc_team_intraday(request: Request, member: str | None = None, start: str | None = None,
                      end: str | None = None, period: str | None = None):
    return _send(request, _api().team_intraday, member=member, start=start, end=end, period=period)


@router.get("/team/daily")
def otc_team_daily(request: Request, member: str | None = None, start: str | None = None,
                   end: str | None = None, period: str | None = None, agg: str | None = None):
    return _send(request, _api().team_daily, member=member, start=start, end=end, period=period, agg=agg)


@router.get("/team/position")
def otc_team_position(request: Request, member: str | None = None, start: str | None = None,
                      end: str | None = None, period: str | None = None):
    """포지션 추정(체결 표시 누적 · DV01 · 추정 선물 계약 · 장중 짝 검사) — api.team_position 그대로(보정·계산 0)."""
    return _send(request, _api().team_position, member=member, start=start, end=end, period=period)


# ── 보드(첫 화면 · 5초 갱신) ────────────────────────────────────────────────
#   since(직전 응답의 cursor)는 쿼리가 아니라 헤더 X-OTC-Since 로 받는다 — 폴링 URL 이 매번 같아야
#   브라우저가 CORS 사전요청(OPTIONS)을 캐시한다. 값은 encodeURIComponent 된 문자열(종목 별칭에 한글 가능) · '-' = 없음.
def _since(v: str | None) -> str | None:
    if not v or v == "-":
        return None
    return unquote(v)


@router.get("/board")
def otc_board(request: Request, aliases: str | None = None, days: str | None = None,
              x_otc_since: str | None = Header(default=None, alias="X-OTC-Since")):
    """보드 — api.board(aliases, days, since) 그대로(same / 오늘 블록만 / 전체는 엔진이 정한다)."""
    return _send(request, _api().board, aliases=aliases, days=days, since=_since(x_otc_since))


@router.get("/board/detail")
def otc_board_detail(request: Request, alias: str = Query(...), days: str | None = None,
                     x_otc_since: str | None = Header(default=None, alias="X-OTC-Since")):
    """보드에서 차트를 눌렀을 때 — api.bond_span(alias, days, since) 그대로."""
    return _send(request, _api().bond_span, alias=alias, days=days, since=_since(x_otc_since))
