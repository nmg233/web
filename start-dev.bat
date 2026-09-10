@echo off
setlocal
cd /d "%~dp0"
set "NODE_EXE=node.exe"
if exist "%ProgramFiles%\nodejs\node.exe" (
  set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
  goto run
)
where node.exe >nul 2>nul
if errorlevel 1 (
  if exist "%ProgramFiles%\nodejs\node.exe" (
    set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
  ) else (
    echo Node.js was not found. Install Node.js LTS and try again.
    pause
    exit /b 1
  )
)
:run
"%NODE_EXE%" "%~dp0scripts\start-dev.cjs" %*
if errorlevel 1 pause
