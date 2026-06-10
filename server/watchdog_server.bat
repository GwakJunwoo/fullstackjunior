@echo off
setlocal
REM Watchdog: FastAPI :8001 health probe + auto-restart.
REM NOT registered as a scheduled task yet -- registration is a user decision.
REM
REM HARD RULES (same as warm_beta_cache.bat, 2026-06-10 postmortem):
REM   ASCII only / CRLF only / no top-level pipes with !VAR!.
REM
REM Design notes:
REM   - /health returns HTTP 200 even when DB is down (body status:error),
REM     so this probes SERVER-PROCESS responsiveness only, by design.
REM   - probe max-time 15s: /health does a sync MySQL SELECT 1 and the DB
REM     handshake intermittently takes ~5s (observed 4.6s). Short probes
REM     false-negative -- that was the 2026-06-10 11:22 "zombie" mystery.
REM   - double probe with 10s gap before declaring death (transient guard).
REM   - cloudflared is NOT auto-restarted: Quick Tunnel restart changes the
REM     public URL and forces api_base.txt git push (user decision).
REM     Tunnel-down is logged as WARNING only.
REM   - restart uses start.bat's module/port (uvicorn main:app --port 8001)
REM     minus --reload, which is wrong for unattended operation.

cd /d "C:\Users\infomax\Desktop\fullstackjunior\server"
set "LOGFILE=watchdog_server.log"

REM 1) probe :8001
curl -fsS --max-time 15 http://localhost:8001/health >nul 2>&1
if not errorlevel 1 goto tunnel_check

REM 2) retry once after 10s
timeout /t 10 /nobreak >nul
curl -fsS --max-time 15 http://localhost:8001/health >nul 2>&1
if not errorlevel 1 goto tunnel_check

echo [%date% %time%] health FAILED twice - restarting uvicorn :8001 >> "%LOGFILE%"

REM 3) kill whatever owns :8001 (zombie listener case)
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8001 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" >nul 2>&1
timeout /t 3 /nobreak >nul

REM 4) start server
start "FastAPI :8001 (watchdog)" /min cmd /c "cd /d C:\Users\infomax\Desktop\fullstackjunior\server && python -m uvicorn main:app --port 8001 >> uvicorn_watchdog.log 2>&1"
timeout /t 20 /nobreak >nul

REM 5) verify restart
curl -fsS --max-time 15 http://localhost:8001/health >nul 2>&1
if not errorlevel 1 (
    echo [%date% %time%] restart OK - /health responding >> "%LOGFILE%"
) else (
    echo [%date% %time%] restart FAILED - /health still down, manual action needed >> "%LOGFILE%"
)

:tunnel_check
REM cloudflared presence check (powershell, no pipe). Warning only.
powershell -NoProfile -Command "if (Get-Process cloudflared -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo [%date% %time%] WARNING cloudflared not running - web cannot reach backend. Manual: start.bat or python start_tunnel.py (changes URL, needs api_base push) >> "%LOGFILE%"
)

endlocal
exit /b 0
