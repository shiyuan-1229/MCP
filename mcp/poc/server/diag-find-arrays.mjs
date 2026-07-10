import fs from 'fs';
const text = fs.readFileSync('server.js', 'utf8').replace(/^\uFEFF/, '');
const re = /\bconst\s+(\w+)\s*=\s*\[/g;
let m;
const found = [];
while ((m = re.exec(text)) !== null) {
  const start = m.index;
  let depth = 0;
  let inStr = false, strQ = '', esc = false, inLineComment = false, inComment = false;
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
    else if (c === ']') { depth--; if (depth === 0) { found.push({ name: m[1], start, end: i }); break; } }
  }
}
console.log(JSON.stringify(found, null, 2));
