import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('PAGE: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('CON: ' + m.text()); });
page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });

await page.goto('http://localhost:3100/admin', { waitUntil: 'domcontentloaded', timeout: 15000 });
await page.waitForSelector('#login', { timeout: 5000 });
await page.evaluate(() => { document.querySelector('#loginUser').value = ''; document.querySelector('#loginPass').value = ''; });
await page.type('#loginUser', 'admin');
await page.type('#loginPass', 'admin123');
await page.click('#loginBtn');
await page.waitForFunction(() => {
  const el = document.querySelector('#app');
  return el && !el.classList.contains('hidden');
}, { timeout: 10000 });
await new Promise(r => setTimeout(r, 1500));

// 验证工厂页面
await page.evaluate(() => document.querySelector('[data-page="factory"]').click());
await new Promise(r => setTimeout(r, 800));
const factoryData = await page.evaluate(() => ({
  hasFactory: !!document.querySelector('#factory'),
  assetRows: document.querySelectorAll('#assetRows tr').length,
  sourceCards: document.querySelectorAll('#sourceList .info-card').length,
  createBtn: document.querySelector('#createAssetBtn')?.textContent || 'NONE',
  createBtnVisible: !document.querySelector('#createAssetBtn')?.classList.contains('hidden')
}));

console.log('=== 工厂页 ===');
console.log(JSON.stringify(factoryData, null, 2));

// 切换其他页面
for (const p of ['summary', 'access', 'publish', 'gateway', 'usage', 'billing', 'files']) {
  await page.evaluate((pid) => document.querySelector(`[data-page="${pid}"]`)?.click(), p);
  await new Promise(r => setTimeout(r, 500));
}

const navBtns = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.nav-btn')).map(b => b.textContent.trim())
);
console.log('=== 导航 ===');
console.log(JSON.stringify(navBtns, null, 2));

console.log('=== 错误 ===');
console.log(errors.length === 0 ? '无' : errors.join('\n'));

await browser.close();
