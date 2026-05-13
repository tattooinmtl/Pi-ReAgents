@echo off
title Pi-ReAgents AI - Start All
cd /d "%~dp0"

:: ──────────────────────────────────────────
:: NOTE:
:: Running via "npm run dev" (browser mode)
:: will show "File system access requires Electron"
:: in the File Explorer and Terminal panels.
::
:: Use npm run electron:dev instead for
:: full native file access and integrated terminal.
:: ──────────────────────────────────────────

echo.
echo  [1/2] Starting llama-server with Gemma 4B...
start "llama-server" cmd /k "C:\canpro\llama-interface\llama\llama-server.exe -m C:\canpro\llama-interface\models\gemma-4-E4B-it-Q4_K_M.gguf --host 127.0.0.1 --port 8080 -c 2048 -ngl 99"

timeout /t 3 /nobreak >nul

echo  [2/2] Starting Electron UI...
echo.
npm run electron:dev
pause
