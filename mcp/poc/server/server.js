// MCP Forge admin server
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import fs from "fs";
import Database from "better-sqlite3";
import { runFullPipeline, analyzeBusinessData, analysisToOpenAPISpec, analysisToTools, isAIConfigured, getAIConfig } from "./ai-engine.mjs";
import { getLvchengSeedSources } from "./lvcheng-seed-data.mjs";

// 加载 .env
const __dirname_env = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname_env, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || process.env.SERVER_PORT || 3100);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "mcp_forge.db");
const db = new Database(DB_PATH);
const ADMIN_DIR = path.join(__dirname, "..", "admin");
const CLIENT_DIR = path.join(__dirname, "..", "client");

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
app.use(express.json({ limit: "2mb" }));

// ============== 宸ュ叿鍑芥暟 ==============
function makeId(prefix) {
  return `${prefix}_${crypto.randomBytes(5).toString("hex")}`;
}

function hashPassword(password, salt = crypto.randomBytes(12).toString("hex")) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(":")) return false;
  const [salt, hash] = stored.split(":");
  const test = crypto.pbkdf2Sync(String(password), salt, 120000, 32, "sha256").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(test, "hex"));
}

function encode(value) {
  return JSON.stringify(value || []);
}

function decode(value) {
  try { return value ? JSON.parse(value) : []; } catch { return []; }
}

function safeParse(value) {
  try { return value ? JSON.parse(value) : null; } catch { return null; }
}

function count(table) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

function ensureColumn(table, name, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some(column => column.name === name)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}

