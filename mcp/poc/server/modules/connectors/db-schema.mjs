// connectors/db-schema.mjs
// 把原始数据库 schema payload 归一化为内部统一结构。
// 当前只做形状归一化，不做业务判定。

export function normalizeDbSchema(input) {
  const tables = Array.isArray(input?.tables) ? input.tables : [];
  return {
    tables: tables.map(table => ({
      name: table.name,
      comment: table.comment || '',
      fields: (table.columns || []).map(column => ({
        name: column.name,
        type: column.type,
        nullable: column.nullable !== false,
        comment: column.comment || ''
      }))
    }))
  };
}