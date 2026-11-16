/* 皮肤「恢复经典」桥链路真值探针（2026-11-16 F2）
 *
 * 背景：作者截图显示点「恢复经典」后提示「装扮保存尚未确认，当前画面未改变」，
 * 但既有 6 个装扮探针只测模块层 S.select，从未走 页面→桥→宿主钱包 的完整链路。
 * 本探针用真实 csh_wallet.js + csh_spirit_skins.js + 从 csh_shell.js AST 抽取的
 * unlockSkin 函数体，模拟「已解锁 s2 且当前使用 s2 → 恢复 classic」，读取真实 reason。
 *
 * 用法：node tools/probe_skin_restore_bridge_20261116.mjs [--out <dir>] | --gate
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { root, parse, walk } from './lib/skill_audit.mjs';

const arg = (n, f) => { const i = process.argv.indexOf(n); return i < 0 ? f : process.argv[i + 1]; };
const out = arg('--out');
if (!out && !process.argv.includes('--gate')) throw Error('Use --out <dir> or --gate');
if (out) fs.mkdirSync(out, { recursive: true });

const clean = s => s.replace(/^import .*?;.*\r?\n/gm, '');
const src = name => fs.readFileSync(path.join(root, 'core', name), 'utf8');

/* 从真实 shell 源码抽取 unlockSkin 函数体（AST，不复制逻辑） */
const shellSrc = src('csh_shell.js');
let unlockFn = null, skinPrefsFn = null;
walk(parse(shellSrc), n => {
  if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'unlockSkin') unlockFn = shellSrc.slice(...n.range);
  if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'skinPrefs') skinPrefsFn = shellSrc.slice(...n.range);
});
if (!unlockFn || !skinPrefsFn) throw Error('真实 unlockSkin/skinPrefs 未找到，探针失效');

function storage(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data, failKey: '', writes: 0,
    get length() { return data.size; }, key(i) { return [...data.keys()][i] ?? null; },
    getItem(k) { if (k === this.failKey) throw Error('injected read failure: ' + k); return data.get(k) ?? null; },
    removeItem(k) { data.delete(k); },
    setItem(k, v) { if (k === this.failKey && !this.failAfter) throw Error('injected write failure: ' + k); data.set(k, String(v)); this.writes++; },
  };
}

/* 真正装载：wallet + 装扮模块 + unlockSkin，callback 走桥的 ack */
function bridge(seed = {}) {
  const store = storage(seed);
  const ctx = vm.createContext({
    localStorage: store, crypto: webcrypto, TextEncoder, TextDecoder, btoa, atob,
    lib: { config: {}, configprefix: 'probe_', skill: {}, translate: {} },
    game: { saveConfig() {}, addGlobalSkill() {} }, ui: {}, get: {}, ai: {}, _status: {},
    console: { log() {}, warn() {}, error() {} },
    window: { CSH: {}, addEventListener() {}, localStorage: store },
    document: { addEventListener() {} },
    setTimeout(fn) { return 0; }, clearTimeout() {},
  });
  for (const f of ['csh_wallet.js', 'csh_achv.js', 'csh_migrate.js']) vm.runInContext(clean(src(f)), ctx, { filename: f });
  /* 生产宿主把 wallet 子对象的方法合并到 lib.cshWallet 顶层（shell 的 wallet() 返回顶层），
     VM 复现这一形态，否则会假报 nomodule。 */
  vm.runInContext('Object.assign(lib.cshWallet, lib.cshWallet.wallet);', ctx);
  vm.runInContext(clean(src('csh_spirit_skins.js')), ctx, { filename: 'csh_spirit_skins.js' });
  vm.runInContext(`function wallet(){return lib.cshWallet;}
    function logError(){}
    ${skinPrefsFn}
    ${unlockFn}
    this.S=window.CSHSpiritSkins;this.W=lib.cshWallet.wallet;this.unlockSkin=unlockSkin;`, ctx);
  return {
    ctx, store, S: ctx.S, W: ctx.W,
    disk() { return JSON.parse(store.getItem('csh_wallet') || '{}'); },
    skinPrefs() { return this.W.spiritSkinsSaved(); },
    /* unlockSkin 内部读 skinPrefs()，而 skinPrefs 在 shell 里读钱包 —— 这里对齐 */
    call(id, skin) {
      const before = this.W.pc();
      const deps = vm.runInContext('({hasS:!!window.CSHSpiritSkins,hasW:!!wallet(),hasCommit:!!(wallet()&&wallet().commitSpiritSkins),hasPrepare:!!(window.CSHSpiritSkins&&window.CSHSpiritSkins.prepareSelect),keys:wallet()?Object.keys(wallet()).filter(k=>/commit|Saved|skin/i.test(k)):[]})', ctx);
      const result = ctx.unlockSkin(id, skin);
      return { result, balanceBefore: before, balanceAfter: this.W.pc() };
    },
  };
}

