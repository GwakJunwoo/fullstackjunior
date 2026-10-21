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

MUT = [
    ("M1 테너 색 뒤집기(+파랑)", "assets/js/wb-review-plain.js",
     "var side = r.ref ? 'ref' : sg > 0 ? 'up' : sg < 0 ? 'down' : 'zero';",
     "var side = r.ref ? 'ref' : sg > 0 ? 'down' : sg < 0 ? 'up' : 'zero';", "A12"),
    ("M2 기준선 주의 원문 화면 글자 누락", "assets/js/wb-review-plain.js",
     "        anyCaution && str(t.baseline_note) ?", "        false && str(t.baseline_note) ?", "A14"),
    ("M13 엔진 subtitle 미표시", "assets/js/wb-review-plain.js",
     "    var sub = str(t.subtitle);", "    var sub = null;", "W5"),
    ("M14 50% 눈금을 모든 행에", "assets/js/wb-review-plain.js",
     "(base != null && !caution ?", "(base != null ?", "A14"),
    ("M7 빈 줄에 웹 추정 문구", "assets/js/wb-review-plain.js",
     "'<div class=\"rvp-lane-empty\" aria-label=\"카드 없음\">—</div>'", "'<div class=\"rvp-lane-empty\">해당 없음</div>'", "A22"),
    ("M8 웹 반올림(toFixed) 복귀", "assets/js/wb-review-plain.js",
     "var t = n.toFixed(d), s = (Number(t) === n) ? t : String(n);", "var t = n.toFixed(d), s = t;", "A23"),
    ("M9 모르는 배지 = 빨강", "tools/quant-house/index.html",
     "white-space: nowrap; color: var(--wb-muted); border: 1px solid var(--wb-rule-strong); border-radius: var(--wb-r-ctl); }   /* 기본 = 중립",
     "white-space: nowrap; color: var(--wb-up); border: 1px solid var(--wb-rule-strong); border-radius: var(--wb-r-ctl); }   /* 기본 = 중립", "H2"),
    ("M10 spark_ref.to 검사 제거", "assets/js/wb-review-plain.js",
     "if (ref.to && dates[dates.length - 1] !== ref.to) return null;", "", "H7"),
    ("M11 참조 스텁 무시", "assets/js/wb-review-plain.js",
     "return it.stub ? stubCard(it, items) : noteCard(it, snap, legacy);", "return it.stub ? '' : noteCard(it, snap, legacy);", "H3"),
    ("M12 판정 보류 사유를 툴팁으로", "assets/js/wb-review-plain.js",
     "(wy ? '<span class=\"rvp-trust-why\">' + esc(wy) + '</span>' : '')", "helpHtml([wy])", "H5"),
    ("M15 고급 종목 행 확신 라벨 복귀", "tools/quant-house/index.html",
     "(isBond ? (bDisp ? '<span class=\"rv-conf rc-bond\">'+_esc(bDisp)+'</span>' : '') : _rvConf(p))", "_rvConf(p)", "B7"),
    ("M16 일반 종목 카드 옛 확신 배지 노출", "assets/js/wb-review-plain.js",
     "if (bond && BOND_CONF_KEYS[bk]) {", "if (false) {", "A5"),
    ("M17 badge_display 무시", "tools/quant-house/index.html",
     "const bDisp=isBond ? (p.badge_display!=null ? p.badge_display : st.badge_display) : null;", "const bDisp=null;", "H11"),
    ("M3 일반 보기 라벨에 금지어", "assets/js/wb-review-plain.js",
     "var KICK = ['금리', '커브', '싼·비싼'];", "var KICK = ['금리', '커브', 'cheap'];", "A2"),
    ("M4 결론 문장 웹 가공", "assets/js/wb-review-plain.js",
     "<span class=\"rvp-l\">' + esc(h) + '</span></li>'", "<span class=\"rvp-l\">' + esc(String(h).replace('—', '-')) + '</span></li>'", "A3"),
    ("M5 종목 '당일 순위' 수선 되돌림", "tools/quant-house/index.html",
     "(isBond?'<span title=\"당일 유동 국고 종목 사이 순위(1 = 가장 쌈) — 1년 백분위 아님\">당일 순위</span>':'%ile1y')", "'%ile1y'", "B5"),
    ("M6 plain 없음인데 빈 상태 대신 빈 화면", "assets/js/wb-review-plain.js",
     "host.innerHTML = '<div class=\"wb-card rvp-empty\" id=\"rvp-head\">' + empty('일반 보기 준비 중',",
     "host.innerHTML = '<div class=\"wb-card rvp-empty\" id=\"rvp-head\">' + empty('',", "C1"),
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
    env = dict(os.environ, VERIFY_BASE="http://127.0.0.1:8766", PYTHONIOENCODING="utf-8")
    res = []
    for name, rel, a, b, want in MUT:
        fresh()
        f = TREE / rel
        s = f.read_text(encoding="utf-8")
        assert s.count(a) == 1, (name, s.count(a))
        f.write_text(s.replace(a, b), encoding="utf-8", newline="\n")
        out = subprocess.run([PY, "-B", str(SP / "verify.py")], env=env, capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
        fails = [ln.split()[1] for ln in out.splitlines() if ln.startswith("FAIL")]
        bit = want in fails
        res.append((name, want, bit, fails))
        print(("BITE  " if bit else "MISS  ") + name + "  expect " + want + "  fails=" + ",".join(fails), flush=True)
    print("\ncanary %d/%d bite" % (sum(1 for r in res if r[2]), len(res)))
finally:
    srv.terminate()
    shutil.rmtree(TREE.parent, ignore_errors=True)
