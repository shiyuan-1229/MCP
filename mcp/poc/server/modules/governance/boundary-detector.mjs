// ============================================================
// boundary-detector.mjs — Tool 边界冲突检测 + 人工编辑校验 + 版本对比
//
// 用途（来自 docs/superpowers/plans/builder-workbench-mvp.md Task 3）：
//   1) detectBoundaryConflict：检测 AI 把不相干端点合并或把一个能力拆得过碎
//   2) validateHumanToolEdit：校验人对 Tool 的人工编辑字段合法
//   3) diffToolSnapshots：对比 AI 原建议 vs 人工修订版本的差异
//
// 不依赖数据库，单测可独立运行。
// ============================================================

const VALID_VISIBILITY = new Set(['public', 'internal']);
const VALID_WRITE_PERMISSION = new Set(['read_only', 'controlled_write', 'unrestricted']);

// 不同业务域关键词（用于判断是否过度合并）
const BUSINESS_DOMAIN_KEYWORDS = {
  orders: /订单|order|购物车|cart/i,
  members: /会员|member|用户|user|customer/i,
  payments: /支付|pay|退款|refund|账单|bill/i,
  inventory: /库存|inventory|商品|product/i,
  marketing: /营销|活动|优惠|promotion|coupon/i,
  finance: /财务|资金|账|finance|wallet/i
};

/**
 * 判断一个 path 是否落在某个业务域
 */
function matchDomain(path) {
  const p = String(path || '');
  for (const [domain, re] of Object.entries(BUSINESS_DOMAIN_KEYWORDS)) {
    if (re.test(p)) return domain;
  }
  return null;
}

/**
 * 检测一组 Tool 是否存在边界冲突
 * - 过度合并：单个 Tool 的 paths 命中 ≥3 个不同业务域
 * - 过度拆分：≥4 个 Tool 指向同一个 path
 *
 * @param {Array<{name?:string, path?:string, paths?:string[], method?:string}>} tools
 * @returns {{has_conflict:boolean, warnings:Array<{kind:string, message:string, related_tools?:string[]}>}}
 */
export function detectBoundaryConflict(tools) {
  const warnings = [];
  if (!Array.isArray(tools) || tools.length === 0) {
    return { has_conflict: false, warnings };
  }

  // 1) 过度合并：每个 tool 的所有 paths 收集，去重后看业务域数
  for (const tool of tools) {
    const paths = Array.isArray(tool.paths) && tool.paths.length
      ? tool.paths
      : (tool.path ? [tool.path] : []);
    const domains = new Set();
    for (const p of paths) {
      const d = matchDomain(p);
      if (d) domains.add(d);
    }
    if (paths.length >= 2 && domains.size >= 3) {
      warnings.push({
        kind: 'over_merged',
        message: `Tool「${tool.name || '(未命名)'}」把 ${paths.length} 个端点合并到一处，但它们跨了 ${domains.size} 个业务域（${[...domains].join(' / ')}），边界待确认。`,
        related_tools: [tool.name]
      });
    }
  }

  // 2) 过度拆分：4+ 个 tool 指向同一 path
  const pathToTools = {};
  for (const tool of tools) {
    const paths = Array.isArray(tool.paths) && tool.paths.length
      ? tool.paths
      : (tool.path ? [tool.path] : []);
    for (const p of paths) {
      if (!pathToTools[p]) pathToTools[p] = [];
      if (tool.name) pathToTools[p].push(tool.name);
    }
  }
  for (const [p, names] of Object.entries(pathToTools)) {
    const uniq = [...new Set(names)];
    if (uniq.length >= 4) {
      warnings.push({
        kind: 'over_split',
        message: `路径「${p}」被拆成 ${uniq.length} 个 Tool（${uniq.slice(0, 3).join(', ')}${uniq.length > 3 ? '…' : ''}），过度拆分，边界待确认。`,
        related_tools: uniq
      });
    }
  }

  return {
    has_conflict: warnings.length > 0,
    warnings
  };
}

const REQUIRED_HUMAN_EDIT_FIELDS = ['name', 'display_name', 'description', 'category'];

/**
 * 校验人对 Tool 的人工编辑字段
 * @param {object} edit - 至少包含 name/display_name/description/category/visibility/write_permission_level
 * @returns {{ok:boolean, error?:string, missing?:string[], normalized?:object}}
 */
export function validateHumanToolEdit(edit) {
  if (!edit || typeof edit !== 'object') {
    return { ok: false, error: 'edit must be an object' };
  }
  const missing = REQUIRED_HUMAN_EDIT_FIELDS.filter(k => !edit[k] || String(edit[k]).trim() === '');
  if (missing.length > 0) {
    return { ok: false, error: `missing required fields: ${missing.join(', ')}`, missing };
  }
  const visibility = edit.visibility || 'internal';
  if (!VALID_VISIBILITY.has(visibility)) {
    return { ok: false, error: `visibility must be one of: ${[...VALID_VISIBILITY].join(', ')}` };
  }
  const writePermission = edit.write_permission_level || 'read_only';
  if (!VALID_WRITE_PERMISSION.has(writePermission)) {
    return { ok: false, error: `write_permission_level must be one of: ${[...VALID_WRITE_PERMISSION].join(', ')}` };
  }
  return {
    ok: true,
    normalized: {
      name: String(edit.name).trim(),
      display_name: String(edit.display_name).trim(),
      description: String(edit.description).trim(),
      category: String(edit.category).trim(),
      visibility,
      write_permission_level: writePermission,
      input_params: Array.isArray(edit.input_params) ? edit.input_params : [],
      output_summary: edit.output_summary || '',
      business_rules: edit.business_rules || ''
    }
  };
}

/**
 * 对比 AI 原建议与人工修订版本的差异
 * @param {Array<object>} aiTools
 * @param {Array<object>} humanTools
 * @returns {{changes:Array<{tool:string, field:string, ai:any, human:any}>, added:string[], removed:string[]}}
 */
export function diffToolSnapshots(aiTools, humanTools) {
  const ai = Array.isArray(aiTools) ? aiTools : [];
  const human = Array.isArray(humanTools) ? humanTools : [];
  const aiByName = new Map(ai.map(t => [t.name, t]));
  const humanByName = new Map(human.map(t => [t.name, t]));

  const changes = [];
  const FIELDS_TO_COMPARE = ['display_name', 'description', 'category', 'visibility', 'write_permission_level'];

  for (const [name, hTool] of humanByName.entries()) {
    const aTool = aiByName.get(name);
    if (!aTool) continue;
    for (const f of FIELDS_TO_COMPARE) {
      if ((aTool[f] || '') !== (hTool[f] || '')) {
        changes.push({ tool: name, field: f, ai: aTool[f] || '', human: hTool[f] || '' });
      }
    }
  }

  const aiNames = new Set(aiByName.keys());
  const humanNames = new Set(humanByName.keys());
  const added = [...humanNames].filter(n => !aiNames.has(n));
  const removed = [...aiNames].filter(n => !humanNames.has(n));

  return { changes, added, removed };
}

export const BOUNDARY_RULE_REFERENCE = {
  visibility_options: [...VALID_VISIBILITY],
  write_permission_options: [...VALID_WRITE_PERMISSION]
};