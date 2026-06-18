$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Url = "http://localhost:3000/"
$PidFile = Join-Path $Root ".server.pid"
$LogFile = Join-Path $Root "server.log"
$ErrorLogFile = Join-Path $Root "server.err.log"

function Test-LocalServer {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 500
  } catch {
    return $false
  }
}

if (Test-LocalServer) {
  Write-Host "El servidor ya esta funcionando en $Url"
  Start-Process $Url
  exit 0
}

$node = Get-Command node -ErrorAction Stop

$process = Start-Process `
  -FilePath $node.Source `
  -ArgumentList "--no-warnings", "server.js" `
  -WorkingDirectory $Root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $LogFile `
  -RedirectStandardError $ErrorLogFile `
  -PassThru

Set-Content -LiteralPath $PidFile -Value $process.Id -Encoding ASCII

Start-Sleep -Seconds 2

if (Test-LocalServer) {
  Write-Host "Servidor iniciado en $Url"
  Start-Process $Url
} else {
  Write-Warning "El servidor se intento iniciar, pero no respondio en $Url. Revisa server.err.log."
}
