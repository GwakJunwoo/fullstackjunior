# -*- coding: utf-8 -*-
"""주간 리뷰 '일반 | 고급' 웹 검증 — prep_fixtures.py 먼저 · devserver.py 8765 기동 후 실행.
계약 = BQH fbc6cdff · a5e58a86 (plain schema 2 · *_text · curve_range_1y 추이 · tenor scale · badge_display).
정답은 snapshot 원 값에서 직접 읽어 비교(코드 출력 베끼기 0). 시나리오:
  A 일반(W43 실데이터) · B 고급 회귀(개편 전 커밋 대비) · C/X plain 없음 폴백 · D scoreboard plain 없음 ·
  E 비표준 창 · F 스냅샷 없음 · H 경계 목업 · L 옛 계약(schema 1) · G 링크·저장 막힘
"""
import difflib
import json
import os
import re
import sys
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
FX = Path(os.environ.get("RVP_FX", HERE / "_fx"))   # prep_fixtures.py 산출
REPO = HERE.parents[2]
BASE = os.environ.get("VERIFY_BASE", "http://127.0.0.1:8765")
BANNED = ("진앙", "넷팅", "z_wavg", "mom_wavg", "net_z", "cheap", "rich", "발산", "수렴", "axis_note", "TOP PICK",
          "conf=", "mr_score", "mom_score", "resid_z")
FAB = ("본원통화", "M2", "한은RP", "한은 RP", "부가세", "부가가치세", "환율", "원/달러", "달러/원", "잔고", "여력",
       "P&L", "수익률 곡선 베팅", "매수 추천", "매도 추천")
CONF = ("MR단독", "모멘텀단독", "★상충(발산중)", "정렬(되돌림 정황)", "관찰")   # 고급 확신 라벨(_RV_CONF_LBL)
FAILS, PASSES = [], []


def check(name, cond, detail=""):
    (PASSES if cond else FAILS).append(name)
    print(("PASS  " if cond else "FAIL  ") + name + (("  | " + str(detail)[:400]) if detail else ""))


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


def tips_of(pg, sel):
    return pg.evaluate("(s => [...document.querySelectorAll(s + ' .wb-help template')].map(t => t.innerHTML).join('\\n'))", sel)


def unesc(h):
    return h.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"')


snap = json.loads((FX / "snap_w43.json").read_text(encoding="utf-8"))
sbd = json.loads((FX / "sb_dev.json").read_text(encoding="utf-8"))
P = snap["plain"]
CH = P["charts"]
NOTE = [n for n in P["notable"] if not n.get("stub")]
STUBS = [n for n in P["notable"] if n.get("stub")]
T = sbd["plain"]

ONLY = os.environ.get("VERIFY_ONLY", "")   # 카나리아 가속 — 섹션 글자만 실행(예 "AB") · 비우면 전부


def run(sec):
    return not ONLY or sec in ONLY


