/**
 * AI Engine - 大模型驱动的企业数据识别 → OpenAPI → MCP Tool 转换引擎
 * 接入 CCSwitch Codex（OpenAI 兼容接口）
 *
 * 环境变量：
 *   AI_API_BASE    - 模型 API 基地址（默认 https://api.ccswitch.com/v1）
 *   AI_API_KEY     - 模型 API Key
 *   AI_MODEL       - 模型名称（默认 deepseek-coder）
 */

// 延迟读取环境变量（ES Module import 在 .env 加载前执行，需惰性读取）
function getAI_API_BASE() { return process.env.AI_API_BASE || 'https://api.ccswitch.com/v1'; }
function getAI_API_KEY() { return process.env.AI_API_KEY || ''; }
function getAI_MODEL() { return process.env.AI_MODEL || 'deepseek-coder'; }

// ============================================================
// 核心调用：向大模型发送请求（支持 Responses API 和 Chat Completions API）
// ============================================================
async function chatCompletion(messages, options = {}) {
  const AI_API_KEY = getAI_API_KEY();
  if (!AI_API_KEY) {
    throw new Error('未配置 AI_API_KEY 环境变量，请在 .env 中设置大模型 API Key');
  }

  const model = options.model || getAI_MODEL();
  const apiBase = getAI_API_BASE();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeout || 120000);

  // Responses API 格式：Codex 平台使用 /responses 端点
  // input 格式为字符串或消息数组
  const systemMsg = messages.find(m => m.role === 'system')?.content || '';
  const userMsgs = messages.filter(m => m.role !== 'system');
  const inputText = userMsgs.map(m => m.content).join('\n\n');

  const body = {
    model,
    input: inputText,
    instructions: systemMsg,
    ...(options.temperature != null ? { temperature: options.temperature } : {}),
    ...(options.max_tokens ? { max_output_tokens: options.max_tokens } : {}),
  };

  const url = `${apiBase}/responses`;

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AI_API_KEY}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });

    if (!resp.ok) {
      const errText = await resp.text().catch(() => '');
      throw new Error(`模型 API 返回 ${resp.status}: ${errText.slice(0, 500)}`);
    }

    const data = await resp.json();
    // Responses API 返回格式：output[].content[].text 或 output_text
    let content = '';
    if (data.output_text) {
      content = data.output_text;
    } else if (Array.isArray(data.output)) {
      const msgItem = data.output.find(o => o.type === 'message');
      if (msgItem?.content) {
        content = msgItem.content.map(c => c.text || '').join('');
      }
    }

    const usage = data.usage || {};

    return { content, usage: { total_tokens: usage.total_tokens || usage.input_tokens + usage.output_tokens || 0, input_tokens: usage.input_tokens || 0, output_tokens: usage.output_tokens || 0 }, raw: data };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('模型 API 请求超时（120s）');
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================
// 安全提取 JSON（从大模型返回文本中提取 JSON 对象/数组）
// ============================================================
function extractJSON(text) {
  if (!text) return null;
  // 去掉 ```json ... ``` 包裹
  let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  // 尝试直接解析
  try { return JSON.parse(cleaned); } catch { /* continue */ }
  // 找第一个 { 或 [ 到最后一个 } 或 ]
  const firstBrace = cleaned.search(/[{[]/);
  const lastBrace = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const slice = cleaned.slice(firstBrace, lastBrace + 1);
    try { return JSON.parse(slice); } catch { /* continue */ }
  }
  return null;
}

// ============================================================
// 阶段1: AI 识别企业数据 → 生成结构化接口分析
// ============================================================
export async function analyzeBusinessData(sourceMeta) {
  const { name, type, auth_mode, description, sampleContent } = sourceMeta;

  const systemPrompt = `你是一个资深的企业 API 架构师和安全顾问。你的任务是分析企业提供的业务数据/资料，识别出其中包含的 API 接口、数据表、业务功能，并为每个识别出的能力生成标准的 OpenAPI 3.0 端点描述。

同时，你需要对每个接口/工具进行安全分级：
- public（公开）：只读查询类、不含个人信息的数据（如商品列表、门店信息、公告），可以对外暴露
- internal（内部）：涉及个人信息、财务数据、权限、敏感字段（如手机号、身份证、订单金额、会员信息），仅限内部调用

输出要求：
- 返回严格的 JSON 格式
- 不要输出任何其他文本
- JSON 结构如下：
{
  "summary": "对该业务数据的整体分析总结（中文）",
  "data_type": "REST API | Database | Knowledge Base | Mixed",
  "endpoints": [
    {
      "name": "接口中文名称",
      "method": "GET|POST|PUT|DELETE",
      "path": "/api/xxx/yyy",
      "description": "接口功能描述",
      "category": "分类名称，如：商品管理|库存管理|会员管理|订单管理|数据分析|系统配置",
      "visibility": "public|internal",
      "sensitivity_reason": "如果标记为 internal，说明涉及哪些敏感数据（如：包含会员手机号和身份证信息）",
      "parameters": [
        { "name": "参数名", "in": "query|path|body", "type": "string|number|boolean|date", "required": true, "description": "参数说明" }
      ],
      "response_example": { "示例字段": "示例值" }
    }
  ],
  "tables": [
    { "name": "表名", "description": "表用途", "fields": [{ "name": "字段名", "type": "类型", "description": "说明" }] }
  ],
  "suggested_tools": [
    {
      "tool_name": "snake_case 工具名（英文）",
      "display_name": "工具中文名",
      "category": "分类名称",
      "description": "工具功能描述",
      "visibility": "public|internal",
      "sensitivity_reason": "如果标记为 internal，说明涉及哪些敏感数据",
      "parameters": [
        { "name": "参数名", "type": "string|number|boolean", "required": true, "description": "参数说明" }
      ]
    }
  ]
}`;

  const userPrompt = `请分析以下企业业务数据资料：

资料名称：${name}
资料类型：${type}
认证方式：${auth_mode}
描述：${description || '无'}

${sampleContent ? `资料内容/样例：\n${sampleContent.slice(0, 8000)}` : '（未提供详细内容，请根据资料名称和类型推断合理的接口定义）'}

请识别其中的接口/数据表/业务功能，生成结构化的分析结果。`;

  const { content, usage } = await chatCompletion([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userPrompt }
  ], { temperature: 0.2, max_tokens: 4096 });

  const parsed = extractJSON(content);
  if (!parsed) {
    throw new Error('AI 返回内容无法解析为 JSON，请检查模型输出或重试');
  }

  return {
    analysis: parsed,
    rawContent: content,
    usage,
    model: getAI_MODEL(),
    analyzedAt: new Date().toISOString().slice(0, 19).replace('T', ' ')
  };
}

