import fs from 'fs';
const text = fs.readFileSync('server.js', 'utf8').replace(/^\uFEFF/, '');
let depth = 0;
let inStr = false;
let strQ = '';
let esc = false;
let inLineComment = false;
let inComment = false;
let topCount = 0;
for (let i = 0; i < text.length; i++) {
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
  if (c === '[' || c === '{' || c === '(') {
    depth++;
    if (depth === 1) {
      const preview = text.substr(i, 80).replace(/\s+/g, ' ');
      console.log('TOP-OPEN', c, 'at', i, '...', preview);
      topCount++;
    }
  } else if (c === ']' || c === '}' || c === ')') {
    depth--;
    if (depth === 0) {
      console.log('TOP-CLOSE', c, 'at', i);
    }
  }
}
console.log('Top-level opens:', topCount);
