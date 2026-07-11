# MCP Forge 项目交接文档

> 最后更新：2026-07-10
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

---

## 12. Governance MVP（接口资产治理最小闭环）

> 设计文档：`docs/superpowers/specs/2026-07-10-mcp-forge-enterprise-interface-asset-governance-design.md`
> 实施计划：`docs/superpowers/plans/2026-07-10-mcp-forge-interface-asset-governance-mvp.md`

### 12.1 业务闭环

```
多源接入 → AI 初判 → 人工审核 → 资产入库 → 复用推荐 → 反馈回流
```

### 12.2 当前已实现的能力

- **数据库 / OpenAPI 归一化**：`server/modules/connectors/{db-schema, openapi-parser}.mjs` 把不同来源转为统一中间结构
- **AI 候选生成**：`ai-engine.mjs` 新增 `generateGovernanceCandidates()`（当前为 stub，可接入真实大模型）
- **审核分流**：`server/modules/governance/review-orchestrator.mjs` 按 `risk_level` 决定 `auto_pass / manual_review / dual_review`
- **审核任务持久化**：`platform_review_tasks` 表 + `recordReviewDecision()` API
- **资产入库**：`platform_published_assets` 表 + `/api/platform/governance/candidates/:id/publish`（防御性检查：仍有未完成审核任务时返回 409）
- **复用推荐**：`reuse-service.suggestReuse()` 按业务域（0.6）+ 词重叠（最多 0.4）打分，自动写入 `platform_reuse_suggestions`
- **管理端工作台**：admin 顶栏新增「接口资产治理」入口（page id `asset-governance`），渲染候选 / 审核 / 已发布 / 复用四区域

### 12.3 数据表

| 表名 | 用途 |
|---|---|
| `platform_candidate_assets` | AI 初判的候选资产 |
| `platform_review_tasks` | 审核任务（自动 / 单人 / 双人） |
| `platform_published_assets` | 审核通过并发布的接口资产 |
| `platform_reuse_suggestions` | 复用推荐记录 |

### 12.4 API 端点

- `GET  /api/platform/governance/candidates` — 候选资产列表（按 customer scope 隔离）
- `GET  /api/platform/governance/reviews` — 审核任务列表
- `POST /api/platform/governance/reviews/:id/decision` — 记录审核决策
- `GET  /api/platform/governance/published-assets` — 已发布资产
- `GET  /api/platform/governance/reuse-suggestions` — 复用推荐
- `POST /api/platform/governance/candidates/:id/publish` — 发布候选资产

### 12.5 操作员流程

1. 在「资料接入」或外部流程生成 CandidateAsset
2. 在管理端「接口资产治理」查看候选与待审核任务
3. 人工对单条 review task 记录 decision + reason（POST `/reviews/:id/decision`）
4. 所有 open review task 都 resolved 后调用 publish 端点入库
5. 系统自动计算复用推荐并展示在工作台

### 12.6 测试覆盖

- `tests/governance-api-smoke.test.js` — server.js 表与 API 存在性
- `tests/governance-connectors.test.js` — DB / OpenAPI 归一化
- `tests/governance-review-orchestrator.test.js` — 审核分流
- `tests/governance-reuse-service.test.js` — 复用评分
- `mcp/poc/admin/tests/renderers-import.test.mjs` — UI 渲染函数存在

### 12.7 已知缺口（待后续补齐）

- `generateGovernanceCandidates` 当前是 stub，未接入真实大模型做业务分类与敏感识别
- 敏感字段检测（`sensitive_hits`）字段已存在但无自动检测逻辑
- 双人审核闭环：publish 时已防御性检查 `openTasks.length === 0`，但未细分 `dual_review` 类型
- 工作台只读：缺少"生成候选 / 触发审核 / 决策 / 发布"的交互按钮（仅展示 API 已就绪）

---

## 13. Builder Workbench（企业 MCP 打造工作台）

> 设计文档：`docs/superpowers/specs/2026-07-10-mcp-forge-enterprise-interface-asset-governance-design.md`
> 实施计划：`docs/superpowers/plans/2026-07-10-mcp-forge-builder-workbench-mvp.md`
> 完成日期：2026-07-11

### 13.1 产品定位升级

把 MCP Forge 从「AI 演示台」升级为「**企业 MCP 打造工作台**」，主叙事面向 B 端交付团队：

