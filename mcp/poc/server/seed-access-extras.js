// 一次性脚本：补齐已有 platform_access_configs 的新字段 + 健康/审计/Webhook seed 数据
import Database from 'better-sqlite3';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = path.join(__dirname, '..', 'mcp_forge.db');
const db = new Database(dbPath);

function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

console.log('数据库:', dbPath);

// 1. 补齐已有 access_configs 的新字段值
const updates = [
  ['acc_retail_api', 'production', null, '2026-09-30T23:59:59', '2026-06-15T10:30:00', 'https://hooks.mcpforge.local/retail/callback', '支持门店 POS、会员系统数据读取'],
  ['acc_manufacturing_oauth', 'sandbox', null, '2026-08-15T23:59:59', null, null, '测试环境 OAuth 接入，仅限工单查询和质检分析'],
  ['acc_finance_mtls', 'production', 'sha256:abc123def456...', '2026-12-31T23:59:59', '2026-06-01T08:00:00', null, '金融级双向 mTLS 认证，需部署证书后启用'],
  ['acc_property_wechat', 'production', null, null, null, 'https://work.weixin.qq.com/api/callback', '企业微信回调，用于居民通知广播和报修工单推送'],
  ['acc_education_dingtalk', 'production', null, null, null, 'https://oapi.dingtalk.com/robot/callback', '钉钉回调，用于校园 AI 助手课程提醒和通知推送']
];
const updStmt = db.prepare(`UPDATE platform_access_configs SET environment = ?, certificate = ?, credential_expires_at = ?, credential_last_rotated_at = ?, webhook_url = ?, description = ? WHERE id = ?`);
for (const [id, env, cert, exp, rot, wh, desc] of updates) {
  updStmt.run(env, cert, exp, rot, wh, desc, id);
}
console.log('更新接入配置字段:', updates.length, '条');

// 2. 健康检查 seed
const healthCount = db.prepare('SELECT COUNT(*) as c FROM platform_access_health_checks').get().c;
if (healthCount === 0) {
  const insertHealth = db.prepare("INSERT INTO platform_access_health_checks (id,access_id,status,latency_ms,status_code,auth_ok,error_message,detail,checked_by,checked_at) VALUES (?,?,?,?,?,?,?,?,?,datetime('now', ?))");
  const healthSeed = [
    ['acc_retail_api', 'ok', 82, 200, 1, null, 0],
    ['acc_retail_api', 'ok', 96, 200, 1, null, -2],
    ['acc_retail_api', 'error', 0, 503, 0, '上游服务暂时不可用', -5],
    ['acc_manufacturing_oauth', 'ok', 134, 200, 1, null, 0],
    ['acc_manufacturing_oauth', 'ok', 121, 200, 1, null, -1],
    ['acc_manufacturing_oauth', 'ok', 109, 200, 1, null, -3],
    ['acc_finance_mtls', 'ok', 79, 200, 1, null, 0],
    ['acc_finance_mtls', 'ok', 88, 200, 1, null, -1],
    ['acc_property_wechat', 'ok', 156, 200, 1, null, 0],
    ['acc_property_wechat', 'ok', 178, 200, 1, null, -2],
    ['acc_property_wechat', 'error', 0, 401, 0, 'Token 已失效', -4],
    ['acc_education_dingtalk', 'ok', 112, 200, 1, null, 0],
    ['acc_education_dingtalk', 'ok', 124, 200, 1, null, -1]
  ];
  for (let i = 0; i < healthSeed.length; i++) {
    const [accId, status, lat, code, auth, err, dayOffset] = healthSeed[i];
    const traceId = `trace_hc_${1000 + i}`;
    insertHealth.run(makeId('hc'), accId, status, lat, code, auth, err, JSON.stringify({ trace_id: traceId, http_version: 'HTTP/1.1' }), '科传管理员', `${dayOffset} days`);
  }
  // 更新 platform_access_configs 的最近健康状态
  const updHealth = db.prepare("UPDATE platform_access_configs SET last_health_check_at = datetime('now'), last_health_status = 'ok', last_health_detail = ? WHERE id = ?");
  updHealth.run(JSON.stringify({ latency_ms: 82, status_code: 200, auth_ok: 1, trace_id: 'trace_hc_1000' }), 'acc_retail_api');
  updHealth.run(JSON.stringify({ latency_ms: 134, status_code: 200, auth_ok: 1, trace_id: 'trace_hc_1003' }), 'acc_manufacturing_oauth');
  updHealth.run(JSON.stringify({ latency_ms: 79, status_code: 200, auth_ok: 1, trace_id: 'trace_4ceaba11' }), 'acc_finance_mtls');
  updHealth.run(JSON.stringify({ latency_ms: 156, status_code: 200, auth_ok: 1, trace_id: 'trace_hc_1008' }), 'acc_property_wechat');
  updHealth.run(JSON.stringify({ latency_ms: 112, status_code: 200, auth_ok: 1, trace_id: 'trace_hc_1011' }), 'acc_education_dingtalk');
  console.log('插入健康检查记录:', healthSeed.length, '条');
} else {
  console.log('健康检查已有数据:', healthCount, '条，跳过');
}

