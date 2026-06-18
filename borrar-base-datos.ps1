$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$PidFile = Join-Path $Root ".server.pid"
$DbFiles = @(
  (Join-Path $Root "data\gastos.sqlite"),
  (Join-Path $Root "data\gastos.sqlite-shm"),
  (Join-Path $Root "data\gastos.sqlite-wal"),
  (Join-Path $Root "data\gastos.sqlite-journal")
)

Write-Warning "Esto borrara gastos, ventas, detalle de ventas y stock."
$confirmation = Read-Host "Escribe BORRAR para confirmar"

if ($confirmation -ne "BORRAR") {
  Write-Host "Operacion cancelada."
  exit 0
}

if (Test-Path -LiteralPath $PidFile) {
  $serverPid = Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue
  if ($serverPid) {
    Stop-Process -Id $serverPid -ErrorAction SilentlyContinue
  }
}

foreach ($file in $DbFiles) {
  if (Test-Path -LiteralPath $file) {
    Remove-Item -LiteralPath $file -Force
    Write-Host "Eliminado: $file"
  }
}

Write-Host "Base de datos borrada. Se creara nuevamente al ejecutar abrir-servidor.ps1 o npm start."
