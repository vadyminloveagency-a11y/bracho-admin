@echo off
cd /d "%~dp0"
if not exist node_modules (
  echo Installing dependencies...
  call npm install
)
echo Starting Bracho (debug port 9222)...
call npx electron . --remote-debugging-port=9222
