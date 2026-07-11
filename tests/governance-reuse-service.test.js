const assert = require('assert');

(async () => {
  const { suggestReuse } = await import('../mcp/poc/server/modules/governance/reuse-service.mjs');

  const suggestions = suggestReuse({
    candidate: { name: 'Customer Order Query', business_domain: 'orders' },
    publishedAssets: [
      { id: 'pub_1', name: 'Order Query', business_domain: 'orders' },
      { id: 'pub_2', name: 'Inventory Sync', business_domain: 'inventory' }
    ]
  });

  assert.equal(suggestions[0].published_asset_id, 'pub_1');
  assert.ok(suggestions[0].score > suggestions[1].score);
  console.log('governance reuse checks passed');
})().catch(err => {
  console.error(err);
  process.exit(1);
});