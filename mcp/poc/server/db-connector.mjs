/**
 * MySQL 直连：读取可分析的数据库对象和少量样例数据。
 * 不把整库业务数据复制到平台；AI 使用表结构、对象定义和样例行进行识别。
 */
import mysql from 'mysql2/promise';

export function describeConnectionError(err, config = {}) {
  const host = String(config.host || 'localhost');
  const port = Number(config.port) || 3306;
  const endpoint = `${host}:${port}`;
  const code = err?.code || err?.errno || 'UNKNOWN';
  const common = { ok: false, code, endpoint };

  if (code === 'EACCES') return {
    ...common, category: 'network_policy',
    message: `无法建立到 ${endpoint} 的网络连接（EACCES）`,
    guidance: ['确认当前电脑已接入目标内网或 VPN', '请网络管理员放行本机到该地址的 TCP 端口', '确认数据库服务允许远程监听']
  };
  if (code === 'ECONNREFUSED') return {
    ...common, category: 'service_unavailable', message: `${endpoint} 拒绝连接`,
    guidance: ['确认 MySQL 服务已启动', '确认端口填写正确', '确认服务器防火墙允许该端口']
  };
  if (['ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) return {
    ...common, category: 'network_unreachable', message: `无法访问 ${endpoint}（${code}）`,
    guidance: ['确认内网/VPN 路由可达', '检查防火墙、安全组和网络 ACL', '确认目标地址和端口正确']
  };
  if (code === 'ENOTFOUND') return {
    ...common, category: 'host_resolution', message: `无法解析数据库主机 ${host}`,
    guidance: ['检查主机名拼写', '使用可解析的内网域名或 IP 地址', '确认 DNS/VPN 已连接']
  };
  if (['ER_ACCESS_DENIED_ERROR', 'ER_DBACCESS_DENIED_ERROR'].includes(code)) return {
    ...common, category: 'authorization', message: '数据库拒绝了当前账号的访问',
    guidance: ['核对用户名和密码', '请管理员授予该客户端来源的登录权限', '至少授予目标 Schema 的 SELECT 和元数据读取权限']
  };
  if (code === 'ER_BAD_DB_ERROR') return {
    ...common, category: 'database_not_found', message: `Schema 不存在或当前账号无权访问：${config.database || '-'}`,
    guidance: ['核对 Schema 名称（不是表名）', '确认账号拥有该 Schema 的访问权限']
  };
  return {
    ...common, category: 'unknown', message: `数据库连接失败：${err?.message || '未知错误'}`,
    guidance: ['检查主机、端口、账号、密码和 Schema 名称', '如为内网数据库，请确认 VPN、路由与防火墙策略']
  };
}

function normalizeSchemas(value) {
  return [...new Set(String(value || '').split(/[,，;；\n]/).map(item => item.trim()).filter(Boolean))];
}

function schemaFilter(schemas, column = 'TABLE_SCHEMA') {
  return { clause: `${column} IN (${schemas.map(() => '?').join(', ')})`, values: schemas };
}

function quoteIdentifier(value) {
  return `\`${String(value).replace(/`/g, '``')}\``;
}

function assertIdentifier(value, label) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(String(value || ''))) {
    throw new Error(`invalid ${label}`);
  }
  return String(value);
}

/**
 * Executes a pre-approved, read-only table binding.  The binding is data, not
 * SQL: callers may choose only declared columns and declared equality/range
 * filters.  This prevents an LLM or a WorkBuddy request from submitting free
 * SQL to an imported database.
 */
