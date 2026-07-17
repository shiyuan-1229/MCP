import test from 'node:test';
import assert from 'node:assert/strict';
import { describeConnectionError } from '../mcp/poc/server/db-connector.mjs';

test('classifies blocked database network access without exposing credentials', () => {
  const result = describeConnectionError({ code: 'EACCES', message: 'connect EACCES 10.20.8.102:3306' }, {
    host: '10.20.8.102',
    port: 3306,
    password: 'do-not-return-this'
  });

  assert.equal(result.ok, false);
  assert.equal(result.category, 'network_policy');
  assert.equal(result.endpoint, '10.20.8.102:3306');
  assert.match(result.message, /无法建立/);
  assert.equal(JSON.stringify(result).includes('do-not-return-this'), false);
});
