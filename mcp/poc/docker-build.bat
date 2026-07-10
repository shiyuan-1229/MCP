@echo off
REM MCP Forge · Docker 构建脚本（Windows）
REM 用法：双击运行 或 cmd /c docker-build.bat

setlocal

echo ===========================================
echo  MCP Forge · Docker 构建
echo ===========================================
echo.

REM 检查 Docker
where docker > nul 2> nul
if errorlevel 1 (
  echo [ERROR] Docker 未安装或未添加到 PATH
  pause
  exit /b 1
)

REM 构建镜像
echo [1/3] 构建 Docker 镜像...
docker compose build --no-cache
if errorlevel 1 (
  echo [ERROR] 构建失败
  pause
  exit /b 1
)

echo.
echo [2/3] 启动服务...
docker compose up -d
if errorlevel 1 (
  echo [ERROR] 启动失败
  pause
  exit /b 1
)

echo.
echo [3/3] 验证健康检查...
timeout /t 5 > nul
curl -fsS http://localhost:3100/health > nul
if errorlevel 1 (
  echo [WARN] 主服务健康检查未通过，请查看日志：docker compose logs
) else (
  echo [OK] 主服务健康检查通过
)

curl -fsS http://localhost:3458/health > nul
if errorlevel 1 (
  echo [WARN] Demo 服务健康检查未通过，请查看日志：docker compose logs
) else (
  echo [OK] Demo 服务健康检查通过
)

echo.
echo ===========================================
echo  构建完成！访问地址：
echo    管理后台 : http://localhost:3100/admin
echo    SSE 端点 : http://localhost:3458/sse
echo    健康检查 : http://localhost:3100/health
echo ===========================================
echo.
echo 常用命令：
echo   查看日志 : docker compose logs -f
echo   停止服务 : docker compose down
echo   重启服务 : docker compose restart
echo.
pause
endlocal
