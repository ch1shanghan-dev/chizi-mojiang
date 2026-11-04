/* 生涯扩容 · 把生成的数据写进 core/csh_achv.js
   ------------------------------------------------------------
   为什么整块追加而不是散插：
   csh_achv.js 的 defs 是顺序 push 出来的，旧 key 的阶梯连续性依赖既有顺序。
   追加在最后 = 旧定义位置零位移，任何按序号比对的回归都能原样通过。

   为什么可剥离：用 BEGIN/END 标记包住，便于核对"原始源码未被改动"。

   可重复执行，不会重复插入。
   用法：node tools/achv_scale/apply_career_expand.mjs --root . --data <json>
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const argOf = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const root = path.resolve(argOf('--root') || path.join(here, '..', '..'));
const dataPath = argOf('--data');
if (!dataPath) { console.error('缺 --data'); process.exit(2); }

const rows = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const target = path.join(root, 'core/csh_achv.js');
let src = fs.readFileSync(target, 'utf8');

const BEGIN = '/* ===== BEGIN APPEND:career-expand ===== */';
const END = '/* ===== END APPEND:career-expand ===== */';

/* 每条序列化成一行，便于 diff 与人工抽查 */
const lines = rows.map((r) => {
  const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  if (r.kind === 'single') {
    return '\t\t{k:"' + r.key + '",c:"' + esc(r.cat) + '",i:"' + esc(r.ico) + '",l:"' + esc(r.label) +
      '",d:"' + esc(r.desc) + '",f:"' + r.field + '",g:' + r.goal + ',r:' + r.reward + '}';
  }
  if (r.kind === 'combo') {
    const all = r.all.map((c) => '["' + c.field + '",' + c.goal + ']').join(',');
    return '\t\t{k:"' + r.key + '",c:"' + esc(r.cat) + '",i:"' + esc(r.ico) + '",l:"' + esc(r.label) +
      '",d:"' + esc(r.desc) + '",a:[' + all + '],r:' + r.reward + '}';
  }
  const q = r.ratio;
  return '\t\t{k:"' + r.key + '",c:"' + esc(r.cat) + '",i:"' + esc(r.ico) + '",l:"' + esc(r.label) +
    '",d:"' + esc(r.desc) + '",p:["' + q.num + '","' + q.den + '",' + q.minDen + ',' + q.goal + '],r:' + r.reward + '}';
});

const block = [
  BEGIN,
  '\t/* 生涯扩容：全部基于 buildStats 已有的真实字段，不新增采集、不新增存档键。',
  '\t   生成器 tools/achv_scale/gen_career_expand.mjs；本块由 apply_career_expand.mjs 整块替换。',
  '\t   三种判定：',
  '\t     f/g  单字段达到阈值（与既有 statProg 同构）',
  '\t     a    多字段同时达标（组合挑战，"富且贵"这类）',
  '\t     p    比率 + 最小样本量（防止 1 战 1 胜 = 100% 胜率这类永真条件） */',
  '\t(function careerExpand(){',
  '\t\tvar ROWS = [',
  lines.join(',\n'),
  '\t\t];',
  '\t\tvar seen = Object.create(null);',
  '\t\tfor (var i = 0; i < defs.length; i++) seen[defs[i].key] = 1;',
  '\t\tfunction num(s, k) { return Number(s[k]) || 0; }',
  '\t\tfor (var j = 0; j < ROWS.length; j++) {',
  '\t\t\t(function (row) {',
  '\t\t\t\tif (seen[row.k]) return;',
  '\t\t\t\tseen[row.k] = 1;',
  '\t\t\t\tvar prog;',
  '\t\t\t\tif (row.f) {',
  '\t\t\t\t\tprog = statProg(row.f, row.g);',
  '\t\t\t\t} else if (row.a) {',
  '\t\t\t\t\tprog = (function (all) {',
  '\t\t\t\t\t\treturn function (s) {',
  '\t\t\t\t\t\t\tfor (var t = 0; t < all.length; t++) if (num(s, all[t][0]) < all[t][1]) return [0, 1];',
  '\t\t\t\t\t\t\treturn [1, 1];',
  '\t\t\t\t\t\t};',
  '\t\t\t\t\t})(row.a);',
  '\t\t\t\t} else {',
  '\t\t\t\t\tprog = (function (p) {',
  '\t\t\t\t\t\tvar nk = p[0], dk = p[1], minDen = p[2], goal = p[3];',
  '\t\t\t\t\t\treturn function (s) {',
  '\t\t\t\t\t\t\tvar den = num(s, dk);',
  '\t\t\t\t\t\t\t/* 样本不足时进度归零：显示"还需多少局"而不是虚高比率 */',
  '\t\t\t\t\t\t\tif (den < minDen) return [0, 1];',
  '\t\t\t\t\t\t\t/* 不能截断到 1：局均击杀这类目标的阈值本来就大于 1，',
  '\t\t\t\t\t\t\t   截断会让它永远达不到。显示层 evalAll 会做 min(cur, goal)。 */',
  '\t\t\t\t\t\t\treturn [num(s, nk) / den, goal];',
  '\t\t\t\t\t\t};',
  '\t\t\t\t\t})(row.p);',
  '\t\t\t\t}',
  '\t\t\t\tpush(row.k, row.c, row.i, row.l, row.d, prog, row.r);',
  '\t\t\t})(ROWS[j]);',
  '\t\t}',
  '\t\t/* 索引重建（必须）：byKey 在本文件 486 行按当时的 defs 建好，',
  '\t\t   新增条目只进了 defs 没进索引的话，byId(key) 会返回 null ——',
  '\t\t   宿主侧 shell-ach-claim 复核定义时直接找不到这条，领奖会静默失败。 */',
  '\t\tfor (var b = 0; b < defs.length; b++) byKey[defs[b].key] = defs[b];',
  '\t})();',
  END,
].join('\n');

if (src.includes(BEGIN) && src.includes(END)) {
  const start = src.indexOf(BEGIN);
  const stop = src.indexOf(END) + END.length;
  src = src.slice(0, start) + block + src.slice(stop);
} else {
  const anchor = 'root.CSH_ACHV = {';
  const at = src.indexOf(anchor);
  if (at < 0) { console.error('未找到插入锚点 root.CSH_ACHV'); process.exit(2); }
  const lineStart = src.lastIndexOf('\n', at) + 1;
  src = src.slice(0, lineStart) + block + '\n' + src.slice(lineStart);
}

fs.writeFileSync(target, src);
console.log(JSON.stringify({ target, rows: rows.length }, null, 2));
