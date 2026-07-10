import fs from 'fs';
const text = fs.readFileSync('server.js', 'utf8').replace(/^\uFEFF/, '');
const idx = text.indexOf('];];');
console.log('];]; at byte:', idx);
if (idx > 0) {
  console.log('context:', JSON.stringify(text.slice(Math.max(0, idx-200), idx+200)));
}
// 找所有 ];] 模式
let pos = 0;
let count = 0;
while (true) {
  const p = text.indexOf('];];', pos);
  if (p < 0) break;
  count++;
  console.log('  at', p, ':', JSON.stringify(text.slice(Math.max(0, p-50), p+50)));
  pos = p + 1;
}
console.log('Total ];];:', count);
