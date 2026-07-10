# 企业 MCP 平台收口改造实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 MCP Forge POC 从“零售门店 AI 助手”收口为“企业 MCP 打造与治理平台”，并补齐两个核心 Demo Tool，让产品故事围绕 MCP 生成、发布、治理、统计、计费闭环展开。

**Architecture:** 保留现有 Node.js + Express + SQLite + 单页后台原型结构，不做大规模拆分。第一阶段通过最小改动统一产品定位、收口导航、补充核心 MCP Tool、调整客户侧展示；第二阶段再考虑抽取真实客户/项目/MCP 资产模型。

**Tech Stack:** Node.js ESM, Express, better-sqlite3, MCP SDK, HTML/CSS/Vanilla JS.

---

## 一、改造原则

1. 产品主语统一为“企业 MCP 打造与治理平台”。
2. 零售、会员、销售 TopN 只作为 Demo 场景，不作为产品本体。
3. 后台主线围绕“客户 -> 项目 -> 数据源 -> MCP 能力 -> 测试 -> 发布 -> 网关 -> 调用统计 -> 计费”。
4. 商品、库存、订单、销售等业务页面降级为“示例数据源 / Demo 场景”。
5. 客户侧后台只展示 MCP 资产、效果看板、文件下载。
6. 安全治理能力前置展示：认证、授权、审计、脱敏、限流、追踪。
7. 收费模型统一为实施费、年费/能力包、调用量/效果费。

---

## 二、文件改动范围

### 1. 文档

- Modify: `mcp/企业MCP打造与治理平台产品方案.md`
  - 作为总纲母版，必要时补充本次实现状态。
- Create: `mcp/企业MCP平台收口改造实施计划.md`
  - 记录本次改造任务与执行顺序。

### 2. 主后台前端

- Modify: `mcp/poc/admin/index.html`
  - 改产品定位文案。
  - 收口侧边导航。
  - 客户侧“数据看板”改名为“效果看板”。
  - 将“AI 中心”“同步演示”等入口降级为 Demo，不作为客户主导航。
  - 客户首页改为 MCP 资产与效果摘要。
  - 网关与治理页强化认证、授权、审计、脱敏、限流。

### 3. 主后台服务端

- Modify: `mcp/poc/server/server.js`
  - 新增 `sales_top_products` Demo Tool。
  - 新增 `member_expiring_benefits` Demo Tool。
  - 在 `/admin/simulate-call` 中支持两个新 Tool。
  - 保持旧零售 Tool 兼容，不破坏现有 Demo。

### 4. Demo Server

- Modify: `mcp/poc/demo-server/server.js`
  - 新增 `sales_top_products`。
  - 新增 `member_expiring_benefits`。
  - 补充会员积分/优惠券到期的模拟返回。

### 5. 代码生成器

- Modify: `mcp/poc/server/codegen.js`
  - 在零售示例模板中加入两个核心 Demo Tool。
  - 让新生成的 MCP Server 也能讲通两个典型场景。

---

## 三、任务拆解

### Task 1: 写入计划文档

**Files:**
- Create: `mcp/企业MCP平台收口改造实施计划.md`

- [x] **Step 1: 创建实施计划**

使用本文件记录改造原则、文件范围和任务拆解。

- [ ] **Step 2: 自检计划**

检查计划是否覆盖用户提出的 7 项要求：

```powershell
Select-String -LiteralPath 'D:\桌面\mcp方案\mcp\企业MCP平台收口改造实施计划.md' -Pattern '产品主语|导航|sales_top_products|member_expiring_benefits|客户侧|客户 -> 项目|认证|实施费'
```

Expected: 能看到所有关键项。

---

### Task 2: 统一产品定位与导航收口

**Files:**
- Modify: `mcp/poc/admin/index.html`

- [ ] **Step 1: 修改登录页与顶栏定位**

将“零售门店 AI 助手”类文案改为“企业 MCP 打造与治理平台”，保留零售作为示例场景。

- [ ] **Step 2: 收口管理员导航**

管理员主导航保留：

```text
项目工作台
MCP 工厂
知识库维护
测试与发布
网关与治理
使用统计
计费管理
操作审计
```

其中“Skill 场景包”“接入配置”若保留，改成页面内模块或后续入口，不作为主导航。

- [ ] **Step 3: 收口客户侧导航**

客户侧主导航保留：

```text
客户首页
MCP 资产
效果看板
文件下载
```

将 AI 中心、同步演示、商品运营、订单/销售业绩降级为 Demo 场景入口，不在客户主导航露出。

- [ ] **Step 4: 验证导航关键词**

Run:

```powershell
Select-String -LiteralPath 'D:\桌面\mcp方案\mcp\poc\admin\index.html' -Pattern '企业 MCP 打造与治理平台|效果看板|使用统计|零售门店 AI 助手|AI 中心|同步演示'
```

Expected:
- 能看到新的产品定位。
- 客户主导航不再露出 AI 中心、同步演示。

---

### Task 3: 补齐两个核心 Demo Tool

**Files:**
- Modify: `mcp/poc/server/server.js`
- Modify: `mcp/poc/demo-server/server.js`
- Modify: `mcp/poc/server/codegen.js`

- [ ] **Step 1: 新增 `sales_top_products`**

Tool 行为：

```json
{
  "name": "sales_top_products",
  "description": "查询销售 TopN 商品，支持门店、时间范围和 Top N",
  "arguments": {
    "store_id": "optional string",
    "date_range": "optional string",
    "top_n": "optional number"
  }
}
```

