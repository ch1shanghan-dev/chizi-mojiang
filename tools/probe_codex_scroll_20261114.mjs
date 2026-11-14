/* 图鉴滚动可达性 · 常驻门禁（2026-11-14 批次 A/B/D）
 *
 * 为什么需要：旧实现把 .dnav（position:sticky）放在滚动容器 .dinfo 内部，滚动时
 * 页签永久悬浮并盖住关系摘要；左栏 .rolodex{height:100%} 与 52px 搜索框并列，
 * 名录最后一位永远滚不到。两个缺陷在真实页面稳定复现，但既有探针只查「当前选中项」，
 * 从未检查末项与重叠 —— 门禁假绿。本探针在真实 Chromium 里量几何，带改前判红。
 *
 * 用法：node tools/probe_codex_scroll_20261114.mjs [--out <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withChromium } from './lib/chromium_audit.mjs';
import { auditTempRoot } from './lib/audit_scratch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(auditTempRoot(), 'codex-scroll')));
fs.mkdirSync(out, { recursive: true });
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });
const save = o => { try { fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(o, null, 2)); } catch (e) {} };

const html = fs.readFileSync(path.join(root, 'games/codex.html'), 'utf8');

/* ---------- 静态：旧实现特征必须消失（改前基线） ---------- */
check('名录不再用 height:100% 与搜索框并列（批次 A）', !/\.rolodex\{height:100%/.test(html));
check('名录容器为 flex 列且名录 flex 撑剩余高度', /\.rolodexwrap\{[^}]*display:flex;flex-direction:column/.test(html) && /\.rolodex\{flex:1 1 auto;min-height:0/.test(html));
check('窄屏展开态不再用 display:block 覆盖 flex 列', /\.codex-roster-open \.rolodexwrap\{display:flex/.test(html));
check('页签与滚动容器分层（批次 B）', /<div class="dinfo-scroll" id="dinfo-scroll">/.test(html) && /\.dinfo-scroll\{[\s\S]*?overflow-y:auto/.test(html));
check('.dinfo 外壳不再滚动、.dnav 不再 sticky', !/\.dinfo\{[^}]*overflow-y:auto/.test(html) && /\.dnav\{[^}]*position:static/.test(html));
check('极矮屏不再隐藏分区页签', !/@media\(max-height:330px\)\{\.dnav\{display:none\}\}/.test(html) && !/nav\.hidden=compact/.test(html));
check('滚动复位目标已切到 .dinfo-scroll', (html.match(/\$\("\.dinfo-scroll"\)\.scrollTop/g) || []).length >= 4 && !/\$\("\.dinfo"\)\.scrollTop/.test(html));

const FILL = `(() => {
  document.body.classList.remove('empty');
  const rl = document.getElementById('rolodex');
  if (rl && !rl.children.length) {
    for (let i=0;i<50;i++){
      const b=document.createElement('button'); b.type='button'; b.className='gitem';
      b.innerHTML='<div class="gface noimg"><div class="gph">?</div></div><div class="gmeta"><div class="gname">妖灵 '+(i+1)+'</div><div class="gsub"><span class="gh">♥ '+(500-i)+'</span></div></div>';
      rl.appendChild(b);
    }
  }
  const ab=document.getElementById('affbox');
  if(ab && !ab.dataset.filled){
    ab.dataset.filled='1';
    ab.innerHTML='<div class="affhead"><span class="afftitle">亲密</span><span class="afflv">陌路 532 / 2000</span></div>'
      +'<div class="affhearts"><span class="affheart">♥</span><span class="affheart">♥</span><span class="affheart">♥</span><span class="affheart">♥</span><span class="affheart">♥</span></div>'
      +'<div class="affbar"><i style="width:12%"></i></div><div class="affmeta">累计亲密度 532 / 88000</div>'
      +'<div class="affsay">「别碰。……（没有躲开）」</div>'
      +'<div class="affops">'+Array.from({length:12},(_,i)=>'<button class="affbtn"><span class="act-name">互动 '+(i+1)+'</span><span class="lk">未解锁</span></button>').join('')+'</div>'
      +'<div class="affhint">每日一次</div>';
  }
  const bb=document.getElementById('bond-brief');
  if(bb && !bb.dataset.filled){ bb.dataset.filled='1'; bb.textContent='当前关系 陌路 距下一阶 1,468 赠礼 6,000 CBY 起'; }
  return 1;
})()`;

const MEASURE = `(() => {
  const R=n=>{if(!n)return null;const r=n.getBoundingClientRect();return {top:+r.top.toFixed(1),bottom:+r.bottom.toFixed(1),h:+r.height.toFixed(1)};};
  const ov=(a,b)=>!!(a&&b&&a.top<b.bottom-1&&b.top<a.bottom-1);
  const wrap=document.querySelector('.rolodexwrap'), rl=document.getElementById('rolodex');
  const last=rl?rl.lastElementChild:null;
  const di=document.querySelector('.dinfo'), sc=document.querySelector('.dinfo-scroll'), dn=document.getElementById('dnav');
  const bb=document.getElementById('bond-brief'), ab=document.getElementById('affbox');
  const btns=sc?[...sc.querySelectorAll('.affbtn')]:[];
  const lastBtn=btns.length?btns[btns.length-1]:null;
  const cs=dn?getComputedStyle(dn):null;
  return {
    vp:{w:innerWidth,h:innerHeight},
    wrap:R(wrap), lastItem:R(last),
    lastInWrap:last&&wrap?R(last).bottom<=R(wrap).bottom+1:null,
    lastInViewport:last?R(last).bottom<=innerHeight+1:null,
    rolodex:rl?{client:rl.clientHeight,scroll:rl.scrollHeight,max:Math.max(0,rl.scrollHeight-rl.clientHeight)}:null,
    dinfo:di?{ov:getComputedStyle(di).overflowY,rect:R(di)}:null,
    dinfoScroll:sc?{client:sc.clientHeight,scroll:sc.scrollHeight,max:Math.max(0,sc.scrollHeight-sc.clientHeight),top:+sc.scrollTop.toFixed(1),ov:getComputedStyle(sc).overflowY,rect:R(sc)}:null,
    dnav:dn?{rect:R(dn),position:cs.position,display:cs.display,visible:dn.offsetParent!==null}:null,
    overlapBond:ov(R(dn),R(bb)), overlapAff:ov(R(dn),R(ab)),
    lastBtnInScroll:lastBtn&&sc?R(lastBtn).bottom<=R(sc).bottom+1:null,
    errs:(window.__cshErr||[]).slice(0,4)
  };
})()`;

/* 内置改前判红：构造 sticky 悬浮的旧结构，确认「重叠」判据能检出，不是恒绿 */
const RED_BASELINE = `(() => {
  const old=document.createElement('div');
  old.style.cssText='position:absolute;left:-9999px;top:0;width:300px;height:120px;overflow-y:auto;';
  old.innerHTML='<div id="__old_nav" style="position:sticky;top:-1px;z-index:3;height:44px;background:#332b21"></div>'
              +'<div id="__old_body" style="height:400px"></div>';
  document.body.appendChild(old); old.scrollTop=200;
  const a=old.querySelector('#__old_nav').getBoundingClientRect();
  const b=old.querySelector('#__old_body').getBoundingClientRect();
  const overlap=a.top<b.bottom-1&&b.top<a.bottom-1;
  old.remove(); return overlap;
})()`;

const HOOK = `(() => { window.__cshErr=[]; window.addEventListener('error',e=>window.__cshErr.push(String(e.message||'')),true); })();`;

async function visit(w, h) {
  return await withChromium({ width: w, height: h }, async send => {
    const val = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
    await send('Page.navigate', { url: pathToFileURL(path.join(root, 'games/codex.html')).href });
    for (let i = 0; i < 200; i++) { if (await val('document.readyState === "complete"')) break; await new Promise(r => setTimeout(r, 50)); }
    await new Promise(r => setTimeout(r, 450));
    await val(FILL);
    const before = await val(MEASURE);
    await val(`(()=>{const a=document.getElementById('rolodex'),b=document.querySelector('.dinfo-scroll');if(a)a.scrollTop=99999;if(b)b.scrollTop=99999;return 1;})()`);
    await new Promise(r => setTimeout(r, 180));
    const after = await val(MEASURE);
    const red = await val(RED_BASELINE);
    /* 极矮屏：分区按钮必须可见可点，点「记忆」后该分区详情展开 */
    let section = null;
    if (h <= 330) {
      section = await val(`(()=>{const t=document.querySelector('#dnav [data-section="memory"]');if(!t)return {ok:false,why:'no tab'};
        const r=t.getBoundingClientRect();const visible=r.height>=43.5&&r.width>=43.5&&getComputedStyle(t).display!=='none';
        t.click();const d=document.getElementById('character-story');
        return {ok:visible&&!!d&&!d.hidden,visible,expanded:!!d&&!d.hidden,tabH:r.height};})()`);
    }
    return { before, after, red, section };
  });
}

for (const [w, h] of [[1365, 768], [1080, 500], [915, 412], [640, 286]]) {
  const tag = `${w}x${h}`;
  let m;
  try { m = await visit(w, h); }
  catch (e) { check(`${tag}：页面可加载并量测`, false, String(e)); save({ passed: 0, failed: rows.filter(r => !r.passed).length, rows }); continue; }
  const a = m.after, b = m.before;
  check(`${tag}：名录滚到底最后一位完整可达`, a.lastInWrap === true && a.lastInViewport === true,
    { wrap: a.wrap, last: a.lastItem, rolodex: a.rolodex });
  check(`${tag}：页签不在滚动容器内部（position:static）`, a.dnav?.position === 'static' && a.dinfo?.ov === 'hidden' && a.dinfoScroll?.ov === 'auto',
    { dnav: a.dnav, dinfo: a.dinfo, scroll: a.dinfoScroll });
  /* 正确判据：页签在滚动容器上方、不侵入其可视区。不能用两个元素的视口矩形相交判定，
     因为 .dinfo-scroll 的 overflow 会裁掉容器外的内容，矩形相交不等于画面重叠。 */
  check(`${tag}：页签在滚动容器上方、零遮挡`,
    a.dnav?.rect.bottom <= a.dinfoScroll?.rect.top + 1 && a.dinfo?.ov === 'hidden' && a.dinfoScroll?.ov === 'auto',
    { dnav: a.dnav?.rect, scroll: a.dinfoScroll?.rect, dinfoOv: a.dinfo?.ov, scrollOv: a.dinfoScroll?.ov });
  /* 用相对外壳的偏移，排除顶部状态栏异步重排造成的整页位移 */
  const relBefore = (b.dnav?.rect.top ?? 0) - (b.dinfo?.rect.top ?? 0);
  const relAfter = (a.dnav?.rect.top ?? 0) - (a.dinfo?.rect.top ?? 0);
  check(`${tag}：页签相对外壳不随内容滚动`, Math.abs(relAfter - relBefore) < 1.5,
    { relBefore, relAfter });
  check(`${tag}：详情滚到底最后一项可达`, a.lastBtnInScroll === true, { scroll: a.dinfoScroll });
  check(`${tag}：无 JS 运行时报错`, (a.errs || []).length === 0, a.errs);
  if (h <= 330) check(`${tag}：极矮屏分区入口可见且可切换`, m.section?.ok === true, m.section);
  check(`${tag}：改前 sticky 基线能被重叠判据检出（非恒绿）`, m.red === true, m.red);
}

const result = { scope: 'Codex roster tail reachability + dnav scroll layering (real Chromium, 4 viewports, built-in red baseline)', passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed).length, rows };
save(result);
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
