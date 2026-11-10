/* Sprint 4 迁移脚本：从旧版 index.html 的 NOTES 数组抽取 11 篇笔记 → articles.json
 * NOTES 是纯字面量（对象/字符串/数组），用 vm 安全求值，不 eval 整页脚本。
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '../../index.html'), 'utf8');
const m = html.match(/var NOTES = (\[[\s\S]*?\n\]);/);
if (!m) { console.error('NOTES not found'); process.exit(1); }

const NOTES = vm.runInNewContext('(' + m[1] + ')');
console.log('extracted', NOTES.length, 'articles');

/* 旧站排序：时间倒序（最新在前），#/n 兼容路由按此序号 */
NOTES.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

const out = NOTES.map((n, i) => ({
  n: i + 1,            // 稳定序号（时间倒序），对应旧站 #/n
  id: n.id,
  title: n.title,
  short: n.short || n.title,
  cat: n.cat,
  date: n.date,
  toc: n.toc,
  paras: n.paras,
  url: 'https://blog.csdn.net/m0_68970560/article/details/' + n.id,
}));

const dest = path.join(__dirname, '../src/data/articles.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2), 'utf8');
console.log('written', dest, out.length, 'items');