- 不追求 AI 全自动生成一切，而是「**让团队更快做对**」
- 把分散资料沉淀为可交付、可复用、可发布的 MCP 资产
- 缩短业务资料到上线联调的周期
- 降低 AI 误判带来的返工和业务风险

工作台顶部品牌、侧栏导航、登录后首页已统一改为「企业 MCP 打造工作台」。

### 13.2 八个必须人工拍板的关键节点

| # | 节点 | 实现位置 |
|---|---|---|
| 1 | 资料接入确认 | `intake` 页 + 敏感命中规则 |
| 2 | 接口候选筛选 | `asset-governance` 页候选表 |
| 3 | Tool 边界定义 | `build-tool` 弹窗 + `boundary-detector` |
| 4 | 敏感字段审核 | `manual-checks.detectSensitiveHits` 自动 + 人工 |
| 5 | 权限与可见性配置 | `human_tools_snapshot.visibility` |
| 6 | 业务规则注入 | `business_rule_notes` 字段（Markdown） |
| 7 | 发布前验收 | 6 项必填清单 + 三道发布阻断 |
| 8 | 上线后反馈回流 | `retro-service` 复盘机制 |

### 13.3 三道发布阻断（强制人工验收）

`POST /api/platform/governance/candidates/:id/publish` 在写入 `platform_published_assets` 前依次校验：

1. **审核任务清零**：`open_review_tasks` 必须为 0，否则 409
2. **人工初筛通过**：`manual_screen_decision='reject'` 直接阻断，否则 409
3. **验收清单通过**：6 项 `acceptance_checklist` 全部勾选 + `acceptance_passed=true`，否则 409

6 项必填：`业务结果正确` / `敏感字段已处理` / `权限范围已确认` / `写操作风险已确认` / `交付说明已补齐` / `回滚方案可用`

### 13.4 复用分类三档

`reuse-service.suggestReuse` 在相似度分数基础上输出三档分类：

| 分类 | 阈值 | 含义 |
|---|---|---|
| `direct_reuse` | score ≥ 0.8 | 可直接复用 |
| `adapt_reuse` | score ≥ 0.4 | 复制后改造 |
| `suggest_new` | < 0.4 | 建议新建 |

### 13.5 误识别复盘闭环（Task 6）

复盘数据流：

```
人工驳回 / 改写 → POST /retro（记录原因） → platform_candidate_assets.retro_reason
                                              ↓
                       retro-service.summarizeRetro() 统计
                                              ↓
                  buildRetroHint() 生成「历史高频误判提示」
                                              ↓
              generateGovernanceCandidates() 把 hint 注入 AI 上下文
                                              ↓
                       下次识别顶部 banner 提示团队
```

6 类原因：`classification_error` / `field_understanding_error` / `sensitivity_misjudge` / `tool_boundary_error` / `business_meaning_error` / `other`

### 13.6 Tool 打造台三栏（Task 3）

`POST /api/platform/governance/candidates/:id/build-tool` 一次性保存：

- `ai_tools_snapshot` — AI 原建议（追溯依据）
- `human_tools_snapshot` — 人工修订后版本（最终产物）
- `business_rule_notes` — 业务规则注入（字段解释 / 业务限制 / 错误口径 / FAQ / 补充 Prompt）
- `boundary_warning` — `boundary-detector` 检测到的边界冲突

`detectBoundaryConflict(tools)` 检测三类问题：
- **覆盖过广**：单个 Tool 包含 > 8 个不同业务端点
- **拆得过碎**：多个 Tool 共享同一组资源路径
- **名称雷同**：前缀相同 + 数字后缀（如 `query_order_1` / `query_order_2`）

### 13.7 新增数据列汇总（`platform_candidate_assets`）

| 列名 | 用途 | 来源 Task |
|---|---|---|
| `confidence` / `risk_level` / `sensitive_hits` | AI 识别置信度与风险 | Task 2 |
| `needs_human_review` / `gate_reasons` / `gate_required_for` | 人工卡点提示 | Task 2 |
| `manual_screen_status` / `manual_screen_decision` / `manual_screen_by` / `manual_screen_at` / `manual_screen_reason` | 人工初筛状态 | Task 2 |
| `acceptance_passed` / `acceptance_by` / `acceptance_at` / `acceptance_checklist` / `publish_block_reason` | 发布前验收 | Task 4 |
| `ai_tools_snapshot` / `human_tools_snapshot` / `business_rule_notes` / `boundary_warning` | Tool 打造台三栏 | Task 3 |
| `retro_reason` / `retro_note` / `retro_recorded_by` / `retro_recorded_at` | 误识别复盘 | Task 6 |

