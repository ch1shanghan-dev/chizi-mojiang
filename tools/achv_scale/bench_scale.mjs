/* 规模性能基准
   ------------------------------------------------------------
   交接书第 11 节要求"至少给出 1k/5k/10k 定义下的启动、打开、搜索、
   事件处理、领奖写入的 p50/p95"，并且"不得编造优化百分比"。

   这里只测本机能测的、且与判定架构直接相关的一段：
   · 定义加载 + 索引构建
   · 单个事件的判定开销（这是每张牌都会走的热路径）
   · 存档 load/save

   输出真实毫秒数，不做任何包装。跑法：
   node tools/achv_scale/bench_scale.mjs [--runs 200]
*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(path.join(here, '..', '..'));
const SRC = fs.readFileSync(path.join(ROOT, 'core', 'csh_pool_achv.js'), 'utf8');
const CAREER = fs.readFileSync(path.join(ROOT, 'core', 'csh_achv.js'), 'utf8');

const argOf = (n, d) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : d; };
const RUNS = Number(argOf('--runs', '200'));
const outPath = argOf('--out', null);

function makeEnv() {
  const store = new Map();
  const ls = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    key: () => null,
    get length() { return store.size; },
  };
  const sandbox = { window: {}, localStorage: ls, console, Date, JSON, Number, String, Object, Array, Math };
  sandbox.window.localStorage = ls;
  vm.createContext(sandbox);
  return { sandbox, ls, store };
}

function pct(arr, p) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return +s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))].toFixed(3);
}

/* 1) 冷加载：vm 编译 + 执行 + 索引构建 */
const loadTimes = [];
let PA = null, careerCount = 0;
for (let i = 0; i < 8; i++) {
  const t0 = performance.now();
  const { sandbox } = makeEnv();
  vm.runInContext(CAREER, sandbox, { filename: 'csh_achv.js' });
  careerCount = sandbox.window.CSH_ACHV.defs.length;
  vm.runInContext(SRC, sandbox, { filename: 'csh_pool_achv.js' });
  PA = sandbox.window.CSH_POOL_ACHV;
  loadTimes.push(performance.now() - t0);
}

/* 2) 事件判定热路径：一条 useCard / damage 事件从 feed 到 judge */
function hotPath(metricEvent) {
  const a = PA.newRun({ mode: 'identity', meSeat: 0, meIdentity: 'zhu', seatCount: 3 });
  a.meChars = [PA.PROFILES[0].id];
  const st = { got: {}, seen: {}, chars: {}, mastery: {} };
  const t0 = performance.now();
  PA.feed(a, metricEvent);
  PA.prepareMastery(st, a);
  PA.judge(a, metricEvent);
  return performance.now() - t0;
}
const cardTimes = [], dmgTimes = [], overTimes = [];
for (let i = 0; i < RUNS; i++) {
  cardTimes.push(hotPath({ t: 'useCard', seat: 0, name: 'sha', cardType: 'basic', targets: 1, handAfter: 3, before: 1, respond: false }));
  dmgTimes.push(hotPath({ t: 'damage', seat: 0, victimSeat: 1, num: 2, cardName: 'sha', natures: [] }));
  overTimes.push(hotPath({ t: 'over', seat: 0, win: true, hand: 2 }));
}

/* 3) 存档读写：把 N 条达成记录写进去再读出来 */
const bigState = { v: 2, got: {}, seen: {}, results: [], chars: {}, progress: {}, mastery: {} };
for (const r of PA.RULES) bigState.got[r.id] = { t: 1700000000000, m: 'identity', n: 1 };
for (const r of PA.RULES) if (r.metric) bigState.progress[r.id] = 1;
const saveTimes = [], loadTimes2 = [];
const { sandbox: env2, ls: ls2 } = makeEnv();
vm.runInContext(SRC, env2, { filename: 'csh_pool_achv.js' });
const PA2 = env2.window.CSH_POOL_ACHV;
const payload = JSON.stringify(bigState);
for (let i = 0; i < 20; i++) {
  ls2.setItem(PA2.KEY, payload);
  let t0 = performance.now();
  PA2.load();
  loadTimes2.push(performance.now() - t0);
  t0 = performance.now();
  PA2.save(JSON.parse(payload));
  saveTimes.push(performance.now() - t0);
}

