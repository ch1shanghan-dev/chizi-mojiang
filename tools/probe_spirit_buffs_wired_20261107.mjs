/* 妖灵六类特色增益接线（S4）· 门禁反例（2026-11-07）
 *
 * 真值：core/csh_spirit_buffs.js（50 条表）、core/csh_spirit_buff_runtime.js（v2 运行态）、
 *       core/csh_spirit_buff_skills.js（六类技能）、core/csh_aux_spirit.js（接线静态断言）。
 * 与 probe_aux_spirit.mjs 同款：直调技能 filter/content/mod，不依赖完整引擎事件循环。
 * stdout 纯 JSON（B12 契约）；--out 可另存逐项结果。
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const buffSrc = fs.readFileSync(root + '/core/csh_spirit_buffs.js', 'utf8');
const rtSrc = fs.readFileSync(root + '/core/csh_spirit_buff_runtime.js', 'utf8');
const skillsSrc = fs.readFileSync(root + '/core/csh_spirit_buff_skills.js', 'utf8');
const auxSrc = fs.readFileSync(root + '/core/csh_aux_spirit.js', 'utf8');

const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(!ok && detail !== undefined ? { detail } : {}) });

function harness(spiritId, level, skillSource) {
  const ctx = vm.createContext({ window: {}, Object, Array, JSON, Math, Number, String, Boolean, Error, Promise,
    console: { log() {}, warn() {}, error() {} } });
  for (const s of [buffSrc, rtSrc, skillSource || skillsSrc]) vm.runInContext(s, ctx);
  const B = ctx.window.CSHSpiritBuffs, RT = ctx.window.CSHSpiritBuffRuntime, S = ctx.window.CSHSpiritBuffSkills;
  const calls = { draw: 0, recover: 0, wallet: 0, storage: 0, log: [] };
  const me = { name: 'me', hp: 3, hand: [], draw(n) { calls.draw += n; }, recover(n) { calls.recover += n; this.hp += n; } };
  const other = { name: 'other' }, spirit = { name: 'spirit' };
  const run = { id: 'sess-00000001', epoch: 1, spirit, owner: me };
  let sessionActive = true;
  const host = {
    runtime: () => RT,
    session: () => run,
    active: p => sessionActive && p === spirit,
    me: () => me,
    draw: n => me.draw(n),
    recover: n => me.recover(n),
    refresh: () => {},
    log: t => calls.log.push(String(t)),
  };
  const skills = S.create(host);
  RT.begin({ sessionId: run.id, spiritId, level, epoch: 1 });
  return { B, RT, S, skills, me, other, spirit, run, calls,
    setEpoch(n) { run.epoch = n; }, setActive(v) { sessionActive = v; } };
}
const byTemplate = (() => {
  const ctx = vm.createContext({ window: {}, Object, Array, JSON, Math, Number, String, Error, console: { log() {} } });
  vm.runInContext(buffSrc, ctx);
  const out = {};
  for (const b of ctx.window.CSHSpiritBuffs.list()) if (!out[b.template]) out[b.template] = b;
  return out;
})();
const ID = t => byTemplate[t].id;

/* ---------- 模块边界 ---------- */
check('技能模块挂载、版本、导出冻结', (() => {
  const h = harness(ID('T1_guard_damage'), 'B');
  return h.S.VERSION === 1 && Object.isFrozen(h.S) && Object.isFrozen(h.S.ONCE) && Object.isFrozen(h.S.PERSIST);
})());
check('六类技能齐备且触发点 / mod 分类正确', (() => {
  const h = harness(ID('T1_guard_damage'), 'B');
  const s = h.skills;
  return ['t1', 't2', 't3', 't4', 't5', 't6'].every(k => s[k]) &&
    s.t1.trigger.global === 'damageBegin4' && s.t2.trigger.global === 'useCardAfter' &&
    s.t5.trigger.player === 'chooseToRespondBegin' && s.t6.trigger.global === 'dying' &&
    typeof s.t3.mod.maxHandcard === 'function' && typeof s.t4.mod.globalFrom === 'function';
})());
{
  const code = skillsSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  check('技能模块不碰存档 / 钱包 / CBY / 牌堆',
    !/\blocalStorage\s*\.|\bcshWallet\b|\bsettle\s*\(|\bclaim\s*\(|\bCBY\b|\bshuffle\b|\bdeck\b/.test(code));
}

/* ---------- T1 护主·减伤 ---------- */
{
  const h = harness(ID('T1_guard_damage'), 'B'), s = h.skills.t1;
  const e = { player: h.me, num: 2 };
  check('T1 首次 filter 通过', s.filter(e, h.me) === true);
  await s.content({}, e, h.me);
  check('T1 首次伤害 -1（magnitude=1）', e.num === 1, e.num);
  check('T1 第二次 filter 拒绝、不再减伤', s.filter({ player: h.me, num: 2 }, h.me) === false);
  const e2 = { player: h.me, num: 2 };
  await s.content({}, e2, h.me);
  check('T1 第二次 content 不生效', e2.num === 2 && h.RT.snapshot(h.run.id).used.T1_guard_damage === 1);
  check('T1 非本人受伤不触发', s.filter({ player: h.other, num: 2 }, h.me) === false);
  check('T1 num<=0 不触发', s.filter({ player: h.me, num: 0 }, h.me) === false);
}
/* ---------- T2 助战·摸牌 ---------- */
{
  const h = harness(ID('T2_draw_once'), 'B'), s = h.skills.t2;
  const e = { player: h.me, targets: [{}] };
  check('T2 首次命中 filter 通过', s.filter(e, h.me) === true);
  await s.content({}, e, h.me);
  check('T2 首次命中摸 1 张', h.calls.draw === 1, h.calls.draw);
  check('T2 第二次不再摸牌', s.filter({ player: h.me, targets: [{}] }, h.me) === false);
  await s.content({}, { player: h.me, targets: [{}] }, h.me);
  check('T2 content 第二次不生效', h.calls.draw === 1);
  check('T2 未命中（无目标）不触发', s.filter({ player: h.me, targets: [] }, h.me) === false);
}
/* ---------- T3 共谋·手牌（持续型） ---------- */
{
  const h = harness(ID('T3_hand_cap'), 'B'), s = h.skills.t3;
  check('T3 首次查询手牌上限 +1', s.mod.maxHandcard(h.me, 3) === 4, s.mod.maxHandcard(h.me, 3));
  check('T3 引擎每帧重复查询仍常驻 +1',
    s.mod.maxHandcard(h.me, 3) === 4 && s.mod.maxHandcard(h.me, 5) === 6 &&
    h.RT.snapshot(h.run.id).used.T3_hand_cap === 1);
  check('T3 isActive 常驻标记为真', h.RT.isActive(h.run.id, 'T3_hand_cap', 1) === true);
  check('T3 对非主人不生效', s.mod.maxHandcard(h.other, 3) === 3);
}
/* ---------- T4 同行·距离（持续型） ---------- */
{
  const h = harness(ID('T4_distance'), 'B'), s = h.skills.t4;
  check('T4 首次查询距离 -1', s.mod.globalFrom(h.me, h.other, 3) === 2, s.mod.globalFrom(h.me, h.other, 3));
  check('T4 重复查询常驻 -1 且距离为 1 时不为 0',
    s.mod.globalFrom(h.me, h.other, 3) === 2 && s.mod.globalFrom(h.me, h.other, 1) === 1 &&
    h.RT.snapshot(h.run.id).used.T4_distance === 1);
  check('T4 对非主人不生效', s.mod.globalFrom(h.other, h.me, 3) === 3);
}
/* ---------- T5 接应·响应 ---------- */
{
  const h = harness(ID('T5_response_once'), 'B'), s = h.skills.t5;
  const e = { player: h.me };
  check('T5 首次需要响应 filter 通过', s.filter(e, h.me) === true);
  let finished = false;
  e.finish = () => { finished = true; };
  await s.content({}, e, h.me);
  check('T5 视为已响应 1 次且结束本次选择', e.result.bool === true && Array.isArray(e.result.cards) && finished);
  check('T5 不伪造具体牌', e.result.cards.length === 0 && h.calls.draw === 0);
  check('T5 第二次不再触发', s.filter({ player: h.me }, h.me) === false);
}
/* ---------- T6 回护·回复 ---------- */
{
  const h = harness(ID('T6_recover_once'), 'B'), s = h.skills.t6;
  h.me.hp = 0;   /* filter 读的是 e.player.hp，必须先造出濒死状态 */
  const e = { player: h.me, hp: 0 };
  check('T6 首次濒死 filter 通过', s.filter(e, h.me) === true);
  await s.content({}, e, h.me);
  check('T6 首次濒死回复 1 点体力', h.calls.recover === 1 && h.me.hp === 1);
  check('T6 第二次不再回复', s.filter({ player: h.me, hp: 0 }, h.me) === false);
  await s.content({}, { player: h.me, hp: 0 }, h.me);
  check('T6 content 第二次不生效', h.calls.recover === 1);
  h.me.hp = 2;
  check('T6 未濒死不触发', s.filter({ player: h.me, hp: 0 }, h.me) === false);
}

/* ---------- 解锁 / 隔离 / 零副作用 ---------- */
{
  const h = harness(ID('T1_guard_damage'), 'C');
  h.me.hp = 0;
  check('好感 C 不解锁：六类技能全部不触发',
    !h.skills.t1.filter({ player: h.me, num: 2 }, h.me) && h.skills.t3.mod.maxHandcard(h.me, 3) === 3 &&
    !h.skills.t6.filter({ player: h.me, hp: 0 }, h.me));
}
{
  const h = harness(ID('T1_guard_damage'), 'B');
  check('妖灵模板不符的技能不触发', !h.skills.t6.filter({ player: h.me, hp: 0 }, h.me) && h.skills.t4.mod.globalFrom(h.me, h.other, 3) === 3);
}
{
  const h = harness(ID('T1_guard_damage'), 'B');
  h.setEpoch(2);
  const e = { player: h.me, num: 2 };
  check('换档后迟到回包不生效', (h.skills.t1.filter(e, h.me), await h.skills.t1.content({}, e, h.me), e.num === 2));
  check('换档后持续型 mod 也失效', h.skills.t3.mod.maxHandcard(h.me, 3) === 3);
}
{
  const h = harness(ID('T3_hand_cap'), 'B');
  h.RT.end(h.run.id);
  check('助战结束后增益全部失效',
    h.skills.t3.mod.maxHandcard(h.me, 3) === 3 && h.RT.isActive(h.run.id, 'T3_hand_cap', 1) === false);
}
{
  const h = harness(ID('T2_draw_once'), 'B');
  const e = { player: h.me, targets: [{}] };
  await h.skills.t2.content({}, e, h.me);
  check('六类全程零钱包 / 零存储 / 零 CBY 调用',
    h.calls.wallet === 0 && h.calls.storage === 0 && !h.calls.log.some(t => /CBY/.test(t)), h.calls);
}

/* ---------- 助战接线静态断言 ---------- */
check('六类技能经 CSHSpiritBuffSkills.create 注入并 addGlobalSkill 注册',
  /SBM\.create\(\{/.test(auxSrc) && /for\(const bk of \['t1','t2','t5','t6','t3','t4'\]\)/.test(auxSrc) &&
  /game\.addGlobalSkill\('csh_spirit_buff_'\+bk\)/.test(auxSrc));
check('接线不进 character.skills（保护 probe_aux_spirit 的 4 技能断言）',
  !/csh_spirit_buff_t1'/.test(auxSrc.match(/skills:\[[^\]]*\]/g) || [''] [0] || '') &&
  /skills:\['csh_aux_guard','csh_aux_aid','csh_aux_rescue','csh_aux_entry'\]/.test(auxSrc));
check('status 面板呈现本局特色增益文案', /function buffText\(\)/.test(auxSrc) && /\+buffText\(\)/.test(auxSrc));
check('filter 只读判定、content 才消耗次数（不在 filter 里 consume）',
  /function available\(template\)/.test(skillsSrc) && /return rt\.consume\(r\.id, template, token, r\.epoch\)\.ok \? rt : null;/.test(skillsSrc) &&
  !/filter[\s\S]{0,220}consume\(/.test(skillsSrc));

/* ---------- 自检：去掉 consume 必须判红 ---------- */
const anchor = 'return rt.consume(r.id, template, token, r.epoch).ok ? rt : null;';
if (!skillsSrc.includes(anchor)) throw Error('negative-baseline anchor changed');
const badSrc = skillsSrc.replace(anchor, 'return rt;');
const beforeRows = [];
const bcheck = (name, ok) => beforeRows.push({ name, passed: !!ok });
{
  const h = harness(ID('T1_guard_damage'), 'B', badSrc);
  const e = { player: h.me, num: 2 };
  await h.skills.t1.content({}, e, h.me);
  bcheck('一次性增益第二次不再触发', h.skills.t1.filter({ player: h.me, num: 2 }, h.me) === false);
  bcheck('减伤仍为 1', e.num === 1);
}
const beforeFailed = beforeRows.filter(r => !r.passed).length;
check('改前实现（不消耗次数）能被断言集检出 >= 1 条红', beforeFailed >= 1,
  { beforeFailed, red: beforeRows.filter(r => !r.passed).map(r => r.name) });

const result = {
  scope: 'real S1 table + S2 runtime v2 + six S4 skills in vm with injected host; direct filter/content/mod calls + static aux wiring; not natural games',
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
