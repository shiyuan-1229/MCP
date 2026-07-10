const fs = require('fs');
const p = 'D:/桌面/mcp方案/mcp/poc/admin/assets/modules/renderers.js';
let s = fs.readFileSync(p, 'utf8');
const literalReplacements = [
  ["  const suffix = row.certificateDaysLeft == null ? '' : ` · ${row.certificateDaysLeft >= 0 ? `${row.certificateDaysLeft} 天` : '已过�?}`;", "  const suffix = row.certificateDaysLeft == null ? '' : ` · ${row.certificateDaysLeft >= 0 ? `${row.certificateDaysLeft} 天` : '已过期'}`;"],
  ["    selectControl('owner', '负责�?, options.owners.map(value => ({ value, label: value })), filters.owner),", "    selectControl('owner', '负责人', options.owners.map(value => ({ value, label: value })), filters.owner),"],
  ["    selectControl('healthStatus', '健康状��?, options.healthStatuses.map(value => ({ value, label: healthText[value] || value })), filters.healthStatus),", "    selectControl('healthStatus', '健康状态', options.healthStatuses.map(value => ({ value, label: healthText[value] || value })), filters.healthStatus),"],
  ["    <div class=\"filter-summary\"><span>显示 ${text(visible)} / ${text(total)} 个项�?/span><button type=\"button\" class=\"ghost-btn small\" id=\"resetProjectFilters\">重置</button></div>`;", "    <div class=\"filter-summary\"><span>显示 ${text(visible)} / ${text(total)} 个项目</span><button type=\"button\" class=\"ghost-btn small\" id=\"resetProjectFilters\">重置</button></div>`;"],
  ["    return Array.isArray(parsed) && parsed.length ? parsed.join('�?) : '�?;", "    return Array.isArray(parsed) && parsed.length ? parsed.join('、') : '-';"],
  ["    return value || '�?;", "    return value || '-';"]
];
for (const [from, to] of literalReplacements) {
  if (!s.includes(from)) throw new Error(`missing literal: ${from}`);
  s = s.replace(from, to);
}
s = s.replace(/const customerPageMeta = \{[\s\S]*?\n\};/, `const customerPageMeta = {
  summary: { title: '我的项目', eyebrow: '我的交付与运行状态' },
  knowledge: { title: '我的业务资料', eyebrow: '文档、索引与检索效果' },
  access: { title: '我的运行配置', eyebrow: '证书、Webhook 与环境状态' },
  publish: { title: '测试发布', eyebrow: '我的版本、测试结果与回滚状态' },
  usage: { title: '调用统计', eyebrow: '我的调用、成功率与异常' },
  billing: { title: '计费结算', eyebrow: '账期、对账与回款状态' },
  deliverables: { title: '交付中心', eyebrow: '配置包、报告、日志与知识导出' }
};`);
fs.writeFileSync(p, s, 'utf8');
console.log('patched batch1');