返回内容包含：

- 排名。
- 商品名。
- 销售额。
- 销量。
- 贡献占比。
- 查询范围。

- [ ] **Step 2: 新增 `member_expiring_benefits`**

Tool 行为：

```json
{
  "name": "member_expiring_benefits",
  "description": "查询会员积分、即将到期积分和即将到期优惠券",
  "arguments": {
    "member_id": "optional string"
  }
}
```

返回内容包含：

- 会员姓名。
- 当前积分。
- 即将到期积分。
- 积分到期日。
- 可用优惠券。
- 即将到期优惠券。
- 建议动作。

- [ ] **Step 3: 在模拟调用里支持新 Tool**

`/admin/simulate-call` 对两个新 Tool 返回结构化数据，方便前端 AI 演示复用。

- [ ] **Step 4: 语法检查**

Run:

```powershell
node --check mcp\poc\server\server.js
node --check mcp\poc\demo-server\server.js
node --check mcp\poc\server\codegen.js
```

Expected: 三个命令均 exit 0。

---

### Task 4: 客户侧改为资产与效果视角

**Files:**
- Modify: `mcp/poc/admin/index.html`

- [ ] **Step 1: 客户首页改成摘要**

客户首页展示：

```text
已交付 MCP
已发布 MCP
本月调用
转化效果
```

快捷问题改为：

```text
查销售 Top10 商品
查会员积分和到期权益
查看 MCP 调用效果
下载本月交付报告
```

- [ ] **Step 2: MCP 资产页强化状态**

MCP 资产表字段：

```text
MCP 名称
覆盖能力
状态
今日调用
成功率
平均响应
操作
```

- [ ] **Step 3: 效果看板强化业务效果**

效果看板展示：

```text
调用量
成功率
平均响应
领券数
核销数
转化数
知识库命中率
```

- [ ] **Step 4: 文件下载保留交付材料**

文件下载展示：

```text
MCP 配置包
上线测试报告
调用日志 CSV
效果复盘报告
知识库导出
```

---

### Task 5: 安全能力前置展示

**Files:**
- Modify: `mcp/poc/admin/index.html`

- [ ] **Step 1: 网关与治理页增加安全 KPI**

展示：

```text
认证方式覆盖
授权策略数
审计日志数
脱敏命中数
限流拦截数
```

- [ ] **Step 2: 增加治理规则说明**

规则卡片包括：

```text
认证方式：API Key / OAuth / JWT
授权范围：Agent、用户、部门、MCP 能力
审计日志：调用方、参数摘要、结果摘要、trace_id
数据脱敏：手机号、会员号、订单号、金额
限流熔断：客户级、应用级、接口级
```

---

### Task 6: 统一收费模型

**Files:**
- Modify: `mcp/poc/admin/index.html`
- Modify: `mcp/企业MCP打造与治理平台产品方案.md`

- [ ] **Step 1: 计费页面文案统一**

将“门店注册费”等零售 SaaS 口径统一为：

```text
实施费
年费/能力包
调用量/效果费
私有化部署费
```

- [ ] **Step 2: 总纲补充实现映射**

在总纲中标注本次后台与 Tool 改造对应关系。

---

### Task 7: 验证与回归

**Files:**
- Check: `mcp/poc/server/server.js`
- Check: `mcp/poc/demo-server/server.js`
- Check: `mcp/poc/server/codegen.js`
- Check: `mcp/poc/admin/index.html`

- [ ] **Step 1: 语法检查**

Run:

```powershell
node --check mcp\poc\server\server.js
node --check mcp\poc\demo-server\server.js
node --check mcp\poc\server\codegen.js
```

Expected: 全部 exit 0。

- [ ] **Step 2: 关键文案检查**

Run:

```powershell
Select-String -LiteralPath 'D:\桌面\mcp方案\mcp\poc\admin\index.html','D:\桌面\mcp方案\mcp\poc\server\server.js','D:\桌面\mcp方案\mcp\poc\demo-server\server.js' -Pattern '企业 MCP 打造与治理平台|sales_top_products|member_expiring_benefits|效果看板|实施费|年费/能力包|调用量/效果费'
```

Expected: 所有关键字均能命中。

- [ ] **Step 3: 保留旧 Demo 兼容性**

检查以下旧 Tool 仍存在：

```powershell
Select-String -LiteralPath 'D:\桌面\mcp方案\mcp\poc\server\server.js','D:\桌面\mcp方案\mcp\poc\demo-server\server.js' -Pattern 'product_search|inventory_query|member_points|coupon_query|kb_search'
```

Expected: 旧 Tool 仍能命中。

---

## 四、分阶段执行建议

### 第一阶段：今天完成

- 写入计划文档。
- 改产品定位。
- 收口导航。
- 新增两个核心 Demo Tool。
- 客户侧改为资产与效果视角。
- 完成语法检查。

### 第二阶段：后续优化

- 抽象真实客户/项目/MCP 资产数据模型。
- 将前端硬编码数据迁移为接口数据。
- 增加审计日志详情页。
- 增加效果报告导出。
- 增加 Playwright 截图验证。

---

## 五、执行状态

- [x] Task 1: 写入计划文档
- [ ] Task 2: 统一产品定位与导航收口
- [ ] Task 3: 补齐两个核心 Demo Tool
- [ ] Task 4: 客户侧改为资产与效果视角
- [ ] Task 5: 安全能力前置展示
- [ ] Task 6: 统一收费模型
- [ ] Task 7: 验证与回归
