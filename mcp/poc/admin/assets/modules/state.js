import { ADMIN_NAVIGATION_GROUPS } from './guidance.js';
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
  deliveryPackageRecords: [],
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
  customerOverview: null,
  customerAssetDetail: null,
  customerTrialResult: null,
  customerLiveUpdatedAt: '',
  customerDeliverableFilters: { projectId: 'all', type: 'all', status: 'all', query: '' },
  customerTrends: null,
  accessGuide: null,
  // 客户侧：AI 需求生成 MCP
  builderRequests: [],
  customerBuilderHistory: readStoredJson('mcp_customer_builder_history', []),
  customerBuilderMessages: [],
  customerBuilderDraft: localStorage.getItem('mcp_customer_builder_draft') || '',
  customerBuilderResult: null,
  customerBuilderDetailTab: 'tools',
  customerBuilderCurrentSessionId: '',
  customerBuilderSelectedHistoryId: null,
  customerBuilderHistoryOpen: false,
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
  selectedDeliverableVersions: [],
  deliveryAiRequirements: '',
  deliveryVersionSaving: false,
  deliveryRepairDrawerOpen: false,
  deliveryRepairProjectId: '',
  knowledgeDrawerOpen: false,
  projectDetailLoading: false,
  projectSaving: false,
  projectDetails: {},
  projectDrafts: {},
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
  monitoringFilters: {
    status: 'all',
    assetId: 'all',
    toolName: 'all',
    timeRange: '24h',
    query: ''
  },
  monitoringFocusId: null,
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
  candidates: [],
  reviews: [],
  toolDrafts: [],
  governanceDemoOverview: null,
  pendingWorkBuddyAssetId: '',
  selectedCandidateId: '',
  settingsTab: 'overview',
  settingsNotificationPreferences: { credentialExpiry: true, callFailure: true, deliveryReady: true },
  guidanceFocus: { projectId: '', assetId: '', focusId: '', reason: '' },
  currentPage: 'summary'
};

const legacyNavItems = [
  { id: 'summary', label: '打造总览', icon: '📊', desc: '资产生成全链路漏斗、产能趋势与动态', roles: ['admin', 'customer'] },
  { id: 'intake', label: '资料接入', icon: '📥', desc: '步骤 1：上传业务资料、连接数据库，触发 AI 识别', roles: ['admin'] },
  { id: 'recognition', label: 'AI 识别结果', icon: '🔍', desc: '步骤 2：查看 AI 识别出的 OpenAPI 端点草案与接口详情', roles: ['admin'] },
  { id: 'candidates', label: '候选业务能力', icon: '🧩', desc: '步骤 3：AI 提取的候选业务能力，查看来源证据与业务域分类', roles: ['admin'] },
  { id: 'review', label: '候选接口人工初筛', icon: '✅', desc: '步骤 4：人工审核候选业务能力是否可信，高风险候选双人复核', roles: ['admin'] },
  { id: 'tooling', label: '人工确认 Tool 边界', icon: '🔧', desc: '步骤 5：确认 Tool 名称、参数边界、读写权限与安全规则', roles: ['admin'] },
  { id: 'tool-draft', label: '生成 Tool 草稿', icon: '📝', desc: '步骤 6：Tool 边界确认后生成 Tool 草稿，供 MCP 组装使用', roles: ['admin'] },
  { id: 'mcp-compose', label: '人工确认 MCP 组成', icon: '🧱', desc: '步骤 7：按业务场景确认 MCP 由哪些 Tool 组成', roles: ['admin'] },
  { id: 'assets', label: '生成 MCP 草稿', icon: '📦', desc: '步骤 8：组装 MCP 草稿并管理 MCP 资产', roles: ['admin'] },
  { id: 'publish', label: '上线 MCP 版本', icon: '🚀', desc: '步骤 9：沙箱试调、灰度发布、版本管理与回滚', roles: ['admin', 'customer'] },
  { id: 'delivery', label: '交付包管理', icon: '📋', desc: '步骤 10：交付团队归档与复盘，配置包、测试报告、调用日志等交付物', roles: ['admin'] },
  { id: 'monitoring', label: '调用监控', icon: '📈', desc: '步骤 11：异常优先查看 Tool 调用、Trace ID 和诊断动作', roles: ['admin'] },
    { id: 'settings', label: '设置', icon: '⚙️', desc: 'API 凭证管理、知识库资料、计费与结算配置', roles: ['admin'] }
];
export const navItems = ADMIN_NAVIGATION_GROUPS.flatMap(group => group.items.map(item => ({ ...item, groupId: group.id, roles: ['admin'] })));
export const customerNavItems = [
  { id: 'customer-overview', label: '\u4ea4\u4ed8\u603b\u89c8', roles: ['customer'] },
  { id: 'my-assets', label: '\u6211\u7684 MCP \u8d44\u4ea7', roles: ['customer'] },
  { id: 'my-usage', label: '\u8fd0\u884c\u4e0e\u6548\u679c', roles: ['customer'] },
  { id: 'my-deliverables', label: '\u4ea4\u4ed8\u4e0e\u652f\u6301', roles: ['customer'] },
  { id: 'my-access', label: '\u63a5\u5165\u914d\u7f6e', roles: ['customer'] },
  { id: 'my-billing', label: '\u8d26\u5355\u7ba1\u7406', roles: ['customer'] }];
export function isCustomerView() {
  return state.user?.role === 'customer';
}

export function getNavItems() {
  return isCustomerView() ? customerNavItems : navItems;
}

export const statusText = {
  published: '已上线',
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








