@echo off
chcp 65001 >nul
echo ================================================
echo   MCP Forge - 美佳便利店 AI 助手
echo   一键启动脚本 (cpolar 公网版)
echo ================================================
echo.

cd /d "%~dp0"

echo [1/2] 启动 MCP Server (端口 3458)...
set API_KEY=demo-key-2026
start "MCP Server" /min cmd /c "C:\Users\86159\.workbuddy\binaries\node\versions\22.22.2\node.exe server.js"
timeout /t 3 /nobreak >nul

echo [2/2] 启动 cpolar 内网穿透...
echo.
echo  ===== 等待公网地址生成 =====
D:\6\cpolar.exe http 3458
