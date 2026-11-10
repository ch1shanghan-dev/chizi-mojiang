/* B2 · 四张牌桌页按钮补板 验收夹具（2026-11-10）
 *
 * 为什么需要它：这批改动是「把四桌按钮的纯 CSS 渐变换成生成的位图」，最怕四件事——
 *   ① 素材丢了 / 尺寸不对 / 体积超标；
 *   ② csh_art_v2.css 被改到既有行（:is(.seat-box,.opp,.pot) / .pcard.back /
 *      原有的 max-height:350px 结算面板块被插坏），或规则被沙箱重跑追加两遍；
 *   ③ 美术层不再是 head 内最后一个 stylesheet，或旧按钮 CSS 被删导致缺图没有回退；
 *   ④ 贴了底图之后文字被吃掉、按钮被压到 44px 以下、页面横向溢出。
 * 静态查「资产 + 基线哈希 + 规则唯一性 + 顺序 + 回退」；运行时用真实 Chromium
 * （file://，915×412，#btn-start-game 进对局）查「可见按钮实际生效的
 * background-image 含 art-v2/buttons/ + 按钮 ≥44px + 无横向溢出」，
 * 另在 640×286 极矮屏复查「≤350 高时主按钮仍 ≥44px」保底。
 *
 * 用法：node tools/probe_art_v2_buttons_20261110.mjs [--out <dir>]
 * stdout 纯 JSON：{passed, failed, failures, output}；失败 process.exitCode=1。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withChromium } from './lib/chromium_audit.mjs';
import { auditTempRoot } from './lib/audit_scratch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(auditTempRoot(), 'art-v2-buttons')));
fs.mkdirSync(out, { recursive: true });
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });

const PAGES = {
  texas: 'games/texas/texas.html',
  blackjack: 'games/blackjack/blackjack.html',
  doudizhu: 'games/doudizhu/doudizhu.html',
  uno: 'games/uno/uno.html',
};
const ASSETS = [
  'image/ui/art-v2/buttons/btn-gold.webp',
  'image/ui/art-v2/buttons/btn-bronze.webp',
];
const CSS_REL = 'core/csh_art_v2.css';
const MARKER = 'B2-BUTTONS-V2-20261110';
/* 追加前基线：git 跟踪的干净版本，6005 字节 / LF / 11 条 body[data-csh-table 规则 */
const BASELINE_LEN = 6005;
const BASELINE_SHA = '836686ed9367deea7fc2a6076021b16446ff146c13aaa09cf1acde51f8eaceb8';
const BASELINE_RULE_COUNT = 11;

/* 读 webP 尺寸：VP8X / VP8 / VP8L 三种头，避免引第三方解码库 */
function webpDims(buf) {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [1 + buf.readUIntLE(24, 3), 1 + buf.readUIntLE(27, 3)];
  if (kind === 'VP8 ') {
    const i = buf.indexOf(Buffer.from([0x9d, 0x01, 0x2a]), 20);
    if (i < 0 || i + 7 > buf.length) return null;
    return [buf.readUInt16LE(i + 3) & 0x3fff, buf.readUInt16LE(i + 5) & 0x3fff];
  }
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return [(b & 0x3fff) + 1, ((b >>> 14) & 0x3fff) + 1]; }
  return null;
}

/* ================= 静态 ================= */
for (const a of ASSETS) {
  const p = path.join(root, a);
  const exists = fs.existsSync(p);
  check('素材存在: ' + path.basename(a), exists, exists ? undefined : 'missing');
  const kb = exists ? fs.statSync(p).size / 1024 : Infinity;
  check('素材单张 ≤120 KB: ' + path.basename(a), kb <= 120, Math.round(kb * 10) / 10 + ' KB');
  let dims = null;
  try { dims = exists ? webpDims(fs.readFileSync(p)) : null; } catch (e) { /* 交给下面的断言 */ }
  check('素材为 512×128 webP: ' + path.basename(a), !!dims && dims[0] === 512 && dims[1] === 128, dims);
}

