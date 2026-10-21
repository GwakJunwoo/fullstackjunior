# -*- coding: utf-8 -*-
"""카나리아 — 복사본 트리에 일부러 고장을 넣고 verify.py 가 실제로 실패하는지(실 worktree 무접촉).
복사본 = 임시 폴더(assets/ + tools/quant-house/) · 서버 :8766 이 그 트리를 서빙 · 픽스처 = verify.py 와 같은 $RVP_FX."""
import os
import shutil
import subprocess
import sys
from pathlib import Path

import tempfile
SP = Path(__file__).resolve().parent
WT = SP.parents[2]                                  # 저장소 루트(실 트리는 읽기만)
TREE = Path(tempfile.mkdtemp(prefix="rvp_canary_")) / "tree"
PY = sys.executable                                 # playwright 가 깔린 파이썬으로 실행

JS, IX = "assets/js/wb-review-plain.js", "tools/quant-house/index.html"
CSS = "assets/css/wb-review-plain.css"   # 일반 보기 CSS(2026-10-21 Overview 공유 위해 index.html 인라인에서 분리)
MUT = [   # (이름, 파일, 원문, 고장, 잡아야 할 검사) — 검사 글자 첫 자 = verify 섹션(VERIFY_ONLY 로 그 섹션만)
    ("M1 테너 색 뒤집기(+파랑)", JS,
     "var side = r.ref ? 'ref' : sg > 0 ? 'up' : sg < 0 ? 'down' : 'zero';",
     "var side = r.ref ? 'ref' : sg > 0 ? 'down' : sg < 0 ? 'up' : 'zero';", "A12"),
    ("M2 엔진 *_text 무시(웹 숫자 직접)", JS,
     "function tx(o, key, v, d, signed) { var t = o ? o[key] : null; return (typeof t === 'string' && t.trim()) ? t : nfix(v, d, signed); }",
     "function tx(o, key, v, d, signed) { return nfix(v, d, signed); }", "A22"),
    ("M3 일반 보기 라벨에 금지어", JS, "var KICK = ['금리', '커브', '싼·비싼'];", "var KICK = ['금리', '커브', 'cheap'];", "A2"),
    ("M4 결론 문장 웹 가공", JS, "<span class=\"rvp-l\">' + esc(h) + '</span></li>'",
     "<span class=\"rvp-l\">' + esc(String(h).replace('—', '-')) + '</span></li>'", "A3"),
    ("M5 종목 '당일 순위' 수선 되돌림", IX,
     "(isBond?'<span title=\"당일 유동 국고 종목 사이 순위(1 = 가장 쌈) — 1년 백분위 아님\">당일 순위</span>':'%ile1y')", "'%ile1y'", "B5"),
    ("M6 plain 없음 빈 상태 문구 누락", JS,
     "host.innerHTML = '<div class=\"wb-card rvp-empty\" id=\"rvp-head\">' + empty('일반 보기 준비 중',",
     "host.innerHTML = '<div class=\"wb-card rvp-empty\" id=\"rvp-head\">' + empty('',", "C1"),
    ("M7 빈 줄에 웹 추정 문구", JS, "'<div class=\"rvp-lane-empty\" aria-label=\"카드 없음\">—</div>'",
     "'<div class=\"rvp-lane-empty\">해당 없음</div>'", "L3"),
    ("M8 웹 반올림(toFixed) 복귀", JS, "var t = n.toFixed(d), s = (Number(t) === n) ? t : String(n);", "var t = n.toFixed(d), s = t;", "H4"),
    ("M9 모르는 배지 = 빨강", CSS,
     "white-space: nowrap; color: var(--wb-muted); border: 1px solid var(--wb-rule-strong); border-radius: var(--wb-r-ctl); }   /* 기본 = 중립",
     "white-space: nowrap; color: var(--wb-up); border: 1px solid var(--wb-rule-strong); border-radius: var(--wb-r-ctl); }   /* 기본 = 중립", "H1"),
    ("M10 spark_ref.to 검사 제거", JS, "if (ref.to && dates[dates.length - 1] !== ref.to) return null;", "", "H2"),
    ("M11 참조 스텁 무시", JS, "return it.stub ? stubCard(it, items) : noteCard(it, snap, legacy);",
     "return it.stub ? '' : noteCard(it, snap, legacy);", "A25"),
    ("M12 보류 사유를 행마다 화면에 반복", JS, "(wy && i === whyShow ? '<span class=\"rvp-trust-why\">'", "(wy ? '<span class=\"rvp-trust-why\">'", "A15"),
    ("M27 subtitle 없을 때 첫 보류 행 사유 누락", JS, "if (!sub) rows.forEach(function (r, i) { if (whyShow < 0 && why(r)) whyShow = i; });", "", "H10"),
    ("M28 헤더 ? 라벨 중복 복귀", JS, "var help = helpHtml([df.mr, df.momentum, labelTip, noteTip,", "var help = helpHtml([df.mr, df.momentum, t.baseline_label, noteTip,", "A17b"),
    ("M13 엔진 subtitle 미표시", JS, "    var sub = str(t.subtitle);", "    var sub = null;", "A17"),
    ("M14 50% 눈금을 모든 행에", JS, "(base != null && !caution ?", "(base != null ?", "A16"),
    ("M15 고급 종목 행 확신 라벨 복귀", IX,
     "(isBond ? (bDisp ? '<span class=\"rv-conf rc-bond\">'+_esc(bDisp)+'</span>' : '') : _rvConf(p))", "_rvConf(p)", "B7"),
    ("M16 옛 계약 종목 카드 확신 배지 노출", JS, "if (bond && BOND_CONF_KEYS[bk]) {", "if (false) {", "L1"),
    ("M17 badge_display 무시", IX,
     "const bDisp=(bdRaw&&typeof bdRaw==='object') ? (bdRaw.text||null) : (typeof bdRaw==='string' ? bdRaw : null);", "const bDisp=null;", "B7"),
    ("M18 plain 없음 폴백 제거", JS,
     "if (!usable && S.view === 'plain') { setView('adv', { scrollTop: false }); S.autoFb = true; }", "if (false) { }", "C0"),
    ("M19 폴백이 기억값을 덮어씀", JS,
     "if (!usable && S.view === 'plain') { setView('adv', { scrollTop: false }); S.autoFb = true; }",
     "if (!usable && S.view === 'plain') { storeView('adv'); setView('adv', { scrollTop: false }); S.autoFb = true; }", "X1"),
    ("M20 고급 'track' 행 필터 제거", IX, "k!=='week_ago_date'&&cm[k]&&typeof cm[k]==='object';", "k!=='week_ago_date';", "B8"),
    ("M21 커브 추이 = 126일 spread_history 로 되돌림", JS, "var s = r ? series(snap, r.spark_ref) : null;",
     "var s = r ? series(snap, { src: 'spread_history', key: r.series, to: snap && snap.asof }) : null;", "A19"),
    ("M22 테너 축 = 웹 값(엔진 scale 무시)", JS, "var m = Math.max(num(sc.axis_abs_max) || 0, mx) || 1;", "var m = mx * 1.08 || 1;", "A13"),
    ("M23 종목 배지 주석을 화면 글자로", JS,
     "'</span>' + bh + '</div><div class=\"rvp-lanes\">'",
     "'</span>' + bh + '</div>' + (bk === 'bond_rv' ? '<div>' + esc(nc.bond_badge_note) + '</div>' : '') + '<div class=\"rvp-lanes\">'", "A8"),
    ("M24 옛 이름(resid_change_bp)으로 사실 줄 만들기", JS,
     "(str(it.fact) ? '<div class=\"rvp-fact\">' + esc(it.fact) + '</div>' : '')",
     "(str(it.fact) || it.resid_change_bp != null ? '<div class=\"rvp-fact\">' + esc(it.fact || ('잔차 주간 ' + it.resid_change_bp)) + '</div>' : '')", "H7"),
    ("M25 카드 강조 한 장 규칙 깨짐(종목만 해제)", JS,
     "doc.querySelectorAll('#rvp-notable .rvp-note'), function (el) {   // 강조는 한 장만",
     "doc.querySelectorAll('#rvp-notable .rvp-note[data-kind=\"bond\"]'), function (el) {   // 강조는 한 장만", "A30"),
    ("M26 note20 툴팁 누락", JS, "    var help = helpHtml([c.ref_note, str(c.note20),", "    var help = helpHtml([c.ref_note,", "A14"),
]


