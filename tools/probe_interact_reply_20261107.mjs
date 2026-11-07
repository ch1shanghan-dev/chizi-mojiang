/* §4.3 人物事件回应：真实 csh_interact.js 的 manualReplyJob 队列在隔离 VM 里跑。
   目标不是造新面板，而是把「一次一条 / 可关闭 / 迟到回调不串台 / 换档与切人清空」
   这套与 U1/B1 同款的任务生命周期纪律锁成可复跑断言。
   探针不改产品源码；内置改前基线（去掉 job 身份守卫 / 去掉 saveEpoch 校验）必须被检出。 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'core/csh_interact.js'), 'utf8');
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, detail: ok ? undefined : detail });
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };

const ANCHOR_JOB = 'if(manualReplyJob!==job)return;';
const ANCHOR_EPOCH = 'job.saveEpoch===manualSaveEpoch()';
if (!src.includes(ANCHOR_JOB) || !src.includes(ANCHOR_EPOCH)) throw Error('负面基线锚点变化，需重新核对真实源码');

function harness(source) {
  let now = 100000, seq = 0, epoch = 7;
  const tasks = new Map(), chats = [], storageWrites = [], walletCalls = [], errors = [];
  const person = (id, human) => ({
    name: id, node: { avatar: {} }, isConnected: true,
    isIn() { return true; }, isUnderControl() { return false; },
    chat(text) { chats.push({ id, text }); if (id === 'thrower') throw Error('chat failed'); }
  });
  const me = person('me', true), npc = person('npc', false), thrower = person('thrower', false);
  const game = { me, players: [me, npc, thrower], online: false, observe: false };
  const status = { gameStarted: true };
  const lib = {
    config: {}, skill: {}, translate: {},
    cshWallet: { saveEpoch() { walletCalls.push('saveEpoch'); return epoch; } }
  };
  const storage = new Map();
  const ctx = vm.createContext({
    lib, game, _status: status, ui: {}, EXTRA_LINES: {}, GEN_LINES: {},
    get: { attitude: () => 0, translation: p => p?.name || String(p) },
    localStorage: {
      getItem: k => (storage.has(k) ? storage.get(k) : null),
      setItem: (k, v) => { storageWrites.push(k); storage.set(k, String(v)); },
      removeItem: k => storage.delete(k)
    },
    Date: class extends Date { static now() { return now; } },
    setTimeout(fn, delay) { const id = ++seq; tasks.set(id, { fn, delay }); return id; },
    clearTimeout(id) { tasks.delete(id); },
    console: { log() {}, warn() {}, error(...a) { errors.push(String(a[0] || '')); } }
  });
  const injection = `
 globalThis.__rp = {
   reply: replyToManualBatch,
   clear: clearManualProps,
   clearScene: clearSceneTasks,
   actorGone: manualActorGone,
   involves: manualInvolves,
   resetThrottle: function(){ manualReplyAt = 0; },
   state: function(){ return { at: manualReplyAt, hasJob: !!manualReplyJob,
     epoch: sceneEpoch, chatEpoch: sceneChatEpoch, timers: sceneTimers.size }; },
   keys: KEY, cfg: cfg, manualAllowed: manualAllowed
 };
`;
  const code = (source || src).replace(/^import .*?;\r?\n/gm, '')
    .replace(/\}\)\(\);\s*$/, injection + '})();');
  vm.runInContext(code, ctx, { timeout: 4000 });
  const p = ctx.__rp;
  const job = (o = {}) => Object.assign({ from: me, to: npc, kind: 'flower', sent: 1, saveEpoch: epoch }, o);
  return {
    p, me, npc, thrower, game, status, lib, chats, tasks, storageWrites, walletCalls, errors,
    job,
    flush() { const todo = [...tasks.values()]; tasks.clear(); for (const t of todo) t.fn(); },
    advance(ms) { now += ms; },
    setEpoch(v) { epoch = v; },
    now() { return now; },
    count() { return chats.length; }
  };
}

/* ---------- 1. 基本呈现：一次一条、纯表现、零写入 ---------- */
{
  const h = harness();
  check('真实模块挂载且回应队列 API 可注入', h.p && typeof h.p.reply === 'function' && typeof h.p.clear === 'function');
  check('回应前无待执行表现', h.p.state().timers === 0 && h.p.state().hasJob === false);
  h.p.reply(h.job());
  check('首次回应只调度一个 650ms 表现', h.tasks.size === 1 && [...h.tasks.values()][0].delay === 650, [...h.tasks.values()]);
  check('调度期间持有唯一 job', h.p.state().hasJob === true && h.chats.length === 0);
  h.flush();
  check('执行后恰好一条台词', h.count() === 1 && typeof h.chats[0].text === 'string' && h.chats[0].text.length > 0, h.chats);
  check('台词来自四类道具的内置回应库（不调模型）', /[花酒蛋鞋牌桌收下继续]/.test(h.chats[0].text), h.chats[0]);
  check('发言人必须是接收道具的 AI', h.chats[0].id === 'npc');
  check('执行后 job 与计时器都释放', h.p.state().hasJob === false && h.p.state().timers === 0);
  check('回应路径零存档写入 / 零钱包调用（saveEpoch 只读除外）',
    h.storageWrites.length === 0 && h.walletCalls.every(x => x === 'saveEpoch'), { writes: h.storageWrites, wallet: h.walletCalls });
}

