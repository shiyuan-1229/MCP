// ============================================================
// retro-service.mjs — 误识别复盘辅助
//
// 用途：
//   1) RETRO_REASONS：复盘原因枚举（用于标记 AI 哪里错了）
//   2) validateRetroReason：校验原因字符串合法
//   3) canRecordRetro：只有 reject / modify 决策的候选才能记录复盘
//   4) summarizeRetro：把候选列表里的复盘原因聚合
//   5) buildRetroHint：把高频误判拼成可读提示，反哺给 AI 识别
//
// 不依赖数据库，单测可独立运行。
// ============================================================

export const RETRO_REASONS = [
  { value: 'classification_error', label: '分类错误', description: 'AI 把资产/接口归到了错误的业务域' },
  { value: 'field_understanding_error', label: '字段理解错误', description: 'AI 对字段含义或类型的理解与实际不符' },
  { value: 'sensitivity_misjudge', label: '敏感判断不足', description: '漏判了手机号/身份证/金额等敏感字段' },
  { value: 'tool_boundary_error', label: '工具边界错误', description: '把不相干端点合并，或把一个能力拆得过碎' },
  { value: 'business_meaning_error', label: '业务口径错误', description: '业务规则、错误处理或返回口径与团队约定不一致' },
  { value: 'other', label: '其他', description: '未归入以上类型的问题' }
];

const RETRO_REASON_SET = new Set(RETRO_REASONS.map(r => r.value));

const RETRO_REASON_LABEL = RETRO_REASONS.reduce((acc, r) => {
  acc[r.value] = r.label;
  return acc;
}, {});

/**
 * 校验复盘原因字符串
 * @param {string} reason
 * @returns {{ok:boolean, error?:string, normalized?:string}}
 */
export function validateRetroReason(reason) {
  if (!reason || typeof reason !== 'string') {
    return { ok: false, error: 'reason must be a non-empty string' };
  }
  const normalized = reason.trim().toLowerCase();
  if (!RETRO_REASON_SET.has(normalized)) {
    return {
      ok: false,
      error: `reason must be one of: ${[...RETRO_REASON_SET].join(', ')}`
    };
  }
  return { ok: true, normalized };
}

/**
 * 判断某个候选资产是否允许记录复盘
 * 只有 reject（驳回）或 modify（修改）后才能写复盘，approve 不需要复盘
 * @param {object} candidate - 至少包含 manual_screen_decision
 * @returns {boolean}
 */
export function canRecordRetro(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  const decision = candidate.manual_screen_decision;
  return decision === 'reject' || decision === 'modify';
}

/**
 * 把候选资产列表里的复盘记录聚合成按原因的计数
 * @param {Array<{retro_reason?:string}>} candidates
 * @returns {{total:number, by_reason:object, top_reason:string|null, by_label:object}}
 */
export function summarizeRetro(candidates) {
  const by_reason = {};
  for (const reason of RETRO_REASON_SET) by_reason[reason] = 0;
  let total = 0;

  for (const c of candidates || []) {
    const reason = c?.retro_reason;
    if (!reason || !RETRO_REASON_SET.has(reason)) continue;
    by_reason[reason] = (by_reason[reason] || 0) + 1;
    total += 1;
  }

  // 排序找 top
  const sorted = Object.entries(by_reason)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  const top_reason = sorted.length ? sorted[0][0] : null;

  const by_label = {};
  for (const [k, v] of Object.entries(by_reason)) {
    by_label[RETRO_REASON_LABEL[k] || k] = v;
  }

  return { total, by_reason, by_label, top_reason };
}

/**
 * 把复盘汇总拼成给 AI 的提示语
 * 频次 ≥ 2 的原因会单独点名
 * @param {object} summary - summarizeRetro 输出
 * @param {{top?:number}} [options] - top 限制只显示前 N 个原因
 * @returns {string}
 */
export function buildRetroHint(summary, options = {}) {
  if (!summary || !summary.total || summary.total <= 0) return '';

  const top = Math.max(1, Number(options.top) || 3);
  const ranked = Object.entries(summary.by_reason || {})
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, top);

  if (!ranked.length) return '';

  const lines = ranked.map(([reason, count]) => {
    const label = RETRO_REASON_LABEL[reason] || reason;
    return `· ${label}（${count} 次）`;
  });

  return [
    '【历史高频误判提示】',
    '团队最近对 AI 识别结果有如下驳回/修订，请重点确认：',
    ...lines
  ].join('\n');
}

export const RETRO_REASON_LABELS = RETRO_REASON_LABEL;