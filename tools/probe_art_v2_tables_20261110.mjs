/* UI 美术层 v2（B1 牌桌材质 · 牌背）验收夹具（2026-11-10）
 *
 * 为什么需要它：这批改动是「把 CSS 画的渐变换成生成的位图」，最怕三件事——
 *   ① 美术层被后面的样式表盖掉（csh_trick_tables.css 就是后来才加的一张，曾把四桌的
 *      background 又写回渐变，页面看着没变却以为「已接入」）；
 *   ② 图丢了/路径错，页面直接变黑；
 *   ③ 接入后把牌面、文字、按钮挤坏。
 * 本夹具同时管这三件：静态查「图片存在 + 美术层是 head 内最后一个样式表 + 旧渐变仍在」，
 * 运行时查「四桌实际生效的 background-image 就是 art-v2 的那张 + 暗牌用新牌背 + 不溢出 + 按钮仍 44px」。
 *
 * 用法：node tools/probe_art_v2_tables_20261110.mjs [--out <dir>]
 * stdout 纯 JSON：{passed, failed, failures, output}
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withChromium } from './lib/chromium_audit.mjs';
import { auditTempRoot } from './lib/audit_scratch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(auditTempRoot(), 'art-v2-tables')));
fs.mkdirSync(out, { recursive: true });
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });

/* ---------- 静态 ---------- */
const TABLES = ['texas', 'blackjack', 'doudizhu', 'uno'];
const PAGES = { texas: 'games/texas/texas.html', blackjack: 'games/blackjack/blackjack.html', doudizhu: 'games/doudizhu/doudizhu.html', uno: 'games/uno/uno.html' };
const artCss = read('core/csh_art_v2.css');

check('美术层含四桌毡面规则', TABLES.every(t => artCss.includes(`body[data-csh-table="${t}"]`)), TABLES.filter(t => !artCss.includes(`body[data-csh-table="${t}"]`)));
check('美术层含牌背与座位板材质', /cards\/back\.webp/.test(artCss) && /plates\/plate-bronze\.webp/.test(artCss));

const assets = [];
for (const t of TABLES) assets.push(`image/ui/art-v2/tables/${t}.webp`);
assets.push('image/ui/art-v2/cards/back.webp', 'image/ui/art-v2/plates/plate-bronze.webp');
let total = 0, biggest = 0, missing = [];
for (const a of assets) {
  const p = path.join(root, a);
  if (!fs.existsSync(p)) { missing.push(a); continue; }
  const kb = fs.statSync(p).size / 1024;
  total += kb; biggest = Math.max(biggest, kb);
}
check('七张资产齐全', missing.length === 0, missing);
check('单张 ≤200 KB', biggest <= 200, { biggest: Math.round(biggest) });
check('合计 ≤3 MB', total <= 3072, { totalKB: Math.round(total) });

/* 美术层必须是 head 内最后一个样式表：四页都有「后来的表格样式」把它盖回去的先例，
   只写规则不锁顺序＝随时可能静默失效。 */
for (const t of TABLES) {
  const html = read(PAGES[t]);
  const head = html.slice(0, html.toLowerCase().indexOf('</head>'));
  const links = [...head.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/g)].map(m => m[0]);
  check(`${t}：美术层是 head 内最后一个样式表`, links.length > 0 && links[links.length - 1].includes('csh_art_v2.css'), links[links.length - 1]);
}

/* 回退：旧渐变必须留着，缺图时接管 */
check('旧渐变仍在（缺图回退不白屏）',
  /radial-gradient/.test(read('core/csh_duel_tables.css')) && /radial-gradient/.test(read('core/csh_trick_tables.css')));

/* ---------- 大厅图标（B2） ---------- */
const ICONS=['career','boss','rank','bag','achievement','texas','doudizhu','blackjack','uno','goldfish','codex'];
let icoTotal=0, icoMissing=[];
for (const n of ICONS) { const f=path.join(root,'image/ui/art-v2/icons',n+'.webp'); if(!fs.existsSync(f)){icoMissing.push(n);continue;} icoTotal+=fs.statSync(f).size; }
check('11 枚大厅图标齐全', icoMissing.length===0, icoMissing);
check('图标体积合理（合计 ≤120 KB）', icoTotal<=120*1024, Math.round(icoTotal/1024));
const dmap=read('core/csh_debug.js').match(/var art=\{[^}]*\}\[title\]/)?.[0] || '';
const artNames=(dmap.match(/"([a-z]+)\.webp"/g)||[]).map(x=>x.slice(1,-6));
check('11 个模块各配唯一图标（不再共用 9 张旧图）', artNames.length===11 && new Set(artNames).size===11, artNames);

