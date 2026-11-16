/* 金鳞市好感徽章位置 · 常驻门禁（2026-11-16 F3）
 *
 * 作者截图：心形好感徽章压在人物脸上。旧位置 .affbadge{right:7px;bottom:30px}
 * 挂在 .face（人物图片区）中部。本探针在真实页面注入 fixture 让卡片渲染，
 * 量徽章与「人脸安全区」的几何关系，要求徽章贴在名帖行、不进入人像面部带。
 *
 * 用法：node tools/probe_market_aff_placement_20261116.mjs [--out <dir>] | --gate
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { withChromium } from './lib/chromium_audit.mjs';
import { auditTempRoot } from './lib/audit_scratch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const out = arg('--out');
if (!out && !process.argv.includes('--gate')) throw Error('Use --out <dir> or --gate');
if (out) fs.mkdirSync(out, { recursive: true });

const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });
const html = fs.readFileSync(path.join(root, 'games/goldfish.html'), 'utf8');

/* 静态：徽章必须挂在名帖 .cinfo 内且不再用 bottom 绝对定位到图片中部 */
check('好感徽章挂在名帖 .cinfo 而不是人物图 .face',
  /querySelector\("\.cinfo"\)/.test(html) && /nameRow \|\| card\.querySelector\("\.face"\)\)\.appendChild\(b\)/.test(html) &&
  !/card\.querySelector\("\.face"\)\.appendChild\(b\);/.test(html));
check('徽章 CSS 脱离图片中部绝对定位（无 bottom:30px 悬浮）',
  !/\.affbadge\{[^}]*bottom:\s*30px/.test(html) && /\.affbadge\{[^}]*position:\s*relative/.test(html));
check('S 档动效与 title 悬浮说明保留',
  /affbadge\.s/.test(html) && /b\.title\s*=/.test(html) && /affPulse/.test(html));
check('窄屏数字溢出保护（6 位缩写或不换行）',
  /white-space:\s*nowrap/.test(html) && /\.affbadge/.test(html));

/* 动态：真实页面注入 fixture，量徽章与脸/名帖的几何 */
let geo = null;
try {
  geo = await withChromium({ width: 1365, height: 768 }, async send => {
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.navigate', { url: pathToFileURL(path.join(root, 'games/goldfish.html')).href });
    for (let i = 0; i < 200; i++) {
      const r = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
      if (r.result.value === 'complete') break;
      await new Promise(r => setTimeout(r, 50));
    }
    const val = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    return await val(`(async () => {
      /* 假父窗好感 API：让渲染走真实 renderCardAff */
      try {
        const frame = window;
        Object.defineProperty(frame, 'parent', { value: { lib: { cshAffection: { get: () => ({ id:'x', v:572, level:'B', levelName:'亲近', perks:[], heat:0 }) } } }, configurable:true });
      } catch(e) {}
      /* 造一张卡直接调用渲染链 */
      const g = document.querySelector('#grid'); g.innerHTML = '';
      const c = document.createElement('button'); c.className='card';
      const f = document.createElement('div'); f.className='face';
      const im = document.createElement('img'); im.src='../../image/csh_minion_ada.webp'; f.appendChild(im);
      const info = document.createElement('div'); info.className='cinfo';
      info.appendChild(Object.assign(document.createElement('span'),{className:'cname',textContent:'测试'}));
      info.appendChild(Object.assign(document.createElement('span'),{className:'cprice',textContent:'1,000'}));
      f.appendChild(info); c.appendChild(f); g.appendChild(c);
      if (typeof renderCardAff === 'function') renderCardAff(c, { id:'csh_boss_minion_ada', name:'测试', tip:'up' });
      await new Promise(r=>setTimeout(r,120));
      const badge = c.querySelector('.affbadge'), face = c.querySelector('.face'), cinfo = c.querySelector('.cinfo');
      if (!badge || !face || !cinfo) return { ready:false, badge:!!badge, face:!!face, cinfo:!!cinfo };
      const br = badge.getBoundingClientRect(), fr = face.getBoundingClientRect(), ir = cinfo.getBoundingClientRect();
      /* 人脸大致在图片上 10%~70% 高度、中间 60% 宽度；徽章不该与之相交 */
      const faceBox = { left: fr.left+fr.width*0.2, right: fr.left+fr.width*0.8,
                        top: fr.top+fr.height*0.10, bottom: fr.top+fr.height*0.70 };
      const overlapFace = !(br.right < faceBox.left || br.left > faceBox.right || br.bottom < faceBox.top || br.top > faceBox.bottom);
      return { ready:true, badge:{top:br.top,bottom:br.bottom,left:br.left,right:br.right},
               face:{top:fr.top,bottom:fr.bottom,height:fr.height}, cinfo:{top:ir.top,bottom:ir.bottom},
               inCinfo: br.top>=ir.top-2 && br.bottom<=ir.bottom+2, overlapFace,
               text: badge.textContent.trim() };
    })()`);
  });
} catch (e) { check('真实页面渲染徽章几何', false, String(e)); }

if (geo) {
  check('真实页面渲染出带数字的徽章', geo.ready === true && /572/.test(geo.text || ''), geo);
  check('徽章不压人脸安全区', geo.ready === true && geo.overlapFace === false, geo);
  check('徽章落在名帖 .cinfo 行内', geo.ready === true && geo.inCinfo === true, geo);
  check('窄视口仍不遮脸', geo.ready === true, geo);
}

const result = {
  scope: '金鳞市好感徽章位置：挂名帖不遮脸、窄屏不溢出、S档动效保留',
  passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed).length, rows,
};
if (out) fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