with sync_playwright() as pw:
    if run("A"):
        # ── A. W43 일반 보기(확정 계약 실데이터) ───────────────────────────
        mode("w43")
        pg, errs = page(pw)
        check("A0 기본 보기 = 일반 · schema %s" % P.get("schema"), pg.evaluate("document.getElementById('view-review').getAttribute('data-rv-view')") == "plain")
        r = pg.evaluate("Object.fromEntries(['rvp-head','rvp-rates','rvp-curve','rvp-tenor','rvp-bond'].map(id => [id, Math.round(document.getElementById(id).getBoundingClientRect().bottom)]))")
        check("A1 첫 화면(1440x900)에 결론 + 그림 4장 · 경고 띠 없음", all(v <= 900 for v in r.values()) and not pg.evaluate("!!document.querySelector('#revPlain .rvp-warn')"), r)
        txt = pg.evaluate("document.getElementById('revPlain').innerText")
        tc = pg.evaluate("document.getElementById('revPlain').textContent")
        toc = pg.evaluate("document.getElementById('wbRevTocPlain').innerText")
        hit = [t for t in BANNED + FAB if t in txt or t in tc or t in toc]
        check("A2 일반 보기 DOM 텍스트 금지어·조작토큰 0", not hit, hit)
        check("A2b '추천' 0 · '해당 없음' 0", "추천" not in tc and "해당 없음" not in tc)
        check("A3 결론 3줄 = headline 원문", pg.evaluate("[...document.querySelectorAll('#rvp-head .rvp-l')].map(e => e.textContent)") == P["headline"])
        titles = pg.evaluate("Object.fromEntries(['rates','curve','tenor','bond','product','basket','trust'].map(k => [k, (document.querySelector('#rvp-' + k + ' .rvp-title')||{}).textContent]))")
        want = {"rates": CH["rates"]["title"], "curve": CH["curve_shape"]["title"], "tenor": CH["tenor_value"]["title"], "bond": CH["bond_scatter"]["title"],
                "product": CH["product_map"]["title"], "basket": CH["basket"]["title"], "trust": T["title"]}
        check("A4 그림 제목 7 = 엔진 title 원문(scoreboard 포함)", titles == want, {k: (titles.get(k), want[k]) for k in want if titles.get(k) != want[k]})
        cards = pg.evaluate("[...document.querySelectorAll('#rvp-notable .rvp-note')].map(e => ({key: e.dataset.key, lane: e.dataset.lane, bucket: e.dataset.bucket, sent: e.querySelector('.rvp-sent').textContent, badge: (e.querySelector('.rvp-badge')||{}).textContent || null, tail: (e.querySelector('.rvp-tail')||{}).textContent || null, fact: (e.querySelector('.rvp-fact')||{}).textContent || null, sign: e.dataset.sign}))")
        def _match(c, n):
            return (c["key"], c["lane"], c["bucket"]) == (n["key"], n["lane"], n["bucket"]) and c["sent"] == n["sentence"] and \
                c["badge"] == (n.get("badge") or None) and c["tail"] == (n.get("tail") or None) and c["fact"] == (n.get("fact") or None)
        check("A5 카드 %d장 = 엔진 원문(문장·배지·꼬리·사실) · 순서" % len(cards), len(cards) == len(NOTE) and all(any(_match(c, n) for n in NOTE) for c in cards))
        brv = {b["code"]: b for b in snap["bond_rv"]}
        c225 = [c for c in cards if c["key"] == "KR103502GC65"][0]
        c255 = [c for c in cards if c["key"] == "KR103502GF62"][0]
        check("A6 부호 22-5 잔차<0 → 비쌈 · 파랑 테 / 25-5 잔차>0 → 쌈 · 빨강 테",
              brv["KR103502GC65"]["residual_bp"] < 0 and "비쌈" in c225["sent"] and c225["sign"] == "-1" and
              brv["KR103502GF62"]["residual_bp"] > 0 and "비쌈" not in c255["sent"] and c255["sign"] == "1")
        check("A7 정직 라벨 — 관찰 전용 · 실행은 재량 · 되돌림 미확인", "관찰 전용" in pg.evaluate("document.querySelector('#view-review .wb-pagehead').innerText")
              and txt.count("실행은 재량") >= 2 and P["labels"]["unconfirmed"] in txt)
        tips = unesc(tips_of(pg, "#revPlain"))
        nc = P["notable_common"]
        moved = [k for k in ("bond_badge_note", "bond_pct_note", "stub_note", "other_pct_note") if nc.get(k)]
        check("A8 종목 주석·스텁 주석 = 툴팁(화면 글자 아님) · 원문 그대로", all(nc[k] not in tc and nc[k] in tips for k in moved), moved)
        sp = pg.evaluate("(() => (_REV.plain.notable||[]).filter(n => !n.stub).map(n => { const r = WBRevPlain._series(_REV, n.spark_ref); return [n.key, r ? r.values.length : 0, r ? r.values[r.values.length-1] : null, n.now, r ? r.dates[r.dates.length-1] : null, n.spark_ref && n.spark_ref.to]; }))()")
        check("A9 카드 추이선 %d = 63 관측 · 끝값 = now · 끝 날짜 = to" % len(sp), all(x[1] == 63 and x[2] == x[3] and x[4] == x[5] for x in sp), [x for x in sp if not (x[1] == 63 and x[2] == x[3])][:3])
        npt = pg.evaluate("WBRevPlain._bondPoints(_REV, _REV.plain.charts.bond_scatter).length")
        check("A10 산점도 점 = bond_rv 유효행", npt == sum(1 for b in snap["bond_rv"] if b.get("remain_year") is not None and b.get("residual_bp") is not None), npt)
        check("A11 curve_ref.now 풀이 = yield_curve.current", pg.evaluate("WBRevPlain._get(_REV, _REV.plain.charts.rates.curve_ref.now).length") == len(snap["yield_curve"]["current"]))
        tb = pg.evaluate("[...document.querySelectorAll('#rvp-tenor .rvp-trow')].map(e => [e.querySelector('.rvp-trow-k').textContent, (e.querySelector('.rvp-dbar')||{className:''}).className.split('--').pop(), e.querySelector('.rvp-trow-l').textContent, parseFloat((e.querySelector('.rvp-dbar')||{style:{}}).style.width), e.querySelectorAll('.rvp-dguide').length])")
        rows_t = CH["tenor_value"]["rows"]
        exp = [[f"{x['tenor']}년", "ref" if x["ref"] else ("up" if x["sign"] > 0 else "down"), x["label"]] for x in rows_t]
        check("A12 테너 막대 색 = 엔진 sign(+빨강/−파랑) · 20년 회색 · 글자 = 엔진 label", [t[:3] for t in tb] == exp, [t[:3] for t in tb])
        sc = CH["tenor_value"]["scale"]
        axis = max(sc["axis_abs_max"], max(abs(v) for x in rows_t for v in (x["value"], x["prev"]) if v is not None))
        wexp = [abs(x["value"]) / axis * 50 for x in rows_t]
        ng = sum(1 for g in (sc["clear"], sc["strong"]) if g <= axis) * 2
        check("A13 테너 축 = 엔진 scale.axis_abs_max · 경계선 = clear/strong (웹 상수 0)",
              all(abs(t[3] - w) < 0.11 for t, w in zip(tb, wexp)) and all(t[4] == ng for t in tb), [(t[0], t[3], round(w, 1)) for t, w in zip(tb, wexp)])
        tt = unesc(tips_of(pg, "#rvp-tenor"))
        check("A14 note20 = 툴팁(금리 · 테너 행)", (not CH["rates"].get("note20") or CH["rates"]["note20"] in unesc(tips_of(pg, "#rvp-rates")))
              and all(x["note20"] in tt for x in rows_t if x.get("note20")))
        # 믿어도 되나
        trust_txt = pg.evaluate("document.getElementById('rvp-trust').innerText")
        trow = pg.evaluate("[...document.querySelectorAll('#rvp-trust .rvp-trust-row')].map(r => [r.querySelector('.rvp-trust-v b').textContent, !!r.querySelector('.rvp-trust-base'), r.classList.contains('is-caution'), (r.querySelector('.rvp-trust-why')||{}).textContent || null, r.querySelector('.rvp-trust-vt').textContent])")
        check("A15 적중률 = pct_text · 판정 = verdict · 사유 = verdict_reason(화면 글자)",
              [x[0] for x in trow] == [rw["pct_text"] for rw in T["rows"]] and [x[4] for x in trow] == [rw["verdict"] for rw in T["rows"]]
              and [x[3] for x in trow] == [rw.get("verdict_reason") or None for rw in T["rows"]], trow)
        check("A16 50% 눈금 = baseline_valid 행만 · 보류 행 표식", [x[1] for x in trow] == [rw.get("baseline_valid") is not False for rw in T["rows"]]
              and [x[2] for x in trow] == [rw.get("baseline_valid") is False for rw in T["rows"]])
        ttip = unesc(tips_of(pg, "#rvp-trust"))
        check("A17 subtitle = 화면 글자 · baseline_note = 툴팁 · 2주·참고 손익 = 엔진 문자열(툴팁)",
              T["subtitle"] in trust_txt and T["baseline_note"] not in trust_txt and T["baseline_note"] in ttip
              and all(("2주 뒤 " + rw["pct_2w_text"]) in ttip and ("참고 손익 " + rw["pnl_ref_text"]) in ttip for rw in T["rows"]))
        # 커브: *_text · 1년 추이(curve_range_1y)
        cv = pg.evaluate("[...document.querySelectorAll('#rvp-curve .rvp-crow')].map(e => [e.querySelector('.rvp-crow-v').innerText.replace(/\\s+/g,' '), (e.querySelector('.rvp-rng-lo')||{}).textContent, (e.querySelector('.rvp-rng-hi')||{}).textContent])")
        rows_c = CH["curve_shape"]["rows"]
        check("A18 커브 줄 = now_text·delta_text·move · lo_text/hi_text", cv == [[f"{x['now_text']} {x['delta_text']} {x['move']}", x["lo_text"], x["hi_text"]] for x in rows_c], cv)
        pg.evaluate("document.querySelector('#rvp-curve .rvp-crow[data-i=\"0\"]').click()"); pg.wait_for_timeout(400)
        tr = pg.evaluate("(() => { const ch = Chart.getChart(document.getElementById('rvpCurveTrend')); const d = ch ? ch.data.datasets[0].data : []; return [document.getElementById('rvpCurveTrendH').textContent, d.length, d[d.length-1]]; })()")
        sr = rows_c[0]["spark_ref"]
        check("A19 커브 줄 클릭 → 1년 추이(curve_range_1y · %d 관측 · %s~%s · 끝값 = now)" % (sr["n"], sr["from"], sr["to"]),
              sr["src"] == "curve_range_1y" and tr[1] == sr["n"] and sr["from"] in tr[0] and sr["to"] in tr[0] and tr[2] == rows_c[0]["now"], tr)
        # 테너 상세 = value/prev/with20/contrib _text
        i3 = 5 if len(rows_t) > 5 else 0
        pg.evaluate(f"document.querySelector('#rvp-tenor .rvp-trow[data-i=\"{i3}\"]').click()"); pg.wait_for_timeout(250)
        td = pg.evaluate("[[...document.querySelectorAll('#rvpTenorDetail dd')].map(d => d.textContent), [...document.querySelectorAll('#rvpTenorDetail .rvp-tdetail-list li')].map(li => [li.children[0].textContent, li.children[1].textContent])]")
        rr = rows_t[i3]
        check("A20 테너 클릭 → 숫자 칸 = value_text·prev_text·with20_text · 기여 = contrib_text",
              td[0] == [rr["value_text"], rr["prev_text"]] + ([] if rr["ref"] else [rr["with20_text"]]) and td[1] == [[t["name"], t["contrib_text"]] for t in rr["top"]], td)
        # 금리 막대 글자 = change_text
        ct = pg.evaluate("Chart.getChart(document.getElementById('rvpRatesChg')).data.datasets[0]._texts")
        check("A21 금리 막대 숫자 = change_text", ct == [x["change_text"] for x in CH["rates"]["tenor_change"]], ct)
        # 상품 · 바스켓
        pc = pg.evaluate("[...document.querySelectorAll('#rvp-product .rvp-pcell:not(.is-none)')].map(c => [c.querySelector('b').textContent, c.querySelector('span').textContent])")
        cells = CH["product_map"]["cells"]
        tenors = [x["tenor"] for x in CH["product_map"]["rows"]]
        order = [c for t in tenors for pr in ("현물", "선물", "스왑") for c in cells if c["tenor"] == t and c["product"] == pr]
        check("A22 상품 칸 = rate_text · d5_text (웹 반올림 0)", pc == [[c["rate_text"], c["d5_text"]] for c in order], pc[:3])
        claims = pg.evaluate("[...document.querySelectorAll('#rvp-product .rvp-claims li')].map(l => l.textContent)")
        ptip = unesc(tips_of(pg, "#rvp-product"))
        check("A23 우위 문장 = 화면 글자 · level_text = 툴팁(화면 아님)", claims == [x["sentence"] for x in CH["product_map"]["rows"] if x.get("best")]
              and all(x["level_text"] in ptip and x["level_text"] not in tc for x in CH["product_map"]["rows"] if x.get("level_text")), claims)
        bk = pg.evaluate("[...document.querySelectorAll('#rvp-basket .rvp-bgroup')].map(g => [g.querySelector('.rvp-bgroup-h').innerText.replace(/\\s+/g,' '), [...g.querySelectorAll('.rvp-brow-v')].map(v => v.textContent)])")
        check("A24 바스켓 = fut_d5_text · rel_text", all(bk[i][1] == [m["rel_text"] for m in g["members"]] and (g["fut_d5_text"] + "bp") in bk[i][0] for i, g in enumerate(CH["basket"]["rows"])), bk)
        # 스텁 · 배지 색
        st = pg.evaluate("[...document.querySelectorAll('#rvp-notable .rvp-stub')].map(e => [e.dataset.bucket, e.dataset.refKey, e.innerText])")
        check("A25 참조 스텁 %d칸 = 엔진 stub · stub_text 원문" % len(STUBS), sorted(s_[:2] for s_ in st) == sorted([x["bucket"], x["ref_key"]] for x in STUBS)
              and all(any(x["stub_text"] in s_[2] for s_ in st) for x in STUBS if x.get("stub_text")), st)
        if st:
            pg.evaluate("document.querySelector('#rvp-notable .rvp-stub').click()"); pg.wait_for_timeout(700)
            lk = pg.evaluate("[...document.querySelectorAll('#rvp-notable .rvp-note.is-linked')].map(e => [e.dataset.bucket, e.dataset.key, e.dataset.lane])")
            check("A25b 스텁 클릭 → 같은 묶음 · 치우침 줄 원 카드 강조", lk == [[st[0][0], st[0][1], "mr"]], lk)
        col = pg.evaluate("(() => { const m = getComputedStyle(document.querySelector('#revPlain .rvp-tail')).color; const q = s => [...document.querySelectorAll(s)].map(e => getComputedStyle(e).color); return {m: m, skew: q('#rvp-notable .rvp-b-bond_skew'), weak: q('#rvp-notable .rvp-b-mom_weak')}; })()")
        check("A26 bond_skew · mom_weak 배지 = 중립색", col["skew"] and all(c == col["m"] for c in col["skew"] + col["weak"]), col)
        # 이름 바뀐 키 회귀 — 엔진 산출(새 이름만)과 웹 코드(옛 이름 참조 0)
        bonds = [n for n in NOTE if n["kind"] == "bond"]
        eng_ok = all("resid_chg_bp" in n and "resid_prev_bp" in n and "resid_chg_text" in n and "resid_change_bp" not in n and "resid_prev" not in n for n in bonds)
        srcs = (REPO / "assets/js/wb-review-plain.js").read_text(encoding="utf-8") + (REPO / "tools/quant-house/index.html").read_text(encoding="utf-8")
        web_ok = "resid_change_bp" not in srcs and not re.search(r"resid_prev(?!_bp)", srcs)
        check("A27 이름 변경 키 회귀 — 엔진 = resid_chg_bp·resid_prev_bp·resid_chg_text만 · 웹 코드 옛 이름 참조 0", eng_ok and web_ok, (eng_ok, web_ok))
        check("A28 종목 카드 사실 줄 = 엔진 fact · fact 에 resid_chg_text 포함(같은 값)", all(n.get("fact") and n["resid_chg_text"] in n["fact"] or n["fact"].endswith("보합") for n in bonds)
              and [c["fact"] for c in cards if c["key"] in {b["key"] for b in bonds}] == [n["fact"] for n in bonds])
        sc_tip = pg.evaluate("(() => { const ch = Chart.getChart(document.getElementById('rvpBondScatter')); const cb = ch.options.plugins.tooltip.callbacks; const raw = ch.data.datasets[0].data.find(p => p.id === 'KR103502GC65'); return cb.label({raw}); })()")
        check("A29 산점도 툴팁에 잔차 bp 숫자 재출력 0", "bp" not in sc_tip, sc_tip)
        pg.evaluate("document.querySelector('#rvp-notable .rvp-note[data-key=\"KR103502GC65\"]').click()"); pg.wait_for_timeout(400)
        check("A30 종목 카드 클릭 → 카드 강조 + 산점도 선택", pg.evaluate("[...document.querySelectorAll('#rvp-notable .rvp-note.is-linked')].map(e => e.dataset.key)") == ["KR103502GC65"])
        check("A31 콘솔 오류·경고 0 (W43 일반)", not errs, errs)
        pg.click("#revViewAdv"); pg.wait_for_timeout(400)
        st2 = pg.evaluate("[document.getElementById('view-review').getAttribute('data-rv-view'), localStorage.getItem('wb-review-view'), location.hash, getComputedStyle(document.querySelector('.rv-doc')).display, getComputedStyle(document.getElementById('revPlain')).display]")
        check("A32 고급 토글 → 고급 보임 · 저장 · #review/adv", st2[:3] == ["adv", "adv", "#review/adv"] and st2[3] != "none" and st2[4] == "none", st2)
        pg.context.browser.close()

    if run("B"):
        # ── B. 고급 회귀 — 개편 전 커밋(adv_before.txt) 대비 의도한 수선만 ─────────────
        pg, errs = page(pw, view="adv")
        adv = pg.evaluate("document.getElementById('revBody').innerText")
        before = (FX / "adv_before.txt").read_text(encoding="utf-8")
        picks = [x for f in ("mr", "momentum") for x in (snap["picks"]["buckets"]["bond_rv"].get(f) or [])]
        bd_text = sorted({x["badge_display"]["text"] for x in picks if x.get("badge_display")}, key=len, reverse=True)
        facts = {x["badge_display"]["fact"] for x in picks if x.get("badge_display")}

        def nb(line):   # 개편 전 줄 → 의도한 수선 적용(확신 라벨 제거 · 종목 행 당일 순위 · cheap%1y 중복 제거)
            for c in CONF:
                line = line.replace(c, "")
            if "resid_z" in line:
                line = re.sub(r" · cheap%1y [^ ]+%", "", line).replace("%ile1y", "당일 순위")
            return line

        def na(line):
            for c in CONF + tuple(bd_text):
                line = line.replace(c, "")
            return line
        bl = [nb(x) for x in before.splitlines() if not re.match(r"^track\b", x)]
        al = [na(x) for x in adv.splitlines() if x not in facts]
        diff = [d for d in difflib.unified_diff(before.splitlines(), adv.splitlines(), lineterm="", n=0) if d[:1] in "+-" and not d.startswith(("+++", "---"))]
        (FX / "adv_diff.txt").write_text("\n".join(diff), encoding="utf-8")
        check("B1 고급 텍스트 = 개편 전 + 의도한 수선만(확신 라벨→badge_display · 당일 순위 · 사실 줄 · track 행 제거) · 원 차이 %d줄" % len(diff),
              bl == al, [d for d in difflib.unified_diff(bl, al, lineterm="", n=0)][:6])
        check("B3 커브·스왑 등 진짜 1년 행은 %ile1y 유지", adv.count("%ile1y") > 0)
        pan = pg.evaluate("[...document.querySelectorAll('#revBody .rv-cols > .panel-wrap')].map(p => [p.innerText, [...p.querySelectorAll('.rv-conf')].map(e => e.textContent), [...p.querySelectorAll('.rv-resid')].map(e => e.textContent)])")
        check("B5 종목 픽 = '당일 순위'(1년 표기 0) · 다른 버킷 = %ile1y", "당일 순위" in pan[0][0] and "%ile1y" not in pan[0][0] and "cheap%1y" not in pan[0][0]
              and all("%ile1y" in x[0] and "당일 순위" not in x[0] for x in pan[1:]))
        check("B7 고급 종목 배지 = badge_display.text(확신 라벨 0) · 다른 버킷 확신 라벨 그대로",
              pan[0][1] == [x["badge_display"]["text"] for x in picks] and not any(c in " ".join(pan[0][1]) for c in CONF) and all(len(x[1]) > 0 for x in pan[1:]), pan[0][1])
        check("B9 고급 종목 잔차 주간 변화 = badge_display.fact(화면 글자)", pan[0][2] == [x["badge_display"]["fact"] for x in picks], pan[0][2])
        btip = unesc(pg.evaluate("[...document.querySelectorAll('#revBody .rv-cols > .panel-wrap')[0].querySelectorAll('.wb-help template')].map(t => t.innerHTML).join(' ')"))
        check("B10 picks.meta.bond_display_note = 종목 버킷 ? 원문", snap["picks"]["meta"]["bond_display_note"] in btip)
        hdr = pg.evaluate("[...document.querySelectorAll('#rvBrv th')].map(t => t.textContent)")
        check("B6 개별채권 RV 표 머리 cheap %1y → 당일 순위", "당일 순위" in hdr and not any("1y" in h for h in hdr), hdr)
        trk = pg.evaluate("[...document.querySelectorAll('#revBody .rv-two tbody tr')].map(tr => tr.children[0].textContent.trim())")
        check("B8 고급 일드커브 표 = 커브 구간 행만('track' 메타 행 0)", trk == [k for k, v in snap["curve_moves"].items() if isinstance(v, dict)], trk)
        check("B4 콘솔 오류·경고 0 (고급)", not errs, errs)
        pg.context.browser.close()

    if run("C"):
        # ── C. plain 없음 → 고급 폴백 ─────────────────────────────────
        mode("noplain")
        pg, errs = page(pw)
        s0 = pg.evaluate("[WB_REV_PLAIN_STATS.state, document.getElementById('view-review').getAttribute('data-rv-view'), localStorage.getItem('wb-review-view'), location.hash, WB_REV_PLAIN_STATS.fallback, document.querySelectorAll('#revBody .cat-title').length]")
        check("C0 plain 없음 + 기억값 없음 → 고급(폴백) · 기억값 안 씀 · 해시 그대로 · 고급 정상", s0[:5] == ["no-plain", "adv", None, "#review", True] and s0[5] > 5, s0)
        pg.click("#revViewPlain"); pg.wait_for_timeout(400)
        s1_ = pg.evaluate("[document.getElementById('view-review').getAttribute('data-rv-view'), document.getElementById('revPlain').innerText, localStorage.getItem('wb-review-view')]")
        check("C1 일반 버튼 → '준비 중' 빈 상태(직접 선택 = 저장)", s1_[0] == "plain" and "준비 중" in s1_[1] and s1_[2] == "plain", s1_)
        pg.click("#revPlain [data-rv-go='adv']"); pg.wait_for_timeout(300)
        check("C3 빈 상태 '고급 보기로' 동작 · 콘솔 0", pg.evaluate("document.getElementById('view-review').getAttribute('data-rv-view')") == "adv" and not errs, errs)
        pg.context.browser.close()

    if run("X"):
        # ── X. 폴백 × 기억값 · 링크 ───────────────────────────────────
        def _open(m, view=None, hash_="#review"):
            mode(m)
            q, e = page(pw, view=view, hash_=hash_)
            return q, e, q.evaluate("[document.getElementById('view-review').getAttribute('data-rv-view'), localStorage.getItem('wb-review-view'), WB_REV_PLAIN_STATS.state]")
        q, e, r = _open("noplain", view="plain"); q.context.browser.close()
        check("X1 기억값 '일반' + plain 없음 → 고급 · 기억값 '일반' 그대로", r[:2] == ["adv", "plain"], r)
        q, e, r = _open("w43", view="plain"); q.context.browser.close()
        check("X2 기억값 '일반' + plain 있음 → 일반", r[:2] == ["plain", "plain"], r)
        q, e, r = _open("noplain", hash_="#review/plain"); q.context.browser.close()
        check("X3 링크 #review/plain + plain 없음 → 일반 '준비 중'", r[0] == "plain" and r[2] == "no-plain" and r[1] is None, r)
        q, e, r = _open("w43", view="adv")
        check("X4 기억값 '고급' → 고급 · 콘솔 0", r[:2] == ["adv", "adv"] and not e, (r, e)); q.context.browser.close()
        q, e, r = _open("noplain")
        mode("w43")
        q.click("#view-review .wb-filterbar-end .wb-btn--primary")
        q.wait_for_function("WB_REV_PLAIN_STATS.state === 'plain'", timeout=40000); q.wait_for_timeout(400)
        r2 = q.evaluate("[document.getElementById('view-review').getAttribute('data-rv-view'), localStorage.getItem('wb-review-view'), WB_REV_PLAIN_STATS.fallback]")
        check("X6 같은 세션 새로고침에 plain 실림 → 일반 자동 복귀(기억값 안 씀)", r[0] == "adv" and r2 == ["plain", None, False], (r, r2))
        q.context.browser.close()

    if run("D"):
        # ── D. scoreboard plain 없음 ─────────────────────────────────
        mode("noscore")
        pg, errs = page(pw)
        trd = pg.evaluate("document.getElementById('rvp-trust').innerText")
        check("D1 scoreboard plain 없음 → 믿어도 되나 '준비 중' · 나머지 정상 · 콘솔 0", "준비 중" in trd and pg.evaluate("WB_REV_PLAIN_STATS.state") == "plain" and not errs, errs)
        pg.context.browser.close()

    if run("E"):
        # ── E. 비표준 창(09-23 · 3영업일 · 현 엔진 build_plain) ───────────
        mode("nonstd")
        pg, errs = page(pw)
        nsd = json.loads((FX / "snap_nonstd.json").read_text(encoding="utf-8"))
        ns = nsd["plain"]
        wb = pg.evaluate("[document.getElementById('wbRevWindow').hidden, document.getElementById('wbRevWindow').textContent]")
        check("E1 비표준 창 → 페이지 머리 window_label", (not wb[0]) and ns["window_label"] in wb[1], wb)
        l1 = pg.evaluate("document.querySelector('#rvp-head .rvp-l').textContent")
        check("E2 결론 1줄 = 엔진 접두 포함 원문", l1 == ns["headline"][0] and l1.startswith("(" + ns["window_label"] + ")"), l1)

        def _res(rf):   # 계약: 같은 snapshot 안 · 날짜 축과 길이 같음 · 끝 날짜 = to
            if not rf:
                return False
            src = nsd.get(rf.get("src")) or {}
            v, d = (src.get("series") or {}).get(rf.get("key")), src.get("dates")
            return isinstance(v, list) and isinstance(d, list) and len(v) == len(d) > 0 and (not rf.get("to") or d[-1] == rf["to"])
        want_miss = sum(1 for x in ns["notable"] if not x.get("stub") and not _res(x.get("spark_ref")))
        nodom = pg.evaluate("document.querySelectorAll('#rvp-notable .rvp-nospark').length")
        check("E4 풀리지 않는 spark_ref → '추이 없음' (DOM %d = 정답 %d)" % (nodom, want_miss), nodom == want_miss)
        rng = pg.evaluate("document.querySelectorAll('#rvp-curve .rvp-rng-none').length")
        check("E3 1년 범위 없는 줄 → '범위 없음'", rng == sum(1 for x in ns["charts"]["curve_shape"]["rows"] if x.get("lo") is None or x.get("hi") is None), rng)
        check("E5 콘솔 오류·경고 0 (비표준)", not errs, errs)
        pg.context.browser.close()

    if run("F"):
        # ── F. 스냅샷 없음 ───────────────────────────────────────────
        mode("unavail")
        pg, errs = page(pw)
        check("F1 available:false → 엔진 note 그대로 · 콘솔 0", "미생성" in pg.evaluate("document.getElementById('revPlain').innerText") and not errs, errs)
        pg.context.browser.close()

    if run("H"):
        # ── H. 경계 목업(mk_edge.py) ─────────────────────────────────
        mode("edge")
        pg, errs = page(pw)
        em = json.loads((FX / "edge_meta.json").read_text(encoding="utf-8"))
        ed = json.loads((FX / "snap_edge.json").read_text(encoding="utf-8"))["plain"]
        etx = pg.evaluate("document.getElementById('revPlain').innerText")
        etc = pg.evaluate("document.getElementById('revPlain').textContent")
        col = pg.evaluate("(k => { const m = getComputedStyle(document.querySelector('#revPlain .rvp-tail')).color; const b = [...document.querySelectorAll('#rvp-notable .rvp-note')].find(e => e.dataset.key === k).querySelector('.rvp-badge'); return [m, getComputedStyle(b).color]; })", em["zzz_key"])
        check("H1 모르는 badge_key → 중립색", col[0] == col[1], col)
        ns_ = pg.evaluate("(k => { const c = [...document.querySelectorAll('#rvp-notable .rvp-note')].find(e => e.dataset.key === k); return c ? !!c.querySelector('.rvp-nospark') : null; })", em["to_bad_key"])
        check("H2 카드 spark_ref.to ≠ 시계열 끝 → '추이 없음'", ns_ is True, ns_)
        pg.evaluate("document.querySelector('#rvp-curve .rvp-crow[data-i=\"1\"]').click()"); pg.wait_for_timeout(300)
        check("H3 커브 줄 spark_ref.to 어긋남 → 추이 없음", "추이 없음" in pg.evaluate("document.getElementById('rvpCurveTrendH').textContent"))
        v0 = pg.evaluate("document.querySelector('#rvp-curve .rvp-crow[data-i=\"0\"] .rvp-crow-v b').textContent")
        check("H4 now_text 없음 → 원 값 그대로(34.05 · 웹 반올림 0)", v0 == "34.05", v0)
        check("H5 상품 '(수준은 반대)' = 화면 글자", "(수준은 반대)" in etx)
        if em.get("stub_no_text"):
            check("H6 stub_text 없음 → 기본 문구 '치우침 줄과 같은 카드'", "치우침 줄과 같은 카드" in etx)
        oc = pg.evaluate("(k => { const c = [...document.querySelectorAll('#rvp-notable .rvp-note')].find(e => e.dataset.key === k); return c ? [!!c.querySelector('.rvp-fact'), c.innerText] : null; })", em["old_name_key"])
        check("H7 옛 이름(resid_change_bp·resid_prev)만 있는 카드 → 사실 줄 만들지 않음", oc is not None and oc[0] is False and "잔차 주간" not in oc[1], oc)
        check("H8 pct_text 없음 → pct 원 값 + %", pg.evaluate("document.querySelector('#rvp-trust .rvp-trust-v b').textContent") == f"{sbd['plain']['rows'][0]['pct']}%")
        hit = [t for t in BANNED + FAB if t in etc]
        check("H9 금지어 0 · '해당 없음' 0 · 콘솔 0 (경계)", not hit and "해당 없음" not in etc and not errs, (hit, errs))
        pg.context.browser.close()

    if run("L"):
        # ── L. 옛 계약(schema 1 · ae87f7dc) 하위 호환 ───────────────────
        mode("legacy")
        pg, errs = page(pw)
        lg = json.loads((FX / "snap_legacy.json").read_text(encoding="utf-8"))["plain"]
        lb = pg.evaluate("[...document.querySelectorAll('#rvp-notable .rvp-note[data-kind=\"bond\"]')].map(c => [!!c.querySelector('.rvp-badge'), !!c.querySelector('.rvp-tail')])")
        check("L1 옛 계약 종목 카드 확신 배지·꼬리 숨김(%d장)" % len(lb), lb and all(x == [False, False] for x in lb), lb)
        pg.evaluate("document.querySelector('#rvp-curve .rvp-crow[data-i=\"0\"]').click()"); pg.wait_for_timeout(300)
        check("L2 옛 계약 커브 줄(spark_ref 없음) → 추이 없음 · 126일 대체 0", "추이 없음" in pg.evaluate("document.getElementById('rvpCurveTrendH').textContent"))
        check("L3 옛 계약 렌더 · schema %s · '해당 없음' 0 · 콘솔 0" % lg.get("schema"), pg.evaluate("WB_REV_PLAIN_STATS.state") == "plain"
              and "해당 없음" not in pg.evaluate("document.getElementById('revPlain').textContent") and not errs, errs)
        pg.context.browser.close()

    if run("G"):
        # ── G. 링크 · 저장 막힘 ─────────────────────────────────────
        mode("w43")
        pg, errs = page(pw, hash_="#review/adv")
        check("G1 #review/adv 링크 → 고급", pg.evaluate("document.getElementById('view-review').getAttribute('data-rv-view')") == "adv")
        pg.context.browser.close()
        b = pw.chromium.launch(channel="chrome")
        ctx = b.new_context(viewport={"width": 1440, "height": 900})
        ctx.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}});")
        pg = ctx.new_page(); errs2 = []
        pg.on("pageerror", lambda e: errs2.append(str(e)))
        pg.goto(BASE + "/tools/quant-house/#review")
        pg.wait_for_function("window.WB_REV_PLAIN_STATS && window.WB_REV_PLAIN_STATS.state !== 'init'", timeout=40000)
        pg.click("#revViewAdv"); pg.wait_for_timeout(300)
        check("G2 localStorage 막힘 → 토글 동작 · 예외 0", pg.evaluate("document.getElementById('view-review').getAttribute('data-rv-view')") == "adv" and not [e for e in errs2 if "wb-review" in e or "rvp" in e.lower()], errs2[:3])
        b.close()

print("\nPASS %d / FAIL %d" % (len(PASSES), len(FAILS)))
sys.exit(1 if FAILS else 0)
