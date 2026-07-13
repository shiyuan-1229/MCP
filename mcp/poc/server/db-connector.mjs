/**
 * DB Connector — 数据库直连模块
 * 支持 MySQL，读取表结构、样例数据，转换为 DDL 供 AI 识别
 */
import mysql from 'mysql2/promise';

/**
 * 测试数据库连接
 */
export async function testConnection(config) {
  const { host, port, user, password, database } = config;
  let conn;
  try {
    conn = await mysql.createConnection({
      host: host || 'localhost',
      port: Number(port) || 3306,
      user,
      password,
      database,
      connectTimeout: 8000
    });
    const [rows] = await conn.execute('SELECT 1 AS ok');
    return { ok: true, message: '连接成功' };
  } catch (err) {
    return { ok: false, message: err.message };
  } finally {
    if (conn) await conn.end();
  }
}

/**
 * 读取数据库所有表的 DDL 结构
 */
export async function fetchSchema(config, options = {}) {
  const { host, port, user, password, database } = config;
  const maxTables = options.maxTables || 50;
  const includeSample = options.includeSample !== false;

  const conn = await mysql.createConnection({
    host: host || 'localhost',
    port: Number(port) || 3306,
    user,
    password,
    database,
    connectTimeout: 10000
  });

  try {
    // 获取所有表
    const [tables] = await conn.execute(
      `SELECT TABLE_NAME, TABLE_ROWS, TABLE_COMMENT 
       FROM information_schema.TABLES 
       WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' 
       ORDER BY TABLE_ROWS DESC 
       LIMIT ${Number(maxTables)}`,
      [database]
    );

    const result = [];

    for (const table of tables) {
      // 获取列信息
      const [columns] = await conn.execute(
        `SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY, COLUMN_DEFAULT, COLUMN_COMMENT, EXTRA
         FROM information_schema.COLUMNS 
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? 
         ORDER BY ORDINAL_POSITION`,
        [database, table.TABLE_NAME]
      );

      // 构建 DDL
      const ddlLines = [`CREATE TABLE ${table.TABLE_NAME} (`];
      columns.forEach((col, i) => {
        const nullable = col.IS_NULLABLE === 'NO' ? ' NOT NULL' : '';
        const comment = col.COLUMN_COMMENT ? ` COMMENT '${col.COLUMN_COMMENT}'` : '';
        const comma = i < columns.length - 1 ? ',' : '';
        ddlLines.push(`  ${col.COLUMN_NAME} ${col.COLUMN_TYPE}${nullable}${comment}${comma}`);
      });
      ddlLines.push(`) COMMENT='${table.TABLE_COMMENT || ''}';`);

      // 获取样例数据（最多2行）
      let sampleRows = [];
      if (includeSample && Number(table.TABLE_ROWS) > 0) {
        try {
          [sampleRows] = await conn.query(`SELECT * FROM \`${database}\`.\`${table.TABLE_NAME}\` LIMIT 2`);
        } catch (e) {
          // 有些表可能无法查询
        }
      }

      result.push({
        table_name: table.TABLE_NAME,
        table_rows: table.TABLE_ROWS,
        table_comment: table.TABLE_COMMENT,
        column_count: columns.length,
        columns: columns.map(c => ({
          name: c.COLUMN_NAME,
          type: c.COLUMN_TYPE,
          nullable: c.IS_NULLABLE === 'YES',
          key: c.COLUMN_KEY,
          comment: c.COLUMN_COMMENT,
          extra: c.EXTRA
        })),
        ddl: ddlLines.join('\n'),
        sample_data: sampleRows
      });
    }

    // 构建 AI 识别用的完整 DDL 文本
    const fullDDL = result.map(t => t.ddl).join('\n\n');
    // 构建 AI 识别用的带样例数据的完整描述
    let fullDescription = fullDDL;
    if (includeSample) {
      const sampleText = result
        .filter(t => t.sample_data && t.sample_data.length)
        .map(t => `-- ${t.table_name} 样例数据:\n${JSON.stringify(t.sample_data, null, 2)}`)
        .join('\n\n');
      if (sampleText) fullDescription += '\n\n' + sampleText;
    }

    return {
      database,
      table_count: result.length,
      total_rows: result.reduce((s, t) => s + Number(t.table_rows || 0), 0),
      tables: result,
      full_ddl: fullDDL,
      full_content: fullDescription
    };
  } finally {
    await conn.end();
  }
}
