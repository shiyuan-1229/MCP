// 系统化修复: 把损坏的 ? 字符（应该被替换为 " 引号的位置）恢复
// 模式：在 string 内部、紧跟 , 或 ] 或 : 的 ?
import fs from 'fs';

const text = fs.readFileSync('server.js', 'utf8').replace(/^\uFEFF/, '');

// 解析后构造字符数组
const chars = text.split('');

// 跟踪 string 状态
let inStr = false, strQ = '', esc = false;
let inLineComment = false, inComment = false;

let fixCount = 0;
for (let i = 0; i < chars.length; i++) {
  const c = chars[i];
  if (inLineComment) { if (c === '\n') inLineComment = false; continue; }
  if (inComment) { if (c === '*' && chars[i+1] === '/') { inComment = false; i++; } continue; }
  if (inStr) {
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === strQ) { inStr = false; continue; }
    // 在 string 内部，遇到 ? 时:
    //   - 如果 ? 紧跟 , ] ) } 或者 $ { + = \n 中的一个 -> ? 应该是 " (字符串结束)
    //   - 如果 ? 紧跟 " -> ? 可能是损坏的字符 (但这种情况应该已经被 €? 替换处理过)
    if (c === '?') {
      const next = chars[i+1];
      if (next === ',' || next === ']' || next === ')' || next === '}') {
        // 这个 ? 应该是 " 引号
        chars[i] = '"';
        inStr = false; // 引号结束了 string
        fixCount++;
      }
    }
    continue;
  }
  if (c === '/' && chars[i+1] === '/') { inLineComment = true; i++; continue; }
  if (c === '/' && chars[i+1] === '*') { inComment = true; i++; continue; }
  if (c === '"' || c === "'" || c === '`') { inStr = true; strQ = c; continue; }
}

const out = '\uFEFF' + chars.join('');
fs.writeFileSync('server.js', out);
console.log('修复了', fixCount, '个 ? 字符');
console.log('新文件长度:', out.length);
