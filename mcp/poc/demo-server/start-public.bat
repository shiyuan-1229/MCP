@echo off
chcp 65001 > nul
title MCP Forge Demo · 零售门店 AI 助手

echo.
echo ══════════════════════════════════════════
echo   MCP Forge · 零售门店 AI 助手  Demo
echo   门店：美佳便利店  ^|  13 Tools
echo ══════════════════════════════════════════
echo.

set API_KEY=demo-key-2026

echo [1/2] 启动 MCP Server 在端口 3458...
start "MCP-Forge-Demo" /B cmd /c "cd /d %~dp0 && set API_KEY=demo-key-2026 && %USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2\node.exe server.js"
ping -n 4 127.0.0.1 > nul

echo [2/2] 创建公网隧道...
echo.
echo ──────────────────────────────────────────
echo   公网地址（复制到腾讯元器）：
echo.

npx localtunnel --port 3458 --print-requests

echo.
echo ──────────────────────────────────────────
pause
