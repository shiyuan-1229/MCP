const assert = require('assert');

(async () => {
  const { normalizeDbSchema } = await import('../mcp/poc/server/modules/connectors/db-schema.mjs');
  const { normalizeOpenApiSpec } = await import('../mcp/poc/server/modules/connectors/openapi-parser.mjs');

  const dbResult = normalizeDbSchema({
    tables: [{ name: 'orders', columns: [{ name: 'id', type: 'INTEGER' }, { name: 'customer_phone', type: 'TEXT' }] }]
  });
  assert.equal(dbResult.tables[0].name, 'orders');
  assert.equal(dbResult.tables[0].fields[1].name, 'customer_phone');

  const apiResult = normalizeOpenApiSpec({
    openapi: '3.0.3',
    paths: { '/orders': { get: { summary: 'List orders', parameters: [] } } }
  });
  assert.equal(apiResult.endpoints[0].path, '/orders');
  assert.equal(apiResult.endpoints[0].method, 'GET');

  console.log('governance connector checks passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});