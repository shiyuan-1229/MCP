/**
 * DDL 解析器 —— 从 MySQL 风格 CREATE TABLE 语句抽取表结构
 *
 * 主要能力：
 * - 抽取表名、字段名、类型、COMMENT、是否主键、是否可空
 * - 自动去掉 SQL 行注释（-- xxx）和块注释（/* xxx *\/）
 * - 自动去掉 CREATE DATABASE / USE / SET 等非表定义语句
 * - 返回结构化结果，可直接喂给 AI 引擎作为 sampleContent
 *
 * 不支持：
 * - PostgreSQL/SQLServer 方言（type 字段会保留原值，AI 可识别）
 * - 多行字段定义（每行一个字段）
 * - 索引、外键等约束（暂不解析，AI 推断）
 */

// 移除 SQL 注释
function stripComments(sql) {
  // 块注释 /* ... */（非贪婪，支持跨行）
  let s = sql.replace(/\/\*[\s\S]*?\*\//g, '');
  // 行注释 -- ... 到行尾
  s = s.replace(/--[^\n]*/g, '');
  return s;
}

// 匹配 CREATE TABLE ... ( ... ) [表选项]; 块（手动括号配对，避免被字段类型里的 (255) 干扰）
function extractCreateTableBlocks(sql) {
  const blocks = [];
  const headerRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([\w.]+)`?\s*\(/gi;
  let m;
  while ((m = headerRe.exec(sql)) !== null) {
    const startBody = headerRe.lastIndex;
    let depth = 1;
    let i = startBody;
    while (i < sql.length && depth > 0) {
      const ch = sql[i];
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      i++;
    }
    if (depth === 0) {
      // 找到 `)`，再向后扫描到下一个 `;` 以捕获表级选项（COMMENT/ENGINE 等）
      const endBody = i - 1;
      let j = i;
      while (j < sql.length && sql[j] !== ';') j++;
      const tail = sql.slice(endBody + 1, j); // `)` 和 `;` 之间的内容
      blocks.push({ tableName: m[1], body: sql.slice(startBody, endBody), tail });
      headerRe.lastIndex = j + 1;
    } else {
      break;
    }
  }
  return blocks;
}

// 把表体按"字段级逗号"分割成多个列定义 token
// 考虑括号深度，避免 decimal(10,2) 里的逗号被误判
function splitColumnDefinitions(body) {
  const tokens = [];
  let depth = 0;
  let current = '';
  let inString = false;
  let stringChar = '';
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      current += ch;
      if (ch === stringChar && body[i - 1] !== '\\') inString = false;
      continue;
    }
    if (ch === "'" || ch === '"') {
      inString = true;
      stringChar = ch;
      current += ch;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      tokens.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) tokens.push(current);
  return tokens;
}

// 抽取列定义（支持单行多列 + 多行单列两种格式）
// 返回 { columns, tableComment }
function parseTableBody(body, tail = '') {
  // 先把 body 按字段级逗号 token 化
  const colTokens = splitColumnDefinitions(body);
  // tail 里可能含表级 COMMENT='...'，加进来一起处理
  const allLines = [...colTokens, tail]
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('/*') && !l.startsWith('--'));

  const columns = [];
  let tableComment = null;

  for (const line of allLines) {
    // 表级 COMMENT (MySQL: COMMENT='xxx' 或 COMMENT 'xxx')
    const tblCommentMatch = line.match(/^(?:TABLE\s+)?COMMENT\s*=\s*['"]([^'"]*)['"]/i)
      || line.match(/^(?:TABLE\s+)?COMMENT\s+['"]([^'"]*)['"]/i)
      || line.match(/COMMENT\s*=\s*['"]([^'"]*)['"]/i);
    if (tblCommentMatch && !line.match(/^`?\w+`?\s+[\w.]/)) {
      tableComment = tblCommentMatch[1];
      continue;
    }
    // 跳过 ENGINE / DEFAULT CHARSET / ROW_FORMAT / AUTO_INCREMENT 等表选项
    if (/^(ENGINE|DEFAULT\s+CHARSET|DEFAULT\s+COLLATE|ROW_FORMAT|AUTO_INCREMENT)\s*=/i.test(line)) {
      continue;
    }

    // 跳过主键/索引/外键行
    if (/^(PRIMARY\s+KEY|UNIQUE\s+KEY|KEY|INDEX|FOREIGN\s+KEY|CONSTRAINT|CHECK)\b/i.test(line)) {
      continue;
    }

    // 列定义：name type [(length)] [NOT NULL] [DEFAULT ...] [COMMENT '...']
    const colMatch = line.match(/^`?(\w+)`?\s+([\w.]+(?:\s*\([\d,\s]+\))?)(.*)$/);
    if (!colMatch) continue;

    const colName = colMatch[1];
    const colType = colMatch[2].trim();
    const rest = colMatch[3] || '';

    const notNull = /\bNOT\s+NULL\b/i.test(rest);
    const isPrimaryKey = /\bPRIMARY\s+KEY\b/i.test(rest) || /\bPRIMARY\s+KEY\b/i.test(line);
    const commentMatch = rest.match(/COMMENT\s+['"]([^'"]*)['"]/i);
    const comment = commentMatch ? commentMatch[1] : null;

    columns.push({
      name: colName,
      type: colType,
      nullable: !notNull && !isPrimaryKey,
      pk: isPrimaryKey,
      comment
    });
  }

  return { columns, tableComment };
}

/**
 * 解析 DDL 文本，返回结构化的表结构
 * @param {string} ddlText - 原始 DDL 文本（可含多条 CREATE TABLE）
 * @returns {{
 *   tables: Array<{name, comment, columns, ddl}>,
 *   summary: {total_tables, total_columns, table_names, warnings},
 *   ai_prompt: string  // 可直接喂给 AI 引擎的文本摘要
 * }}
 */
export function parseDDL(ddlText) {
  const warnings = [];
  if (!ddlText || typeof ddlText !== 'string') {
    return { tables: [], summary: { total_tables: 0, total_columns: 0, table_names: [], warnings: ['输入为空'] }, ai_prompt: '' };
  }

  const cleaned = stripComments(ddlText);
  const blocks = extractCreateTableBlocks(cleaned);

  if (blocks.length === 0) {
    warnings.push('未识别到任何 CREATE TABLE 语句。请确认上传的是 DDL/SQL 文件。');
    return {
      tables: [],
      summary: { total_tables: 0, total_columns: 0, table_names: [], warnings },
      ai_prompt: ddlText.slice(0, 2000)
    };
  }

  const tables = blocks.map(b => {
    const { columns, tableComment } = parseTableBody(b.body, b.tail || '');
    return {
      name: b.tableName.replace(/`/g, ''),
      comment: tableComment,
      columns,
      ddl: `CREATE TABLE ${b.tableName} (\n${b.body.trim()}\n);`
    };
  });

  const totalColumns = tables.reduce((sum, t) => sum + t.columns.length, 0);

  // 生成给 AI 引擎的文本摘要（结构化但人类可读）
  const aiPrompt = [
    `【DDL 解析结果】共 ${tables.length} 张表，${totalColumns} 个字段`,
    '',
    ...tables.map(t => {
      const head = t.comment
        ? `-- ${t.name} (${t.comment})`
        : `-- ${t.name}`;
      const cols = t.columns.map(c => {
        const tags = [];
        if (c.pk) tags.push('PK');
        if (!c.nullable) tags.push('NOT NULL');
        const tagStr = tags.length ? ` [${tags.join(',')}]` : '';
        const commentStr = c.comment ? ` -- ${c.comment}` : '';
        return `  ${c.name} ${c.type}${tagStr}${commentStr}`;
      }).join('\n');
      return `${head}\n${cols}`;
    })
  ].join('\n');

  return {
    tables,
    summary: {
      total_tables: tables.length,
      total_columns: totalColumns,
      table_names: tables.map(t => t.name),
      warnings
    },
    ai_prompt: aiPrompt
  };
}

/**
 * 解析 CSV/Excel 类的表结构样本（首行是表头）
 * 用于非 SQL 但有表结构的资料（如 Excel 字段说明表）
 * @param {string} csvText - CSV 文本
 * @returns {{columns: Array, ai_prompt: string}}
 */
export function parseCSVHeader(csvText) {
  if (!csvText || typeof csvText !== 'string') return { columns: [], ai_prompt: '' };
  const firstLine = csvText.split(/\r?\n/)[0] || '';
  const headers = firstLine.split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));
  const sampleRows = csvText.split(/\r?\n/).slice(1, 4).filter(Boolean);
  const columns = headers.map((h, i) => ({
    name: h,
    samples: sampleRows.map(row => {
      const cells = row.split(',');
      return (cells[i] || '').trim().replace(/^["']|["']$/g, '');
    }).filter(Boolean)
  }));
  const aiPrompt = [
    `【CSV 表头解析】共 ${columns.length} 个字段`,
    '',
    ...columns.map(c => {
      const sampleStr = c.samples.length ? `（样例：${c.samples.slice(0, 3).join(', ')}）` : '';
      return `  ${c.name}${sampleStr}`;
    })
  ].join('\n');
  return { columns, ai_prompt: aiPrompt };
}