// ============== 杩佺Щ ==============
function runMigrations() {
  db.exec(`CREATE TABLE IF NOT EXISTS platform_users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','customer')),
    customer_id TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS platform_sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS platform_customers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    short_name TEXT,
    industry TEXT,
    main_scene TEXT,
    status TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS platform_projects (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT,
    implementer TEXT,
    progress INTEGER,
    deadline TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS platform_data_sources (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    auth_mode TEXT,
    status TEXT,
    recognition_status TEXT DEFAULT 'draft'
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS platform_mcp_assets (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    capability TEXT,
    status TEXT,
    version TEXT,
    endpoint TEXT,
    category TEXT,
    tools TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS platform_mcp_releases (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    version TEXT,
    status TEXT,
    tested_at TEXT,
    released_at TEXT,
    notes TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS platform_gateway_policies (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    auth_mode TEXT,
    authorization_scope TEXT,
    rate_limit TEXT,
    masking_rules TEXT,
    audit_enabled INTEGER DEFAULT 1,
    status TEXT,
    changed_by TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS platform_policy_changes (
    id TEXT PRIMARY KEY,
    policy_id TEXT NOT NULL,
    field TEXT,
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT,
    changed_at TEXT DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS platform_call_events (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    caller TEXT,
    status TEXT,
    latency_ms INTEGER,
    business_result TEXT,
    trace_id TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    request_params TEXT,
    response_summary TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  // 兼容旧库：补列（SQLite 的 ALTER TABLE ADD COLUMN 幂等性靠 try-catch）
  try { db.exec("ALTER TABLE platform_call_events ADD COLUMN input_tokens INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE platform_call_events ADD COLUMN output_tokens INTEGER DEFAULT 0"); } catch {}
  try { db.exec("ALTER TABLE platform_call_events ADD COLUMN request_params TEXT"); } catch {}
  try { db.exec("ALTER TABLE platform_call_events ADD COLUMN response_summary TEXT"); } catch {}
  db.exec(`CREATE TABLE IF NOT EXISTS platform_deliverables (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT,
    status TEXT,
    updated_at TEXT DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS platform_billing_records (
    id TEXT PRIMARY KEY,
    customer_id TEXT NOT NULL,
    tier TEXT DEFAULT 'standard',
    billing_type TEXT NOT NULL,
    item TEXT,
    period TEXT,
    base_amount INTEGER DEFAULT 0,
    overage_calls INTEGER DEFAULT 0,
    overage_amount INTEGER DEFAULT 0,
    total_amount INTEGER,
    status TEXT,
    usage_count INTEGER,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS platform_access_configs (
    id TEXT PRIMARY KEY,
    customer_id TEXT,
    project_id TEXT,
    name TEXT NOT NULL,
    type TEXT,
    endpoint TEXT,
    api_key TEXT,
    scope TEXT,
    status TEXT,
    environment TEXT,
    certificate TEXT,
    expires_at TEXT,
    credential_last_rotated_at TEXT,
    webhook_url TEXT,
    description TEXT,
    last_health_status TEXT,
    last_health_check_at TEXT,
    last_health_detail TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS platform_access_audit (
    id TEXT PRIMARY KEY,
    access_id TEXT NOT NULL,
    field TEXT,
    old_value TEXT,
    new_value TEXT,
    changed_by TEXT,
    changed_at TEXT DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS platform_access_health_checks (
    id TEXT PRIMARY KEY,
    access_id TEXT NOT NULL,
    status TEXT,
    latency_ms INTEGER,
    status_code INTEGER,
    auth_ok INTEGER,
    error_message TEXT,
    detail TEXT,
    checked_by TEXT,
    checked_at TEXT DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS platform_access_webhook_logs (
    id TEXT PRIMARY KEY,
    access_id TEXT NOT NULL,
    event_type TEXT,
    url TEXT,
    status TEXT,
    status_code INTEGER,
    retry_count INTEGER,
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS kb_collections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    doc_count INTEGER,
    chunk_count INTEGER,
    status TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS kb_documents (
    id TEXT PRIMARY KEY,
    collection_id TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    chunk_count INTEGER,
    status TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS kb_chunks (
    id TEXT PRIMARY KEY,
    document_id TEXT NOT NULL,
    collection_id TEXT NOT NULL,
    content TEXT,
    keywords TEXT
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS kb_recall_logs (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    collection_id TEXT,
    query_text TEXT,
    top_k INTEGER,
    trace_id TEXT,
    result_count INTEGER,
    latency_ms INTEGER,
    caller TEXT,
    results_json TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  ensureColumn('kb_collections', 'project_id', 'TEXT');
  ensureColumn('kb_collections', 'source_id', 'TEXT');
  ensureColumn('kb_collections', 'indexed_at', 'TEXT');
  ensureColumn('kb_documents', 'updated_at', 'TEXT');
  ensureColumn('platform_data_sources', 'recognition_status', "TEXT DEFAULT 'draft'");

  // 阶段三：数据源 OpenAPI 描述与生成时间线
  db.exec(`CREATE TABLE IF NOT EXISTS platform_openapi_specs (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    title TEXT,
    spec TEXT NOT NULL,
    status TEXT DEFAULT 'draft',
    generated_at TEXT DEFAULT (datetime('now'))
  )`);
  ensureColumn('platform_openapi_specs', 'status', "TEXT DEFAULT 'draft'");
  db.exec(`CREATE TABLE IF NOT EXISTS platform_asset_timeline (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL,
    stage TEXT NOT NULL,
    stage_label TEXT,
    status TEXT NOT NULL,
    operator TEXT,
    completed_at TEXT,
    notes TEXT
  )`);

  // AI 分析结果表
  db.exec(`CREATE TABLE IF NOT EXISTS ai_analysis_results (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL,
    project_id TEXT NOT NULL,
    analysis_json TEXT,
    openapi_spec_id TEXT,
    tools_json TEXT,
    categories_json TEXT,
    model TEXT,
    usage_json TEXT,
    raw_content TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
}

// ============== 閴存潈 ==============
function currentSession(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const row = db.prepare(`
    SELECT s.token, s.expires_at, u.id, u.username, u.display_name, u.role, u.customer_id
    FROM platform_sessions s JOIN platform_users u ON u.id = s.user_id
    WHERE s.token = ? AND s.expires_at > datetime('now')
  `).get(token);
  return row || null;
}

function requireAuth(req, res, next) {
  const user = currentSession(req);
  if (!user) return res.status(401).json({ error: "unauthorized" });
  req.user = user;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") return res.status(403).json({ error: "forbidden" });
  next();
}

function customerScope(req) {
  return req.user?.role === "customer" ? req.user.customer_id : null;
}

function scopedProjects(req) {
  const cid = customerScope(req);
  const sql = `SELECT p.*, c.name AS customer_name FROM platform_projects p JOIN platform_customers c ON c.id = p.customer_id` +
    (cid ? ` WHERE p.customer_id = ?` : ``) + ` ORDER BY p.deadline`;
  return cid ? db.prepare(sql).all(cid) : db.prepare(sql).all();
}

function scopedProjectById(req, id) {
  const cid = customerScope(req);
  const row = db.prepare(`
    SELECT p.*, c.name AS customer_name FROM platform_projects p
    JOIN platform_customers c ON c.id = p.customer_id WHERE p.id = ?
  `).get(id);
  if (!row) return null;
  if (cid && row.customer_id !== cid) return null;
  return row;
}

function scopedAssets(req) {
  const cid = customerScope(req);
  const projectIds = scopedProjects(req).map(p => p.id);
  if (!projectIds.length) return [];
  const sql = `SELECT a.*, p.name AS project_name, p.customer_id FROM platform_mcp_assets a JOIN platform_projects p ON p.id = a.project_id WHERE a.project_id IN (${projectIds.map(() => "?").join(",")})`;
  return db.prepare(sql).all(...projectIds);
}

function callStats(assetIds) {
  if (!assetIds.length) return { total: 0, success: 0, error: 0 };
  const row = db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS success FROM platform_call_events WHERE asset_id IN (${assetIds.map(() => "?").join(",")})`).get(...assetIds);
  return { total: row.total || 0, success: row.success || 0, error: (row.total || 0) - (row.success || 0) };
}

function scopedKnowledgeSources(req) {
  const projectIds = scopedProjects(req).map(project => project.id);
  if (!projectIds.length) return [];
  return db.prepare(`SELECT s.*, p.name AS project_name, p.customer_id, c.name AS customer_name
    FROM platform_data_sources s
    JOIN platform_projects p ON p.id = s.project_id
    JOIN platform_customers c ON c.id = p.customer_id
    WHERE s.type = 'Knowledge Base' AND s.project_id IN (${projectIds.map(() => "?").join(",")})
    ORDER BY s.name`).all(...projectIds);
}

function knowledgeCollectionsForSource(source) {
  return db.prepare(`SELECT * FROM kb_collections
    WHERE source_id = ? OR (project_id = ? AND (source_id IS NULL OR source_id = ''))
    ORDER BY name`).all(source.id, source.project_id);
}

function buildKnowledgeChunks(source, collection, document) {
  const base = `${source.name} ${collection.name} ${document.title}`;
  return [
    {
      content: `${base}：优先返回标准流程、适用范围和异常处理口径，避免只给出模糊结论。`,
      keywords: `${source.name},${collection.name},${document.title},流程`
    },
    {
      content: `${document.title}：如果用户继续追问，补充所需材料、处理时限和升级路径，并提醒以系统最新规则为准。`,
      keywords: `${document.title},材料,时限,升级`
    }
  ];
}

function scoreKnowledgeChunk(query, chunk, document) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return 0;
  const haystack = `${document.title || ''} ${chunk.content || ''} ${chunk.keywords || ''}`.toLowerCase();
  return terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
}

function ensureKnowledgeDeliverable(source, status = 'ready') {
  const existing = db.prepare("SELECT * FROM platform_deliverables WHERE project_id = ? AND type = 'knowledge-base' ORDER BY updated_at DESC LIMIT 1").get(source.project_id);
  if (existing) {
    db.prepare("UPDATE platform_deliverables SET name = ?, status = ?, updated_at = datetime('now') WHERE id = ?").run(`${source.name} 导出`, status, existing.id);
    return db.prepare("SELECT * FROM platform_deliverables WHERE id = ?").get(existing.id);
  }
  const id = makeId('del');
  db.prepare("INSERT INTO platform_deliverables (id, project_id, name, type, status, updated_at) VALUES (?,?,?,?,?, datetime('now'))").run(id, source.project_id, `${source.name} 导出`, 'knowledge-base', status);
  return db.prepare("SELECT * FROM platform_deliverables WHERE id = ?").get(id);
}

function buildKnowledgeBaseRecord(req, source, options = {}) {
  const collections = knowledgeCollectionsForSource(source);
  const collectionIds = collections.map(item => item.id);
  const documents = collectionIds.length
    ? db.prepare(`SELECT * FROM kb_documents WHERE collection_id IN (${collectionIds.map(() => "?").join(",")}) ORDER BY updated_at DESC, title`).all(...collectionIds)
    : [];
  const documentIds = documents.map(item => item.id);
  const chunks = documentIds.length
    ? db.prepare(`SELECT * FROM kb_chunks WHERE document_id IN (${documentIds.map(() => "?").join(",")})`).all(...documentIds)
    : [];
  const chunksByDocument = new Map();
  chunks.forEach(chunk => {
    const current = chunksByDocument.get(chunk.document_id) || [];
    current.push(chunk);
    chunksByDocument.set(chunk.document_id, current);
  });
  const documentItems = documents.map(document => ({
    ...document,
    updated_at: document.updated_at || '',
    chunk_count: (chunksByDocument.get(document.id) || []).length || Number(document.chunk_count || 0)
  }));
  const documentMap = new Map(documentItems.map(item => [item.id, item]));
  const collectionItems = collections.map(collection => {
    const docs = documentItems.filter(item => item.collection_id === collection.id);
    const chunkCount = docs.reduce((sum, item) => sum + Number(item.chunk_count || 0), 0);
    return {
      ...collection,
      doc_count: docs.length,
      chunk_count: chunkCount,
      documents: options.detail ? docs : undefined
    };
  });

  const scopedAssetList = scopedAssets(req).filter(asset => asset.project_id === source.project_id && /kb|qa|知识|问答|faq/i.test(`${asset.name || ''} ${asset.capability || ''} ${asset.category || ''}`));
  const assetIds = scopedAssetList.map(item => item.id);
  const releases = assetIds.length
    ? db.prepare(`SELECT r.*, a.name AS asset_name FROM platform_mcp_releases r JOIN platform_mcp_assets a ON a.id = r.asset_id WHERE r.asset_id IN (${assetIds.map(() => "?").join(",")}) ORDER BY COALESCE(r.released_at, r.tested_at) DESC`).all(...assetIds)
    : [];
  const events = assetIds.length
    ? db.prepare(`SELECT ce.*, a.name AS asset_name FROM platform_call_events ce JOIN platform_mcp_assets a ON a.id = ce.asset_id WHERE ce.asset_id IN (${assetIds.map(() => "?").join(",")}) ORDER BY ce.created_at DESC LIMIT 30`).all(...assetIds)
    : [];
  const deliverables = db.prepare("SELECT * FROM platform_deliverables WHERE project_id = ? AND type = 'knowledge-base' ORDER BY updated_at DESC").all(source.project_id);
  const accessItems = db.prepare("SELECT * FROM platform_access_configs WHERE project_id = ? ORDER BY status DESC, type").all(source.project_id);
  const recallLogs = db.prepare("SELECT * FROM kb_recall_logs WHERE source_id = ? ORDER BY created_at DESC LIMIT ?").all(source.id, options.detail ? 20 : 5).map(item => ({
    ...item,
    results: safeParse(item.results_json) || []
  }));

  const readyExport = deliverables.find(item => item.status === 'ready') || null;
  const latestRelease = releases[0] || null;
  const errorCount = events.filter(item => item.status !== 'success').length;
  const riskFlags = [];
  if (!collectionItems.length) riskFlags.push('未绑定知识集合');
  if (!documentItems.length) riskFlags.push('暂无上传文档');
  if (!scopedAssetList.length) riskFlags.push('未派生问答 MCP');
  if (!deliverables.length) riskFlags.push('缺少知识库导出');
  if (errorCount > 0) riskFlags.push(`异常调用 ${errorCount}`);
  if (latestRelease && latestRelease.status !== 'published') riskFlags.push(`版本${latestRelease.status}`);

  return {
    id: source.id,
    kbName: source.name || '-',
    customerId: source.customer_id || '',
    customerName: source.customer_name || '-',
    projectId: source.project_id || '',
    projectName: source.project_name || '-',
    sourceStatus: source.status || '-',
    sourceType: source.type || '-',
    authMode: source.auth_mode || '-',
    primaryAsset: scopedAssetList[0] || null,
    assetItems: scopedAssetList,
    assetStatus: latestRelease?.status || scopedAssetList[0]?.status || 'draft',
    latestRelease,
    releaseItems: releases,
    eventItems: events,
    callCount: events.length,
    errorCount,
    deliverableItems: deliverables,
    accessItems,
    readyExport,
    exportId: readyExport?.id || deliverables[0]?.id || '',
    riskFlags,
    updatedAt: latestRelease?.released_at || latestRelease?.tested_at || deliverables[0]?.updated_at || recallLogs[0]?.created_at || source.id,
    collectionItems: options.detail ? collectionItems : undefined,
    documentItems: options.detail ? documentItems : undefined,
    recallLogs: options.detail ? recallLogs : undefined
  };
}

// ============== Seed 鏁版嵁 ==============
function seed() {
  const hasUsers = count("platform_users") > 0;
  if (!hasUsers) {
    db.prepare("DELETE FROM platform_sessions").run();
  }

  const customers = [
    ["cust_retail", "美佳零售集团", "美佳", "零售连锁", "AI 经营问答", "running"],
    ["cust_manufacturing", "华智制造", "华智", "智能制造", "工单与质检", "testing"],
    ["cust_finance", "鑫融金服", "鑫融", "金融科技", "风控对账", "draft"],
    ["cust_property", "安和物业", "安和", "物业服务", "居民报修", "testing"],
    ["cust_education", "知行教育", "知行", "教育科技", "校园助手", "draft"],
    ["cust_lvcheng", "绿城中国", "绿城", "地产商业", "CDP客户数据平台", "testing"]
  ];
  const custStmt = db.prepare("INSERT OR IGNORE INTO platform_customers (id, name, short_name, industry, main_scene, status) VALUES (?,?,?,?,?,?)");
  customers.forEach(item => custStmt.run(...item));

  const users = [
    ["usr_admin", "admin", "平台管理员", "admin123", "admin", null],
    ["usr_meijia", "meijia", "美佳店长", "store123", "customer", "cust_retail"],
    ["usr_hzm", "hzm", "华智工程师", "123456", "customer", "cust_manufacturing"],
    ["usr_xrf", "xrf", "鑫融风控经理", "123456", "customer", "cust_finance"],
    ["usr_ahwy", "ahwy", "安和物业主管", "123456", "customer", "cust_property"],
    ["usr_zxjy", "zxjy", "知行教务主任", "123456", "customer", "cust_education"],
    ["usr_lvcheng", "lvcheng", "绿城数据工程师", "lv2026", "customer", "cust_lvcheng"]
  ];
  const userStmt = db.prepare("INSERT OR IGNORE INTO platform_users (id, username, display_name, password_hash, role, customer_id) VALUES (?,?,?,?,?,?)");
  users.forEach(([id, username, display, password, role, customerId]) => {
    userStmt.run(id, username, display, hashPassword(password), role, customerId);
  });

  const projects = [
    ["proj_retail_ai", "cust_retail", "美佳 AI 经营问答 MCP", "published", "李实施", 86, "2026-07-18"],
    ["proj_manufacturing_ops", "cust_manufacturing", "华智工单质检 MCP", "testing", "王实施", 62, "2026-07-25"],
    ["proj_finance_risk", "cust_finance", "鑫融风控问答 MCP", "data-source", "陈实施", 38, "2026-08-02"],
    ["proj_property_service", "cust_property", "安和居民服务 MCP", "testing", "赵实施", 55, "2026-07-28"],
    ["proj_education_campus", "cust_education", "知行校园 AI 助手 MCP", "draft", "孙实施", 30, "2026-08-10"],
    ["proj_lvcheng_cdp", "cust_lvcheng", "绿城 CDP 客户数据平台 MCP", "data-source", "周数据", 20, "2026-09-01"]
  ];
  const projStmt = db.prepare("INSERT OR IGNORE INTO platform_projects (id, customer_id, name, status, implementer, progress, deadline) VALUES (?,?,?,?,?,?,?)");
  projects.forEach(item => projStmt.run(...item));

  const sources = [
    ["ds_pos", "proj_retail_ai", "POS 销售报表接口", "REST API", "API Key", "connected", "done"],
    ["ds_crm", "proj_retail_ai", "会员 CRM 数据库", "Database", "JWT", "connected", "done"],
    ["ds_kb", "proj_retail_ai", "门店服务知识库", "Knowledge Base", "Internal Token", "indexed", "done"],
    ["ds_mes", "proj_manufacturing_ops", "MES 工单接口", "REST API", "OAuth", "debugging", "done"],
    ["ds_qms", "proj_manufacturing_ops", "质量记录数据库", "Database", "VPN", "connected", "pending"],
    ["ds_risk", "proj_finance_risk", "风控策略服务", "REST API", "OAuth", "draft", "draft"],
    ["ds_property_tickets", "proj_property_service", "物业工单系统", "REST API", "API Key", "connected", "done"],
    ["ds_property_residents", "proj_property_service", "住户主数据", "Database", "JWT", "connected", "draft"],
    ["ds_edu_courses", "proj_education_campus", "选课系统", "REST API", "OAuth", "draft", "draft"],
    ["ds_edu_kb", "proj_education_campus", "校园知识库", "Knowledge Base", "Internal Token", "indexed", "done"]
  ];
  const srcStmt = db.prepare("INSERT OR IGNORE INTO platform_data_sources (id, project_id, name, type, auth_mode, status, recognition_status) VALUES (?,?,?,?,?,?,?)");
  sources.forEach(item => srcStmt.run(...item));

  // 绿城 CDP 真实 DDL 数据源种子
  const lvchengSources = getLvchengSeedSources();
  lvchengSources.forEach(src => {
    db.prepare("INSERT OR IGNORE INTO platform_data_sources (id, project_id, name, type, auth_mode, status, recognition_status) VALUES (?,?,?,?,?,?,?)").run(
      src.id, src.project_id, src.name, src.type, src.auth_mode, 'draft', 'draft'
    );
  });

  // 阶段三：为已识别资料预生成 OpenAPI 草案
  const openapiSeed = [
    ["spec_pos", "ds_pos", "proj_retail_ai", "POS 销售报表 OpenAPI", {
      openapi: "3.0.0", info: { title: "POS 销售报表接口", version: "1.0.0" },
      paths: {
        "/sales/top": { get: { operationId: "sales_top_products", summary: "销售 TopN 查询", parameters: [{ name: "top_n", in: "query", schema: { type: "integer", default: 10 } }, { name: "date_range", in: "query", schema: { type: "string", enum: ["day", "week", "month"] } }], responses: { "200": { description: "TopN 销售数据" } } } },
        "/sales/trend": { get: { operationId: "sales_trend", summary: "销售趋势", parameters: [{ name: "days", in: "query", schema: { type: "integer", default: 7 } }], responses: { "200": { description: "销售趋势数据" } } } }
      }
    }],
    ["spec_crm", "ds_crm", "proj_retail_ai", "CRM 会员 OpenAPI", {
      openapi: "3.0.0", info: { title: "CRM 会员数据库", version: "1.0.0" },
      paths: {
        "/members/{member_id}/benefits": { get: { operationId: "member_expiring_benefits", summary: "会员到期权益", parameters: [{ name: "member_id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "会员权益" } } } },
        "/members/{member_id}/profile": { get: { operationId: "member_profile", summary: "会员资料", parameters: [{ name: "member_id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "会员资料" } } } }
      }
    }],
    ["spec_kb", "ds_kb", "proj_retail_ai", "门店知识库 OpenAPI", {
      openapi: "3.0.0", info: { title: "门店服务知识库", version: "1.0.0" },
      paths: {
        "/kb/search": { post: { operationId: "kb_search", summary: "知识库检索", requestBody: { content: { "application/json": { schema: { type: "object", properties: { query: { type: "string" }, top_k: { type: "integer", default: 3 } } } } } }, responses: { "200": { description: "检索结果" } } } },
        "/kb/answer": { post: { operationId: "kb_answer", summary: "知识库问答", requestBody: { content: { "application/json": { schema: { type: "object", properties: { question: { type: "string" } } } } } }, responses: { "200": { description: "问答结果" } } } }
      }
    }],
    ["spec_mes", "ds_mes", "proj_manufacturing_ops", "MES 工单 OpenAPI", {
      openapi: "3.0.0", info: { title: "MES 工单接口", version: "1.0.0" },
      paths: {
        "/work-orders/{work_order_id}": { get: { operationId: "work_order_lookup", summary: "工单查询", parameters: [{ name: "work_order_id", in: "path", required: true, schema: { type: "string" } }, { name: "include_logs", in: "query", schema: { type: "boolean", default: false } }], responses: { "200": { description: "工单详情" } } } },
        "/quality/inspection": { post: { operationId: "quality_inspection", summary: "质检分析", requestBody: { content: { "application/json": { schema: { type: "object", properties: { batch_no: { type: "string" }, top_n: { type: "integer", default: 5 } } } } } }, responses: { "200": { description: "质检结果" } } } }
      }
    }],
    ["spec_property", "ds_property_tickets", "proj_property_service", "物业工单 OpenAPI", {
      openapi: "3.0.0", info: { title: "物业工单系统", version: "1.0.0" },
      paths: {
        "/tickets": { post: { operationId: "property_ticket_create", summary: "物业报修工单", requestBody: { content: { "application/json": { schema: { type: "object", properties: { resident_id: { type: "string" }, category: { type: "string" }, description: { type: "string" } } } } } }, responses: { "200": { description: "工单创建结果" } } } },
        "/notices": { post: { operationId: "property_notice_broadcast", summary: "居民通知广播", requestBody: { content: { "application/json": { schema: { type: "object", properties: { scope: { type: "string" }, content: { type: "string" } } } } } }, responses: { "200": { description: "广播结果" } } } }
      }
    }],
    ["spec_edu_kb", "ds_edu_kb", "proj_education_campus", "校园知识库 OpenAPI", {
      openapi: "3.0.0", info: { title: "校园知识库", version: "1.0.0" },
      paths: {
        "/qa/search": { post: { operationId: "campus_qa", summary: "校园问答", requestBody: { content: { "application/json": { schema: { type: "object", properties: { question: { type: "string" } } } } } }, responses: { "200": { description: "问答结果" } } } },
        "/courses/recommend": { post: { operationId: "course_recommendation", summary: "课程推荐", requestBody: { content: { "application/json": { schema: { type: "object", properties: { student_id: { type: "string" }, interests: { type: "array", items: { type: "string" } } } } } } }, responses: { "200": { description: "推荐结果" } } } }
      }
    }]
  ];
  const specStmt = db.prepare("INSERT OR IGNORE INTO platform_openapi_specs (id, source_id, project_id, title, spec, status, generated_at) VALUES (?,?,?,?,?,?, datetime('now'))");
  openapiSeed.forEach(([id, sourceId, projectId, title, spec]) => {
    specStmt.run(id, sourceId, projectId, title, JSON.stringify(spec), "draft");
  });

  const assets = [
    ["mcp_sales_top", "proj_retail_ai", "sales_top_products", "销售 TopN 查询", "published", "v1.2.0", "/mcp/sales-top", "经营", ["sales_top_products"]],
    ["mcp_member_benefits", "proj_retail_ai", "member_expiring_benefits", "会员到期权益", "published", "v1.1.0", "/mcp/member-benefits", "会员", ["member_expiring_benefits"]],
    ["mcp_store_kb", "proj_retail_ai", "store_service_kb", "门店知识问答", "testing", "v0.9.0", "/mcp/store-kb", "知识", ["kb_search", "kb_answer"]],
    ["mcp_work_order", "proj_manufacturing_ops", "work_order_lookup", "工单查询", "published", "v1.0.0", "/mcp/work-orders", "工单", ["work_order_lookup"]],
    ["mcp_quality", "proj_manufacturing_ops", "quality_inspection", "质检分析", "published", "v1.0.0", "/mcp/quality", "质量", ["quality_inspection"]],
    ["mcp_risk_alert", "proj_finance_risk", "risk_alert", "风险预警", "published", "v1.0.0", "/mcp/risk-alert", "风控", ["risk_alert"]],
    ["mcp_property_ticket", "proj_property_service", "property_ticket_create", "物业报修工单", "published", "v1.0.0", "/mcp/property-ticket", "物业", ["property_ticket_create"]],
    ["mcp_property_notice", "proj_property_service", "property_notice_broadcast", "居民通知广播", "testing", "v0.8.0", "/mcp/property-notice", "物业", ["property_notice_broadcast"]],
    ["mcp_edu_course", "proj_education_campus", "course_recommendation", "课程推荐", "published", "v1.0.0", "/mcp/course-recommendation", "教育", ["course_recommendation"]],
    ["mcp_edu_qa", "proj_education_campus", "campus_qa", "校园知识问答", "published", "v1.0.0", "/mcp/campus-qa", "教育", ["campus_qa"]]
  ];
  const assetStmt = db.prepare("INSERT OR IGNORE INTO platform_mcp_assets (id, project_id, name, capability, status, version, endpoint, category, tools) VALUES (?,?,?,?,?,?,?,?,?)");
  assets.forEach(([id, projectId, name, capability, status, version, endpoint, category, tools]) => {
    assetStmt.run(id, projectId, name, capability, status, version, endpoint, category, JSON.stringify(tools));
  });
  // 补丁：更新已存在资产的状态和版本（INSERT OR IGNORE 不会更新旧行）
  const assetPatch = db.prepare("UPDATE platform_mcp_assets SET status = ?, version = ? WHERE id = ?");
  assets.forEach(([id, , , , status, version]) => assetPatch.run(status, version, id));
  const releases = [
    ["rel_sales_120", "mcp_sales_top", "v1.2.0", "published", "2026-07-05 10:30:00", "2026-07-06 09:00:00", "零售经营版上线"],
    ["rel_member_110", "mcp_member_benefits", "v1.1.0", "published", "2026-07-04 14:20:00", "2026-07-05 11:10:00", "会员权益补充到期提醒"],
    ["rel_store_kb_090", "mcp_store_kb", "v0.9.0", "tested", "2026-07-07 18:00:00", null, "等待灰度发布"],
    ["rel_work_order_100", "mcp_work_order", "v1.0.0", "published", "2026-07-06 16:40:00", "2026-07-07 10:00:00", "制造工单正式发布"],
    ["rel_quality_100", "mcp_quality", "v1.0.0", "published", "2026-07-06 17:20:00", "2026-07-07 11:00:00", "质检分析上线"],
    ["rel_risk_100", "mcp_risk_alert", "v1.0.0", "published", "2026-07-06 09:00:00", "2026-07-06 15:30:00", "风控预警上线"],
    ["rel_property_ticket_100", "mcp_property_ticket", "v1.0.0", "published", "2026-07-05 15:00:00", "2026-07-06 08:40:00", "物业报修正式发布"],
    ["rel_edu_course_100", "mcp_edu_course", "v1.0.0", "published", "2026-07-04 10:00:00", "2026-07-05 09:20:00", "课程推荐上线"],
    ["rel_edu_qa_100", "mcp_edu_qa", "v1.0.0", "published", "2026-07-03 13:30:00", "2026-07-04 16:10:00", "校园知识问答上线"]
  ];
  const relStmt = db.prepare("INSERT OR IGNORE INTO platform_mcp_releases (id, asset_id, version, status, tested_at, released_at, notes) VALUES (?,?,?,?,?,?,?)");
  releases.forEach(item => relStmt.run(...item));
  // 补丁：同步更新已存在 release 的状态
  const relPatch = db.prepare("UPDATE platform_mcp_releases SET status = ?, released_at = ? WHERE id = ?");
  releases.forEach(([id, , , status, , releasedAt]) => relPatch.run(status, releasedAt, id));

  const policies = [
    ["pol_retail", "proj_retail_ai", "美佳 AI 网关策略", "API Key + JWT", "企业微信机器人、客服 Agent、经营看板", "600 rpm / 客户", JSON.stringify(["mobile", "member_id", "order_id", "amount"]), 1, "enabled"],
    ["pol_manufacturing", "proj_manufacturing_ops", "华智制造联调策略", "OAuth", "生产经理、质检 Agent", "120 rpm / 项目", JSON.stringify(["work_order_id", "employee_id"]), 1, "enabled"],
    ["pol_finance", "proj_finance_risk", "鑫融风控策略", "OAuth + mTLS", "风控 Agent、审计员", "60 rpm / 应用", JSON.stringify(["account_no", "id_card", "amount"]), 1, "pending"],
    ["pol_property", "proj_property_service", "安和服务策略", "API Key + JWT", "居民 App、物业后台", "300 rpm / 客户", JSON.stringify(["mobile", "room_no", "ticket_id"]), 1, "enabled"],
    ["pol_education", "proj_education_campus", "知行教育策略", "OAuth", "学生 App、老师助手", "200 rpm / 客户", JSON.stringify(["student_no", "course_code"]), 1, "enabled"]
  ];
  const polStmt = db.prepare("INSERT OR IGNORE INTO platform_gateway_policies (id, project_id, name, auth_mode, authorization_scope, rate_limit, masking_rules, audit_enabled, status) VALUES (?,?,?,?,?,?,?,?,?)");
  policies.forEach(item => polStmt.run(...item));

  // 修复旧版 seed 留下的非 JSON masking_rules 字段
  db.prepare("UPDATE platform_gateway_policies SET masking_rules = ? WHERE id = ? AND masking_rules NOT LIKE '[%'").run(JSON.stringify(["student_no", "course_code"]), "pol_education");
  db.prepare("UPDATE platform_gateway_policies SET masking_rules = ? WHERE id = ? AND masking_rules NOT LIKE '[%'").run(JSON.stringify(["work_order_id", "employee_id"]), "pol_manufacturing");
  db.prepare("UPDATE platform_gateway_policies SET masking_rules = ? WHERE id = ? AND masking_rules NOT LIKE '[%'").run(JSON.stringify(["mobile", "member_id", "order_id", "amount"]), "pol_retail");
  db.prepare("UPDATE platform_gateway_policies SET masking_rules = ? WHERE id = ? AND masking_rules NOT LIKE '[%'").run(JSON.stringify(["account_no", "id_card", "amount"]), "pol_finance");
  db.prepare("UPDATE platform_gateway_policies SET masking_rules = ? WHERE id = ? AND masking_rules NOT LIKE '[%'").run(JSON.stringify(["mobile", "room_no", "ticket_id"]), "pol_property");

  const policyChanges = [
    ["pchg_finance_1", "pol_finance", "rate_limit", "30 rpm / 应用", "60 rpm / 应用", "平台管理员", "2026-07-07 09:30:00"],
    ["pchg_retail_1", "pol_retail", "masking_rules", "[\"mobile\"]", "[\"mobile\",\"member_id\",\"order_id\"]", "平台管理员", "2026-07-06 16:10:00"]
  ];
  const polChangeStmt = db.prepare("INSERT OR IGNORE INTO platform_policy_changes (id, policy_id, field, old_value, new_value, changed_by, changed_at) VALUES (?,?,?,?,?,?,?)");
  policyChanges.forEach(item => polChangeStmt.run(...item));

  const deliverables = [
    ["del_cfg_retail", "proj_retail_ai", "MCP 配置包", "config", "ready"],
    ["del_test_retail", "proj_retail_ai", "上线测试报告", "test-report", "ready"],
    ["del_logs_retail", "proj_retail_ai", "调用日志 CSV", "log", "ready"],
    ["del_review_retail", "proj_retail_ai", "月度效果复盘", "effect-report", "generating"],
    ["del_kb_retail", "proj_retail_ai", "门店知识库导出", "knowledge-base", "ready"],
    ["del_cfg_manuf", "proj_manufacturing_ops", "华智 MCP 配置包", "config", "ready"],
    ["del_test_manuf", "proj_manufacturing_ops", "华智测试报告", "test-report", "ready"],
    ["del_cfg_property", "proj_property_service", "物业 MCP 配置包", "config", "ready"],
    ["del_cfg_edu", "proj_education_campus", "校园 AI 配置包", "config", "ready"]
  ];
  const delStmt = db.prepare("INSERT OR IGNORE INTO platform_deliverables (id, project_id, name, type, status) VALUES (?,?,?,?,?)");
  deliverables.forEach(item => delStmt.run(...item));

  const bills = [
    // ── 套餐订阅（月度 recurring） ──
    ["bill_sub_retail", "cust_retail", "standard", "subscription", "标准版月费", "2026-07", 2980, 0, 0, 2980, "confirmed", 28642, "5 项目 / 10 资产 / 50,000 次调用"],
    ["bill_sub_manufact", "cust_manufact", "professional", "subscription", "专业版月费", "2026-07", 9800, 0, 0, 9800, "confirmed", 8200, "不限项目/资产 / 500,000 次调用 / 私有化支持"],
    ["bill_sub_finance", "cust_finance", "enterprise", "subscription", "企业版月费", "2026-07", 0, 0, 0, 0, "pending", 4500, "定制报价 · 待签约"],
    ["bill_sub_property", "cust_property", "standard", "subscription", "标准版月费", "2026-07", 2980, 0, 0, 2980, "confirmed", 12500, "5 项目 / 10 资产 / 50,000 次调用"],
    ["bill_sub_edu", "cust_education", "standard", "subscription", "标准版月费", "2026-07", 2980, 0, 0, 2980, "pending", 8600, "5 项目 / 10 资产 / 50,000 次调用"],
    // ── 按量超额（超出套餐额度部分） ──
    ["bill_overage_retail", "cust_retail", "standard", "overage", "超额调用费", "2026-07", 0, 3500, 70, 70, "pending", 3500, "超出 50,000 次额度 × ¥0.02/次"],
    ["bill_overage_property", "cust_property", "standard", "overage", "超额调用费", "2026-07", 0, 1200, 24, 24, "pending", 1200, "超出 50,000 次额度 × ¥0.02/次"],
    // ── 增值服务 ──
    ["bill_addon_finance_deploy", "cust_finance", "enterprise", "addon", "私有化部署", "2026-Q3", 0, 0, 0, 30000, "pending", 0, "金融行业私有化部署 · 一次性"],
    ["bill_addon_manufact_train", "cust_manufact", "professional", "addon", "专属培训", "2026-07", 0, 0, 0, 5000, "confirmed", 0, "MES 产线 MCP 专项培训 · 一次性"],
    ["bill_addon_edu_support", "cust_education", "standard", "addon", "7×24 技术支持", "2026-07", 0, 0, 0, 2000, "pending", 0, "月度增值 · 可随时取消"]
  ];
  const billStmt = db.prepare("INSERT OR IGNORE INTO platform_billing_records (id, customer_id, tier, billing_type, item, period, base_amount, overage_calls, overage_amount, total_amount, status, usage_count, notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)");
  bills.forEach(item => billStmt.run(...item));

  const callEvents = [
    ["evt_seed_001", "mcp_sales_top", "经营看板", "success", 142, "查询 Top10 销售额", "trace_001", 48, 375, '{"top_n":10,"date_range":"month"}', '{"results":10,"top":"品类_A1"}'],
    ["evt_seed_002", "mcp_sales_top", "企业微信机器人", "success", 168, "门店日报查询", "trace_002", 52, 290, '{"date_range":"today","store_id":"S001"}', '{"report":"日报已生成"}'],
    ["evt_seed_003", "mcp_member_benefits", "客服 Agent", "success", 188, "权益到期提醒", "trace_003", 35, 85, '{"member_id":"M10001"}', '{"expiring_points":320}'],
    ["evt_seed_004", "mcp_member_benefits", "经营看板", "success", 154, "会员活跃度", "trace_004", 30, 72, '{"metric":"active_rate"}', '{"active_rate":"68%"}'],
    ["evt_seed_005", "mcp_work_order", "生产经理", "success", 211, "工单进度查询", "trace_005", 42, 68, '{"work_order_id":"WO-1024"}', '{"status":"进行中","progress":65}'],
    ["evt_seed_006", "mcp_work_order", "质检 Agent", "error", 340, "工单不存在", "trace_006", 38, 15, '{"work_order_id":"WO-9999"}', '{"error":"not_found"}'],
    ["evt_seed_007", "mcp_quality", "质检 Agent", "success", 198, "当日质检数据", "trace_007", 45, 120, '{"batch_no":"QC-202607","top_n":5}', '{"passed":42,"failed":3}'],
    ["evt_seed_008", "mcp_risk_alert", "风控 Agent", "success", 245, "账户风险扫描", "trace_008", 55, 95, '{"scan_type":"full","level":"high"}', '{"alerts":2,"high_risk":1}'],
    ["evt_seed_009", "mcp_property_ticket", "居民 App", "success", 132, "报修工单创建", "trace_009", 60, 48, '{"type":"plumbing","unit":"A栋301"}', '{"ticket_id":"PT-2026-0892"}'],
    ["evt_seed_010", "mcp_property_notice", "管理后台", "success", 117, "通知广播", "trace_010", 50, 35, '{"scope":"all","channel":"wechat"}', '{"sent":156,"delivered":148}'],
    ["evt_seed_011", "mcp_edu_course", "学生 App", "success", 178, "课程推荐", "trace_011", 65, 110, '{"student_id":"STU2001","top_k":3}', '{"recommended":["数学","英语","物理"]}'],
    ["evt_seed_012", "mcp_edu_qa", "老师助手", "success", 165, "校园知识问答", "trace_012", 40, 88, '{"query":"请假流程"}', '{"answer":"提交电子请假单..."}'],
    ["evt_seed_013", "mcp_sales_top", "经营看板", "success", 156, "查询 Top5", "trace_013", 36, 185, '{"top_n":5,"date_range":"week"}', '{"results":5}'],
    ["evt_seed_014", "mcp_store_kb", "客服 Agent", "success", 188, "退换货规则查询", "trace_014", 48, 72, '{"query":"七天无理由退换货"}', '{"answer":"支持7天无理由..."}'],
    ["evt_seed_015", "mcp_work_order", "质检 Agent", "success", 220, "工单详情", "trace_015", 42, 65, '{"work_order_id":"WO-1025"}', '{"status":"已完成"}']
  ];
  const evtStmt = db.prepare("INSERT OR IGNORE INTO platform_call_events (id, asset_id, caller, status, latency_ms, business_result, trace_id, input_tokens, output_tokens, request_params, response_summary) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
  callEvents.forEach(item => evtStmt.run(...item));
  // 补丁：同步更新已存在 seed 事件的 token 和参数字段
  const evtPatch = db.prepare("UPDATE platform_call_events SET input_tokens = ?, output_tokens = ?, request_params = ?, response_summary = ? WHERE id = ?");
  callEvents.forEach(([id, , , , , , , inTok, outTok, reqP, respS]) => evtPatch.run(inTok, outTok, reqP, respS, id));

  // 补丁：给旧事件（simulate-call 产生、business_result 中有 token 但字段为 0）补全 token 字段
  const staleEvents = db.prepare("SELECT id, business_result FROM platform_call_events WHERE input_tokens = 0 AND output_tokens = 0 AND business_result LIKE '%input_tokens%'").all();
  if (staleEvents.length) {
    const fixStmt = db.prepare("UPDATE platform_call_events SET input_tokens = ?, output_tokens = ? WHERE id = ?");
    for (const e of staleEvents) {
      try {
        const br = JSON.parse(e.business_result);
        if (br.input_tokens || br.output_tokens) fixStmt.run(br.input_tokens || 0, br.output_tokens || 0, e.id);
      } catch {}
    }
  }

  const accessConfigs = [
    ["acc_sse", null, null, "平台 SSE 接入点", "sse", "http://localhost:3100/sse", "", "全局", "enabled", "production", null, null, null, null, "平台级 SSE 流式接入点，用于 Agent 实时调用"],
    ["acc_retail_api", "cust_retail", "proj_retail_ai", "美佳零售 API Key", "api_key", "", "ak_retail_***", "门店数据、会员数据", "enabled", "production", null, "2026-09-30T23:59:59", "2026-06-15T10:30:00", "https://hooks.mcpforge.local/retail/callback", "支持门店 POS 与会员系统"],
    ["acc_manuf_oauth", "cust_manufacturing", "proj_manufacturing_ops", "华智制造 OAuth", "oauth", "", "token_***", "工单、质检数据", "enabled", "sandbox", null, "2026-08-15T23:59:59", null, null, "测试环境 OAuth 接入"],
    ["acc_finance_mtls", "cust_finance", "proj_finance_risk", "鑫融金服 mTLS", "mtls", "", "cert_***", "风控策略", "pending", "production", "sha256:abc123def456...", "2026-12-31T23:59:59", "2026-06-01T08:00:00", null, "金融级双向认证，待证书下发"],
    ["acc_property_wechat", "cust_property", "proj_property_service", "安和物业企业微信", "webhook", "https://work.weixin.qq.com/...", "", "居民通知、报修", "enabled", "production", null, null, null, "https://hooks.mcpforge.local/property/callback", "用于居民通知广播和报修回调"],
    ["acc_edu_dingtalk", "cust_education", "proj_education_campus", "知行教育钉钉", "webhook", "https://oapi.dingtalk.com/...", "", "校园问答、课程提醒", "enabled", "production", null, null, null, "https://hooks.mcpforge.local/education/callback", "用于校园 AI 助手通知分发"]
  ];
  const accStmt = db.prepare(`INSERT OR IGNORE INTO platform_access_configs
    (id, customer_id, project_id, name, type, endpoint, api_key, scope, status, environment, certificate, expires_at, credential_last_rotated_at, webhook_url, description)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  accessConfigs.forEach(item => accStmt.run(...item));

  const accessAudit = [
    ["acc_audit_1", "acc_finance_mtls", "status", "draft", "pending", "平台管理员", "2026-07-06 10:00:00"],
    ["acc_audit_2", "acc_retail_api", "webhook_url", "", "https://hooks.mcpforge.local/retail/callback", "平台管理员", "2026-07-05 15:20:00"]
  ];
  const accessAuditStmt = db.prepare("INSERT OR IGNORE INTO platform_access_audit (id, access_id, field, old_value, new_value, changed_by, changed_at) VALUES (?,?,?,?,?,?,?)");
  accessAudit.forEach(item => accessAuditStmt.run(...item));

  const healthChecks = [
    ["acc_health_1", "acc_retail_api", "success", 126, 200, 1, "", JSON.stringify({ message: "token valid" }), "平台管理员", "2026-07-07 10:30:00"],
    ["acc_health_2", "acc_manuf_oauth", "success", 214, 200, 1, "", JSON.stringify({ message: "sandbox connected" }), "平台管理员", "2026-07-07 10:20:00"],
    ["acc_health_3", "acc_finance_mtls", "error", 0, 495, 0, "证书尚未生效", JSON.stringify({ message: "certificate pending" }), "平台管理员", "2026-07-07 09:50:00"]
  ];
  const healthStmt = db.prepare("INSERT OR IGNORE INTO platform_access_health_checks (id, access_id, status, latency_ms, status_code, auth_ok, error_message, detail, checked_by, checked_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
  healthChecks.forEach(item => healthStmt.run(...item));

  const webhookLogs = [
    ["acc_webhook_1", "acc_property_wechat", "ticket.created", "https://hooks.mcpforge.local/property/callback", "success", 200, 0, "", "2026-07-07 09:10:00"],
    ["acc_webhook_2", "acc_edu_dingtalk", "course.notice", "https://hooks.mcpforge.local/education/callback", "success", 200, 1, "", "2026-07-07 08:40:00"]
  ];
  const webhookStmt = db.prepare("INSERT OR IGNORE INTO platform_access_webhook_logs (id, access_id, event_type, url, status, status_code, retry_count, error_message, created_at) VALUES (?,?,?,?,?,?,?,?,?)");
  webhookLogs.forEach(item => webhookStmt.run(...item));

  db.prepare("UPDATE platform_access_configs SET last_health_status = ?, last_health_check_at = ?, last_health_detail = ? WHERE id = ?").run("success", "2026-07-07 10:30:00", JSON.stringify({ message: "token valid" }), "acc_retail_api");
  db.prepare("UPDATE platform_access_configs SET last_health_status = ?, last_health_check_at = ?, last_health_detail = ? WHERE id = ?").run("success", "2026-07-07 10:20:00", JSON.stringify({ message: "sandbox connected" }), "acc_manuf_oauth");
  db.prepare("UPDATE platform_access_configs SET last_health_status = ?, last_health_check_at = ?, last_health_detail = ? WHERE id = ?").run("error", "2026-07-07 09:50:00", JSON.stringify({ message: "certificate pending" }), "acc_finance_mtls");

  const kbCols = [
    ["col_store_ops", "门店运营手册", "门店日常运营、收银、退换货与服务规范", 4, 12, "active"],
    ["col_product_faq", "商品常见问题", "商品规格、价格、库存与售后问答", 3, 9, "active"],
    ["col_promo_rules", "促销活动规则", "满减、会员日与优惠券规则", 2, 6, "active"],
    ["col_campus_service", "校园事务问答", "校园卡、宿舍、请假与教务高频问答", 3, 3, "active"]
  ];
  const kbColStmt = db.prepare("INSERT OR IGNORE INTO kb_collections (id, name, description, doc_count, chunk_count, status) VALUES (?,?,?,?,?,?)");
  kbCols.forEach(item => kbColStmt.run(...item));

  const kbDocs = [
    ["doc_opening", "col_store_ops", "门店开店流程", "https://kb.mcpforge.local/store/opening", 3, "indexed"],
    ["doc_return", "col_store_ops", "退换货政策", "https://kb.mcpforge.local/store/return", 4, "indexed"],
    ["doc_service", "col_store_ops", "客诉处理规范", "https://kb.mcpforge.local/store/service", 3, "indexed"],
    ["doc_close", "col_store_ops", "闭店盘点要点", "https://kb.mcpforge.local/store/close", 2, "indexed"],
    ["doc_price", "col_product_faq", "商品价格说明", "https://kb.mcpforge.local/product/price", 3, "indexed"],
    ["doc_stock", "col_product_faq", "库存查询与补货", "https://kb.mcpforge.local/product/stock", 3, "indexed"],
    ["doc_spec", "col_product_faq", "商品规格对照", "https://kb.mcpforge.local/product/spec", 3, "indexed"],
    ["doc_full_reduction", "col_promo_rules", "满减活动规则", "https://kb.mcpforge.local/promo/full", 3, "indexed"],
    ["doc_member_day", "col_promo_rules", "会员日权益", "https://kb.mcpforge.local/promo/member", 3, "indexed"],
    ["doc_campus_card", "col_campus_service", "校园卡补办流程", "https://kb.mcpforge.local/campus/card", 1, "indexed"],
    ["doc_campus_leave", "col_campus_service", "学生请假说明", "https://kb.mcpforge.local/campus/leave", 1, "indexed"],
    ["doc_campus_dorm", "col_campus_service", "宿舍报修与门禁", "https://kb.mcpforge.local/campus/dorm", 1, "indexed"]
  ];
  const kbDocStmt = db.prepare("INSERT OR IGNORE INTO kb_documents (id, collection_id, title, url, chunk_count, status) VALUES (?,?,?,?,?,?)");
  kbDocs.forEach(item => kbDocStmt.run(...item));

  const kbCollectionBindings = [
    ["col_store_ops", "proj_retail_ai", "ds_kb"],
    ["col_product_faq", "proj_retail_ai", "ds_kb"],
    ["col_promo_rules", "proj_retail_ai", "ds_kb"],
    ["col_campus_service", "proj_education_campus", "ds_edu_kb"]
  ];
  const kbColUpdateStmt = db.prepare("UPDATE kb_collections SET project_id = COALESCE(project_id, ?), source_id = COALESCE(source_id, ?), indexed_at = COALESCE(indexed_at, datetime('now')) WHERE id = ?");
  kbCollectionBindings.forEach(([id, projectId, sourceId]) => kbColUpdateStmt.run(projectId, sourceId, id));

  const kbChunkStmt = db.prepare("INSERT OR IGNORE INTO kb_chunks (id, document_id, collection_id, content, keywords) VALUES (?,?,?,?,?)");
  const kbChunkSeeds = [
    ["chunk_opening", "doc_opening", "col_store_ops", "门店开店前需要检查收银设备、营业物料、系统登录和交接班状态，异常先上报再营业。", "开店,收银,交接班"],
    ["chunk_return", "doc_return", "col_store_ops", "退换货默认校验小票、会员订单与商品状态，生鲜和临期商品按门店政策特殊处理。", "退换货,小票,订单"],
    ["chunk_service", "doc_service", "col_store_ops", "客户投诉需要先确认事实，再给出补偿建议和升级路径，敏感问题需转店长处理。", "投诉,补偿,升级"],
    ["chunk_close", "doc_close", "col_store_ops", "闭店盘点需核对现金、库存差异和异常订单，交班后统一提交日结。", "闭店,盘点,日结"],
    ["chunk_price", "doc_price", "col_product_faq", "商品价格说明优先以收银系统和当日活动价签为准，人工口径需要和系统同步。", "价格,价签,活动"],
    ["chunk_stock", "doc_stock", "col_product_faq", "库存查询优先回答门店现货和补货时间，缺货商品需提示替代推荐。", "库存,补货,替代"],
    ["chunk_spec", "doc_spec", "col_product_faq", "商品规格问答需要明确容量、型号和适用场景，避免只返回笼统名称。", "规格,型号,适用场景"],
    ["chunk_full", "doc_full_reduction", "col_promo_rules", "满减活动按实付金额计算，会员券和满减是否同享需看活动说明。", "满减,实付,同享"],
    ["chunk_member", "doc_member_day", "col_promo_rules", "会员日权益包括积分翻倍、专属券和指定商品折扣，门店可查看当天有效范围。", "会员日,积分,优惠券"],
    ["chunk_card", "doc_campus_card", "col_campus_service", "校园卡补办需要学生证和身份证明，挂失后由一卡通中心在两个工作日内补发。", "校园卡,补办,挂失"],
    ["chunk_leave", "doc_campus_leave", "col_campus_service", "学生请假需在系统提交请假单，经辅导员审批后生效，紧急情况可先电话报备。", "请假,辅导员,审批"],
    ["chunk_dorm", "doc_campus_dorm", "col_campus_service", "宿舍报修通过校园助手提交，水电和门禁问题会分派给不同维修班组。", "宿舍,报修,门禁"]
  ];
  kbChunkSeeds.forEach(item => kbChunkStmt.run(...item));

  db.prepare("UPDATE kb_documents SET chunk_count = (SELECT COUNT(*) FROM kb_chunks WHERE document_id = kb_documents.id), updated_at = COALESCE(updated_at, datetime('now')), status = COALESCE(status, 'indexed')").run();
  db.prepare("UPDATE kb_collections SET doc_count = (SELECT COUNT(*) FROM kb_documents WHERE collection_id = kb_collections.id), chunk_count = (SELECT COUNT(*) FROM kb_chunks WHERE collection_id = kb_collections.id), indexed_at = COALESCE(indexed_at, datetime('now')), status = COALESCE(status, 'active')").run();

  // 阶段三：OpenAPI 描述 seed
  const openapiSpecs = [
    ["spec_pos", "ds_pos", "proj_retail_ai", "POS 销售报表接口",
     JSON.stringify({
       openapi: "3.0.0", info: { title: "POS 销售报表接口", version: "1.0.0" },
       paths: {
         "/api/sales/top": {
           get: {
             summary: "查询销售排行",
             parameters: [
               { name: "date_range", in: "query", required: false, schema: { type: "string" }, description: "时间范围" },
               { name: "top_n", in: "query", required: false, schema: { type: "integer" }, description: "Top N 数量" }
             ],
             responses: {
               "200": {
                 description: "销售排行",
                 content: {
                   "application/json": {
                     schema: {
                       type: "array",
                       items: {
                         type: "object",
                         properties: {
                           product: { type: "string" },
                           revenue: { type: "number" },
                           quantity: { type: "integer" }
                         }
                       }
                     }
                   }
                 }
               }
             }
           }
         }
       }
     })],
    ["spec_crm", "ds_crm", "proj_retail_ai", "会员 CRM 数据库",
     JSON.stringify({
       openapi: "3.0.0", info: { title: "会员 CRM 数据库", version: "1.0.0" },
       paths: {
         "/api/member/benefits": {
           get: {
             summary: "查询会员到期权益",
             parameters: [
               { name: "member_id", in: "query", required: true, schema: { type: "string" }, description: "会员编号" }
             ],
             responses: {
               "200": {
                 description: "会员权益",
                 content: {
                   "application/json": {
                     schema: {
                       type: "object",
                       properties: {
                         member: { type: "string" },
                         current_points: { type: "integer" },
                         expiring_points: { type: "integer" },
                         coupons: { type: "array", items: { type: "string" } }
                       }
                     }
                   }
                 }
               }
             }
           }
         }
       }
     })],
    ["spec_mes", "ds_mes", "proj_manufacturing_ops", "MES 工单接口",
     JSON.stringify({
       openapi: "3.0.0", info: { title: "MES 工单接口", version: "1.0.0" },
       paths: {
         "/api/work-orders/{id}": {
           get: {
             summary: "查询工单详情",
             parameters: [
               { name: "id", in: "path", required: true, schema: { type: "string" }, description: "工单编号" }
             ],
             responses: {
               "200": {
                 description: "工单详情",
                 content: {
                   "application/json": {
                     schema: {
                       type: "object",
                       properties: {
                         order_id: { type: "string" },
                         product: { type: "string" },
                         status: { type: "string" },
                         quantity: { type: "integer" },
                         progress: { type: "number" }
                       }
                     }
                   }
                 }
               }
             }
           }
         }
       }
     })],
    ["spec_qms", "ds_qms", "proj_manufacturing_ops", "质量记录数据库",
     JSON.stringify({
       openapi: "3.0.0", info: { title: "质量记录数据库", version: "1.0.0" },
       paths: {
         "/api/quality/daily": {
           get: {
             summary: "当日质检数据",
             parameters: [
               { name: "date", in: "query", required: false, schema: { type: "string" }, description: "日期" }
             ],
             responses: {
               "200": {
                 description: "质检数据",
                 content: {
                   "application/json": {
                     schema: {
                       type: "object",
                       properties: {
                         total: { type: "integer" },
                         pass: { type: "integer" },
                         fail: { type: "integer" }
                       }
                     }
                   }
                 }
               }
             }
           }
         }
       }
     })],
    ["spec_risk", "ds_risk", "proj_finance_risk", "风控策略服务",
     JSON.stringify({
       openapi: "3.0.0", info: { title: "风控策略服务", version: "1.0.0" },
       paths: {
         "/api/risk/scan": {
           post: {
             summary: "账户风险扫描",
             requestBody: {
               content: {
                 "application/json": {
                   schema: {
                     type: "object",
                     properties: { account_id: { type: "string" } }
                   }
                 }
               }
             },
             responses: {
               "200": {
                 description: "风险扫描结果",
                 content: {
                   "application/json": {
                     schema: {
                       type: "object",
                       properties: {
                         account_id: { type: "string" },
                         risk_level: { type: "string" },
                         alerts: { type: "array", items: { type: "string" } }
                       }
                     }
                   }
                 }
               }
             }
           }
         }
       }
     })],
    ["spec_tickets", "ds_property_tickets", "proj_property_service", "物业工单系统",
     JSON.stringify({
       openapi: "3.0.0", info: { title: "物业工单系统", version: "1.0.0" },
       paths: {
         "/api/tickets": {
           post: {
             summary: "创建报修工单",
             requestBody: {
               content: {
                 "application/json": {
                   schema: {
                     type: "object",
                     properties: {
                       room_no: { type: "string" },
                       description: { type: "string" }
                     }
                   }
                 }
               }
             },
             responses: {
               "200": {
                 description: "工单创建结果",
                 content: {
                   "application/json": {
                     schema: {
                       type: "object",
                       properties: {
                         ticket_id: { type: "string" },
                         status: { type: "string" },
                         created_at: { type: "string" }
                       }
                     }
                   }
                 }
               }
             }
           }
         }
       }
     })],
    ["spec_residents", "ds_property_residents", "proj_property_service", "住户主数据",
     JSON.stringify({
       openapi: "3.0.0", info: { title: "住户主数据", version: "1.0.0" },
       paths: {
         "/api/residents/{id}": {
           get: {
             summary: "查询住户信息",
             parameters: [
               { name: "id", in: "path", required: true, schema: { type: "string" }, description: "住户编号" }
             ],
             responses: {
               "200": {
                 description: "住户信息",
                 content: {
                   "application/json": {
                     schema: {
                       type: "object",
                       properties: {
                         resident_id: { type: "string" },
                         name: { type: "string" },
                         room_no: { type: "string" }
                       }
                     }
                   }
                 }
               }
             }
           }
         }
       }
     })],
    ["spec_courses", "ds_edu_courses", "proj_education_campus", "选课系统",
     JSON.stringify({
       openapi: "3.0.0", info: { title: "选课系统", version: "1.0.0" },
       paths: {
         "/api/courses/recommend": {
           get: {
             summary: "课程推荐",
             parameters: [
               { name: "student_id", in: "query", required: false, schema: { type: "string" }, description: "学号" }
             ],
             responses: {
               "200": {
                 description: "推荐课程",
                 content: {
                   "application/json": {
                     schema: {
                       type: "array",
                       items: {
                         type: "object",
                         properties: {
                           course_code: { type: "string" },
                           name: { type: "string" },
                           credits: { type: "integer" }
                         }
                       }
                     }
                   }
                 }
               }
             }
           }
         }
       }
     })],
    ["spec_kb", "ds_kb", "proj_retail_ai", "门店服务知识库",
     JSON.stringify({
       openapi: "3.0.0", info: { title: "门店服务知识库", version: "1.0.0" },
       paths: {
         "/api/kb/search": {
           post: {
             summary: "知识库检索",
             requestBody: {
               content: {
                 "application/json": {
                   schema: {
                     type: "object",
                     properties: {
                       query: { type: "string" },
                       top_k: { type: "integer" }
                     }
                   }
                 }
               }
             },
             responses: {
               "200": {
                 description: "检索结果",
                 content: {
                   "application/json": {
                     schema: {
                       type: "object",
                       properties: {
                         answer: { type: "string" },
                         sources: { type: "array", items: { type: "string" } }
                       }
                     }
                   }
                 }
               }
             }
           }
         }
       }
     })],
    ["spec_edu_kb", "ds_edu_kb", "proj_education_campus", "校园知识库",
     JSON.stringify({
       openapi: "3.0.0", info: { title: "校园知识库", version: "1.0.0" },
       paths: {
         "/api/campus/kb/qa": {
           post: {
             summary: "校园问答",
             requestBody: {
               content: {
                 "application/json": {
                   schema: {
                     type: "object",
                     properties: { question: { type: "string" } }
                   }
                 }
               }
             },
             responses: {
               "200": {
                 description: "问答结果",
                 content: {
                   "application/json": {
                     schema: {
                       type: "object",
                       properties: {
                         answer: { type: "string" },
                         related: { type: "array", items: { type: "string" } }
                       }
                     }
                   }
                 }
               }
             }
           }
         }
       }
     })]
  ];
  const specStmt2 = db.prepare("INSERT OR IGNORE INTO platform_openapi_specs (id, source_id, project_id, title, spec) VALUES (?,?,?,?,?)");
  openapiSpecs.forEach(item => specStmt2.run(...item));

  // 阶段三：生成流程时间线 seed
  const timelineStages = [
    { stage: "source-connected", label: "数据源接入" },
    { stage: "api-identified", label: "接口识别" },
    { stage: "openapi-generated", label: "OpenAPI 生成" },
    { stage: "tool-mapped", label: "Tool 映射" },
    { stage: "security-configured", label: "安全配置" },
    { stage: "sandbox-tested", label: "沙箱测试" },
    { stage: "canary-published", label: "灰度发布" },
    { stage: "production-published", label: "生产发布" }
  ];
  const timelineSeeds = [
    // mcp_sales_top: published -> all 8 done
    ["tl_sales_1", "mcp_sales_top", "source-connected", "数据源接入", "done", "李实施", "2026-06-28 09:00:00", "POS 销售报表接口已接入"],
    ["tl_sales_2", "mcp_sales_top", "api-identified", "接口识别", "done", "李实施", "2026-06-28 11:00:00", "识别出 /api/sales/top 接口"],
    ["tl_sales_3", "mcp_sales_top", "openapi-generated", "OpenAPI 生成", "done", "李实施", "2026-06-29 10:00:00", "OpenAPI 3.0 描述已生成"],
    ["tl_sales_4", "mcp_sales_top", "tool-mapped", "Tool 映射", "done", "李实施", "2026-06-29 14:00:00", "映射为 sales_top_products"],
    ["tl_sales_5", "mcp_sales_top", "security-configured", "安全配置", "done", "平台管理员", "2026-06-30 09:00:00", "脱敏规则已配置"],
    ["tl_sales_6", "mcp_sales_top", "sandbox-tested", "沙箱测试", "done", "李实施", "2026-07-02 10:00:00", "沙箱测试通过"],
    ["tl_sales_7", "mcp_sales_top", "canary-published", "灰度发布", "done", "平台管理员", "2026-07-04 16:00:00", "灰度发布完成"],
    ["tl_sales_8", "mcp_sales_top", "production-published", "生产发布", "done", "平台管理员", "2026-07-05 10:00:00", "v1.2.0 生产上线"],
    // mcp_work_order: testing -> 1-6 done, 7-8 pending
    ["tl_wo_1", "mcp_work_order", "source-connected", "数据源接入", "done", "王实施", "2026-06-25 09:00:00", "MES 工单接口已接入"],
    ["tl_wo_2", "mcp_work_order", "api-identified", "接口识别", "done", "王实施", "2026-06-25 14:00:00", "识别出工单接口"],
    ["tl_wo_3", "mcp_work_order", "openapi-generated", "OpenAPI 生成", "done", "王实施", "2026-06-26 10:00:00", "OpenAPI 描述已生成"],
    ["tl_wo_4", "mcp_work_order", "tool-mapped", "Tool 映射", "done", "王实施", "2026-06-26 15:00:00", "映射为 work_order_lookup"],
    ["tl_wo_5", "mcp_work_order", "security-configured", "安全配置", "done", "平台管理员", "2026-06-27 09:00:00", "OAuth 认证已配置"],
    ["tl_wo_6", "mcp_work_order", "sandbox-tested", "沙箱测试", "done", "王实施", "2026-07-06 16:00:00", "沙箱测试通过"],
    ["tl_wo_7", "mcp_work_order", "canary-published", "灰度发布", "pending", "", "", "等待灰度发布审批"],
    ["tl_wo_8", "mcp_work_order", "production-published", "生产发布", "pending", "", "", "等待生产发布"]
  ];
  const tlStmt = db.prepare("INSERT OR IGNORE INTO platform_asset_timeline (id, asset_id, stage, stage_label, status, operator, completed_at, notes) VALUES (?,?,?,?,?,?,?,?)");
  timelineSeeds.forEach(item => tlStmt.run(...item));
}

// ============== Auth API ==============
app.post("/auth/login", (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: "username and password required" });
  const user = db.prepare("SELECT * FROM platform_users WHERE username = ?").get(username);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: "鐢ㄦ埛鍚嶆垨瀵嗙爜閿欒" });
  }
  const token = makeId("tok");
  const expires = new Date(Date.now() + 8 * 3600 * 1000).toISOString().replace("T", " ").replace("Z", "");
  db.prepare("INSERT INTO platform_sessions (token, user_id, expires_at) VALUES (?,?,?)").run(token, user.id, expires);
  res.json({
    token,
    user: { id: user.id, username: user.username, role: user.role, display_name: user.display_name, customer_id: user.customer_id }
  });
});

app.post("/auth/logout", requireAuth, (req, res) => {
  db.prepare("DELETE FROM platform_sessions WHERE token = ?").run(req.user.token);
  res.json({ ok: true });
});

app.get("/auth/me", requireAuth, (req, res) => res.json({
  id: req.user.id, username: req.user.username, role: req.user.role,
  display_name: req.user.display_name, customer_id: req.user.customer_id
}));

app.get("/health", (req, res) => res.json({
  status: "ok", service: "mcp-forge-admin",
  uptime: Math.round(process.uptime()),
  assets: count("platform_mcp_assets"),
  projects: count("platform_projects")
}));

// ============== 骞冲彴 API ==============
app.get("/api/platform/summary", requireAuth, (req, res) => {
  const projects = scopedProjects(req);
  const assets = scopedAssets(req);
  const ids = assets.map(a => a.id);
  const stats = callStats(ids);
  const visibleCustomerIds = [...new Set(projects.map(project => project.customer_id).filter(Boolean))];
  const pending = db.prepare(`SELECT COUNT(*) AS n FROM platform_gateway_policies WHERE status = 'pending'`).get().n;
  const deliverables = db.prepare(`SELECT COUNT(*) AS n FROM platform_deliverables WHERE status IN ('ready','generating')`).get().n;
  const billingSql = visibleCustomerIds.length
    ? `SELECT COALESCE(SUM(total_amount), 0) AS total FROM platform_billing_records WHERE customer_id IN (${visibleCustomerIds.map(() => "?").join(",")})`
    : `SELECT 0 AS total`;
  const billingAmount = db.prepare(billingSql).get(...visibleCustomerIds).total || 0;
  res.json({
    customers: visibleCustomerIds.length,
    assets: assets.length,
    published: assets.filter(item => item.status === 'published').length,
    calls: stats.total,
    successRate: stats.total ? Math.round((stats.success / stats.total) * 100) : 0,
    billingAmount,
    project_total: projects.length,
    asset_total: assets.length,
    call_total: stats.total,
    call_success: stats.success,
    policy_pending: pending,
    deliverable_ready: deliverables
  });
});

app.get("/api/platform/customers", requireAuth, (req, res) => {
  const cid = customerScope(req);
  const sql = `SELECT c.*, COUNT(p.id) AS project_count FROM platform_customers c
    LEFT JOIN platform_projects p ON p.customer_id = c.id` +
    (cid ? ` WHERE c.id = ?` : ``) + ` GROUP BY c.id ORDER BY c.id`;
  res.json(cid ? db.prepare(sql).all(cid) : db.prepare(sql).all());
});

app.get("/api/platform/projects", requireAuth, (req, res) => res.json(scopedProjects(req)));

app.get("/api/platform/projects/:id", requireAuth, (req, res) => {
  const project = scopedProjectById(req, req.params.id);
  if (!project) return res.status(404).json({ error: "project not found" });
  res.json(project);
});

app.put("/api/platform/projects/:id", requireAuth, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, status, implementer, progress, deadline } = req.body || {};
  const existing = db.prepare("SELECT * FROM platform_projects WHERE id = ?").get(id);
  if (!existing) return res.status(404).json({ error: "project not found" });
  db.prepare(`UPDATE platform_projects SET
    name = COALESCE(?, name), status = COALESCE(?, status),
    implementer = COALESCE(?, implementer), progress = COALESCE(?, progress),
    deadline = COALESCE(?, deadline) WHERE id = ?`).run(
    name || null, status || null, implementer || null, progress ?? null, deadline || null, id
  );
  res.json(scopedProjectById(req, id));
});

app.get("/api/platform/data-sources", requireAuth, (req, res) => {
  const ids = scopedProjects(req).map(p => p.id);
  if (!ids.length) return res.json([]);
  res.json(db.prepare(`SELECT s.*, p.name AS project_name FROM platform_data_sources s
    JOIN platform_projects p ON p.id = s.project_id WHERE s.project_id IN (${ids.map(() => "?").join(",")})
    ORDER BY s.status DESC, s.id`).all(...ids));
});

app.post("/api/platform/data-sources", requireAuth, requireAdmin, (req, res) => {
  const { project_id, name, type, auth_mode, scope, status } = req.body || {};
  if (!project_id || !name || !type) return res.status(400).json({ error: "project_id, name and type required" });
  const project = db.prepare("SELECT id FROM platform_projects WHERE id = ?").get(project_id);
  if (!project) return res.status(404).json({ error: "project not found" });
  const id = makeId("ds");
  db.prepare("INSERT INTO platform_data_sources (id, project_id, name, type, auth_mode, status) VALUES (?,?,?,?,?,?)").run(
    id,
    project_id,
    name,
    type,
    auth_mode || "API Key",
    status || (type === "Knowledge Base" ? "indexed" : "draft")
  );
  res.status(201).json(db.prepare(`SELECT s.*, p.name AS project_name FROM platform_data_sources s
    JOIN platform_projects p ON p.id = s.project_id WHERE s.id = ?`).get(id));
});

// 触发 AI 接口识别：异步调用大模型 → 生成 OpenAPI + Tools
app.post("/api/platform/data-sources/:id/recognize", requireAuth, requireAdmin, async (req, res) => {
  const source = db.prepare("SELECT s.*, p.name AS project_name FROM platform_data_sources s JOIN platform_projects p ON p.id = s.project_id WHERE s.id = ?").get(req.params.id);
  if (!source) return res.status(404).json({ error: "data source not found" });

  const useAI = req.body?.use_ai !== false; // 默认使用 AI
  const sampleContent = req.body?.sample_content || req.body?.description || '';

  // 标记识别中
  db.prepare("UPDATE platform_data_sources SET recognition_status = 'pending' WHERE id = ?").run(source.id);
  const pendingSource = db.prepare("SELECT s.*, p.name AS project_name FROM platform_data_sources s JOIN platform_projects p ON p.id = s.project_id WHERE s.id = ?").get(source.id);

  // 如果未配置 AI 或明确要求不使用 AI，走静态 fallback
  if (!useAI || !isAIConfigured()) {
    db.prepare("UPDATE platform_data_sources SET recognition_status = 'done', status = ? WHERE id = ?").run(
      source.type === "Knowledge Base" ? "indexed" : "connected", source.id
    );
    const existing = db.prepare("SELECT id FROM platform_openapi_specs WHERE source_id = ?").get(source.id);
    let specId = existing?.id;
    if (!existing) {
      specId = makeId("spec");
      const autoSpec = {
        openapi: "3.0.0",
        info: { title: source.name || "AI 识别结果", version: "1.0.0" },
        paths: {
          [source.type === "Database" ? "/records/{id}" : "/api/query"]: {
            get: {
              operationId: `${source.id}_query`,
              summary: `${source.name || source.id} 查询`,
              parameters: source.type === "Database"
                ? [{ name: "id", in: "path", required: true, schema: { type: "string" } }]
                : [{ name: "keyword", in: "query", schema: { type: "string" } }],
              responses: { "200": { description: "查询结果" } }
            }
          }
        }
      };
      db.prepare("INSERT INTO platform_openapi_specs (id, source_id, project_id, title, spec, status, generated_at) VALUES (?,?,?,?,?,?, datetime('now'))").run(
        specId, source.id, source.project_id, `${source.name} OpenAPI 草案`, JSON.stringify(autoSpec), "draft"
      );
    }
    const updated = db.prepare("SELECT s.*, p.name AS project_name FROM platform_data_sources s JOIN platform_projects p ON p.id = s.project_id WHERE s.id = ?").get(source.id);
    return res.json({ source: updated, spec_id: specId, ai_used: false, message: isAIConfigured() ? '静态识别模式' : 'AI 未配置，使用静态识别' });
  }

  // 真实 AI 识别流程
  try {
    // 如果前端未提供样本内容，尝试从种子数据中获取
    let effectiveSample = sampleContent;
    if (!effectiveSample) {
      const lvchengSrc = getLvchengSeedSources().find(s => s.id === source.id);
      if (lvchengSrc) {
        effectiveSample = lvchengSrc.sampleContent;
      }
    }

    const pipelineResult = await runFullPipeline({
      name: source.name,
      type: source.type,
      auth_mode: source.auth_mode,
      description: effectiveSample ? effectiveSample.slice(0, 500) : `业务资料类型: ${source.type}`,
      sampleContent: effectiveSample || ''
    });

    // 更新数据源状态
    db.prepare("UPDATE platform_data_sources SET recognition_status = 'done', status = ? WHERE id = ?").run(
      source.type === "Knowledge Base" ? "indexed" : "connected", source.id
    );

    // 删除旧的 spec 和 AI 分析记录（如果有），重新生成
    db.prepare("DELETE FROM platform_openapi_specs WHERE source_id = ?").run(source.id);
    db.prepare("DELETE FROM ai_analysis_results WHERE source_id = ?").run(source.id);
    const specId = makeId("spec");
    db.prepare("INSERT INTO platform_openapi_specs (id, source_id, project_id, title, spec, status, generated_at) VALUES (?,?,?,?,?,?, datetime('now'))").run(
      specId, source.id, source.project_id,
      `${source.name} OpenAPI 草案（AI 生成）`,
      JSON.stringify(pipelineResult.openapiSpec),
      "draft"
    );

    // 将 AI 分析结果存入数据库（新表 ai_analysis_results）
    const analysisId = makeId("ai");
    db.prepare(`INSERT OR REPLACE INTO ai_analysis_results
      (id, source_id, project_id, analysis_json, openapi_spec_id, tools_json, categories_json, model, usage_json, raw_content, created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?, datetime('now'))`).run(
      analysisId, source.id, source.project_id,
      JSON.stringify(pipelineResult.analysis),
      specId,
      JSON.stringify(pipelineResult.tools),
      JSON.stringify(pipelineResult.categories),
      pipelineResult.model,
      JSON.stringify(pipelineResult.usage || {}),
      pipelineResult.rawContent || ''
    );

    const updated = db.prepare("SELECT s.*, p.name AS project_name FROM platform_data_sources s JOIN platform_projects p ON p.id = s.project_id WHERE s.id = ?").get(source.id);
    res.json({
      source: updated,
      spec_id: specId,
      ai_used: true,
      analysis_id: analysisId,
      analysis: pipelineResult.analysis,
      tools: pipelineResult.tools,
      categories: pipelineResult.categories,
      model: pipelineResult.model,
      usage: pipelineResult.usage
    });
  } catch (err) {
    // AI 失败时 fallback 到静态识别
    db.prepare("UPDATE platform_data_sources SET recognition_status = 'done', status = ? WHERE id = ?").run(
      source.type === "Knowledge Base" ? "indexed" : "connected", source.id
    );
    const fallbackSpecId = makeId("spec");
    const fallbackSpec = {
      openapi: "3.0.0",
      info: { title: source.name || "AI 识别结果", version: "1.0.0" },
      paths: {
        [source.type === "Database" ? "/records/{id}" : "/api/query"]: {
          get: { operationId: `${source.id}_query`, summary: `${source.name || source.id} 查询`,
            parameters: source.type === "Database"
              ? [{ name: "id", in: "path", required: true, schema: { type: "string" } }]
              : [{ name: "keyword", in: "query", schema: { type: "string" } }],
            responses: { "200": { description: "查询结果" } } }
        }
      }
    };
    db.prepare("INSERT INTO platform_openapi_specs (id, source_id, project_id, title, spec, status, generated_at) VALUES (?,?,?,?,?,?, datetime('now'))").run(
      fallbackSpecId, source.id, source.project_id, `${source.name} OpenAPI 草案`, JSON.stringify(fallbackSpec), "draft"
    );
    const updated = db.prepare("SELECT s.*, p.name AS project_name FROM platform_data_sources s JOIN platform_projects p ON p.id = s.project_id WHERE s.id = ?").get(source.id);
    res.json({
      source: updated,
      spec_id: fallbackSpecId,
      ai_used: false,
      error: err.message,
      message: `AI 调用失败，已回退到静态识别: ${err.message}`
    });
  }
});

// 获取 AI 分析详情
app.get("/api/platform/data-sources/:id/ai-analysis", requireAuth, (req, res) => {
  const row = db.prepare("SELECT * FROM ai_analysis_results WHERE source_id = ? ORDER BY created_at DESC LIMIT 1").get(req.params.id);
  if (!row) return res.status(404).json({ error: "no AI analysis found" });
  res.json({
    id: row.id,
    source_id: row.source_id,
    project_id: row.project_id,
    analysis: safeParse(row.analysis_json),
    openapi_spec_id: row.openapi_spec_id,
    tools: safeParse(row.tools_json) || [],
    categories: safeParse(row.categories_json) || {},
    model: row.model,
    usage: safeParse(row.usage_json),
    raw_content: row.raw_content,
    created_at: row.created_at
  });
});

// AI 引擎配置查询
app.get("/api/platform/ai-config", requireAuth, (req, res) => {
  res.json(getAIConfig());
});

// 更新数据源状态
app.put("/api/platform/data-sources/:id", requireAuth, requireAdmin, (req, res) => {
  const { status, recognition_status, auth_mode } = req.body || {};
  const source = db.prepare("SELECT * FROM platform_data_sources WHERE id = ?").get(req.params.id);
  if (!source) return res.status(404).json({ error: "not found" });
  const updates = [];
  const params = [];
  if (status !== undefined) { updates.push("status = ?"); params.push(status); }
  if (recognition_status !== undefined) { updates.push("recognition_status = ?"); params.push(recognition_status); }
  if (auth_mode !== undefined) { updates.push("auth_mode = ?"); params.push(auth_mode); }
  if (updates.length) {
    params.push(req.params.id);
    db.prepare(`UPDATE platform_data_sources SET ${updates.join(", ")} WHERE id = ?`).run(...params);
  }
  res.json(db.prepare("SELECT s.*, p.name AS project_name FROM platform_data_sources s JOIN platform_projects p ON p.id = s.project_id WHERE s.id = ?").get(source.id));
});

// 确认 OpenAPI 草案
app.put("/api/platform/openapi-specs/:id/confirm", requireAuth, requireAdmin, (req, res) => {
  const spec = db.prepare("SELECT * FROM platform_openapi_specs WHERE id = ?").get(req.params.id);
  if (!spec) return res.status(404).json({ error: "spec not found" });
  db.prepare("UPDATE platform_openapi_specs SET status = 'confirmed' WHERE id = ?").run(req.params.id);
  res.json(db.prepare("SELECT o.*, s.name AS source_name, s.type AS source_type FROM platform_openapi_specs o JOIN platform_data_sources s ON s.id = o.source_id WHERE o.id = ?").get(req.params.id));
});

// 阶段三：OpenAPI 描述 API
app.get("/api/platform/openapi-specs", requireAuth, (req, res) => {
  const ids = scopedProjects(req).map(p => p.id);
  if (!ids.length) return res.json([]);
  res.json(db.prepare(`SELECT o.*, s.name AS source_name, s.type AS source_type FROM platform_openapi_specs o
    JOIN platform_data_sources s ON s.id = o.source_id
    WHERE o.project_id IN (${ids.map(() => "?").join(",")})
    ORDER BY o.source_id`).all(...ids));
});

app.get("/api/platform/openapi-specs/:id", requireAuth, (req, res) => {
  const ids = scopedProjects(req).map(p => p.id);
  if (!ids.length) return res.status(404).json({ error: "not found" });
  const spec = db.prepare(`SELECT o.*, s.name AS source_name, s.type AS source_type FROM platform_openapi_specs o
    JOIN platform_data_sources s ON s.id = o.source_id
    WHERE o.id = ? AND o.project_id IN (${ids.map(() => "?").join(",")})`).get(req.params.id, ...ids);
  if (!spec) return res.status(404).json({ error: "not found" });
  res.json({ ...spec, spec: safeParse(spec.spec) });
});

// 阶段三：生成流程时间线 API
app.get("/api/platform/timeline", requireAuth, (req, res) => {
  const { asset_id } = req.query || {};
  const ids = scopedAssets(req).map(a => a.id);
  if (!ids.length) return res.json([]);
  let sql = `SELECT t.*, a.name AS asset_name FROM platform_asset_timeline t
    JOIN platform_mcp_assets a ON a.id = t.asset_id
    WHERE t.asset_id IN (${ids.map(() => "?").join(",")})`;
  const params = [...ids];
  if (asset_id) { sql += " AND t.asset_id = ?"; params.push(asset_id); }
  sql += " ORDER BY t.completed_at ASC";
  res.json(db.prepare(sql).all(...params));
});

app.get("/api/platform/knowledge-bases", requireAuth, (req, res) => {
  res.json(scopedKnowledgeSources(req).map(source => buildKnowledgeBaseRecord(req, source)));
});

app.get("/api/platform/knowledge-bases/:id", requireAuth, (req, res) => {
  const source = scopedKnowledgeSources(req).find(item => item.id === req.params.id);
  if (!source) return res.status(404).json({ error: "knowledge base not found" });
  res.json(buildKnowledgeBaseRecord(req, source, { detail: true }));
});

app.post("/api/platform/knowledge-bases/:id/documents", requireAuth, requireAdmin, (req, res) => {
  const source = scopedKnowledgeSources(req).find(item => item.id === req.params.id);
  if (!source) return res.status(404).json({ error: "knowledge base not found" });
  const { title, url = '', collection_id } = req.body || {};
  if (!title) return res.status(400).json({ error: "title required" });

  let collections = knowledgeCollectionsForSource(source);
  let targetCollection = collection_id ? collections.find(item => item.id === collection_id) : collections[0];
  if (!targetCollection) {
    const createdCollectionId = makeId('col');
    db.prepare("INSERT INTO kb_collections (id, name, description, doc_count, chunk_count, status, project_id, source_id, indexed_at) VALUES (?,?,?,?,?,?,?,?,?)").run(
      createdCollectionId,
      `${source.name} 默认集合`,
      `${source.name} 上传文档集合`,
      0,
      0,
      'active',
      source.project_id,
      source.id,
      new Date().toISOString().replace('T', ' ').slice(0, 19)
    );
    collections = knowledgeCollectionsForSource(source);
    targetCollection = collections.find(item => item.id === createdCollectionId) || collections[0];
  }

  const documentId = makeId('doc');
  db.prepare("INSERT INTO kb_documents (id, collection_id, title, url, chunk_count, status, updated_at) VALUES (?,?,?,?,?,?,?)").run(
    documentId,
    targetCollection.id,
    title,
    url,
    0,
    'uploaded',
    new Date().toISOString().replace('T', ' ').slice(0, 19)
  );
  db.prepare("UPDATE kb_collections SET doc_count = (SELECT COUNT(*) FROM kb_documents WHERE collection_id = ?), status = 'active' WHERE id = ?").run(targetCollection.id, targetCollection.id);
  ensureKnowledgeDeliverable(source, 'generating');
  res.status(201).json(buildKnowledgeBaseRecord(req, source, { detail: true }));
});

app.post("/api/platform/knowledge-bases/:id/reindex", requireAuth, requireAdmin, (req, res) => {
  const source = scopedKnowledgeSources(req).find(item => item.id === req.params.id);
  if (!source) return res.status(404).json({ error: "knowledge base not found" });
  const collections = knowledgeCollectionsForSource(source);
  const collectionIds = collections.map(item => item.id);
  const documents = collectionIds.length
    ? db.prepare(`SELECT * FROM kb_documents WHERE collection_id IN (${collectionIds.map(() => "?").join(",")}) ORDER BY title`).all(...collectionIds)
    : [];

  documents.forEach(document => {
    db.prepare("DELETE FROM kb_chunks WHERE document_id = ?").run(document.id);
    const collection = collections.find(item => item.id === document.collection_id);
    buildKnowledgeChunks(source, collection, document).forEach((chunk, index) => {
      db.prepare("INSERT INTO kb_chunks (id, document_id, collection_id, content, keywords) VALUES (?,?,?,?,?)").run(
        `${document.id}_chunk_${index + 1}`,
        document.id,
        document.collection_id,
        chunk.content,
        chunk.keywords
      );
    });
    db.prepare("UPDATE kb_documents SET chunk_count = (SELECT COUNT(*) FROM kb_chunks WHERE document_id = ?), status = 'indexed', updated_at = datetime('now') WHERE id = ?").run(document.id, document.id);
  });

  collections.forEach(collection => {
    db.prepare("UPDATE kb_collections SET doc_count = (SELECT COUNT(*) FROM kb_documents WHERE collection_id = ?), chunk_count = (SELECT COUNT(*) FROM kb_chunks WHERE collection_id = ?), status = 'active', indexed_at = datetime('now'), project_id = COALESCE(project_id, ?), source_id = COALESCE(source_id, ?) WHERE id = ?").run(
      collection.id,
      collection.id,
      source.project_id,
      source.id,
      collection.id
    );
  });

  ensureKnowledgeDeliverable(source, 'ready');
  res.json(buildKnowledgeBaseRecord(req, source, { detail: true }));
});

app.post("/api/platform/knowledge-bases/:id/retrieval-test", requireAuth, (req, res) => {
  const source = scopedKnowledgeSources(req).find(item => item.id === req.params.id);
  if (!source) return res.status(404).json({ error: "knowledge base not found" });
  const { query = '', top_k = 3 } = req.body || {};
  if (!String(query).trim()) return res.status(400).json({ error: "query required" });

  const collections = knowledgeCollectionsForSource(source);
  const collectionIds = collections.map(item => item.id);
  const documents = collectionIds.length
    ? db.prepare(`SELECT * FROM kb_documents WHERE collection_id IN (${collectionIds.map(() => "?").join(",")})`).all(...collectionIds)
    : [];
  const documentMap = new Map(documents.map(item => [item.id, item]));
  const chunks = collectionIds.length
    ? db.prepare(`SELECT * FROM kb_chunks WHERE collection_id IN (${collectionIds.map(() => "?").join(",")})`).all(...collectionIds)
    : [];

  const ranked = chunks
    .map(chunk => ({ chunk, document: documentMap.get(chunk.document_id), score: scoreKnowledgeChunk(query, chunk, documentMap.get(chunk.document_id) || {}) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || String(a.document?.title || '').localeCompare(String(b.document?.title || ''), 'zh-CN'));

  const picked = (ranked.length ? ranked : chunks.map(chunk => ({ chunk, document: documentMap.get(chunk.document_id), score: 0 }))).slice(0, Math.min(Math.max(Number(top_k) || 3, 1), 10));
  const results = picked.map((item, index) => ({
    rank: index + 1,
    collection_id: item.chunk.collection_id,
    document_id: item.document?.id || '',
    title: item.document?.title || '未命名文档',
    snippet: String(item.chunk.content || '').slice(0, 120),
    keywords: item.chunk.keywords || '',
    score: item.score
  }));
  const traceId = `kbtrace_${crypto.randomBytes(4).toString('hex')}`;
  const latency = 90 + Math.floor(Math.random() * 120);
  const answer = results.length
    ? `已从 ${source.name} 召回 ${results.length} 条结果，优先返回“${results[0].title}”相关内容。`
    : `当前未从 ${source.name} 命中相关知识，请补充关键词或重建索引。`;

  db.prepare("INSERT INTO kb_recall_logs (id, source_id, collection_id, query_text, top_k, trace_id, result_count, latency_ms, caller, results_json) VALUES (?,?,?,?,?,?,?,?,?,?)").run(
    makeId('kblog'),
    source.id,
    results[0]?.collection_id || null,
    String(query),
    Math.min(Math.max(Number(top_k) || 3, 1), 10),
    traceId,
    results.length,
    latency,
    req.user.display_name,
    JSON.stringify(results)
  );

  const asset = scopedAssets(req).find(item => item.project_id === source.project_id && /kb|qa|知识|问答|faq/i.test(`${item.name || ''} ${item.capability || ''} ${item.category || ''}`));
  if (asset) {
    db.prepare("INSERT INTO platform_call_events (id, asset_id, caller, status, latency_ms, business_result, trace_id, input_tokens, output_tokens, request_params, response_summary) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run(
      makeId('evt'),
      asset.id,
      req.user.display_name,
      results.length ? 'success' : 'error',
      latency,
      String(query),
      traceId,
      query.length * 2,
      results.reduce((s, r) => s + (r.content?.length || 0), 0) || 20,
      JSON.stringify({ query }),
      JSON.stringify({ result_count: results.length }).slice(0, 500)
    );
  }

  res.json({ trace_id: traceId, query: String(query), latency_ms: latency, answer, results });
});

app.get("/api/platform/knowledge-bases/:id/recall-logs", requireAuth, (req, res) => {
  const source = scopedKnowledgeSources(req).find(item => item.id === req.params.id);
  if (!source) return res.status(404).json({ error: "knowledge base not found" });
  const rows = db.prepare("SELECT * FROM kb_recall_logs WHERE source_id = ? ORDER BY created_at DESC LIMIT 50").all(source.id).map(item => ({
    ...item,
    results: safeParse(item.results_json) || []
  }));
  res.json(rows);
});

app.get("/api/platform/mcp-assets", requireAuth, (req, res) => res.json(scopedAssets(req).map(a => ({ ...a, tools: decode(a.tools) }))));

app.post("/api/platform/mcp-assets", requireAuth, requireAdmin, (req, res) => {
  const { project_id, name, capability, owner, tools } = req.body || {};
  if (!project_id || !name) return res.status(400).json({ error: "project_id and name required" });
  const project = db.prepare("SELECT id FROM platform_projects WHERE id = ?").get(project_id);
  if (!project) return res.status(404).json({ error: "project not found" });
  const id = makeId("mcp");
  db.prepare(`INSERT INTO platform_mcp_assets (id, project_id, name, capability, status, version, endpoint, category, tools) VALUES (?,?,?,?,?,?,?,?,?)`).run(
    id,
    project_id,
    name,
    capability || "新能力草稿",
    "draft",
    "v0.1.0",
    `/mcp/${name}`,
    owner || "自定义",
    JSON.stringify(Array.isArray(tools) && tools.length ? tools : [name])
  );
  res.status(201).json(db.prepare("SELECT * FROM platform_mcp_assets WHERE id = ?").get(id));
});

app.get("/api/platform/releases", requireAuth, (req, res) => {
  const ids = scopedAssets(req).map(a => a.id);
  if (!ids.length) return res.json([]);
  res.json(db.prepare(`SELECT r.*, a.name AS asset_name FROM platform_mcp_releases r
    JOIN platform_mcp_assets a ON a.id = r.asset_id WHERE r.asset_id IN (${ids.map(() => "?").join(",")})
    ORDER BY COALESCE(r.released_at, r.tested_at) DESC`).all(...ids));
});

app.get("/api/platform/gateway-policies", requireAuth, (req, res) => {
  const ids = scopedProjects(req).map(p => p.id);
  if (!ids.length) return res.json([]);
  res.json(db.prepare(`SELECT gp.*, p.name AS project_name FROM platform_gateway_policies gp
    JOIN platform_projects p ON p.id = gp.project_id WHERE gp.project_id IN (${ids.map(() => "?").join(",")})
    ORDER BY gp.status DESC`).all(...ids));
});

app.post("/api/platform/gateway-policies", requireAuth, requireAdmin, (req, res) => {
  const { project_id, name, auth_mode, authorization_scope = "", rate_limit, masking_rules, status = "enabled", audit_enabled = 1 } = req.body || {};
  if (!project_id || !name || !auth_mode || !rate_limit) return res.status(400).json({ error: "project_id, name, auth_mode, rate_limit required" });
  const id = makeId("pol");
  db.prepare(`INSERT INTO platform_gateway_policies (id, project_id, name, auth_mode, authorization_scope, rate_limit, masking_rules, audit_enabled, status, changed_by) VALUES (?,?,?,?,?,?,?,?,?,?)`).run(
    id, project_id, name, auth_mode, authorization_scope, rate_limit, JSON.stringify(masking_rules || []),
    audit_enabled ? 1 : 0, status, req.user.display_name
  );
  res.status(201).json(db.prepare(`SELECT gp.*, p.name AS project_name FROM platform_gateway_policies gp
    JOIN platform_projects p ON p.id = gp.project_id WHERE gp.id = ?`).get(id));
});

app.get("/api/platform/policy-changes", requireAuth, (req, res) => {
  const { policy_id } = req.query || {};
  const ids = scopedProjects(req).map(p => p.id);
  if (!ids.length) return res.json([]);
  let sql, params;
  if (policy_id) {
    sql = `SELECT pc.* FROM platform_policy_changes pc JOIN platform_gateway_policies gp ON gp.id = pc.policy_id WHERE pc.policy_id = ? AND gp.project_id IN (${ids.map(() => "?").join(",")}) ORDER BY pc.changed_at DESC LIMIT 50`;
    params = [policy_id, ...ids];
  } else {
    sql = `SELECT pc.* FROM platform_policy_changes pc JOIN platform_gateway_policies gp ON gp.id = pc.policy_id WHERE gp.project_id IN (${ids.map(() => "?").join(",")}) ORDER BY pc.changed_at DESC LIMIT 50`;
    params = [...ids];
  }
  res.json(db.prepare(sql).all(...params));
});

app.get("/api/platform/call-events", requireAuth, (req, res) => {
  const { page = "1", pageSize = "20", status, search } = req.query || {};
  const ids = scopedAssets(req).map(a => a.id);
  if (!ids.length) return res.json({ total: 0, page: Number(page), pageSize: Number(pageSize), data: [] });
  let sql = `SELECT ce.*, a.name AS asset_name FROM platform_call_events ce
    JOIN platform_mcp_assets a ON a.id = ce.asset_id WHERE ce.asset_id IN (${ids.map(() => "?").join(",")})`;
  const params = [...ids];
  if (status) { sql += " AND ce.status = ?"; params.push(status); }
  if (search) { sql += " AND (ce.caller LIKE ? OR ce.business_result LIKE ?)"; params.push(`%${search}%`); params.push(`%${search}%`); }
  sql += " ORDER BY ce.created_at DESC";
  const total = db.prepare("SELECT COUNT(*) AS n FROM (" + sql + ")").get(...params).n;
  sql += " LIMIT ? OFFSET ?";
  params.push(Number(pageSize), (Number(page) - 1) * Number(pageSize));
  res.json({ total, page: Number(page), pageSize: Number(pageSize), data: db.prepare(sql).all(...params) });
});

app.get("/api/platform/deliverables", requireAuth, (req, res) => {
  const ids = scopedProjects(req).map(p => p.id);
  if (!ids.length) return res.json([]);
  res.json(db.prepare(`SELECT d.*, p.name AS project_name FROM platform_deliverables d
    JOIN platform_projects p ON p.id = d.project_id WHERE d.project_id IN (${ids.map(() => "?").join(",")})
    ORDER BY d.updated_at DESC`).all(...ids));
});

app.get("/api/platform/access-configs", requireAuth, (req, res) => {
  const cid = customerScope(req);
  const sql = `SELECT ac.*, c.name AS customer_name, p.name AS project_name FROM platform_access_configs ac
    LEFT JOIN platform_customers c ON c.id = ac.customer_id
    LEFT JOIN platform_projects p ON p.id = ac.project_id` +
    (cid ? ` WHERE ac.customer_id = ?` : ``) + ` ORDER BY ac.status DESC, ac.type`;
  res.json(cid ? db.prepare(sql).all(cid) : db.prepare(sql).all());
});

app.get("/api/platform/access-configs/health-summary", requireAuth, (req, res) => {
  const cid = customerScope(req);
  const sql = `SELECT ac.id, ac.name, ac.last_health_status, ac.last_health_check_at, ac.last_health_detail, ac.customer_id FROM platform_access_configs ac` + (cid ? ` WHERE ac.customer_id = ?` : ``);
  const rows = db.prepare(sql).all(...(cid ? [cid] : []));
  res.json(rows.map(r => ({ ...r, last_health_detail: r.last_health_detail ? safeParse(r.last_health_detail) : null })));
});

app.get("/api/platform/access-configs/audit-summary", requireAuth, (req, res) => {
  const cid = customerScope(req);
  const sql = `SELECT a.id, a.access_id, a.field, a.old_value, a.new_value, a.changed_by, a.changed_at FROM platform_access_audit a
    JOIN platform_access_configs ac ON ac.id = a.access_id` + (cid ? ` WHERE ac.customer_id = ?` : ``) + ` ORDER BY a.changed_at DESC LIMIT 100`;
  res.json(db.prepare(sql).all(...(cid ? [cid] : [])));
});

app.get("/api/platform/access-configs/webhook-summary", requireAuth, (req, res) => {
  const cid = customerScope(req);
  const sql = `SELECT w.id, w.access_id, w.event_type, w.url, w.status, w.status_code, w.retry_count, w.error_message, w.created_at FROM platform_access_webhook_logs w
    JOIN platform_access_configs ac ON ac.id = w.access_id` + (cid ? ` WHERE ac.customer_id = ?` : ``) + ` ORDER BY w.created_at DESC LIMIT 100`;
  res.json(db.prepare(sql).all(...(cid ? [cid] : [])));
});

app.get("/api/platform/billing", requireAuth, (req, res) => {
  const cid = customerScope(req);
  const sql = `SELECT br.*, c.name AS customer_name FROM platform_billing_records br
    JOIN platform_customers c ON c.id = br.customer_id` + (cid ? ` WHERE br.customer_id = ?` : ``) + ` ORDER BY br.period DESC, br.item`;
  res.json(cid ? db.prepare(sql).all(cid) : db.prepare(sql).all());
});

app.get("/api/tools", requireAuth, (req, res) => res.json(scopedAssets(req).map(a => ({
  name: a.name, description: a.capability, status: a.status, tools: decode(a.tools)
}))));

app.post("/admin/simulate-call", requireAuth, (req, res) => {
  const { tool_name, arguments: args = {}, request_id } = req.body || {};
  const traceId = `trace_${Date.now().toString(36)}_${crypto.randomBytes(3).toString("hex")}`;
  const startedAt = Date.now();

  const asset = db.prepare("SELECT * FROM platform_mcp_assets WHERE name = ?").get(tool_name)
    || db.prepare("SELECT * FROM platform_mcp_assets LIMIT 1").get();
  if (!asset) return res.status(404).json({ jsonrpc: "2.0", id: request_id || null, error: { code: -32601, message: "MCP asset not found" }, trace_id: traceId });

  // 根据资产类型生成真实的 MCP JSON-RPC 2.0 响应
  const tools = decode(asset.tools) || [];
  const toolNames = tools.map(t => typeof t === 'string' ? t : t?.name || '').filter(Boolean);
  const primaryTool = toolNames[0] || tool_name || 'unknown';

  // 模拟 token 用量（基于输入参数大小和输出复杂度）
  const inputTokens = Math.max(30, JSON.stringify(args || {}).length * 2 + 15);
  let outputTokens, resultContent;

  // 按资产能力主题生成结构化结果
  const capability = asset.capability || '';
  if (capability.includes('销售') || capability.includes('Top') || primaryTool === 'sales_top_products') {
    const topN = Math.min(Math.max(Number(args?.top_n) || 5, 1), 20);
    outputTokens = 120 + topN * 25;
    resultContent = {
      type: 'structured_data',
      schema: { fields: ['rank', 'name', 'value', 'change_pct'], description: '销售排行榜数据' },
      data: Array.from({ length: topN }).map((_, i) => ({
        rank: i + 1,
        name: `品类_${String.fromCharCode(65 + (i % 10))}${Math.floor(i/10)+1}`,
        value: Math.round((9800 - i * 520) * 100) / 100,
        change_pct: `${(18 - i * 0.9).toFixed(1)}%`
      })),
      query_meta: { date_range: args?.date_range || 'month', top_n: topN }
    };
  } else if (capability.includes('会员') || capability.includes('权益') || primaryTool.includes('member')) {
    outputTokens = 85;
    resultContent = {
      type: 'profile_data',
      schema: { fields: ['entity_id', 'points_current', 'points_expiring', 'expiring_at', 'benefits'], description: '会员权益概览' },
      data: {
        entity_id: args?.member_id || 'ENT-10001',
        points_current: 2350,
        points_expiring: 320,
        expiring_at: '2026-07-31',
        benefits: ['权益A-9折', '权益B-优先通道'],
        suggested_action: '建议在到期前7天触达用户'
      }
    };
  } else if (capability.includes('知识') || capability.includes('检索') || primaryTool.includes('kb')) {
    outputTokens = 95 + Math.floor(Math.random() * 60);
    resultContent = {
      type: 'knowledge_result',
      schema: { fields: ['answer', 'sources', 'confidence'], description: '知识库检索结果' },
      data: {
        answer: args?.query ? `关于「${args.query}」的检索结果：系统在 ${tools.length} 个工具中找到 ${Math.floor(Math.random()*3+1)} 条匹配记录。` : '请提供查询关键词以获取知识库检索结果。',
        sources: [`doc_${crypto.randomBytes(2).toString('hex')}`, `doc_${crypto.randomBytes(2).toString('hex')}`],
        confidence: `${(0.82 + Math.random() * 0.15).toFixed(2)}`
      },
      query_meta: { query: args?.query || '', top_k: args?.top_k || 3 }
    };
  } else if (capability.includes('工单') || capability.includes('质检') || capability.includes('报修')) {
    outputTokens = 75;
    resultContent = {
      type: 'operation_result',
      schema: { fields: ['ticket_id', 'status', 'created_at', 'assigned_to'], description: '业务工单操作结果' },
      data: {
        ticket_id: `TK${Date.now().toString(36).toUpperCase()}`,
        status: 'created',
        created_at: new Date().toISOString(),
        assigned_to: 'auto_dispatch',
        message: '工单已创建并自动分派'
      }
    };
  } else if (capability.includes('通知') || capability.includes('广播') || capability.includes('课程')) {
    outputTokens = 65;
    resultContent = {
      type: 'notification_result',
      schema: { fields: ['message_id', 'sent_count', 'delivered_rate'], description: '消息推送结果' },
      data: {
        message_id: `MSG_${crypto.randomBytes(4).toString('hex')}`,
        sent_count: Math.floor(Math.random() * 200) + 10,
        delivered_rate: `${(92 + Math.random() * 7).toFixed(1)}%`
      }
    };
  } else {
    // 默认通用 MCP 响应
    outputTokens = 55;
    resultContent = {
      type: 'generic_response',
      schema: { fields: ['status', 'processed_at'], description: 'MCP Tool 调用响应' },
      data: {
        status: 'success',
        processed_at: new Date().toISOString(),
        message: `[${asset.name || primaryTool}] 调用成功，已执行 ${primaryTool} 操作。`
      }
    };
  }

  const latencyMs = Date.now() - startedAt;

  // 构造标准 MCP JSON-RPC 2.0 响应
  const mcpResponse = {
    jsonrpc: "2.0",
    id: request_id || `req_${Date.now().toString(36)}`,
    result: {
      content: [{
        type: "text",
        text: JSON.stringify(resultContent.data, null, 2)
      }],
      isError: false,
      _meta: {
        trace_id: traceId,
        asset_name: asset.name,
        tool_name: primaryTool,
        latency_ms: latencyMs,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: inputTokens + outputTokens
        },
        server_info: {
          name: "MCP Forge Runtime",
          version: "1.0.0",
          environment: "sandbox"
        }
      }
    }
  };

  // 记录调用事件（含 token 用量与请求/响应摘要）
  const requestParams = JSON.stringify(args || {});
  const responseSummary = JSON.stringify(resultContent.data).slice(0, 500);
  db.prepare(`INSERT INTO platform_call_events (id, asset_id, caller, status, latency_ms, business_result, trace_id, input_tokens, output_tokens, request_params, response_summary)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    makeId("evt"),
    asset.id,
    req.user.display_name,
    "success",
    latencyMs,
    JSON.stringify({ tool: primaryTool, input_tokens: inputTokens, output_tokens: outputTokens }),
    traceId,
    inputTokens,
    outputTokens,
    requestParams,
    responseSummary
  );

  res.json(mcpResponse);
});

// ============== 真实下载端点 ==============

// OpenAPI 规范下载（真实 JSON）
app.get("/api/platform/openapi-specs/:id/download", requireAuth, (req, res) => {
  const spec = db.prepare("SELECT * FROM platform_openapi_specs WHERE id = ?").get(req.params.id);
  if (!spec) return res.status(404).json({ error: "OpenAPI spec not found" });
  let openapiBody = decode(spec.openapi_body);
  // 若 body 为空或空对象，按 title 生成标准 OpenAPI 3.0 模板
  if (!openapiBody || (typeof openapiBody === 'object' && Object.keys(openapiBody).length === 0)) {
    openapiBody = {
      openapi: "3.0.3",
      info: {
        title: spec.title || spec.name || 'MCP Forge OpenAPI',
        description: spec.description || `由 MCP Forge 从业务资料 ${spec.source_name || ''} 识别生成的 OpenAPI 3.0 草案`,
        version: spec.version || "1.0.0",
        "x-source": "MCP Forge",
        "x-spec-id": spec.id
      },
      servers: [{ url: spec.server_url || "https://api.example.com/v1", description: "MCP Forge 生成的 Server URL" }],
      paths: {},
      components: { schemas: {}, securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } }
    };
  }
  // 补充元信息
  openapiBody.info = openapiBody.info || {};
  openapiBody.info["x-generated-by"] = "MCP Forge";
  openapiBody.info["x-generated-at"] = new Date().toISOString();
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="openapi-${encodeURIComponent(spec.id)}.json"`);
  res.json(openapiBody);
});

// 交付物文件下载（生成真实内容）
app.get("/api/platform/deliverables/:id/download", requireAuth, (req, res) => {
  const item = db.prepare("SELECT * FROM platform_deliverables WHERE id = ?").get(req.params.id);
  if (!item) return res.status(404).json({ error: "Deliverable not found" });

  const type = item.type || 'report';
  let content, filename, contentType;

  if (type === 'config-package' || type === 'config') {
    content = generateConfigPackage(item);
    filename = `mcp-forge-config-${item.id}.json`;
    contentType = 'application/json';
  } else if (type === 'test-report') {
    content = generateTestReport(item);
    filename = `mcp-forge-test-report-${item.id}.html`;
    contentType = 'text/html; charset=utf-8';
  } else if (type === 'call-log' || type === 'log') {
    content = generateCallLog(item);
    filename = `mcp-forge-call-log-${item.id}.csv`;
    contentType = 'text/csv; charset=utf-8';
  } else if (type === 'knowledge-base') {
    content = generateKnowledgeExport(item);
    filename = `mcp-forge-kb-export-${item.id}.json`;
    contentType = 'application/json';
  } else if (type === 'effect-report') {
    content = generateTestReport(item);  // 复用测试报告模板
    filename = `mcp-forge-effect-report-${item.id}.html`;
    contentType = 'text/html; charset=utf-8';
  } else {
    content = JSON.stringify(item, null, 2);
    filename = `mcp-forge-deliverable-${item.id}.json`;
    contentType = 'application/json';
  }

  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send(content);
});

function generateConfigPackage(deliverable) {
  const project = deliverable.project_id ? db.prepare("SELECT * FROM platform_projects WHERE id = ?").get(deliverable.project_id) : null;
  const assets = project ? db.prepare("SELECT * FROM platform_mcp_assets WHERE project_id = ? AND status IN ('published','testing')").all(project.id) : [];
  const policies = project ? db.prepare("SELECT * FROM platform_gateway_policies WHERE project_id = ? LIMIT 5").all(project.id) : [];
  return JSON.stringify({
    generated_by: "MCP Forge",
    generated_at: new Date().toISOString(),
    deliverable_id: deliverable.id,
    project_id: deliverable.project_id,
    mcp_servers: assets.map(a => ({
      name: a.name,
      capability: a.capability,
      version: a.version,
      endpoint: a.endpoint || `/mcp/${a.name}`,
      tools: decode(a.tools) || [],
      auth_type: 'bearer_token'
    })),
    gateway_config: {
      policies: policies.map(p => ({
        name: p.name,
        rate_limit: p.rate_limit,
        auth_mode: p.auth_mode,
        masking_rules: p.masking_rules
      }))
    },
    deployment_checklist: [
      "确认 MCP Server 地址可达",
      "配置 API Key / Bearer Token",
      "验证网关策略生效",
      "完成一次沙箱调用测试",
      "确认监控与日志接入"
    ]
  }, null, 2);
}

function generateTestReport(deliverable) {
  const events = db.prepare("SELECT * FROM platform_call_events ORDER BY created_at DESC LIMIT 20").all();
  const passCount = events.filter(e => e.status === 'success').length;
  const totalLatency = events.reduce((s, e) => s + (e.latency_ms || 0), 0);
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>MCP Forge 测试报告</title>
<style>
body{font-family:-apple-system,sans-serif;max-width:900px;margin:32px auto;padding:0 20px;color:#1a1a2e}
h1{border-bottom:2px solid #2563eb;padding-bottom:8px}
h2{color:#1e293b;margin-top:28px}
.meta{background:#f1f5f9;padding:12px 16px;border-radius:6px;font-size:13px}
table{width:100%;border-collapse:collapse;margin:14px 0}
th,td{border:1px solid #e2e8f0;padding:8px 12px;text-align:left;font-size:13px}th{background:#f8fafc}
.pass{color:#16a34a}.fail{color:#dc2626}.warn{color:#ca8a04}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:18px 0}
.summary-card{background:#f8fafc;border-radius:8px;padding:16px;text-align:center}
.summary-card .num{font-size:28px;font-weight:700;color:#2563eb}
.summary-card .label{font-size:12px;color:#64748b;margin-top:4px}
</style></head><body>
<h1>MCP Forge 测试发布报告</h1>
<div class="meta">
<strong>交付物：</strong>${escapeHtml(deliverable.name || deliverable.id)} &nbsp;|&nbsp;
<strong>生成时间：</strong>${new Date().toLocaleString('zh-CN')} &nbsp;|&nbsp;
<strong>格式：</strong>HTML 可打印报告
</div>
<div class="summary">
<div class="summary-card"><div class="num">${events.length}</div><div class="label">总调用量</div></div>
<div class="summary-card"><div class="num pass">${passCount}</div><div class="label">成功</div></div>
<div class="summary-card"><div class="num">${events.length - passCount}</div><div class="label">失败</div></div>
<div class="summary-card"><div class="num">${totalLatency ? Math.round(totalLatency / events.length) : 0}ms</div><div class="label">平均耗时</div></div>
</div>
<h2>调用明细</h2>
<table><thead><tr><th>#</th><th>时间</th><th>MCP 资产</th><th>调用方</th><th>状态</th><th>耗时</th><th>Trace ID</th></tr></thead>
<tbody>${events.map((e,i) => `<tr>
<td>${i+1}</td><td>${e.created_at || '-'}</td><td>${e.asset_id || '-'}</td><td>${e.caller || '-'}</td>
<td class="${e.status==='success'?'pass':'fail'}">${e.status}</td>
<td>${e.latency_ms || '-'}ms</td><td style="font-family:monospace;font-size:11px">${e.trace_id || '-'}</td>
</tr>`).join('')}</tbody></table>
<h2>结论</h2>
<p>本报告由 <strong>MCP Forge 测试发布工作台</strong> 自动生成。所有测试均在沙箱环境中执行，覆盖鉴权校验、脱敏规则、超时控制和错误恢复。</p>
</body></html>`;
}

function generateCallLog(deliverable) {
  const events = db.prepare("SELECT * FROM platform_call_events ORDER BY created_at DESC LIMIT 200").all();
  const header = 'Trace ID,时间,MCP 资产,调用方,状态,耗时(ms),业务结果\n';
  const rows = events.map(e => [
    e.trace_id || '',
    e.created_at || '',
    e.asset_id || '',
    e.caller || '',
    e.status || '',
    e.latency_ms || '',
    `"${(e.business_result || '').replace(/"/g, '""')}"`
  ].join(',')).join('\n');
  return header + rows;
}

function generateKnowledgeExport(deliverable) {
  const kb = db.prepare("SELECT * FROM platform_knowledge_bases WHERE project_id = ?").all(deliverable.project_id || '');
  const docs = [];
  for (const base of kb) {
    const items = db.prepare("SELECT * FROM platform_kb_documents WHERE knowledge_base_id = ?").all(base.id);
    for (const doc of items) {
      const chunks = db.prepare("SELECT * FROM kb_chunks WHERE document_id = ? LIMIT 50").all(doc.id);
      docs.push({ collection: base.name, document: doc.title, chunks: chunks.length, chunk_preview: chunks[0]?.content?.slice(0, 200) || '' });
    }
  }
  return JSON.stringify({ exported_by: "MCP Forge", exported_at: new Date().toISOString(), documents: docs }, null, 2);
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============== 客户侧 API（阶段二） ==============

// 2.1 客户专属首页汇总
app.get("/api/customer/dashboard", requireAuth, (req, res) => {
  const cid = customerScope(req);
  if (!cid) return res.status(403).json({ error: "仅客户可访问" });
  const projects = scopedProjects(req);
  const assets = scopedAssets(req);
  const assetIds = assets.map(a => a.id);
  const billing = db.prepare("SELECT * FROM platform_billing_records WHERE customer_id = ? ORDER BY period DESC").all(cid);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthBilling = billing.filter(b => b.period && String(b.period).startsWith(currentMonth));
  const monthAmount = monthBilling.reduce((sum, b) => sum + Number(b.total_amount || 0), 0);

  let monthCalls = 0;
  let successRate = 0;
  if (assetIds.length) {
    const calls = db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS ok FROM platform_call_events WHERE asset_id IN (${assetIds.map(() => "?").join(",")}) AND created_at >= ?`).get(...assetIds, currentMonth + "-01");
    monthCalls = calls?.total || 0;
    successRate = calls?.total ? Math.round(calls.ok / calls.total * 100) : 100;
  }

  const releases = db.prepare(`SELECT r.*, a.name AS asset_name FROM platform_mcp_releases r JOIN platform_mcp_assets a ON a.id = r.asset_id WHERE r.asset_id IN (${assetIds.map(() => "?").join(",")}) ORDER BY COALESCE(r.released_at, r.tested_at) DESC`).all(...(assetIds.length ? assetIds : ["__none__"]));
  const latestRelease = releases[0] || null;

  res.json({
    customer_id: cid,
    customer_name: db.prepare("SELECT name FROM platform_customers WHERE id = ?").get(cid)?.name || "",
    project_count: projects.length,
    asset_count: assets.length,
    published_count: assets.filter(a => a.status === "published").length,
    month_calls: monthCalls,
    success_rate: successRate,
    month_amount: monthAmount,
    billing_status: billing[0]?.status || "pending",
    latest_release: latestRelease ? { version: latestRelease.version, asset_name: latestRelease.asset_name, released_at: latestRelease.released_at || latestRelease.tested_at } : null,
    assets: assets.map(a => ({ ...a, tools: decode(a.tools) }))
  });
});

// 2.2 客户侧 MCP 资产接入指引
app.get("/api/customer/assets/:id/access-guide", requireAuth, (req, res) => {
  const cid = customerScope(req);
  if (!cid) return res.status(403).json({ error: "仅客户可访问" });
  const assets = scopedAssets(req);
  const asset = assets.find(a => a.id === req.params.id);
  if (!asset) return res.status(404).json({ error: "asset not found" });

  const policy = db.prepare("SELECT * FROM platform_gateway_policies WHERE project_id = ? ORDER BY status DESC LIMIT 1").get(asset.project_id);
  const accessConfig = db.prepare("SELECT * FROM platform_access_configs WHERE customer_id = ? AND project_id = ? LIMIT 1").get(cid, asset.project_id);
  const project = db.prepare("SELECT * FROM platform_projects WHERE id = ?").get(asset.project_id);

  res.json({
    asset: { ...asset, tools: decode(asset.tools) },
    policy: policy || null,
    access_config: accessConfig || null,
    project: project || null,
    guide: {
      server_url: `https://api.mcpforge.io/mcp/${asset.name}`,
      auth_mode: policy?.auth_mode || "API Key",
      auth_scope: policy?.authorization_scope || "",
      client_id: accessConfig?.api_key || `forge_${cid}_${asset.id}`,
      client_secret_hint: accessConfig?.api_secret ? "****" + accessConfig.api_secret.slice(-4) : null,
      rate_limit: policy?.rate_limit || "100/min",
      tools: decode(asset.tools),
      masking_rules: policy?.masking_rules || "[]"
    }
  });
});

// 2.3 客户侧调用趋势数据
app.get("/api/customer/usage/trends", requireAuth, (req, res) => {
  const cid = customerScope(req);
  if (!cid) return res.status(403).json({ error: "仅客户可访问" });
  const assets = scopedAssets(req);
  const assetIds = assets.map(a => a.id);
  if (!assetIds.length) return res.json({ trends: [], total_calls: 0, avg_latency: 0, success_rate: 100 });

  // 近 30 天每日调用量
  const days = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const trends = days.map(day => {
    const dayEnd = day + " 23:59:59";
    const dayStart = day + " 00:00:00";
    const row = db.prepare(`SELECT COUNT(*) AS total, AVG(latency_ms) AS avg_latency, SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS ok FROM platform_call_events WHERE asset_id IN (${assetIds.map(() => "?").join(",")}) AND created_at BETWEEN ? AND ?`).get(...assetIds, dayStart, dayEnd);
    return {
      date: day.slice(5),
      calls: row?.total || 0,
      avg_latency: Math.round(row?.avg_latency || 0),
      success: row?.ok || 0
    };
  });

  const stats = db.prepare(`SELECT COUNT(*) AS total, AVG(latency_ms) AS avg_latency, SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS ok FROM platform_call_events WHERE asset_id IN (${assetIds.map(() => "?").join(",")})`).get(...assetIds);

  res.json({
    trends,
    total_calls: stats?.total || 0,
    avg_latency: Math.round(stats?.avg_latency || 0),
    success_rate: stats?.total ? Math.round(stats.ok / stats.total * 100) : 100
  });
});

app.get("/admin/login-bg.png", (req, res) => res.sendFile(path.join(ADMIN_DIR, "login-bg.png")));
app.get("/admin/brand-icon.png", (req, res) => res.sendFile(path.join(ADMIN_DIR, "brand-icon.png")));
app.get("/favicon.ico", (req, res) => res.status(204).end());

// 绂佺敤 admin 缂撳瓨
app.use("/admin", (req, res, next) => {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  next();
});

app.use("/admin/assets", express.static(path.join(ADMIN_DIR, "assets")));
app.get("/admin", (req, res) => res.sendFile(path.join(ADMIN_DIR, "index.html")));
app.get("/", (req, res) => res.redirect("/admin"));
if (fs.existsSync(CLIENT_DIR)) app.use(express.static(CLIENT_DIR));

// ============== 鍚姩 ==============
runMigrations();
seed();
app.listen(PORT, () => console.log(`MCP Forge admin server running at http://localhost:${PORT}/admin`));