export async function executeReadOnlyBinding(config, binding, args = {}) {
  const schema = assertIdentifier(binding?.schema, 'schema');
  const table = assertIdentifier(binding?.table, 'table');
  const columns = Array.isArray(binding?.columns) ? binding.columns.map(column => assertIdentifier(column, 'column')) : [];
  if (!columns.length || columns.length > 30) throw new Error('binding must declare 1-30 result columns');

  const filters = binding?.filters && typeof binding.filters === 'object' ? binding.filters : {};
  const clauses = [];
  const values = [];
  for (const [argumentName, rule] of Object.entries(filters)) {
    const value = args?.[argumentName];
    if (value === undefined || value === null || value === '') continue;
    const column = assertIdentifier(typeof rule === 'string' ? rule : rule?.column, 'filter column');
    const operator = String(typeof rule === 'object' ? rule?.operator || '=' : '=').toUpperCase();
    if (!['=', '>=', '<='].includes(operator)) throw new Error(`unsupported filter operator for ${argumentName}`);
    clauses.push(`${quoteIdentifier(column)} ${operator} ?`);
    values.push(typeof value === 'string' ? value.slice(0, 256) : value);
  }

  const defaultLimit = Number(binding?.default_limit || 20);
  const maxLimit = Math.min(Math.max(Number(binding?.max_limit || 50), 1), 100);
  const limit = Math.min(Math.max(Number(args?.limit || defaultLimit), 1), maxLimit);
  const sql = `SELECT ${columns.map(quoteIdentifier).join(', ')} FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)}`
    + (clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '')
    + ` LIMIT ${limit}`;
  let conn;
  try {
    conn = await mysql.createConnection({
      host: config.host || 'localhost', port: Number(config.port) || 3306,
      user: config.user, password: config.password, charset: 'utf8mb4', connectTimeout: 10000
    });
    const [rows] = await conn.execute(sql, values);
    return { rows, row_count: rows.length, limit, schema, table, columns };
  } finally {
    if (conn) await conn.end();
  }
}

function buildTableDDL(table, columns) {
  const ddl = [`CREATE TABLE ${quoteIdentifier(table.schema_name)}.${quoteIdentifier(table.table_name)} (`];
  columns.forEach((column, index) => {
    const nullable = column.IS_NULLABLE === 'NO' ? ' NOT NULL' : '';
    const defaultValue = column.COLUMN_DEFAULT === null || column.COLUMN_DEFAULT === undefined ? '' : ` DEFAULT ${column.COLUMN_DEFAULT}`;
    const extra = column.EXTRA ? ` ${column.EXTRA}` : '';
    const comment = column.COLUMN_COMMENT ? ` COMMENT ${JSON.stringify(column.COLUMN_COMMENT)}` : '';
    ddl.push(`  ${quoteIdentifier(column.COLUMN_NAME)} ${column.COLUMN_TYPE}${nullable}${defaultValue}${extra}${comment}${index < columns.length - 1 ? ',' : ''}`);
  });
  ddl.push(`) COMMENT=${JSON.stringify(table.table_comment || '')};`);
  return ddl.join('\n');
}

/** 测试服务连接，并在指定 Schema 时验证元数据可见性。 */
export async function testConnection(config) {
  const schemas = normalizeSchemas(config.database);
  let conn;
  try {
    conn = await mysql.createConnection({
      host: config.host || 'localhost', port: Number(config.port) || 3306,
      user: config.user, password: config.password, charset: 'utf8mb4', connectTimeout: 8000
    });
    await conn.execute('SELECT 1 AS ok');
    if (schemas.length && !schemas.includes('*')) {
      const filter = schemaFilter(schemas, 'SCHEMA_NAME');
      const [rows] = await conn.execute(`SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE ${filter.clause}`, filter.values);
      const available = new Set(rows.map(item => item.SCHEMA_NAME));
      const missing = schemas.filter(name => !available.has(name));
      if (missing.length) return {
        ok: false, code: 'SCHEMA_NOT_ACCESSIBLE', category: 'schema_access',
        message: `已连接数据库服务，但无法读取 Schema：${missing.join(', ')}`,
        guidance: ['确认填写的是 Schema 名称（不是服务器或表名）', '请管理员授予 SELECT、SHOW VIEW、EXECUTE、TRIGGER 权限']
      };
    }
    return { ok: true, message: '连接成功' };
  } catch (err) {
    return describeConnectionError(err, config);
  } finally {
    if (conn) await conn.end();
  }
}

/**
 * 读取多个 Schema 的表、视图、过程、函数、触发器定义。
 * database 支持逗号分隔的 Schema 名称，或使用 * 导入账号可见的所有业务 Schema。
 */
