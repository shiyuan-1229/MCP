import fs from 'fs';
const buf = fs.readFileSync('server.js');
const lines = [];
let start = 0;
for (let i = 0; i < buf.length; i++) {
  if (buf[i] === 0x0A) { lines.push({ start, end: i }); start = i + 1; }
}
for (let li = 0; li < 280; li++) {
  const seg = buf.slice(lines[li].start, lines[li].end);
  let count = 0;
  let escaped = false;
  for (let i = 0; i < seg.length; i++) {
    if (escaped) { escaped = false; continue; }
    if (seg[i] === 0x5c) { escaped = true; continue; }
    if (seg[i] === 0x22) count++;
  }
  if (count % 2 !== 0) {
    console.log('L' + (li+1) + ' has odd quote count:', count, '|', seg.toString('utf8').slice(0, 80));
  }
}
