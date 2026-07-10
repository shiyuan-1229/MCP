import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const logs = [];
page.on('pageerror', e => logs.push('PAGE: ' + e.message));
page.on('console', m => logs.push('CON[' + m.type() + ']: ' + m.text()));
page.on('response', r => { if (r.status() >= 400) logs.push('HTTP ' + r.status() + ' ' + r.url()); });

await page.goto('http://localhost:3100/admin', { waitUntil: 'networkidle2', timeout: 15000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 1000));
await page.type('#loginUser', 'admin');
await page.type('#loginPass', 'admin123');

// 监控网络
const responses = [];
page.on('response', r => responses.push({ url: r.url(), status: r.status() }));

await page.click('#loginBtn');
await new Promise(r => setTimeout(r, 3000));

const state = await page.evaluate(() => ({
  loginHidden: document.querySelector('#login')?.classList.contains('hidden'),
  appHidden: document.querySelector('#app')?.classList.contains('hidden'),
  error: document.querySelector('#loginError')?.textContent,
  currentUser: document.querySelector('#currentUser')?.textContent,
  localStorage: localStorage.getItem('mcp_token')?.slice(0, 20)
}));
console.log('STATE:', JSON.stringify(state, null, 2));
console.log('HTTP responses (>= 400):');
for (const r of responses.filter(r => r.status >= 400)) console.log(' ', r.status, r.url);
console.log('STATE:', JSON.stringify(state, null, 2));
console.log('LOGS:');
for (const l of logs) console.log('  ', l);

await browser.close();
