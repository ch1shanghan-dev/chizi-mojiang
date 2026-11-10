/* 音效名与配方表的一一对应（2026-11-10）
 *
 * 为什么需要它：页面上 `sfxPlay('uno.wild')` 这类调用点全是
 *   `if (SFX) { try { SFX.play(name) } catch (e) {} }`
 * —— 名字在 RECIPES/ALIAS 里查不到时，bus 只是 `lastError="unknown:..."` 然后 return false，
 * 既没有异常也不会进任何门禁。结果是 UNO 的摸牌/反转/跳过/变色/罚牌与斗地主的
 * 顺子/王炸/飞机**从上线起一直静音**，4.0.13 的记录还写着"已完成"。
 * 本探针把「页面里调用的每个名字都必须能解析」变成硬约束，并检查新增配方的参数合理
 * （层数、单层峰值、时长），防止为了消红随手塞一个 0.5 秒大音量。
 *
 * 用法：node tools/probe_sfx_names_20261110.mjs [--out <dir>]
 * stdout 纯 JSON：{passed, failed, failures, output}
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditTempRoot } from './lib/audit_scratch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(auditTempRoot(), 'sfx-names')));
fs.mkdirSync(out, { recursive: true });
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });

const src = read('core/csh_sfx.js');

/* ---------- 解析配方与别名（与 resolveName 同口径：RECIPES 精确名 → ALIAS 别名） ---------- */
const recipeKeys = new Set([...src.matchAll(/^\s*"([a-zA-Z0-9._-]+)"\s*:\s*\[/gm)].map(m => m[1]));
const aliasBlock = src.slice(src.indexOf('var ALIAS'), src.indexOf('};', src.indexOf('var ALIAS')));
const alias = new Set([...aliasBlock.matchAll(/([a-zA-Z0-9._-]+)\s*:\s*"[a-zA-Z0-9._-]+"/g)].map(m => m[1]));

/* ---------- 页面里真实调用的名字 ---------- */
const gamesDir = path.join(root, 'games');
const walk = (dir, acc = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (e.name.endsWith('.html')) acc.push(p);
  }
  return acc;
};
const used = new Map();
for (const f of walk(gamesDir)) {
  const txt = fs.readFileSync(f, 'utf8');
  for (const m of txt.matchAll(/sfxPlay\(\s*'([^']+)'/g)) {
    if (!used.has(m[1])) used.set(m[1], new Set());
    used.get(m[1]).add(path.relative(root, f).replace(/\\/g, '/'));
  }
}
check('页面里有调用点', used.size >= 20, used.size);

const unresolved = [...used.keys()].filter(n => !recipeKeys.has(n) && !alias.has(n)).sort();
check('每个被调用的名字都能解析（不再有静默丢弃）', unresolved.length === 0,
  unresolved.map(n => `${n} ← ${[...used.get(n)].join(',')}`));

/* 本次补的 8 个必须真的在表里，且不是靠别名糊过去（要各自有音色） */
const NEW8 = ['uno.draw', 'uno.reverse', 'uno.skip', 'uno.wild', 'uno.penalty', 'ddz.straight', 'ddz.plane', 'ddz.rocket'];
const missingNew = NEW8.filter(n => !recipeKeys.has(n));
check('八个新配方都在 RECIPES 里（不是登记别名）', missingNew.length === 0, missingNew);

/* ---------- 新增配方的参数边界：不许为了消红塞大音量/长尾音 ---------- */
const layerRe = /"(uno\.(?:draw|reverse|skip|wild|penalty)|ddz\.(?:straight|plane|rocket))"\s*:\s*\[([^\]]*)\]/g;
const badParams = [];
let seen = 0;
for (const m of src.matchAll(layerRe)) {
  seen++;
  const body = m[2];
  const tl = [...body.matchAll(/T\(([^)]*)\)/g)].map(x => x[1].split(',').map(s => s.trim()));
  const nl = [...body.matchAll(/N\(([^)]*)\)/g)].map(x => x[1].split(',').map(s => s.trim()));
  const layers = tl.length + nl.length;
  if (layers < 1 || layers > 4) badParams.push([m[1], 'layers', layers]);
  for (const a of tl) {                       // T(f0,type,dur,peak,delay,f1)
    if (Number(a[2]) <= 0 || Number(a[2]) > 0.4) badParams.push([m[1], 'T.dur', a[2]]);
    if (Number(a[3]) > 0.12) badParams.push([m[1], 'T.peak', a[3]]);
  }
  for (const a of nl) {                       // N(dur,hz,q,peak,delay,hz1,filter)
    if (Number(a[0]) <= 0 || Number(a[0]) > 0.4) badParams.push([m[1], 'N.dur', a[0]]);
    if (Number(a[3]) > 0.12) badParams.push([m[1], 'N.peak', a[3]]);
  }
}
check('八个新配方都能被解析到（层数 1–4）', seen === 8 && badParams.length === 0, { seen, badParams });

/* ---------- 回归保护：已有的高频道不许被这次改动挤掉 ---------- */
for (const must of ['card.play', 'card.deal', 'chip.bet', 'settle.push', 'win', 'lose']) {
  check(`既有配方 ${must} 仍在`, recipeKeys.has(must));
}

const failures = rows.filter(r => !r.passed);
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ rows, usedNames: used.size, recipes: recipeKeys.size, aliases: alias.size }, null, 2));
console.log(JSON.stringify({ passed: rows.length - failures.length, failed: failures.length, failures, output: out }, null, 2));
process.exitCode = failures.length ? 1 : 0;
