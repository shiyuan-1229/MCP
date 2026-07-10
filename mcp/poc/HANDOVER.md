# MCP Forge 项目交接文档

> 最后更新：2026-07-07
> 交接人：AI 助手
> 接收人：后续维护 / 演示人员

---

## 1. 项目定位

MCP Forge 是一个**面向企业的 MCP（Model Context Protocol）打造与治理平台**。目标是把企业现有业务系统（POS、CRM、MES、QMS、工单系统等）封装成 AI 可调用的标准化 MCP 资产，并通过统一后台完成客户交付、网关治理、版本发布与计费结算。

当前版本已从「单门店零售 AI 助手 POC」升级为「平台级 MCP 能力中台」。

---

## 2. 目录结构

```
D:\桌面\mcp方案\mcp\poc\
├── server/                 # 主服务（Express + better-sqlite3）
│   ├── server.js           # 新版平台级后台 API
│   ├── node_modules/
│   └── ...
├── admin/                  # 管理后台前端（纯 HTML/JS/CSS）
│   ├── index.html          # 登录页 + 单页应用
│   ├── assets/
│   │   ├── styles.css      # 样式
│   │   └── app.js          # 前端逻辑
│   ├── login-bg.png
│   └── brand-icon.png
├── client/                 # 可选：客户端页面
├── public/                 # Demo 数据源看板
├── demo-server/            # 旧版零售门店 MCP Demo 服务（:3458）
├── deployments/            # 历史部署包
├── start.bat               # Windows 一键启动脚本
├── docker-build.bat        # Docker 构建脚本
├── Dockerfile / docker-compose.yml
├── presentation.html       # 演讲演示幻灯片
├── HANDOVER.md             # 本文件
└── mcp_forge.db            # SQLite 主数据库
```

---

## 3. 启动方式

### 3.1 开发环境

双击运行或在 cmd 中执行：

```bash
D:\桌面\mcp方案\mcp\poc\start.bat
```

脚本会：
1. 自动检测 Node.js（优先 WorkBuddy managed Node 22.22.2）
2. 检查并安装依赖
3. 启动 `server/server.js`，监听 `http://localhost:3100`

启动成功后访问：

```
http://localhost:3100/admin
```

### 3.2 停止服务

在启动窗口按 `Ctrl+C`，或任务管理器结束 `node.exe` 进程。

---

## 4. 账号信息

| 账号 | 密码 | 角色 | 对应客户 | 用途 |
|------|------|------|----------|------|
| admin | admin123 | 管理员 | - | 查看全局数据 |
| meijia | store123 | 客户 | 美佳零售集团 | 零售客户视角 |
| hzm | 123456 | 客户 | 华智制造 | 制造业客户视角 |
| xrf | 123456 | 客户 | 鑫融金服 | 金融业客户视角 |
| ahwy | 123456 | 客户 | 安和物业 | 物业客户视角 |
| zxjy | 123456 | 客户 | 知行教育 | 教育客户视角 |

登录页提供快速登录按钮，点击后自动填充账号密码并登录。

---

## 5. 后台功能模块

登录后按角色展示不同数据范围：

| 页面 | 管理员可见 | 客户可见 | 说明 |
|------|-----------|---------|------|
| 项目工作台 | ✅ | ✅（仅自己） | 客户项目列表、交付动态、核心指标 |
| MCP 工厂 | ✅ | ✅（仅自己） | MCP 资产、数据源接入、新建草稿 |
| 测试与发布 | ✅ | ✅（仅自己） | 发布记录、沙箱试调 |
| 网关与治理 | ✅ | ✅（仅自己） | 认证授权、限流、脱敏、审计策略 |
| 使用统计 | ✅ | ✅（仅自己） | 调用量、成功率、响应、审计日志 |
| 计费管理 | ✅ | ✅（仅自己） | 实施费、年费、效果费 |
| 文件下载 | ✅ | ✅（仅自己） | 配置包、测试报告、日志、复盘 |
| Demo 数据源 | ✅ | ❌ | 零售场景旧数据说明 |

---

## 6. 数据库关键表

新版核心表：

- `platform_users`：平台用户（管理员 + 客户账号）
- `platform_sessions`：JWT session
- `customers`：企业客户
- `projects`：项目
- `data_sources`：数据源接入
- `mcp_assets`：MCP 资产
- `mcp_releases`：版本发布记录
- `gateway_policies`：网关策略
- `call_events`：调用事件
- `deliverables`：交付文件
- `platform_billing_records`：计费记录

旧版保留表（demo-server 仍在使用）：

- `users`、`sessions`、`stores`、`products`、`orders`、`inventory`、`members`、`kb_collections`、`kb_documents`、`kb_chunks`、`mcp_tools`、`mcp_tool_bindings` 等

> 注意：`mcp_forge.db` 同时包含新旧两套表结构，新版 server.js 使用 `platform_*` 开头的表。

---

## 7. 演示数据

当前数据库 seed 包含：

- 5 个企业客户（零售、制造、金融、物业、教育）
- 5 个项目
- 10 个数据源
- 10 个 MCP 资产（2 个已发布）
- 5 条网关策略
- 3 条发布记录
- 9 条交付物
- 8 条计费记录
- 80 条调用事件

如需重置数据，可删除 `mcp_forge.db` 后重新启动服务，server.js 会自动重新 seed。

---

## 8. 最近修改记录

### 2026-07-07
- 修复跨行业客户快速登录点击无反应问题
- 修复客户项目页面不显示跨行业案例问题
- 在 server.js 中添加安和物业、知行教育两个新客户及对应项目/数据源/MCP 资产/网关策略/计费记录/账号
- 将 seed 函数改为 `INSERT OR IGNORE` 增量补充模式
- 更新 admin/index.html 快速登录按钮，新增 ahwy、zxjy
- 更新 admin/assets/app.js，快速登录后自动触发登录
- 创建演讲演示 HTML：`presentation.html`
- 创建本交接文档：`HANDOVER.md`

---

## 9. 已知问题与注意事项

1. **旧版后台页面已不存在**：当前 `admin/index.html` 是新版平台级后台，不再包含旧版 13 个零售场景页面。
2. **沙箱试调仅模拟 2 个工具**：`/admin/simulate-call` 目前只对 `sales_top_products` 和 `member_expiring_benefits` 做了详细返回，其余工具返回通用占位结果。
3. **MCP 资产未实现真实 handler**：当前资产主要做数据展示，未对接真实后端系统。后续需要按 `asset.tools` 字段扩展真实调用逻辑。
4. **Docker 镜像待同步**：当前 `Dockerfile` 可能基于旧版代码构建，升级后需重新验证。
5. **演示前建议重启服务**：确保 `server.js` 是最新版，且数据库已完成 seed。

---

## 10. 演讲演示

打开浏览器：

```
D:\桌面\mcp方案\mcp\poc\presentation.html
```

或右键 → 打开方式 → 浏览器。

操作说明：
- 按 `→` / `空格` / `PageDown` 下一页
- 按 `←` / `PageUp` 上一页
- 按 `N` 显示/隐藏演讲备注
- 右下角按钮也可翻页和查看备注

---

## 11. 联系人 / 下一步

- 技术栈：Node.js 22 + Express + better-sqlite3 + 原生前端
- 下一步建议：
  1. 补齐各 MCP 资产的真实 handler 和模拟数据
  2. 完善客户侧文件下载的真实文件生成
  3. 更新 Docker 构建并验证
  4. 准备对外演示脚本
