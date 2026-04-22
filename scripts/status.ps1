$ErrorActionPreference = "SilentlyContinue"

function Get-PortState {
  param([int]$Port)
  $conn = Get-NetTCPConnection -LocalPort $Port -State Listen
  if ($conn) {
    return "LISTEN (PID $($conn[0].OwningProcess))"
  }
  return "FREE"
}

function Get-HealthyBaseUrl {
  param([string[]]$Candidates)

  foreach ($candidate in $Candidates) {
    try {
      $health = Invoke-WebRequest -Uri "$candidate/api/health" -UseBasicParsing -TimeoutSec 3
      if ($health.StatusCode -eq 200) {
        return $candidate
      }
    } catch {
      # ignore and continue
    }
  }

  return ""
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$devPortFile = Join-Path $projectRoot ".dev-port"

foreach ($port in 3000..3010) {
  Write-Output "APP ${port}: $(Get-PortState -Port $port)"
}

$candidates = @()

if (Test-Path $devPortFile) {
  $savedPortRaw = (Get-Content -Path $devPortFile -Raw).Trim()
  if ($savedPortRaw -match '^\d+$') {
    $candidates += "https://localhost:$savedPortRaw"
    $candidates += "https://127.0.0.1:$savedPortRaw"
    $candidates += "http://localhost:$savedPortRaw"
    $candidates += "http://127.0.0.1:$savedPortRaw"
  }
}

foreach ($port in 3000..3010) {
  $candidates += "https://localhost:$port"
  $candidates += "https://127.0.0.1:$port"
  $candidates += "http://localhost:$port"
  $candidates += "http://127.0.0.1:$port"
}

$uniqueCandidates = $candidates | Select-Object -Unique
$healthyBaseUrl = Get-HealthyBaseUrl -Candidates $uniqueCandidates

if ($healthyBaseUrl) {
  Write-Output "HEALTH: 200 ($healthyBaseUrl)"
} else {
  Write-Output "HEALTH: DOWN"
}
