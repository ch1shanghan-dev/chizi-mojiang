/* 音效名 ↔ 运行时配方真值（2026-11-10 建，2026-11-11 **口径纠偏**）
 *
 * 为什么要重写：旧版只用一个静态正则扫 `var RECIPES = {...}` 里的双引号键，
 * 判「页面调用名能否解析」。但 core/csh_sfx.js 在 RECIPES 定义之后还有一段
 *   Object.assign(RECIPES, { 'uno.wild': [...], ... })   // 纸牌声音第二版
 * 用的是**单引号**，静态正则扫不到；而 resolveName() 运行时查的正是被它覆盖后的
 * RECIPES。于是旧探针把「本来就能解析」误报成「从上线起静音」，并据此补了 8 条
 * 永远被覆盖的死配方 —— **探针绿了，产品行为其实一点没变**。
 *
 * 本版改为「运行时真值」口径：用 node:vm 加载真实的 csh_sfx.js（不建 AudioContext），
 * 直接问 bus.has() / bus.recipe()；再补一条静态断言把那 8 条死键钉死，
 * 防止有人照着旧误判再补一遍。改前基线（恢复 8 条死配方）本夹具会判红。
 *
 * 用法：node tools/probe_sfx_names_20261110.mjs [--out <dir>]
 * stdout 纯 JSON：{passed, failed, failures, output}
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { auditTempRoot } from './lib/audit_scratch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(auditTempRoot(), 'sfx-names')));
fs.mkdirSync(out, { recursive: true });
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });
/* 结果文件只是留档；临时目录偶发 EPERM 不该让门禁挂掉 */
function save(data) { try { fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(data, null, 2)); } catch (e) {} }

const src = read('core/csh_sfx.js');

/* ---------- 运行时真值：VM 里加载真实模块，一次也不建 AudioContext ---------- */
function loadBus() {
  const sandbox = {
    console,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { currentScript: null, hidden: false, addEventListener() {}, removeEventListener() {} },
    addEventListener() {}, removeEventListener() {},
    Math, Date, JSON, Error, Object, Array, String, Number, Boolean,
    parseInt, isNaN, parseFloat, setTimeout, clearTimeout
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'csh_sfx.js' });
  return sandbox.CSH_SFX;
}

let bus = null, loadErr = '';
try { bus = loadBus(); } catch (e) { loadErr = String(e && e.message); }
check('真实模块能在 VM 里加载并挂出 CSH_SFX', !!bus && typeof bus.has === 'function', loadErr);
if (!bus) { /* 后面的断言全部依赖 bus，直接产出结果，避免抛异常淹没 stdout */
	save({ rows, loadErr });
  console.log(JSON.stringify({ passed: rows.length - 1, failed: 1, failures: rows.filter(r => !r.passed), output: out }, null, 2));
  process.exitCode = 1;
} else {

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
  check('页面里至少有 20 个调用点', used.size >= 20, used.size);

  /* ---------- 核心：按运行时 resolveName 口径逐个问 bus ---------- */
  const unresolved = [...used.keys()].filter(n => !bus.has(n)).sort();
  check('页面调用名在运行时全部能解析（无静默丢弃）', unresolved.length === 0,
    unresolved.map(n => `${n} ← ${[...used.get(n)].join(',')}`));
  const runtimeKeys = new Set(bus.list());
  check('运行时配方表规模合理（≥40 键）', runtimeKeys.size >= 40, runtimeKeys.size);

  const N8 = ['uno.draw', 'uno.reverse', 'uno.skip', 'uno.wild', 'uno.penalty',
    'ddz.straight', 'ddz.plane', 'ddz.rocket'];
  check('8 个 UNO/斗地主动作名运行时都能解析', N8.every(n => bus.has(n)), N8.filter(n => !bus.has(n)));

  const emptyRecipe = N8.filter(n => { const r = bus.recipe(n); return !r || !r.length; });
  check('8 个名字运行时都有非空配方', emptyRecipe.length === 0, emptyRecipe);

  /* ---------- 运行时配方参数边界（不许为了消红塞大音量/长尾音） ---------- */
  const badParams = [];
  for (const n of N8) {
    const layers = bus.recipe(n) || [];
    if (layers.length < 1 || layers.length > 6) badParams.push([n, 'layers', layers.length]);
    for (const L of layers) {
      if (!(Number(L.dur) > 0) || Number(L.dur) > 0.5) badParams.push([n, 'dur', L.dur]);
      if (Number(L.peak) > 0.2) badParams.push([n, 'peak', L.peak]);
    }
  }
  check('8 个运行时配方参数在边界内（dur>0/≤0.5、peak≤0.2、层数 1–6）', badParams.length === 0, badParams);

  /* 指纹：uno.wild 的权威版本是第二版 N(.085,2000,.8,.065,0,3300) 起头，
     不是曾被误补、随后被删掉的 T(300,'sine',...) 死配方 */
  const wild0 = (bus.recipe('uno.wild') || [])[0] || {};
  check('运行时配方确实来自「纸牌声音第二版」覆盖表', wild0.k === 2 && wild0.hz === 2000,
    { k: wild0.k, hz: wild0.hz, f0: wild0.f0 });

  /* ---------- 静态：把历史误判的 8 条死键钉死 ----------
     红基线内置：仓库文件对命令行是只读的，外部覆盖做不了「改前判红」，
     于是把判据抽成函数，再注入一条死键变体验证它没退化成永远绿。 */
  const deadKeysOf = (source) => N8.filter(n => source.includes('"' + n + '": ['));
  const deadKeys = deadKeysOf(src);
  check('主 RECIPES 里不再有被 Object.assign 覆盖的 8 条死键', deadKeys.length === 0, deadKeys);
  const variant = src.replace('"win": [', '"uno.wild": [T(1, "sine", 0.01, 0.01)],\n\t\t"win": [');
  check('死键判据自检（注入一条重复键能检出，不是永远绿）', deadKeysOf(variant).length === 1,
    { injected: deadKeysOf(variant), current: deadKeys });
  const assignBlock = src.slice(src.indexOf('Object.assign(RECIPES'), src.indexOf('var voices'));
  const missingInSecond = N8.filter(n => !assignBlock.includes("'" + n + "'"));
  check('8 个名字的权威配方都在 Object.assign 第二版表里', missingInSecond.length === 0, missingInSecond);

  /* ---------- 回归保护：既有高频道与默认状态不许被改动 ---------- */
  for (const must of ['card.play', 'card.deal', 'chip.bet', 'settle.push', 'win', 'lose', 'bust', 'bj']) {
    check(`既有频道 ${must} 运行时仍可解析`, bus.has(must));
  }
  check('默认仍是开启、非静音、四档音量', bus.enabled() === true && bus.isMuted() === false &&
    JSON.stringify(bus.levels()) === '[0,30,60,100]', { enabled: bus.enabled(), muted: bus.isMuted(), levels: bus.levels() });
  check('recipe() 返回副本，改它不污染后续调用',
    (() => { const a = bus.recipe('card.deal'); if (!a) return false; a.length = 0; return (bus.recipe('card.deal') || []).length > 0; })());
  check('lastError 没有残留 unknown', !/unknown:/.test(bus.lastError()), bus.lastError());

  const failures = rows.filter(r => !r.passed);
	save({ rows, usedNames: used.size, runtimeKeys: runtimeKeys.size });
  console.log(JSON.stringify({ passed: rows.length - failures.length, failed: failures.length, failures, output: out }, null, 2));
  process.exitCode = failures.length ? 1 : 0;
}
