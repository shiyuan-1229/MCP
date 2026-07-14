const sourceNames = [
  ['demo_src_order_api', '订单 OpenAPI', 'OpenAPI'],
  ['demo_src_order_db', '订单数据库', 'Database'],
  ['demo_src_refund_api', '退款接口说明', 'OpenAPI'],
  ['demo_src_customer_xlsx', '客户字段表', 'Excel'],
  ['demo_src_inventory_api', '库存服务接口', 'OpenAPI'],
  ['demo_src_knowledge', '售后知识库', 'Knowledge Base']
];

const candidateNames = [
  '订单查询', '订单明细查询', '订单状态更新', '退款申请',
  '退款审批', '客户画像查询', '客户手机号导出', '库存查询',
  '库存调整', '售后工单查询', '售后工单创建', '营销标签写入'
];

export const GOVERNANCE_DEMO_SCENARIOS = {
  sources: sourceNames.map(([id, name, type]) => ({ id, name, type, status: 'recognized' })),
  candidates: candidateNames.map((name, index) => ({
    id: `demo_candidate_${index + 1}`,
    name,
    stage: index < 3 ? 'rejected' : index < 7 ? 'risk_review' : index < 9 ? 'tool_draft' : 'mcp_draft',
    ai_reason: index % 2 === 0 ? '同一业务域、相同权限范围和读写类型' : 'AI 建议按业务动作拆分',
    manual_change: index < 3 ? '人工初筛驳回：缺少业务责任边界' : '人工保留并补充边界说明',
    sensitive: index >= 4 && index < 8,
    operation_type: index === 2 || index === 3 || index === 4 || index === 8 || index === 10 || index === 11 ? 'write' : 'read'
  })),
  toolDrafts: Array.from({ length: 9 }, (_, index) => ({
    id: `demo_tool_draft_${index + 1}`,
    name: `${candidateNames[index + 3]} Tool 草稿`,
    status: 'draft',
    version: 'v0.1.0',
    change_reason: index % 2 === 0 ? '按权限范围拆分' : '合并同一只读业务动作'
  })),
  mcpDrafts: [
    { id: 'demo_mcp_order_read', name: '订单查询 MCP', status: 'ready_to_publish', tool_draft_ids: ['demo_tool_draft_1', 'demo_tool_draft_2'] },
    { id: 'demo_mcp_inventory_read', name: '库存查询 MCP', status: 'ready_to_publish', tool_draft_ids: ['demo_tool_draft_5'] },
    { id: 'demo_mcp_refund_write', name: '退款处理 MCP', status: 'acceptance_failed', tool_draft_ids: ['demo_tool_draft_3', 'demo_tool_draft_4'] },
    { id: 'demo_mcp_after_sales', name: '售后工单 MCP', status: 'published', tool_draft_ids: ['demo_tool_draft_7', 'demo_tool_draft_8'] }
  ],
  reviewExamples: [
    {
      id: 'review_example_order_status',
      stage: 'candidate_review',
      title: '订单状态更新候选能力',
      risk: '中风险',
      ai_suggestion: '将订单状态查询与状态更新合并为一个订单管理能力。',
      human_decision: '人工初筛后拆分，写操作不能与只读查询共用同一业务边界。',
      reason: '状态更新会影响履约流程，需要独立权限和操作留痕。'
    },
    {
      id: 'review_example_customer_export',
      stage: 'tool_review',
      title: '客户手机号导出 Tool',
      risk: '高风险',
      ai_suggestion: '生成 customer_mobile_export Tool，支持按客户标签批量导出。',
      human_decision: '限制为脱敏手机号和单次查询，转双人审核。',
      reason: '手机号属于敏感字段，批量导出超出默认数据访问范围。'
    },
    {
      id: 'review_example_order_mcp',
      stage: 'tool_review',
      title: '订单查询 MCP 组成',
      risk: '低风险',
      ai_suggestion: '将订单查询、订单明细、物流状态三个 Tool 组合为一个 MCP。',
      human_decision: '保留三个只读 Tool，确认组合为订单查询 MCP。',
      reason: '三个 Tool 使用同一只读权限和同一服务对象，适合复用。'
    },
    {
      id: 'review_example_refund_acceptance',
      stage: 'publish_acceptance',
      title: '退款处理 MCP 发布前验收',
      risk: '高风险',
      ai_suggestion: '退款申请和退款审核通过后直接生成可发布 MCP。',
      human_decision: '验收拦截，要求退款写操作补充二次确认与审批记录。',
      reason: '安全检测返回 HTTP 403，需要先完成权限整改。',
      trace_id: 'trace_demo_refund_403'
    }
  ],
  acceptanceFailures: [
    {
      mcp_id: 'demo_mcp_refund_write',
      check: '安全检测：退款写操作缺少二次确认',
      status: 'failed',
      status_code: 403,
      trace_id: 'trace_demo_refund_403',
      monitor_path: '/admin?view=usage&trace=trace_demo_refund_403'
    },
    {
      mcp_id: 'demo_mcp_customer_export',
      check: '权限审核：客户手机号导出超出授权范围',
      status: 'failed',
      status_code: 401,
      trace_id: 'trace_demo_customer_export_401',
      monitor_path: '/admin?view=usage&trace=trace_demo_customer_export_401'
    },
    {
      mcp_id: 'demo_mcp_inventory_adjust',
      check: '调用异常：库存调整上游服务不可用',
      status: 'failed',
      status_code: 500,
      trace_id: 'trace_demo_inventory_adjust_500',
      monitor_path: '/admin?view=usage&trace=trace_demo_inventory_adjust_500'
    }
  ],
  valueMetrics: {
    asset_cycle_days: 2.6,
    risk_items_intercepted: 4,
    reused_assets: 3,
    repeated_work_reduction: 38,
    publishable_mcps: 2
  }
};
