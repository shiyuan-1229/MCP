#!/usr/bin/env bash
# MCP Forge · Docker 构建脚本（Linux/macOS）
# 用法：chmod +x docker-build.sh && ./docker-build.sh

set -e

echo "==========================================="
echo " MCP Forge · Docker 构建"
echo "==========================================="
echo ""

# 检查 Docker
if ! command -v docker &> /dev/null; then
  echo "[ERROR] Docker 未安装"
  exit 1
fi

# 构建镜像
echo "[1/3] 构建 Docker 镜像..."
docker compose build --no-cache

# 启动服务
echo ""
echo "[2/3] 启动服务..."
docker compose up -d

# 验证健康检查
echo ""
echo "[3/3] 验证健康检查..."
sleep 5

if curl -fsS http://localhost:3100/health > /dev/null 2>&1; then
  echo "[OK] 主服务健康检查通过"
else
  echo "[WARN] 主服务健康检查未通过，请查看日志：docker compose logs"
fi

if curl -fsS http://localhost:3458/health > /dev/null 2>&1; then
  echo "[OK] Demo 服务健康检查通过"
else
  echo "[WARN] Demo 服务健康检查未通过，请查看日志：docker compose logs"
fi

echo ""
echo "==========================================="
echo " 构建完成！访问地址："
echo "   管理后台 : http://localhost:3100/admin"
echo "   SSE 端点 : http://localhost:3458/sse"
echo "   健康检查 : http://localhost:3100/health"
echo "==========================================="
echo ""
echo "常用命令："
echo "  查看日志 : docker compose logs -f"
echo "  停止服务 : docker compose down"
echo "  重启服务 : docker compose restart"
