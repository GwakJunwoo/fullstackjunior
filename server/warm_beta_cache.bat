@echo off
REM Warm FastAPI /beta/snapshot cache (scheduled task wrapper)
REM Runs at 09:00. Skips silently if FastAPI is not reachable.
cd /d "C:\Users\infomax\Desktop\fullstackjunior\server"

set LOGFILE=warm_beta_cache.log

echo. >> "%LOGFILE%"
echo ============================================================ >> "%LOGFILE%"
echo [%date% %time%] warm_beta_cache start >> "%LOGFILE%"
echo ============================================================ >> "%LOGFILE%"

REM Probe FastAPI (5s timeout)
curl -fsS --max-time 5 http://localhost:8000/health >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [%date% %time%] FastAPI on :8000 unreachable - skip >> "%LOGFILE%"
    exit /b 0
)

REM Warm /beta/snapshot (allow up to 90s for first compute)
echo [%date% %time%] warming /beta/snapshot ... >> "%LOGFILE%"
curl -fsS --max-time 90 http://localhost:8000/beta/snapshot 1>> "%LOGFILE%" 2>&1
set RC=%ERRORLEVEL%

echo. >> "%LOGFILE%"
echo [%date% %time%] warm_beta_cache done (exit=%RC%) >> "%LOGFILE%"
exit /b 0
