[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Command,
    [Parameter(Position = 1)]
    [string[]]$ArgumentList = @()
)

$ErrorActionPreference = 'Stop'
$storePath = Join-Path (Join-Path $env:LOCALAPPDATA 'BOG_Studio') 'notion-readonly-token.dpapi'
if (-not (Test-Path -LiteralPath $storePath -PathType Leaf)) {
    throw "Missing local secret store. Run Set-NotionReadOnlySecret.ps1 first."
}

$secure = Get-Content -Raw -LiteralPath $storePath | ConvertTo-SecureString
$env:NOTION_TOKEN = [System.Net.NetworkCredential]::new('', $secure).Password
try {
    & $Command @ArgumentList
    exit $LASTEXITCODE
}
finally {
    Remove-Item Env:NOTION_TOKEN -ErrorAction SilentlyContinue
}