export async function fetchSchema(config, options = {}) {
  const requestedSchemas = normalizeSchemas(config.database);
  if (!requestedSchemas.length) throw new Error('至少需要填写一个 Schema 名称');
  const maxObjects = Math.max(1, Math.min(Number(options.maxObjects || options.maxTables || 300), 1000));
  const includeSample = options.includeSample !== false;
  let conn;

  try {
    conn = await mysql.createConnection({
      host: config.host || 'localhost', port: Number(config.port) || 3306,
      user: config.user, password: config.password, charset: 'utf8mb4', connectTimeout: 10000
    });

    let schemas = requestedSchemas;
    if (schemas.includes('*')) {
      const [rows] = await conn.execute(`SELECT SCHEMA_NAME FROM information_schema.SCHEMATA
        WHERE SCHEMA_NAME NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys') ORDER BY SCHEMA_NAME`);
      schemas = rows.map(row => row.SCHEMA_NAME);
    }
    if (!schemas.length) throw new Error('当前账号没有可访问的业务 Schema');

    const tableFilter = schemaFilter(schemas);
    const [objectRows] = await conn.execute(`SELECT TABLE_SCHEMA, TABLE_NAME, TABLE_TYPE, TABLE_ROWS, TABLE_COMMENT
      FROM information_schema.TABLES WHERE ${tableFilter.clause} AND TABLE_TYPE IN ('BASE TABLE', 'VIEW')
      ORDER BY TABLE_SCHEMA, TABLE_TYPE, TABLE_ROWS DESC, TABLE_NAME LIMIT ${maxObjects + 1}`, tableFilter.values);
    const tableObjects = objectRows.slice(0, maxObjects);
    const tableRows = tableObjects.filter(row => row.TABLE_TYPE === 'BASE TABLE');
    const viewRows = tableObjects.filter(row => row.TABLE_TYPE === 'VIEW');

    const tables = [];
    for (const table of tableRows) {
      const [columns] = await conn.execute(`SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, COLUMN_COMMENT, EXTRA
        FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`, [table.TABLE_SCHEMA, table.TABLE_NAME]);
      let sampleRows = [];
      if (includeSample && Number(table.TABLE_ROWS) > 0) {
        try { [sampleRows] = await conn.query(`SELECT * FROM ${quoteIdentifier(table.TABLE_SCHEMA)}.${quoteIdentifier(table.TABLE_NAME)} LIMIT 2`); } catch { /* no SELECT on row data */ }
      }
      tables.push({
        schema_name: table.TABLE_SCHEMA, table_name: table.TABLE_NAME, table_rows: table.TABLE_ROWS, table_comment: table.TABLE_COMMENT,
        column_count: columns.length,
        columns: columns.map(column => ({ name: column.COLUMN_NAME, type: column.COLUMN_TYPE, nullable: column.IS_NULLABLE === 'YES', key: column.COLUMN_KEY, comment: column.COLUMN_COMMENT, extra: column.EXTRA })),
        ddl: buildTableDDL({ schema_name: table.TABLE_SCHEMA, table_name: table.TABLE_NAME, table_comment: table.TABLE_COMMENT }, columns), sample_data: sampleRows
      });
    }

    const views = [];
    for (const view of viewRows) {
      const [definitionRows] = await conn.execute(`SELECT VIEW_DEFINITION, CHECK_OPTION, IS_UPDATABLE, DEFINER, SECURITY_TYPE
        FROM information_schema.VIEWS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`, [view.TABLE_SCHEMA, view.TABLE_NAME]);
      const metadata = definitionRows[0] || {};
      views.push({
        schema_name: view.TABLE_SCHEMA, view_name: view.TABLE_NAME, view_comment: view.TABLE_COMMENT, metadata,
        ddl: `CREATE VIEW ${quoteIdentifier(view.TABLE_SCHEMA)}.${quoteIdentifier(view.TABLE_NAME)} AS\n${metadata.VIEW_DEFINITION || '-- View definition is unavailable to this account'};`
      });
    }

    const routineFilter = schemaFilter(schemas, 'ROUTINE_SCHEMA');
    const [routineRows] = await conn.execute(`SELECT ROUTINE_SCHEMA, ROUTINE_NAME, ROUTINE_TYPE, ROUTINE_DEFINITION, ROUTINE_COMMENT, DATA_TYPE
      FROM information_schema.ROUTINES WHERE ${routineFilter.clause} ORDER BY ROUTINE_SCHEMA, ROUTINE_TYPE, ROUTINE_NAME LIMIT ${maxObjects + 1}`, routineFilter.values);
    const routines = routineRows.slice(0, maxObjects).map(routine => ({
      schema_name: routine.ROUTINE_SCHEMA, routine_name: routine.ROUTINE_NAME, routine_type: routine.ROUTINE_TYPE, routine_comment: routine.ROUTINE_COMMENT,
      ddl: `-- ${routine.ROUTINE_TYPE} ${quoteIdentifier(routine.ROUTINE_SCHEMA)}.${quoteIdentifier(routine.ROUTINE_NAME)}\n${routine.ROUTINE_DEFINITION || '-- Definition is unavailable to this account'}`
    }));

    const triggerFilter = schemaFilter(schemas, 'TRIGGER_SCHEMA');
    const [triggerRows] = await conn.execute(`SELECT TRIGGER_SCHEMA, TRIGGER_NAME, EVENT_MANIPULATION, EVENT_OBJECT_TABLE, ACTION_TIMING, ACTION_STATEMENT
      FROM information_schema.TRIGGERS WHERE ${triggerFilter.clause} ORDER BY TRIGGER_SCHEMA, TRIGGER_NAME LIMIT ${maxObjects + 1}`, triggerFilter.values);
    const triggers = triggerRows.slice(0, maxObjects).map(trigger => ({
      schema_name: trigger.TRIGGER_SCHEMA, trigger_name: trigger.TRIGGER_NAME,
      ddl: `CREATE TRIGGER ${quoteIdentifier(trigger.TRIGGER_SCHEMA)}.${quoteIdentifier(trigger.TRIGGER_NAME)} ${trigger.ACTION_TIMING} ${trigger.EVENT_MANIPULATION} ON ${quoteIdentifier(trigger.TRIGGER_SCHEMA)}.${quoteIdentifier(trigger.EVENT_OBJECT_TABLE)} FOR EACH ROW\n${trigger.ACTION_STATEMENT}`
    }));

    const fullDDL = [...tables, ...views, ...routines, ...triggers].map(item => item.ddl).join('\n\n');
    let fullContent = fullDDL;
    if (includeSample) {
      const samples = tables.filter(table => table.sample_data.length).map(table => `-- ${table.schema_name}.${table.table_name} 样例数据:\n${JSON.stringify(table.sample_data, null, 2)}`).join('\n\n');
      if (samples) fullContent += `${fullContent ? '\n\n' : ''}${samples}`;
    }
    const objectCount = tables.length + views.length + routines.length + triggers.length;
    return {
      database: requestedSchemas.join(', '), schemas, table_count: tables.length, view_count: views.length,
      routine_count: routines.length, trigger_count: triggers.length, object_count: objectCount,
      truncated: objectRows.length > maxObjects || routineRows.length > maxObjects || triggerRows.length > maxObjects,
      total_rows: tables.reduce((sum, table) => sum + Number(table.table_rows || 0), 0),
      tables, views, routines, triggers, full_ddl: fullDDL, full_content: fullContent,
      diagnostic: objectCount ? null : {
        category: 'no_readable_objects', message: '已连上数据库，但在指定 Schema 中没有读到可分析的表、视图、存储过程、函数或触发器。',
        guidance: ['确认填写的是 Workbench 左侧显示的 Schema 名称；多个 Schema 用逗号分隔，导入全部可访问 Schema 可填写 *', '请让管理员授予 SELECT、SHOW VIEW、EXECUTE、TRIGGER 权限，并确认账号可查看 information_schema']
      }
    };
  } finally {
    if (conn) await conn.end();
  }
}