// 3. 审计 seed
const auditCount = db.prepare('SELECT COUNT(*) as c FROM platform_access_audit').get().c;
if (auditCount === 0) {
  const insertAudit = db.prepare("INSERT INTO platform_access_audit (id,access_id,field,old_value,new_value,changed_by,changed_at) VALUES (?,?,?,?,?,?,datetime('now', ?))");
  const auditSeed = [
    ['acc_retail_api', 'api_key', '***old', '***new', '科传管理员', -30],
    ['acc_retail_api', 'endpoint', 'https://api.mcpforge.cn/retail/v1', 'https://api.mcpforge.cn/retail/v2', '科传管理员', -28],
    ['acc_retail_api', 'scope', '门店数据', '门店数据、会员数据', '科传管理员', -25],
    ['acc_retail_api', 'environment', 'sandbox', 'production', '科传管理员', -20],
    ['acc_manufacturing_oauth', 'api_key', '***old', '***rotated', '科传管理员', -22],
    ['acc_manufacturing_oauth', 'scope', '工单数据', '工单、质检数据', '科传管理员', -18],
    ['acc_finance_mtls', 'certificate', 'sha256:oldcert...', 'sha256:abc123def456...', '科传管理员', -35],
    ['acc_finance_mtls', 'api_key_rotated', '***', '***', '科传管理员', -15],
    ['acc_property_wechat', 'webhook_url', 'https://work.weixin.qq.com/old', 'https://work.weixin.qq.com/...', '科传管理员', -10],
    ['acc_education_dingtalk', 'endpoint', 'https://oapi.dingtalk.com/old', 'https://oapi.dingtalk.com/...', '科传管理员', -8],
    ['acc_education_dingtalk', 'environment', 'sandbox', 'production', '科传管理员', -5]
  ];
  for (const [accId, field, oldV, newV, who, dayOffset] of auditSeed) {
    insertAudit.run(makeId('aa'), accId, field, oldV, newV, who, `${dayOffset} days`);
  }
  console.log('插入审计记录:', auditSeed.length, '条');
} else {
  console.log('审计已有数据:', auditCount, '条，跳过');
}

// 4. Webhook 日志 seed
const whCount = db.prepare('SELECT COUNT(*) as c FROM platform_access_webhook_logs').get().c;
if (whCount === 0) {
  const insertWebhook = db.prepare("INSERT INTO platform_access_webhook_logs (id,access_id,event_type,url,status,status_code,response_body,error_message,retry_count,created_at,last_retry_at) VALUES (?,?,?,?,?,?,?,?,?,datetime('now', ?),datetime('now', ?))");
  const webhookSeed = [
    ['acc_property_wechat', 'ticket.created', 'https://work.weixin.qq.com/callback/property', 'success', 200, '{"errcode":0,"errmsg":"ok"}', null, 0, 0, 0],
    ['acc_property_wechat', 'ticket.assigned', 'https://work.weixin.qq.com/callback/property', 'success', 200, '{"errcode":0,"errmsg":"ok"}', null, 0, -1, -1],
    ['acc_property_wechat', 'ticket.resolved', 'https://work.weixin.qq.com/callback/property', 'failed', 500, null, '目标服务返回 500 Internal Server Error', 2, -2, -2],
    ['acc_education_dingtalk', 'course.reminder', 'https://oapi.dingtalk.com/callback/edu', 'success', 200, '{"errcode":0,"errmsg":"ok"}', null, 0, 0, 0],
    ['acc_education_dingtalk', 'course.reminder', 'https://oapi.dingtalk.com/callback/edu', 'success', 200, '{"errcode":0,"errmsg":"ok"}', null, 0, -1, -1],
    ['acc_education_dingtalk', 'notice.broadcast', 'https://oapi.dingtalk.com/callback/edu', 'retrying', 502, null, 'Bad Gateway, 自动重试中', 1, -3, -3],
    ['acc_retail_api', 'member.coupon', 'https://hooks.mcpforge.local/retail/callback', 'success', 200, '{"received":true}', null, 0, 0, 0],
    ['acc_retail_api', 'store.daily.report', 'https://hooks.mcpforge.local/retail/callback', 'failed', 404, null, 'Webhook URL 已失效，需更新', 3, -4, -4]
  ];
  for (const [accId, event, url, status, code, payload, err, retry, dayOffset, lastRetry] of webhookSeed) {
    insertWebhook.run(makeId('wh'), accId, event, url, status, code, payload, err, retry, `${dayOffset} days`, `${lastRetry} days`);
  }
  db.prepare("UPDATE platform_access_configs SET webhook_last_success_at = datetime('now') WHERE id = ?").run('acc_property_wechat');
  db.prepare("UPDATE platform_access_configs SET webhook_last_success_at = datetime('now') WHERE id = ?").run('acc_education_dingtalk');
  db.prepare("UPDATE platform_access_configs SET webhook_last_success_at = datetime('now') WHERE id = ?").run('acc_retail_api');
  console.log('插入 Webhook 日志:', webhookSeed.length, '条');
} else {
  console.log('Webhook 已有数据:', whCount, '条，跳过');
}

db.close();
console.log('完成。');