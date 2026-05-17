param(
  [int]$Port = 3000,
  [switch]$NoStart,
  [switch]$ForceKillAnyOnPort
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSScriptRoot

function Get-ProcessCommandLine([int]$ProcessId) {
  try {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId"
    return [string]$proc.CommandLine
  } catch {
    return ""
  }
}

function Stop-DevProcessIfSafe([int]$ProcessId, [string]$Reason) {
  if ($ProcessId -le 0 -or $ProcessId -eq $PID) {
    return
  }

  $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if (-not $proc) {
    return
  }

  $cmd = Get-ProcessCommandLine -ProcessId $ProcessId
  $repoRootWindows = $repoRoot -replace '/', '\'
  $repoRootUnix = $repoRoot -replace '\\', '/'
  $referencesRepo =
    ($cmd -like "*$repoRootWindows*") -or
    ($cmd -like "*$repoRootUnix*")
  $isNextDevCommand =
    ($cmd -like "*next dev*") -or
    ($cmd -like "*next\\dist\\bin\\next*") -or
    ($cmd -like "*next/dist/bin/next*")
  $isRepoScoped =
    $referencesRepo -or
    ($referencesRepo -and $isNextDevCommand)

  if (-not $ForceKillAnyOnPort -and -not $isRepoScoped) {
    Write-Host "Skipping PID $ProcessId on port $Port (not recognized as this repo): $($proc.ProcessName)" -ForegroundColor Yellow
    return
  }

  try {
    Stop-Process -Id $ProcessId -Force -ErrorAction Stop
    Write-Host "Stopped PID $ProcessId ($($proc.ProcessName)) - $Reason" -ForegroundColor Cyan
  } catch {
    Write-Host "Could not stop PID ${ProcessId}: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

$pidCandidates = New-Object System.Collections.Generic.HashSet[int]

$devLogPath = Join-Path $repoRoot ".next/dev/logs/next-development.log"
if (Test-Path $devLogPath) {
  try {
    $recentLog = Get-Content $devLogPath -Tail 120
    foreach ($line in $recentLog) {
      if ($line -match "PID:\s*([0-9]+)") {
        $pidCandidates.Add([int]$Matches[1]) | Out-Null
      }
    }
  } catch {
    Write-Host "Could not parse dev log for stale PID: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

try {
  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
    Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($listenerPid in $listeners) {
    $pidCandidates.Add([int]$listenerPid) | Out-Null
  }
} catch {
  Write-Host "Get-NetTCPConnection unavailable, trying netstat fallback..." -ForegroundColor Yellow
  try {
    $netstat = netstat -ano -p tcp
    foreach ($entry in $netstat) {
      $line = $entry.ToString().Trim()
      if (-not $line) {
        continue
      }

      $parts = ($line -replace "\s+", " ").Split(" ")
      if ($parts.Length -lt 5) {
        continue
      }

      if ($parts[0] -ne "TCP") {
        continue
      }

      $localAddress = $parts[1]
      $state = $parts[3]
      $owningPid = $parts[4]

      if ($state -ne "LISTENING") {
        continue
      }

      if ($localAddress -notmatch ":(\d+)$") {
        continue
      }

      if ([int]$Matches[1] -ne $Port) {
        continue
      }

      if ($owningPid -notmatch "^\d+$") {
        continue
      }

      $pidCandidates.Add([int]$owningPid) | Out-Null
    }
  } catch {
    Write-Host "Could not inspect listeners on port ${Port}: $($_.Exception.Message)" -ForegroundColor Yellow
  }
}

foreach ($candidatePid in $pidCandidates) {
  Stop-DevProcessIfSafe -ProcessId $candidatePid -Reason "Port $Port or stale dev lock"
}

if ($NoStart) {
  Write-Host "Cleanup complete. -NoStart was provided, exiting." -ForegroundColor Green
  exit 0
}

Write-Host "Starting Next.js dev server..." -ForegroundColor Green
npm run dev
exit $LASTEXITCODE
