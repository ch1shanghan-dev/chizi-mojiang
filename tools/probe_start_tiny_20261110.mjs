/* 极矮横屏（640×286）开局卡收进首屏 · 真实 Chromium 几何夹具（2026-11-10 · P2 牌桌呈现）
 *
 * 为什么需要它：≤350 档把结算层收好了，但开局页在 640×286 仍然溢出——德州卡底 307、
 * 廿一点 316（视口 286），最后那行折叠条「记录与牌桌偏好 / 庄家档案与牌局记录」只露出
 * 半截圆角。虽然 #view-start 能滚（不是不可达），但首屏看着像坏了。
 * 本夹具加载真实 games/texas/texas.html 与 games/blackjack/blackjack.html，
 * 锁「卡底落在首屏内 / 折叠条整条可见 / 容器不再出现滚动条 / 开始按钮仍是 44px」，
 * 并对 915×412 做对照（内边距必须仍是 10px 12px，一格都不许动）。
 *
 * 用法：node tools/probe_start_tiny_20261110.mjs [--out <dir>]
 * stdout 纯 JSON：{passed, failed, failures, output}
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withChromium } from './lib/chromium_audit.mjs';
import { auditTempRoot } from './lib/audit_scratch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(auditTempRoot(), 'start-tiny')));
fs.mkdirSync(out, { recursive: true });
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });

/* ---------- 静态 ---------- */
const duelCss = read('core/csh_duel_tables.css');
const block330 = (() => {
  const head = '@media(orientation:landscape) and (max-height:330px)';
  const i = duelCss.indexOf(head);
  if (i < 0) return '';
  /* 从 media 头开始做花括号计配，取整个 media 块（不要靠字符串猜结尾） */
  let depth = 0, j = duelCss.indexOf('{', i);
  for (let k = j; k < duelCss.length; k++) {
    if (duelCss[k] === '{') depth++;
    else if (duelCss[k] === '}') { depth--; if (depth === 0) return duelCss.slice(i, k + 1); }
  }
  return '';
})();
const rules330 = block330.replace(/\/\*[\s\S]*?\*\//g, '');
check('≤330 段存在开局卡压缩规则', /#view-start:not\(\.hidden\)\s*\{[^}]*padding:4px 10px/.test(rules330), rules330.slice(0, 120));
check('压缩规则同时压了卡片内边距与栅格行距', /\.start-card\s*\{[^}]*padding:4px 10px!important;gap:2px 10px!important/.test(rules330));
check('压缩只作用于德州/廿一点，不误伤斗地主与 UNO',
  /body:is\(\[data-csh-table="texas"\],\[data-csh-table="blackjack"\]\)/.test(rules330) &&
  !/doudizhu|uno/.test(rules330), rules330.slice(0, 160));
/* 上面那条基础规则是 `#view-start:not(.hidden)`；少写 :not(.hidden) 会输一档特异性，
   !important 也救不回来（≤500 那条 padding 规则对德州至今就是这么失效的）。 */
check('选择器带了 :not(.hidden)，否则被基础规则压住等于没写', /#view-start:not\(\.hidden\)/.test(rules330));

/* ---------- 运行时 ---------- */
const measure = `(()=>{
  const R=el=>{const r=el.getBoundingClientRect();return {t:Math.round(r.top),b:Math.round(r.bottom),h:Math.round(r.height),w:Math.round(r.width)};};
  const v=document.getElementById('view-start');
  const card=document.querySelector('#view-start .start-card');
  const rec=document.querySelector('#table-records,#dealer-records');
  const btn=document.getElementById('btn-start-game');
  return {vw:innerWidth,vh:innerHeight,
    card:card?R(card):null, rec:rec?R(rec):null, btn:btn?R(btn):null,
    cardPad:card?getComputedStyle(card).padding:null,
    cardGap:card?getComputedStyle(card).rowGap:null,
    vsScrolls:v.scrollHeight>v.clientHeight+1, vsSh:v.scrollHeight, vsCh:v.clientHeight,
    recHidden:rec?getComputedStyle(rec).display==='none':null};
})()`;

async function open(vp, page) {
  let m = null;
  await withChromium(vp, async send => {
    const val = async e => {
      const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    await send('Page.navigate', { url: pathToFileURL(path.join(root, page)).href });
    for (let i = 0; i < 200; i++) { if (await val('document.readyState==="complete"')) break; await new Promise(r => setTimeout(r, 50)); }
    await new Promise(r => setTimeout(r, 800));
    await val(`(()=>{const c=document.getElementById('btn-sign-cancel');if(c&&c.offsetParent)c.click();return 1;})()`);
    await new Promise(r => setTimeout(r, 300));
    m = await val(measure);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(out, `${path.basename(page, '.html')}-${vp.width}x${vp.height}.png`), Buffer.from(shot.data, 'base64'));
  });
  return m;
}

for (const [label, page] of [['德州', 'games/texas/texas.html'], ['廿一点', 'games/blackjack/blackjack.html']]) {
  const t = await open({ width: 640, height: 286 }, page);
  check(`640×286 ${label}：开局卡完整落在首屏内`, !!t && t.card && t.card.b <= t.vh, t && t.card);
  check(`640×286 ${label}：折叠条整条可见（不再只露半截圆角）`,
    !!t && t.rec && t.rec.b <= t.vh && t.rec.b - t.rec.t >= 40, t && t.rec);
  check(`640×286 ${label}：开局页不再出现纵向滚动条`, !!t && !t.vsScrolls, t && { sh: t.vsSh, ch: t.vsCh });
  check(`640×286 ${label}：开始按钮仍是 ≥44px 且可点`, !!t && t.btn && t.btn.h >= 44 && t.btn.b <= t.vh, t && t.btn);

  const b = await open({ width: 915, height: 412 }, page);
  check(`915×412 ${label}：卡内边距仍是 10px 12px（极矮屏规则没有外溢）`, !!b && b.cardPad === '10px 12px', b && b.cardPad);
  check(`915×412 ${label}：卡行距仍是 6px`, !!b && b.cardGap === '6px', b && b.cardGap);
  check(`915×412 ${label}：开局卡本来就在首屏内`, !!b && b.card && b.card.b <= b.vh, b && b.card);
}

const failures = rows.filter(r => !r.passed);
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ scope: 'real texas/blackjack start screens in isolated Chromium; 640x286 tiny vs 915x412 control', rows }, null, 2));
console.log(JSON.stringify({ passed: rows.length - failures.length, failed: failures.length, failures, output: out }, null, 2));
process.exitCode = failures.length ? 1 : 0;
