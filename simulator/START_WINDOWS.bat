@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 22.9 or newer, then reopen this file.
  pause
  exit /b 1
)
if not exist .env copy .env.example .env >nul
 echo Open http://localhost:4310 in your browser after the server starts.
call npm start
pause
