param(
  [string]$Source = ".env.local",
  [string]$BackupDir = ".local-secrets/env-backups"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $Source)) {
  throw "Source env file not found: $Source"
}

if (-not (Test-Path -LiteralPath $BackupDir)) {
  New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$fileName = ".env.local.$timestamp.bak"
$backupPath = Join-Path $BackupDir $fileName
$latestPath = Join-Path $BackupDir ".env.local.latest.bak"

$bytes = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $Source))
[System.IO.File]::WriteAllBytes($backupPath, $bytes)
[System.IO.File]::WriteAllBytes($latestPath, $bytes)

Write-Host "Created backup:" -ForegroundColor Green
Write-Host $backupPath
