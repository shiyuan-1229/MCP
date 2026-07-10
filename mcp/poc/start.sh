#!/bin/bash
# MCP Forge POC - 一键启动脚本（跨平台版）
# 自动检测 Node.js，支持 macOS / Linux / WSL
# 用法：cd poc && bash start.sh

set -e

echo "🚀 启动 MCP Forge · 零售门店 AI 助手 POC..."
echo ""

# 切换到脚本所在目录
cd "$(dirname "$0")/server"

# ── 自动检测 Node.js ───────────────────────────
detect_node() {
  # 1. WorkBuddy 托管 Node（优先，已知兼容版本）
  for p in \
    "$HOME/.workbuddy/binaries/node/versions/22.22.2/bin/node" \
    "/c/Users/$USER/.workbuddy/binaries/node/versions/22.22.2/node.exe"; do
    if [ -x "$p" ]; then echo "$p"; return 0; fi
  done
  # 2. 系统 PATH 中的 node（兜底）
  if command -v node >/dev/null 2>&1; then
    echo "$(command -v node)"
    return 0
  fi
  echo "❌ 未找到 Node.js，请先安装 Node.js 22.x" >&2
  exit 1
}

NODE_BIN=$(detect_node)
echo "✅ Node: $NODE_BIN ($($NODE_BIN --version))"

# ── 检查依赖 ───────────────────────────────────
if [ ! -d "node_modules/@modelcontextprotocol" ]; then
  echo "📦 安装依赖..."
  npm install
fi

# ── 启动 ───────────────────────────────────────
exec "$NODE_BIN" server.js