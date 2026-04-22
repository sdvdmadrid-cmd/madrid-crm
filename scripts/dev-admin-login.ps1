param(
  [string]$BaseUrl = "",
  [string]$RedirectPath = "/"
)

$ErrorActionPreference = "Stop"

function Test-Health {
  param([string]$Url)
  try {
    $health = Invoke-WebRequest -Uri "$Url/api/health" -UseBasicParsing -TimeoutSec 4
    return $health.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Resolve-BaseUrl {
  param([string]$RequestedBaseUrl)

  if ($RequestedBaseUrl) {
    if (Test-Health -Url $RequestedBaseUrl) { return $RequestedBaseUrl }
    throw "La app no responde en $RequestedBaseUrl"
  }

  $projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
  $devPortFile = Join-Path $projectRoot ".dev-port"

  if (Test-Path $devPortFile) {
    $savedPortRaw = (Get-Content -Path $devPortFile -Raw).Trim()
    if ($savedPortRaw -match '^\d+$') {
      $savedSecureBase = "https://localhost:$savedPortRaw"
      if (Test-Health -Url $savedSecureBase) { return $savedSecureBase }
      $savedSecureBase127 = "https://127.0.0.1:$savedPortRaw"
      if (Test-Health -Url $savedSecureBase127) { return $savedSecureBase127 }

      $savedBase = "http://localhost:$savedPortRaw"
      if (Test-Health -Url $savedBase) { return $savedBase }
      $savedBase127 = "http://127.0.0.1:$savedPortRaw"
      if (Test-Health -Url $savedBase127) { return $savedBase127 }
    }
  }

  foreach ($port in 3000..3010) {
    $candidateSecureLocalhost = "https://localhost:$port"
    if (Test-Health -Url $candidateSecureLocalhost) { return $candidateSecureLocalhost }

    $candidateSecureIpv4 = "https://127.0.0.1:$port"
    if (Test-Health -Url $candidateSecureIpv4) { return $candidateSecureIpv4 }

    $candidateLocalhost = "http://localhost:$port"
    if (Test-Health -Url $candidateLocalhost) { return $candidateLocalhost }

    $candidateIpv4 = "http://127.0.0.1:$port"
    if (Test-Health -Url $candidateIpv4) { return $candidateIpv4 }
  }

  return ""
}

if (-not $BaseUrl) {
  $BaseUrl = if ($env:DEV_ADMIN_URL) { $env:DEV_ADMIN_URL } else { "" }
}

$BaseUrl = Resolve-BaseUrl -RequestedBaseUrl $BaseUrl

$tenantId = if ($env:DEV_ADMIN_TENANT_ID) { $env:DEV_ADMIN_TENANT_ID } else { "tenant-admin" }
$email = if ($env:DEV_ADMIN_EMAIL) { $env:DEV_ADMIN_EMAIL } else { "admin@contractorflow.local" }
$password = if ($env:DEV_ADMIN_PASSWORD) { $env:DEV_ADMIN_PASSWORD } else { "" }

if (-not $password) {
  Write-Host "[dev:admin] Missing DEV_ADMIN_PASSWORD. Set it in your environment before running this script."
  exit 1
}

if (-not $BaseUrl) {
  Write-Host "[dev:admin] La app no esta lista en $BaseUrl. Primero ejecuta npm run dev."
  exit 1
}

$encodedRedirect = [System.Uri]::EscapeDataString($RedirectPath)
$loginUrl = "$BaseUrl/api/auth/dev-login?redirect=$encodedRedirect"

Write-Host "[dev:admin] Abriendo navegador con login admin automatico..."
Write-Host "[dev:admin] Tenant: $tenantId"
Write-Host "[dev:admin] Email: $email"
Start-Process $loginUrl