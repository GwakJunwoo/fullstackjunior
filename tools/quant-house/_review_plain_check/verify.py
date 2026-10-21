# -*- coding: utf-8 -*-
"""주간 리뷰 일반 보기 웹 검증(prep_fixtures.py 먼저 · devserver.py 8765 기동 후 실행) — 첫 화면 · 금지어 0 · 숫자 = snapshot(문장 원문 일치) · 정직 라벨 · 부호/색 · 연계 · 빈 상태 · 고급 회귀.
정답은 snapshot 원 값에서 직접 읽어 비교(코드 출력 베끼기 0)."""
import json
import re
import sys
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
import os

FX = Path(os.environ.get("RVP_FX", Path(__file__).resolve().parent / "_fx"))   # prep_fixtures.py 산출
BASE = os.environ.get("VERIFY_BASE", "http://127.0.0.1:8765")
BANNED = ("진앙", "넷팅", "z_wavg", "mom_wavg", "net_z", "cheap", "rich", "발산", "수렴", "axis_note", "TOP PICK",
          "conf=", "mr_score", "mom_score", "resid_z")
FAB = ("본원통화", "M2", "한은RP", "한은 RP", "부가세", "부가가치세", "환율", "원/달러", "달러/원", "잔고", "여력",
       "P&L", "수익률 곡선 베팅", "매수 추천", "매도 추천")
FAILS, PASSES = [], []


def check(name, cond, detail=""):
    (PASSES if cond else FAILS).append(name)
    print(("PASS  " if cond else "FAIL  ") + name + (("  | " + str(detail)) if detail else ""))


def mode(m):
    urllib.request.urlopen(BASE + "/__mode/" + m).read()


