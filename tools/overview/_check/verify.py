# -*- coding: utf-8 -*-
"""Overview 검증 — devserver.py(기본 :8775) 기동 후 실행. 읽기만.
정답은 같은 API 응답에서 파이썬으로 따로 계산(JS toFixed 규칙 = Decimal ROUND_HALF_UP · 부호 따로)하거나,
금리 대시보드 화면이 직접 보여 준 값과 대조한다(코드 출력 베끼기 0).
  O 순서·첫 화면 · T 시점(아침/장중/장마감/예비 함정) · V 값(금리 대시보드 산술) · K 대시보드 화면 대조 ·
  M 모니터 json 그대로 · R 리뷰 plain 그대로/폴백 · F 섹션 실패 격리 · N 내비·루트 · Z 모바일
VERIFY_ONLY = 섹션 글자(카나리아 가속).
"""
import json
import os
import re
import sys
import urllib.parse
import urllib.request
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
REPO = Path(os.environ.get("OV_REPO") or HERE.parents[2])   # 카나리아 = 복사본 트리
B = os.environ.get("OV_BASE", "http://127.0.0.1:8775")
ONLY = os.environ.get("VERIFY_ONLY", "")
FAILS, PASSES = [], []
LB = {"y2": "2년지표", "y3": "3년지표", "y5": "5년지표", "y10": "10년지표", "y20": "20년지표", "y30": "30년지표",
      "f3": "3선", "f10": "10선", "i2": "IRS2년", "i3": "IRS3년", "i5": "IRS5년", "i10": "IRS10년", "cd": "CD", "base": "한국기준금리"}
SPR = {"s35": ("y5", "y3"), "s310": ("y10", "y3"), "s510": ("y10", "y5"), "s1030": ("y30", "y10")}


def run(s):
    return not ONLY or s in ONLY


def check(name, cond, detail=""):
    (PASSES if cond else FAILS).append(name)
    print(("PASS  " if cond else "FAIL  ") + name + (("  | " + str(detail)[:400]) if detail != "" else ""))


def get(path):
    with urllib.request.urlopen(B + path, timeout=90) as r:
        return json.loads(r.read().decode("utf-8"))


def setmode(rev="w43", ktb="live", fail="none"):
    for u in ("/__rev/" + rev, "/__ktb/" + ktb, "/__fail/" + fail):
        urllib.request.urlopen(B + u).read()


def tofixed(x, d):   # JS Number.prototype.toFixed(d) 와 같은 결과(정확한 이진값 · 반올림 = 0 에서 먼 쪽)
    q = Decimal(abs(x)).quantize(Decimal(1).scaleb(-d), rounding=ROUND_HALF_UP)
    s = format(q, "f")
    return ("-" + s) if x < 0 and q != 0 else (("-" + s) if x < 0 else s)


def fmt_bp(v):   # 금리 대시보드: `${chg>0?'+':''}${chg.toFixed(1)}`
    return "–" if v is None else ("+" if v > 0 else "") + tofixed(v, 1)


def series_now():
    d = get("/ktb/multi_label_series?labels=" + urllib.parse.quote(",".join(LB.values())) + "&days=45")["series"]
    return {k: {str(r["price_date"])[:10]: (None if r["ytm"] is None else float(r["ytm"])) for r in d.get(v, [])} for k, v in LB.items()}


def open_page(pw, path="/tools/overview/", w=1440, h=900, theme="dark", wait=True):
    ctx = pw.chromium.launch(channel="chrome").new_context(viewport={"width": w, "height": h})
    ctx.add_init_script("try{localStorage.clear();localStorage.setItem('wb-theme','%s')}catch(e){}" % theme)
    pg = ctx.new_page(); errs = []
    pg.on("console", lambda m: errs.append(m.type + ": " + m.text) if m.type in ("error", "warning") else None)
    pg.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
    pg.goto(B + path)
    if wait:
        pg.wait_for_function("window.WB_OV_STATS && WB_OV_STATS.done", timeout=150000)
        pg.wait_for_timeout(600)
    return pg, errs


