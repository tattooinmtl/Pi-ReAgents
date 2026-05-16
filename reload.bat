@echo off
title Pi-ReAgents - Reload Server
cd /d "%~dp0"

set LAST_MODEL_FILE=%~dp0llama\last-model.txt

if not exist "%LAST_MODEL_FILE%" (
  echo.
  echo  ERROR: No model has been selected yet.
  echo  Open the app, pick a model in the Model Manager, and click Load.
  echo  Then run this file to reload it.
  echo.
  pause
  exit /b 1
)

set /p MODEL_PATH=<"%LAST_MODEL_FILE%"

if "%MODEL_PATH%"=="" (
  echo.
  echo  ERROR: last-model.txt is empty. Select a model inside the app first.
  echo.
  pause
  exit /b 1
)

echo.
echo  Stopping existing llama-server...
taskkill /F /IM llama-server.exe /T >nul 2>&1
timeout /t 1 /nobreak >nul

echo  Starting llama-server with:
echo  %MODEL_PATH%
echo.
start "llama-server" cmd /k "%~dp0llama\llama-server.exe -m "%MODEL_PATH%" --host 127.0.0.1 --port 8080 -c 4096 -ngl 99"

echo  Server restarting... check the llama-server window for progress.
echo.
timeout /t 3 /nobreak >nul
