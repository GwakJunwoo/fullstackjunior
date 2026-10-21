# -*- coding: utf-8 -*-
"""주간 리뷰 '일반 | 고급' 웹 검증 — 픽스처 준비(운영 코드·BQH 무접촉 · 읽기만).

만드는 것($RVP_FX · 기본 ./_fx — .gitignore):
  snap_w43 / sb_dev      = BQH dated snapshot · scoreboard(plain 포함) 복사
  snap_noplain / sb_noplain = 위에서 plain 만 뺀 것(옛 snapshot·plain 미탑재 라이브와 같은 모양)
  snap_nonstd            = 09-23 dated snapshot + 엔진 build_plain(3영업일 비표준 창 · 범위/추이 없음)
  snap_edge / sb_edge   = 경계 목업(mk_edge.py · [목업] 표식)
  snap_legacy           = 옛 계약 schema 1(BQH git ae87f7dc 의 같은 dated 파일)
  adv_before.txt         = 개편 전 커밋(--base-rev)의 고급 화면 텍스트(W43) — 고급 회귀 비교 기준
usage:
  python prep_fixtures.py [--base-rev 08dd2a3]
  env: QH_ROOT(BQH 경로) · BQH_PY(엔진 import 가능한 파이썬 · 기본 python) · RVP_SNAP / RVP_SB(dated 파일 바꿀 때)
실행 파이썬 = playwright 설치된 것(기준선 렌더용).
"""
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[2]
FX = Path(os.environ.get("RVP_FX", HERE / "_fx"))
QH = Path(os.environ.get("QH_ROOT", r"C:\Users\infomax\Desktop\Bond Quant House"))
R = QH / "05_registry" / "research"
SNAP = os.environ.get("RVP_SNAP", "reviews/_snapshot_2026-10-20.json")
SB = os.environ.get("RVP_SB", "reviews/_scoreboard_dev_2026-10-21.json")
BASE_REV = sys.argv[sys.argv.index("--base-rev") + 1] if "--base-rev" in sys.argv else "08dd2a3"

FX.mkdir(parents=True, exist_ok=True)
shutil.copy(R / SNAP, FX / "snap_w43.json")
shutil.copy(R / SB, FX / "sb_dev.json")
for src, dst in (("snap_w43.json", "snap_noplain.json"), ("sb_dev.json", "sb_noplain.json")):
    d = json.loads((FX / src).read_text(encoding="utf-8"))
    d.pop("plain", None)
    (FX / dst).write_text(json.dumps(d, ensure_ascii=False), encoding="utf-8")

# 비표준 창 — 엔진 build_plain 그대로(BQH 파이썬 · 읽기만)
code = ("import json,sys; sys.path.insert(0,'.'); from engine.research import review_pptx as RP; "
        "d=json.loads(open('05_registry/research/reviews/_snapshot_2026-09-23.json',encoding='utf-8').read()); "
        "d['plain']=RP.build_plain(d); open(sys.argv[1],'w',encoding='utf-8').write(json.dumps(d,ensure_ascii=False))")
subprocess.run([os.environ.get("BQH_PY", "python"), "-B", "-c", code, str(FX / "snap_nonstd.json")], cwd=QH, check=True,
               env=dict(os.environ, PYTHONIOENCODING="utf-8"))
subprocess.run([sys.executable, "-B", str(HERE / "mk_edge.py")], check=True, env=dict(os.environ, RVP_FX=str(FX)))
# 옛 계약(schema 1) — BQH 이력의 W43 dated(ae87f7dc) · 하위 호환 검사용
LEGACY_REV = os.environ.get("RVP_LEGACY_REV", "ae87f7dc")
old = subprocess.run(["git", "show", LEGACY_REV + ":05_registry/research/" + SNAP], cwd=QH, capture_output=True, check=True).stdout
(FX / "snap_legacy.json").write_bytes(old)

# 고급 기준선 — 개편 전 커밋의 페이지로 W43 고급 화면 텍스트
tmp = Path(tempfile.mkdtemp(prefix="rvp_base_"))
tar = subprocess.run(["git", "archive", "--format=tar", BASE_REV, "assets", "tools/quant-house/index.html"], cwd=REPO, capture_output=True, check=True).stdout
tarfile.open(fileobj=io.BytesIO(tar)).extractall(tmp, filter="data")
srv = subprocess.Popen([sys.executable, "-B", str(HERE / "devserver.py"), "8767", str(tmp)], env=dict(os.environ, RVP_FX=str(FX)),
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(1.5)
    urllib.request.urlopen("http://127.0.0.1:8767/__mode/w43").read()
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        b = p.chromium.launch(channel="chrome")
        pg = b.new_page(viewport={"width": 1440, "height": 900})
        pg.goto("http://127.0.0.1:8767/tools/quant-house/#review")
        pg.wait_for_function("document.querySelectorAll('#revBody .cat-title').length > 5", timeout=40000)
        pg.wait_for_timeout(1200)
        (FX / "adv_before.txt").write_text(pg.evaluate("document.getElementById('revBody').innerText"), encoding="utf-8")
        b.close()
finally:
    srv.terminate()
    shutil.rmtree(tmp, ignore_errors=True)
print("fixtures ->", FX, sorted(x.name for x in FX.iterdir()))
