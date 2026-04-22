$ErrorActionPreference = "Stop"

function Write-Step {
  param([string]$Message)
  Write-Host "[https:setup] $Message" -ForegroundColor Cyan
}

function Resolve-MkcertPath {
  $command = Get-Command mkcert -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $packageDir = Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Packages"
  if (Test-Path $packageDir) {
    $candidate = Get-ChildItem $packageDir -Recurse -Filter "mkcert.exe" -ErrorAction SilentlyContinue |
      Select-Object -First 1
    if ($candidate) {
      return $candidate.FullName
    }
  }

  return ""
}

function Ensure-MkcertInstalled {
  $mkcertPath = Resolve-MkcertPath
  if ($mkcertPath) {
    return $mkcertPath
  }

  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "mkcert is not installed and winget is not available. Install mkcert manually, then rerun npm run https:setup."
  }

  Write-Step "Installing mkcert with winget"
  winget install --id FiloSottile.mkcert -e --accept-package-agreements --accept-source-agreements

  $mkcertPath = Resolve-MkcertPath
  if (-not $mkcertPath) {
    throw "mkcert was installed but is not accessible yet. Open a new terminal and run npm run https:setup again."
  }

  return $mkcertPath
}

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$certDir = Join-Path $projectRoot ".cert"
$certFile = Join-Path $certDir "localhost.pem"
$keyFile = Join-Path $certDir "localhost-key.pem"

if (-not (Test-Path $certDir)) {
  New-Item -ItemType Directory -Path $certDir | Out-Null
}

$mkcertPath = Ensure-MkcertInstalled

Write-Step "Installing local development CA into the Windows trust store"
& $mkcertPath -install

Write-Step "Generating trusted certificate for localhost, 127.0.0.1 and ::1"
& $mkcertPath -key-file $keyFile -cert-file $certFile localhost 127.0.0.1 ::1

Write-Host "[https:setup] Certificate ready:" -ForegroundColor Green
Write-Host " - $certFile"
Write-Host " - $keyFile"
Write-Host "[https:setup] Next step: run npm run dev and open https://localhost:3000" -ForegroundColor Green