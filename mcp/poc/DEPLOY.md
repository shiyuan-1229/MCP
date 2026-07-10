# MCP Forge Docker 部署指南

## 快速启动

### Windows

```cmd
docker-build.bat
```

### Linux / macOS

```bash
chmod +x docker-build.sh
./docker-build.sh
```

## 手动部署

```bash
# 生产模式
docker compose up -d --build

# 开发模式
docker compose -f docker-compose.dev.yml up -d --build
```

## 服务验证

```bash
curl http://localhost:3100/health
curl http://localhost:3458/health
```

管理后台：http://localhost:3100/admin

演示账号：
- 平台管理员：`admin / admin123`
- 美佳零售：`meijia / store123`
- 华智制造：`hzm / 123456`
- 鑫融金融：`xrf / 123456`

## 端口

| 端口 | 服务 | 说明 |
| --- | --- | --- |
| 3100 | 主服务 | 管理后台和平台 API |
| 3458 | Demo 服务 | 零售场景 MCP SSE 端点 |

## 数据持久化

SQLite 数据库挂载在 Docker volume `mcp-forge-db`。

```bash
docker volume ls
docker compose logs -f
docker compose down
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `SERVER_PORT` | 3100 | 主服务端口 |
| `DEMO_PORT` | 3458 | Demo 服务端口 |
| `DB_PATH` | /app/data/mcp_forge.db | SQLite 数据库路径 |
| `NODE_ENV` | production | 运行环境 |
