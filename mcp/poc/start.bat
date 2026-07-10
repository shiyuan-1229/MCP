@echo off
REM MCP Forge POC - 一键启动脚本（Windows 原生）
REM 自动检测 Node.js，依赖管理
REM 用法：双击运行 或 cmd /c start.bat

setlocal

echo 🚀 启动 MCP Forge · 零售门店 AI 助手 POC...
echo.

cd /d "%~dp0server"

REM ── 自动检测 Node.js ─────────────────────
set "NODE_BIN="
REM 优先使用 WorkBuddy managed Node（已知兼容版本）
if exist "%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2\node.exe" (
  set "NODE_BIN=%USERPROFILE%\.workbuddy\binaries\node\versions\22.22.2\node.exe"
)
REM 兜底：系统 PATH 中的 node
if not defined NODE_BIN (where node >nul 2>nul && set "NODE_BIN=node")
if not defined NODE_BIN (
  echo ❌ 未找到 Node.js，请先安装 Node.js 22.x
  pause
  exit /b 1
)

echo ✅ Node: %NODE_BIN%
%NODE_BIN% --version

REM ── 检查依赖 ─────────────────────────────
if not exist "node_modules\@modelcontextprotocol" (
  echo 📦 安装依赖...
  call npm install
  if errorlevel 1 (
    echo ❌ npm install 失败
    pause
    exit /b 1
  )
)

REM ── 启动 ─────────────────────────────────
echo.
echo 📡 MCP Server 监听: http://localhost:3100
echo 🛑 停止服务: Ctrl+C
echo.
%NODE_BIN% server.js

endlocal