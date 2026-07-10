import fs from 'fs';
const text = fs.readFileSync('server.js', 'utf8').replace(/^\uFEFF/, '');
// 找所有 function xxx(...)  { ... } 的定义
const fnRe = /function\s+(\w+)\s*\(([^)]*)\)/g;
let m;
const fns = [];
while ((m = fnRe.exec(text)) !== null) {
  const start = m.index;
  const end = m.index + m[0].length + 200;
  fns.push({ name: m[1], params: m[2], snippet: text.slice(start, end).replace(/\s+/g, ' ').slice(0, 250) });
}
console.log('Functions:', fns.length);
for (const f of fns) console.log('  ', f.name, '(', f.params, ')');
