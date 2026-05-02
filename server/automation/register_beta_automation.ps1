# Usage: powershell -ExecutionPolicy Bypass -File .\server\automation\register_beta_automation.ps1

$ErrorActionPreference = "Stop"

$taskName = "FullstackJunior-Beta-Daily-9AM"
$scriptPath = "C:\Users\USER\OneDrive\Desktop\fullstackjunior\server\automation\beta_daily_refresh.ps1"

if (-not (Test-Path $scriptPath)) {
    throw "Script not found: $scriptPath"
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`""
$trigger = New-ScheduledTaskTrigger -Daily -At 9:00AM
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -StartWhenAvailable -DontStopIfGoingOnBatteries

try {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue | Out-Null
} catch {}

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Description "Run Beta Trading refresh daily at 09:00 local time (KST target)." | Out-Null
Write-Output "Scheduled task registered: $taskName"
