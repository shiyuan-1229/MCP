import fs from 'fs';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = 3100;
const DB_PATH = path.join(__dirname, '..', 'mcp_forge.db');
const db = new Database(DB_PATH);
const ADMIN_DIR = path.join(__dirname, '..', 'admin');
const CLIENT_DIR = path.join(__dirname, '..', 'client');

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
app.use(express.json({ limit: '2mb' }));

// 复制工具函数
function makeId(prefix) { return `${prefix}_${crypto.randomBytes(5).toString('hex')}`; }
function hashPassword(password, salt = crypto.randomBytes(12).toString('hex')) {
  const hash = crypto.pbkdf2Sync(String(password), salt, 120000, 32, 'sha256').toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt] = stored.split(':');
  return hashPassword(password, salt) === stored;
}
function encode(value) { return JSON.stringify(value || []); }
function decode(value) { try { return value ? JSON.parse(value) : []; } catch { return []; } }
function count(table) { return db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get().c; }
function currentSession(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return null;
  return db.prepare(`SELECT s.token, u.id, u.username, u.role, u.display_name, u.customer_id FROM platform_sessions s JOIN platform_users u ON u.id = s.user_id WHERE s.token = ? AND datetime(s.expires_at) > datetime('now')`).get(token);
}
function requireAuth(req, res, next) { const session = currentSession(req); if (!session) return res.status(401).json({ error: 'session expired' }); req.user = session; next(); }
function requireAdmin(req, res, next) { if (req.user?.role !== 'admin') return res.status(403).json({ error: 'admin role required' }); next(); }
function customerScope(req) { return req.user.role === 'admin' ? null : req.user.customer_id; }
function scopedProjects(req) { const cid = customerScope(req); const sql = 'SELECT p.*, c.name AS customer_name FROM platform_projects p JOIN platform_customers c ON c.id = p.customer_id' + (cid ? ' WHERE p.customer_id = ?' : '') + ' ORDER BY p.due_date'; return cid ? db.prepare(sql).all(cid) : db.prepare(sql).all(); }
function scopedAssets(req) { const cid = customerScope(req); const sql = 'SELECT a.*, p.name AS project_name, c.name AS customer_name FROM platform_mcp_assets a JOIN platform_projects p ON p.id = a.project_id JOIN platform_customers c ON c.id = p.customer_id' + (cid ? ' WHERE p.customer_id = ?' : '') + ' ORDER BY a.status = 'published' DESC, a.created_at DESC'; return cid ? db.prepare(sql).all(cid) : db.prepare(sql).all(); }
function callStats(ids) { if (!ids.length) return { total: 0, successRate: 0, avgLatency: 0, errorCount: 0 }; const ph = ids.map(() => '?').join(','); const row = db.prepare(`SELECT COUNT(*) AS total, SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) AS success, AVG(latency_ms) AS avg_latency, SUM(CASE WHEN status!='success' THEN 1 ELSE 0 END) AS errors FROM platform_call_events WHERE asset_id IN (${ph})`).get(...ids); return { total: row.total || 0, successRate: row.total ? Math.round((row.success || 0) * 1000 / row.total) / 10 : 0, avgLatency: Math.round(row.avg_latency || 0), errorCount: row.errors || 0 }; }

// 加载并执行 server.js 除了最后 app.listen 部分
const code = fs.readFileSync('server.js', 'utf-8').split('app.listen')[0];
eval(code);

console.log('=== ALL REGISTERED ROUTES IN EXPRESS ===');
app._router.stack.forEach(r => {
  if (r.route) {
    const methods = Object.keys(r.route.methods).join(',').toUpperCase();
    console.log(`${methods} -> ${r.route.path}`);
  }
});
console.log('=== END OF ROUTES ===');
