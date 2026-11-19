[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$storeDir = Join-Path $env:LOCALAPPDATA 'BOG_Studio'
$storePath = Join-Path $storeDir 'notion-readonly-token.dpapi'

New-Item -ItemType Directory -Path $storeDir -Force | Out-Null
$secret = Read-Host 'Enter the Notion read-only integration secret (input is masked)' -AsSecureString
$protected = ConvertFrom-SecureString -SecureString $secret
Set-Content -LiteralPath $storePath -Value $protected -Encoding UTF8 -NoNewline
Write-Output "Saved an encrypted user-bound secret at $storePath"
Write-Output 'The secret value was not printed, logged, or written to the repository.'
