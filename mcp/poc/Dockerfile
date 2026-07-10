# MCP Forge Dockerfile
# 单镜像同时启动主服务 (:3100) 和 Demo 服务 (:3458)

FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY server/package*.json ./server/
RUN cd server && npm ci && cd ..

COPY demo-server/package*.json ./demo-server/
RUN cd demo-server && npm ci && cd ..

COPY . /app
COPY docker-entrypoint.js /app/docker-entrypoint.js

RUN mkdir -p /app/data /app/logs && chmod 755 /app/data /app/logs

EXPOSE 3100 3458

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -fsS http://localhost:3100/health || exit 1

CMD ["node", "docker-entrypoint.js"]