def page(p, w=1440, h=900, hash_="#review", view=None, theme=None):
    ctx = p.chromium.launch(channel="chrome").new_context(viewport={"width": w, "height": h})
    init = "try{localStorage.clear();" + (f"localStorage.setItem('wb-review-view','{view}');" if view else "") + \
           (f"localStorage.setItem('wb-theme','{theme}');" if theme else "") + "}catch(e){}"
    ctx.add_init_script(init)
    pg = ctx.new_page()
    errs = []
    pg.on("console", lambda m: errs.append(m.type + ": " + m.text) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.goto(BASE + "/tools/quant-house/" + hash_)
    pg.wait_for_function("window.WB_REV_PLAIN_STATS && window.WB_REV_PLAIN_STATS.state !== 'init'", timeout=40000)
    pg.wait_for_function("document.querySelectorAll('#revBody .cat-title').length > 0 || /없음|실패|미생성/.test(document.getElementById('revBody').textContent)", timeout=40000)
    pg.wait_for_timeout(700)
    return pg, errs


snap = json.loads((FX / "snap_w43.json").read_text(encoding="utf-8"))
sbd = json.loads((FX / "sb_dev.json").read_text(encoding="utf-8"))
P = snap["plain"]

with sync_playwright() as pw:
    # ── A. W43 일반 보기 ─────────────────────────────────────────────
    mode("w43")
    pg, errs = page(pw)
    check("A0 기본 보기 = 일반(저장값 없음)", pg.evaluate("document.getElementById('view-review').getAttribute('data-rv-view')") == "plain")
    # 첫 화면: 결론 + 그림 4장 하단이 900 안
    r = pg.evaluate("""(() => { const o = {}; ['rvp-head','rvp-rates','rvp-curve','rvp-tenor','rvp-bond'].forEach(id => {
        const b = document.getElementById(id).getBoundingClientRect(); o[id] = [Math.round(b.top), Math.round(b.bottom)]; }); return o; })()""")
    check("A1 첫 화면(1440x900)에 결론 + 그림 4장 전부", all(v[1] <= 900 for v in r.values()), r)
    plain_txt = pg.evaluate("document.getElementById('revPlain').innerText")
    plain_tc = pg.evaluate("document.getElementById('revPlain').textContent")
    toc_txt = pg.evaluate("document.getElementById('wbRevTocPlain').innerText")
    hit = [t for t in BANNED + FAB if t in plain_txt or t in plain_tc or t in toc_txt]
    check("A2 일반 보기 DOM 텍스트 금지어·조작토큰 0", not hit, hit)
    check("A2b '추천' 단어 0(일반 보기)", "추천" not in plain_tc, "")
    # 결론 3줄 = headline 원문
    lines = pg.evaluate("[...document.querySelectorAll('#rvp-head .rvp-l')].map(e => e.textContent)")
    check("A3 결론 3줄 = plain.headline 원문", lines == P["headline"], lines)
    # 그림 제목 = charts.*.title 원문
    titles = pg.evaluate("Object.fromEntries(['rates','curve','tenor','bond','product','basket'].map(k => [k, (document.querySelector('#rvp-' + k + ' .rvp-title')||{}).textContent]))")
    want = {"rates": P["charts"]["rates"]["title"], "curve": P["charts"]["curve_shape"]["title"], "tenor": P["charts"]["tenor_value"]["title"],
            "bond": P["charts"]["bond_scatter"]["title"], "product": P["charts"]["product_map"]["title"], "basket": P["charts"]["basket"]["title"]}
    check("A4 그림 제목 6 = charts.*.title 원문", titles == want, {k: (titles.get(k), want[k]) for k in want if titles.get(k) != want[k]})
    # 눈에 띄는 곳 카드 = notable[].sentence 원문 · 순서 · 배지 텍스트
    cards = pg.evaluate("[...document.querySelectorAll('#rvp-notable .rvp-note')].map(e => ({key: e.dataset.key, sent: e.querySelector('.rvp-sent').textContent, badge: (e.querySelector('.rvp-badge')||{}).textContent, tail: (e.querySelector('.rvp-tail')||{}).textContent, sign: e.dataset.sign}))")
    nb = {(n["key"], n["bucket"], n["lane"]): n for n in P["notable"]}
    LEG = {"conflict", "align", "mom_only", "mr_only", "neither"}   # 옛 계약 확신 배지 키 — 종목 카드에선 숨김(3-ter-1 · 사용자 10-21)
    def _want(n, f):
        return None if (n.get("kind") == "bond" and n.get("badge_key") in LEG) else n.get(f)
    ok = len(cards) == len([n for n in P["notable"] if not n.get("stub")]) and all(any(
        c["key"] == n["key"] and c["sent"] == n["sentence"] and c["badge"] == _want(n, "badge") and c["tail"] == _want(n, "tail")
        for n in P["notable"]) for c in cards)
    check("A5 카드 %d장 = notable 원문(문장 · 배지·꼬리 — 종목 확신 배지는 숨김)" % len(cards), ok)
    # 부호: 22-5 = 비쌈(−) · 25-5 = 쌈(+) — 정의에서 도출(잔차 + = 쌈)
    brv = {b["code"]: b for b in snap["bond_rv"]}
    c225 = [c for c in cards if c["key"] == "KR103502GC65"][0]
    c255 = [c for c in cards if c["key"] == "KR103502GF62"][0]
    check("A6 부호 22-5 잔차<0 → 비쌈 · 파랑 테", brv["KR103502GC65"]["residual_bp"] < 0 and "비쌈" in c225["sent"] and c225["sign"] == "-1")
    check("A6b 부호 25-5 잔차>0 → 쌈 · 빨강 테", brv["KR103502GF62"]["residual_bp"] > 0 and "쌈" in c255["sent"] and "비쌈" not in c255["sent"] and c255["sign"] == "1")
    # 정직 라벨
    check("A7 '관찰 전용' 페이지 머리", "관찰 전용" in pg.evaluate("document.querySelector('#view-review .wb-pagehead').innerText"))
    check("A7b '실행은 재량' 보임(결론·눈에 띄는 곳)", plain_txt.count("실행은 재량") >= 2, plain_txt.count("실행은 재량"))
    check("A7c '되돌림 미확인 → 확인 후 접근' 보임", P["labels"]["unconfirmed"] in plain_txt)
    # 보이는 문장 = 결론·제목·카드 — 숨긴 설명은 template(?) 안
    helps = pg.evaluate("document.querySelectorAll('#revPlain .wb-help').length")
    check("A8 ? 툴팁 %d개(설명 숨김)" % helps, helps >= 15)
    check("A8b bond_flow_note = 화면 글자(엔진 수선 전 계약) · bond_pct_note 는 ? 안", P["notable_common"]["bond_flow_note"] in plain_txt and P["notable_common"]["bond_pct_note"] not in plain_tc)
    tips = pg.evaluate("[...document.querySelectorAll('#revPlain .wb-help template')].map(t => t.innerHTML).join('\\n')")
    check("A8c bond_pct_note·other_pct_note ? 원문 존재", all(P["notable_common"][k] in tips for k in ("bond_pct_note", "other_pct_note")))
    # 추이선: spark_ref 풀이 = 원 시계열 끝 63 · 마지막 값 = now
    sp = pg.evaluate("""(() => { const s = _REV; const out = [];
        (s.plain.notable||[]).forEach(n => { const r = WBRevPlain._series(s, n.spark_ref); out.push([n.key, r ? r.values.length : 0, r ? r.values[r.values.length-1] : null, n.now, r ? r.dates[0] : null, n.spark_ref.from]); });
        return out; })()""")
    check("A9 추이선 20개 = 63 관측 · 끝값 = now · 시작일 = from", all(x[1] == 63 and x[2] == x[3] and x[4] == x[5] for x in sp), [x for x in sp if not (x[1] == 63 and x[2] == x[3])][:3])
    # 산점도 점 = bond_rv 전부(참조 풀이) · 이름표 5
    npt = pg.evaluate("WBRevPlain._bondPoints(_REV, _REV.plain.charts.bond_scatter).length")
    check("A10 산점도 점 수 = bond_rv 유효행", npt == sum(1 for b in snap["bond_rv"] if b.get("remain_year") is not None and b.get("residual_bp") is not None), npt)
    # 일드커브 참조 = yield_curve.current
    yc = pg.evaluate("WBRevPlain._get(_REV, _REV.plain.charts.rates.curve_ref.now).length")
    check("A11 curve_ref.now 풀이 = yield_curve.current", yc == len(snap["yield_curve"]["current"]), yc)
    # 테너 막대 색: sign → up/down · 20년 = ref 회색
    tb = pg.evaluate("[...document.querySelectorAll('#rvp-tenor .rvp-trow')].map(e => [e.querySelector('.rvp-trow-k').textContent, (e.querySelector('.rvp-dbar')||{className:''}).className, e.querySelector('.rvp-trow-l').textContent])")
    exp = []
    for row in P["charts"]["tenor_value"]["rows"]:
        side = "ref" if row["ref"] else ("up" if row["sign"] > 0 else "down")
        exp.append([f"{row['tenor']}년", side, row["label"]])
    got = [[t[0], t[1].split("--")[-1], t[2]] for t in tb]
    check("A12 테너 막대 색 = 엔진 sign(+빨강/−파랑)·20년 회색 · 글자 = 엔진 label", got == exp, got)
    # 믿어도 되나 = scoreboard plain 원문 · caution 행 ? 에 baseline_note
    tt = pg.evaluate("(document.querySelector('#rvp-trust .rvp-title')||{}).textContent")
    check("A13 믿어도 되나 제목 = scoreboard plain.title", tt == sbd["plain"]["title"], tt)
    caut = pg.evaluate("[...document.querySelectorAll('#rvp-trust .rvp-trust-row.is-caution')].map(r => [r.dataset.bucket + ':' + r.dataset.factor, !!r.querySelector('.rvp-trust-base')])")
    n_c = [r["bucket"] + ":" + r["factor"] for r in sbd["plain"]["rows"] if r.get("baseline_caution")]
    trust_txt = pg.evaluate("document.getElementById('rvp-trust').innerText")
    check("A14 기준선 주의 원문 = 화면 글자 · 주의 행 %d개 표식 · 50%% 눈금 없음" % len(n_c),
          sbd["plain"]["baseline_note"] in trust_txt and [c[0] for c in caut] == n_c and not any(c[1] for c in caut), caut)
    pcts = pg.evaluate("[...document.querySelectorAll('#rvp-trust .rvp-trust-v b')].map(b => b.textContent)")
    check("A15 적중률 % = scoreboard pct 원 값", pcts == [f"{r['pct']}%" for r in sbd["plain"]["rows"]], pcts)
    # 커브 줄: now/Δ = 엔진 값(소수 1자리 표시)
    cv = pg.evaluate("[...document.querySelectorAll('#rvp-curve .rvp-crow')].map(e => e.querySelector('.rvp-crow-v').innerText.replace(/\\s+/g,' '))")
    expc = [f"{r['now']:.1f} {('+' if r['delta_bp'] > 0 else '')}{r['delta_bp']:.1f} {r['move']}" for r in P["charts"]["curve_shape"]["rows"]]
    check("A16 커브 줄 지금·변화·움직임 = 엔진 값", cv == expc, (cv, expc))
    # 연계: 카드 클릭 → 점 선택 / 점 클릭 → 카드 강조
    pg.evaluate("document.querySelector('#rvp-notable .rvp-note[data-key=\"KR103502GC65\"]').click()")
    pg.wait_for_timeout(400)
    sel = pg.evaluate("(() => { const c = document.querySelector('#rvp-notable .rvp-note.is-linked'); return c ? c.dataset.key : null; })()")
    check("A17 카드 클릭 → 같은 종목 카드 강조 + 산점도 선택", sel == "KR103502GC65")
    # 커브 줄 클릭 → 추이선 표시
    pg.evaluate("document.querySelector('#rvp-curve .rvp-crow[data-i=\"1\"]').click()")
    pg.wait_for_timeout(300)
    trend = pg.evaluate("[!document.getElementById('rvpCurveTrendBox').hidden, document.getElementById('rvpCurveTrendH').textContent]")
    check("A18 커브 줄 클릭 → 추이선", trend[0] and "3-5" in trend[1], trend)
    # 테너 막대 클릭 → 기여 상위
    pg.evaluate("document.querySelector('#rvp-tenor .rvp-trow[data-i=\"3\"]').click()")
    pg.wait_for_timeout(200)
    td = pg.evaluate("[...document.querySelectorAll('#rvpTenorDetail .rvp-tdetail-list li span')].map(s => s.textContent)")
    check("A19 테너 클릭 → 기여 상위 = top[].name", td == [t["name"] for t in P["charts"]["tenor_value"]["rows"][3]["top"]], td)
    check("A20 콘솔 오류·경고 0 (W43 일반)", not errs, errs)
    check("A22 '해당 없음' 같은 웹 추정 문구 0", "해당 없음" not in plain_tc)
    pc = pg.evaluate("[...document.querySelectorAll('#rvp-product .rvp-pcell')].map(c => c.innerText.replace(/\s+/g,' '))")
    check("A23 웹 반올림 0 — 2자리 엔진 값은 그대로(394.75 · -9.75)", any("394.75" in c and "-9.75" in c for c in pc), pc)
    st_txt = pg.evaluate("[...document.querySelectorAll('#revPlain .wb-help template')].map(t => t.innerHTML).join(' ')")
    sc_tip = pg.evaluate("(() => { const ch = Chart.getChart(document.getElementById('rvpBondScatter')); const cb = ch.options.plugins.tooltip.callbacks; const i = ch.data.datasets[0].data.findIndex(p => p.id === 'KR103502GC65'); const raw = ch.data.datasets[0].data[i]; return cb.label({raw}) + ' | ' + cb.afterLabel({raw}); })()")
    check("A24 산점도 툴팁에 잔차 bp 숫자 재출력 0(엔진 문장만)", "-6.5bp ·" not in sc_tip.split('|')[0] and "bp" not in sc_tip.split('|')[0], sc_tip)
    # 토글 → 고급 · 기억 · 해시
    pg.click("#revViewAdv")
    pg.wait_for_timeout(400)
    st = pg.evaluate("[document.getElementById('view-review').getAttribute('data-rv-view'), localStorage.getItem('wb-review-view'), location.hash, getComputedStyle(document.querySelector('.rv-doc')).display, getComputedStyle(document.getElementById('revPlain')).display, getComputedStyle(document.getElementById('wbRevToc')).display, getComputedStyle(document.getElementById('wbRevTocPlain')).display]")
    check("A21 고급 토글 → 고급 보임·일반 숨김·저장·#review/adv", st[:3] == ["adv", "adv", "#review/adv"] and st[3] != "none" and st[4] == "none" and st[5] != "none" and st[6] == "none", st)
    pg.context.browser.close()

    # ── B. 고급 회귀 — 개편 전 텍스트와 비교(의도한 오표기 수선만 차이) ─────
    pg, errs = page(pw, view="adv")
    adv = pg.evaluate("document.getElementById('revBody').innerText")
    before = (FX / "adv_before.txt").read_text(encoding="utf-8")
    norm = lambda s: s.replace("cheap %1y", "당일 순위")
    import difflib
    bl, al = before.splitlines(), adv.splitlines()
    diff = [d for d in difflib.unified_diff(bl, al, lineterm="", n=0) if d[:1] in "+-" and not d.startswith(("+++", "---"))]
    (FX / "adv_diff.txt").write_text("\n".join(diff), encoding="utf-8")
    check("B1 고급 보기 줄 수 동일(사라진 줄 0)", len(bl) == len(al), (len(bl), len(al)))
    CONF = ("MR단독", "모멘텀단독", "★상충(발산중)", "정렬(되돌림 정황)", "관찰")   # 고급 확신 라벨(_RV_CONF_LBL)
    minus = [d[1:] for d in diff if d.startswith("-")]
    def _ok_plus(line):   # '+' 줄 = 당일 순위 수선 줄 · 또는 '-' 줄에서 확신 라벨만 뺀 줄
        return "당일 순위" in line or any(line == m.replace(c, "", 1) for m in minus for c in CONF if c in m)
    allowed = all(("%ile1y" in m or "cheap%1y" in m or "cheap %1y" in m or any(c in m for c in CONF)) for m in minus) and \
        all(_ok_plus(d[1:]) for d in diff if d.startswith("+"))
    check("B2 고급 텍스트 차이 = 종목 행 수선만('당일 순위' · 확신 라벨 제거) (%d줄)" % len(diff), allowed, diff[:4])
    check("B3 커브·스왑 등 진짜 1년 행은 %ile1y 유지", adv.count("%ile1y") > 0, adv.count("%ile1y"))
    check("B4 콘솔 오류·경고 0 (고급)", not errs, errs)
    # 종목 픽 패널(bond_rv · cheap_pct 보유 행) = '당일 순위' · 그 외 버킷 = %ile1y 유지 (DECISIONS 3-bis-1)
    pan = pg.evaluate("[...document.querySelectorAll('#revBody .rv-cols > .panel-wrap')].map(p => p.innerText)")
    bond_ok = bool(pan) and "당일 순위" in pan[0] and "%ile1y" not in pan[0] and "cheap%1y" not in pan[0]
    others_ok = len(pan) > 1 and all("%ile1y" in t and "당일 순위" not in t for t in pan[1:])
    check("B5 종목 픽 행 = '당일 순위'(1년 표기 0) · 커브/스왑/선물 = %ile1y 유지", bond_ok and others_ok, [t[:60] for t in pan])
    confs = pg.evaluate("[...document.querySelectorAll('#revBody .rv-cols > .panel-wrap')].map(p => p.querySelectorAll('.rv-conf').length)")
    n_bond_picks = sum(len(snap["picks"]["buckets"]["bond_rv"].get(f) or []) for f in ("mr", "momentum"))
    check("B7 고급 종목 픽 %d행 확신 라벨 0 (badge_display 없음) · 다른 버킷은 그대로" % n_bond_picks, confs and confs[0] == 0 and all(c > 0 for c in confs[1:]), confs)
    hdr = pg.evaluate("[...document.querySelectorAll('#rvBrv th')].map(t => t.textContent)")
    check("B6 개별채권 RV 표 머리 cheap %1y → 당일 순위", "당일 순위" in hdr and not any("1y" in h for h in hdr), hdr)
    pg.context.browser.close()

    # ── C. 빈 상태(라이브 = plain 없음) ─────────────────────────────
    mode("noplain")
    pg, errs = page(pw)
    st = pg.evaluate("[WB_REV_PLAIN_STATS.state, document.getElementById('revPlain').innerText, document.getElementById('wbRevTocPlain').innerText, document.querySelectorAll('#revBody .cat-title').length]")
    check("C1 plain 없음 → 일반 = '준비 중' 빈 상태", st[0] == "no-plain" and "준비 중" in st[1], st[:2])
    check("C2 plain 없음 → 고급은 정상 렌더", st[3] > 5, st[3])
    pg.click("#revPlain [data-rv-go='adv']")
    pg.wait_for_timeout(300)
    check("C3 빈 상태 '고급 보기로' 버튼 동작", pg.evaluate("document.getElementById('view-review').getAttribute('data-rv-view')") == "adv")
    check("C4 콘솔 오류·경고 0 (빈 상태)", not errs, errs)
    pg.context.browser.close()

    # ── D. 스코어보드 plain 없음 ──────────────────────────────────
    mode("noscore")
    pg, errs = page(pw)
    tr = pg.evaluate("document.getElementById('rvp-trust').innerText")
    check("D1 scoreboard plain 없음 → 믿어도 되나 '준비 중' · 나머지 정상", "준비 중" in tr and pg.evaluate("WB_REV_PLAIN_STATS.state") == "plain", tr[:80])
    check("D2 콘솔 오류·경고 0", not errs, errs)
    pg.context.browser.close()

    # ── E. 비표준 창(09-23 · 3영업일) ─────────────────────────────
    mode("nonstd")
    pg, errs = page(pw)
    ns = json.loads((FX / "snap_nonstd.json").read_text(encoding="utf-8"))["plain"]
    wb = pg.evaluate("[document.getElementById('wbRevWindow').hidden, document.getElementById('wbRevWindow').textContent]")
    check("E1 비표준 창 → 페이지 머리 window_label", (not wb[0]) and ns["window_label"] in wb[1], wb)
    l1 = pg.evaluate("document.querySelector('#rvp-head .rvp-l').textContent")
    check("E2 결론 1줄 = 엔진 접두 포함 원문", l1 == ns["headline"][0] and l1.startswith("(" + ns["window_label"] + ")"), l1)
    rng = pg.evaluate("document.querySelectorAll('#rvp-curve .rvp-rng-none').length")
    check("E3 1년 범위 없음(lo/hi null) → '범위 없음' 정직 표시", rng == len(ns["charts"]["curve_shape"]["rows"]), rng)
    nosp = pg.evaluate("WB_REV_PLAIN_STATS.nospark")
    nsd = json.loads((FX / "snap_nonstd.json").read_text(encoding="utf-8"))
    def _res(r):   # 정답 = 계약에서 직접: 같은 snapshot 안 시계열 존재 · 날짜 축과 길이 같음 · 끝 날짜 = to
        if not r: return False
        src = nsd.get(r.get("src")) or {}
        v, d = (src.get("series") or {}).get(r.get("key")), src.get("dates")
        return isinstance(v, list) and isinstance(d, list) and len(v) == len(d) > 0 and (not r.get("to") or d[-1] == r["to"])
    want_miss = sum(1 for x in ns["notable"] if not x.get("stub") and not _res(x.get("spark_ref")))   # 참조 스텁은 카드 아님
    nodom = pg.evaluate("document.querySelectorAll('#rvp-notable .rvp-nospark').length")
    check("E4 풀리지 않는 spark_ref → '추이 없음' (%d = 정답 %d · DOM %d)" % (nosp, want_miss, nodom), nosp == want_miss == nodom)
    check("E5 콘솔 오류·경고 0 (비표준)", not errs, errs)
    pg.context.browser.close()

    # ── F. 스냅샷 없음(available:false) ─────────────────────────
    mode("unavail")
    pg, errs = page(pw)
    check("F1 available:false → 일반 = 엔진 note 그대로", "미생성" in pg.evaluate("document.getElementById('revPlain').innerText"))
    check("F2 콘솔 오류·경고 0", not errs, errs)
    pg.context.browser.close()

    # ── H. §3-ter 예고 계약 목업(mk_future.py) — 새 키·스텁·판정 보류가 와도 견디는가 ─────
    mode("future")
    pg, errs = page(pw)
    fut = json.loads((FX / "snap_future.json").read_text(encoding="utf-8"))["plain"]
    sbf = json.loads((FX / "sb_future.json").read_text(encoding="utf-8"))["plain"]
    txt = pg.evaluate("document.getElementById('revPlain').innerText")
    tc = pg.evaluate("document.getElementById('revPlain').textContent")
    col = pg.evaluate("(() => { const m = getComputedStyle(document.querySelector('#revPlain .rvp-tail')).color; const q = s => [...document.querySelectorAll(s)].map(e => getComputedStyle(e).color); return {muted: m, skew: q('#rvp-notable .rvp-note[data-kind=bond] .rvp-badge'), unk: q('#rvp-notable .rvp-b-zzz_new')}; })()")
    check("H1 bond_skew 배지 = 엔진 글자·중립색", txt.count("커브 대비 치우침") == sum(1 for x in fut["notable"] if x.get("badge_key") == "bond_skew") and col["skew"] and all(c == col["muted"] for c in col["skew"]), col)
    check("H2 모르는 badge_key → 중립색", col["unk"] and all(c == col["muted"] for c in col["unk"]), col["unk"])
    stubs = pg.evaluate("[...document.querySelectorAll('#rvp-notable .rvp-stub')].map(e => [e.dataset.bucket, e.dataset.refKey, e.innerText])")
    want_stubs = [[x["bucket"], x["ref_key"]] for x in fut["notable"] if x.get("stub")]
    check("H3 참조 스텁 %d칸 = 엔진 stub · '치우침 줄과 같은 카드'" % len(stubs), sorted([s_[:2] for s_ in stubs]) == sorted(want_stubs) and all("치우침 줄과 같은 카드" in s_[2] for s_ in stubs), stubs)
    pg.evaluate("document.querySelector('#rvp-notable .rvp-stub[data-bucket=\"bond_rv\"]').click()")
    pg.wait_for_timeout(700)
    lk = pg.evaluate("[...document.querySelectorAll('#rvp-notable .rvp-note.is-linked')].map(e => e.dataset.key + ':' + e.dataset.lane)")
    check("H3b 스텁 클릭 → 참조 카드(치우침 줄) 강조", lk == [want_stubs[0][1] + ":mr"], lk)
    check("H4 줄 이름 = 엔진 라벨 그대로", "치우침 순 상위 3" in txt and "흐름 순 상위 3" in txt)
    check("H5 판정 보류 + 사유 = 화면 글자", "판정 보류" in txt and all(r["verdict_reason"] in txt for r in sbf["rows"] if r.get("verdict_reason")))
    check("H6 상품 '(수준은 반대)' = 화면 글자 · 수준 스프레드 = 툴팁", "(수준은 반대)" in txt and "본드스왑 스프레드 수준" not in tc and "본드스왑 스프레드 수준" in pg.evaluate("[...document.querySelectorAll('#rvp-product .wb-help template')].map(t=>t.innerHTML).join(' ')"))
    bad = [x for x in fut["notable"] if not x.get("stub") and x.get("spark_ref") and x["spark_ref"].get("to") == "2026-10-19"][0]
    ns_ = pg.evaluate("(k => { const c = [...document.querySelectorAll('#rvp-notable .rvp-note')].find(e => e.dataset.key === k); return c ? !!c.querySelector('.rvp-nospark') : null; })", bad["key"])
    check("H7 spark_ref.to ≠ 시계열 끝 날짜 → '추이 없음'", ns_ is True, ns_)
    check("H8 종목 사실 한 줄(fact) 화면 글자", txt.count("[목업] 잔차 주간") == sum(1 for x in fut["notable"] if x.get("fact")))
    check("H9 '해당 없음' 0 · 스텁 계약이면 '흐름 줄에도 있음' 0", "해당 없음" not in tc and "흐름 줄에도 있음" not in tc)
    hit = [t for t in BANNED + FAB if t in tc]
    check("H10 금지어 0 · 콘솔 0 (목업)", not hit and not errs, (hit, errs))
    pg.click("#revViewAdv"); pg.wait_for_timeout(500)
    bp = pg.evaluate("(() => { const p = document.querySelector('#revBody .rv-cols > .panel-wrap'); return [[...p.querySelectorAll('.rv-conf')].map(e => e.textContent), [...p.querySelectorAll('.rv-resid')].map(e => e.textContent)]; })()")
    fsn = json.loads((FX / "snap_future.json").read_text(encoding="utf-8"))
    picks = [x for f in ("mr", "momentum") for x in (fsn["picks"]["buckets"]["bond_rv"].get(f) or [])]
    check("H11 고급 종목 행 = badge_display + 잔차 주간 변화 문자열 그대로(확신 라벨 0)",
          bp[0] == [x["badge_display"] for x in picks] and bp[1] == [x["resid_chg_bp"] for x in picks], bp)
    pg.context.browser.close()

    # ── W. (있을 때만) 엔진 작업 트리 산출 snap_wip/sb_wip — 실제 새 계약 그대로 그리는가 ─────
    if (FX / "snap_wip.json").exists() and (FX / "sb_wip.json").exists():
        mode("wip")
        pg, errs = page(pw)
        wp = json.loads((FX / "snap_wip.json").read_text(encoding="utf-8"))["plain"]
        ws = json.loads((FX / "sb_wip.json").read_text(encoding="utf-8"))["plain"]
        txt = pg.evaluate("document.getElementById('revPlain').innerText")
        tc = pg.evaluate("document.getElementById('revPlain').textContent")
        r = pg.evaluate("Object.fromEntries(['rvp-head','rvp-rates','rvp-curve','rvp-tenor','rvp-bond'].map(id => [id, Math.round(document.getElementById(id).getBoundingClientRect().bottom)]))")
        check("W1 첫 화면 결론 + 그림 4장 (WIP schema %s)" % wp.get("schema"), all(v <= 900 for v in r.values()) and not pg.evaluate("!!document.querySelector('#revPlain .rvp-warn')"), r)
        check("W2 결론·제목 = 엔진 원문", pg.evaluate("[...document.querySelectorAll('#rvp-head .rvp-l')].map(e => e.textContent)") == wp["headline"])
        nst = sum(1 for x in wp["notable"] if x.get("stub"))
        check("W3 참조 스텁 %d칸 = 엔진 stub_text" % nst, pg.evaluate("document.querySelectorAll('#rvp-notable .rvp-stub').length") == nst
              and all(x["stub_text"] in txt for x in wp["notable"] if x.get("stub") and x.get("stub_text")))
        cards = [x for x in wp["notable"] if not x.get("stub")]
        check("W4 카드 %d장 문장·배지·사실 = 엔진 원문" % len(cards), all(x["sentence"] in txt and (not x.get("badge") or x["badge"] in txt) and (not x.get("fact") or x["fact"] in txt) for x in cards))
        check("W5 판정 보류 사유·subtitle = 화면 글자", all(rw["verdict_reason"] in txt for rw in ws["rows"] if rw.get("verdict_reason"))
              and (not ws.get("subtitle") or ws["subtitle"] in txt) and pg.evaluate("(document.querySelector('#rvp-trust .rvp-title')||{}).textContent") == ws["title"])
        nb = pg.evaluate("[...document.querySelectorAll('#rvp-trust .rvp-trust-row')].map(e => !!e.querySelector('.rvp-trust-base'))")
        check("W6 50% 눈금 = baseline_valid 행만", nb == [rw.get("baseline_valid", not rw.get("baseline_caution")) is not False for rw in ws["rows"]], nb)
        hit = [t for t in BANNED + FAB if t in tc]
        check("W7 금지어 0 · '해당 없음' 0 · 콘솔 0 (WIP)", not hit and "해당 없음" not in tc and not errs, (hit, errs))
        pg.context.browser.close()
    else:
        print("SKIP  W* (snap_wip/sb_wip 없음 — 엔진 작업 트리 미리보기 생략)")

    # ── G. 링크 #review/adv · localStorage 막힘 ────────────────────
    mode("w43")
    pg, errs = page(pw, hash_="#review/adv")
    check("G1 #review/adv 링크 → 고급으로 열림", pg.evaluate("document.getElementById('view-review').getAttribute('data-rv-view')") == "adv")
    pg.context.browser.close()
    b = pw.chromium.launch(channel="chrome")
    ctx = b.new_context(viewport={"width": 1440, "height": 900})
    ctx.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}});")
    pg = ctx.new_page(); errs2 = []
    pg.on("pageerror", lambda e: errs2.append(str(e)))
    pg.goto(BASE + "/tools/quant-house/#review")
    pg.wait_for_function("window.WB_REV_PLAIN_STATS && window.WB_REV_PLAIN_STATS.state !== 'init'", timeout=40000)
    pg.click("#revViewAdv"); pg.wait_for_timeout(300)
    check("G2 localStorage 막힘 → 기본 일반 · 토글 동작 · 예외 0", pg.evaluate("document.getElementById('view-review').getAttribute('data-rv-view')") == "adv" and not [e for e in errs2 if "wb-review" in e or "rvp" in e.lower()], errs2[:3])
    b.close()

print("\nPASS %d / FAIL %d" % (len(PASSES), len(FAILS)))
sys.exit(1 if FAILS else 0)
