/* 图鉴助战增益展示：真实 core/csh_spirit_buffs.js + AST 抽取 codex.html 的
   buffApi/renderSpiritBuff，在最小 DOM 里逐条验证 50 条展示、好感档位、只读边界。
   不改页面源码；内置改前基线（不校验好感 / 无数据仍显示 / 未接线）必须被检出。 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parse, walk } from './lib/skill_audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'games/codex.html'), 'utf8');
const buffSource = fs.readFileSync(path.join(root, 'core/csh_spirit_buffs.js'), 'utf8');
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, detail: ok ? undefined : detail });
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };

/* 取最长的内联 script（codex.html 主脚本），AST 抽真实函数体，不靠字符串猜边界 */
let inline = '';
for (const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
  if (m[1].length > inline.length) inline = m[1];
}
const ast = parse(inline);
const fns = {};
walk(ast, n => {
  if (n.type === 'FunctionDeclaration' && ['buffApi', 'renderSpiritBuff'].includes(n.id?.name)) {
    fns[n.id.name] = inline.slice(n.range[0], n.range[1]);
  }
});
check('AST 抽到页面真实 buffApi / renderSpiritBuff', !!fns.buffApi && !!fns.renderSpiritBuff, Object.keys(fns));

const ANCHOR_UNLOCK = 'A.unlocked(level, b.id) === true';
const ANCHOR_HIDE = 'if (!b) { panel.hidden = true; return; }';
const ANCHOR_WIRE = 'renderSpiritBuff(it);';
check('负面基线锚点仍在真实源码里',
  fns.renderSpiritBuff.includes(ANCHOR_UNLOCK) && fns.renderSpiritBuff.includes(ANCHOR_HIDE) && inline.includes(ANCHOR_WIRE));

function node(tag) {
  const n = {
    tagName: tag, className: '', textContent: '', hidden: false, children: [], style: {},
    appendChild(child) { this.children.push(child); return child; },
    setAttribute() {}, querySelector() { return null; }
  };
  let raw = '';
  Object.defineProperty(n, 'innerHTML', {
    get() { return raw; },
    set(v) { raw = String(v); if (raw === '') n.children.length = 0; }
  });
  return n;
}

