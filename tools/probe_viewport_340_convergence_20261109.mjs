/* P2 · height:340 家族收敛的可复用 Chromium 几何夹具（2026-11-09）
 *
 * 为什么需要它：I1（2026-11-08）用的是一次性 D 盘夹具，没进仓库，
 * 之后每批收敛 @media 都是裸改。本探针把「改前/改后同组横屏几何比对」固化下来。
 *
 * 真值：games/codex.html 里真实的 <style> 块（不是复制出来的假 CSS）。
 * 视口：三档标准横屏 + 变化区间 331–340 + 边界 330。
 * 用途：
 *   node tools/probe_viewport_340_convergence_20261109.mjs --out <before.json>
 *   node tools/probe_viewport_340_convergence_20261109.mjs --out <after.json> --expect-migrated
 * 内置 BASELINE 是改前实测几何；日常门禁直接跑，不依赖外部旧文件。
 * stdout 纯 JSON；--out 另存逐项结果与截图。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withChromium } from './lib/chromium_audit.mjs';
import { auditTempRoot, removeAuditScratch } from './lib/audit_scratch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(auditTempRoot(), 'viewport-340.json')));
const expectMigrated = process.argv.includes('--expect-migrated');
const rows = [];
const measurements = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, detail: ok ? undefined : detail });

const html = fs.readFileSync(path.join(root, 'games/codex.html'), 'utf8');
/* 真实样式：把页面所有 <style> 块原样拼进夹具；底座样式放前面，让真实规则优先。 */
const styles = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const base = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:#101a17;color:#eee6d5;font-family:"Microsoft YaHei",sans-serif}
#bond-brief{display:block;padding:8px}
.dnav{display:flex;gap:8px;padding:8px}
#codex-skin-dialog .skin-panel{padding:18px}
#codex-skin-dialog .skin-body{margin-top:14px;gap:16px}
#main-action{box-sizing:border-box;min-height:44px;min-width:96px;padding:8px 14px;
 border:1px solid #89744d;background:#263230;color:#eee6d5;font:inherit}
</style><style>${styles}</style>
<div id="codex-skin-dialog"><div class="skin-panel"><div class="skin-body">装扮面板</div></div></div>
<div id="bond-brief">关系摘要</div>
<nav class="dnav"><span>相处</span><span>记忆</span><span>档案</span></nav>
<button id="main-action" type="button">继续本局</button>`;

const temp = fs.mkdtempSync(path.join(auditTempRoot(), 'csh-vp340-'));
const file = path.join(temp, 'index.html');
fs.writeFileSync(file, base);
fs.mkdirSync(path.dirname(out), { recursive: true });

/* 改前实测基线（本文件首次用 --out before.json 跑出来后回填）。
   只锁「不受本次收敛影响的视口」：≤330 与三档标准横屏。 */
const BASELINE = Object.freeze({
  '640x286': { overflow: true, bondBrief: 'none', dnav: 'none', skinPad: '10px', btnH: 44 },
  '915x412': { overflow: true, bondBrief: 'flex', dnav: 'flex', skinPad: '14px', btnH: 44 },
  '1365x768': { overflow: true, bondBrief: 'flex', dnav: 'flex', skinPad: '14px', btnH: 44 },
  '915x330': { overflow: true, bondBrief: 'none', dnav: 'none', skinPad: '10px', btnH: 44 }
});

const measure = `(()=>{
 const cs=s=>getComputedStyle(document.querySelector(s));
 const r=document.getElementById('main-action').getBoundingClientRect();
 return {
  overflow: document.documentElement.scrollWidth<=innerWidth,
  bondBrief: cs('#bond-brief').display,
  dnav: cs('.dnav').display,
  skinPad: cs('#codex-skin-dialog .skin-panel').paddingTop,
  btnH: Math.round(r.height*100)/100,
  btnW: Math.round(r.width*100)/100,
  btnInView: r.top>=0 && r.bottom<=innerHeight && r.left>=0 && r.right<=innerWidth,
  vw: innerWidth, vh: innerHeight
 };
})()`;

const viewports = [
  { width: 640, height: 286 },   /* 极矮横屏：低于 330，收敛前后都应保持紧凑 */
  { width: 915, height: 412 },   /* 一般矮横屏 */
  { width: 1365, height: 768 },  /* 桌面 */
  { width: 915, height: 335 },   /* 变化区间：331–340，本次真正会变的一档 */
  { width: 915, height: 330 }    /* 边界：≤330 仍应紧凑 */
];

try {
  for (const vp of viewports) {
    await withChromium(vp, async send => {
      const val = async expression => {
        const r = await send('Runtime.evaluate', { expression, returnByValue: true });
        if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
      };
      await send('Page.navigate', { url: pathToFileURL(file).href });
      for (let i = 0; i < 100 && !await val('document.readyState==="complete" && !!document.getElementById("main-action")'); i++)
        await new Promise(r => setTimeout(r, 30));
      const m = await val(measure);
      const tag = vp.width + '×' + vp.height;
      measurements.push({ viewport: vp.width + 'x' + vp.height, ...m });
      check(tag + '：页面无横向溢出', m.overflow, m);
      check(tag + '：主按钮首屏可见且 ≥44px 触控目标', m.btnInView && m.btnH >= 44, m);
      if (BASELINE[vp.width + 'x' + vp.height]) {
        const b = BASELINE[vp.width + 'x' + vp.height];
        check(tag + '：不受收敛影响的视口几何与改前完全一致',
          Object.keys(b).every(k => m[k] === b[k]), { expected: b, actual: m });
      }
      /* 335 落在 331–340：收敛前紧凑规则生效，收敛后应恢复常规布局。 */
      if (expectMigrated && vp.height === 335) {
        check('915×335：收敛后不再套用 330 档紧凑规则（与常规横屏一致）',
          m.bondBrief === 'flex' && m.dnav === 'flex' && m.skinPad === '14px', m);
      }
    });
  }
} finally {
  removeAuditScratch(temp);
}

/* 静态：CSS @media 与脚本 matchMedia 必须一起改，否则 JS 判 compact 而 CSS 不判。 */
const css340 = (html.match(/@media\(max-height:340px\)/g) || []).length;
const js340 = (html.match(/matchMedia\("\(max-height:340px\)"\)/g) || []).length;
const css330 = (html.match(/@media\(max-height:330px\)/g) || []).length;
const js330 = (html.match(/matchMedia\("\(max-height:330px\)"\)/g) || []).length;
if (expectMigrated) {
  check('codex.html 已无 340 断点（CSS 与 matchMedia 一起清干净）', css340 === 0 && js340 === 0, { css340, js340 });
  check('codex.html 的 330 规则同时覆盖 CSS 与 matchMedia', css330 === 3 && js330 === 2, { css330, js330 });
} else {
  check('改前基线：340 家族确实是 3 条 CSS + 2 条 matchMedia', css340 === 3 && js340 === 2, { css340, js340 });
}

const result = {
  scope: 'real codex.html <style> in isolated Chromium; 5 landscape viewports incl. 331-340 change band; no full game host',
  expectMigrated, passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed).length,
  failures: rows.filter(r => !r.passed), measurements, rows
};
fs.writeFileSync(out, JSON.stringify(result, null, 2));
console.log(JSON.stringify({ out, expectMigrated, passed: result.passed, failed: result.failed, failures: result.failures }));
if (result.failed) process.exitCode = 1;
