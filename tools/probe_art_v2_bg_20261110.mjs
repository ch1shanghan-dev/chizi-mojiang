/* B3 功能页位图背景 验收夹具（2026-11-10）
 *
 * 为什么需要它：这批改动是「把 7 张功能页的纯色/渐变底换成生成的位图」，最怕三件事——
 *   ① 背景样式表被 head 里排在它后面的表盖掉（这几页尾部还挂着 journal/collection/records，
 *      顺序决定胜负，肉眼完全看不出差别）；
 *   ② 图丢了 / 路径错 / 体积超标；
 *   ③ 为了压背景把回退底色写死成黑，或把页面挤溢出、按钮压小。
 * 本夹具静态查「资产 + 顺序 + 属性 + 回退」，运行时用真实 Chromium（file://）查
 * 「一冷一暖两页实际生效的 background-image 就是 art-v2/bg/ 那张 + 不溢出 + 按钮仍 44px」。
 *
 * 用法：node tools/probe_art_v2_bg_20261110.mjs [--out <dir>]
 * stdout 纯 JSON：{passed, failed, failures, output}
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withChromium } from './lib/chromium_audit.mjs';
import { auditTempRoot } from './lib/audit_scratch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(auditTempRoot(), 'art-v2-bg')));
fs.mkdirSync(out, { recursive: true });
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });

/* 冷 / 暖 分配：与作者口径一致 */
const PAGES = {
  'achv.html': 'cool', 'bossbook.html': 'cool', 'career.html': 'cool',
  'codex.html': 'warm', 'goldfish.html': 'warm', 'save.html': 'warm',
};
/* 天下榜是七页里唯一的浅色纸页（--paper:#f5efe0 + 深墨 --ink:#2f2a22）。
   铺深色位图后 body 级标题/页脚会变成深字压深底，实测对比度崩坏；
   刻意保留原纸页主题，只留 stylesheet link（样式表对无 data-csh-bg 的页面无作用）。 */
const EXCLUDED = ['rank.html'];
/* 运行时至少 2 页、一冷一暖：挑两页 button 有全局 min-height:44px 的，最稳 */
const RUNTIME = [['achv.html', 'cool'], ['codex.html', 'warm']];
const ASSETS = ['image/ui/art-v2/bg/cool.webp', 'image/ui/art-v2/bg/warm.webp'];

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

/* ---------- 静态 ---------- */
for (const a of ASSETS) {
  const p = path.join(root, a);
  const exists = fs.existsSync(p);
  check('资产存在: ' + a, exists, exists ? undefined : 'missing');
  const kb = exists ? fs.statSync(p).size / 1024 : Infinity;
  check('资产 ≤200 KB: ' + path.basename(a), kb <= 200, Math.round(kb * 10) / 10 + ' KB');
}
try {
  const dims = ASSETS.map(a => webpDims(fs.readFileSync(path.join(root, a))));
  check('两张资产均为 1600×1000 webP', dims.every(d => d && d[0] === 1600 && d[1] === 1000), dims);
} catch (e) { check('两张资产均为 1600×1000 webP', false, String(e)); }

const css = read('core/csh_bg_v2.css');
const cssCode = css.replace(/\/\*[\s\S]*?\*\//g, ''); // 判「是否写死 background-color」要先去注释
check('CSS 含 cool / warm 两个选择器',
  cssCode.includes('body[data-csh-bg="cool"]') && cssCode.includes('body[data-csh-bg="warm"]'));
check('CSS 使用 background-size:cover', /background-size\s*:\s*cover/.test(cssCode));
check('CSS 引用 art-v2/bg/cool.webp 与 warm.webp',
  /art-v2\/bg\/cool\.webp/.test(cssCode) && /art-v2\/bg\/warm\.webp/.test(cssCode));
check('CSS 叠了轻暗角/压暗渐变', /radial-gradient/.test(cssCode));
check('CSS 保留缺图回退：未写死 background-color', !/background-color\s*:/i.test(cssCode));
check('CSS 含缺图回退说明（回退/fallback）', /回退|fallback/i.test(css));

for (const [name, tone] of Object.entries(PAGES)) {
  const html = read('games/' + name);
  const he = html.toLowerCase().indexOf('</head>');
  const head = he >= 0 ? html.slice(0, he) : html;
  const links = [...head.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/gi)].map(m => m[0]);
  const bgLinks = links.filter(l => l.includes('csh_bg_v2.css'));
  const last = links.length ? links[links.length - 1] : '';
  /* 不仅要是最后一个 <link>，还要确认它之后没有 <style>/<link stylesheet> —— 顺序决定胜负 */
  const idx = bgLinks.length ? head.indexOf(bgLinks[0]) : -1;
  const after = idx >= 0 ? head.slice(idx + bgLinks[0].length) : head;
  const nothingAfter = !/<style\b/i.test(after) && !/<link[^>]+rel="stylesheet"/i.test(after);
  check(name + '：csh_bg_v2.css link 唯一且是 head 内最后一个 stylesheet',
    bgLinks.length === 1 && last.includes('csh_bg_v2.css') && nothingAfter,
    { count: bgLinks.length, last: last.slice(0, 100), nothingAfter });

  const m = html.match(/<body\b[^>]*>/i);
  const tag = m ? m[0] : '';
  check(name + '：body data-csh-bg="' + tone + '"',
    (tag.match(/data-csh-bg=/g) || []).length === 1 && tag.includes('data-csh-bg="' + tone + '"'),
    tag.slice(0, 160));
}

