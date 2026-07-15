/**
 * MCP Forge - Data Visualization MCP Server (Pure SVG)
 * -------------------------------------------------------
 * 零原生依赖，纯 JS 生成 SVG 图表，Windows / Linux / macOS 全平台可跑。
 *
 * Tools:
 *   1. generate_chart  - 根据数据+类型生成 SVG 图表
 *   2. suggest_chart   - 根据数据特征推荐图表类型
 *
 * 运行: node server.js  (stdio 模式)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ─── 调色板 ───────────────────────────────────────────────────

const PALETTE = [
  "#5470c6", "#91cc75", "#fac858", "#ee6666", "#73c0de",
  "#3ba272", "#fc8452", "#9a60b4", "#ea7ccc", "#5d7092",
];

// ─── 工具函数 ─────────────────────────────────────────────────

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function niceMax(val) {
  if (val <= 0) return 10;
  const mag = Math.pow(10, Math.floor(Math.log10(val)));
  const norm = val / mag;
  let nice;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * mag;
}

// ─── SVG 图表渲染器 ──────────────────────────────────────────

const W = 800, H = 500;
const PAD = { top: 50, right: 40, bottom: 60, left: 70 };

function renderBar(data, extra = {}) {
  const { title } = extra;
  const labels = data.map(d => d.label || d.name || "");
  const values = data.map(d => Number(d.value ?? d.y ?? 0));
  const maxVal = niceMax(Math.max(...values, 1));

  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const barW = chartW / data.length * 0.6;
  const gap = chartW / data.length * 0.4;

  // Y 轴刻度
  const ticks = 5;
  let yAxisSvg = "";
  for (let i = 0; i <= ticks; i++) {
    const y = PAD.top + chartH - (chartH / ticks) * i;
    const val = (maxVal / ticks) * i;
    yAxisSvg += `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="#e0e0e0" stroke-width="0.5"/>`;
    yAxisSvg += `<text x="${PAD.left - 10}" y="${y + 4}" text-anchor="end" font-size="12" fill="#999">${val.toFixed(0)}</text>`;
  }

  // 柱子
  let barsSvg = "";
  data.forEach((d, i) => {
    const x = PAD.left + i * (barW + gap) + gap / 2;
    const h = (values[i] / maxVal) * chartH;
    const y = PAD.top + chartH - h;
    const color = extra.color || PALETTE[i % PALETTE.length];
    barsSvg += `<rect x="${x}" y="${y}" width="${barW}" height="${h}" fill="${color}" rx="3"/>`;
    barsSvg += `<text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" font-size="12" fill="#333">${values[i]}</text>`;
    barsSvg += `<text x="${x + barW / 2}" y="${PAD.top + chartH + 20}" text-anchor="middle" font-size="12" fill="#666">${esc(labels[i])}</text>`;
  });

  return wrapSvg(title, yAxisSvg + barsSvg);
}

function renderLine(data, extra = {}) {
  const { title } = extra;
  const labels = data.map(d => d.label || d.name || "");
  const values = data.map(d => Number(d.value ?? d.y ?? 0));
  const maxVal = niceMax(Math.max(...values, 1));

  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;
  const stepX = chartW / Math.max(data.length - 1, 1);

  // Y 轴刻度
  const ticks = 5;
  let yAxisSvg = "";
  for (let i = 0; i <= ticks; i++) {
    const y = PAD.top + chartH - (chartH / ticks) * i;
    const val = (maxVal / ticks) * i;
    yAxisSvg += `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="#e0e0e0" stroke-width="0.5"/>`;
    yAxisSvg += `<text x="${PAD.left - 10}" y="${y + 4}" text-anchor="end" font-size="12" fill="#999">${val.toFixed(0)}</text>`;
  }

  // 点坐标
  const points = values.map((v, i) => {
    const x = PAD.left + i * stepX;
    const y = PAD.top + chartH - (v / maxVal) * chartH;
    return { x, y, v };
  });

  // 折线 path
  const pathD = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
  const lineColor = extra.color || PALETTE[0];
  let lineSvg = `<path d="${pathD}" fill="none" stroke="${lineColor}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;

  // 面积填充
  const areaD = pathD + ` L ${points[points.length - 1].x} ${PAD.top + chartH} L ${points[0].x} ${PAD.top + chartH} Z`;
  lineSvg += `<path d="${areaD}" fill="${lineColor}" opacity="0.12"/>`;

  // 数据点 + 标签
  points.forEach((p, i) => {
    lineSvg += `<circle cx="${p.x}" cy="${p.y}" r="4" fill="#fff" stroke="${lineColor}" stroke-width="2"/>`;
    lineSvg += `<text x="${p.x}" y="${p.y - 10}" text-anchor="middle" font-size="12" fill="#333">${p.v}</text>`;
    lineSvg += `<text x="${p.x}" y="${PAD.top + chartH + 20}" text-anchor="middle" font-size="12" fill="#666">${esc(labels[i])}</text>`;
  });

  return wrapSvg(title, yAxisSvg + lineSvg);
}

function renderPie(data, extra = {}) {
  const { title } = extra;
  const items = data.map(d => ({ name: d.name || d.label || "", value: Number(d.value ?? 0) }));
  const total = items.reduce((s, d) => s + d.value, 0) || 1;

  const cx = W / 2, cy = H / 2 + 10, r = 150;
  let currentAngle = -Math.PI / 2; // 从顶部开始
  let slicesSvg = "";
  let legendSvg = "";

  items.forEach((item, i) => {
    const angle = (item.value / total) * Math.PI * 2;
    const endAngle = currentAngle + angle;

    const x1 = cx + r * Math.cos(currentAngle);
    const y1 = cy + r * Math.sin(currentAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const largeArc = angle > Math.PI ? 1 : 0;

    const color = PALETTE[i % PALETTE.length];
    const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    slicesSvg += `<path d="${path}" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;

    // 百分比标签
    const midAngle = currentAngle + angle / 2;
    const labelR = r * 0.65;
    const lx = cx + labelR * Math.cos(midAngle);
    const ly = cy + labelR * Math.sin(midAngle);
    const pct = ((item.value / total) * 100).toFixed(1);
    if (angle > 0.15) {
      slicesSvg += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central" font-size="13" fill="#fff" font-weight="500">${pct}%</text>`;
    }

    // 图例
    const legY = PAD.top + 10 + i * 24;
    legendSvg += `<rect x="${W - PAD.right - 100}" y="${legY}" width="12" height="12" fill="${color}" rx="2"/>`;
    legendSvg += `<text x="${W - PAD.right - 82}" y="${legY + 10}" font-size="12" fill="#666">${esc(item.name)} (${item.value})</text>`;

    currentAngle = endAngle;
  });

  return wrapSvg(title, slicesSvg + legendSvg);
}

function renderScatter(data, extra = {}) {
  const { title } = extra;
  const points = data.map(d => ({ x: Number(d.x ?? d[0] ?? 0), y: Number(d.y ?? d[1] ?? 0) }));
  const maxX = niceMax(Math.max(...points.map(p => p.x), 1));
  const maxY = niceMax(Math.max(...points.map(p => p.y), 1));

  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  // 网格 + 刻度
  const ticks = 5;
  let axisSvg = "";
  for (let i = 0; i <= ticks; i++) {
    const y = PAD.top + chartH - (chartH / ticks) * i;
    const val = (maxY / ticks) * i;
    axisSvg += `<line x1="${PAD.left}" y1="${y}" x2="${W - PAD.right}" y2="${y}" stroke="#e0e0e0" stroke-width="0.5"/>`;
    axisSvg += `<text x="${PAD.left - 10}" y="${y + 4}" text-anchor="end" font-size="12" fill="#999">${val.toFixed(0)}</text>`;

    const x = PAD.left + (chartW / ticks) * i;
    const xval = (maxX / ticks) * i;
    axisSvg += `<text x="${x}" y="${PAD.top + chartH + 20}" text-anchor="middle" font-size="12" fill="#999">${xval.toFixed(0)}</text>`;
  }

  // 散点
  const dotColor = extra.color || PALETTE[0];
  let dotsSvg = "";
  points.forEach(p => {
    const x = PAD.left + (p.x / maxX) * chartW;
    const y = PAD.top + chartH - (p.y / maxY) * chartH;
    dotsSvg += `<circle cx="${x}" cy="${y}" r="5" fill="${dotColor}" opacity="0.7"/>`;
  });

  // 轴标签
  axisSvg += `<text x="${PAD.left + chartW / 2}" y="${H - 15}" text-anchor="middle" font-size="13" fill="#666">X</text>`;
  axisSvg += `<text x="20" y="${PAD.top + chartH / 2}" text-anchor="middle" font-size="13" fill="#666" transform="rotate(-90 20 ${PAD.top + chartH / 2})">Y</text>`;

  return wrapSvg(title, axisSvg + dotsSvg);
}

function wrapSvg(title, body) {
  const titleSvg = title
    ? `<text x="${W / 2}" y="28" text-anchor="middle" font-size="18" font-weight="500" fill="#333">${esc(title)}</text>`
    : "";

  // 坐标轴
  const axisLine = `
    <line x1="${PAD.left}" y1="${PAD.top}" x2="${PAD.left}" y2="${H - PAD.bottom}" stroke="#ccc" stroke-width="1"/>
    <line x1="${PAD.left}" y1="${H - PAD.bottom}" x2="${W - PAD.right}" y2="${H - PAD.bottom}" stroke="#ccc" stroke-width="1"/>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="background:#fff">
  ${titleSvg}
  ${axisLine}
  ${body}
</svg>`;
}

// ─── 统一渲染入口 ─────────────────────────────────────────────

function renderChart(type, data, extra = {}) {
  switch (type) {
    case "bar":     return renderBar(data, extra);
    case "line":    return renderLine(data, extra);
    case "pie":     return renderPie(data, extra);
    case "scatter": return renderScatter(data, extra);
    default:
      throw new Error(`Unsupported chart type: ${type}. Use bar / line / pie / scatter.`);
  }
}

// ─── 图表类型推荐 ─────────────────────────────────────────────

function suggestChartType(data) {
  if (!data || data.length === 0) {
    return { type: "bar", reason: "无数据，默认推荐柱状图" };
  }

  const hasXY = data.every(
    d => (d.x !== undefined && d.y !== undefined) || (Array.isArray(d) && d.length === 2)
  );
  if (hasXY) {
    return { type: "scatter", reason: "数据包含 x/y 坐标对，适合散点图" };
  }

  const hasNameValue = data.every(d => (d.name || d.label) && d.value !== undefined);
  if (hasNameValue) {
    if (data.length <= 6) {
      return { type: "pie", reason: "分类少于6项，饼图比例关系最清晰" };
    }
    return { type: "bar", reason: "分类较多，柱状图对比更直观" };
  }

  return { type: "line", reason: "数据是序列型，折线图展示趋势" };
}

// ─── MCP Server 定义 ──────────────────────────────────────────

const server = new Server(
  { name: "mcp-forge-viz-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "generate_chart",
      description:
        "Generate a chart as SVG from data. Supports: bar, line, pie, scatter. " +
        "Returns SVG string that can be rendered in any browser or saved as .svg file.",
      inputSchema: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: ["bar", "line", "pie", "scatter"],
            description: "Chart type",
          },
          data: {
            type: "array",
            description:
              "Chart data. For bar/line: [{label, value}], for pie: [{name, value}], for scatter: [{x, y}]",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                name: { type: "string" },
                value: { type: "number" },
                x: { type: "number" },
                y: { type: "number" },
              },
            },
          },
          title: { type: "string", description: "Chart title (optional)" },
          color: { type: "string", description: "Main color hex, e.g. #FF6600 (optional)" },
        },
        required: ["type", "data"],
      },
    },
    {
      name: "suggest_chart",
      description:
        "Analyze data and recommend the best chart type. Returns suggested type and reason.",
      inputSchema: {
        type: "object",
        properties: {
          data: {
            type: "array",
            description: "The data to analyze for chart type recommendation",
            items: { type: "object" },
          },
        },
        required: ["data"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "generate_chart") {
      const { type, data, title, color } = args;
      if (!type || !data || !Array.isArray(data)) {
        throw new Error("Missing required fields: type and data[]");
      }

      const svg = renderChart(type, data, { title, color });

      return {
        content: [
          {
            type: "text",
            text: `Chart generated!\n\nType: ${type}\nData points: ${data.length}\nTitle: ${title || "(none)"}\nFormat: SVG\n\nSVG content:`,
          },
          {
            type: "text",
            text: svg,
          },
        ],
      };
    }

    if (name === "suggest_chart") {
      const { data } = args;
      const suggestion = suggestChartType(data);
      return {
        content: [
          {
            type: "text",
            text: `Recommended chart type: ${suggestion.type}\nReason: ${suggestion.reason}`,
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [{ type: "text", text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// ─── 启动 ─────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[viz-mcp-server] Running on stdio. Ready for MCP calls.");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
