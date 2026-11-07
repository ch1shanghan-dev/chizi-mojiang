/* 德州补码未决事务（D2 后续）· 门禁反例（2026-11-07）
 *
 * 真值：core/csh_topup_journal.js（真实模块在 vm 内）、core/csh_shell.js /
 *       games/texas/texas.html / core/csh_migrate.js 的静态接线断言。
 * 核心不变量：扣款写盘失败后重启，钱包余额没扣 → **绝不能退款**（否则白送钱）；
 *            只有 pc === balanceBefore - amount 才说明扣款已持久化、需要退回。
 * stdout 纯 JSON（B12 契约）；--out 可另存逐项结果。
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const src = fs.readFileSync(root + '/core/csh_topup_journal.js', 'utf8');
const shell = fs.readFileSync(root + '/core/csh_shell.js', 'utf8');
const html = fs.readFileSync(root + '/games/texas/texas.html', 'utf8');
const migrate = fs.readFileSync(root + '/core/csh_migrate.js', 'utf8');

function load(source) {
  const ctx = vm.createContext({ window: {}, Object, Array, JSON, Math, Number, String, Date, Error,
    console: { log() {}, warn() {}, error() {} } });
  vm.runInContext(source, ctx);
  return ctx.window.CSHTopUpJournal;
}
const J = load(src);
if (!J) throw Error('CSHTopUpJournal not mounted');

const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(!ok && detail !== undefined ? { detail } : {}) });

/* 可控存储：写失败 / 写回不一致 / 清除失败。 */
function makeStorage() {
  const data = new Map();
  const flags = { failSet: false, mismatch: false, failRemove: false, sets: 0, removes: 0 };
  const st = {
    flags,
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem(k, v) {
      flags.sets++;
      if (flags.failSet) throw Error('quota');
      data.set(k, flags.mismatch ? String(v) + 'x' : String(v));
    },
    removeItem(k) { flags.removes++; if (flags.failRemove) return; data.delete(k); },
    raw: () => data.get(J.KEY),
    putRaw: v => { if (v == null) data.delete(J.KEY); else data.set(J.KEY, String(v)); },
  };
  return st;
}
function makeWallet(pc, opts) {
  let value = pc; const calls = []; opts = opts || {};
  return {
    calls,
    pc: () => value,
    add: (n, reason) => { calls.push([n, reason]); if (opts.rejectAdd) return false; value += n; if (opts.badAdd) value -= n; return n; },
    set: v => { value = v; },
  };
}
const E = (id, amount, balanceBefore, phase) => ({ v: 1, phase: phase || 'prepared', id, amount, balanceBefore, t: 1700000000000 });
const ID = 'tu-test-00000001';

