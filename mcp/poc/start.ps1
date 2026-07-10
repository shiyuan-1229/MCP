# MCP Forge POC - 一键启动脚本（PowerShell）
# 自动检测 Node.js，跨 Windows 版本兼容

$ErrorActionPreference = "Stop"

Write-Host "🚀 启动 MCP Forge · 零售门店 AI 助手 POC..." -ForegroundColor Cyan
Write-Host ""

Set-Location -Path "$PSScriptRoot\server"

# ── 自动检测 Node.js ─────────────────────────
$nodeBin = $null

# 优先使用 WorkBuddy managed Node（已知兼容版本）
$managedNode = Join-Path $env:USERPROFILE ".workbuddy\binaries\node\versions\22.22.2\node.exe"
if (Test-Path $managedNode) { $nodeBin = $managedNode }

# 兜底：系统 PATH 中的 node
if (-not $nodeBin) {
  $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
  if ($nodeCmd) { $nodeBin = $nodeCmd.Source }
}

if (-not $nodeBin) {
  Write-Host "❌ 未找到 Node.js，请先安装 Node.js 22.x" -ForegroundColor Red
  Read-Host "按 Enter 退出"
  exit 1
}

$nodeVersion = & $nodeBin --version
Write-Host "✅ Node: $nodeBin ($nodeVersion)" -ForegroundColor Green

# ── 检查依赖 ─────────────────────────────────
if (-not (Test-Path "node_modules\@modelcontextprotocol")) {
  Write-Host "📦 安装依赖..." -ForegroundColor Yellow
  & npm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ npm install 失败" -ForegroundColor Red
    Read-Host "按 Enter 退出"
    exit 1
  }
}

# ── 启动 ─────────────────────────────────────
Write-Host ""
Write-Host "📡 MCP Server 监听: http://localhost:3100" -ForegroundColor Cyan
Write-Host "🛑 停止服务: Ctrl+C" -ForegroundColor Yellow
Write-Host ""

& $nodeBin server.js