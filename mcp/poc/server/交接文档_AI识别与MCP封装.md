# MCP Forge 项目交接文档

> 更新时间：2026-07-13  
> 撰写人：CodeBuddy AI

---

## 一、项目概述

MCP Forge 是一个企业级 MCP（Model Context Protocol）资产生成与治理平台。核心能力是：**接收企业的业务数据（数据库/接口文档/业务文件），通过 AI 大模型自动识别业务能力，生成 OpenAPI 规范，封装为分类的 MCP Tool，最终产出可部署的 MCP 资产**。

### 技术栈
- 后端：Node.js + Express + better-sqlite3 + mysql2
- 前端：原生 HTML/CSS/ES Module（无框架）
- AI 引擎：CCSwitch Codex（OpenAI Responses API 兼容，端点 `https://necair.ttoto.net/pt/rm_cpt_cx`）
- 数据库：SQLite（本地存储）+ MySQL（远程绿城 CDP 10.20.8.102）

### 项目地址
- GitHub: `https://github.com/shiyuan-1229/MCP`
- 本地路径：`d:/Github/clone/MCP/mcp/poc/`

---

## 二、已完成功能清单

### 1. AI 引擎模块（`server/ai-engine.mjs`）

| 功能 | 说明 |
|------|------|
| Responses API 适配 | 接入 CCSwitch Codex，使用 `/responses` 端点（非标准 chat/completions） |
| 能力预览（`previewCapabilities`） | AI 快速扫描数据，列出业务能力（不封装），供用户预览 |
| 完整识别（`analyzeBusinessData`） | AI 深度分析，生成 OpenAPI + Tool 定义 + 安全分级 |
| OpenAPI 生成（`analysisToOpenAPISpec`） | 将 AI 分析结果转为标准 OpenAPI 3.0 spec |
| Tool 转换（`analysisToTools`） | 将分析结果转为分类的 MCP Tool 定义（含 inputSchema） |
| 自定义封装要求 | 用户可在识别前/后输入封装要求，AI 按要求调整 Tool 生成 |
| AI 推荐可见性 | AI 对每个 Tool 自动标注 public/internal + 敏感原因 |
| 惰性环境变量读取 | ES Module import 时序问题修复，`.env` 在 import 后加载也能生效 |

### 2. 数据库直连模块（`server/db-connector.mjs`）

| 功能 | 说明 |
|------|------|
| MySQL 连接测试 | `POST /api/platform/db/test-connection` |
| 读取表结构 | 自动读取所有表的 DDL + 字段信息 + 表注释 |
| 样例数据 | 自动读取每张表前 2 行样例数据 |
| 数据库刷新 | 支持 DDL 刷新（`POST /api/platform/data-sources/:id/refresh-db`） |
| 实测数据 | 绿城 CDP 会员库 24 张表、近 200 万行数据成功读取 |

### 3. 资料接入页（intake）

| 功能 | 说明 |
|------|------|
| 企业分组展示 | 按 customer_id 分组，每个企业有标题行 + 统计 |
| 企业选择器 | 顶部下拉框筛选查看某个企业的资料 |
| 文件接收 | 支持拖拽多文件上传（multer），自动创建数据源 |
| 数据库直连 | 支持填写 MySQL 连接信息，自动读取表结构 |
| 查看文件内容 | 每行有"📄 查看文件"按钮，弹出模态展示缓存的文件内容 |
| 勾选批量识别 | checkbox 勾选待识别资料，一键批量 AI 识别 |
| 两步走识别流程 | 第一步能力预览（约 30s）→ 第二步勾选能力 + 提封装要求 → AI 封装 |
| 重新识别 | 已识别的资料可重新识别，覆盖旧结果 |
| DDL 刷新 | 数据库直连的数据源可刷新 DDL |

### 4. 接口识别页（recognition）

| 功能 | 说明 |
|------|------|
| 按企业分组 | 草案列表按企业分组展示，带企业选择器筛选 |
| AI 生成标识 | AI 生成的 OpenAPI 草案标注"AI"标签 |
| 草案详情 | 展示端点列表、完整 OpenAPI JSON |
| 确认草案 | 确认后自动生成 MCP 资产 + Tool + 时间线 + Release + 交付物 + 网关策略 + 模拟调用事件 |
| 滚动效果 | 草案列表 max-height 滚动 |

### 5. Tool 映射页（tooling）