/* ---------- 模块边界 ---------- */
check('模块挂载、版本、KEY、导出冻结', J.VERSION === 1 && J.KEY === 'csh_topup_pending_v1' && Object.isFrozen(J) &&
  ['read', 'prepare', 'commit', 'abort', 'recover'].every(k => typeof J[k] === 'function'));
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
check('事务模块不碰 CBY 账本 / 结算 / 发牌', !/\bsettle\s*\(|\bclaim\s*\(|\bshuffle\b|\bdeck\b|\bCBY\b/.test(code));

/* ---------- prepare ---------- */
{
  const s = makeStorage();
  const r = J.prepare(s, { id: ID, amount: 40, balanceBefore: 1000, t: 1700000000000 });
  check('prepare 同步落盘 prepared 凭据并读回确认', r.ok === true && !r.already && !!s.raw());
  const d = J.read(s);
  check('凭据字段完整（含 balanceBefore 与 phase）',
    d.phase === 'prepared' && d.id === ID && d.amount === 40 && d.balanceBefore === 1000 && d.t === 1700000000000, d);
  check('同 id 幂等，不覆盖已有凭据', J.prepare(s, { id: ID, amount: 40, balanceBefore: 1000 }).already === true);
  check('存在别的未决事务时拒绝', J.prepare(s, { id: 'tu-other-00000002', amount: 20, balanceBefore: 1000 }).ok === false);
}
{
  const s = makeStorage(); s.flags.failSet = true;
  check('凭据写失败 → prepare 失败（宿主据此不扣款、不上桌）', J.prepare(s, { id: ID, amount: 40, balanceBefore: 1000 }).ok === false);
}
{
  const s = makeStorage(); s.flags.mismatch = true;
  check('凭据写回不一致 → prepare 失败', J.prepare(s, { id: ID, amount: 40, balanceBefore: 1000 }).ok === false);
}
for (const bad of [null, {}, { id: 'x', amount: 40, balanceBefore: 1000 },
  { id: ID, amount: 0, balanceBefore: 1000 }, { id: ID, amount: -20, balanceBefore: 1000 },
  { id: ID, amount: 40, balanceBefore: 39 }, { id: ID, amount: NaN, balanceBefore: 1000 }]) {
  const s = makeStorage();
  check('非法 prepare 参数 ' + JSON.stringify(bad) + ' 被拒绝且不落盘', J.prepare(s, bad).ok === false && !s.raw());
}
{
  const s = makeStorage(); s.putRaw('{broken');
  check('损坏凭据下 prepare 拒绝且不覆盖', J.prepare(s, { id: ID, amount: 40, balanceBefore: 1000 }).ok === false && s.raw() === '{broken');
}

/* ---------- commit / abort ---------- */
{
  const s = makeStorage(); J.prepare(s, { id: ID, amount: 40, balanceBefore: 1000, t: 1 });
  check('commit 清除自己的凭据并读回确认', J.commit(s, ID).ok === true && !s.raw());
  check('无凭据时 commit 幂等返回 already', J.commit(s, ID).already === true);
}
{
  const s = makeStorage(); J.prepare(s, { id: ID, amount: 40, balanceBefore: 1000, t: 1 });
  check('迟到 / 伪造 commit 的 id 不符时绝不清别人凭据', J.commit(s, 'tu-stale-00000003').ok === false && !!s.raw());
}
{
  const s = makeStorage(); J.prepare(s, { id: ID, amount: 40, balanceBefore: 1000, t: 1 });
  s.flags.failRemove = true;
  check('凭据清除失败时 commit 如实失败（留待启动恢复）', J.commit(s, ID).ok === false && !!s.raw());
}
{
  const s = makeStorage(); J.prepare(s, { id: ID, amount: 40, balanceBefore: 1000, t: 1 });
  check('扣款失败 abort 清凭据且不动钱', J.abort(s, ID).ok === true && !s.raw());
  check('abort 无凭据幂等', J.abort(s, ID).already === true);
  J.prepare(s, { id: ID, amount: 40, balanceBefore: 1000, t: 1 });
  check('abort id 不符不清凭据', J.abort(s, 'tu-stale-00000004').ok === false && !!s.raw());
}

/* ---------- recover：核心不变量 ---------- */
{
  const s = makeStorage();
  check('无凭据时恢复为零退款', J.recover(s, makeWallet(1000)).refunded === 0);
}
{
  const s = makeStorage(); s.putRaw(JSON.stringify(E(ID, 40, 1000)));
  const w = makeWallet(960);   /* 扣款已持久化 */
  const r = J.recover(s, w);
  check('扣款已持久化（pc=balanceBefore-amount）→ 幂等退款并清凭据',
    r.refunded === 40 && w.pc() === 1000 && !s.raw(), { r, pc: w.pc() });
  check('退款理由走既定文案', /德州补码未决退款/.test(String(w.calls[0] && w.calls[0][1])));
}
{
  const s = makeStorage(); s.putRaw(JSON.stringify(E(ID, 40, 1000)));
  const w = makeWallet(1000);  /* 钱包写盘失败，扣款没持久化 */
  const r = J.recover(s, w);
  check('★ 扣款未持久化（pc=balanceBefore）→ 绝不退款，不白送钱',
    r.refunded === 0 && w.pc() === 1000 && w.calls.length === 0 && !s.raw(), { r, pc: w.pc(), calls: w.calls });
}
{
  const s = makeStorage(); s.putRaw(JSON.stringify(E(ID, 40, 1000)));
  const w = makeWallet(1234);  /* 期间有其他收支 */
  const r = J.recover(s, w);
  check('余额已变化无法判断 → 保守不退款并清凭据', r.refunded === 0 && w.calls.length === 0 && !s.raw(), r);
}
{
  const s = makeStorage(); s.putRaw(JSON.stringify(E(ID, 40, 1000, 'refunding')));
  const w = makeWallet(1000);  /* 上次退款已生效 */
  const r = J.recover(s, w);
  check('refunding 中断后已完成退款 → 不重复退', r.refunded === 0 && w.calls.length === 0 && !s.raw(), r);
}
{
  const s = makeStorage(); s.putRaw(JSON.stringify(E(ID, 40, 1000, 'refunding')));
  const w = makeWallet(960);   /* 标记了 refunding 但 add 没生效 */
  const r = J.recover(s, w);
  check('refunding 中断且退款未生效 → 补退一次', r.refunded === 40 && w.pc() === 1000 && !s.raw(), { r, pc: w.pc() });
}
{
  const s = makeStorage(); s.putRaw(JSON.stringify(E(ID, 40, 1000)));
  const w = makeWallet(960, { rejectAdd: true });
  const r = J.recover(s, w);
  check('退款被拒 → 保留 refunding 凭据待重试，不吞钱',
    r.refunded === 0 && !!s.raw() && J.read(s).phase === 'refunding', r);
}
{
  const s = makeStorage(); s.putRaw(JSON.stringify(E(ID, 40, 1000)));
  const w = makeWallet(960, { badAdd: true });
  const r = J.recover(s, w);
  check('退款读回不一致 → 保留凭据待重试', r.refunded === 0 && !!s.raw(), r);
}
for (const raw of ['{broken', '{}', JSON.stringify({ v: 2, phase: 'prepared', id: ID, amount: 40, balanceBefore: 1000, t: 1 }),
  JSON.stringify({ v: 1, phase: 'hacked', id: ID, amount: 40, balanceBefore: 1000, t: 1 }),
  JSON.stringify({ v: 1, phase: 'prepared', id: ID, amount: -40, balanceBefore: 1000, t: 1 }),
  JSON.stringify({ v: 1, phase: 'prepared', id: 'x', amount: 40, balanceBefore: 1000, t: 1 })]) {
  const s = makeStorage(); s.putRaw(raw);
  const w = makeWallet(960);
  const r = J.recover(s, w);
  check('篡改 / 损坏凭据 ' + raw.slice(0, 24) + ' → 清键且不退款',
    r.refunded === 0 && w.calls.length === 0 && !s.raw() && /损坏|清除/.test(r.reason), r);
}
{
  /* 正常事务链：prepare → 扣款 → 上桌 → commit → 重启无残留 */
  const s = makeStorage(), w = makeWallet(1000);
  J.prepare(s, { id: ID, amount: 40, balanceBefore: w.pc(), t: 1 });
  w.set(960);
  J.commit(s, ID);
  check('正常链：commit 后重启恢复零退款', J.recover(s, w).refunded === 0 && !s.raw());
}
{
  /* 进程中断链：prepare → 扣款已持久化 → 页面没上桌 → 重启退款 */
  const s = makeStorage(), w = makeWallet(1000);
  J.prepare(s, { id: ID, amount: 40, balanceBefore: w.pc(), t: 1 });
  w.set(960);
  check('中断链：未收到 commit 时重启退回扣款', J.recover(s, w).refunded === 40 && w.pc() === 1000 && !s.raw());
}
{
  /* 进程中断链：prepare → 钱包写盘失败 → 重启不退款 */
  const s = makeStorage(), w = makeWallet(1000);
  J.prepare(s, { id: ID, amount: 40, balanceBefore: w.pc(), t: 1 });
  check('中断链：钱包没扣款时重启不退款', J.recover(s, w).refunded === 0 && w.pc() === 1000 && w.calls.length === 0 && !s.raw());
}

/* ---------- 静态接线断言 ---------- */
check('宿主扣款前 prepare、失败 abort、启动 setTimeout 恢复',
  /TJ\.prepare\(TS, \{ id: txId, amount: amt, balanceBefore: pcBefore/.test(shell) &&
  /TJ\.abort\(TS, txId\)/.test(shell) && /setTimeout\(function \(\) \{ recoverTopUp\(\); \}, 0\)/.test(shell));
check('宿主 ACK 带 txId、提供 commit 命令且列入写保护',
  /txId: txId, balance/.test(shell) && /cmd === "shell-topup-commit"/.test(shell) &&
  /"shell-topup", "shell-topup-commit"/.test(shell));
check('凭据模块缺失时宿主拒绝补码（不静默降级）', /补码事务未就绪，桌面筹码未变/.test(shell));
check('启动恢复只跑一次（topUpRecovered 标志）', /if\(topUpRecovered\)return null;topUpRecovered=true;/.test(shell));
check('页面要求 txId、上桌后发 commit', /!data\.txId/.test(html) && /Bridge\.topUpCommit\(data\.txId,function\(\)\{\}\)/.test(html));
check('新本机键已登记进 csh_migrate EXCLUDED', /\["csh_topup_pending_v1",/.test(migrate));

/* ---------- 自检：去掉「扣款未持久化不退款」必须判红 ---------- */
const anchor = "    if (alreadyRefunded) {\n      try { clear(storage); } catch (_e) {}\n      return { refunded: 0, reason: d.phase === 'refunding' ? '上次退款已完成' : '扣款未持久化，无需退款' };\n    }";
if (!src.includes(anchor)) throw Error('negative-baseline anchor changed');
const badJ = load(src.replace(anchor, '    /* removed: no-persist guard */'));
const beforeRows = [];
const bcheck = (name, ok) => beforeRows.push({ name, passed: !!ok });
{
  const s = makeStorage(); s.putRaw(JSON.stringify(E(ID, 40, 1000)));
  const w = makeWallet(1000);
  const r = badJ.recover(s, w);
  bcheck('扣款未持久化时绝不白送钱', r.refunded === 0 && w.calls.length === 0);
  bcheck('正常退款仍工作', (() => { const s2 = makeStorage(); s2.putRaw(JSON.stringify(E(ID, 40, 1000))); const w2 = makeWallet(960); return badJ.recover(s2, w2).refunded === 40; })());
  bcheck('篡改凭据仍不退款', (() => { const s3 = makeStorage(); s3.putRaw('{broken'); const w3 = makeWallet(960); return badJ.recover(s3, w3).refunded === 0; })());
}
const beforeFailed = beforeRows.filter(r => !r.passed).length;
check('改前实现（无条件退款）能被断言集检出 >= 1 条红', beforeFailed >= 1,
  { beforeFailed, red: beforeRows.filter(r => !r.passed).map(r => r.name) });

const result = {
  scope: 'real CSHTopUpJournal in vm with controllable storage/wallet; prepare/commit/abort/recover state machine + static shell/page/migrate wiring; not natural games',
  passed: rows.filter(r => r.passed).length,
  failed: rows.filter(r => !r.passed).length,
  failures: rows.filter(r => !r.passed),
  beforeBaselineFailed: beforeFailed,
  beforeBaselineRed: beforeRows.filter(r => !r.passed).map(r => r.name),
};
const out = arg('--out', null);
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ ...result, rows }, null, 2));
}
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