function build(renderOverride, apiOverride) {
  const panel = node('details'), body = node('div'), affbox = node('div');
  const storageWrites = [], walletCalls = [], bridgeCalls = [];
  const win = {};
  const ctx = vm.createContext({
    window: win,
    document: {
      querySelector(sel) {
        if (sel === '#spirit-buff') return panel;
        if (sel === '#spirit-buff-body') return body;
        if (sel === '#affbox') return affbox;
        return null;
      },
      createElement(tag) { return node(tag); }
    },
    localStorage: {
      getItem(k) { return k; },
      setItem(k, v) { storageWrites.push([k, String(v)]); },
      removeItem(k) { storageWrites.push([k]); }
    },
    Bridge: { call(...a) { bridgeCalls.push(a); } },
    lib: { cshWallet: { pc() { walletCalls.push('pc'); return 0; }, spend() { walletCalls.push('spend'); return false; } } },
    affOf() { return { id: 'unknown', v: 0, level: 'D', levelName: '陌路' }; },
    $: sel => ctx.document.querySelector(sel),
    el(t, c, x) { const e = node(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; },
    console: { log() {}, warn() {}, error() {} }
  });
  vm.runInContext(buffSource, ctx);
  if (apiOverride !== undefined) ctx.window.CSHSpiritBuffs = apiOverride;
  vm.runInContext(fns.buffApi, ctx);
  vm.runInContext(renderOverride || fns.renderSpiritBuff, ctx);
  return {
    ctx, panel, body, win, storageWrites, walletCalls, bridgeCalls,
    api: ctx.window.CSHSpiritBuffs,
    render: it => vm.runInContext('renderSpiritBuff(' + JSON.stringify(it) + ')', ctx),
    text() { return body.children.map(n => [n.className, n.textContent, ...(n.children || []).map(c => [c.className, c.textContent])]); },
    flat() { return JSON.stringify(body.children); }
  };
}

/* ---------- 1. 页面接线与呈现约束 ---------- */
{
  check('页面引入只读数据层脚本', html.includes('<script src="../core/csh_spirit_buffs.js"></script>'));
  check('增益面板是折叠 details 且默认隐藏，不遮挡主操作',
    html.includes('<details class="collection-details" id="spirit-buff" hidden>') &&
    !/id="spirit-buff"[^>]*position:fixed/.test(html));
  check('好感重绘链路同步刷新增益（renderAff 接线）', inline.includes(ANCHOR_WIRE));
  check('渲染函数只清空自己的容器，不 innerHTML 拼数据',
    fns.renderSpiritBuff.includes('body.innerHTML = ""') &&
    (fns.renderSpiritBuff.match(/innerHTML/g) || []).length === 1);
  check('渲染函数不触碰存档 / 钱包 / 桥 / 远程',
    !/localStorage|cshWallet|Bridge\.|fetch\s*\(|XMLHttpRequest|CSHPage\./.test(fns.renderSpiritBuff));
}
{
  const b = build();
  check('真实数据层挂载在 iframe window 且 50 条 / 6 模板',
    b.api && b.api.list().length === 50 && Object.keys(b.api.TEMPLATES).length === 6);
  check('数据层冻结，页面无法改数值', Object.isFrozen(b.api) && Object.isFrozen(b.api.get(b.api.ids()[0])));
}

/* ---------- 2. 50 条逐只展示 ---------- */
{
  const b = build();
  const ids = b.api.ids(), seen = new Set();
  let allOk = true, detail = null;
  for (const id of ids) {
    b.render({ id, affState: { level: 'D', levelName: '陌路' } });
    const tpl = b.body.children[0], text = b.body.children[1], meta = b.body.children[2];
    const row = b.api.get(id), t = b.api.TEMPLATES[row.template];
    const ok = b.panel.hidden === false && tpl.textContent === t.name &&
      text.textContent === row.playerText && text.textContent.length > 0 &&
      meta.children[0].textContent === '未解锁' && !meta.children[0].className.includes('on') &&
      meta.children[1].textContent.includes('好感 B') && meta.children[1].textContent.includes('每局 1 次') &&
      b.body.children[3].textContent.includes('不产生池子币');
    if (!ok) { allOk = false; detail = { id, text: b.flat() }; break; }
    seen.add(row.template);
  }
  check('50 只妖灵逐条展示模板名 / 专属文案 / 解锁条件 / 只读声明', allOk, detail);
  check('6 类模板都被图鉴覆盖', seen.size === 6, [...seen]);
  check('逐条展示零存档 / 零钱包 / 零桥调用',
    b.storageWrites.length === 0 && b.walletCalls.length === 0 && b.bridgeCalls.length === 0);
}

/* ---------- 3. 好感档位与未知输入 ---------- */
{
  const b = build(), id = b.api.ids()[0];
  const state = () => ({ on: b.body.children[2].children[0].textContent, cls: b.body.children[2].children[0].className });
  for (const lv of ['D', 'C']) {
    b.render({ id, affState: { level: lv, levelName: '陌路' } });
    check('好感 ' + lv + ' 显示未解锁（不默认放行）', state().on === '未解锁' && !state().cls.includes('on'), state());
  }
  for (const lv of ['B', 'A', 'S']) {
    b.render({ id, affState: { level: lv, levelName: '亲近' } });
    check('好感 ' + lv + ' 显示已解锁且不加成升级', state().on === '已解锁' && state().cls.includes('on'), state());
  }
  for (const bad of [null, undefined, '', 42, {}, 'Z', 'b']) {
    b.render({ id, affState: { level: bad } });
    check('非法档位 ' + String(bad) + ' 不解锁', state().on === '未解锁', state());
  }
  b.render({ id });   /* 无 affState：走 affOf() 兜底 */
  check('缺少好感状态时按陌路兜底且含当前档位文案',
    b.panel.hidden === false && b.body.children[3].textContent.includes('陌路'), b.body.children[3]);
  b.render({ id: 'csh_boss_minion_not_exist', affState: { level: 'S' } });
  check('未知妖灵 id 隐藏整块且清空旧内容', b.panel.hidden === true && b.body.children.length === 0);
  b.render({});
  check('空档案对象不抛错且不显示', b.panel.hidden === true && b.body.children.length === 0);
  b.render(null);
  check('null 档案不抛错且不显示', b.panel.hidden === true);
}

/* ---------- 4. 数据层缺失 / 篡改 / XSS / 切人 ---------- */
{
  const b = build(null, null);
  b.render({ id: 'csh_boss_minion_eve', affState: { level: 'B' } });
  check('数据层未加载时整块隐藏、不编造增益', b.panel.hidden === true && b.body.children.length === 0);
}
{
  const fake = {
    UNLOCK_LEVEL: 'B', TEMPLATES: { T1: { name: '护主·减伤', text: '伤害 -1' } },
    get: () => ({ id: 'x', template: 'T1', playerText: '<img src=x onerror=alert(1)>' }),
    unlocked: () => true, list: () => [], ids: () => [], perGame: () => 1, templateOf: () => null
  };
  const b = build(null, fake);
  b.render({ id: 'x', affState: { level: 'B' } });
  check('恶意文案按纯文本写入，不解析成 HTML',
    b.body.children[1].textContent === '<img src=x onerror=alert(1)>' && b.body.innerHTML === '', b.flat());
}
{
  const b = build(), ids = b.api.ids();
  b.render({ id: ids[0], affState: { level: 'B' } });
  const first = b.flat();
  b.render({ id: ids[1], affState: { level: 'D' } });
  check('切换妖灵后内容整块替换、无上一条残留',
    b.flat() !== first && b.body.children.length === 4 && !b.flat().includes(b.api.get(ids[0]).playerText), b.body.children.length);
}

/* ---------- 5. 改前基线：断言必须能抓到 ---------- */
{
  const noUnlock = build(fns.renderSpiritBuff.replace(ANCHOR_UNLOCK, 'true'));
  const id = noUnlock.api.ids()[0];
  noUnlock.render({ id, affState: { level: 'D', levelName: '陌路' } });
  check('改前基线：不校验好感会把陌路误标已解锁', noUnlock.body.children[2].children[0].textContent === '已解锁');

  const noHide = build(fns.renderSpiritBuff.replace(ANCHOR_HIDE, 'if (!b) { return; }'));
  noHide.render({ id: 'csh_boss_minion_not_exist' });
  check('改前基线：未知 id 仍显示空面板', noHide.panel.hidden === false);

  const real = build();
  real.render({ id, affState: { level: 'D' } });
  check('当前实现在同样两个场景都正确',
    real.body.children[2].children[0].textContent === '未解锁' && real.panel.hidden === false);
  check('未接线基线可被静态断言检出',
    !inline.replace(ANCHOR_WIRE, '').includes(ANCHOR_WIRE));
}

const result = {
  scope: 'real CSHSpiritBuffs + AST-extracted codex.html buffApi/renderSpiritBuff in minimal DOM; no browser, no engine',
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
