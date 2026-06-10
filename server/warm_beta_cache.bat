@echo off
setlocal
REM Warm FastAPI cache + RV refresh (scheduled task wrapper)
REM Runs at 08:00. Skips silently if FastAPI is not reachable.
REM
REM HARD RULES for this file (learned 2026-06-10, exit 255 postmortem):
REM   - ASCII only. No Korean / no em-dash: cmd reads this file as CP949 and
REM     UTF-8 multibyte lead bytes swallow the newline -> parser crash (255).
REM   - CRLF line endings only. LF-only files break cmd block/label parsing.
REM   - No pipes. Pipe sides run in child cmd without delayed expansion,
REM     so !VAR! is passed literally (this is why as_of never logged).
REM     Use curl -o tempfile + findstr on the file instead.
REM
REM Steps:
REM   1. /health probe (port 8001, fallback to 8000)
REM   2. POST /rv/refresh    -- invalidate RV cache so dashboard picks up new DB rows
REM   3. GET  /beta/snapshot -- warm beta cache (first compute can take 60-90s)
REM   4. GET  /rv/positions  -- confirm as_of updated
REM   5. GET  /ktb/curve-board -- warm benchmark curve/fly z-ranking board

cd /d "C:\Users\infomax\Desktop\fullstackjunior\server"

set "LOGFILE=warm_beta_cache.log"
set "TMPJSON=%TEMP%\warm_beta_cache_resp.tmp"
set "PORT="

echo. >> "%LOGFILE%"
echo ============================================================ >> "%LOGFILE%"
echo [%date% %time%] warm_beta_cache start >> "%LOGFILE%"
echo ============================================================ >> "%LOGFILE%"

REM 1) Probe :8001  (max-time 10: /health does a sync MySQL SELECT 1 and the
REM    DB handshake intermittently takes ~5s, so 5s probes false-negative)
curl -fsS --max-time 10 http://localhost:8001/health >nul 2>&1
if not errorlevel 1 (
    set "PORT=8001"
    goto have_port
)

REM 1b) Fallback :8000
curl -fsS --max-time 10 http://localhost:8000/health >nul 2>&1
if not errorlevel 1 (
    set "PORT=8000"
    goto have_port
)

echo [%date% %time%] FastAPI on :8001 and :8000 both unreachable - skip >> "%LOGFILE%"
exit /b 0

:have_port
echo [%date% %time%] FastAPI reachable on :%PORT% >> "%LOGFILE%"

REM 2) /rv/refresh  -- invalidate RV cache (pull new DB rows)
echo [%date% %time%] POST /rv/refresh ... >> "%LOGFILE%"
curl -fsS --max-time 30 -X POST http://localhost:%PORT%/rv/refresh >> "%LOGFILE%" 2>&1
set "RC_REFRESH=%ERRORLEVEL%"
echo. >> "%LOGFILE%"
echo [%date% %time%]   refresh exit=%RC_REFRESH% >> "%LOGFILE%"

REM 3) Warm /beta/snapshot
echo [%date% %time%] warming /beta/snapshot ... >> "%LOGFILE%"
curl -fsS --max-time 120 http://localhost:%PORT%/beta/snapshot >> "%LOGFILE%" 2>&1
set "RC_BETA=%ERRORLEVEL%"
echo. >> "%LOGFILE%"
echo [%date% %time%]   /beta/snapshot exit=%RC_BETA% >> "%LOGFILE%"

REM 4) Confirm as_of from /rv/positions (temp file, no pipe)
echo [%date% %time%] GET /rv/positions (as_of check) ... >> "%LOGFILE%"
curl -fsS --max-time 30 -o "%TMPJSON%" http://localhost:%PORT%/rv/positions 2>> "%LOGFILE%"
set "RC_POS=%ERRORLEVEL%"
if exist "%TMPJSON%" findstr /C:"as_of" "%TMPJSON%" >> "%LOGFILE%" 2>&1
echo. >> "%LOGFILE%"
echo [%date% %time%]   /rv/positions exit=%RC_POS% >> "%LOGFILE%"

REM 5) Warm /ktb/curve-board (benchmark curve/fly z-ranking, rates dashboard top)
echo [%date% %time%] warming /ktb/curve-board ... >> "%LOGFILE%"
curl -fsS --max-time 60 -o "%TMPJSON%" "http://localhost:%PORT%/ktb/curve-board" 2>> "%LOGFILE%"
set "RC_CURVE=%ERRORLEVEL%"
echo. >> "%LOGFILE%"
echo [%date% %time%]   /ktb/curve-board exit=%RC_CURVE% >> "%LOGFILE%"
del "%TMPJSON%" >nul 2>&1

echo [%date% %time%] warm_beta_cache done (refresh=%RC_REFRESH%, beta=%RC_BETA%, pos=%RC_POS%, curve=%RC_CURVE%) >> "%LOGFILE%"
endlocal
exit /b 0