### 13.8 新增 API 端点

| 端点 | 方法 | 用途 |
|---|---|---|
| `/api/platform/governance/candidates/:id/manual-screen` | POST | 记录人工初筛（approve / reject / modify） |
| `/api/platform/governance/candidates/:id/acceptance` | POST | 记录验收清单 |
| `/api/platform/governance/candidates/:id/build-tool` | POST | 保存人工修订 Tool + 业务规则 |
| `/api/platform/governance/candidates/:id/tool-snapshots` | GET | 取 AI vs 人工版本用于 diff |
| `/api/platform/governance/candidates/:id/retro` | POST | 记录复盘（仅 reject/modify） |
| `/api/platform/governance/retro-summary` | GET | 复盘汇总（按原因统计） |
| `/api/platform/governance/retro-reasons` | GET | 复盘原因枚举 |
| `/api/platform/governance/tool-edit-rules` | GET | Tool 可编辑字段清单 |
| `/api/platform/governance/acceptance-required-fields` | GET | 验收必填字段清单 |
| `/api/platform/builder/metrics` | GET | B 端价值指标（9 项） |

### 13.9 B 端价值指标

`GET /api/platform/builder/metrics` 输出 9 项核心指标（总览页卡片）：

- `total_candidates` / `total_published` / `pending_publishes` / `pending_manual_screen` / `human_review_hits` — 工作量分布
- `week_reuses` / `reuse_rate` — 复用价值
- `avg_build_cycle_hours` — 平均打造周期
- `pass_rate` — 人工通过率

### 13.10 新增模块

| 模块 | 行数 | 用途 |
|---|---|---|
| `mcp/poc/server/modules/governance/manual-checks.mjs` | ~180 | 敏感命中 / 人工门 / 验收清单 / 阻断解释 |
| `mcp/poc/server/modules/governance/retro-service.mjs` | ~104 | 复盘枚举 / 汇总 / Hint 构造 |
| `mcp/poc/server/modules/governance/boundary-detector.mjs` | ~136 | Tool 边界冲突检测 |

### 13.11 测试覆盖（14 个测试全 PASS）

```
builder 套件（9 个）：
✓ builder-value-board        价值卡片烟雾（11 条断言）
✓ builder-manual-gates       敏感字段 / 人工门（5 组）
✓ builder-publish-block      集成（真实 better-sqlite3 内存库 + 三道发布阻断）
✓ builder-retro              复盘单元（4 函数）
✓ builder-retro-integration  集成（POST /retro 端到端）
✓ builder-retro-and-tooling-smoke  HTTP API 烟雾
✓ builder-tooling            边界检测单元（3 类问题 + 严重度）
✓ builder-tooling-integration  集成（saveToolBuild 持久化）

governance 套件（4 个）：
✓ governance-api-smoke       server.js 表 / API 存在性
✓ governance-connectors      DB / OpenAPI 归一化
✓ governance-reuse-service   评分 + 分类
✓ governance-review-orchestrator  审核分流

基础设施（2 个）：
✓ server-syntax              ESM 语法
✓ renderers-import           renderers 模块导出
```

### 13.12 当前 MVP 范围与边界

**做**：
- 资料接入 → AI 识别建议 → 人工审核打造 → MCP 资产生成 → 沙箱联调 → 人工验收发布 → 交付沉淀与复用
- AI 输出的关键结果都有对应人工确认入口
- 工作台上能看到 B 端价值指标，不是只有技术过程
- 真实可演示的企业打造路径

**不做**：
- 全自动无人审核发布（保留人工卡点）
- 复杂组织权限系统和审批流平台化
- 大而全的资产治理平台重构（保留现有 governance 模块做底层）

### 13.13 与 Governance MVP 的关系

Builder Workbench **不推翻** Governance MVP，而是把它作为底层能力嵌入主链路：

- Governance MVP 提供「AI 初判 → 审核 → 发布 → 复用推荐」基础能力
- Builder Workbench 在其上叠加「人工卡点 / 验收清单 / 复盘回流 / 三栏打造台」
- 数据库表继续沿用 `platform_*` 前缀，新增列全部加在 `platform_candidate_assets` 已有表上
- 命名上工作台对外叫「Builder / 打造工作台」，对内模块仍叫 `governance`
