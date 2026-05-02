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

echo [3/4] Loading ngrok authtoken from .env...
for /f "tokens=1,2 delims==" %%A in (.env) do (
    if "%%A"=="ngrok_auth_token" set NGROK_TOKEN=%%B
)
if "%NGROK_TOKEN%"=="" (
    echo ERROR: ngrok_auth_token not found in .env
    pause
    exit /b 1
)
ngrok config add-authtoken %NGROK_TOKEN%

echo [4/4] Starting FastAPI server on port 8000...
start "FastAPI :8000" cmd /k "python -m uvicorn main:app --reload --port 8000"
timeout /t 2 >nul

echo Starting ngrok...
ngrok http --domain=anaconda-implosion-decipher.ngrok-free.dev 8000
pause
