param(
  [string]$BaseUrl = "",
  [string]$CronSecret = "",
  [int]$TimeoutSec = 30
)

$ErrorActionPreference = "Stop"

function Import-DotEnvFiles {
  $projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
  $envFiles = @(
    (Join-Path $projectRoot ".env.local"),
    (Join-Path $projectRoot ".env")
  )

  foreach ($envFile in $envFiles) {
    if (-not (Test-Path $envFile)) { continue }

    foreach ($rawLine in (Get-Content -Path $envFile)) {
      $line = [string]$rawLine
      if ([string]::IsNullOrWhiteSpace($line)) { continue }
      $trimmed = $line.Trim()
      if ($trimmed.StartsWith("#")) { continue }

      $idx = $line.IndexOf("=")
      if ($idx -le 0) { continue }

      $key = $line.Substring(0, $idx).Trim()
      if ([string]::IsNullOrWhiteSpace($key)) { continue }

      $current = [Environment]::GetEnvironmentVariable($key, "Process")
      if (-not [string]::IsNullOrWhiteSpace([string]$current)) { continue }

      $value = $line.Substring($idx + 1)
      [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
  }
}

function Get-HealthyBaseUrl {
  param([string[]]$Candidates)

  foreach ($candidate in ($Candidates | Select-Object -Unique)) {
    if ([string]::IsNullOrWhiteSpace($candidate)) {
      continue
    }

    try {
      $health = Invoke-WebRequest -Uri "$candidate/api/health" -UseBasicParsing -TimeoutSec 3
      if ($health.StatusCode -eq 200) {
        return $candidate.TrimEnd('/')
      }
    } catch {
      # ignore and continue
    }
  }

  return ""
}

function Resolve-BaseUrl {
  param([string]$ExplicitBaseUrl)

  if (-not [string]::IsNullOrWhiteSpace($ExplicitBaseUrl)) {
    return $ExplicitBaseUrl.TrimEnd('/')
  }

  if (-not [string]::IsNullOrWhiteSpace([string]$env:BILL_AUTOPAY_BASE_URL)) {
    return ([string]$env:BILL_AUTOPAY_BASE_URL).TrimEnd('/')
  }

  $projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
  $devPortFile = Join-Path $projectRoot ".dev-port"
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

  $localBaseUrl = Get-HealthyBaseUrl -Candidates $candidates
  if (-not [string]::IsNullOrWhiteSpace($localBaseUrl)) {
    return $localBaseUrl
  }

  $fallbackCandidates = @(
    $env:APP_BASE_URL,
    $env:APP_URL
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

  if ($fallbackCandidates.Count -gt 0) {
    return ($fallbackCandidates[0]).TrimEnd('/')
  }

  return ""
}

Import-DotEnvFiles

$resolvedBaseUrl = Resolve-BaseUrl -ExplicitBaseUrl $BaseUrl
if ([string]::IsNullOrWhiteSpace($resolvedBaseUrl)) {
  throw "Unable to resolve Bill AutoPay base URL. Set BILL_AUTOPAY_BASE_URL, APP_BASE_URL, APP_URL, or pass -BaseUrl explicitly."
}

$resolvedSecret = if (-not [string]::IsNullOrWhiteSpace($CronSecret)) {
  $CronSecret.Trim()
} else {
  [string]$env:BILL_AUTOPAY_CRON_SECRET
}

if ([string]::IsNullOrWhiteSpace($resolvedSecret)) {
  throw "Missing BILL_AUTOPAY_CRON_SECRET. Pass -CronSecret or set the environment variable."
}

$endpoint = "$resolvedBaseUrl/api/bill-payments/autopay/process"
Write-Output "Triggering Bill AutoPay processor: $endpoint"

$response = Invoke-RestMethod `
  -Method Post `
  -Uri $endpoint `
  -Headers @{ "x-cron-secret" = $resolvedSecret } `
  -ContentType "application/json" `
  -TimeoutSec $TimeoutSec

if (-not $response.success) {
  $failureJson = $response | ConvertTo-Json -Depth 8
  throw "Bill AutoPay processor returned an unsuccessful response: $failureJson"
}

$response | ConvertTo-Json -Depth 8