/* ---------- 2. 一次一条与六秒节流 ---------- */
{
  const h = harness();
  h.p.reply(h.job()); h.flush();
  h.p.reply(h.job());
  check('六秒内第二条不排队、不重复回应', h.tasks.size === 0 && h.count() === 1);
  h.advance(5999); h.p.reply(h.job());
  check('5999ms 仍被节流', h.tasks.size === 0 && h.count() === 1);
  h.advance(2); h.p.reply(h.job()); h.flush();
  check('超过 6000ms 才允许下一条', h.count() === 2);
  check('清空后节流计数归零且不再持有 job', (() => { h.p.clear(); const s = h.p.state(); return s.at === 0 && s.hasJob === false; })());
}
{
  const h = harness();
  h.p.reply(h.job()); h.flush(); h.p.resetThrottle();
  const j1 = h.job({ kind: 'wine' }), j2 = h.job({ kind: 'egg' });
  h.p.reply(j1); h.p.resetThrottle(); h.p.reply(j2);
  check('新回应覆盖旧 job 时只保留一个待执行表现', h.tasks.size === 2 && h.p.state().hasJob === true);
  h.flush();
  check('旧 job 的迟到回调不会补发第二条台词', h.count() === 2, h.chats);
  check('旧 job 未污染新人物状态', h.p.state().hasJob === false && h.p.involves(h.npc) === false);
}

/* ---------- 3. 关闭条件：可关闭、不挡主操作 ---------- */
{
  const cases = [
    ['总开关关闭', h => { h.lib.config[h.p.keys.enable] = false; }],
    ['台词开关关闭', h => { h.lib.config[h.p.keys.chat] = false; }],
    ['录像模式', h => { h.status.video = true; }],
    ['联机模式', h => { h.game.online = true; }],
    ['观战模式', h => { h.game.observe = true; }],
    ['对局未开始', h => { h.status.gameStarted = false; }],
    ['对局已结束', h => { h.status.over = true; }],
    ['发送方非玩家本人', h => { h.p.reply(h.job({ from: h.npc, to: h.me })); return true; }],
    ['目标不是 AI', h => { h.p.reply(h.job({ to: h.me })); return true; }],
    ['闪离状态禁止互动', h => { h.me.storage = { zhuSkill_shanli: true }; }],
    ['未知道具类别不编台词', h => { h.p.reply(h.job({ kind: 'unknown' })); return true; }]
  ];
  for (const [name, mutate] of cases) {
    const h = harness();
    const direct = mutate(h);
    if (!direct) h.p.reply(h.job());
    check(name + ' → 不调度且不出台词', h.tasks.size === 0 && h.count() === 0 && h.p.state().hasJob === false,
      { tasks: h.tasks.size, chats: h.chats });
  }
}
{
  const h = harness();
  h.p.reply(h.job());
  h.lib.config[h.p.keys.chat] = false;
  h.flush();
  check('排队途中关闭台词开关 → 迟到回调不发声', h.count() === 0);
}
{
  const h = harness();
  h.p.reply(h.job());
  h.lib.config[h.p.keys.enable] = false;
  h.flush();
  check('排队途中关闭总开关 → 迟到回调不发声', h.count() === 0);
}