def fresh():
    if TREE.exists():
        shutil.rmtree(TREE)
    for sub in ("assets", "tools/quant-house"):
        shutil.copytree(WT / sub, TREE / sub)


fresh()
srv = subprocess.Popen([sys.executable, "-B", str(SP / "devserver.py"), "8766", str(TREE)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    import time
    time.sleep(1.5)
    env0 = dict(os.environ, VERIFY_BASE="http://127.0.0.1:8766", PYTHONIOENCODING="utf-8")
    res = []
    for name, rel, a, b, want in MUT:
        fresh()
        f = TREE / rel
        s = f.read_text(encoding="utf-8")
        assert s.count(a) == 1, (name, s.count(a))
        f.write_text(s.replace(a, b), encoding="utf-8", newline="\n")
        env = dict(env0, VERIFY_ONLY=want[0])   # 그 섹션만
        out = subprocess.run([PY, "-B", str(SP / "verify.py")], env=env, capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
        fails = [ln.split()[1] for ln in out.splitlines() if ln.startswith("FAIL")]
        bit = want in fails
        res.append((name, want, bit, fails))
        print(("BITE  " if bit else "MISS  ") + name + "  expect " + want + "  fails=" + ",".join(fails), flush=True)
    print("\ncanary %d/%d bite" % (sum(1 for r in res if r[2]), len(res)))
finally:
    srv.terminate()
    shutil.rmtree(TREE.parent, ignore_errors=True)
