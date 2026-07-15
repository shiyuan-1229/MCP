# 数据可视化 MCP Server

把数据可视化能力封装成 MCP Tool，让任何支持 MCP 协议的 AI Agent 都能通过标准协议调用画图。

## 为什么用纯 SVG？

| 方案 | 依赖 | Windows 兼容 | 输出 |
|------|------|-------------|------|
| ~~ECharts + canvas~~ | node-canvas（原生编译） | 需要 VS Build Tools | PNG |
| **纯 SVG（本方案）** | **零原生依赖** | **开箱即用** | **SVG** |

纯 JS 生成 SVG，全平台零配置运行。AI Agent 拿到 SVG 后可以直接展示、保存为文件、或嵌入网页。

## 提供的工具

| 工具 | 功能 | 输入 | 输出 |
|------|------|------|------|
| `generate_chart` | 生成图表 | type + data + title | SVG 字符串 |
| `suggest_chart` | 推荐图表类型 | data | 推荐类型 + 理由 |

## 支持的图表类型

- **bar** - 柱状图（分类对比）
- **line** - 折线图（趋势展示）
- **pie** - 饼图（比例分布）
- **scatter** - 散点图（相关性分析）

## 快速开始

```bash
cd mcp/poc/viz-mcp-server
npm install
node server.js   # 启动 MCP Server (stdio 模式)
```

## 测试

```bash
# E2E 测试：通过 MCP 协议完整调用，生成 4 种图表的 SVG 文件
node test-e2e.js
```

测试会生成 `test-output-*.svg` 文件，可直接用浏览器打开查看渲染效果。

## 接入 WorkBuddy

编辑 `~/.workbuddy/mcp.json`，添加：

```json
{
  "mcpServers": {
    "viz-server": {
      "command": "node",
      "args": ["D:/桌面/mcp方案/mcp/poc/viz-mcp-server/server.js"]
    }
  }
}
```

然后在 WorkBuddy 的「连接器管理」页面点击 Trust 即可启用。

## 调用示例

AI Agent 通过 MCP 协议发起的调用等价于：

```javascript
// 工具: generate_chart
{
  "name": "generate_chart",
  "arguments": {
    "type": "bar",
    "data": [
      { "label": "1月", "value": 120 },
      { "label": "2月", "value": 200 },
      { "label": "3月", "value": 150 }
    ],
    "title": "Q1 销售额"
  }
}
// 返回: { content: [{ type: "text", text: "<svg>...</svg>" }] }
```

## 技术栈

- `@modelcontextprotocol/sdk` ^1.6.0 — MCP 协议实现
- 纯 JS SVG 渲染 — 零原生依赖

## 架构定位

这是 MCP Forge 平台中「数据源接入 → MCP 资产封装」的一个具体案例：

```
企业数据 (DB/API) → MCP Server (本服务) → AI Agent 调用 → 返回 SVG 图表
                              ↑
                     MCP Forge 平台统一注册、治理、计费
```

可以把这个 server 作为模板，扩展更多图表类型、数据源连接、甚至交互式仪表盘能力。