for (const name of EXCLUDED) {
  const html = read('games/' + name);
  const he = html.toLowerCase().indexOf('</head>');
  const head = he >= 0 ? html.slice(0, he) : html;
  const links = [...head.matchAll(/<link[^>]+rel="stylesheet"[^>]*>/gi)].map(m => m[0]);
  check(name + '：csh_bg_v2.css link 仍在且唯一', links.filter(l => l.includes('csh_bg_v2.css')).length === 1);
  const tag = (html.match(/<body\b[^>]*>/i) || [''])[0];
  check(name + '：浅色纸页刻意不贴深底（深墨字对比度优先）',
    !/data-csh-bg=/.test(tag) && /--paper\s*:/.test(html), tag.slice(0, 160));
}

/* ---------- 运行时 ---------- */
const probe = `(()=>{
  const de=document.documentElement;
  const overflowX = de.scrollWidth > innerWidth + 1;   /* 溢出量先取，避免探针自身造成假溢出 */
  const cs = getComputedStyle(document.body);
  const btns=[...document.querySelectorAll('button')].filter(b=>b.getBoundingClientRect().height>0);
  const minBtn = btns.length ? Math.min(...btns.map(b=>Math.round(b.getBoundingClientRect().height))) : -1;
  return {
    bg: cs.backgroundImage,
    bgColor: cs.backgroundColor,
    overflowX,
    minBtn,
    btnCount: btns.length,
    w: innerWidth, h: innerHeight
  };
})()`;

const runtimeBg = {};
const runtimeMetrics = {};
for (const [name, tone] of RUNTIME) {
  try {
    await withChromium({ width: 915, height: 412 }, async send => {
      const val = async e => {
        const r = await send('Runtime.evaluate', { expression: e, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
      };
      await send('Page.navigate', { url: pathToFileURL(path.join(root, 'games', name)).href });
      for (let i = 0; i < 200; i++) { if (await val('document.readyState==="complete"')) break; await new Promise(r => setTimeout(r, 50)); }
      await new Promise(r => setTimeout(r, 600));
      const m = await val(probe);
      runtimeBg[name] = String(m.bg).slice(0, 260);
      runtimeMetrics[name] = { w: m.w, h: m.h, overflowX: m.overflowX, minBtn: m.minBtn, btnCount: m.btnCount, bgColor: m.bgColor };
      check(name + '：computed background-image 含 art-v2/bg/' + tone + '.webp',
        String(m.bg).includes('art-v2/bg/') && String(m.bg).includes(tone + '.webp'), runtimeBg[name]);
      check(name + '：915×412 无横向溢出', !m.overflowX, { w: m.w, h: m.h, scrollWidth: String(m.overflowX) });
      check(name + '：可见按钮 ≥44px', m.minBtn >= 44, { minBtn: m.minBtn, btnCount: m.btnCount });
      try {
        const shot = await send('Page.captureScreenshot', { format: 'png' });
        fs.writeFileSync(path.join(out, name.replace('.html', '') + '-915x412.png'), Buffer.from(shot.data, 'base64'));
      } catch (e) { /* 截图不是断言，失败不影响结论 */ }
    });
  } catch (e) {
    check(name + '：Chromium 运行时检查完成', false, String(e && e.stack || e));
  }
}
check('运行时两页恰好一冷一暖', new Set(RUNTIME.map(r => r[1])).size === 2, RUNTIME.map(r => r[0] + ':' + r[1]));

/* ---------- 汇总 ---------- */
const failures = rows.filter(r => !r.passed);
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({
  scope: '7 functional pages, 915x412, art-v2/bg assets', rows, runtimeBg, runtimeMetrics,
}, null, 2));
console.log(JSON.stringify({ passed: rows.length - failures.length, failed: failures.length, failures, output: out }, null, 2));
process.exitCode = failures.length ? 1 : 0;