def stats(pg):
    return pg.evaluate("({sec: WB_OV_STATS.sec, dates: WB_OV_STATS.dates, rejected: WB_OV_STATS.rejected, tiles: WB_OV_STATS.tiles, bars: WB_OV_STATS.bars})")


def today():
    return get("/__ktb/live")["today"]


TODAY = today()
with sync_playwright() as pw:
    # ── O 순서 · 첫 화면 · 콘솔 ───────────────────────────────────────────
    if run("O"):
        setmode()
        pg, errs = open_page(pw)
        order = pg.evaluate("[...document.querySelectorAll('main .ov-sec')].map(s => [s.id, s.querySelector('.ov-sec-title').textContent, !!s.querySelector('.ov-more[href]')])")
        check("O1 섹션 순서 = 지표·커브 → 최신 금리 변동 → 차익거래 → 주간 리뷰 → 금리 대시보드 · 섹션마다 바로가기",
              [o[0] for o in order] == ["ov-s1", "ov-s2", "ov-s3", "ov-s4", "ov-s5"] and all(o[2] for o in order), order)
        b1 = pg.evaluate("document.getElementById('ov-s1').getBoundingClientRect().bottom")
        check("O2 1440×900 첫 화면에 섹션 1 전부 (bottom %d)" % b1, b1 <= 900)
        jump = pg.evaluate("[...document.querySelectorAll('.ov-jump a')].map(a => a.getAttribute('href'))")
        check("O3 탭 바로가기(작게) 3개", jump == ["/tools/arb-monitor/", "/tools/quant-house/#review", "/tools/dashboard/"], jump)
        st = stats(pg)
        check("O4 섹션 5개 모두 정상 · 콘솔 오류 0", st["sec"] == {"s1": "ok", "s2": "ok", "s3": "ok", "s4": "ok", "s5": "ok"} and not errs, (st["sec"], errs))
        basis = pg.evaluate("document.getElementById('ovBasis').innerText")
        check("O5 화면 머리 '기준 D(종가) · 비교 D−1' 표기", ("기준 " + st["dates"][0] + "(종가)") in basis and ("비교 D−1 " + st["dates"][1][5:]) in basis, basis)
        pg.context.browser.close()

    # ── T 시점 목업: 아침·장중(예비호가) · 장마감 후(종가 적재) · 예비 함정 ─────────
    if run("T"):
        sm = series_now()
        last_close = max(d for d in sm["y3"] if d < TODAY and sm["y3"][d] is not None)
        for sc in ("am", "intraday", "close", "prelim"):
            setmode(ktb=sc)
            pg, errs = open_page(pw)
            st = stats(pg)
            D = st["dates"][0] if st["dates"] else None
            if sc in ("am", "intraday"):
                check("T-%s-D = 직전 확정 종가 %s (오늘 %s 예비호가 행 무시)" % (sc, last_close, TODAY), D == last_close and TODAY not in st["dates"], st["dates"])
            elif sc == "close":
                check("T-close-D 장마감 후 종가 적재 → D = 오늘 %s · D−1 = %s" % (TODAY, last_close), D == TODAY and st["dates"][1] == last_close, st["dates"])
            else:
                check("T-prelim-D 오늘 지표 예비행·보드 as_of=오늘이어도 → D = %s · 오늘 '예비 제외'" % last_close, D == last_close and TODAY in st["rejected"]
                      and "예비 제외" in pg.evaluate("document.getElementById('ovBasis').innerText"), (st["dates"], st["rejected"]))
            if sc == "intraday":
                s2 = series_now()
                check("T-intraday-tile 3선 타일 = D 종가(오늘 장중 예비값 아님)", st["tiles"]["f3"]["close"] == tofixed(s2["f3"][D], 3) + "%" and s2["f3"].get(TODAY) is not None
                      and tofixed(s2["f3"][TODAY], 3) + "%" != st["tiles"]["f3"]["close"], (st["tiles"]["f3"], s2["f3"].get(TODAY)))
            check("T-%s-con 콘솔 오류 0" % sc, not errs, errs)
            pg.context.browser.close()
        setmode()

    # ── V 값: 금리 대시보드 산술로 파이썬 독립 계산 ───────────────────────────
    if run("V") or run("K"):
        setmode()
        pg, errs = open_page(pw)
        st = stats(pg)
        sm = series_now()
        dl = st["dates"]
        D, D1, D3 = dl[0], dl[1], dl[3]
        bad = []
        for k in LB:
            m = sm[k]; v, v1, v3 = m.get(D), m.get(D1), m.get(D3)
            want = {"close": "–" if v is None else tofixed(v, 3) + "%",
                    "d1": fmt_bp(None if v is None or v1 is None else (v - v1) * 100),
                    "d3": fmt_bp(None if v is None or v3 is None else (v - v3) * 100)}
            if st["tiles"].get(k) != want:
                bad.append((k, st["tiles"].get(k), want))
        lv = lambda a, b, d: None if sm[a].get(d) is None or sm[b].get(d) is None else float(tofixed((sm[a][d] - sm[b][d]) * 100, 4))
        for k, (a, b) in SPR.items():
            x, x1, x3 = lv(a, b, D), lv(a, b, D1), lv(a, b, D3)
            want = {"close": "–" if x is None else tofixed(x, 1) + "bp", "d1": fmt_bp(None if x is None or x1 is None else x - x1), "d3": fmt_bp(None if x is None or x3 is None else x - x3)}
            if st["tiles"].get(k) != want:
                bad.append((k, st["tiles"].get(k), want))
        check("V1 타일 18개(금리 14 · 스프레드 4) 종가·1일·3일 = 대시보드 산술 독립 계산", not bad, bad[:3])
        bars = st["bars"]
        wb = {"d": [], "d1": [], "d2": [], "cum": []}
        for k in ("y2", "y3", "y5", "y10"):
            m = sm[k]
            wb["d"].append(fmt_bp((m[dl[0]] - m[dl[1]]) * 100)); wb["d1"].append(fmt_bp((m[dl[1]] - m[dl[2]]) * 100))
            wb["d2"].append(fmt_bp((m[dl[2]] - m[dl[3]]) * 100)); wb["cum"].append(fmt_bp((m[dl[0]] - m[dl[3]]) * 100))
        check("V2 ① 막대 D−2·D−1·D 일별 변화 · 3일 누적 = 독립 계산", bars == wb, (bars, wb))
        xl = pg.evaluate("Chart.getChart(document.getElementById('ovBars')).data.labels")
        check("V3 ① 막대 아래 3일 누적 글자 = 같은 값", [l[1] for l in xl] == ["3일 " + c for c in wb["cum"]], xl)
        cv = get("/ktb/curve?date=" + D + "&category=" + urllib.parse.quote("국고채"))
        n = len([r for r in cv["rows"] if r.get("remain_year") is not None and r.get("ytm") not in (None, 0) and not re.search("저평$", r.get("label") or "")])
        check("V4 ① 전 국채 커브 D 종목 수 = /ktb/curve 응답 그대로(%d)" % n, pg.evaluate("Chart.getChart(document.getElementById('ovCurve')).data.datasets.slice(-1)[0].data.length") == n)
        pg.context.browser.close()
        # K 금리 대시보드 화면 대조(같은 서버 · 같은 데이터)
        if run("K"):
            dp, derr = open_page(pw, "/tools/dashboard/", wait=False)
            dp.wait_for_function("document.querySelectorAll('#wbHeroKpis .wb-kpi').length >= 4", timeout=120000)
            dp.wait_for_timeout(800)
            hero = dp.evaluate("[...document.querySelectorAll('#wbHeroKpis .wb-kpi')].map(k => [k.querySelector('dt').textContent, k.querySelector('.wb-kpi-val').textContent, k.querySelector('.wb-kpi-sub').textContent])")
            mp = {"국고 3년": "y3", "국고 10년": "y10", "10Y − 3Y": "s310", "30Y − 10Y": "s1030"}
            cmp = []
            for t, v, c in hero:
                key = next((mp[x] for x in mp if t.startswith(x)), None)
                if key:
                    cmp.append((key, v, c, st["tiles"][key]["close"], st["tiles"][key]["d1"] + "bp"))
            check("K1 금리 대시보드 히어로 값과 같음(3년·10년·10−3·30−10 종가·1일 변화)", len(cmp) == 4 and all(x[1] == x[3] and x[2] == x[4] for x in cmp), cmp)
            check("K2 금리 대시보드 회귀 — 콘솔 오류 0", not derr, derr)
            dp.context.browser.close()

    # ── M 차익거래 모니터 json 그대로 ───────────────────────────────────────
    if run("M"):
        setmode()
        j = get("/quant-house/arb-monitor")
        pg, errs = open_page(pw)
        P, L = j["panels"], j["latest"]
        s3 = pg.evaluate("document.getElementById('ovS3').innerText")
        meta = pg.evaluate("document.getElementById('ovS3Meta').textContent")
        check("M1 섹션 머리 asof = latest.asof · 체결일 = latest.trade_day", ("기준 " + L["asof"]) in meta and ("체결일 " + L["trade_day"]) in meta, meta)
        sgn = lambda v, d: ("+" if v > 0 else "−" if v < 0 else "") + tofixed(abs(v), d)
        fix = lambda v, d: ("−" if v < 0 else "") + tofixed(abs(v), d)
        b, bk = P["basis"], P["basis"]["book"]
        kv = pg.evaluate("[...document.querySelectorAll('#ovArbKpis dd')].map(d => d.childNodes[0].textContent)")
        check("M2 저평 핵심 = basis·book 그대로(반올림만: 전 2자리 · 주 1자리)",
              kv == [sgn(b["U"], 2), sgn(b["Ub"], 2), fix(bk["dist_to_sell"], 2), fix(bk["dist_to_buy"], 2), fix(bk["weeks_to_expiry"], 1)], kv)
        gz = pg.evaluate("[document.querySelectorAll('#ovGauge .ov-gauge-line.exit').length, [...document.querySelectorAll('#ovGauge .ov-gauge-mk')].map(e => e.textContent)]")
        nexit = len(bk.get("exit_lines_sell") or bk.get("exit_lines") or []) + len(bk.get("exit_lines_buy") or [])
        check("M3 게이지 반대매매 점선 %d개 · U·Ub 표식 값 = json" % nexit, gz[0] == nexit and gz[1] == ["U " + sgn(b["U"], 2), "Ub " + sgn(b["Ub"], 2)], gz)
        J = P["hets_today"]["judge"]
        rows = pg.evaluate("[...document.querySelectorAll('#ovJudge tbody tr')].map(r => [r.children[0].textContent, r.children[1].textContent])")
        check("M4 오늘 판정 = judge 그대로(%d트리 + 3년 매수 제외 행)" % len(J), rows[:-1] == [[t, J[t][0]] for t in J] and rows[-1] == ["3년 매수", "제외"], rows)
        on = sum(1 for t in J if J[t][0] == "진입")
        check("M5 진입 수 배지 = %d / %d" % (on, len(J)), ("진입 %d / %d" % (on, len(J))) in s3)
        lg, ex = P["ledger"], P["exposure"]["aggregate"]
        led = pg.evaluate("document.getElementById('ovLedger').textContent")
        exp_ = pg.evaluate("document.getElementById('ovExpo').textContent")
        check("M6 라이브 vs 백테스트 · 노출 = json 그대로", ("체결 %s건" % lg["n_fills"]) in led and exp_ == "DV01 %s · 3−2 %s · 5−3 %s" % (ex["dv01_man"], ex["c32_man"], ex["c53_man"]), (led, exp_))
        hon = pg.evaluate("[...document.querySelectorAll('#ovHonesty li')].map(l => l.textContent)")
        check("M7 정직 라벨 %d문장 그대로 화면(작은 글자) + 정직-N" % len(P["labels"]["honesty"]), hon[:len(P["labels"]["honesty"])] == P["labels"]["honesty"] and ("정직-N " + str(P["labels"]["n_effective"])) in hon, hon)
        tips = pg.evaluate("[...document.querySelectorAll('#ovS3 .wb-help')].map(h => h.getAttribute('data-help') || '').join(' ')")
        check("M8 합산 포지션 고정 문구(명세 F) = 판정 ? 원문", "다 발동하면 2년 매도 + 5년 매수 + 3년 매도가 서고 반대 문턱 둘은 핑퐁 상대." in tips and "뷰로 트리를 켜고 끄지 않는다" in tips)
        check("M9 콘솔 오류 0", not errs, errs)
        pg.context.browser.close()

    # ── R 주간 리뷰 요약 = plain 그대로 · plain 없음 폴백 ─────────────────────────
    if run("R"):
        setmode(rev="w43")
        snap = get("/quant-house/market-review"); sb = get("/quant-house/review-scoreboard")
        pg, errs = open_page(pw)
        P_ = snap["plain"]
        hl = pg.evaluate("[...document.querySelectorAll('#revPlain .rvp-l')].map(e => e.textContent)")
        tt = pg.evaluate("[...document.querySelectorAll('#revPlain .rvp-title')].map(e => e.textContent)")
        want = [P_["charts"][k]["title"] for k in ("rates", "curve_shape", "tenor_value", "bond_scatter")] + [sb["plain"]["title"]]
        check("R1 결론 3줄 = plain.headline · 그림 4장 제목 + 믿어도 되나 제목 = 엔진 원문", hl == P_["headline"] and tt == want, (hl, tt))
        check("R2 리뷰 요약 = mini · 콘솔 0", stats(pg)["sec"]["s4"] == "ok" and not errs, errs)
        pg.context.browser.close()
        setmode(rev="noplain")
        snap2 = get("/quant-house/market-review")
        pg, errs = open_page(pw)
        rows = pg.evaluate("[...document.querySelectorAll('#ovRevFallback tbody tr')].map(r => [...r.children].map(c => c.textContent))")
        cm = snap2["curve_moves"]
        advf = lambda v: "–" if v is None else ("+" if v > 0 else "") + (str(int(Decimal(abs(v)).quantize(Decimal(1), rounding=ROUND_HALF_UP)) * (1 if v >= 0 else -1)) if abs(v) >= 100 else tofixed(v, 2))   # 고급 보기 _fmt
        want = [[k, advf(v["now"]), advf(v["wk_ago"]), advf(v["delta_bp"])] for k, v in cm.items() if isinstance(v, dict)]
        check("R3 plain 없음 → '준비 중' 대신 고급 핵심(curve_moves · 고급 보기 표와 같은 글자) + 고급 바로가기", stats(pg)["sec"]["s4"] == "fallback" and rows == want
              and pg.evaluate("!!document.querySelector('#revPlain a[href=\"/tools/quant-house/#review/adv\"]')"), rows)
        pg.context.browser.close()
        qp, qerr = open_page(pw, "/tools/quant-house/#review/adv", wait=False)
        qp.wait_for_function("[...document.querySelectorAll('table.tlog thead')].some(t => t.textContent.includes('커브 구간'))", timeout=120000)
        adv = qp.evaluate("(() => { const t = [...document.querySelectorAll('table.tlog')].find(t => t.querySelector('thead').textContent.includes('커브 구간')); return [...t.querySelectorAll('tbody tr')].map(r => [...r.children].map(c => c.textContent)); })()")
        check("R4 폴백 표 글자 = 실제 고급 보기 표 글자(같은 스냅샷)", adv == rows, adv)
        qp.context.browser.close()
        setmode()

    # ── F 섹션 실패 격리 ────────────────────────────────────────────────
    if run("F"):
        cases = [("series", {"s1": "err", "s2": "err", "s3": "ok", "s4": "ok", "s5": "ok"}),
                 ("board", {"s1": "ok", "s2": "ok", "s3": "ok", "s4": "ok", "s5": "err"}),
                 ("arb", {"s1": "ok", "s2": "ok", "s3": "err", "s4": "ok", "s5": "ok"}),
                 ("review", {"s1": "ok", "s2": "ok", "s3": "ok", "s4": "err", "s5": "ok"}),
                 ("series,arb,review,board", {"s1": "err", "s2": "err", "s3": "err", "s4": "err", "s5": "err"})]
        for name, want in cases:
            setmode(fail=name)
            pg, errs = open_page(pw)
            sec = stats(pg)["sec"]
            links = pg.evaluate("[...document.querySelectorAll('.ov-err a[href]')].length")
            real = [e for e in errs if "Failed to load resource" not in e]
            check("F-%s 실패 섹션만 사유+탭 링크 · 나머지 정상 · 의도한 500 외 콘솔 0" % name, sec == want and links >= sum(1 for v in want.values() if v == "err") and not real, (sec, links, real))
            pg.context.browser.close()
        setmode()

    # ── N 내비 · 팔레트 · 루트 · 기존 탭 회귀 ───────────────────────────────────
    if run("N"):
        setmode()
        pg, errs = open_page(pw)
        nav = pg.evaluate("[...document.querySelectorAll('.wb-nav1 a')].map(a => [a.textContent, a.getAttribute('href'), a.classList.contains('is-active')])")
        check("N1 헤더 = Overview · 차익거래 모니터 · 주간 리뷰 · 금리 대시보드 (Overview 활성)", [n[0] for n in nav] == ["Overview", "차익거래 모니터", "주간 리뷰", "금리 대시보드"] and nav[0][2], nav)
        check("N2 브랜드 클릭 = /tools/overview/", pg.evaluate("document.querySelector('.wb-brand').getAttribute('href')") == "/tools/overview/")
        pg.keyboard.press("Control+k"); pg.wait_for_timeout(300)
        pal = pg.evaluate("[...document.querySelectorAll('.wb-palette-item-label')].map(e => e.textContent)")
        check("N3 화면 찾기(Ctrl K)에 Overview", "Overview" in pal, pal[:6])
        pg.context.browser.close()
        nt = (REPO / "netlify.toml").read_text(encoding="utf-8")
        check("N4 netlify 루트 302 → /tools/overview/ · /tools/overview 301", re.search(r'from\s*=\s*"/"\s*\n\s*to\s*=\s*"/tools/overview/"\s*\n\s*status\s*=\s*302', nt) is not None and '"/tools/overview"' in nt)
        rp, rerr = open_page(pw, "/", wait=False)
        rp.wait_for_url("**/tools/overview/**", timeout=60000)
        check("N5 루트 index.html 폴백 → /tools/overview/", rp.url.rstrip("/").endswith("/tools/overview"), rp.url)
        rp.context.browser.close()
        ap, aerr = open_page(pw, "/tools/arb-monitor/", wait=False)
        ap.wait_for_function("document.getElementById('amAsof') && /기준 \\d/.test(document.getElementById('amAsof').textContent)", timeout=120000); ap.wait_for_timeout(1500)
        check("N6 차익거래 모니터 회귀 — 첫 화면 로드 · 헤더 Overview 첫 탭 · 콘솔 0", not aerr and ap.evaluate("document.querySelector('.wb-nav1 a').textContent") == "Overview", aerr)
        ap.context.browser.close()

    # ── Z 모바일 375 ─────────────────────────────────────────────────
    if run("Z"):
        setmode()
        pg, errs = open_page(pw, w=375, h=812)
        sw = pg.evaluate("[document.documentElement.scrollWidth, window.innerWidth, document.body.scrollWidth]")
        check("Z1 375 모바일 가로 스크롤 0 · 섹션 5 정상 · 콘솔 0", sw[0] <= sw[1] and sw[2] <= sw[1] and set(stats(pg)["sec"].values()) == {"ok"} and not errs, (sw, errs))
        pg.context.browser.close()

print("\nPASS %d / FAIL %d" % (len(PASSES), len(FAILS)))
sys.exit(1 if FAILS else 0)
