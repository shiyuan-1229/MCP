import fs from 'fs';
let text = fs.readFileSync('server.js', 'utf8').replace(/^\uFEFF/, '');
// 把 ];]; -> ];
text = text.replace(/\];\];/g, '];');
fs.writeFileSync('server.js', '\uFEFF' + text);
console.log('Done. New length:', text.length);
