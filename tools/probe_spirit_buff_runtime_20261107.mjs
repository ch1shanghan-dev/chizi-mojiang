/* 妖灵增益运行态（S2）与接线 · 门禁反例（2026-11-07）
 *
 * 真值：core/csh_spirit_buffs.js（S1 只读表）、core/csh_spirit_buff_runtime.js（S2 运行态）、
 *       core/csh_aux_spirit.js（助战接线，静态断言）、docs/spirit-buff-draft.json（逐条对账）。
 * 边界：vm 内真模块；存储与钱包用可计数 stub，证明全程零调用。引擎技能触发点不属本轮，
 *       既有助战行为由 E95R（probe_aux_spirit.mjs 266/0）守住。
 * stdout 纯 JSON（B12 契约）；--out 可另存逐项结果。
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const buffSource = fs.readFileSync(root + '/core/csh_spirit_buffs.js', 'utf8');
const rtSource = fs.readFileSync(root + '/core/csh_spirit_buff_runtime.js', 'utf8');
const auxSource = fs.readFileSync(root + '/core/csh_aux_spirit.js', 'utf8');
const draft = JSON.parse(fs.readFileSync(root + '/docs/spirit-buff-draft.json', 'utf8'));
const draftRows = Array.isArray(draft) ? draft : (draft.buffs || draft.rows || []);
/* 注释里出现 CBY / localStorage 等名词属说明文字，不是写入调用；只扫代码体。 */
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const rtCode = stripComments(rtSource), buffCode = stripComments(buffSource);

let storageCalls = 0, walletCalls = 0;
function makeContext(order) {
  const storage = {
    getItem() { storageCalls++; return null; },
    setItem() { storageCalls++; },
    removeItem() { storageCalls++; },
  };
  const wallet = {
    spend() { walletCalls++; return false; },
    add() { walletCalls++; return 0; },
    settle() { walletCalls++; return null; },
    pc() { walletCalls++; return 0; },
  };
  const ctx = vm.createContext({
    window: {}, Object, Array, JSON, Math, String, Number, Boolean, Error,
    localStorage: storage, sessionStorage: storage, indexedDB: null,
    cshWallet: wallet, CSH: {},
    console: { log() {}, warn() {}, error() {} },
  });
  const parts = order === 'reverse' ? [rtSource, buffSource] : [buffSource, rtSource];
  for (const s of parts) vm.runInContext(s, ctx);
  return ctx;
}

const ctx = makeContext('normal');
const B = ctx.window.CSHSpiritBuffs, R = ctx.window.CSHSpiritBuffRuntime;
if (!B || !R) throw Error('spirit buff modules not mounted');

const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(!ok && detail !== undefined ? { detail } : {}) });
const byTemplate = {};
for (const b of B.list()) if (!byTemplate[b.template]) byTemplate[b.template] = b;
const TEMPLATES = Object.keys(B.TEMPLATES);
const sid = (t) => 's-' + t;