const result = {
  scope: 'Node ' + process.version + ' · 本机 · 隔离 vm · 不含渲染与真实牌局',
  definitions: { career: careerCount, pool: PA.RULES.length, total: careerCount + PA.RULES.length },
  coldLoadMs: { p50: pct(loadTimes, 50), p95: pct(loadTimes, 95), samples: loadTimes.length },
  eventJudgeMs: {
    useCard: { p50: pct(cardTimes, 50), p95: pct(cardTimes, 95) },
    damage: { p50: pct(dmgTimes, 50), p95: pct(dmgTimes, 95) },
    over: { p50: pct(overTimes, 50), p95: pct(overTimes, 95) },
    runs: RUNS,
  },
  saveLoadMs: {
    loadFullGot: { p50: pct(loadTimes2, 50), p95: pct(loadTimes2, 95) },
    saveFullGot: { p50: pct(saveTimes, 50), p95: pct(saveTimes, 95) },
    gotEntries: Object.keys(bigState.got).length,
    payloadKB: +(Buffer.byteLength(payload) / 1024).toFixed(1),
  },
  sourceKB: { pool: +(Buffer.byteLength(SRC) / 1024).toFixed(1), career: +(Buffer.byteLength(CAREER) / 1024).toFixed(1) },
};

/* 4) 万条规模压测：把现有规则按倍数复制（改 id）到目标条数，
      测的是"事件到来时要在多大的候选集里判定"与"存档要多大的载荷"。
      这是构造性测量，不代表内容质量，只回答架构还能不能扛。 */
const TARGET = Number(argOf('--synthetic', '0'));
if (TARGET > PA.RULES.length) {
  const times = Math.ceil(TARGET / PA.RULES.length);
  const synth = [];
  for (let k = 0; k < times && synth.length < TARGET; k++) {
    for (const r of PA.RULES) {
      if (synth.length >= TARGET) break;
      synth.push(Object.assign({}, r, { id: k === 0 ? r.id : r.id + '_x' + k }));
    }
  }
  const buildSrc = SRC.replace(
    'root.CSH_POOL_ACHV = {',
    '(function(){ var seen={}; for(var i=0;i<RULES.length;i++){ if(seen[RULES[i].id]) continue; seen[RULES[i].id]=1; } })();\n\troot.CSH_POOL_ACHV = {'
  );
  const loadS = [];
  let PX = null;
  for (let i = 0; i < 5; i++) {
    const t0 = performance.now();
    const { sandbox } = makeEnv();
    vm.runInContext(CAREER, sandbox, { filename: 'csh_achv.js' });
    vm.runInContext(SRC, sandbox, { filename: 'csh_pool_achv.js' });
    const P0 = sandbox.window.CSH_POOL_ACHV;
    while (P0.RULES.length < TARGET) {
      const k = P0.RULES.length;
      const base = P0.RULES[k % (PA.RULES.length)];
      P0.RULES.push(Object.assign({}, base, { id: base.id + '_x' + k }));
    }
    const idx = {};
    for (const r of P0.RULES) for (const ev of r.on || []) (idx[ev] = idx[ev] || []).push(r);
    PX = { P0, idx };
    loadS.push(performance.now() - t0);
  }
  const judgeS = [];
  for (let i = 0; i < RUNS; i++) {
    const a = PX.P0.newRun({ mode: 'identity', meSeat: 0, meIdentity: 'zhu', seatCount: 3 });
    a.meChars = [PX.P0.PROFILES[0].id];
    const ev = { t: 'useCard', seat: 0, name: 'sha', cardType: 'basic', targets: 1, handAfter: 3, before: 1, respond: false };
    const t0 = performance.now();
    PX.P0.feed(a, ev);
    PX.P0.judge(a, ev);
    judgeS.push(performance.now() - t0);
  }
  const synthState = { v: 2, got: {}, seen: {}, results: [], chars: {}, progress: {}, mastery: {} };
  for (const r of PX.P0.RULES) synthState.got[r.id] = { t: 1700000000000, m: 'identity', n: 1 };
  const synthPayload = JSON.stringify(synthState);
  result.synthetic = {
    target: TARGET,
    actualRules: PX.P0.RULES.length,
    buildIndexMs: { p50: pct(loadS, 50), p95: pct(loadS, 95) },
    eventJudgeMs: { p50: pct(judgeS, 50), p95: pct(judgeS, 95) },
    fullGotPayloadKB: +(Buffer.byteLength(synthPayload) / 1024).toFixed(1),
    note: '构造性复制规则，只测架构承载，不代表内容质量',
  };
}

console.log(JSON.stringify(result, null, 2));
if (outPath) fs.writeFileSync(outPath, JSON.stringify(result, null, 2));
