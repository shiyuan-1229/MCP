function readStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export const state = {
  token: localStorage.getItem('mcp_token') || '',
  user: null,
  summary: null,
  customers: [],
  projects: [],
  sources: [],
  assets: [],
  releases: [],
  policies: [],
  policyChanges: [],
  events: [],
  billing: [],
  deliverables: [],
  access: [],
  accessHealth: [],
  accessAudit: [],
  accessWebhook: [],
  knowledgeBases: [],
  knowledgeDetails: {},
  knowledgeTestResults: {},
  knowledgeDetailLoading: false,
  // 阶段二：客户侧数据
  customerDashboard: null,
  customerTrends: null,
  accessGuide: null,
  // 阶段三：生成流程可视化
  openapiSpecs: [],
  selectedOpenapiSpecId: '',
  customerBillingExpanded: {},
  selectedProjectId: '',
  selectedReleaseId: '',
  selectedUsageEventId: '',
  selectedBillingId: '',
  selectedDeliverableId: '',
  selectedKnowledgeId: '',
  projectDrawerOpen: false,
  publishDrawerOpen: false,
  usageDrawerOpen: false,
  billingDrawerOpen: false,
  deliverableDrawerOpen: false,
  knowledgeDrawerOpen: false,
  projectDetailLoading: false,
  projectSaving: false,
  projectDetails: {},
  projectDrafts: {},
  releaseOverrides: readStoredJson('mcp_release_overrides', {}),
  billingOverrides: readStoredJson('mcp_billing_overrides', {}),
  accessOverrides: readStoredJson('mcp_access_overrides', {}),
  projectFilters: {
    customer: 'all',
    stage: 'all',
    environment: 'all',
    owner: 'all',
    healthStatus: 'all',
    sortBy: 'milestone-asc'
  },
  publishFilters: {
    customer: 'all',
    project: 'all',
    asset: 'all',
    status: 'all',
    environment: 'all',
    risk: 'all',
    search: '',
    sortBy: 'released-desc'
  },
  usageFilters: {
    customer: 'all',
    project: 'all',
    asset: 'all',
    status: 'all',
    anomaly: 'all',
    result: 'all',
    search: '',
    sortBy: 'time-desc'
  },
  billingFilters: {
    customer: 'all',
    project: 'all',
    category: 'all',
    status: 'all',
    anomaly: 'all',
    search: '',
    sortBy: 'period-desc'
  },
  deliverableFilters: {
    project: 'all',
    type: 'all',
    status: 'all',
    search: '',
    sortBy: 'updated-desc'
  },
  knowledgeFilters: {
    customer: 'all',
    project: 'all',
    sourceStatus: 'all',
    assetStatus: 'all',
    risk: 'all',
    search: '',
    sortBy: 'updated-desc'
  },
  // 企业 MCP 打造工作台：B 端价值指标
  builderMetrics: null,
  // 复盘与复用（嵌入 MCP 资产页）
  retroSummary: null,
  retroReasons: [],
  reuseSuggestions: [],
  currentPage: 'summary'
};

export const navItems = [
  { id: 'summary', label: '生成总览', icon: '📊', desc: '资产生成全链路漏斗、产能趋势与动态', roles: ['admin', 'customer'] },
  { id: 'intake', label: '资料接入', icon: '📥', desc: '实施顾问确认资料来源 · 上传业务资料触发 AI 识别', roles: ['admin'] },
  { id: 'recognition', label: '接口识别', icon: '🔍', desc: '产品/技术确认识别结果 · 查看识别出的 OpenAPI 端点草案', roles: ['admin'] },
  { id: 'tooling', label: 'Tool 映射', icon: '🔧', desc: '产品/技术确认 Tool 边界 · 将端点映射为 MCP Tool，配置安全规则', roles: ['admin'] },
  { id: 'assets', label: 'MCP 资产', icon: '📦', desc: '已封装的 MCP Server 资产列表、版本、状态与复用/复盘信息', roles: ['admin'] },
  { id: 'publish', label: '测试发布', icon: '🚀', desc: '交付负责人验收发布 · 沙箱试调、灰度发布、版本管理与回滚', roles: ['admin', 'customer'] },
  { id: 'delivery', label: '交付管理', icon: '📋', desc: '交付团队归档与复盘 · 配置包、测试报告、调用日志等交付物下载', roles: ['admin'] },
  { id: 'governance', label: '治理与统计', icon: '🛡️', desc: '网关策略、调用监控、审计日志与使用统计', roles: ['admin'] },
  { id: 'settings', label: '设置', icon: '⚙️', desc: '客户管理、项目管理、计费配置、知识库与 API 凭证', roles: ['admin'] }
];
export const customerNavItems = [
  { id: 'my-assets', label: '\u6211\u7684 MCP \u8d44\u4ea7', roles: ['customer'] },
  { id: 'my-usage', label: '\u8c03\u7528\u7edf\u8ba1', roles: ['customer'] },
  { id: 'my-billing', label: '\u8d26\u5355\u7ba1\u7406', roles: ['customer'] },
  { id: 'my-deliverables', label: '\u4ea4\u4ed8\u7269\u4e0b\u8f7d', roles: ['customer'] },
  { id: 'my-access', label: '\u63a5\u5165\u914d\u7f6e', roles: ['customer'] }
];

export function isCustomerView() {
  return state.user?.role === 'customer';
}

export function getNavItems() {
  return isCustomerView() ? customerNavItems : navItems;
}

export const statusText = {
  published: '已发布',
  running: '运行中',
  connected: '已连接',
  indexed: '已索引',
  enabled: '启用',
  disabled: '已停用',
  ready: '可下载',
  confirmed: '已确认',
  testing: '测试中',
  tested: '测试通过',
  generating: '生成中',
  pending: '待确认',
  debugging: '调试中',
  draft: '草稿',
  overdue: '已逾期',
  paid: '已回款',
  issued: '已开票',
  rollback_ready: '可回滚',
  rolled_back: '已回滚',
  ready_to_publish: '待发布',
  draft_note: '待补充',
  'data-source': '业务资料导入',
  success: '成功',
  error: '异常',
  failed: '生成失败',
  revoked: '已撤回',
  expired: '已过期'
};

export const assetNameText = {
  sales_top_products: '销售 TopN',
  member_expiring_benefits: '权益到期提醒',
  store_service_kb: '业务知识库检索',
  work_order_lookup: '工单查询',
  quality_inspection: '质检分析',
  risk_alert: '风险预警',
  property_ticket_create: '物业报修',
  property_notice_broadcast: '通知广播',
  course_recommendation: '课程推荐',
  campus_qa: '校园问答'
};

export function displayAssetName(name) {
  return assetNameText[name] || name || '-';
}