/* ---------- 模块边界 ---------- */
check('运行态模块挂载且版本为 1', R.VERSION === 1 && typeof R.begin === 'function' && typeof R.consume === 'function');
check('导出对象冻结，篡改不生效', Object.isFrozen(R));
const writePattern = /\blocalStorage\s*\.|\bsessionStorage\s*\.|\bindexedDB\b|\bcshWallet\b|\bclaim\s*\(|\bsettle\s*\(|\breward\b|\bCBY\b|\bsaveConfig\s*\(/;
check('运行态源码无落盘 / 经济 / 奖励写入路径', !writePattern.test(rtCode), (rtCode.match(writePattern) || [])[0]);
check('S1 数据层仍是纯只读（未被 S2 污染）', !writePattern.test(buffCode), (buffCode.match(writePattern) || [])[0]);
check('运行态对 50 条草案逐条对账', B.list().length === 50 && draftRows.length === 50 &&
  B.list().every(b => draftRows.some(d => d.id === b.id && d.template === b.template && d.magnitude === b.magnitude && d.perGame === b.perGame)));

/* ---------- 好感档位解锁 ---------- */
for (const lv of ['B', 'A', 'S']) {
  const s = R.begin({ sessionId: 'lv-' + lv, spiritId: byTemplate.T1_guard_damage.id, level: lv, epoch: 1 });
  check('好感 ' + lv + ' 解锁增益', !!s && s.active === true && s.template === 'T1_guard_damage', s && s.active);
}
for (const lv of ['D', 'C', 'Z', '', null, 5]) {
  const s = R.begin({ sessionId: 'lvx-' + String(lv), spiritId: byTemplate.T1_guard_damage.id, level: lv, epoch: 1 });
  check('好感 ' + String(lv) + ' 不解锁且不默认放行', !!s && s.active === false && R.consume(s.sessionId, 'T1_guard_damage', 'tk', 1).ok === false, s && s.active);
}
{
  const s = R.begin({ sessionId: 'unknown-spirit', spiritId: 'csh_boss_minion_not_real', level: 'S', epoch: 1 });
  check('未知妖灵 ID 不解锁', !!s && s.active === false && s.template === null);
}
{
  const saved = ctx.window.CSHSpiritBuffs;
  ctx.window.CSHSpiritBuffs = null;
  const s = R.begin({ sessionId: 'no-table', spiritId: byTemplate.T1_guard_damage.id, level: 'S', epoch: 1 });
  check('缺 S1 数据层时全部拒绝（延迟读取不默认放行）', !!s && s.active === false && R.consume(s.sessionId, 'T1_guard_damage', 'tk', 1).ok === false);
  ctx.window.CSHSpiritBuffs = saved;
}
{
  const rev = makeContext('reverse');
  const s = rev.window.CSHSpiritBuffRuntime.begin({ sessionId: 'reverse', spiritId: byTemplate.T2_draw_once.id, level: 'B', epoch: 1 });
  check('加载顺序颠倒（先运行态后数据层）仍正确', !!s && s.active === true && s.template === 'T2_draw_once');
}

/* ---------- S3：六类各一条「触发一次后不再触发」 ---------- */
for (const t of TEMPLATES) {
  const b = byTemplate[t], id = sid(t);
  if (!b) { check('模板 ' + t + ' 在数据层有对应妖灵', false); continue; }
  R.begin({ sessionId: id, spiritId: b.id, level: 'B', epoch: 1 });
  const first = R.consume(id, t, 'tok-' + t, 1);
  const second = R.consume(id, t, 'tok2-' + t, 1);
  check('模板 ' + t + ' 每局一次：首触成功、再触拒绝、计数恒为 1',
    first.ok === true && first.used === 1 && second.ok === false && second.reason === 'exhausted' && second.used === 1 &&
    R.snapshot(id).used[t] === 1,
    { first, second, used: R.snapshot(id).used[t] });
}
{
  const id = sid('T1_guard_damage');
  check('拿别的妖灵消费别的模板被拒绝', R.consume(id, 'T6_recover_once', 'bad', 1).reason === 'wrong-template');
  check('未知模板 / 原型键不放行且不抛错',
    R.consume(id, '__proto__', 'p', 1).ok === false && R.consume(id, 'toString', 'p2', 1).ok === false &&
    R.consume(id, null, 'p3', 1).ok === false);
  check('非字符串 sessionId / 空 token 不崩溃',
    R.consume(null, 'T1_guard_damage', 'x', 1).ok === false &&
    R.consume(42, 'T1_guard_damage', 'x', 1).ok === false);
}

/* ---------- 迟到回调 / 关闭重开 / 换档 ---------- */
{
  const id = 'late', t = 'T3_hand_cap';
  R.begin({ sessionId: id, spiritId: byTemplate[t].id, level: 'B', epoch: 7 });
  const a = R.consume(id, t, 'same-token', 7);
  const b = R.consume(id, t, 'same-token', 7);
  check('同一 token 的迟到回调返回首次结论且不改已消耗次数',
    a.ok === true && b.ok === true && b.repeated === true && b.used === 1 && R.snapshot(id).used[t] === 1, { a, b });
  const c = R.consume(id, t, 'other-token', 7);
  check('迟到回调耗尽后再触仍拒绝', c.ok === false && c.reason === 'exhausted' && R.snapshot(id).used[t] === 1);
  const stale = R.consume(id, t, 'stale-epoch', 8);
  check('旧存档代次的迟到回包被隔离且不计次', stale.ok === false && stale.reason === 'epoch-changed' && R.snapshot(id).used[t] === 1, stale);
}
{
  const id = 'reopen', t = 'T4_distance';
  R.begin({ sessionId: id, spiritId: byTemplate[t].id, level: 'B', epoch: 3 });
  R.consume(id, t, 'k', 3);
  const again = R.begin({ sessionId: id, spiritId: byTemplate[t].id, level: 'C', epoch: 3 });
  check('关闭 / 重开状态面板不重置：同 sessionId 复用原会话',
    !!again && again.used[t] === 1 && again.level === 'B' && again.active === true, again);
  check('重开后再次触发仍被拒绝', R.consume(id, t, 'k2', 3).reason === 'exhausted');
}
{
  const id = 'epoch', t = 'T5_response_once';
  R.begin({ sessionId: id, spiritId: byTemplate[t].id, level: 'B', epoch: 10 });
  const keep = R.begin({ sessionId: 'epoch-keep', spiritId: byTemplate[t].id, level: 'B', epoch: 11 });
  const removed = R.switchEpoch(11);
  check('换档只清掉非当前代次的会话', removed >= 1 && R.snapshot(id) === null && !!keep && R.snapshot('epoch-keep') !== null, removed);
  check('换档后旧会话的回包连会话都找不到', R.consume(id, t, 'late', 11).reason === 'no-session');
}
{
  const id = 'cleanup', t = 'T6_recover_once';
  R.begin({ sessionId: id, spiritId: byTemplate[t].id, level: 'B', epoch: 1 });
  R.consume(id, t, 'k', 1);
  check('助战结束后计数不残留', R.end(id) === true && R.snapshot(id) === null && R.consume(id, t, 'k', 1).reason === 'no-session');
  R.begin({ sessionId: 'fresh', spiritId: byTemplate[t].id, level: 'B', epoch: 1 });
  R.consume('fresh', t, 'k', 1);
  R.reset();
  check('进程中断重置后无任何残留会话', R.count() === 0 && R.consume('fresh', t, 'k', 1).reason === 'no-session');
}
{
  const id = 'readonly', t = 'T2_draw_once';
  R.begin({ sessionId: id, spiritId: byTemplate[t].id, level: 'B', epoch: 1 });
  R.consume(id, t, 'k', 1);
  const snap = R.snapshot(id);
  let threw = false; try { snap.used[t] = 99; } catch (_e) { threw = true; }
  check('snapshot 为冻结副本，篡改不改内部', Object.isFrozen(snap) && Object.isFrozen(snap.used) &&
    R.snapshot(id).used[t] === 1, { threw });
  check('activeTemplate 返回当前妖灵的模板', R.activeTemplate(id) === t);
  check('未解锁会话的 activeTemplate 为 null', R.activeTemplate('lvx-C') === null);
}

/* ---------- 助战接线（静态源码断言；动态回归由 E95R 266/0 覆盖） ---------- */
check('助战模块定义了可选的 buffRuntime 取用器', /function buffRuntime\(\)/.test(auxSource));
check('召唤成功用真实妖灵 id 建立会话',
  /RT\.begin\(\{[^}]*sessionId:current\.id[^}]*spiritId:spirit\._cshAuxSource[^}]*epoch:current\.epoch/s.test(auxSource));
check('好感档位来自 cshAffection.get().level 且异常时回退 D',
  /lib\.cshAffection/.test(auxSource) && /AF\.get\(spirit\._cshAuxSource\)/.test(auxSource) && /let level='D'/.test(auxSource));
check('助战结束 / 回滚时 end 会话', /RT\.end\(run\.id\)/.test(auxSource));
check('换档时 switchEpoch 清旧会话', /RT\.switchEpoch\(lib\.cshWallet\.saveEpoch\(\)\)/.test(auxSource));
check('所有增益调用都在 try 保护内（缺模块不炸）',
  (auxSource.match(/try\{\s*const RT=buffRuntime\(\)/g) || []).length >= 1 &&
  /try\{\s*const RT=buffRuntime\(\);if\(RT\)RT\.end\(run\.id\);\}catch/.test(auxSource));

/* ---------- 零副作用 ---------- */
check('全程零存储读写、零钱包调用（不发 CBY / 不写存档）', storageCalls === 0 && walletCalls === 0,
  { storageCalls, walletCalls });

/* ---------- 自检：改前实现必须被判红 ---------- */
const guardA = 'if (has(sessions, id)) return snapshot(id);';
const guardB = "if (tk && has(s.tokens, tk)) {\n      var c = s.tokens[tk];\n      return { ok: c.ok, reason: c.reason, repeated: true, used: used };\n    }";
if (!rtSource.includes(guardA) || !rtSource.includes(guardB)) throw Error('negative-baseline anchors changed');
const beforeSource = rtSource.replace(guardA, '/* removed: reopen reset */').replace(guardB, '/* removed: late callback */');
const beforeCtx = makeContext('normal');
vm.runInContext(buffSource, beforeCtx);
vm.runInContext(beforeSource, beforeCtx);
const BR = beforeCtx.window.CSHSpiritBuffRuntime;
const beforeRows = [];
const bcheck = (name, ok) => beforeRows.push({ name, passed: !!ok });
{
  const t = 'T1_guard_damage', id = 'before';
  BR.begin({ sessionId: id, spiritId: byTemplate[t].id, level: 'B', epoch: 1 });
  const a = BR.consume(id, t, 'same', 1);
  const b = BR.consume(id, t, 'same', 1);
  bcheck('迟到回调不改已消耗次数', a.ok === true && b.repeated === true && BR.snapshot(id).used[t] === 1);
  BR.begin({ sessionId: id, spiritId: byTemplate[t].id, level: 'B', epoch: 1 });
  bcheck('关闭重开不重置', BR.snapshot(id).used[t] === 1);
  bcheck('每局一次', BR.consume(id, t, 'other', 1).ok === false);
  bcheck('解锁判定', BR.snapshot(id).active === true);
}
const beforeFailed = beforeRows.filter(r => !r.passed).length;
check('改前实现（去掉迟到防护与重开复用）能被断言集检出 >= 2 条红', beforeFailed >= 2,
  { beforeFailed, red: beforeRows.filter(r => !r.passed).map(r => r.name) });

const result = {
  scope: 'real S1 table + S2 runtime in vm; six templates, late callbacks, epoch isolation, static aux wiring; not natural games',
  passed: rows.filter(r => r.passed).length,
  failed: rows.filter(r => !r.passed).length,
  failures: rows.filter(r => !r.passed),
  beforeBaselineFailed: beforeFailed,
  beforeBaselineRed: beforeRows.filter(r => !r.passed).map(r => r.name),
  sideEffects: { storageCalls, walletCalls },
};
const out = arg('--out', null);
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ ...result, rows }, null, 2));
}
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
