# MCP Forge · 微信 AI 接入方案

> 如何将已搭建的 MCP Server 接入微信 AI 生态
> 更新日期：2026-07-02

---

## 三种接入路径总览

| 路径 | 接入方式 | 难度 | 适用场景 | 状态 |
|------|---------|:----:|---------|:----:|
| **路径 A：腾讯元器** | 注册为 MCP 自定义插件，关联到智能体 | ⭐ 低 | 快速验证、企业级 AI 应用 | ✅ 已开放 |
| **路径 B：微信小程序 AI** | 封装为 SKILL，嵌入微信小程序 | ⭐⭐⭐ 高 | 深度集成、面向 C 端顾客 | 🔒 内测中 |
| **路径 C：WorkBuddy 连接器** | 配置为 MCP Server，WorkBuddy 直接调用 | ⭐ 低 | 内部运营、企业员工使用 | ✅ 已开放 |

**推荐优先级**：路径 A（最快见效）→ 路径 C（内部先用）→ 路径 B（长期深耕）

---

## 路径 A：腾讯元器（推荐 · 最快）

### 整体流程

```
你部署的 MCP Server (SSE)
        │
        ▼
腾讯元器 → 注册为自定义 MCP 插件
        │
        ▼
创建智能体应用 → 关联 MCP 插件 → 配置提示词
        │
        ▼
发布为 API / 嵌入 H5 / 关联微信小程序
```

### 第一步：部署 MCP Server（已完成）

你的 POC Server 已在 `localhost:3100` 运行，支持 SSE 协议：

```
SSE 端点: http://localhost:3100/sse
健康检查: http://localhost:3100/health
Tool 列表: http://localhost:3100/api/tools
```

> 生产环境需部署到公网可访问的地址（如云服务器），并配置 HTTPS。

### 第二步：在腾讯元器注册 MCP 插件