| 功能 | 说明 |
|------|------|
| 按企业分组 | Tool 清单按企业分组，带企业选择器 |
| AI Tool 详情展示 | 每个 Tool 显示分类、中英文名、描述、参数（含必填标记）、可见性、敏感原因 |
| Tool 编辑 | 可修改 Tool 名称/描述/分类/可见性/参数（`PUT /api/platform/mcp-assets/:id/tools/:toolName`） |
| Tool 删除 | 单个删除（`DELETE /api/platform/mcp-assets/:id/tools/:toolName`） |
| Tool 新增 | 手动添加自定义 Tool（`POST /api/platform/mcp-assets/:id/tools`） |
| 可见性切换 | 资产级 public/internal 切换（`PUT /api/platform/mcp-assets/:id/visibility`） |
| 滚动效果 | Tool 清单 max-height 滚动 |

### 6. MCP 资产页（assets）

| 功能 | 说明 |
|------|------|
| 左右布局 | 左侧 Tool 库（去重），右侧 MCP 资产卡片 |
| 企业筛选 | 顶部下拉框按企业筛选 |
| AI 智能重组 | 勾选 Tool + 输入需求 → AI 封装为新 MCP（标注 [NEW]） |
| MCP 编辑 | 可修改名称/能力描述/状态/可见性/版本号 |
| 批量删除 | checkbox 勾选 + 批量删除 |
| 单个删除 | 每个 MCP 卡片有删除按钮 |
| 滚动效果 | Tool 库和 MCP 列表各 max-height:500px 滚动 |

### 7. 测试发布页（publish）

| 功能 | 说明 |
|------|------|
| 安全检测 | 一键检测：逐 Tool 测试 + 部署就绪检查 + 安全审计（6项） |
| 智能体联调台 | 选择 MCP 资产 → 输入问题 → AI 判断调用哪个 Tool → 模拟执行 → 自然回复 |
| 对话式测试 | 聊天界面，支持多轮对话，标注调用了哪个 Tool |
| 发布流程 | 测试通过 → 标记 tested → 发布 → 更新资产状态为 published + 交付物 ready + 企业端同步 |
| 回滚 | 支持回滚到上一版本 |
| 沙箱调用 | 保留单次 JSON-RPC 2.0 模拟调用 |

### 8. 交付管理页（delivery）

| 功能 | 说明 |
|------|------|
| 交付物列表 | 配置包/测试报告/效果报告/知识库导出 |
| 发布后自动更新 | 资产发布后交付物状态从 generating 变为 ready |
| 下载 | 支持下载交付物文件 |

### 9. 治理与统计页（governance）

| 功能 | 说明 |
|------|------|
| 网关策略 | 自动生成（含脱敏字段识别），支持 CRUD |
| 调用成效看板 | 调用记录、Trace ID、耗时、状态 |
| 接入配置 | 接入项台账、健康巡检、变更记录、回调记录 |
| 整行布局 | 资产规则清单和调用成效看板各占整行 |

### 10. 企业端（customer）

| 功能 | 说明 |
|------|------|
| 资产同步 | 运营端发布后企业端立即可见 |
| 调用统计 | 近 30 天调用趋势与成功率 |
| 账单管理 | 当期账单与历史明细 |
| 交付物下载 | 配置包、报告、日志 |
| 接入配置 | 地址、证书、鉴权方式 |

---

## 三、完整运营链路

```
资料接入（数据库直连/文件上传/导入）
  → AI 能力预览（扫描列出业务能力）
  → 勾选能力 + 提封装要求
  → AI 封装（生成 OpenAPI + 分类 Tool + 安全分级）
  → 接口识别（确认 OpenAPI 草案）
  → 自动生成：MCP 资产 + Tool + Release + 交付物 + 网关策略 + 模拟调用事件
  → Tool 映射（可编辑/删除/新增 Tool，切换可见性）
  → MCP 资产（可编辑/重组/批量管理）
  → 测试发布（安全检测 + 智能体联调 + 发布）
  → 交付管理（交付物 ready，可下载）
  → 治理与统计（网关策略 + 调用监控）
  → 企业端同步（published 资产可见）
```

---

## 四、关键文件清单

| 文件 | 说明 |
|------|------|
| `server/server.js` | 主服务端（~3200行），所有 API 路由 |
| `server/ai-engine.mjs` | AI 引擎（Responses API、能力预览、分析、Tool转换） |
| `server/db-connector.mjs` | MySQL 数据库直连模块 |
| `server/lvcheng-seed-data.mjs` | 绿城 CDP 真实 DDL 种子数据（6大业务库） |
| `server/.env` | AI 引擎配置（API Key、Base URL、Model） |
| `server/package.json` | 依赖：express, better-sqlite3, mysql2, multer, ws |
| `admin/index.html` | 管理后台 HTML |
| `admin/assets/app.js` | 前端主逻辑（~2400行） |
| `admin/assets/modules/renderers.js` | 页面渲染逻辑 |
| `admin/assets/modules/state.js` | 状态管理 |
| `admin/assets/modules/ui.js` | UI 工具函数 |
| `admin/assets/modules/api.js` | API 请求封装 |

