import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer');

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();

await page.goto('http://localhost:3100/admin', { waitUntil: 'networkidle2', timeout: 15000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 1000));

// 拦截 /auth/login 请求
await page.setRequestInterception(true);
page.on('request', req => {
  if (req.url().endsWith('/auth/login') && req.method() === 'POST') {
    console.log('REQUEST BODY:', req.postData());
    console.log('REQUEST HEADERS:', JSON.stringify(req.headers(), null, 2));
  }
  req.continue();
});
page.on('response', async r => {
  if (r.url().endsWith('/auth/login')) {
    console.log('RESPONSE STATUS:', r.status());
    try { console.log('RESPONSE BODY:', await r.text()); } catch {}
  }
});

await page.type('#loginUser', 'admin');
await page.type('#loginPass', 'admin123');
await page.click('#loginBtn');
await new Promise(r => setTimeout(r, 3000));
await browser.close();