// ============================================================
// 阶段2: 将分析结果转换为标准 OpenAPI 3.0 spec
// ============================================================
export function analysisToOpenAPISpec(analysis, sourceName) {
  const endpoints = analysis.endpoints || [];
  const paths = {};

  for (const ep of endpoints) {
    const method = (ep.method || 'GET').toLowerCase();
    if (!paths[ep.path]) paths[ep.path] = {};

    const parameters = (ep.parameters || []).map(p => ({
      name: p.name,
      in: p.in || 'query',
      required: p.required || false,
      schema: { type: p.type || 'string' },
      description: p.description || ''
    }));

    paths[ep.path][method] = {
      operationId: ep.name ? snakeCase(ep.name) : `op_${Object.keys(paths).length}`,
      summary: ep.name || '',
      description: ep.description || '',
      tags: ep.category ? [ep.category] : [],
      ...(parameters.length ? { parameters } : {}),
      responses: {
        '200': {
          description: '成功响应',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: ep.response_example
                  ? Object.fromEntries(Object.entries(ep.response_example).map(([k, v]) => [k, { type: typeof v, example: v }]))
                  : { result: { type: 'string' } }
              }
            }
          }
        }
      }
    };
  }

  // 如果没有端点，生成一个默认查询端点
  if (Object.keys(paths).length === 0) {
    paths['/api/query'] = {
      get: {
        operationId: 'query',
        summary: `${sourceName || '业务'} 查询`,
        description: analysis.summary || '',
        parameters: [{ name: 'keyword', in: 'query', schema: { type: 'string' } }],
        responses: { '200': { description: '查询结果' } }
      }
    };
  }

  return {
    openapi: '3.0.0',
    info: {
      title: sourceName || 'AI 识别结果',
      version: '1.0.0',
      description: analysis.summary || '由 AI 引擎自动生成的 OpenAPI 3.0 规范'
    },
    paths,
    tags: [...new Set(endpoints.map(ep => ep.category).filter(Boolean))].map(name => ({ name }))
  };
}

// ============================================================
// 阶段3: 将分析结果转换为分类的 MCP Tool 定义
// ============================================================
export function analysisToTools(analysis) {
  const suggested = analysis.suggested_tools || analysis.endpoints || [];

  const tools = suggested.map(item => {
    // 兼容 suggested_tools 和 endpoints 两种格式
    const params = item.parameters || [];
    const properties = {};
    const required = [];

    for (const p of params) {
      properties[p.name] = {
        type: p.type || 'string',
        description: p.description || ''
      };
      if (p.required) required.push(p.name);
    }

    return {
      name: item.tool_name || snakeCase(item.name || 'tool'),
      display_name: item.display_name || item.name || '',
      description: item.description || '',
      category: item.category || '未分类',
      visibility: item.visibility === 'public' ? 'public' : 'internal',
      sensitivity_reason: item.sensitivity_reason || '',
      inputSchema: {
        type: 'object',
        properties,
        required
      }
    };
  });

  // 按 category 分组
  const categorized = {};
  for (const tool of tools) {
    const cat = tool.category || '未分类';
    if (!categorized[cat]) categorized[cat] = [];
    categorized[cat].push(tool);
  }

  return { tools, categories: categorized };
}

