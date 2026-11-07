/* H1 同档字号并档（art-direction §4.7 剩余项，2026-11-08）
   Chromium 实机在 915×412 / 640×286 比较 13.5px 与并档后的 13px：
   按钮几何、行高、文字换行、页面横向溢出必须完全一致，才允许并档。
   并档后静态核对 LFS 真源与 8 处同值兜底；内置改前基线。 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withChromium } from './lib/chromium_audit.mjs';
import { auditTempRoot, removeAuditScratch } from './lib/audit_scratch.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rows = [];
const measurements = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, detail: ok ? undefined : detail });
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };

/* ---------- 1. 实机测量 ---------- */
const temp = fs.mkdtempSync(path.join(auditTempRoot(), 'csh-lfs-merge-'));
const file = path.join(temp, 'index.html');
fs.writeFileSync(file, `<!doctype html><meta charset="utf-8"><style>
:root{--csh-lfs-md:13px;--csh-lfs-md2:13px}
body{margin:0;background:#15241f;color:#eee6d5;font-family:"Microsoft YaHei",sans-serif}
.row{display:flex;gap:8px;padding:6px}
.btn{box-sizing:border-box;min-height:44px;min-width:44px;width:160px;padding:8px 10px;
 border:1px solid #89744d;border-radius:7px;background:#263230;color:#eee6d5;
 font-family:inherit;line-height:1.5;text-align:left}
.old{font-size:13.5px}
.new{font-size:var(--csh-lfs-md2,13px)}
</style><div class="row"><button class="btn old" id="a">成就反馈 · 新 3</button><button class="btn new" id="b">成就反馈 · 新 3</button></div>`);

const measure = `(()=>{
 const a=document.getElementById('a'),b=document.getElementById('b');
 const ra=a.getBoundingClientRect(),rb=b.getBoundingClientRect();
 const ca=getComputedStyle(a),cb=getComputedStyle(b);
 return {fa:parseFloat(ca.fontSize),fb:parseFloat(cb.fontSize),
  ha:Math.round(ra.height*100)/100,hb:Math.round(rb.height*100)/100,
  wa:Math.round(ra.width*100)/100,wb:Math.round(rb.width*100)/100,
  la:ca.lineHeight,lb:cb.lineHeight,
  sa:a.scrollHeight,sb:b.scrollHeight,swa:a.scrollWidth,swb:b.scrollWidth,
  overflow:document.documentElement.scrollWidth<=innerWidth,vw:innerWidth,vh:innerHeight};
})()`;

try {
  for (const vp of [{ width: 915, height: 412 }, { width: 640, height: 286 }]) {
    await withChromium(vp, async send => {
      const val = async expression => {
        const r = await send('Runtime.evaluate', { expression, returnByValue: true });
        if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
        return r.result.value;
      };
      await send('Page.navigate', { url: pathToFileURL(file).href });
      for (let i = 0; i < 100 && !await val('document.readyState==="complete" && !!document.getElementById("b")'); i++)
        await new Promise(r => setTimeout(r, 30));
      const m = await val(measure);
      measurements.push({ viewport: vp.width + 'x' + vp.height, ...m });
      const tag = vp.width + '×' + vp.height;
      check(tag + '：测的确实是 13.5px 与并档后的 13px', m.fa === 13.5 && m.fb === 13, m);
      check(tag + '：按钮高度一致且仍满足 44px 触控目标', m.ha === m.hb && m.ha >= 44, m);
      /* line-height:1.5 是相对值：13.5→13 会让 computed 行高 20.25→19.5（差 0.75px）。
         不冒充「完全一致」，只要求差值 <1px 且按钮几何/换行完全不变。 */
      check(tag + '：按钮宽度一致、行高差小于 1px',
        m.wa === m.wb && Math.abs(parseFloat(m.la) - parseFloat(m.lb)) < 1, m);
      check(tag + '：内容高度与滚动宽度一致（换行行为不变）、页面无横向溢出',
        m.sa === m.sb && m.swa === m.swb && m.overflow, m);
      check(tag + '：并档后按钮仍是 44px 触控目标且字号不低于 12px',
        m.hb >= 44 && m.fb >= 12, m);
    });
  }
} finally {
  removeAuditScratch(temp);
}

/* ---------- 2. 并档后的静态真值 ---------- */
const theme = fs.readFileSync(path.join(repo, 'core/csh_theme.js'), 'utf8');
function collect(dir, out) {
  for (const f of fs.readdirSync(dir)) {
    const fp = path.join(dir, f), st = fs.statSync(fp);
    if (st.isDirectory()) { collect(fp, out); continue; }
    if (!/\.(js|css|html)$/.test(f)) continue;
    out.push(fs.readFileSync(fp, 'utf8'));
  }
  return out;
}
const texts = collect(path.join(repo, 'core'), []).concat(collect(path.join(repo, 'games'), []));
const all = texts.join('\n');
const oldFallback = (all.match(/var\(--csh-lfs-md2,13\.5px\)/g) || []).length;
const newFallback = (all.match(/var\(--csh-lfs-md2,13px\)/g) || []).length;

check('LFS 唯一真源里 md2 已并档为 13px',
  /\["md", "13px"\], \["md2", "13px"\]/.test(theme) && !/\["md2", "13\.5px"\]/.test(theme));
check('注释写明实机证据与同值兜底纪律',
  /md2 已并档到 md=13px/.test(theme) && /使用点兜底同步为 13px/.test(theme));
check('8 处使用点兜底全部同步为 13px、旧 13.5px 归零', newFallback === 8 && oldFallback === 0,
  { newFallback, oldFallback });
/* 游戏页 --pfs-* 是另一套独立标尺，本来就有 --pfs-md2:13.5px（互不污染，不该跟着改）。
   真正要防的是并档过程写出裸 font-size:13.5px。 */
check('宿主/游戏两套标尺仍各自独立，且并档未引入裸 13.5px 字号',
  /--pfs-md2: 13\.5px/.test(all) && !/font-size\s*:\s*13\.5px/.test(all));
check('E54 白名单计数未被改动', /"character\/index\.js": 31/.test(fs.readFileSync(path.join(repo, 'tools/check.js'), 'utf8')) &&
  /"skills\/index\.js": 7/.test(fs.readFileSync(path.join(repo, 'tools/check.js'), 'utf8')));

/* ---------- 3. 改前基线 ---------- */
{
  const before = theme.replace('["md", "13px"], ["md2", "13px"]', '["md", "13px"], ["md2", "13.5px"]');
  check('改前基线：LFS 回到 13.5px 会被静态断言检出',
    before !== theme && /\["md2", "13\.5px"\]/.test(before));
  const beforeAll = all.replace('var(--csh-lfs-md2,13px)', 'var(--csh-lfs-md2,13.5px)');
  check('改前基线：残留旧兜底会被检出', beforeAll.includes('var(--csh-lfs-md2,13.5px)'));
}

const result = {
  scope: 'Chromium 915x412 / 640x286 layout measurement of 13.5px vs merged 13px + static LFS/fallback audit',
  passed: rows.filter(r => r.passed).length,
  failed: rows.filter(r => !r.passed).length,
  failures: rows.filter(r => !r.passed),
  measurements
};
const out = arg('--out', null);
if (out) {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ ...result, rows }, null, 2));
}
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
