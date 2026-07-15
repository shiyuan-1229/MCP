/**
 * 完整端到端测试：通过 MCP 协议调用 generate_chart，保存 SVG 文件验证
 * 运行: node test-e2e.js
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const tests = [
  {
    name: "bar-monthly-sales",
    args: {
      type: "bar",
      data: [
        { label: "1月", value: 120 },
        { label: "2月", value: 200 },
        { label: "3月", value: 150 },
        { label: "4月", value: 80 },
      ],
      title: "月度销售额",
    },
  },
  {
    name: "line-user-growth",
    args: {
      type: "line",
      data: [
        { label: "周一", value: 100 },
        { label: "周二", value: 180 },
        { label: "周三", value: 250 },
        { label: "周四", value: 300 },
        { label: "周五", value: 420 },
      ],
      title: "周活跃用户趋势",
      color: "#91cc75",
    },
  },
  {
    name: "pie-device-share",
    args: {
      type: "pie",
      data: [
        { name: "iOS", value: 4500 },
        { name: "Android", value: 3800 },
        { name: "Web", value: 1200 },
        { name: "其他", value: 500 },
      ],
      title: "用户设备分布",
    },
  },
  {
    name: "scatter-height-weight",
    args: {
      type: "scatter",
      data: [
        { x: 160, y: 55 }, { x: 170, y: 65 }, { x: 175, y: 70 },
        { x: 180, y: 75 }, { x: 165, y: 58 }, { x: 172, y: 68 },
      ],
      title: "身高体重分布",
      color: "#ee6666",
    },
  },
];

async function main() {
  console.log("=== MCP E2E 测试：通过 MCP 协议调用 generate_chart ===\n");

  // 创建 InMemory 双向 transport
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  // 动态 import server.js（但它会自动启动 stdio transport...）
  // 我们需要另一种方式：重新构造 server，不自动启动。
  // 解决：用子进程方式跑 server.js 的 handler 逻辑太复杂，
  // 换方案：直接从 server.js 源码中提取渲染函数。

  // 最实用的方案：把渲染逻辑提取为独立模块，server.js 和测试共用。
  // 但为了不修改 server.js 结构，我们这里用 import subprocess。

  // ── 最终方案：子进程 stdin/stdout 模拟 MCP JSON-RPC ──
  const { spawn } = await import("child_process");
  const nodePath = process.execPath;
  const serverPath = join(__dirname, "server.js");

  const child = spawn(nodePath, [serverPath], {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let buffer = "";
  const pending = new Map();
  let msgId = 0;

  function sendRequest(method, params) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      const msg = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n";
      pending.set(id, { resolve, reject });
      child.stdin.write(msg);
    });
  }

  function handleMessage(msg) {
    if (msg.id !== undefined && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  }

  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop();
    for (const line of lines) {
      if (line.trim()) {
        try {
          handleMessage(JSON.parse(line));
        } catch (e) {
          // not JSON, skip
        }
      }
    }
  });

  child.stderr.on("data", (d) => {
    // server 的 stderr 日志，忽略
  });

  // 等待 server 启动
  await new Promise((r) => setTimeout(r, 500));

  // 1. 初始化握手
  console.log("1. MCP initialize 握手...");
  const initResult = await sendRequest("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "test-client", version: "1.0.0" },
  });
  console.log("   ✓ 握手成功, server:", initResult.serverInfo.name);

  // 发送 initialized 通知
  child.stdin.write(
    JSON.stringify({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }) + "\n"
  );

  // 2. 列出工具
  console.log("\n2. 查询工具列表...");
  const toolsResult = await sendRequest("tools/list", {});
  console.log(
    "   ✓ 可用工具:",
    toolsResult.tools.map((t) => t.name).join(", ")
  );

  // 3. 逐个测试
  let passed = 0;
  for (const tc of tests) {
    console.log(`\n3.${passed + 1} 调用 generate_chart: ${tc.name}...`);
    const result = await sendRequest("tools/call", {
      name: "generate_chart",
      arguments: tc.args,
    });

    // 从返回的 content 中提取 SVG
    const svgContent = result.content.find(
      (c) => c.type === "text" && c.text.startsWith("<svg")
    );

    if (svgContent) {
      const outPath = join(__dirname, `test-output-${tc.name}.svg`);
      writeFileSync(outPath, svgContent.text);
      console.log(`   ✓ SVG 生成成功 (${svgContent.text.length} bytes) → ${outPath}`);

      // 验证 SVG 基本结构
      const hasSvgTag = svgContent.text.includes("<svg");
      const hasCloseTag = svgContent.text.includes("</svg>");
      const hasData = tc.args.type === "pie"
        ? svgContent.text.includes("path")
        : svgContent.text.includes("rect") || svgContent.text.includes("circle") || svgContent.text.includes("path");

      if (hasSvgTag && hasCloseTag && hasData) {
        console.log("   ✓ SVG 结构验证通过");
        passed++;
      } else {
        console.log("   ✗ SVG 结构异常");
      }
    } else if (result.isError) {
      console.log("   ✗ 工具返回错误:", result.content[0]?.text);
    } else {
      console.log("   ✗ 未找到 SVG 输出");
      console.log("   返回内容:", JSON.stringify(result.content).slice(0, 200));
    }
  }

  // 4. 测试 suggest_chart
  console.log("\n4. 调用 suggest_chart...");
  const suggestResult = await sendRequest("tools/call", {
    name: "suggest_chart",
    arguments: {
      data: [
        { name: "A", value: 10 },
        { name: "B", value: 20 },
        { name: "C", value: 15 },
      ],
    },
  });
  console.log(
    "   ✓ 推荐结果:",
    suggestResult.content[0]?.text
  );

  // 总结
  console.log(`\n=== 测试完成: ${passed}/${tests.length} 图表渲染通过 ===`);
  console.log("生成的 SVG 文件保存在 viz-mcp-server/ 目录下，可用浏览器打开查看。");

  child.kill();
  process.exit(passed === tests.length ? 0 : 1);
}

main().catch((err) => {
  console.error("测试失败:", err);
  process.exit(1);
});
