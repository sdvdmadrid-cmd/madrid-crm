param(
  [string]$BaseUrl,
  [string]$CronSecret,
  [string]$ProviderName,
  [int]$Limit = 25,
  [switch]$DryRun,
  [int]$TimeoutSec = 60
)

Set-StrictMode -Version Latest
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

function Resolve-HealthyBaseUrl {
  param([string[]]$Candidates)

  foreach ($candidate in $Candidates) {
    if ([string]::IsNullOrWhiteSpace($candidate)) { continue }

    $url = $candidate.Trim().TrimEnd("/")
    try {
      $health = Invoke-RestMethod -Method Get -Uri "$url/api/health" -TimeoutSec 8
      if ($health -and $health.success -eq $true) {
        return $url
      }
    } catch {
      continue
    }
  }

  return $null
}

function Resolve-BaseUrl {
  param([string]$ExplicitBaseUrl)

  if (-not [string]::IsNullOrWhiteSpace($ExplicitBaseUrl)) {
    return $ExplicitBaseUrl.Trim().TrimEnd("/")
  }

  if (-not [string]::IsNullOrWhiteSpace([string]$env:BILL_REMITTANCE_BASE_URL)) {
    return ([string]$env:BILL_REMITTANCE_BASE_URL).Trim().TrimEnd("/")
  }

  if (-not [string]::IsNullOrWhiteSpace([string]$env:BILL_AUTOPAY_BASE_URL)) {
    return ([string]$env:BILL_AUTOPAY_BASE_URL).Trim().TrimEnd("/")
  }

  $candidates = @(
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  )

  if ($env:PORT) {
    $port = [string]$env:PORT
    $candidates += "https://localhost:$port"
    $candidates += "https://127.0.0.1:$port"
    $candidates += "http://localhost:$port"
    $candidates += "http://127.0.0.1:$port"
  }

  $localBaseUrl = Resolve-HealthyBaseUrl -Candidates $candidates
  if (-not [string]::IsNullOrWhiteSpace($localBaseUrl)) {
    return $localBaseUrl
  }

  $fallbackCandidates = @(
    [string]$env:APP_BASE_URL,
    [string]$env:APP_URL
  ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

  if ($fallbackCandidates.Count -gt 0) {
    return ($fallbackCandidates[0]).Trim().TrimEnd("/")
  }

  return $null
}

Import-DotEnvFiles

$resolvedBaseUrl = Resolve-BaseUrl -ExplicitBaseUrl $BaseUrl
if ([string]::IsNullOrWhiteSpace($resolvedBaseUrl)) {
  throw "Unable to resolve Bill Remittance base URL. Set BILL_REMITTANCE_BASE_URL, BILL_AUTOPAY_BASE_URL, APP_BASE_URL, APP_URL, or pass -BaseUrl explicitly."
}

$resolvedSecret = if (-not [string]::IsNullOrWhiteSpace($CronSecret)) {
  $CronSecret.Trim()
} else {
  [string]$env:BILL_REMITTANCE_CRON_SECRET
}

if ([string]::IsNullOrWhiteSpace($resolvedSecret)) {
  $resolvedSecret = [string]$env:BILL_AUTOPAY_CRON_SECRET
}

if ([string]::IsNullOrWhiteSpace($resolvedSecret)) {
  throw "Missing BILL_REMITTANCE_CRON_SECRET (or BILL_AUTOPAY_CRON_SECRET fallback). Pass -CronSecret or set the environment variable."
}

$endpoint = "$resolvedBaseUrl/api/bill-payments/remittance/process"
Write-Output "Triggering Bill Remittance processor: $endpoint"

$body = @{
  limit = [Math]::Max(1, $Limit)
}

if ($DryRun.IsPresent) {
  $body.dryRun = $true
}

if (-not [string]::IsNullOrWhiteSpace($ProviderName)) {
  $body.providerName = $ProviderName.Trim()
}

$response = Invoke-RestMethod `
  -Method Post `
  -Uri $endpoint `
  -Headers @{ "x-cron-secret" = $resolvedSecret } `
  -ContentType "application/json" `
  -Body ($body | ConvertTo-Json -Depth 5) `
  -TimeoutSec $TimeoutSec

if (-not $response.success) {
  $failureJson = $response | ConvertTo-Json -Depth 8
  throw "Bill Remittance processor returned an unsuccessful response: $failureJson"
}

$response | ConvertTo-Json -Depth 8