// ============================================================
// 辅助：中文/特殊字符 → snake_case
// ============================================================
function snakeCase(str) {
  if (!str) return 'tool';
  return String(str)
    .replace(/[\u4e00-\u9fa5]/g, '_')  // 中文替换为下划线
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\s\-\.\/]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase() || 'tool';
}

// ============================================================
// 治理 MVP：基于归一化源生成 CandidateAsset 列表
// 当前是 stub：返回结构化的占位结果，便于 Task 3/4 串联。
// 后续会接入真实大模型做业务分类与敏感识别。
// ============================================================
export async function generateGovernanceCandidates({ sourceName, normalizedSource, historicalRetroSummary }) {
  // 复用 manual-checks：基于字段名自动识别敏感字段
  let detectSensitiveHits = null;
  let buildManualGate = null;
  let buildRetroHint = null;
  try {
    const mod = await import('./modules/governance/manual-checks.mjs');
    detectSensitiveHits = mod.detectSensitiveHits;
    buildManualGate = mod.buildManualGate;
  } catch {
    detectSensitiveHits = null;
    buildManualGate = null;
  }
  try {
    const retroMod = await import('./modules/governance/retro-service.mjs');
    buildRetroHint = retroMod.buildRetroHint;
  } catch {
    buildRetroHint = null;
  }

  // 把历史复盘汇总拼成提示（如果存在）
  const retroHint = buildRetroHint && historicalRetroSummary
    ? buildRetroHint(historicalRetroSummary, { top: 3 })
    : '';

  const items = Array.isArray(normalizedSource?.tables)
    ? normalizedSource.tables.map(table => {
        const sensitive_hits = detectSensitiveHits ? detectSensitiveHits(table.fields || []) : [];
        const candidate = {
          name: table.name,
          businessDomain: 'unclassified',
          confidence: 0.72,
          riskLevel: sensitive_hits.length > 0 ? 'high' : 'medium',
          sensitive_hits,
          fields: table.fields || []
        };
        const gate = buildManualGate ? buildManualGate(candidate) : { needs_human_review: false, gate_reasons: [], gate_required_for: [] };
        return {
          name: candidate.name,
          business_domain: candidate.businessDomain,
          confidence: candidate.confidence,
          risk_level: candidate.riskLevel,
          sensitive_hits: candidate.sensitive_hits,
          needs_human_review: gate.needs_human_review,
          gate_reasons: gate.gate_reasons,
          gate_required_for: gate.gate_required_for
        };
      })
    : Array.isArray(normalizedSource?.endpoints)
      ? normalizedSource.endpoints.map(ep => {
          const sensitive_hits = detectSensitiveHits ? detectSensitiveHits(ep.parameters || []) : [];
          const method = String(ep.method || 'GET').toUpperCase();
          const candidate = {
            name: ep.summary || ep.path,
            business_domain: 'unclassified',
            confidence: 0.72,
            risk_level: method === 'DELETE' || method === 'PUT' || method === 'POST' ? 'high' : 'low',
            operation: method.toLowerCase(),
            sensitive_hits
          };
          const gate = buildManualGate ? buildManualGate(candidate) : { needs_human_review: false, gate_reasons: [], gate_required_for: [] };
          return {
            name: candidate.name,
            business_domain: 'unclassified',
            confidence: 0.72,
            risk_level: candidate.risk_level,
            operation: candidate.operation,
            sensitive_hits,
            needs_human_review: gate.needs_human_review,
            gate_reasons: gate.gate_reasons,
            gate_required_for: gate.gate_required_for
          };
        })
      : [{
          name: sourceName || 'unknown',
          business_domain: 'unclassified',
          confidence: 0.5,
          risk_level: 'medium',
          sensitive_hits: [],
          needs_human_review: true,
          gate_reasons: ['AI 无法识别业务类型，需要人工初筛'],
          gate_required_for: ['product_owner']
        }];

  return {
    sourceName: sourceName || 'unknown',
    retro_hint: retroHint,
    retro_summary: historicalRetroSummary || null,
    candidates: items
  };
}

// ============================================================
// 完整流水线：分析 → OpenAPI → Tools（一站式）
// ============================================================
export async function runFullPipeline(sourceMeta) {
  // 阶段1: AI 分析
  const analysisResult = await analyzeBusinessData(sourceMeta);

  // 阶段2: 生成 OpenAPI
  const openapiSpec = analysisToOpenAPISpec(analysisResult.analysis, sourceMeta.name);

  // 阶段3: 生成分类 Tools
  const { tools, categories } = analysisToTools(analysisResult.analysis);

  return {
    analysis: analysisResult.analysis,
    openapiSpec,
    tools,
    categories,
    usage: analysisResult.usage,
    model: analysisResult.model,
    rawContent: analysisResult.rawContent,
    analyzedAt: analysisResult.analyzedAt
  };
}

// ============================================================
// 检查 AI 引擎是否可用
// ============================================================
export function isAIConfigured() {
  return !!getAI_API_KEY();
}

export function getAIConfig() {
  return {
    configured: isAIConfigured(),
    apiBase: getAI_API_BASE(),
    model: getAI_MODEL(),
    hasKey: !!getAI_API_KEY()
  };
}
