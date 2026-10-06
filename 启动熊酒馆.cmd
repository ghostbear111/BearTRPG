@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在启动熊酒馆，请打开 http://127.0.0.1:5173
call npm run dev
pause
