param(
  [string]$BackupDir = ".local-secrets/env-backups",
  [string]$Source = "",
  [string]$Target = ".env.local",
  [switch]$List
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $BackupDir)) {
  throw "Backup directory not found: $BackupDir"
}

$backups = Get-ChildItem -LiteralPath $BackupDir -File -Filter ".env.local.*.bak" |
  Sort-Object LastWriteTime -Descending

if ($List) {
  if ($backups.Count -eq 0) {
    Write-Host "No backups found in $BackupDir" -ForegroundColor Yellow
    exit 0
  }

  Write-Host "Available backups:" -ForegroundColor Cyan
  $backups | ForEach-Object {
    Write-Host ("- {0} ({1})" -f $_.Name, $_.LastWriteTime)
  }
  exit 0
}

if ([string]::IsNullOrWhiteSpace($Source)) {
  if ($backups.Count -eq 0) {
    throw "No backups found in $BackupDir"
  }
  $sourcePath = $backups[0].FullName
} else {
  $sourcePath = if ([System.IO.Path]::IsPathRooted($Source)) {
    $Source
  } else {
    Join-Path $BackupDir $Source
  }

  if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw "Backup file not found: $sourcePath"
  }
}

$sourceBytes = [System.IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $sourcePath))
[System.IO.File]::WriteAllBytes($Target, $sourceBytes)

Write-Host "Restored env file from:" -ForegroundColor Green
Write-Host $sourcePath
Write-Host "Target:" -ForegroundColor Green
Write-Host $Target