/* ---------- 结算金线框（B2 九宫格替代方案） ---------- */
const framePath=path.join(root,'image/ui/art-v2/panels/frame.webp');
check('金线框资产存在且 ≤200 KB', fs.existsSync(framePath) && fs.statSync(framePath).size<=200*1024,
  fs.existsSync(framePath)?Math.round(fs.statSync(framePath).size/1024):'missing');
check('金线框挂在结算面板上，且极矮屏有收起规则',
  /csh-result \.rs-panel \{[\s\S]*?frame\.webp/.test(artCss) &&
  /@media \(orientation: landscape\) and \(max-height: 350px\)[\s\S]*?panel-dark\.webp/.test(artCss));

/* ---------- 运行时 ---------- */
const probe = `(()=>{
  const de=document.documentElement;
  /* 溢出量必须在插入临时节点之前取，否则探针自己会造成假溢出 */
  const overflowX0=de.scrollWidth>innerWidth+1;
  const felt=document.querySelector('#view-game .felt')||document.querySelector('#view-game');
  /* 底牌是叫分阶段才有、摊牌后就没了：不依赖牌局状态，用临时节点查 CSS 规则本身 */
  let back=document.querySelector('.pcard.back');
  let tmp=null;
  if(!back){tmp=document.createElement('div');tmp.className='pcard back';document.body.appendChild(tmp);back=tmp;}
  const cs=felt?getComputedStyle(felt):null;
  const btn=[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().height>0);
  return {
    bg: cs?cs.backgroundImage:'',
    backBg: back?getComputedStyle(back).backgroundImage:'',
    tmpUsed:!!tmp,
    overflowX: overflowX0,
    minBtn: btn.length?Math.min(...btn.map(b=>Math.round(b.getBoundingClientRect().height))):44,
    feltFound:!!felt
  };
})()`;

for (const t of TABLES) {
  await withChromium({ width: 915, height: 412 }, async send => {
    const val = async e => {
      const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    await send('Page.navigate', { url: pathToFileURL(path.join(root, PAGES[t])).href });
    for (let i = 0; i < 200; i++) { if (await val('document.readyState==="complete"')) break; await new Promise(r => setTimeout(r, 50)); }
    await new Promise(r => setTimeout(r, 700));
    await val(`(()=>{const c=document.getElementById('btn-sign-cancel');if(c&&c.offsetParent)c.click();return 1;})()`);
    await val(`(()=>{const b=document.getElementById('btn-start-game');if(b&&!b.disabled)b.click();return 1;})()`);
    await new Promise(r => setTimeout(r, 1600));
    const m = await val(probe);
    await val(`(()=>{const t=document.querySelector('body > div.pcard.back');if(t&&t.children.length===0&&!t.textContent.trim())t.remove();return 1;})()`);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(out, `${t}-915x412.png`), Buffer.from(shot.data, 'base64'));

    check(`${t}：实际生效的是 art-v2 毡面`, m.feltFound && m.bg.includes(`art-v2/tables/${t}.webp`), String(m.bg).slice(0, 120));
    check(`${t}：页面无横向溢出`, !m.overflowX);
    check(`${t}：按钮仍 ≥44px`, m.minBtn >= 44, m.minBtn);
    if (t !== 'uno') check(`${t}：暗牌用实体牌背`, m.backBg.includes('art-v2/cards/back.webp'), String(m.backBg).slice(0, 120));
  });
}

const failures = rows.filter(r => !r.passed);
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ scope: 'real four table pages, 915x412, art-v2 assets', rows, totalKB: Math.round(total) }, null, 2));
console.log(JSON.stringify({ passed: rows.length - failures.length, failed: failures.length, failures, output: out }, null, 2));
process.exitCode = failures.length ? 1 : 0;
