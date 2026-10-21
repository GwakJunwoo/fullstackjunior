# -*- coding: utf-8 -*-
"""카나리아 — 복사본 트리에 일부러 고장을 넣고 verify.py 가 실제로 실패하는지(실 worktree 무접촉).
복사본 = 임시 폴더(assets/ · tools/{overview,quant-house,dashboard,arb-monitor} · netlify.toml · index.html)
서버 :8776 이 그 트리를 서빙(devserver.py · 백엔드 프록시는 같은 :8001) · VERIFY_ONLY = 그 섹션만."""
import os
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

SP = Path(__file__).resolve().parent
WT = SP.parents[2]                                  # 저장소 루트(실 트리는 읽기만)
TREE = Path(tempfile.mkdtemp(prefix="ov_canary_")) / "tree"
PY = sys.executable                                 # playwright 가 깔린 파이썬으로 실행
PORT = 8776
JS, IX = "assets/js/wb-overview.js", "tools/overview/index.html"


def move_s3_after_s4(s):   # 섹션 순서 바꿈: ③ 차익거래 블록을 ⑤ 앞으로
    a, b = s.index("  <!-- ③ 차익거래 모니터 요약 -->"), s.index("  <!-- ④ 주간 리뷰 요약")
    blk = s[a:b]
    s = s[:a] + s[b:]
    c = s.index("  <!-- ⑤ 금리 대시보드 핵심 -->")
    return s[:c] + blk + s[c:]


MUT = [   # (이름, 파일, 원문 | 함수, 고장, 잡아야 할 검사 첫 토큰, VERIFY_ONLY)
    ("C1 타일 = 마지막 관측점(D 무시 · 오늘 예비호가 섞임)", JS, "      var vD = val(R, key, D);",
     "      var vD = (function () { var a = Array.from(R.sm[key].values()).filter(function (v) { return v != null; }); return a.length ? a[a.length - 1] : null; })();",
     "T-intraday-tile", "T"),
    ("C2 확정 종가 완전성 가드 제거(커브 몇 줄이라도 종가로)", JS, "if (got === d && n >= MIN_CURVE_ROWS) ok.push", "if (n > 0) ok.push", "T-prelim-D", "T"),
    ("C3 1일 변화 반올림 2자리", JS, "function fmtBp(v) { return v == null ? '–' : (v > 0 ? '+' : '') + v.toFixed(1); }",
     "function fmtBp(v) { return v == null ? '–' : (v > 0 ? '+' : '') + v.toFixed(2); }", "V1", "V"),
    ("C4 3일 창 = D vs D−2", JS, "var dl = R.dl, D = dl[0], D1 = dl[1], D3 = dl[3];", "var dl = R.dl, D = dl[0], D1 = dl[1], D3 = dl[2];", "V1", "V"),
    ("C5 막대 3일 누적 = D vs D−2", JS, "return dl[3] ? bpChg(val(R, t[0], dl[0]), val(R, t[0], dl[3])) : null;",
     "return dl[3] ? bpChg(val(R, t[0], dl[0]), val(R, t[0], dl[2])) : null;", "V2", "V"),
    ("C6 변화 부호 뒤집기(대시보드와 반대)", JS, "function bpChg(a, b) { return (a != null && b != null) ? (a - b) * 100 : null; }",
     "function bpChg(a, b) { return (a != null && b != null) ? (b - a) * 100 : null; }", "K1", "K"),
    ("C7 모니터 U 재반올림(1자리)", JS, "kv('U · 매도 좌표', sgn(b.U, 2), '전')", "kv('U · 매도 좌표', sgn(b.U, 1), '전')", "M2", "M"),
    ("C8 정직 라벨 일부만", JS, "lb.honesty.map(function (s) {", "lb.honesty.slice(0, 3).map(function (s) {", "M7", "M"),
    ("C9 리뷰 폴백 표 = 고급 보기와 다른 숫자 모양", JS, "'</td><td class=\"num\">' + advFmt(c.now) +", "'</td><td class=\"num\">' + raw(c.now) +", "R4", "R"),
    ("C10 섹션 순서 ③↔④", IX, move_s3_after_s4, None, "O1", "O"),
    ("C11 실패 칸에 탭 링크 없음", JS, "(href ? ' <a href=\"' + href + '\">→ ' + esc(label) + ' 열기</a>' : '')", "''", "F-board", "F"),
    ("C12 섹션 의존(금리 실패 → 차익거래도 멈춤)", JS, "Promise.allSettled([ratesP, sectionArb(),",
     "Promise.allSettled([ratesP, ratesP.then(function () { if (STATS.sec.s1 !== 'ok') throw new Error('dep'); return sectionArb(); }),", "F-series", "F"),
    ("C13 루트 리다이렉트 = 옛 차익거래 모니터", "netlify.toml", 'from   = "/"\n  to     = "/tools/overview/"', 'from   = "/"\n  to     = "/tools/arb-monitor/"', "N4", "N"),
    ("C14 첫 화면 밀림(① 막대 높이 키움)", IX, "    .ov-chart--bars { height: 214px; }", "    .ov-chart--bars { height: 900px; }", "O2", "O"),
]


def fresh():
    if TREE.exists():
        shutil.rmtree(TREE)
    for sub in ("assets", "tools/overview", "tools/quant-house", "tools/dashboard", "tools/arb-monitor"):
        shutil.copytree(WT / sub, TREE / sub, ignore=shutil.ignore_patterns("__pycache__"))
    for f in ("netlify.toml", "index.html"):
        shutil.copy2(WT / f, TREE / f)


fresh()
srv = subprocess.Popen([sys.executable, "-B", str(SP / "devserver.py"), str(PORT), str(TREE)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1.5)
    env0 = dict(os.environ, OV_BASE="http://127.0.0.1:%d" % PORT, OV_REPO=str(TREE), PYTHONIOENCODING="utf-8")
    res = []
    for name, rel, a, b, want, only in MUT:
        fresh()
        f = TREE / rel
        s = f.read_text(encoding="utf-8")
        if callable(a):
            s2 = a(s)
        else:
            assert s.count(a) == 1, (name, s.count(a))
            s2 = s.replace(a, b)
        assert s2 != s, name
        f.write_text(s2, encoding="utf-8", newline="\n")
        out = subprocess.run([PY, "-B", str(SP / "verify.py")], env=dict(env0, VERIFY_ONLY=only), capture_output=True, text=True, encoding="utf-8", errors="replace").stdout
        fails = [ln.split()[1] for ln in out.splitlines() if ln.startswith("FAIL")]
        bit = want in fails
        res.append((name, want, bit, fails))
        print(("BITE  " if bit else "MISS  ") + name + "  expect " + want + "  fails=" + ",".join(fails), flush=True)
    print("\ncanary %d/%d bite" % (sum(1 for r in res if r[2]), len(res)))
finally:
    srv.terminate()
    shutil.rmtree(TREE.parent, ignore_errors=True)
