// MCP Forge 三层审核阶段定义
// 统一管理审核阶段、状态、动作和原因结构

// 审核阶段枚举
export const REVIEW_STAGES = {
  CANDIDATE: 'candidate_review',      // 候选资产审核 - AI识别出来的原始候选是否可信
  TOOL: 'tool_review',               // Tool审核 - Tool组织是否合理
  PUBLISH: 'publish_acceptance'       // 发布验收 - MCP是否真的可以发布
};

// 审核状态枚举
export const REVIEW_STATUS = {
  PENDING: 'pending',                // 待审核
  APPROVED: 'approved',              // 通过
  REJECTED: 'rejected',              // 拒绝
  NEEDS_REVIEW: 'needs_review',       // 需要人工审核
  AUTOMATED_PASS: 'automated_pass',   // 自动通过
  AUTOMATED_FAIL: 'automated_fail',   // 自动失败
  MODIFIED: 'modified',              // 已修改（需要重新审核）
  BLOCKED_FOR_PUBLISH: 'blocked_for_publish' // 阻止发布
};

// 审核动作枚举
export const REVIEW_ACTIONS = {
  APPROVE: 'approve',                // 通过
  REJECT: 'reject',                  // 拒绝
  MODIFY: 'modify',                  // 修改
  ESCALATE: 'escalate',              // 升级
  RESUBMIT: 'resubmit',              // 重新提交
  AUTO_APPROVE: 'auto_approve',       // 自动通过
  AUTO_REJECT: 'auto_reject'         // 自动拒绝
};

// 审核原因结构定义
export const REVIEW_REASON = {
  // AI识别相关原因
  AI_IDENTIFICATION: {
    LOW_CONFIDENCE: 'ai_identification_low_confidence',
    AMBIGUOUS_MAPPING: 'ai_mapping_ambiguous',
    MISSING_REQUIRED: 'ai_missing_required_fields',
    INVALID_SCHEMA: 'ai_invalid_schema',
    POTENTIAL_OVERFIT: 'ai_potential_overfit',
    SOURCE_CONFLICT: 'ai_source_conflict',
    FIELD_SEMANTICS_UNSTABLE: 'ai_field_semantics_unstable',
    BUSINESS_DOMAIN_AMBIGUOUS: 'ai_business_domain_ambiguous'
  },
  // Tool组织相关原因
  TOOL_ORGANIZATION: {
    DUPLICATE_TOOL: 'tool_duplicate',
    MISSING_TOOL: 'tool_missing',
    INVALID_TOOL_NAME: 'tool_invalid_name',
    INCORRECT_INPUT: 'tool_incorrect_input',
    INCORRECT_OUTPUT: 'tool_incorrect_output',
    POORLY_NAMED: 'tool_poorly_named',
    TOOL_BOUNDARY_UNCLEAR: 'tool_boundary_unclear',
    TOOL_TOO_FRAGMENTED: 'tool_too_fragmented',
    TOOL_TOO_MERGED: 'tool_too_merged',
    EXCESSIVE_PARAMETERS: 'tool_excessive_parameters',
    SENSITIVE_FIELD_RETAINED: 'tool_sensitive_field_retained',
    PERMISSION_SCOPE_TOO_WIDE: 'tool_permission_scope_too_wide',
    WRITE_OPERATION_RISK: 'tool_write_operation_risk',
    CROSS_SYSTEM_MAPPING_RISK: 'tool_cross_system_mapping_risk'
  },
  // 业务规则相关原因
  BUSINESS_RULES: {
    SENSITIVE_DATA: 'business_sensitive_data',
    COMPLEX_LOGIC: 'business_complex_logic',
    REGULATORY_REQUIREMENTS: 'business_regulatory',
    PERFORMANCE_CONCERNS: 'business_performance',
    SECURITY_RISKS: 'business_security'
  },
  // 发布相关原因
  PUBLISHING: {
    MISSING_DOCUMENTATION: 'publish_missing_docs',
    INCOMPLETE_TESTING: 'publish_incomplete_tests',
    DEPENDENCY_ISSUES: 'publish_dependency',
    ENVIRONMENT_ISSUES: 'publish_environment',
    COMPLIANCE_FAILURE: 'publish_compliance',
    BUSINESS_RESULT_INCORRECT: 'publish_business_result_incorrect',
    SENSITIVE_DATA_NOT_HANDLED: 'publish_sensitive_not_handled',
    PERMISSION_SCOPE_NOT_CONFIRMED: 'publish_permission_not_confirmed',
    WRITE_OPERATION_NOT_CONFIRMED: 'publish_write_not_confirmed',
    DELIVERY_DOC_MISSING: 'publish_delivery_doc_missing',
    ROLLBACK_PLAN_MISSING: 'publish_rollback_plan_missing'
  }
};

