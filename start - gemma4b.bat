@echo off
echo.
echo  Starting AI server...
start cmd /k "C:\canpro\llama-interface\llama\llama-server.exe -m C:\canpro\llama-interface\models\gemma-4-E4B-it-Q4_K_M.gguf --host 127.0.0.1 --port 8080 -c 2048 -ngl 99"

pause
