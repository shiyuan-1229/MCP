// 重写 server.js 中 customers/projects/sources/assets/policies 五个 seed 数组
import fs from 'fs';

const text = fs.readFileSync('server.js', 'utf8').replace(/^\uFEFF/, '');

// 正确的 5 个 seed 数组（按你给的客户名 + 之前 E2E 中可见的中文）
const newSeeds = {};

newSeeds.customers = `const customers = [
  ["cust_retail", "美佳零售集团", "美佳", "零售", "经营查询", "运营中"],
  ["cust_manufacturing", "华智制造", "华智", "制造", "工单质检", "测试中"],
  ["cust_finance", "鑫融金服", "鑫融", "金融", "风控对账", "交付中"],
  ["cust_property", "安和物业", "安和", "物业", "居民服务", "交付中"],
  ["cust_education", "知行教育", "知行", "教育", "课程问答", "测试中"]
];`;

newSeeds.projects = `const projects = [
  ["proj_retail_ai", "cust_retail", "美佳 AI 经营问答 MCP", "published", "李实施", 86, "2026-07-18"],
  ["proj_manufacturing_ops", "cust_manufacturing", "华智工单与质检 MCP", "testing", "王实施", 62, "2026-07-25"],
  ["proj_finance_risk", "cust_finance", "鑫融风控问答 MCP", "data-source", "陈实施", 38, "2026-08-02"],
  ["proj_property_service", "cust_property", "安和居民服务 MCP", "testing", "赵实施", 55, "2026-07-28"],
  ["proj_education_campus", "cust_education", "知行校园 AI 助手 MCP", "draft", "孙实施", 30, "2026-08-10"]
];`;

newSeeds.sources = `const sources = [
  ["ds_pos", "proj_retail_ai", "POS 销售报表接口", "REST API", "API Key", "已连接"],
  ["ds_crm", "proj_retail_ai", "会员 CRM 数据库", "Database", "JWT", "已连接"],
  ["ds_kb", "proj_retail_ai", "门店服务知识库", "Knowledge Base", "Internal Token", "已就绪"],
  ["ds_mes", "proj_manufacturing_ops", "MES 工单接口", "REST API", "OAuth", "调试中"],
  ["ds_qms", "proj_manufacturing_ops", "质量记录数据库", "Database", "VPN 账号", "已连接"],
  ["ds_risk", "proj_finance_risk", "风控策略服务", "REST API", "OAuth", "接入中"],
  ["ds_property_tickets", "proj_property_service", "物业工单系统", "REST API", "API Key", "已连接"],
  ["ds_property_residents", "proj_property_service", "住户名册", "Database", "JWT", "已连接"],
  ["ds_edu_courses", "proj_education_campus", "选课系统", "REST API", "OAuth", "接入中"],
  ["ds_edu_kb", "proj_education_campus", "校园知识库", "Knowledge Base", "Internal Token", "已就绪"]
];`;

newSeeds.assets = `const assets = [
  ["mcp_sales_top", "proj_retail_ai", "sales_top_products", "销售 TopN 查询", "published", "v1.2.0", "/mcp/sales-top", "经营", ["sales_top_products"]],
  ["mcp_member_benefits", "proj_retail_ai", "member_expiring_benefits", "会员积分与过期权益", "published", "v1.1.0", "/mcp/member-benefits", "会员", ["member_expiring_benefits"]],
  ["mcp_store_kb", "proj_retail_ai", "store_service_kb", "门店服务知识库问答", "testing", "v0.9.0", "/mcp/store-kb", "知识", ["kb_search", "kb_answer"]],
  ["mcp_work_order", "proj_manufacturing_ops", "work_order_lookup", "工单查询", "testing", "v0.8.0", "/mcp/work-orders", "工单", ["work_order_lookup"]],
  ["mcp_quality", "proj_manufacturing_ops", "quality_inspection", "质检分析", "draft", "v0.3.0", "/mcp/quality", "质量", ["quality_inspection"]],
  ["mcp_risk_alert", "proj_finance_risk", "risk_alert", "风险预警查询", "draft", "v0.2.0", "/mcp/risk-alert", "风控", ["risk_alert"]],
  ["mcp_property_ticket", "proj_property_service", "property_ticket_create", "物业报修工单创建", "testing", "v0.7.0", "/mcp/property-ticket", "物业", ["property_ticket_create"]],
  ["mcp_property_notice", "proj_property_service", "property_notice_broadcast", "居民通知广播", "draft", "v0.4.0", "/mcp/property-notice", "物业", ["property_notice_broadcast"]],
  ["mcp_edu_course", "proj_education_campus", "course_recommendation", "课程推荐", "draft", "v0.2.0", "/mcp/course-recommendation", "教育", ["course_recommendation"]],
  ["mcp_edu_qa", "proj_education_campus", "campus_qa", "校园知识问答", "testing", "v0.5.0", "/mcp/campus-qa", "教育", ["campus_qa"]]
];`;

newSeeds.policies = `const policies = [
  ["pol_retail", "proj_retail_ai", "美佳 AI 网关策略", "API Key + JWT", "企业微信机器人、客服 Agent、经营看板", "600 rpm / 客户", "手机号、会员 ID、订单号、金额", 1, "已启用"],
  ["pol_manufacturing", "proj_manufacturing_ops", "华智制造测试策略", "OAuth", "生产经理、质检 Agent", "120 rpm / 项目", "工单号、员工号", 1, "已启用"],
  ["pol_finance", "proj_finance_risk", "鑫融金融审计策略", "OAuth + mTLS", "风控 Agent、审计员", "60 rpm / 应用", "账号、身份证号、金额", 1, "审批中"],
  ["pol_property", "proj_property_service", "安和服务策略", "API Key + JWT", "居民 App、管理后台", "300 rpm / 客户", "手机号、房间号、工单号", 1, "已启用"],
  ["pol_education", "proj_education_campus", "知行教育 AI 策略", "OAuth", "学生 App、老师助手", "200 rpm / 客户", "学号、课程号", 1, "已启用"]
];`;

// 在 text 中找每个原数组的 [start, end] 区间
const ranges = {
  customers: [6781, 7137],
  projects: [7143, 7683],
  sources: [7689, 8599],
  assets: [8605, 10194],
  policies: [10200, 10933]
};

let out = '';
let cursor = 0;
for (const key of ['customers', 'projects', 'sources', 'assets', 'policies']) {
  const [s, e] = ranges[key];
  out += text.slice(cursor, s);
  out += newSeeds[key];
  cursor = e;
}
out += text.slice(cursor);

// 加回 BOM（保持原状）
fs.writeFileSync('server.js', '\uFEFF' + out);
console.log('5 个 seed 数组已替换。');
console.log('新文件长度:', out.length);
