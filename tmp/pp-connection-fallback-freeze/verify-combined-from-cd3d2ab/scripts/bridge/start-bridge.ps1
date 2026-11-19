# Starts the local opencode bridge if it is not already listening.
# Idempotent: safe to run from the logon task and by hand.
#
# The server password is owned by this script, not by the shell: opencode only
# enables basic auth when OPENCODE_SERVER_PASSWORD is present, and a running
# opencode session injects its own random value. Relying on the inherited
# environment therefore produced a server whose password nobody could know.
# The password lives in %LOCALAPPDATA%\BOG\bridge-password.txt (user profile
# only) and is passed explicitly to the server process.
[CmdletBinding()]
param(
  [int]$Port = 4096,
  [string]$BindHost = '127.0.0.1',
  [switch]$CopyPassword
)

$ErrorActionPreference = 'Stop'

$PasswordFile = Join-Path (Join-Path $env:LOCALAPPDATA 'BOG') 'bridge-password.txt'
$ServerUser = 'opencode'

function Get-BridgePassword {
  $dir = Split-Path -Parent $PasswordFile
  if (-not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir | Out-Null
  }
  if (-not (Test-Path -LiteralPath $PasswordFile)) {
    [guid]::NewGuid().ToString('N') |
      Set-Content -LiteralPath $PasswordFile -NoNewline -Encoding ascii
    Write-Host "Created a new bridge password at $PasswordFile"
  }
  $value = (Get-Content -LiteralPath $PasswordFile -Raw).Trim()
  if (-not $value) { throw "Bridge password file is empty: $PasswordFile" }
  return $value
}

function Test-PortOpen {
  param([int]$P)
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $async = $client.BeginConnect('127.0.0.1', $P, $null, $null)
    if ($async.AsyncWaitHandle.WaitOne(400)) {
      $client.EndConnect($async)
      return $true
    }
    return $false
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

function Test-BridgeHealthy {
  param([int]$P, [string]$Password)
  try {
    $pair = [Convert]::ToBase64String(
      [Text.Encoding]::UTF8.GetBytes("${ServerUser}:${Password}")
    )
    $h = Invoke-RestMethod "http://127.0.0.1:$P/global/health" -TimeoutSec 5 `
      -Headers @{ Authorization = "Basic $pair" }
    return ($h.healthy -eq $true)
  } catch {
    return $false
  }
}

$password = Get-BridgePassword

if ($CopyPassword) {
  Set-Clipboard -Value $password
  Write-Host "Bridge password copied to the clipboard. Paste it in Model bridge -> Server password -> Save settings."
}

if (Test-PortOpen -P $Port) {
  if (Test-BridgeHealthy -P $Port -Password $password) {
    Write-Host "Bridge already listening and healthy on port $Port."
    exit 0
  }
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
  $proc = if ($conn) { Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue } else { $null }
  if ($proc -and $proc.ProcessName -eq 'opencode') {
    Write-Host "Existing opencode server on port $Port does not accept the bridge password; restarting it."
    Stop-Process -Id $proc.Id -Force
    for ($i = 0; $i -lt 20 -and (Test-PortOpen -P $Port); $i++) {
      Start-Sleep -Milliseconds 250
    }
  } else {
    throw "Port $Port is already in use by another process. Free it and run this script again."
  }
}

$exe = (Get-Command opencode -ErrorAction SilentlyContinue).Source
if (-not $exe) {
  throw "opencode was not found on PATH. Install the opencode CLI first."
}

Write-Host "Starting opencode serve on $BindHost`:$Port ..."
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $exe
$psi.Arguments = "serve --port $Port --hostname $BindHost"
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true
$psi.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
$psi.WorkingDirectory = $env:USERPROFILE
# Override any OPENCODE_SERVER_PASSWORD inherited from the calling shell.
$psi.EnvironmentVariables['OPENCODE_SERVER_PASSWORD'] = $password
$psi.EnvironmentVariables['OPENCODE_SERVER_USERNAME'] = $ServerUser
[System.Diagnostics.Process]::Start($psi) | Out-Null

for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-BridgeHealthy -P $Port -Password $password) {
    Write-Host "Bridge is healthy on http://127.0.0.1:$Port"
    exit 0
  }
}
throw "Bridge did not become healthy on port $Port within 30s."
