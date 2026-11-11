/* UI 全局巡检 · 运行时报错 / 缺图 / 溢出 / 触控（2026-11-11）
 *
 * 为什么需要：作者要求「检查有没有 BUG 报错和 UI 美术缺陷」。
 * 静态断言查不到「页面打开瞬间抛异常」「某张位图 404」「按钮被压到 44px 以下」，
 * 这些恰恰是美术批次最容易留的尾巴。本夹具在真实 Chromium 里打开全部页面，
 * 用 addScriptToEvaluateOnNewDocument 注入错误收集器，再逐页取真值。
 *
 * 用法：node tools/probe_ui_smoke_20261111.mjs [--out <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withChromium } from './lib/chromium_audit.mjs';
import { auditTempRoot } from './lib/audit_scratch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(auditTempRoot(), 'ui-smoke')));
fs.mkdirSync(out, { recursive: true });
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });
const save = (o) => { try { fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(o, null, 2)); } catch (e) {} };

const TABLES = [
  ['texas', 'games/texas/texas.html'], ['blackjack', 'games/blackjack/blackjack.html'],
  ['doudizhu', 'games/doudizhu/doudizhu.html'], ['uno', 'games/uno/uno.html'],
];
const PAGES = [
  ['achv', 'games/achv.html'], ['bossbook', 'games/bossbook.html'],
  ['career', 'games/career.html'], ['codex', 'games/codex.html'],
  ['goldfish', 'games/goldfish.html'], ['rank', 'games/rank.html'], ['save', 'games/save.html'],
];
/* file:// 下宿主桥不存在，这几类提示属预期，不算产品报错 */
const IGNORE = [
  /图鉴暂未读取成功/, /读取失败/, /noname/, /lib is not defined/,
  /Failed to load resource/i, /net::ERR_FILE_NOT_FOUND/i,
];

const HOOK = `(() => {
  window.__cshErr = [];
  window.addEventListener('error', function (e) {
    window.__cshErr.push('error:' + String(e.message || ''));
  }, true);
  window.addEventListener('unhandledrejection', function (e) {
    window.__cshErr.push('reject:' + String(e.reason && e.reason.message || e.reason || ''));
  });
  const orig = console.error;
  console.error = function () {
    try { window.__cshErr.push('console:' + Array.from(arguments).map(String).join(' ').slice(0, 240)); } catch (e) {}
    return orig.apply(console, arguments);
  };
})();`;

const PROBE = `(() => {
  const de = document.documentElement;
  const imgs = [...document.querySelectorAll('img')];
  const broken = imgs.filter(i => i.getAttribute('src') && i.complete && i.naturalWidth === 0)
    .map(i => i.getAttribute('src')).slice(0, 8);
  const btns = [...document.querySelectorAll('button')].filter(b => {
    const r = b.getBoundingClientRect();
    return r.height > 0 && getComputedStyle(b).visibility !== 'hidden';
  });
  const small = btns.filter(b => b.getBoundingClientRect().height < 43.5).length;
  return {
    errs: (window.__cshErr || []).slice(0, 10),
    broken, imgCount: imgs.length,
    overflowX: de.scrollWidth > innerWidth + 1,
    small, btnCount: btns.length,
    bodyBg: getComputedStyle(document.body).backgroundImage.slice(0, 120)
  };
})()`;

async function visit(label, rel, width, height) {
  return await withChromium({ width, height }, async (send) => {
    const val = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    await send('Page.enable');
    await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    await send('Page.navigate', { url: pathToFileURL(path.join(root, rel)).href });
    for (let i = 0; i < 200; i++) {
      if (await val('document.readyState === "complete"')) break;
      await new Promise(r => setTimeout(r, 50));
    }
    await new Promise(r => setTimeout(r, 650));
    /* 关掉可能挡住内容的签到弹层，但不清错误收集器 */
    await val(`(()=>{const c=document.getElementById('btn-sign-cancel');if(c&&c.offsetParent)c.click();return 1;})()`);
    await new Promise(r => setTimeout(r, 200));
    const m = await val(PROBE);
    const real = (m.errs || []).filter(e => !IGNORE.some(re => re.test(e)));
    check(`${label}@${width}x${height}：无 JS 运行时报错`, real.length === 0, real);
    check(`${label}@${width}x${height}：无加载失败的图片`, m.broken.length === 0, m.broken);
    check(`${label}@${width}x${height}：无横向溢出`, !m.overflowX, m.overflowX);
    check(`${label}@${width}x${height}：可见按钮均 ≥44px`, m.small === 0, { small: m.small, total: m.btnCount });
    return { label, vp: `${width}x${height}`, errs: real, broken: m.broken, small: m.small, imgCount: m.imgCount, btnCount: m.btnCount, bg: m.bodyBg };
  });
}

const summary = [];
try {
  for (const [label, rel] of TABLES) {
    summary.push(await visit(label, rel, 915, 412));
    summary.push(await visit(label, rel, 640, 286));
  }
  for (const [label, rel] of PAGES) summary.push(await visit(label, rel, 915, 412));
} catch (e) {
  check('巡检过程本身未抛异常', false, String(e && e.message));
}
check('全部页面都跑到了', summary.length === 15, summary.length);
check('页面确实加载了位图美术（抽查四桌/功能页背景）',
  summary.filter(s => s.bg && s.bg !== 'none').length >= 2,
  summary.filter(s => s.bg && s.bg !== 'none').map(s => s.label));

const failures = rows.filter(r => !r.passed);
save({ rows, pages: summary });
console.log(JSON.stringify({ passed: rows.length - failures.length, failed: failures.length, failures, output: out, pages: summary }, null, 2));
process.exitCode = failures.length ? 1 : 0;