---

## 五、环境配置

### `.env` 文件（`server/.env`）
```
AI_API_BASE=https://necair.ttoto.net/pt/rm_cpt_cx
AI_API_KEY=sk-x_DrW2qi6bFG4QyJfw3WJA
AI_MODEL=gpt-5.4-mini
PORT=3100
```

### 数据库连接（绿城 CDP）
```
host: 10.20.8.102
port: 3306
user: dev
password: dev20260622
databases: lvchengcdp_auth, lvchengcdp_cdpmaindata, lvchengcdp_cdporder,
           lvchengcdp_expenses, lvchengcdp_member, lvchengcdp_point
```

### 登录账号
| 角色 | 用户名 | 密码 |
|------|--------|------|
| 平台管理员 | admin | admin123 |
| 绿城企业端 | lvcheng | lv2026 |
| 美佳零售 | meijia | store123 |
| 华智制造 | hzm | 123456 |
| 鑫融金融 | xrf | 123456 |
| 安和物业 | ahwy | 123456 |
| 知行教育 | zxjy | 123456 |

---

## 六、WorkBuddy 接入方案对比

### 方案 A：MCP SSE 协议接入

**原理**：将生成的 MCP 资产部署为真实的 MCP Server（SSE 端点），WorkBuddy 通过标准 MCP 协议连接，直接调用 Tool。

| 优点 | 缺点 |
|------|------|
| 标准 MCP 协议，兼容性好 | 需要生成并部署可运行的 MCP Server 代码 |
| Tool 调用是真实执行（连接真实数据库） | 需要维护 MCP Server 进程 |
| 支持 SSE 实时通信 | 部署复杂度高 |
| 适合生产环境 | 需要 24h 在线 |

### 方案 B：HTTP API + Tool 定义接入

**原理**：在现有平台上直接暴露 Tool 定义 API，WorkBuddy 通过 OpenAI 兼容的 Tool Call 协议调用，平台模拟执行 Tool。

| 优点 | 缺点 |
|------|------|
| 无需额外部署，直接在现有平台对接 | Tool 执行是模拟的（非真实数据库查询） |
| 开发量小，已有智能体联调台基础 | 不适合生产环境真实调用 |
| 快速验证 AI 能否正确选择和调用 Tool | 需要后续升级为真实执行 |
| 适合演示和测试阶段 | |

### 推荐：方案 B（当前阶段）→ 方案 A（生产阶段）

**理由**：
1. 当前项目处于 POC 阶段，首要目标是验证"AI 能否正确识别数据并封装为可调用的 Tool"
2. 方案 B 已有基础（智能体联调台已实现），只需对接 WorkBuddy 的 Tool Call 协议
3. 方案 B 的 Tool Call 协议与 WorkBuddy 的 `supportsToolCall: true` 完全匹配
4. 后续进入生产阶段时，再升级为方案 A（生成 MCP Server 代码 + SSE 部署）

### WorkBuddy 配置（`~/.workbuddy/models.json`）
```json
[
  {
    "id": "TTKC-AUTO",
    "name": "TTKC:AUTO",
    "vendor": "TTKC",
    "url": "https://necair.ttoto.net",
    "apiKey": "sk-x_DrW2qi6bFG4QyJfw3WJA",
    "supportsToolCall": true,
    "supportsReasoning": true,
    "maxInputTokens": 204800,
    "maxOutputTokens": 32768
  }
]
```

---

## 七、待完成 / 后续规划

| 项目 | 说明 | 优先级 |
|------|------|--------|
| WorkBuddy 真实接入 | 通过 Tool Call 协议对接 WorkBuddy 进行端到端测试 | 高 |
| MCP Server 真实部署 | 将生成的 Tool 封装为可运行的 MCP Server（SSE） | 高 |
| 真实数据库查询 | Tool 执行时连接绿城 MySQL 返回真实数据 | 高 |
| 批量识别优化 | 并行识别 + 进度条 | 中 |
| Tool 版本差异对比 | 重新识别后 diff 新旧 Tool 变化 | 中 |
| 导出 MCP Server 代码 | 一键导出可运行的 server.js + package.json | 中 |
| 成本预估 | AI 识别前预估 Token 消耗和费用 | 低 |
| 多数据库合并 | 多个数据库的表合并识别为一个 MCP | 低 |

---

## 八、启动方式

