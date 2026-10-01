@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22.13 or later is required. Install Node.js, then run this file again.
  pause
  exit /b 1
)
node -e "const v=process.versions.node.split('.').map(Number);process.exit(v[0]>22||(v[0]===22&&v[1]>=13)?0:1)"
if errorlevel 1 (
  echo Node.js 22.13 or later is required.
  pause
  exit /b 1
)
set "PORT=3000"
set "ROSTER_CSV_PATH=%~dp0meibo.csv"
set "STORAGE_DIR=%~dp0local-server\storage"
echo Teacher page: http://localhost:3000/admin.html
echo Roster: %ROSTER_CSV_PATH%
echo Keep this window open while using the server.
node local-server/server.mjs
pause
endlocal