const cssBuf = fs.readFileSync(path.join(root, CSS_REL));
const css = cssBuf.toString('utf8');
const prefixCss = cssBuf.subarray(0, BASELINE_LEN).toString('utf8');
const sha = crypto.createHash('sha256').update(cssBuf.subarray(0, BASELINE_LEN)).digest('hex');

check('csh_art_v2.css 前 6005 字节 sha256 与基线一致（既有行一行未改）', sha === BASELINE_SHA, sha);
check('既有规则基线数量不变（body[data-csh-table 规则 = 11）',
  (prefixCss.match(/^body\[data-csh-table/gm) || []).length === BASELINE_RULE_COUNT,
  (prefixCss.match(/^body\[data-csh-table/gm) || []).length);
check('既有 :is(.seat-box,.opp,.pot) 与 .pcard.back 规则仍在',
  prefixCss.includes(':is(.seat-box, .opp, .pot)') && prefixCss.includes('.pcard.back {'));
check('原有 @media max-height:350px 结算面板块仍在',
  /@media \(orientation: landscape\) and \(max-height: 350px\)[\s\S]*?panel-dark\.webp/.test(prefixCss));

const idx = css.indexOf(MARKER);
const appended = idx >= 0 ? css.slice(idx) : '';
const appendedCode = appended.replace(/\/\*[\s\S]*?\*\//g, '');   // 判属性前先去注释
check('按钮规则追加块存在（marker）且仅出现一次',
  idx >= 0 && css.indexOf(MARKER, idx + 1) < 0, { idx, count: (css.match(new RegExp(MARKER, 'g')) || []).length });
check('追加块位于文件最后（排在原有 350px 块之后）',
  idx > prefixCss.lastIndexOf('@media (orientation: landscape) and (max-height: 350px)'));
check('追加块未覆盖座位板 / 牌背选择器', !/\.(seat-box|opp|pot|pcard)\b/.test(appendedCode));
check('主按钮底板 url 恰好 1 条', (appended.match(/btn-gold\.webp/g) || []).length === 1);
check('次按钮底板 url 恰好 1 条', (appended.match(/btn-bronze\.webp/g) || []).length === 1);
check('主按钮规则用 background-size: 100% 100%（不是 cover）',
  /background-size:\s*100% 100%/.test(appendedCode) && !/background-size:\s*cover/.test(appendedCode));
check('追加块未声明 background-color（保留原底色作缺图回退）', !/background-color\s*:/i.test(appendedCode));
check('追加块只声明一条 color，且是 .btn.small 深板金字（对比度修复）',
  (appendedCode.match(/(^|[;{\s])color\s*:/gim) || []).length === 1 &&
  /* 标记写在注释里，而 appendedCode 已去注释 —— 必须查原始块，别在去注释块里找 */
  appended.indexOf('B2-SMALL-CONTRAST') >= 0 &&
  appendedCode.indexOf('.btn.small:not(:disabled)') >= 0 &&
  appendedCode.indexOf('var(--gold-hi') >= 0);
check('追加块未改 padding / width / border / font-size / transform（不改点击区域与布局）',
  !/(^|[;{\s])(padding|width|border|font-size|line-height|transform|pointer-events)\s*:/im.test(appendedCode));
check('追加块只有一条 min-height，且是 44px 保底',
  (appendedCode.match(/min-height\s*:/g) || []).length === 1 && /min-height:\s*44px/.test(appendedCode));
check('追加块写清 ≤350 高保底：@media max-height:350px 内含 min-height:44px',
  /@media \(orientation: landscape\) and \(max-height: 350px\)[\s\S]*?min-height:\s*44px/.test(appendedCode)
  && /≥44px/.test(appended));
check('追加块使用现有稳定选择器（#view-start / #view-game / .btn.ghost / .btn.small）',
  appendedCode.includes('#view-start .btn:not(.ghost)') && appendedCode.includes('#view-game .btn:not(.ghost)')
  && appendedCode.includes('.btn.ghost:not(:disabled)') && appendedCode.includes('.btn.small:not(.ghost)'));

for (const [t, rel] of Object.entries(PAGES)) {
  const html = read(rel);
  const he = html.toLowerCase().indexOf('</head>');
  const head = he >= 0 ? html.slice(0, he) : html;
  const links = [...head.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/gi)].map(m => m[0]);
  const artLinks = links.filter(l => l.includes('csh_art_v2.css'));
  const last = links.length ? links[links.length - 1] : '';
  const pos = artLinks.length ? head.indexOf(artLinks[0]) : -1;
  const after = pos >= 0 ? head.slice(pos + artLinks[0].length) : head;
  const nothingAfter = !/<style\b/i.test(after) && !/<link[^>]+rel="stylesheet"/i.test(after);
  check(t + '：csh_art_v2.css 是 head 内最后一个 stylesheet 且其后无样式',
    artLinks.length === 1 && last.includes('csh_art_v2.css') && nothingAfter,
    { count: artLinks.length, last: last.slice(0, 100), nothingAfter });
  const body = (html.match(/<body\b[^>]*>/i) || [''])[0];
  check(t + '：body data-csh-table="' + t + '"',
    (body.match(/data-csh-table=/g) || []).length === 1 && body.includes('data-csh-table="' + t + '"'), body.slice(0, 160));
  check(t + '：旧按钮 CSS 仍在（缺图回退不白屏）',
    /background:\s*linear-gradient\(180deg, #e8cd8c, #c9a457\)/.test(html) && /\.btn\.ghost\s*\{/.test(html));
}

/* ================= 运行时 ================= */
const probe = `(()=>{
  const de=document.documentElement;
  /* 溢出量必须在插入任何临时节点之前取，否则探针自己会造成假溢出 */
  const overflowX=de.scrollWidth>innerWidth+1;
  const vis=[...document.querySelectorAll('button')].filter(b=>{
    const r=b.getBoundingClientRect(); const cs=getComputedStyle(b);
    return r.height>0&&r.width>0&&cs.visibility!=='hidden'&&cs.display!=='none'
      &&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth;
  });
  const info=vis.map(b=>{
    const cs=getComputedStyle(b); const r=b.getBoundingClientRect();
    const bg=String(cs.backgroundImage);
    return { cls:b.className, h:Math.round(r.height),
             plated:bg.includes('art-v2/buttons/'), gold:bg.includes('btn-gold.webp'),
             bronze:bg.includes('btn-bronze.webp'), bg:bg.slice(0,200),
             size:String(cs.backgroundSize) };
  });
  const plated=info.filter(x=>x.plated);
  const main=plated.filter(x=>!/ghost|small/.test(x.cls));
  const hs=vis.map(b=>Math.round(b.getBoundingClientRect().height));
  return {
    overflowX, w:innerWidth, h:innerHeight, visible:vis.length,
    platedCount:plated.length, goldCount:info.filter(x=>x.gold).length,
    bronzeCount:info.filter(x=>x.bronze).length,
    minAllH:hs.length?Math.min(...hs):44,
    minPlatedH:plated.length?Math.min(...plated.map(x=>x.h)):44,
    minMainH:main.length?Math.min(...main.map(x=>x.h)):44,
    platedSize100:plated.length?plated.every(x=>x.size.includes('100% 100%')):false,
    samples:plated.slice(0,6)
  };
})()`;

const runtime = {};
for (const [t, rel] of Object.entries(PAGES)) {
  try {
    await withChromium({ width: 915, height: 412 }, async send => {
      const val = async e => {
        const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
      };
      await send('Page.navigate', { url: pathToFileURL(path.join(root, rel)).href });
      for (let i = 0; i < 200; i++) { if (await val('document.readyState==="complete"')) break; await new Promise(r => setTimeout(r, 50)); }
      await new Promise(r => setTimeout(r, 700));
      const before = await val(probe);
      /* 先关掉可能挡住开局页的签到弹层，再进对局 */
      await val(`(()=>{const c=document.getElementById('btn-sign-cancel');if(c&&c.offsetParent)c.click();const b=document.getElementById('btn-start-game');if(b&&!b.disabled)b.click();return 1;})()`);
      await new Promise(r => setTimeout(r, 1800));
      const after = await val(probe);
      runtime[t] = { before, after };
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(out, t + '-915x412.png'), Buffer.from(shot.data, 'base64'));

      check(t + '：开局视图 ≥1 个可见按钮 computed background 含 art-v2/buttons/',
        before.platedCount >= 1, { platedCount: before.platedCount, visible: before.visible });
      check(t + '：开局视图可见按钮 ≥44px', before.minAllH >= 44, before.minAllH);
      check(t + '：915×412 开局视图无横向溢出', !before.overflowX, { w: before.w, h: before.h });
      check(t + '：对局视图可见按钮 ≥44px', after.minAllH >= 44, after.minAllH);
      check(t + '：915×412 对局视图无横向溢出', !after.overflowX, { w: after.w, h: after.h });
      const both = before.platedCount + after.platedCount;
      check(t + '：开局+对局至少一个可见按钮挂上生成底板', both >= 1, { before: before.platedCount, after: after.platedCount });
      if (both >= 1) {
        const m = after.platedCount >= 1 ? after : before;
        check(t + '：底板 computed background-size 为 100% 100%', m.platedSize100, m.platedSize100);
      }
    });
  } catch (e) {
    check(t + '：Chromium 运行时检查完成', false, String(e && e.stack || e));
  }
}

const gamePages = Object.entries(runtime).filter(([, v]) => v.after.platedCount >= 1).map(([k]) => k);
check('至少 2 页在 915×412 对局视图 computed background 含 art-v2/buttons/',
  gamePages.length >= 2, gamePages);
check('运行时两种底板都实际生效过（gold + bronze）',
  Object.values(runtime).some(v => v.before.goldCount + v.after.goldCount > 0)
  && Object.values(runtime).some(v => v.before.bronzeCount + v.after.bronzeCount > 0));
check('至少 2 页满足「底板 + ≥44px + 无横向溢出」全条件',
  Object.values(runtime).filter(v =>
    (v.before.platedCount + v.after.platedCount) >= 1 && v.before.minAllH >= 44 && v.after.minAllH >= 44
    && !v.before.overflowX && !v.after.overflowX).length >= 2);

/* 极矮屏保底：640×286（≤350 高）复查主按钮仍 ≥44px */
const tiny = {};
for (const t of ['blackjack', 'doudizhu']) {
  try {
    await withChromium({ width: 640, height: 286 }, async send => {
      const val = async e => {
        const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
      };
      await send('Page.navigate', { url: pathToFileURL(path.join(root, PAGES[t])).href });
      for (let i = 0; i < 200; i++) { if (await val('document.readyState==="complete"')) break; await new Promise(r => setTimeout(r, 50)); }
      await new Promise(r => setTimeout(r, 700));
      await val(`(()=>{const c=document.getElementById('btn-sign-cancel');if(c&&c.offsetParent)c.click();const b=document.getElementById('btn-start-game');if(b&&!b.disabled)b.click();return 1;})()`);
      await new Promise(r => setTimeout(r, 1600));
      const m = await val(probe);
      tiny[t] = { minMainH: m.minMainH, minAllH: m.minAllH, platedCount: m.platedCount, w: m.w, h: m.h };
      check(t + '：640×286 极矮屏（≤350 高）主按钮仍 ≥44px', m.minMainH >= 44, tiny[t]);
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      fs.writeFileSync(path.join(out, t + '-640x286.png'), Buffer.from(shot.data, 'base64'));
    });
  } catch (e) {
    check(t + '：640×286 极矮屏运行时检查完成', false, String(e && e.stack || e));
  }
}

/* ================= 汇总 ================= */
const failures = rows.filter(r => !r.passed);
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({
  scope: 'four table pages, 915x412 + 640x286, art-v2/buttons assets',
  rows, runtime, tiny,
  summary: {
    gamePagesWithPlate: gamePages,
    minAllH: Math.min(...Object.values(runtime).flatMap(v => [v.before.minAllH, v.after.minAllH])),
    minPlatedH: Math.min(...Object.values(runtime).flatMap(v => [v.before.minPlatedH, v.after.minPlatedH])),
  },
}, null, 2));
console.log(JSON.stringify({ passed: rows.length - failures.length, failed: failures.length, failures, output: out }, null, 2));
process.exitCode = failures.length ? 1 : 0;
