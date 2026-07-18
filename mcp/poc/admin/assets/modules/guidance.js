export const ADMIN_PAGE_IDS = [
  'summary', 'intake', 'recognition', 'candidates', 'review', 'tooling',
  'tool-draft', 'mcp-compose', 'assets', 'publish', 'delivery',
  'monitoring', 'governance', 'settings'
];

export const ADMIN_NAVIGATION_GROUPS = [
  {
    id: 'today',
    label: '今日工作',
    items: [{ id: 'summary', label: '今日待办', icon: '✓', desc: '按交付影响排序的待办、阻断项与继续处理入口' }]
  },
  {
    id: 'production',
    label: '资产生产',
    items: [
      { id: 'intake', label: '资料接入', icon: '①', desc: '上传并检查业务资料与数据源' },
      { id: 'recognition', label: 'AI 识别与审核', icon: '②', desc: '识别、候选能力和人工审核' },
      { id: 'tooling', label: '组装 MCP 资产', icon: '③', desc: 'Tool 边界、Tool 草稿、MCP 组成与草稿' },
      { id: 'publish', label: '测试与发布', icon: '④', desc: '测试、版本、发布与回滚' },
      { id: 'delivery', label: '交付确认', icon: '⑤', desc: '交付包、验收和确认' }
    ]
  },
  {
    id: 'support',
    label: '辅助工作',
    items: [
      { id: 'assets', label: '项目资产库', icon: '▣', desc: '跨项目查看资产、版本和阶段' },
      { id: 'monitoring', label: '治理运营', icon: '◉', desc: '调用异常、Trace、审计与策略' },
      { id: 'settings', label: '平台设置', icon: '⚙', desc: '权限、凭证、知识、计费和 AI 配置' }
    ]
  }
];

const pageToNavigationId = {
  candidates: 'recognition',
  review: 'recognition',
  'tool-draft': 'tooling',
  'mcp-compose': 'tooling',
  governance: 'monitoring'
};

export function getNavigationIdForPage(pageId) {
  return pageToNavigationId[pageId] || pageId;
}

export function isAdminPage(pageId) {
  return ADMIN_PAGE_IDS.includes(pageId);
}

export function deriveGuidedWork(snapshot = {}) {
  const list = key => Array.isArray(snapshot[key]) ? snapshot[key] : [];
  const tasks = [];
  const add = (priority, stage, pageId, actionLabel, item, reason, focusId = '') => {
    tasks.push({
      id: `${stage}:${item?.id || focusId || tasks.length}`,
      priority,
      stage,
      pageId,
      actionLabel,
      projectId: item?.project_id || '',
      assetId: item?.asset_id || item?.id || '',
      focusId,
      reason
    });
  };

  list('candidates')
    .filter(item => item.stage === 'risk_review')
    .forEach(item => add(1, 'review', 'review', '\u5904\u7406\u9ad8\u98ce\u9669\u5ba1\u6838', item, '\u9ad8\u98ce\u9669\u5019\u9009\u5c1a\u672a\u5b8c\u6210\u5ba1\u6838'));
  list('sources')
    .filter(item => item.status === 'connected' && item.recognition_status !== 'completed')
    .forEach(item => add(2, 'intake', 'intake', '\u63d0\u4ea4 AI \u8bc6\u522b', item, '\u8d44\u6599\u5df2\u63a5\u5165\uff0c\u5c1a\u672a\u5f62\u6210\u8bc6\u522b\u7ed3\u679c'));
  list('toolDrafts')
    .filter(item => item.status === 'draft')
    .forEach(item => add(3, 'tooling', 'tooling', '\u786e\u8ba4 Tool \u8fb9\u754c', item, 'Tool \u8349\u7a3f\u5c1a\u672a\u786e\u8ba4\u8fb9\u754c'));
  list('assets')
    .filter(item => item.status === 'acceptance_failed')
    .forEach(item => {
      const event = list('events').find(row => row.asset_id === item.id && Number(row.status_code) >= 500);
      add(4, 'publish', 'publish', '\u4fee\u590d\u540e\u91cd\u65b0\u6d4b\u8bd5', item, '\u9a8c\u6536\u6216\u8fd0\u884c\u9a8c\u8bc1\u5931\u8d25', event?.id || '');
    });
  list('deliverables')
    .filter(item => item.status !== 'ready')
    .forEach(item => add(5, 'delivery', 'delivery', '\u8865\u9f50\u4ea4\u4ed8\u5305', item, '\u4ea4\u4ed8\u6750\u6599\u5c1a\u672a\u9f50\u5168'));

  return tasks.sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
}
