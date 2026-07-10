import fs from 'fs';
const text = fs.readFileSync('server.js', 'utf8').replace(/^\uFEFF/, '');
const start = text.indexOf('function seed');
const end = text.indexOf('function addColumnIfNotExists');
const body = text.slice(start, end);
// 输出后半部分：INSERT 语句
console.log(body.slice(3500, 10000));
