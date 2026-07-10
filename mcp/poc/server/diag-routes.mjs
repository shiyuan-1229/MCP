import fs from 'fs';
const text = fs.readFileSync('server.js', 'utf8').replace(/^\uFEFF/, '');
const re = /app\.(get|post|put|delete|patch|use)\s*\(/g;
let m;
const routes = [];
while ((m = re.exec(text)) !== null) {
  const start = m.index;
  let end = text.indexOf(';', start);
  if (end < 0 || end > start + 250) end = start + 250;
  routes.push({ method: m[1], snippet: text.slice(start, Math.min(end, start + 220)).replace(/\s+/g, ' ').slice(0, 200) });
}
console.log('Routes:', routes.length);
for (const r of routes) console.log(r.method.toUpperCase().padEnd(6), r.snippet);
