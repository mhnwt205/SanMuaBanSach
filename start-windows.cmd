@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 goto missing_node
node -e "if (Number(process.versions.node.split('.')[0]) < 22) process.exit(1)"
if errorlevel 1 goto missing_node
where npm >nul 2>&1
if errorlevel 1 goto missing_node

echo Installing frontend dependencies...
call npm --prefix apps\web ci
if errorlevel 1 goto failed
echo Installing API dependencies...
call npm --prefix apps\api ci
if errorlevel 1 goto failed
echo Preparing the local database...
call npm run db:local
if errorlevel 1 goto failed

start "Cho Sach Cu - API - keep this window open" cmd /k "npm run dev:api"
start "Cho Sach Cu - Web - keep this window open" cmd /k "npm run dev:web"
echo Waiting for the website and API...
powershell -NoProfile -Command "$ready=$false; for($i=0;$i -lt 30;$i++){try{$r=Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:5173/api/health' -TimeoutSec 2; if($r.StatusCode -eq 200){$ready=$true; break}}catch{}; Start-Sleep -Seconds 1}; if($ready){Start-Process 'http://127.0.0.1:5173'; exit 0}else{exit 1}"
if errorlevel 1 goto failed
echo Website opened. Keep the API and Web windows open while using it.
pause
exit /b 0

:missing_node
echo Install Node.js 24 LTS from https://nodejs.org/ and run this file again.
pause
exit /b 1

:failed
echo Startup failed. Read the error above or in the API and Web windows.
pause
exit /b 1