// 审核阶段配置
export const STAGE_CONFIG = {
  [REVIEW_STAGES.CANDIDATE]: {
    name: '候选资产审核',
    description: '验证AI识别出来的候选是否可信',
    required: true,
    order: 1,
    autoCheck: true,
    gate: false
  },
  [REVIEW_STAGES.TOOL]: {
    name: 'Tool审核',
    description: '验证Tool的组织和命名是否合理',
    required: true,
    order: 2,
    autoCheck: true,
    gate: false
  },
  [REVIEW_STAGES.PUBLISH]: {
    name: '发布验收',
    description: '最终验证MCP是否可以发布',
    required: true,
    order: 3,
    autoCheck: false,
    gate: true
  }
};

// 状态转换规则
export const STATUS_TRANSITIONS = {
  [REVIEW_STATUS.PENDING]: {
    [REVIEW_ACTIONS.APPROVE]: REVIEW_STATUS.APPROVED,
    [REVIEW_ACTIONS.REJECT]: REVIEW_STATUS.REJECTED,
    [REVIEW_ACTIONS.AUTO_APPROVE]: REVIEW_STATUS.AUTOMATED_PASS,
    [REVIEW_ACTIONS.AUTO_REJECT]: REVIEW_STATUS.AUTOMATED_FAIL
  },
  [REVIEW_STATUS.NEEDS_REVIEW]: {
    [REVIEW_ACTIONS.APPROVE]: REVIEW_STATUS.APPROVED,
    [REVIEW_ACTIONS.REJECT]: REVIEW_STATUS.REJECTED,
    [REVIEW_ACTIONS.ESCALATE]: REVIEW_STATUS.PENDING
  },
  [REVIEW_STATUS.MODIFIED]: {
    [REVIEW_ACTIONS.APPROVE]: REVIEW_STATUS.APPROVED,
    [REVIEW_ACTIONS.REJECT]: REVIEW_STATUS.REJECTED,
    [REVIEW_ACTIONS.RESUBMIT]: REVIEW_STATUS.PENDING
  },
  [REVIEW_STATUS.BLOCKED_FOR_PUBLISH]: {
    [REVIEW_ACTIONS.APPROVE]: REVIEW_STATUS.APPROVED,
    [REVIEW_ACTIONS.REJECT]: REVIEW_STATUS.REJECTED,
    [REVIEW_ACTIONS.RESUBMIT]: REVIEW_STATUS.PENDING
  }
};

// 升级规则：当某个 stage 的 task 被 reject 时，根据 stage 决定是否要升级
export const ESCALATION_RULES = {
  [REVIEW_STAGES.CANDIDATE]: {
    nextStage: REVIEW_STAGES.CANDIDATE,
    nextReviewType: 'escalated_review',
    nextAssignee: 'senior_reviewer',
    autoCreate: true
  },
  [REVIEW_STAGES.TOOL]: {
    nextStage: REVIEW_STAGES.TOOL,
    nextReviewType: 'escalated_review',
    nextAssignee: 'senior_reviewer',
    autoCreate: true
  },
  [REVIEW_STAGES.PUBLISH]: {
    nextStage: null,
    nextReviewType: null,
    nextAssignee: null,
    autoCreate: false
  }
};

// 发布前门禁条件
export const PUBLISH_GATE_CONDITIONS = {
  OPEN_REVIEW_TASKS: 'open_review_tasks',
  MANUAL_SCREEN_PASSED: 'manual_screen_passed',
  ACCEPTANCE_CHECKLIST_PASSED: 'acceptance_checklist_passed'
};

// Tool 审核重点检查清单
export const TOOL_REVIEW_CHECKLIST = {
  tool_splitting: '拆分/合并合理性 - 是否需要拆分为多个工具或合并为单一工具',
  parameter_exposure: '参数暴露 - 敏感参数是否过度暴露',
  sensitive_field_retention: '敏感字段保留 - 是否保留了不必要的敏感字段',
  permission_scoping: '权限范围 - 权限是否过大或过小',
  write_operation_risk: '写操作风险 - 写操作是否合理，是否有回滚方案',
  business_logic_clarity: '业务逻辑清晰度 - 工具功能是否清晰明确',
  naming_convention: '命名规范 - 工具命名是否符合规范',
  description_completeness: '描述完整性 - 工具描述是否完整'
};
