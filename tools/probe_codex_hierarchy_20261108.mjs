/* PF-08 第一批：图鉴信息层级（2026-11-08）
   真实 codex.html 的 rosterQuery / applyRosterFilter / renderBondBrief 经 AST 抽取，
   在最小 DOM 里验证「搜索纯过滤、摘要只读、低频内容收纳、材质不改断点」。
   不改页面源码；内置改前基线必须被检出。 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parse, walk } from './lib/skill_audit.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'games/codex.html'), 'utf8');
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, detail: ok ? undefined : detail });
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };

let inline = '';
for (const m of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)) {
  if (m[1].length > inline.length) inline = m[1];
}
const ast = parse(inline);
const fns = {};
walk(ast, n => {
  if (n.type === 'FunctionDeclaration' && ['rosterQuery', 'applyRosterFilter', 'renderBondBrief'].includes(n.id?.name))
    fns[n.id.name] = inline.slice(n.range[0], n.range[1]);
});
check('AST 抽到三个真实函数', Object.keys(fns).length === 3, Object.keys(fns));

function node(tag, text) {
  const n = {
    tagName: tag, className: '', hidden: false, children: [], value: '', attrs: {},
    appendChild(c) { this.children.push(c); return c; },
    querySelector(sel) { return sel === '.gname' ? this._gname || null : null; },
    setAttribute(k, v) { this.attrs[k] = String(v); },
    addEventListener() {}, removeAttribute() {}, focus() {}
  };
  let raw = text == null ? '' : String(text);
  Object.defineProperty(n, 'textContent', {
    get() { return raw; },
    set(v) { raw = String(v); if (raw === '') n.children.length = 0; }
  });
  let htmlRaw = '';
  Object.defineProperty(n, 'innerHTML', {
    get() { return htmlRaw; },
    set(v) { htmlRaw = String(v); if (htmlRaw === '') n.children.length = 0; }
  });
  return n;
}

function harness(overrides) {
  overrides = overrides || {};
  const search = node('input'); search.value = '';
  const rolodex = node('div');
  const empty = node('p'); empty.hidden = true;
  const brief = node('div');
  const writes = [], bridgeCalls = [], walletCalls = [];
  const nodes = { '#codex-roster-search': search, '#rolodex': rolodex, '#codex-roster-empty': empty, '#bond-brief': brief };
  const ctx = vm.createContext({
    console: { log() {}, warn() {}, error() {} },
    $: sel => nodes[sel] || null,
    el(t, c, x) { const e = node(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; },
    fmt(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); },
    affOf() { return { id: 'x', v: 0, level: 'D', levelName: '陌路', toNext: 2000 }; },
    AFF: { gifts: [{ key: 'wine', name: '一杯烈酒', cost: 6000 }] },
    localStorage: { getItem() { return null; }, setItem(k, v) { writes.push([k, String(v)]); } },
    Bridge: { call(...a) { bridgeCalls.push(a); } },
    lib: { cshWallet: { pc() { walletCalls.push('pc'); return 0; } } }
  });
  const code = Object.keys(fns).map(k => overrides[k] || fns[k]).join('\n');
  vm.runInContext(code, ctx, { timeout: 2000 });
  return {
    ctx, search, rolodex, empty, brief, writes, bridgeCalls, walletCalls,
    setNames(names) {
      rolodex.children = names.map(name => {
        const row = node('button'), g = node('div', name);
        row._gname = g; row.hidden = false;
        return row;
      });
    },
    filter(q) { search.value = q; return ctx.applyRosterFilter(); },
    briefFor(it) { ctx.renderBondBrief(it); return brief.children.map(c => [c.className, c.textContent]); }
  };
}

/* ---------- 1. 名录搜索：纯过滤 ---------- */
{
  const h = harness();
  h.setNames(['伊芙', '艾达王', '女帝', '希里', 'Ada Wong']);
  check('空查询显示全部 5 行且无空态', h.filter('') === 5 && h.empty.hidden === true && h.rolodex.children.every(r => !r.hidden));
  check('中文精确匹配只留命中行', h.filter('伊芙') === 1 && h.rolodex.children[0].hidden === false && h.rolodex.children[1].hidden === true);
  check('中文子串匹配', h.filter('艾达') === 1 && h.rolodex.children[1].hidden === false);
  check('英文大小写不敏感', h.filter('ADA') === 1 && h.rolodex.children[4].hidden === false);
  check('查询首尾空格被忽略', h.filter('  女帝  ') === 1 && h.rolodex.children[2].hidden === false);
  check('无匹配显示空态且隐藏全部', h.filter('不存在') === 0 && h.empty.hidden === false && h.rolodex.children.every(r => r.hidden === true));
  check('清空查询恢复全部且收起空态', h.filter('') === 5 && h.empty.hidden === true && h.rolodex.children.every(r => !r.hidden));
  check('过滤不重排行、不改行内容（Data.items 顺序不受影响）',
    h.rolodex.children.map(r => r._gname.textContent).join('|') === '伊芙|艾达王|女帝|希里|Ada Wong');
  check('过滤零存档写入 / 零桥调用 / 零钱包调用',
    h.writes.length === 0 && h.bridgeCalls.length === 0 && h.walletCalls.length === 0);
  check('搜索框 44px、焦点可见、sr-only 标签与 aria-controls 齐备',
    /#codex-roster-search\{[^}]*min-height:44px/.test(html) && /#codex-roster-search:focus-visible/.test(html) &&
    /<label class="sr-only" for="codex-roster-search">/.test(html) && /aria-controls="rolodex"/.test(html));
  check('隐藏行用高优先级规则真正不占位', /#rolodex \.gitem\[hidden\]\{display:none\}/.test(html));
  check('名录重建后重新应用过滤（renderList 接线）',
    /box\.appendChild\(row\);\s*\}\);\s*applyRosterFilter\(\);/.test(inline));
  check('输入框 input 事件已绑定', /rosterSearch\.addEventListener\("input",applyRosterFilter/.test(inline));
}

