# Removes the logon task that keeps the opencode bridge running.
[CmdletBinding()]
param(
  [string]$TaskName = 'BOG Model Bridge'
)

$ErrorActionPreference = 'Stop'

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $task) {
  Write-Host "No task named '$TaskName' is registered."
  exit 0
}

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
Write-Host "Removed '$TaskName'. Any running bridge keeps going until you close it."
