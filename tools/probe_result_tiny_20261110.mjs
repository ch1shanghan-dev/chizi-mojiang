/* 极矮横屏（640×286）结算层纵向预算 · 真实 Chromium 几何夹具（2026-11-10 · P2 牌桌呈现）
 *
 * 为什么需要它：L-TINY（≤350 高）里 `.rs-panel` 的上限是 88%，实测 640×286 只给中段 146px，
 * 廿一点两行结算要 184px —— 玩家自己那一行被挤进滚动区，最想看的牌要先滚一下才出现。
 * 本夹具加载**真实** games/blackjack/blackjack.html（不是复制的假 DOM），把牌局打到结算，
 * 锁住三件事：中段不再内部滚动、「你」那一行完整可见、底部按钮仍在视口内；
 * 同时锁「不该变的视口」（915×412）几何与文案一动不动。
 *
 * 用法：node tools/probe_result_tiny_20261110.mjs [--out <dir>]
 * stdout 纯 JSON：{passed, failed, failures, output}
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withChromium } from './lib/chromium_audit.mjs';
import { auditTempRoot } from './lib/audit_scratch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(auditTempRoot(), 'result-tiny')));
fs.mkdirSync(out, { recursive: true });
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });

/* ---------- 静态：规则写在哪、写了什么 ---------- */
const layoutCss = read('core/csh_layout.css');
/* 取真正的 L-TINY media 块（文件头部的断点索引注释里也有「L-TINY」，不能按关键字切）。 */
const tinyBlockRaw = (() => {
  const i = layoutCss.indexOf('@media (orientation: landscape) and (max-height: 350px)');
  return i < 0 ? '' : layoutCss.slice(i, layoutCss.indexOf('@media (orientation: portrait)', i));
})();
/* 断言只看规则、不看注释：注释里写了 summary 会把正则带偏。 */
const tinyBlock = tinyBlockRaw.replace(/\/\*[\s\S]*?\*\//g, '');
check('L-TINY 段存在且含结算收紧规则', /\.csh-result \.rs-panel\s*\{[^}]*calc\(100% - 2px\)/.test(tinyBlock), tinyBlock.slice(0, 120));
check('L-TINY 段收紧了中段行距与卡片宽度', /\.csh-result \.rs-rows\{gap:3px\}/.test(tinyBlock.replace(/\s+/g, '')) || /\.csh-result \.rs-rows\s*\{\s*gap:\s*3px/.test(tinyBlock));
/* 只许藏「清单最上面那行装饰说明」：<summary class="rs-cap"> 是底池明细/你的账本/关键手复盘的
   展开开关，一旦被藏玩家就再也点不开，属于交互回退。 */
const capsRule = (tinyBlock.match(/[^\n]*div\.rs-cap[^\n]*/g) || []).join('\n');
check('隐藏小标题的规则限定首行，且不匹配 summary', /:first-child/.test(capsRule) && !/\.csh-result div\.rs-cap\s*\{/.test(tinyBlock), capsRule);
check('德州可展开的小标题（summary.rs-cap）未被任何极矮屏规则隐藏', !/summary[^{]*\{\s*display:\s*none/.test(tinyBlock));

/* doudizhu 页面里的 ≤500 段写在共享表之后，会把共享收紧整段盖掉，必须有 ≤350 的对齐段。 */
const ddzHtml = read('games/doudizhu/doudizhu.html');
const ddzTiny = (() => {
  const i = ddzHtml.indexOf('@media (orientation: landscape) and (max-height: 350px)');
  return i < 0 ? '' : ddzHtml.slice(i, i + 400);
})();
check('斗地主页面补了 ≤350 的对齐段（否则页面 ≤500 段盖掉共享规则）',
  /max-height:\s*calc\(100% - 2px\)/.test(ddzTiny), ddzTiny.slice(0, 160));

/* ---------- 运行时：真实页面打到结算 ---------- */
const measure = `(()=>{
  const r=document.querySelector('.csh-result');
  if(!r || r.getBoundingClientRect().height<=0) return {none:true};
  const panel=r.querySelector('.rs-panel'), body=r.querySelector('.rs-body'), foot=r.querySelector('.rs-foot');
  const cs=getComputedStyle(panel);
  const me=r.querySelector('.rs-row.me');
  const br=body.getBoundingClientRect(), mr=me?me.getBoundingClientRect():null;
  const cap=r.querySelector('div.rs-cap');
  return {
    vw:innerWidth, vh:innerHeight,
    panelMaxH:cs.maxHeight, panelPad:cs.paddingTop+' '+cs.paddingRight, panelGap:cs.gap,
    bodySh:body.scrollHeight, bodyCh:body.clientHeight, bodyScrolls:body.scrollHeight>body.clientHeight+1,
    footVisible:foot.getBoundingClientRect().bottom<=innerHeight+0.5 && foot.getBoundingClientRect().top>=-0.5,
    panelInView:panel.getBoundingClientRect().bottom<=innerHeight+0.5,
    meVisible:!!mr && mr.top>=br.top-0.5 && mr.bottom<=br.bottom+0.5,
    meText:me?me.textContent.replace(/\\s+/g,' ').trim().slice(0,24):'',
    capShown:cap?getComputedStyle(cap).display!=='none':null,
    rows:r.querySelectorAll('.rs-row').length
  };
})()`;

async function playToResult(vp) {
  let result = null;
  await withChromium(vp, async send => {
    const val = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    await send('Page.navigate', { url: pathToFileURL(path.join(root, 'games/blackjack/blackjack.html')).href });
    for (let i = 0; i < 200; i++) { if (await val('document.readyState==="complete"')) break; await new Promise(r => setTimeout(r, 50)); }
    await new Promise(r => setTimeout(r, 700));
    await val(`(()=>{const c=document.getElementById('btn-sign-cancel');if(c&&c.offsetParent)c.click();return 1;})()`);
    await new Promise(r => setTimeout(r, 200));
    await val(`(()=>{const b=document.getElementById('btn-start-game');if(b&&!b.disabled)b.click();return 1;})()`);
    for (let i = 0; i < 40; i++) {
      const st = await val(`(()=>{
        const r=document.querySelector('.csh-result'); if(r&&r.getBoundingClientRect().height>0) return 'settled';
        const ins=document.getElementById('btn-ins-no'); if(ins&&ins.offsetParent&&!ins.disabled){ins.click();return 'ins';}
        const s=document.getElementById('btn-stand'); if(s&&s.offsetParent&&!s.disabled){s.click();return 'stand';}
        return 'wait';
      })()`);
      await new Promise(r => setTimeout(r, 900));
      if (st === 'settled') break;
    }
    result = await val(measure);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(out, `blackjack-result-${vp.width}x${vp.height}.png`), Buffer.from(shot.data, 'base64'));
  });
  return result;
}

/* 极矮屏：这一档是本次修的目标 */
const tiny = await playToResult({ width: 640, height: 286 });
check('640×286：牌局能走到结算层', tiny && !tiny.none, tiny);
if (tiny && !tiny.none) {
  check('640×286：中段不再内部滚动（首屏就能看到全部结算行）', !tiny.bodyScrolls, { sh: tiny.bodySh, ch: tiny.bodyCh });
  check('640×286：「你」那一行完整落在可视区，不需要滚动', tiny.meVisible, tiny.meText);
  check('640×286：底部按钮仍完整在视口内', tiny.footVisible);
  check('640×286：面板没有溢出视口', tiny.panelInView, tiny.panelMaxH);
  check('640×286：结算行数仍为 2（庄家 + 你），没有为了塞下而丢行', tiny.rows === 2, tiny.rows);
  check('640×286：极矮屏规则确实生效（上限不再是 88%）', !/88%/.test(tiny.panelMaxH) && /100%/.test(tiny.panelMaxH), tiny.panelMaxH);
}

/* 对照视口：不允许被这次改动碰到 */
const base = await playToResult({ width: 915, height: 412 });
check('915×412：牌局能走到结算层', base && !base.none, base);
if (base && !base.none) {
  check('915×412：面板仍用 88% 上限（未受极矮屏规则影响）', /88%/.test(base.panelMaxH), base.panelMaxH);
  check('915×412：内边距仍是 9px / 12px', base.panelPad === '9px 12px', base.panelPad);
  check('915×412：清单小标题仍然显示', base.capShown === true, base.capShown);
  check('915×412：本来就不该出现内部滚动', !base.bodyScrolls, { sh: base.bodySh, ch: base.bodyCh });
  check('915×412：底部按钮完整在视口内', base.footVisible);
}

const failures = rows.filter(r => !r.passed);
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ scope: 'real games/blackjack/blackjack.html in isolated Chromium; 640x286 tiny vs 915x412 control', rows, tiny, base }, null, 2));
console.log(JSON.stringify({ passed: rows.length - failures.length, failed: failures.length, failures, output: out }, null, 2));
process.exitCode = failures.length ? 1 : 0;