```bash
cd d:/Github/clone/MCP/mcp/poc/server
npm install --ignore-scripts
npm rebuild better-sqlite3
npm start
# 访问 http://localhost:3100/admin
```

---

## 九、Git 提交历史

| 提交 | 说明 |
|------|------|
| `6755354` | AI识别完整链路打通、数据库直连、能力预览、Tool编辑、沙箱测试、安全审计、发布流程 |
| `cdc4c7f` | cleanup: 移除 node_modules/db/log 从 git 追踪，新增 .gitignore |
| `7313276` | 本地快照：删除时间线功能、API Key 收口、新增 .gitignore |
| `8b47e01` | MCP0.7 |
| `1bc9943` | 接入真实AI大模型识别(CCSwitch Codex Responses API) |
| `45e8d49` | 初次上传所有文件 |

---

## 十、注意事项

1. **ES Module 时序问题**：`ai-engine.mjs` 的环境变量必须用惰性函数读取（`getAI_API_KEY()`），不能在模块顶层 `const AI_API_KEY = process.env.AI_API_KEY`，因为 `.env` 在 import 之后才加载
2. **better-sqlite3 编译**：每次 `npm install` 后需要 `npm rebuild better-sqlite3` 编译原生绑定
3. **浏览器缓存**：修改前端 JS 后必须更新 `index.html` 中的 `?v=` 版本号，否则浏览器会缓存旧文件
4. **数据库重建**：删除 `mcp_forge.db` 文件后重启服务器会自动重建并执行 seed
5. **Responses API**：CCSwitch Codex 使用 `/responses` 端点而非标准的 `/chat/completions`，返回格式也不同（`output_text` 而非 `choices[0].message.content`）


---

## Eleven. 2026-07-17 Handoff Status

### Delivered and pushed

- Remote: `origin/main` at `https://github.com/shiyuan-1229/MCP.git`
- Commit `14b2e43 feat: load navigation from live data`
- The published change adds role-scoped navigation snapshots, removes the publish governance block, removes sandbox blocking from release publishing, and keeps the security check as an independent action.
- Verified before push: navigation snapshot source tests, live governance source test, local override source test, release draft test, no-sandbox-gate test, no-governance-gate test, and JavaScript syntax checks.
- A real administrator publish request returned `ok: true` after the governance gate was removed.

### Uncommitted work: Skills delivery package

The current worktree has uncommitted server and renderer changes for a new `skill-package` deliverable.

Target behavior:

1. Add `skill-package` to the required delivery materials.
2. Generate a ZIP download containing `SKILL.md`, `mcp-config.json`, and `README.md`.
3. Require the Skills delivery package, together with config, test report, and run guide, before an admin can publish a delivery package to a customer.
4. Show the Skills package in the delivery material list and customer downloads.

Current code state:

- `server/server.js` adds the delivery type, ZIP response branch, and `generateSkillPackage()`.
- `admin/assets/modules/renderers.js` adds the type to delivery completeness calculations and the label `Skills delivery package`.
- Test added but uncommitted: `admin/tests/skill-delivery-package.test.mjs`. It passes source-level checks.
- Syntax checks for `server.js` and `renderers.js` passed after the change.
- End-to-end ZIP content verification is still pending. The delivery record was created successfully, but the local Node service stopped before the download request. Re-check service startup and then download a generated `skill-package` to confirm all three ZIP entries.

### Remaining real-time-data work

The uncommitted test `admin/tests/navigation-static-data-audit.test.mjs` intentionally fails. It found browser-only state still used for billing actions, monitoring issue status, API key creation, and legacy local Builder fallback code. Do not claim that all navigation pages are fully server-persisted until those paths are replaced with server APIs and this audit test passes.

### Local service notes

- The installed Node runtime is version 24.
- `better-sqlite3` must be rebuilt for this runtime: `npm rebuild better-sqlite3` from `mcp/poc/server`.
- After code changes, start the service with `node server.js` from `mcp/poc/server` and verify `http://127.0.0.1:3100/health`.
- Do not stage `server/runtime-instances/`.

### Suggested next-session sequence

1. Check `git status --short` and preserve the uncommitted Skills package files and tests.
2. Start the service and generate/download a `skill-package`; inspect ZIP entries for `SKILL.md`, `mcp-config.json`, and `README.md`.
3. Add customer-facing labels for `skill-package` where a fallback type label remains.
4. Run `node mcp/poc/admin/tests/skill-delivery-package.test.mjs` plus existing delivery regressions.
5. Commit and push Skills delivery package as a separate commit.
6. Resume the static-data audit by replacing billing, monitoring, and API key browser-only writes with persisted server endpoints.