/* ---------- 4. 迟到回调不串台：清空 / 换档 / 切人 / 离场 / 换存档 ---------- */
{
  const cases = [
    ['关闭页面（clearManualProps）', h => h.p.clear(), 0],
    ['换档清场（clearSceneTasks）', h => h.p.clearScene(), 0],
    ['接收方离场（actorGone）', h => h.p.actorGone(h.npc), 0],
    ['发送方离场（actorGone）', h => h.p.actorGone(h.me), 0],
    ['存档 epoch 变化（迟到回包）', h => h.setEpoch(8), 0],
    ['玩家数组被替换（新一局）', h => { h.game.players = [h.me, h.npc]; }, 0],
    ['对局在等待期结束', h => { h.status.over = true; }, 0],
    ['接收方在等待期离桌', h => { h.npc.isIn = () => false; }, 0]
  ];
  for (const [name, mutate, expected] of cases) {
    const h = harness();
    h.p.reply(h.job());
    check(name + ' 前确实已有待执行表现', h.tasks.size === 1 && h.p.state().hasJob === true);
    mutate(h);
    h.flush();
    check(name + ' → flush 后恰好 ' + expected + ' 条台词', h.count() === expected, h.chats);
    check(name + ' → 不残留 job', h.p.state().hasJob === false && h.p.state().timers === 0, h.p.state());
  }
}
{
  const h = harness();
  h.p.reply(h.job({ to: h.thrower }));
  h.flush();
  check('引擎 chat 抛错被吞掉且不冒泡、不重复排队', h.count() === 1 && h.tasks.size === 0 && h.p.state().hasJob === false, h.errors);
}

/* ---------- 5. 静态接线：关闭页面 / 离场技能 / 不加模型与远程 ---------- */
{
  const body = src.slice(src.indexOf('function replyToManualBatch'), src.indexOf('function propStatus'));
  check('回应函数走引擎 chat，不自建面板', body.includes('job.to.chat(line)') && !/document|createElement|innerHTML/.test(body));
  check('回应函数不引入远程 / 聊天模型', !/fetch\s*\(|XMLHttpRequest|WebSocket|localStorage/.test(body));
  check('回应函数保留 6 秒节流、650ms 延迟与丢弃时释放 job',
    body.includes('Date.now()-manualReplyAt<6000') && body.includes('},650,job.to,job.from,true,') &&
    body.includes('function(){if(manualReplyJob===job){manualReplyJob=null;manualReplyAt=0;}}'));
  check('关闭页面与页面隐藏都销毁旧处理器',
    src.includes('window.addEventListener("pagehide",clearManualProps)') && src.includes('if(document.hidden)clearManualProps()'));
  check('角色离场技能用 involves 覆盖回应 job',
    src.includes('manualInvolves(actor)') && src.includes("lib.cshInteract.playerBatch.involves(event.player)"));
  check('离场清空同时覆盖批量道具与等待', src.includes('manualReplyAt=0;manualReplyJob=null;') && src.includes("stopManualBatch('互动已中止',true)"));
}

/* ---------- 6. 改前基线：断言必须能抓到守卫被拆 ---------- */
{
  const noJobGuard = harness(src.replace(ANCHOR_JOB, ''));
  noJobGuard.p.reply(noJobGuard.job());
  noJobGuard.p.clear();
  noJobGuard.flush();
  check('改前基线：去掉 job 身份守卫后，已清空的旧回应仍会发声（被检出）', noJobGuard.count() === 1, noJobGuard.chats);

  const noEpoch = harness(src.replace(ANCHOR_EPOCH, 'true'));
  noEpoch.p.reply(noEpoch.job());
  noEpoch.setEpoch(99);
  noEpoch.flush();
  check('改前基线：去掉 saveEpoch 校验后，换档迟到回包仍会发声（被检出）', noEpoch.count() === 1, noEpoch.chats);

  const real = harness();
  real.p.reply(real.job()); real.p.clear(); real.flush();
  const real2 = harness();
  real2.p.reply(real2.job()); real2.setEpoch(99); real2.flush();
  check('当前实现在同样两个场景下都保持静默', real.count() === 0 && real2.count() === 0);
}

const result = {
  scope: 'real csh_interact.js manualReplyJob in isolated VM; no DOM, no engine, no storage writes',
  passed: rows.filter(r => r.passed).length,
  failed: rows.filter(r => !r.passed).length,
  failures: rows.filter(r => !r.passed)
};
const out = arg('--out', null);
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ ...result, rows }, null, 2));
}
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