1. 打开 [腾讯元器](https://yuanqi.tencent.com)
2. 进入「插件广场」→「接入 MCP 插件」
3. 填写 MCP Server 信息：

| 字段 | 值 | 说明 |
|------|----|------|
| 名称 | 零售门店 AI 助手 | 插件的显示名称 |
| 描述 | 提供商品查询、库存查询、会员积分、下单支付等零售门店能力 | 告诉 AI 这个插件能做什么 |
| URL | `https://你的域名/sse` | MCP Server 的 SSE 端点 |
| 协议 | SSE (Streamable HTTP) | MCP 标准传输协议 |

4. 保存后插件进入「插件广场」→「我的插件」
5. 点击「测试」验证插件是否正常响应

### 第三步：创建智能体应用

1. 在腾讯元器创建「智能体应用」
2. 在「工具」设置中添加刚才注册的 MCP 插件
3. 编写系统提示词：

```
你是一个零售门店 AI 助手，可以帮助用户：
1. 查询附近门店信息和营业状态
2. 搜索商品、查询价格和库存
3. 查看会员信息和积分
4. 查询当前促销活动
5. 下单购买商品

使用工具时注意：
- 查库存前先让用户确认商品名称
- 下单前先展示商品信息和价格让用户确认
- 促销活动自动附加在推荐内容中
```

4. 选择模型（建议使用混元或 DeepSeek）
5. 保存并发布

### 第四步：分发给用户

腾讯元器支持多种分发方式：

| 方式 | 说明 | 适用场景 |
|------|------|---------|
| **API 调用** | 通过元器 API 集成到自己的应用中 | 企业自用 |
| **H5 嵌入** | 生成对话窗口，嵌入网页 | 商家管理后台 |
| **微信小程序** | 关联到已有小程序 | C 端顾客 |
| **企业微信** | 发布为企业微信应用 | 内部员工使用 |
| **API 密钥共享** | 生成 API 密钥给第三方调用 | ISV 集成 |

### 第五步（可选）：配置 OAuth 认证

如果 MCP Server 需要用户身份认证，在元器中配置 OAuth：

1. 编辑 MCP 插件 → 「认证配置」
2. 选择「使用者授权」模式
3. 填写 OAuth 授权 URL 和 Token URL
4. 用户首次对话时会自动跳转授权

---

## 路径 B：微信小程序 AI 开发模式（深度集成）

### 整体流程

```
微信小程序
  └── skills/              # SKILL 独立分包
       └── retail-skill/   # 零售门店 SKILL
            ├── SKILL.md   # 业务说明（给 AI 看）
            ├── mcp.json   # 接口声明
            ├── index.js   # 接口注册
            ├── apis/      # 原子接口实现
            └── components/# 原子组件（GUI 卡片）
```

### 目前状态

> ⚠️ 微信小程序 AI 开发模式目前处于**内测阶段**，需在微信公众平台申请白名单。
> 当前阶段不可提交审核，建议先用腾讯元器方案验证，等正式开放后再迁移。

### 核心概念映射

| MCP Forge | 微信小程序 AI |
|-----------|-------------|
| MCP Tool | 原子接口（API） |
| MCP Resource | 知识库数据 |
| Tool 返回的 JSON | 结构化数据 → 渲染为 GUI 卡片 |
| 对话流程 | 业务流程（SKILL.md 中定义） |
| 12 个零售 Tool | 5 个核心原子接口（推荐精简） |

### 接入步骤（当内测开放后）

#### 1. 项目结构

```
miniprogram/
├── app.json                         # 配置 SKILL 分包
├── skills/
│   └── retail-skill/                # 零售门店 SKILL
│       ├── SKILL.md                 # 业务说明文档
│       ├── mcp.json                 # 接口声明
│       ├── index.js                 # 接口注册
│       ├── apis/
│       │   ├── queryProduct.js      # 商品查询
│       │   ├── queryInventory.js    # 库存查询
│       │   ├── queryMember.js       # 会员查询
│       │   ├── queryPromotions.js   # 促销查询
│       │   └── createOrder.js       # 创建订单
│       └── components/
│           ├── product-card/        # 商品卡片
│           ├── inventory-card/      # 库存卡片
│           ├── member-card/         # 会员卡片
│           ├── promotion-card/      # 促销卡片
│           └── order-card/          # 订单确认卡片
└── pages/
```

#### 2. app.json 配置

```json
{
  "subPackages": [{
    "root": "skills",
    "pages": [],
    "independent": true
  }],
  "agent": {
    "skills": [{
      "name": "retail",
      "description": "便利店业务：查商品、查库存、看促销、会员信息、下单支付",
      "path": "skills/retail-skill"
    }]
  }
}
```

#### 3. mcp.json 接口声明

```json
{
  "apis": [
    {
      "name": "queryProduct",
      "description": "搜索商品，按关键词返回匹配的商品列表",
      "inputSchema": {
        "type": "object",
        "properties": {
          "keyword": { "type": "string", "description": "搜索关键词" }
        },
        "required": ["keyword"]
      },
      "_meta": {
        "ui": { "componentPath": "components/product-card/index" }
      }
    },
    {
      "name": "queryInventory",
      "description": "查询指定商品在各门店的库存数量",
      "inputSchema": {
        "type": "object",
        "properties": {
          "productName": { "type": "string", "description": "商品名称" },
          "storeId": { "type": "string", "description": "门店ID" }
        },
        "required": ["productName"]
      },
      "_meta": {
        "ui": { "componentPath": "components/inventory-card/index" }
      }
    },
    {
      "name": "queryMember",
      "description": "查询会员信息和积分",
      "inputSchema": {
        "type": "object",
        "properties": {}
      },
      "_meta": {
        "ui": { "componentPath": "components/member-card/index" }
      }
    },
    {
      "name": "queryPromotions",
      "description": "查询当前所有促销活动",
      "inputSchema": { "type": "object", "properties": {} },
      "_meta": {
        "ui": { "componentPath": "components/promotion-card/index" }
      }
    },
    {
      "name": "createOrder",
      "description": "创建订单并完成支付",
      "inputSchema": {
        "type": "object",
        "properties": {
          "productName": { "type": "string", "description": "商品名称" },
          "quantity": { "type": "number", "description": "数量" },
          "storeId": { "type": "string", "description": "门店ID" }
        },
        "required": ["productName", "quantity", "storeId"]
      },
      "_meta": {
        "ui": { "componentPath": "components/order-card/index" }
      }
    }
  ],
  "components": [
    { "path": "components/product-card/index" },
    { "path": "components/inventory-card/index" },
    { "path": "components/member-card/index" },
    { "path": "components/promotion-card/index" },
    { "path": "components/order-card/index" }
  ]
}
```

#### 4. SKILL.md 业务说明

```markdown
# 零售门店业务 SKILL

## 业务流程

用户意图
  │
  ├─ 查商品（"有 xx 吗"） → queryProduct → 展示商品卡片
  │                          用户选择商品
  │                            ↓
  │                      queryInventory → 展示库存卡片
  │
  ├─ 查优惠（"有啥活动"） → queryPromotions → 展示促销卡片
  │
  ├─ 查会员（"查积分"）  → queryMember → 展示会员卡片
  │
  └─ 下单（"买 xx"）    → queryProduct → createOrder → 支付

## 业务约束
- 下单前必须先查库存，库存不足时不能下单
- 所有 ID 必须来自上游接口返回值，禁止编造
- 下单后必须等待支付成功才能宣布结果
- 促销活动信息自动附加在商品推荐中
```

---

## 路径 C：WorkBuddy 连接器（企业内部先用）

### 整体流程

```
你的 MCP Server (SSE)
        │
        ▼
WorkBuddy → 配置 MCP 连接器 → 在对话中直接调用零售 Tool
        │
        ▼
员工可用自然语言在 WorkBuddy 中：
  "查一下天河北店的元气森林库存"
  "帮我下一个订单"
```

### 配置步骤

1. 打开 WorkBuddy → 连接器管理 → MCP Server
2. 添加新连接器：

```json
{
  "mcpServers": {
    "retail-assistant": {
      "url": "http://localhost:3100/sse",
      "type": "sse"
    }
  }
}
```

3. 保存并启用
4. 在对话中输入："帮我查查天河北店有没有元气森林"

---

## 与微信 AI 专属卡 / 微信支付的集成

你们的 **微信 AI 专属卡** 能力是整个方案的关键闭环环节。接入方式：

### 支付链路

```
用户确认下单
    │
    ▼
MCP Server.create_order() → 返回订单金额和取货码
    │
    ▼
AI Agent 调用微信支付 JSAPI
    │
    ▼
用户指纹/密码确认 → 扣款成功
    │
    ▼
返回取货码给用户
```

### 技术对接

微信 AI 专属卡支付需要：
1. 在微信商户平台开通 AI 支付能力
2. 在小程序/元器应用中配置支付参数
3. MCP Server 的 `createOrder` Tool 返回订单信息后，由 AI Agent 调起支付

---

## 生产部署建议

### 1. 部署 MCP Server 到云端

```bash
# 推荐：使用云函数或 Docker 部署
docker build -t mcp-forge-retail .
docker run -d -p 3100:3100 mcp-forge-retail

# 配置 Nginx 反向代理 + HTTPS
# 确保 SSE 端点公网可访问
```

### 2. 安全加固

| 措施 | 说明 | 优先级 |
|------|------|--------|
| HTTPS | 微信/元器要求 HTTPS | P0 |
| API Key 认证 | MCP Server 增加 Bearer Token 验证 | P0 |
| 调用频率限制 | 防止恶意刷接口 | P1 |
| 数据脱敏 | 返回用户信息时隐藏手机号等敏感字段 | P1 |
| 访问白名单 | 只允许元器/微信的 IP 调用 | P2 |

### 3. 监控告警

对接腾讯云监控或自建，关注：
- MCP Server 在线率
- Tool 调用成功率
- 平均响应延迟
- 错误类型分布

---

## 推荐实施路线

```
第 1 周 ── 路径 A：腾讯元器注册 MCP 插件（1 天搞定）
              ↓ 内部验证工具是否正常调用
第 2 周 ── 路径 C：WorkBuddy 配置连接器
              ↓ 内部员工先用上
第 3-4 周 ─ 路径 A 进阶：发布元器应用到微信小程序
              ↓ 面向 C 端顾客
第 5-8 周 ─ 路径 B 预备：等微信 AI 内测开放后迁移
              ↓ 更深度的原生体验
长期     ── 接入微信 AI 专属卡支付，完成交易闭环
```

**现在就可以做的事**：
1. 把 MCP Server 部署到公网（临时可用 ngrok: `ngrok http 3100`）
2. 在腾讯元器注册 MCP 插件，验证调用
3. 内部通过 WorkBuddy 先体验完整流程