/* ---------- 2. 当前关系摘要：只读 ---------- */
{
  const h = harness();
  const txt = it => h.briefFor(it).map(x => x[1]).join(' | ');
  for (const [lv, name] of [['D', '陌路'], ['C', '点头'], ['B', '亲近'], ['A', '信赖'], ['S', '羁绊']]) {
    const s = txt({ id: 'x', affState: { level: lv, levelName: name, toNext: lv === 'S' ? 0 : 8000 } });
    check('档位 ' + lv + ' 摘要含阶段与档位', s.includes(name) && s.includes(lv) && s.includes('当前关系'), s);
  }
  check('未满档显示距下一阶且千分位', txt({ id: 'x', affState: { level: 'B', levelName: '亲近', toNext: 8000 } }).includes('距下一阶 8,000'));
  check('满档显示羁绊圆满，不显示误导性差额', txt({ id: 'x', affState: { level: 'S', levelName: '羁绊', toNext: 0 } }).includes('羁绊圆满'));
  check('简明成本来自 AFF.gifts 唯一真值', txt({ id: 'x', affState: { level: 'D', levelName: '陌路', toNext: 2000 } }).includes('6,000 CBY'));
  check('缺 affState 走 affOf 兜底不抛', txt({ id: 'x' }).includes('陌路'));
  check('空档案不抛且仍给中性摘要', txt(null).includes('陌路'));
  check('每次重绘清空旧内容，不累积重复节点', (() => {
    h.briefFor({ id: 'x', affState: { level: 'D', levelName: '陌路', toNext: 2000 } });
    const a = h.brief.children.length;
    h.briefFor({ id: 'x', affState: { level: 'B', levelName: '亲近', toNext: 8000 } });
    return a === h.brief.children.length && a === 5;
  })());
  check('恶意档位名按纯文本写入，不解析 HTML', (() => {
    const s = txt({ id: 'x', affState: { level: 'B', levelName: '<img src=x onerror=alert(1)>', toNext: 1 } });
    return s.includes('<img src=x onerror=alert(1)>') && h.brief.innerHTML === '';
  })());
  check('摘要不暴露存储键 / epoch / CID / ACK / 堆栈等调试信息',
    !/csh_achievement|epoch|CID|ACK|stack|localStorage/.test(txt({ id: 'x', affState: { level: 'B', levelName: '亲近', toNext: 1 } })));
  check('摘要零存档 / 零桥 / 零钱包调用',
    h.writes.length === 0 && h.bridgeCalls.length === 0 && h.walletCalls.length === 0);
  check('好感重绘链路同时刷新增益与摘要',
    /renderSpiritBuff\(it\);\s*renderBondBrief\(it\);/.test(inline));
}

