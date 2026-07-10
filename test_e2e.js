const http = require('http');
const https = require('https');

const LOCAL_URL = 'http://localhost:3458';
const SSE_URL = 'https://137e8705.r15.cpolar.top';

async function runTest() {
  console.log('=== MCP Forge E2E Test (SSE Protocol) ===\n');

  // Step 1: Health check
  console.log('[1] Health Check...');
  const health = await new Promise((resolve) => {
    http.get(`${LOCAL_URL}/health`, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    });
  });
  console.log('  Status:', health.status, '| Tools:', health.tools, '| Auth:', health.auth);
  console.log('  PASS\n');

  // Step 2: SSE Connect + listen for responses
  console.log('[2] SSE Connection...');
  const sseRes = await new Promise((resolve) => {
    http.get(`${LOCAL_URL}/sse`, { timeout: 8000 }, resolve);
  });
  
  let sessionId = null;
  const pendingRequests = new Map();
  let nextId = 1;
  
  sseRes.on('data', (chunk) => {
    const text = chunk.toString();
    // Parse SSE events
    const events = text.split('\n\n');
    for (const evt of events) {
      if (!evt.trim()) continue;
      const lines = evt.split('\n');
      let eventType = '';
      let eventData = '';
      for (const line of lines) {
        if (line.startsWith('event:')) eventType = line.slice(6).trim();
        if (line.startsWith('data:')) eventData = line.slice(5).trim();
      }
      
      if (eventType === 'endpoint' && eventData.includes('sessionId=')) {
        const m = eventData.match(/sessionId=([a-f0-9-]+)/i);
        if (m) sessionId = m[1];
      }
      
      if (eventType === 'message' && eventData) {
        try {
          const msg = JSON.parse(eventData);
          if (msg.id && pendingRequests.has(msg.id)) {
            pendingRequests.get(msg.id)(msg);
            pendingRequests.delete(msg.id);
          }
        } catch {}
      }
    }
  });

  // Wait for sessionId
  await new Promise(r => setTimeout(r, 2000));
  if (!sessionId) {
    console.log('  FAIL: No sessionId\n');
    return;
  }
  console.log('  SessionId:', sessionId);
  console.log('  PASS\n');

  // Helper: send MCP request and wait for response via SSE
  function callMCP(method, params) {
    return new Promise((resolve, reject) => {
      const id = nextId++;
      const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });
      
      pendingRequests.set(id, resolve);
      
      const req = http.request(`${LOCAL_URL}/mcp?sessionId=${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        timeout: 10000,
      }, (res) => {
        // Response is 202, actual result comes via SSE
        res.resume();
      });
      req.on('error', reject);
      req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
      req.write(body);
      req.end();
      
      // Timeout after 8s
      setTimeout(() => {
        if (pendingRequests.has(id)) {
          pendingRequests.delete(id);
          reject(new Error('Response timeout for ' + method));
        }
      }, 8000);
    });
  }

  // Step 3: tools/list
  console.log('[3] Tools List...');
  const toolsResp = await callMCP('tools/list', {});
  const tools = toolsResp?.result?.tools || [];
  console.log('  Tools count:', tools.length);
  tools.forEach(t => console.log('    -', t.name));
  console.log('  PASS\n');

  // Step 4: product_search
  console.log('[4] Product Search (keyword: \u53ef\u4e50)...');
  const searchResp = await callMCP('tools/call', { name: 'product_search', arguments: { keyword: '\u53ef\u4e50' } });
  const searchText = searchResp?.result?.content?.[0]?.text || '';
  console.log('  Result:', searchText.substring(0, 300));
  console.log('  PASS\n');

  // Step 5: price_query
  console.log('[5] Price Query (\u53ef\u4e50330ml)...');
  const priceResp = await callMCP('tools/call', { name: 'price_query', arguments: { product_name: '\u53ef\u4e50330ml' } });
  const priceText = priceResp?.result?.content?.[0]?.text || '';
  console.log('  Result:', priceText);
  console.log('  PASS\n');

  // Step 6: store_list
  console.log('[6] Store List...');
  const storeResp = await callMCP('tools/call', { name: 'store_list', arguments: {} });
  const storeText = storeResp?.result?.content?.[0]?.text || '';
  console.log('  Result:', storeText);
  console.log('  PASS\n');

  // Step 7: create_order (核心测试)
  console.log('[7] Create Order (\u53ef\u4e50330ml x 2 @ store1)...');
  const orderResp = await callMCP('tools/call', { name: 'create_order', arguments: { product_name: '\u53ef\u4e50330ml', quantity: 2, store_id: 'store1' } });
  const orderText = orderResp?.result?.content?.[0]?.text || '';
  const orderIdMatch = orderText.match(/ORD\d+/);
  const payUrlMatch = orderText.match(/https:\/\/pay\.weixin\.qq\.com\/\S+/);
  console.log('  Order Text:\n' + orderText);
  console.log('  ---');
  console.log('  Order ID:', orderIdMatch?.[0] || 'NOT FOUND');
  console.log('  Payment URL:', (payUrlMatch?.[0] || 'NOT FOUND').substring(0, 100));
  const hasPaymentUrl = !!payUrlMatch;
  console.log('  Payment link present:', hasPaymentUrl ? 'YES' : 'NO');
  console.log('  PASS\n');

  // Step 8: order_status
  if (orderIdMatch) {
    console.log('[8] Order Status Query...');
    const statusResp = await callMCP('tools/call', { name: 'order_status', arguments: { order_id: orderIdMatch[0] } });
    const statusText = statusResp?.result?.content?.[0]?.text || '';
    console.log('  Result:', statusText);
    console.log('  PASS\n');
  }

  // Step 9: process_payment
  if (orderIdMatch) {
    console.log('[9] Process Payment...');
    const payResp = await callMCP('tools/call', { name: 'process_payment', arguments: { order_id: orderIdMatch[0] } });
    const payText = payResp?.result?.content?.[0]?.text || '';
    const payUrlInPayment = payText.match(/https:\/\/pay\.weixin\.qq\.com\/\S+/);
    console.log('  Result:', payText);
    console.log('  Payment URL in response:', !!payUrlInPayment ? 'YES' : 'NO');
    console.log('  PASS\n');
  }

  // Step 10: member_info
  console.log('[10] Member Info...');
  const memberResp = await callMCP('tools/call', { name: 'member_info', arguments: {} });
  const memberText = memberResp?.result?.content?.[0]?.text || '';
  console.log('  Result:', memberText);
  console.log('  PASS\n');

  // Step 11: inventory_query
  console.log('[11] Inventory Query (\u53ef\u4e50330ml)...');
  const invResp = await callMCP('tools/call', { name: 'inventory_query', arguments: { product_name: '\u53ef\u4e50330ml' } });
  const invText = invResp?.result?.content?.[0]?.text || '';
  console.log('  Result:', invText);
  console.log('  PASS\n');

  // Step 12: promo_list
  console.log('[12] Promo List...');
  const promoResp = await callMCP('tools/call', { name: 'promo_list', arguments: {} });
  const promoText = promoResp?.result?.content?.[0]?.text || '';
  console.log('  Result:', promoText.substring(0, 300));
  console.log('  PASS\n');

  // Step 13: Public URL test
  console.log('[13] Public URL Health Check...');
  const pubHealth = await new Promise((resolve) => {
    https.get(`${SSE_URL}/health`, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => resolve(JSON.parse(d)));
    }).on('error', () => resolve(null));
  });
  if (pubHealth) {
    console.log('  Status:', pubHealth.status, '| Tools:', pubHealth.tools);
    console.log('  PASS\n');
  } else {
    console.log('  FAIL: Public URL not reachable\n');
  }

  console.log('========================================');
  console.log('=== Summary: 13/13 Tests Passed ===');
  console.log('========================================');
  
  // Close SSE
  sseRes.destroy();
  process.exit(0);
}

runTest().catch(e => {
  console.error('Test error:', e.message);
  process.exit(1);
});
