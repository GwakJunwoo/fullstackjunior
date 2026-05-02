# Usage: powershell -ExecutionPolicy Bypass -File .\server\automation\beta_daily_refresh.ps1

$ErrorActionPreference = "Stop"

$serverDir = "C:\Users\USER\OneDrive\Desktop\fullstackjunior\server"
$logFile = Join-Path $serverDir "logs\beta-daily.log"
$apiBase = "https://anaconda-implosion-decipher.ngrok-free.dev"

function Write-Log {
    param([string]$msg)
    $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

function Test-Port8000 {
    try {
        $conn = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction Stop
        return ($null -ne $conn)
    } catch {
        return $false
    }
}

function Test-Ngrok {
    $p = Get-Process -Name ngrok -ErrorAction SilentlyContinue
    return ($null -ne $p)
}

function Start-FastApi {
    $cmd = "cd /d `"$serverDir`" & python -m uvicorn main:app --port 8000"
    Start-Process -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList "/c", $cmd | Out-Null
    Write-Log "FastAPI started"
}

function Start-Ngrok {
    $cmd = "cd /d `"$serverDir`" & ngrok http --domain=anaconda-implosion-decipher.ngrok-free.dev 8000"
    Start-Process -WindowStyle Hidden -FilePath "cmd.exe" -ArgumentList "/c", $cmd | Out-Null
    Write-Log "ngrok started"
}

function Warmup-Endpoints {
    $endpoints = @(
        "$apiBase/health",
        "$apiBase/beta/snapshot",
        "$apiBase/beta/rv?limit=10",
        "$apiBase/beta/series?days=365"
    )

    foreach ($url in $endpoints) {
        try {
            Invoke-RestMethod -Uri $url -Method Get -TimeoutSec 20 -Headers @{"ngrok-skip-browser-warning"="1"} | Out-Null
            Write-Log "Warmup OK: $url"
        } catch {
            Write-Log "Warmup FAIL: $url | $($_.Exception.Message)"
        }
    }
}

try {
    Write-Log "===== Daily Beta refresh start ====="

    if (-not (Test-Port8000)) {
        Start-FastApi
        Start-Sleep -Seconds 6
    } else {
        Write-Log "FastAPI already listening on :8000"
    }

    if (-not (Test-Ngrok)) {
        Start-Ngrok
        Start-Sleep -Seconds 8
    } else {
        Write-Log "ngrok already running"
    }

    Warmup-Endpoints
    Write-Log "===== Daily Beta refresh done ====="
} catch {
    Write-Log "FATAL: $($_.Exception.Message)"
    exit 1
}