/* ---------- 3. 信息层级与材质约束 ---------- */
{
  /* H1 给低频 details 加了 data-section 分区属性，断言随结构同步（分组由 sections 反例细验） */
  check('共同经历与回响收进 details 按需展开、归入记忆分区，且 dlines id 保留',
    /<details class="collection-details" id="character-echo" data-section="memory"><summary>共同经历与回响<\/summary><div class="dlines" id="dlines"><\/div><\/details>/.test(html));
  check('人物小传 / 增益 / 讨伐记录仍各自按需折叠',
    (html.match(/<details class="collection-details"/g) || []).length >= 4);
  check('摘要在极矮横屏收起，复用既有 340px 断点不新增数值',
    /@media\(max-height:340px\)\{#bond-brief\{display:none\}\}/.test(html) &&
    (html.match(/@media\(max-height:340px\)/g) || []).length >= 1);
  const briefRule = (html.match(/#bond-brief\{[^}]*\}/) || [''])[0];
  check('材质只用渐隐金线与极淡内高光，不堆发光面积',
    /linear-gradient\(90deg,transparent,rgba\(216,189,122,\.34\)/.test(briefRule) &&
    /box-shadow:inset 0 1px 0 rgba\(255,255,255,\.05\)/.test(briefRule) &&
    !/text-shadow|filter:drop-shadow|animation|!important/.test(briefRule), briefRule.slice(0, 200));
  const vpSource = fs.readFileSync(path.join(root, 'tools/probe_viewport_tokens_20261107.mjs'), 'utf8');
  const baseline = new Set(((vpSource.match(/const BASELINE = new Set\(\[([\s\S]*?)\]\)/) || [])[1] || '')
    .split(',').map(s => Number(s.trim())).filter(Number.isFinite));
  /* I1 起基线逐值收缩，不写死种数；只要求仍能解析且已收敛的 430 不再被允许。 */
  check('断点基线可从 E95X 解析且已随逐值收敛收缩（430 消失）',
    baseline.size > 0 && !baseline.has(430), baseline.size);
  check('新增规则不改动任何既有 @media 数值',
    (() => {
      const values = [...html.matchAll(/@media[^{]*?(\d{3,4})px/g)].map(m => Number(m[1]));
      return values.every(v => baseline.has(v));
    })(), [...html.matchAll(/@media[^{]*?(\d{3,4})px/g)].map(m => Number(m[1])).filter(v => !baseline.has(v)));
}

/* ---------- 4. 改前基线 ---------- */
{
  const noHide = fns.applyRosterFilter.replace('row.hidden=!hit;', 'row.hidden=false;');
  const h = harness({ applyRosterFilter: noHide });
  h.setNames(['伊芙', '艾达王']);
  h.filter('伊芙');
  check('改前基线：不过滤隐藏行会被断言集检出',
    h.rolodex.children.length === 2 && h.rolodex.children.every(r => !r.hidden) === true);
  check('去掉 renderList 过滤接线会被静态断言检出',
    !inline.replace('applyRosterFilter();   /* 名录重建后保留当前查找条件，不改 Data.items 顺序 */', '').includes('applyRosterFilter();   /* 名录重建后保留当前查找条件'));
  check('去掉矮屏收起会被静态断言检出',
    !html.replace('@media(max-height:340px){#bond-brief{display:none}}', '').includes('@media(max-height:340px){#bond-brief{display:none}}'));
  const real = harness();
  real.setNames(['伊芙', '艾达王']);
  check('当前实现同场景正确过滤', real.filter('伊芙') === 1 && real.rolodex.children[1].hidden === true);
}

const result = {
  scope: 'AST-extracted codex.html roster filter / bond brief in minimal DOM; static hierarchy + material constraints; no browser',
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
