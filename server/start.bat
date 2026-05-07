@echo off
cd /d %~dp0

echo [1/4] Checking Python...
python --version
if errorlevel 1 (
    echo ERROR: Python not found. Install from https://python.org
    pause
    exit /b 1
)

echo [2/4] Installing packages...
python -m pip install -r requirements.txt -q
if errorlevel 1 (
    echo ERROR: pip install failed
    pause
    exit /b 1
)

echo [3/4] Checking cloudflared.exe...
if not exist cloudflared.exe (
    echo ERROR: cloudflared.exe not found in server folder.
    echo Download: https://github.com/cloudflare/cloudflared/releases/latest
    pause
    exit /b 1
)

echo [4/4] Starting FastAPI server on port 8000...
start "FastAPI :8000" cmd /k "python -m uvicorn main:app --reload --port 8000"
timeout /t 3 >nul

echo Starting Cloudflare Quick Tunnel + auto api_base sync...
python start_tunnel.py
pause