const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });

const ID = 'csh_boss_minion_ciri';
const S2 = { v: 2, selected: { [ID]: 's2' }, unlocked: { [ID]: { s1: 1, s2: 1 } } };

/* 场景 1：已解锁并使用 s2 → 恢复 classic（截图场景） */
{
  const b = bridge();
  b.W.add(1_000_000, 'fixture');
  const baseline = b.W.pc();
  const committed = b.W.commitSpiritSkins(S2, 0, 'fixture 预置 s2');
  check('预置：s2 已解锁并使用、钱包写入成功', committed.ok && b.skinPrefs().selected[ID] === 's2', { committed, baseline, prefs: b.skinPrefs() });
  const r = b.call(ID, 'classic');
  check('恢复 classic：桥返回 ok（非 poor / 非 save 拒绝）', r.result && r.result.ok === true, r.result);
  check('恢复 classic：余额一分不变（不误扣 1 万）', r.balanceAfter === r.balanceBefore, r);
  check('恢复 classic：钱包权益里 selected[id] 已删除', (() => { const p = b.skinPrefs(); return !p.selected[ID]; })(), b.skinPrefs());
  check('恢复 classic：skinOf 回经典', b.S.skinOf(ID, b.store).id === 'classic', b.S.skinOf(ID, b.store));
}

/* 场景 2：桥应答必须带 state 字段，否则页面 accept() 的成功分支不认 */
{
  const b = bridge();
  b.W.add(1_000_000, 'fixture');
  b.W.commitSpiritSkins(S2, 0, 'fixture');
  const r = b.call(ID, 'classic');
  check('桥应答带 state（页面 accept 成功分支的硬条件）', r.result && !!r.result.state, r.result);
  check('桥应答 state 可被 CSHSpiritSkins.resolve 解析为 classic', (() => {
    try { return b.S.resolve(ID, 'classic.webp', b.store, r.result.state).skin.id === 'classic'; } catch (e) { return false; }
  })(), r.result && r.result.state);
}

/* 场景 3：存档被迁移锁住 → 明确 reason，不应笼统「尚未确认」 */
{
  const b = bridge();
  b.W.add(1_000_000, 'fixture');
  b.W.commitSpiritSkins(S2, 0, 'fixture');
  b.store.setItem('csh_migrate_recovery', '{}');
  const r = b.call(ID, 'classic');
  check('存档锁住时返回可识别 reason（非笼统失败）', r.result && r.result.ok === false && typeof r.result.reason === 'string' && r.result.reason.length > 0, r.result);
  check('存档锁住时余额与权益不变', r.balanceAfter === r.balanceBefore && b.skinPrefs().selected[ID] === 's2', r);
}

/* ---------- UI 层：失败提示不得折叠掉宿主给出的真实 reason（截图 BUG 根因） ---------- */
const codexHtml = fs.readFileSync(path.join(root, 'games/codex.html'), 'utf8');
const acceptBody = (codexHtml.match(/function accept\(id\)\{[\s\S]*?\n  \}/) || [''])[0];
check('页面失败提示显示宿主真实 reason，不再一律「尚未确认」',
  /res\.reason/.test(acceptBody) && /res\.recovery/.test(acceptBody) &&
  !/res&&res\.reason==="poor"\?[^:]+:"装扮保存尚未确认/.test(acceptBody), acceptBody.slice(-360));
check('恢复经典仍走 accept("classic") 且零扣款通道不变',
  /restore\.onclick=function\(\)\{if\(accept\("classic"\)\)/.test(codexHtml) &&
  /var selected = S\.prepareSelect\(id, skinId, current\)/.test(unlockFn));

const result = {
  scope: '皮肤恢复经典：页面→桥→宿主钱包完整链路（真实 wallet + unlockSkin AST）',
  passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed).length, rows,
};
if (out) fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
