# 托管 MCP POC 运行与智能体真实联调 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 让已发布的 sales_top_products 由后台托管为本机 SSE MCP Server，并由现有“智能体联调台”完成真实连接、Tool 发现、调用监控和交付取证。

**Architecture:** 新增独立 POC 运行时模块负责生成资产专属 SSE 服务、管理子进程和作为 MCP Client 联调。现有 server.js 保留认证、治理门禁、SQLite 持久化和 API 编排；现有智能体联调台是唯一真实联调入口。

**Tech Stack:** Node.js ESM、Express、better-sqlite3、@modelcontextprotocol/sdk、原生 node:test、原生 JavaScript 后台。

---

## 文件结构

- Create: mcp/poc/server/modules/poc-runtime/runtime-server-code.mjs：生成资产专属 SSE MCP Server，并回传 Tool 调用事件。
- Create: mcp/poc/server/modules/poc-runtime/runtime-manager.mjs：端口、运行目录、子进程、健康检查与停止管理。
- Create: mcp/poc/server/modules/poc-runtime/mcp-client.mjs：封装 SSE 健康、连接、tools/list、tools/call。
- Create: mcp/poc/server/modules/poc-runtime/*.test.mjs：生成器、运行管理器和真实 SSE 联调测试。
- Create: tests/managed-poc-runtime-contract.test.js：后台、前端、监控和交付的集成契约测试。
- Modify: mcp/poc/server/server.js：表、门禁、运行 API、事件写入、智能体调用路径、交付下载。
- Modify: mcp/poc/admin/index.html、assets/app.js、assets/modules/state.js、assets/modules/renderers.js：使用现有页面展示运行状态和真实联调。
- Modify: .gitignore：忽略运行期生成目录。

### Task 1: 先以测试定义 SSE 运行时与 MCP Client

**Files:**
- Create: mcp/poc/server/modules/poc-runtime/runtime-server-code.mjs
- Create: mcp/poc/server/modules/poc-runtime/runtime-server-code.test.mjs
- Create: mcp/poc/server/modules/poc-runtime/mcp-client.mjs
- Create: mcp/poc/server/modules/poc-runtime/mcp-client.test.mjs

- [ ] **Step 1: 写失败测试**

~~~js
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRuntimeServerCode } from './runtime-server-code.mjs';

test('生成资产专属 SSE 服务并回传 Trace', () => {
  const code = buildRuntimeServerCode({
    instanceId: 'run_sales_1',
    assetId: 'mcp_sales_top',
    assetName: 'sales_top_products',
    tools: [{ name: 'sales_top_products', description: '销售 TopN 查询', inputSchema: { type: 'object', properties: { top_n: { type: 'number' } } } }]
  });
  assert.match(code, /app\.get\('\\/sse'/);
  assert.match(code, /app\.get\('\\/health'/);
  assert.match(code, /trace_poc_/);
  assert.match(code, /POC_EVENT_URL/);
});
~~~

- [ ] **Step 2: 确认测试失败**

Run: node --test mcp/poc/server/modules/poc-runtime/runtime-server-code.test.mjs  
Expected: FAIL，模块尚不存在。

- [ ] **Step 3: 实现运行服务源码生成器**

实现 buildRuntimeServerCode({ instanceId, assetId, assetName, tools })。它标准化资产 Tool 定义，生成独立 ESM 服务，使用 SSEServerTransport('/mcp', res) 暴露 GET /sse，使用 GET /health 返回实例、资产和 Tool 列表。

生成服务的 CallToolRequestSchema handler 必须：
- 生成 trace_poc_ 前缀 Trace ID；
- 使用仅供 POC 的 executeMockConnector(toolName, args) 返回销售 TopN 的结构化 Mock 数据；
- 成功和失败都向 POC_EVENT_URL 回传 x-poc-runtime-token、状态、耗时、Tool、参数摘要和 Trace ID；
- 在 MCP 内容中返回同一个 Trace ID；
- 对不在本期范围的 Tool 返回 isError: true，不伪造成功。

- [ ] **Step 4: 实现真实 MCP Client**

在 mcp-client.mjs 导出：

~~~js
export async function inspectRuntime(endpoint) {
  // { ok, steps, tools, latency_ms, error }
}
export async function callRuntimeTool({ endpoint, toolName, args }) {
  // { ok, trace_id, tool_name, result, latency_ms, statusCode, error }
}
~~~

使用 Client、SSEClientTransport 和 finally 中的 client.close()。检查顺序固定为 HTTP health、SSE initialize、client.listTools()；失败必须带 stage: health、connect、list_tools 或 call_tool。

- [ ] **Step 5: 写并运行真实协议测试**

测试把生成源码写入临时目录、用 process.execPath 启动，等待 /health 后断言：
- inspectRuntime 发现 sales_top_products；
- callRuntimeTool 返回 TopN 结果和 trace_poc_；
- client 关闭后测试进程可退出。

Run: node --test mcp/poc/server/modules/poc-runtime/runtime-server-code.test.mjs mcp/poc/server/modules/poc-runtime/mcp-client.test.mjs  
Expected: PASS。

- [ ] **Step 6: 提交**

~~~powershell
git add mcp/poc/server/modules/poc-runtime
git commit -m "feat: add managed MCP runtime protocol modules"
~~~

### Task 2: 实现本机运行实例、治理门禁与事件写入

**Files:**
- Create: mcp/poc/server/modules/poc-runtime/runtime-manager.mjs
- Create: mcp/poc/server/modules/poc-runtime/runtime-manager.test.mjs
- Modify: .gitignore
- Modify: mcp/poc/server/server.js:1-80,198-216,2563-2806

- [ ] **Step 1: 写运行管理器失败测试**

~~~js
test('启动实例时写入服务代码并返回本机 SSE 地址', async () => {
  const manager = createRuntimeManager({ rootDir: tempDir, spawnProcess, findOpenPort });
  const runtime = await manager.start({ runtime: { id: 'run_1' }, asset: salesAsset, eventToken: 'token' });
  assert.equal(runtime.status, 'running');
  assert.match(runtime.endpoint, /^http:\/\/127\.0\.0\.1:\d+\/sse$/);
});
~~~

增加异常退出测试，断言状态更新回调收到 failed 和退出信息。

- [ ] **Step 2: 确认测试失败**

Run: node --test mcp/poc/server/modules/poc-runtime/runtime-manager.test.mjs  
Expected: FAIL，createRuntimeManager 尚不存在。

- [ ] **Step 3: 实现运行管理器**

运行目录为 mcp/poc/server/runtime-instances/<runtimeId>/，使生成服务向上解析既有 server/node_modules。启动流程固定为：找空闲端口 → 写入 server.mjs → spawn(process.execPath, ['server.mjs']) → 最多轮询 health 5 秒 → 返回 running 或 failed。

实现 start、stop、health、markAllStoppedOnBoot。禁止 shell 拼接命令；停止时先 SIGTERM，未结束再执行受控终止。向 .gitignore 加入：

~~~gitignore
/mcp/poc/server/runtime-instances/
~~~

- [ ] **Step 4: 增加持久化表并清理残留状态**

在现有建表区域增加 platform_poc_runtime_instances（资产、release、状态、端口、SSE endpoint、事件令牌、健康时间、最近错误、最近 Trace、创建人）和 platform_poc_acceptance_runs（实例、资产、状态、步骤 JSON、Trace、执行人）。

应用启动时把旧 starting、running 记录统一标为 stopped，避免后台重启后显示虚假的运行实例。

- [ ] **Step 5: 增加运行 API 与门禁**

实现：

~~~text
GET    /api/platform/poc-runtimes
POST   /api/platform/mcp-assets/:id/poc-runtimes
POST   /api/platform/poc-runtimes/:id/stop
GET    /api/platform/poc-runtimes/:id/health
POST   /api/internal/poc-runtimes/:id/events
~~~

启动前验证资产范围、status === 'published'、存在已发布 release、通过现有 checkPublishGate，且 Tool 名称不匹配 create|update|delete|write|insert|modify。同资产已有运行实例时返回该实例。

内部事件 API 不用用户会话，必须校验实例 event_token。它将事件写入 platform_call_events：caller='智能体联调台'、business_result='poc_sse:<tool>'、请求/响应摘要、Trace ID、状态和耗时；同步更新实例最近错误与 Trace。

- [ ] **Step 6: 验证并提交**

Run: node --test mcp/poc/server/modules/poc-runtime/runtime-manager.test.mjs  
Run: node tests/governance-api-smoke.test.js  
Expected: PASS。

~~~powershell
git add .gitignore mcp/poc/server/server.js mcp/poc/server/modules/poc-runtime/runtime-manager.mjs mcp/poc/server/modules/poc-runtime/runtime-manager.test.mjs
git commit -m "feat: manage governed MCP POC runtimes"
~~~

### Task 3: 把现有智能体联调台改为唯一真实 MCP 联调入口

**Files:**
- Modify: mcp/poc/server/server.js:3520-3638
- Modify: mcp/poc/admin/index.html:260-294
- Modify: mcp/poc/admin/assets/modules/state.js:1-160
- Modify: mcp/poc/admin/assets/app.js:276-370,2800-2940
- Modify: mcp/poc/admin/assets/modules/renderers.js:1032-1130
- Create: tests/managed-poc-runtime-contract.test.js

- [ ] **Step 1: 写失败的集成契约测试**

~~~js
assert.match(server, /app\.post\("\/api\/platform\/mcp-assets\/:id\/poc-runtimes"/);
assert.match(server, /app\.post\("\/api\/platform\/poc-runtimes\/:id\/connect"/);
assert.match(server, /callRuntimeTool/);
assert.match(index, /连接真实 MCP/);
assert.match(index, /runtimeStatus/);
assert.match(app, /connectRealMcp/);
assert.match(app, /runtime_id/);
assert.match(renderers, /renderPocRuntime/);
~~~

- [ ] **Step 2: 确认失败**

Run: node tests/managed-poc-runtime-contract.test.js  
Expected: FAIL，真实运行 API 和联调台接入尚不存在。

- [ ] **Step 3: 增加联调 API，并替换 WorkBuddy 的模拟 Tool 路径**

实现：

~~~text
POST /api/platform/poc-runtimes/:id/connect
POST /api/platform/poc-runtimes/:id/call
~~~

connect 使用 inspectRuntime，写入 health、connect、Tool 发现三步的验收记录。修改 /api/workbuddy/chat：当请求带 runtime_id 时，验证该实例属于 asset_id 且为 running，再调用 callRuntimeTool。不得回退到当前 mockResult 成功分支；无运行实例时返回“请先在 MCP 资产启动 POC 实例，并在智能体联调台连接真实 MCP”。

对话响应包含：

~~~js
{
  runtime_id,
  runtime_endpoint,
  tool_calls: [{ tool, arguments, result, trace_id, latency_ms, source: 'poc_sse' }]
}
~~~

- [ ] **Step 4: 只修改既有智能体联调台**

保留 sandboxAssetSelect、安全检测按钮和对话窗口。把 deployWorkBuddyBtn 文案与行为改为“连接真实 MCP”，同一区块新增：

~~~html
<div id="runtimeStatus" class="muted-line" aria-live="polite"></div>
<div id="mcpConnectionSteps" class="runtime-connection-steps"></div>
~~~

在 state 增加 pocRuntimes、selectedRuntimeId、runtimeConnection，在 loadAll() 读取运行实例列表。实现 connectRealMcp()：选取当前资产的运行实例，调用 connect API，逐步显示 health、connect、list tools；只有发现当前 Tool 后才启用输入框。

sendAgentMessage() 发送 runtime_id，调用卡显示“真实 MCP”、Tool、耗时和 Trace ID。

- [ ] **Step 5: 验证并提交**

Run: node tests/managed-poc-runtime-contract.test.js  
Run: node tests/publish-workbench.test.js  
Run: node --test mcp/poc/admin/tests/admin-publish-clarity.test.mjs  
Expected: PASS。

~~~powershell
git add mcp/poc/server/server.js mcp/poc/admin/index.html mcp/poc/admin/assets/app.js mcp/poc/admin/assets/modules/state.js mcp/poc/admin/assets/modules/renderers.js tests/managed-poc-runtime-contract.test.js
git commit -m "feat: connect agent console to real MCP runtime"
~~~

### Task 4: 让资产、监控和交付展示 POC 证据

**Files:**
- Modify: mcp/poc/admin/index.html:220-230,294-316
- Modify: mcp/poc/admin/assets/app.js:360-620,2200-2300
- Modify: mcp/poc/admin/assets/modules/renderers.js:853-1030,1089-1420
- Modify: mcp/poc/server/server.js:2806-2820,3870-4010
- Modify: tests/managed-poc-runtime-contract.test.js

- [ ] **Step 1: 扩展失败测试**

~~~js
assert.match(server, /platform_poc_acceptance_runs/);
assert.match(server, /poc-evidence/);
assert.match(renderers, /POC 验收凭证/);
assert.match(renderers, /poc_sse/);
assert.match(app, /startPocRuntime/);
assert.match(app, /stopPocRuntime/);
~~~

- [ ] **Step 2: 确认失败**

Run: node tests/managed-poc-runtime-contract.test.js  
Expected: FAIL，资产运行卡和验收凭证尚未实现。

- [ ] **Step 3: 增加资产运行卡与真实来源标签**

在既有 MCP 资产页渲染“POC 运行实例”卡，不创建新页面。显示版本、Tool 数、状态、SSE 地址、最近健康、最近 Trace、错误摘要；提供启动、停止、前往智能体联调台、按 Trace 诊断操作。

监控中识别 business_result 的 poc_sse: 前缀，显示“真实 MCP”来源标签并复用既有诊断抽屉。

- [ ] **Step 4: 生成交付凭证**

在四步验收通过后插入或更新类型 poc-evidence 的交付物。下载接口生成 Markdown：资产与版本、Mock Connector 标记、SSE 地址、健康结果、发现 Tool、成功调用 Tool、Trace ID、耗时、执行时间和执行人。

交付闭环卡新增第六项“POC 验收凭证”，保留原配置包、测试报告、调用日志、运行说明、复盘结论。

- [ ] **Step 5: 验证并提交**

Run: node tests/managed-poc-runtime-contract.test.js  
Run: node tests/deliverables-workbench.test.js  
Run: node tests/usage-workbench.test.js  
Expected: PASS。

~~~powershell
git add mcp/poc/server/server.js mcp/poc/admin/index.html mcp/poc/admin/assets/app.js mcp/poc/admin/assets/modules/renderers.js tests/managed-poc-runtime-contract.test.js
git commit -m "feat: add MCP POC evidence and runtime visibility"
~~~

### Task 5: 执行端到端验收

**Files:**
- Modify: 仅修复前四个任务发现的测试或文案问题。

- [ ] **Step 1: 运行自动化验证**

~~~powershell
node --test mcp/poc/server/modules/poc-runtime
node tests/managed-poc-runtime-contract.test.js
node tests/governance-api-smoke.test.js
node tests/publish-workbench.test.js
node tests/deliverables-workbench.test.js
node tests/usage-workbench.test.js
node --test mcp/poc/admin/tests/admin-publish-clarity.test.mjs
~~~

Expected: 全部 PASS。

- [ ] **Step 2: 执行管理员人工验收**

在 mcp/poc/server 执行 npm start。管理员登录后：在 MCP 资产启动已发布销售 TopN 实例 → 在测试发布智能体联调台点击“连接真实 MCP” → 确认健康、连接、Tool 发现 → 发送一次销售 TopN 查询 → 用 Trace ID 在调用监控定位 → 在交付管理下载 POC 验收凭证。

- [ ] **Step 3: 验证失败诊断**

停止实例后再次连接。Expected: 联调台显示 health/connect 失败阶段和错误摘要，不标记“POC 已验证”。

- [ ] **Step 4: 最终提交**

~~~powershell
git add mcp/poc/server/server.js mcp/poc/server/modules/poc-runtime mcp/poc/admin/index.html mcp/poc/admin/assets/app.js mcp/poc/admin/assets/modules/state.js mcp/poc/admin/assets/modules/renderers.js tests/managed-poc-runtime-contract.test.js .gitignore
git commit -m "test: verify managed MCP POC runtime flow"
~~~

不提交 output/、mcp/poc/package-lock.json、mcp/poc/viz-mcp-server/ 或 mcp/poc/server/runtime-instances/。

## 自检

- Task 1-2 覆盖 SSE 服务、真实客户端、运行管理、治理门禁和事件留痕。
- Task 3 将既有智能体联调台变为唯一真实连接入口，不新增并列页面。
- Task 4 覆盖资产可视化、调用监控和交付凭证。
- Task 5 同时覆盖成功联调和失败诊断。
- 不实现公网部署、真实客户 Connector、写操作 Tool、多租户编排或新导航页面。
