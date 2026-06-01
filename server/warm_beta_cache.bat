@echo off
setlocal EnableDelayedExpansion
REM Warm FastAPI cache + RV refresh (scheduled task wrapper)
REM Runs at 08:00. Skips silently if FastAPI is not reachable.
REM
REM Steps:
REM   1. /health probe (port 8001, fallback to 8000)  -- goto-label, no nested if
REM   2. POST /rv/refresh  -- invalidate RV cache so dashboard picks up new DB rows
REM   3. GET  /beta/snapshot  -- warm beta cache
REM   4. GET  /rv/positions  -- confirm as_of updated

cd /d "C:\Users\infomax\Desktop\fullstackjunior\server"

set "LOGFILE=warm_beta_cache.log"
set "PORT="

echo. >> "%LOGFILE%"
echo ============================================================ >> "%LOGFILE%"
echo [%date% %time%] warm_beta_cache start >> "%LOGFILE%"
echo ============================================================ >> "%LOGFILE%"

REM 1) Probe :8001
curl -fsS --max-time 5 http://localhost:8001/health >nul 2>&1
if !ERRORLEVEL! equ 0 (
    set "PORT=8001"
    goto :have_port
)

REM 1b) Fallback :8000
curl -fsS --max-time 5 http://localhost:8000/health >nul 2>&1
if !ERRORLEVEL! equ 0 (
    set "PORT=8000"
    goto :have_port
)

echo [%date% %time%] FastAPI on :8001 and :8000 both unreachable - skip >> "%LOGFILE%"
endlocal
exit /b 0

:have_port
echo [%date% %time%] FastAPI reachable on :!PORT! >> "%LOGFILE%"

REM 2) /rv/refresh  -- invalidate RV cache (pull new DB rows)
echo [%date% %time%] POST /rv/refresh ... >> "%LOGFILE%"
curl -fsS --max-time 30 -X POST http://localhost:!PORT!/rv/refresh 1>> "%LOGFILE%" 2>&1
set "RC_REFRESH=!ERRORLEVEL!"
echo. >> "%LOGFILE%"
echo [%date% %time%]   refresh exit=!RC_REFRESH! >> "%LOGFILE%"

REM 3) Warm /beta/snapshot (first compute can take 60-90s)
echo [%date% %time%] warming /beta/snapshot ... >> "%LOGFILE%"
curl -fsS --max-time 120 http://localhost:!PORT!/beta/snapshot 1>> "%LOGFILE%" 2>&1
set "RC_BETA=!ERRORLEVEL!"
echo. >> "%LOGFILE%"
echo [%date% %time%]   /beta/snapshot exit=!RC_BETA! >> "%LOGFILE%"

REM 4) Confirm as_of from /rv/positions
echo [%date% %time%] GET /rv/positions (as_of check) ... >> "%LOGFILE%"
curl -fsS --max-time 30 http://localhost:!PORT!/rv/positions 2>> "%LOGFILE%" | findstr /C:"as_of" 1>> "%LOGFILE%" 2>&1
echo. >> "%LOGFILE%"

echo [%date% %time%] warm_beta_cache done (refresh=!RC_REFRESH!, beta=!RC_BETA!) >> "%LOGFILE%"
endlocal
exit /b 0
