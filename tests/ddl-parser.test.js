import { parseDDL, parseCSVHeader } from '../mcp/poc/server/modules/ddl-parser.mjs';

let pass = 0, fail = 0;
function assert(cond, msg) {
  if (cond) { pass++; console.log('  ✅', msg); }
  else { fail++; console.error('  ❌', msg); }
}

console.log('\n=== DDL 解析器：单表解析 ===');
const single = parseDDL(`
CREATE TABLE member_info (
  id bigint NOT NULL PRIMARY KEY,
  uuid varchar(255) NOT NULL COMMENT '会员唯一标识',
  name varchar(255) COMMENT '姓名',
  mobile varchar(255),
  enabled bit(1) DEFAULT b'1' COMMENT '是否启用'
);
`);
assert(single.tables.length === 1, '解析出 1 张表');
assert(single.tables[0].name === 'member_info', '表名正确');
assert(single.tables[0].columns.length === 5, '字段数 = 5');
assert(single.tables[0].columns[0].pk === true, 'id 是主键');
assert(single.tables[0].columns[0].nullable === false, 'id 不可空');
assert(single.tables[0].columns[1].comment === '会员唯一标识', 'uuid 注释正确');
assert(single.tables[0].columns[2].nullable === true, 'name 可空');
assert(single.tables[0].columns[4].comment === '是否启用', 'enabled 注释正确');
assert(single.summary.total_tables === 1, 'summary.total_tables = 1');
assert(single.summary.total_columns === 5, 'summary.total_columns = 5');
assert(single.ai_prompt.includes('member_info'), 'ai_prompt 包含表名');
assert(single.ai_prompt.includes('PK'), 'ai_prompt 标记主键');

console.log('\n=== DDL 解析器：多表 + 注释 ===');
const multi = parseDDL(`
-- 会员主表
CREATE TABLE member_info (
  id bigint PRIMARY KEY COMMENT '主键ID',
  name varchar(255) COMMENT '姓名'
) COMMENT='会员表';

-- 订单表
CREATE TABLE orders (
  id bigint PRIMARY KEY,
  member_id bigint NOT NULL,
  amount decimal(10,2) COMMENT '订单金额'
);
`);
assert(multi.tables.length === 2, '解析出 2 张表');
assert(multi.tables[0].comment === '会员表', '表注释正确');
assert(multi.tables[1].columns.find(c => c.name === 'member_id')?.nullable === false, 'member_id NOT NULL 正确');

console.log('\n=== DDL 解析器：跳过约束行 ===');
const withKeys = parseDDL(`
CREATE TABLE t1 (
  id bigint PRIMARY KEY,
  name varchar(100),
  UNIQUE KEY uk_name (name),
  KEY idx_id (id)
);
`);
assert(withKeys.tables[0].columns.length === 2, '跳过 UNIQUE KEY/KEY 行，只剩 2 列');

console.log('\n=== DDL 解析器：空输入 / 无效输入 ===');
const empty = parseDDL('');
assert(empty.tables.length === 0, '空输入返回 0 表');
assert(empty.summary.warnings.length > 0, '空输入有 warning');

const garbage = parseDDL('SELECT * FROM users; INSERT INTO foo VALUES (1);');
assert(garbage.tables.length === 0, '无效 SQL 返回 0 表');
assert(garbage.summary.warnings[0].includes('CREATE TABLE'), '警告提示无 CREATE TABLE');

console.log('\n=== DDL 解析器：去掉块注释 ===');
const withBlockComment = parseDDL(`
/* 这是注释 */
CREATE TABLE t2 (
  id int PRIMARY KEY
);
/* 末尾注释 */
`);
assert(withBlockComment.tables.length === 1, '去掉块注释后识别 1 表');

console.log('\n=== CSV 解析器 ===');
const csv = parseCSVHeader('id,name,mobile\n1,张三,13800138000\n2,李四,13900139000');
assert(csv.columns.length === 3, 'CSV 解析出 3 列');
assert(csv.columns[0].name === 'id', '第 1 列为 id');
assert(csv.columns[0].samples.length === 2, 'id 列有 2 个样例值');
assert(csv.columns[1].samples[0] === '张三', '第 1 行第 2 列为"张三"');

console.log(`\n=== 汇总：${pass} 通过 / ${fail} 失败 ===`);
process.exit(fail > 0 ? 1 : 0);