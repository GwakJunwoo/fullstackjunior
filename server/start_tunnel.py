"""
Cloudflare Quick Tunnel 시작 + URL 자동 캡처 + assets/api_base.txt 갱신 + git push.

워크플로우:
  1. cloudflared.exe tunnel --url http://localhost:8000  실행
  2. stdout 에서 https://xxx-yyy-zzz.trycloudflare.com URL 추출
  3. assets/api_base.txt 에 한 줄로 저장 (변경됐을 때만)
  4. git add + commit + push  (실패해도 cloudflared 는 계속 실행)
  5. cloudflared 프로세스 유지 — 종료 시 ctrl+c

start.bat 에서 호출됨. 단독 실행도 가능: python start_tunnel.py
"""
from __future__ import annotations

import os
import re
import sys
import time
import subprocess
from pathlib import Path

SERVER_DIR = Path(__file__).resolve().parent
ROOT = SERVER_DIR.parent
ASSET_FILE = ROOT / "assets" / "api_base.txt"
CF_BIN = SERVER_DIR / "cloudflared.exe"
URL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com", re.IGNORECASE)
ERROR_RE = re.compile(r"(error code: 1101|failed to unmarshal quick Tunnel|500 Internal Server Error)", re.IGNORECASE)

DO_GIT_PUSH = os.environ.get("TUNNEL_NO_PUSH", "").lower() not in ("1", "true", "yes")
# Cloudflare Quick Tunnel provisioning 서비스가 가끔 500 던짐 (1101 error code).
# 캐치하면 cloudflared 죽이고 N 회까지 재시도.
MAX_RETRIES = int(os.environ.get("TUNNEL_MAX_RETRIES", "8"))
RETRY_WAIT_SEC = float(os.environ.get("TUNNEL_RETRY_WAIT_SEC", "3"))


def _git(*args, check: bool = False) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=ROOT, check=check,
                          capture_output=True, text=True, encoding="utf-8")


def _push_url(url: str) -> None:
    """assets/api_base.txt 갱신 + git push (변경됐을 때만)."""
    prev = ASSET_FILE.read_text(encoding="utf-8").strip() if ASSET_FILE.exists() else ""
    if prev == url:
        print(f"[skip] api_base.txt 이미 {url}")
        return

    ASSET_FILE.write_text(url, encoding="utf-8")
    print(f"[write] {ASSET_FILE} → {url}")

    if not DO_GIT_PUSH:
        print("[git] TUNNEL_NO_PUSH=1 — push 스킵")
        return

    try:
        rel = ASSET_FILE.relative_to(ROOT).as_posix()
        _git("add", rel, check=True)
        msg = f"auto: tunnel url -> {url.split('://')[-1]}"
        _git("commit", "-m", msg, check=True)
        push = _git("push")
        if push.returncode == 0:
            print(f"[push] OK  ({msg})")
        else:
            print(f"[push] FAIL  rc={push.returncode}")
            print(push.stderr)
    except subprocess.CalledProcessError as e:
        print(f"[git] FAIL: {e.stderr or e}")


def _kill_existing() -> None:
    subprocess.run(["taskkill", "/F", "/IM", "cloudflared.exe"],
                   capture_output=True, text=True)


def _spawn_cloudflared() -> subprocess.Popen:
    return subprocess.Popen(
        [str(CF_BIN), "tunnel", "--url", "http://localhost:8000", "--no-autoupdate"],
        cwd=SERVER_DIR,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        encoding="utf-8",
        errors="replace",
        bufsize=1,
    )


def _terminate(proc: subprocess.Popen) -> None:
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()


def main() -> int:
    if not CF_BIN.exists():
        print(f"[ERROR] cloudflared 바이너리 없음: {CF_BIN}")
        return 2

    _kill_existing()
    time.sleep(1)

    proc: subprocess.Popen | None = None
    try:
        for attempt in range(1, MAX_RETRIES + 1):
            print(f"[start] cloudflared tunnel --url http://localhost:8000  (attempt {attempt}/{MAX_RETRIES})")
            proc = _spawn_cloudflared()
            captured = False
            saw_error = False

            assert proc.stdout is not None
            for line in proc.stdout:
                sys.stdout.write(line)
                sys.stdout.flush()

                if not captured:
                    m = URL_RE.search(line)
                    if m:
                        url = m.group(0)
                        print(f"\n[capture] tunnel URL = {url}\n")
                        _push_url(url)
                        captured = True
                        continue

                if not captured and ERROR_RE.search(line):
                    saw_error = True
                    # cloudflared 가 500 받으면 self-exit 함. break 로 빠져나가서 retry.
                    break

            if captured:
                # 정상 — URL 잡은 상태로 cloudflared 가 데이터 plane 유지.
                # stdout 더 읽어서 사용자에게 보여주기 (terminate 안 함).
                try:
                    for line in proc.stdout:
                        sys.stdout.write(line)
                        sys.stdout.flush()
                except KeyboardInterrupt:
                    print("\n[interrupt] cloudflared 종료 ...")
                _terminate(proc)
                return proc.returncode or 0

            # 실패 — cloudflared 죽이고 잠깐 쉬었다가 재시도
            _terminate(proc)
            proc = None
            if saw_error:
                print(f"[retry] Cloudflare provisioning 500 — {RETRY_WAIT_SEC}s 후 재시도\n")
                time.sleep(RETRY_WAIT_SEC)
            else:
                print("[retry] cloudflared 가 URL 캡처 전 종료 — 재시도\n")
                time.sleep(RETRY_WAIT_SEC)

        print(f"[FAIL] {MAX_RETRIES}회 재시도 후에도 tunnel 실패. Cloudflare 서비스 outage 의심. "
              f"몇 분 후 다시 실행하거나 named tunnel 로 전환 필요.")
        return 3
    except KeyboardInterrupt:
        print("\n[interrupt] 종료 ...")
        if proc:
            _terminate(proc)
        return 0


if __name__ == "__main__":
    sys.exit(main())
