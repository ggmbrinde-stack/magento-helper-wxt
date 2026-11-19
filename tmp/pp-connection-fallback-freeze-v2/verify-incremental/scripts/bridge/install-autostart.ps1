# Registers a logon task that keeps the opencode bridge running, then starts it.
# Run once. start-bridge.ps1 owns the server password (persisted in
# %LOCALAPPDATA%\BOG\bridge-password.txt) and passes it to the process, so the
# task does not depend on OPENCODE_SERVER_PASSWORD being set in the user profile.
[CmdletBinding()]
param(
  [string]$TaskName = 'BOG Model Bridge',
  [int]$Port = 4096
)

$ErrorActionPreference = 'Stop'

$scriptPath = Join-Path $PSScriptRoot 'start-bridge.ps1'
if (-not (Test-Path -LiteralPath $scriptPath)) {
  throw "start-bridge.ps1 not found next to this script."
}

$arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`" -Port $Port"
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive `
  -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Principal $principal `
  -Settings $settings `
  -Description 'Keeps the local opencode serve bridge up for BOG Helper model scoring.' `
  -Force | Out-Null

Write-Host "Registered logon task '$TaskName'."

& $scriptPath -Port $Port
