@echo off
setlocal

cd /d "%~dp0"
set "URL=http://localhost:3000/"

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Uri '%URL%' -TimeoutSec 2 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul

if "%ERRORLEVEL%"=="0" (
  echo El servidor ya esta funcionando en %URL%
  start "" "%URL%"
  exit /b 0
)

echo Iniciando servidor CEAL Cuentas...
start "CEAL Cuentas" /min /D "%~dp0" cmd /c "node --no-warnings server.js > server.log 2> server.err.log"

timeout /t 2 /nobreak >nul
start "" "%URL%"

echo Servidor iniciado en %URL%
endlocal
