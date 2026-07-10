import puppeteer from 'puppeteer';

const url = process.argv[2] || 'http://localhost:3100/admin/';
const out = process.argv[3] || 'screenshot-login-glow.png';

const browser = await puppeteer.launch({
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
});

const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
await new Promise(r => setTimeout(r, 1500));
await page.screenshot({ path: out, fullPage: false });
console.log('Saved:', out);
await browser.close();
