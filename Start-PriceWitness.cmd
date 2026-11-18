@echo off
setlocal
cd /d "%~dp0"
node --version >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 24 or later to run PriceWitness.
  pause
  exit /b 1
)
node scripts/open-local.mjs
if errorlevel 1 pause

