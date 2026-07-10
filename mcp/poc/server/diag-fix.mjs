import fs from 'fs';
const buf = fs.readFileSync('server.js');
const lines = [];
let start = 0;
for (let i = 0; i < buf.length; i++) {
  if (buf[i] === 0x0A) { lines.push({ start, end: i }); start = i + 1; }
}
let totalFixes = 0;
// 1) 行尾: "?,]" -> "?"],   "?,<空>" -> "?"<空>   "?,<其它>" -> "?",
//    实际: 我们要的是 "?" + "]," → 变成 '"] + "]," 然后在前面加一个 "
// 2) 整行 "?]," -> '""],"'  (end of array)
const out = Buffer.alloc(buf.length + 2000);
let dst = 0;
for (let li = 0; li < lines.length; li++) {
  const seg = buf.slice(lines[li].start, lines[li].end);
  // 检查行尾的 ?, (有 ? 后跟 , 的)
  for (let i = 0; i < seg.length; i++) {
    out[dst++] = seg[i];
  }
}

// 简化：直接对 buffer 全局替换 ?, → ",  以及 '?]' → '"]'
// 但要避开 "this?, that" 这种合法句式
// 改用更严格：只有在 array literal 行（开头 [）才做

// 重做：对每行单独处理
let newBuf = Buffer.alloc(buf.length);
let ndst = 0;
let fixes = 0;
for (let li = 0; li < lines.length; li++) {
  const seg = buf.slice(lines[li].start, lines[li].end);
  // 跳过非 array 行
  const trimmed = seg.toString('utf8').trim();
  if (!trimmed.startsWith('[')) {
    seg.copy(newBuf, ndst);
    ndst += seg.length;
    continue;
  }
  // 这是一个 array literal 行
  // 1) 替换 ?, → ",
  // 2) 替换行末的 ?] → "]
  for (let i = 0; i < seg.length; i++) {
    if (seg[i] === 0x3f && i + 1 < seg.length && seg[i+1] === 0x2c) {
      newBuf[ndst++] = 0x22; newBuf[ndst++] = 0x2c; i++; fixes++;
    } else if (seg[i] === 0x3f && i + 1 < seg.length && seg[i+1] === 0x5d) {
      newBuf[ndst++] = 0x22; newBuf[ndst++] = 0x5d; i++; fixes++;
    } else {
      newBuf[ndst++] = seg[i];
    }
  }
}
newBuf = newBuf.subarray(0, ndst);
fs.writeFileSync('server.js', newBuf);
console.log('Total fixes:', fixes);
