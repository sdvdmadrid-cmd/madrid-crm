$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$projectRootRegex = [Regex]::Escape($projectRoot)
$devPortFile = Join-Path $projectRoot ".dev-port"

$stopped = @()

function Stop-MatchingProcess {
  param(
    [array]$Processes = @(),
    [Parameter(Mandatory = $true)]
    [string]$Tag
  )

  if (-not $Processes) {
    return
  }

  foreach ($proc in $Processes) {
    try {
      Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
      $script:stopped += "${Tag}: PID $($proc.ProcessId)"
    } catch {
      Write-Host "[dev:stop] No se pudo detener PID $($proc.ProcessId): $($_.Exception.Message)"
    }
  }
}

$nextProcesses = Get-CimInstance Win32_Process |
  Where-Object {
    $_.Name -eq "node.exe" -and
    (
      $_.CommandLine -match "server\.js" -or
      $_.CommandLine -match "next (dev|start)" -or
      $_.CommandLine -match "next\\dist\\server\\lib\\start-server\.js"
    ) -and
    $_.CommandLine -match $projectRootRegex
  }

Stop-MatchingProcess -Processes @($nextProcesses) -Tag "next"

$nextPortProcesses = @()
foreach ($port in 3000..3010) {
  $connections = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  foreach ($conn in @($connections)) {
    $proc = Get-CimInstance Win32_Process -Filter "ProcessId = $($conn.OwningProcess)" -ErrorAction SilentlyContinue
    if (
      $proc -and
      $proc.Name -eq "node.exe" -and
      (
        $proc.CommandLine -match "server\.js" -or
        $proc.CommandLine -match "next" -or
        $proc.CommandLine -match "next\\dist\\server\\lib\\start-server\.js"
      )
    ) {
      $nextPortProcesses += $proc
    }
  }
}

if ($nextPortProcesses.Count -gt 0) {
  $uniqueNextPortProcesses = $nextPortProcesses | Sort-Object ProcessId -Unique
  Stop-MatchingProcess -Processes @($uniqueNextPortProcesses) -Tag "next-port"
}

if (Test-Path $devPortFile) {
  Remove-Item -Path $devPortFile -Force -ErrorAction SilentlyContinue
}

if ($stopped.Count -eq 0) {
  Write-Host "[dev:stop] No habia procesos del proyecto para detener."
  exit 0
}

Write-Host "[dev:stop] Procesos detenidos:"
$stopped | ForEach-Object { Write-Host " - $_" }
