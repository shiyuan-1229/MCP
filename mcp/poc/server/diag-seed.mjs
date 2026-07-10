import fs from 'fs';
const text = fs.readFileSync('server.js', 'utf8').replace(/^\uFEFF/, '');
// 找 const xxx = [ 的位置
const re = /\bconst\s+(\w+)\s*=\s*\[/g;
let m;
while ((m = re.exec(text)) !== null) {
  const start = m.index;
  // 从 start 找匹配的 ]
  let depth = 0;
  let inStr = false;
  let strQ = '';
  let esc = false;
  let inLineComment = false;
  let inComment = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
    if (inComment) { if (c === '*' && text[i+1] === '/') { inComment = false; i++; } continue; }
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === strQ) inStr = false;
      continue;
    }
    if (c === '/' && text[i+1] === '/') { inLineComment = true; i++; continue; }
    if (c === '/' && text[i+1] === '*') { inComment = true; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { inStr = true; strQ = c; continue; }
    if (c === '[') depth++;
    else if (c === ']') { depth--; if (depth === 0) { console.log(m[1], '@', start, '..', i, 'len', i-start); break; } }
  }
}
