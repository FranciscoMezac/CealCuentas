@echo off
setlocal

cd /d "%~dp0"

echo Esto borrara gastos, ventas, detalle de ventas y stock.
set /p CONFIRMACION=Escribe BORRAR para confirmar: 

if /I not "%CONFIRMACION%"=="BORRAR" (
  echo Operacion cancelada.
  exit /b 0
)

if exist ".server.pid" (
  for /f "usebackq delims=" %%p in (".server.pid") do taskkill /PID %%p /F >nul 2>nul
)

for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000" ^| findstr "LISTENING"') do taskkill /PID %%p /F >nul 2>nul

del /f /q "data\gastos.sqlite" 2>nul
del /f /q "data\gastos.sqlite-shm" 2>nul
del /f /q "data\gastos.sqlite-wal" 2>nul
del /f /q "data\gastos.sqlite-journal" 2>nul

echo Base de datos borrada. Se creara nuevamente al abrir el servidor.
pause
endlocal
