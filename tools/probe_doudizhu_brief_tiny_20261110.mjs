/* 极矮横屏（640×286）玩家状态行「身份 / 剩余张数」不可截断 · 真实 Chromium 几何夹具（2026-11-10）
 *
 * 为什么需要它：极矮屏（≤350 高）下 `.pl-brief` 的 30% 上限够不到，17 张手牌的内容宽度
 * 会把它再挤到 103px，叠加 core/csh_layout.css:223 的逐子项 ellipsis，
 * 「身份待定 · 剩 17 张」被渲染成「身份待… · 剩 1… 张」——两个决定阵营与还差几张的
 * 关键值同时读不出来。本夹具加载**真实** games/doudizhu/doudizhu.html（不是假 DOM），
 * 锁住：极矮屏这两个值必须完整可读、手牌仍单行且不越界、状态行不与手牌重叠、按钮仍 ≥44px；
 * 同时锁「不该变的视口」（915×412 / 1365×768）几何与换行行为一动不动。
 *
 * 用法：node tools/probe_doudizhu_brief_tiny_20261110.mjs [--out <dir>]
 * stdout 纯 JSON：{passed, failed, failures, output}
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withChromium } from './lib/chromium_audit.mjs';
import { auditTempRoot } from './lib/audit_scratch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(auditTempRoot(), 'ddz-brief-tiny')));
fs.mkdirSync(out, { recursive: true });
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });

/* ---------- 静态：规则只写在页面 <style> 的 ≤350 段 ---------- */
const html = read('games/doudizhu/doudizhu.html');
const noComment = s => s.replace(/\/\*[\s\S]*?\*\//g, '');
const styleBlock = (() => {
  const i = html.indexOf('<style>');
  const j = html.indexOf('</style>', i);
  return i < 0 ? '' : html.slice(i + 7, j);
})();
const tinyStarts = [...styleBlock.matchAll(/@media\s*\(\s*orientation:\s*landscape\s*\)\s*and\s*\(\s*max-height:\s*350px\s*\)\s*\{/g)].map(m => m.index);
/* 用大括号配平切出每个 ≤350 段的完整块，避免把后面的规则算进来。 */
const tinyBlocks = tinyStarts.map(i => {
  let depth = 0, k = styleBlock.indexOf('{', i);
  for (let p = k; p < styleBlock.length; p++) {
    if (styleBlock[p] === '{') depth++;
    else if (styleBlock[p] === '}') { depth--; if (!depth) return styleBlock.slice(i, p + 1); }
  }
  return styleBlock.slice(i);
}).map(noComment);
const tiny = tinyBlocks.join('\n');

check('页面 <style> 里有 ≤350 高的极矮屏段', tinyBlocks.length > 0, tinyStarts.length);
check('极矮屏段给 .pl-brief 一个不被压缩的宽度（flex-shrink 归零）',
  /\.csh-player \.pl-brief\s*\{[^}]*flex:\s*0\s+0\s+auto/.test(tiny) || /\.csh-player \.pl-brief\s*\{[^}]*flex-shrink:\s*0/.test(tiny), tiny.slice(0, 200));
check('极矮屏段允许 .pl-line 换行兜底（flex-wrap:wrap），拒绝用省略号吞数值',
  /\.csh-player \.pl-line\s*\{[^}]*flex-wrap:\s*wrap/.test(tiny), tiny.slice(0, 200));
/* 手牌区必须保持单行：任何地方都不许给 #hand / .my-hand 开 wrap。 */
const handWrapWrap = /(?:#hand|\.my-hand)[^{]*\{[^}]*flex-wrap:\s*wrap/.test(noComment(html));
const handRuleNowrap = /\.my-hand\s*\{[^}]*flex-wrap:\s*nowrap/.test(noComment(html));
check('手牌区仍写死单行（.my-hand 有 flex-wrap:nowrap，且没有任何规则改成 wrap）',
  handRuleNowrap && !handWrapWrap, { handRuleNowrap, handWrapWrap });
/* 不许靠改共享表把「逐项省略号」整体关掉来"修"（那是主代理的文件，也是别人的兜底）。 */
const layoutCss = noComment(read('core/csh_layout.css'));
check('core/csh_layout.css 的逐子项 ellipsis 规则仍在（没有绕过共享兜底）',
  /\.csh-player \.pl-line > \*\s*\{[^}]*text-overflow:\s*ellipsis/.test(layoutCss));
check('本次改动没有给 .pl-line > * 取消 overflow-hidden（避免文字压住手牌）',
  !/\.csh-player \.pl-line > \*\s*\{[^}]*overflow:\s*visible/.test(tiny));

/* ---------- 运行时测量 ---------- */
const measure = `(()=>{
  const q=s=>document.querySelector(s);
  const box=e=>{const b=e.getBoundingClientRect();return {l:+b.left.toFixed(2),t:+b.top.toFixed(2),w:+b.width.toFixed(2),h:+b.height.toFixed(2),r:+b.right.toFixed(2),b:+b.bottom.toFixed(2)};};
  /* 亚像素文本宽：Range 测真实字形宽，用于抓「44 vs 43.6」这种整数 scrollWidth 看不出的截断。 */
  const tw=e=>{const g=document.createRange();g.selectNodeContents(e);return +g.getBoundingClientRect().width.toFixed(3);};
  const brief=q('.csh-player .pl-brief'), line1=q('#my-line1'), role=q('#my-role'), cnt=q('#my-count');
  const hand=q('#hand'), cards=[...hand.querySelectorAll('.pcard')];
  if(!brief||!line1||!role||!cnt||!hand) return {missing:true, has:{brief:!!brief,line1:!!line1,role:!!role,cnt:!!cnt,hand:!!hand}};
  const cs=e=>getComputedStyle(e);
  const last=cards.length?cards[cards.length-1]:null;
  return {
    vw:innerWidth, vh:innerHeight,
    n:cards.length,
    brief:box(brief), briefFlex:cs(brief).flex, briefFlexShrink:cs(brief).flexShrink,
    line1:{...box(line1), wrap:cs(line1).flexWrap, sw:line1.scrollWidth, cw:line1.clientWidth, text:line1.textContent.replace(/\\s+/g,' ').trim()},
    role:{...box(role), sw:role.scrollWidth, cw:role.clientWidth, tw:tw(role), text:role.textContent.trim(), fs:cs(role).fontSize},
    cnt:{...box(cnt), sw:cnt.scrollWidth, cw:cnt.clientWidth, tw:tw(cnt), text:cnt.textContent.trim(), fs:cs(cnt).fontSize},
    zhang:[...line1.querySelectorAll('em')].filter(e=>e.textContent.trim()==='张').map(e=>({...box(e), tw:tw(e)})),
    hand:{...box(hand), wrap:cs(hand).flexWrap, sw:hand.scrollWidth, cw:hand.clientWidth, lastR:last?+last.getBoundingClientRect().right.toFixed(2):null},
    btns:[...document.querySelectorAll('.csh-dock .btn')].filter(b=>b.offsetParent).map(b=>({id:b.id||b.textContent.trim().slice(0,4),h:+b.getBoundingClientRect().height.toFixed(2)}))
  };
})()`;

async function playDdz(vp, tag) {
  let res = null;
  await withChromium(vp, async send => {
    const val = async expression => {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    await send('Page.navigate', { url: pathToFileURL(path.join(root, 'games/doudizhu/doudizhu.html')).href });
    for (let i = 0; i < 200; i++) { if (await val('document.readyState==="complete"')) break; await new Promise(r => setTimeout(r, 50)); }
    await new Promise(r => setTimeout(r, 700));
    await val(`(()=>{const c=document.getElementById('btn-sign-cancel');if(c&&c.offsetParent)c.click();return 1;})()`);
    await new Promise(r => setTimeout(r, 250));
    await val(`(()=>{const b=document.getElementById('btn-start-game');if(b&&!b.disabled)b.click();return 1;})()`);
    await new Promise(r => setTimeout(r, 1700));
    res = await val(measure);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    fs.writeFileSync(path.join(out, `doudizhu-brief-${tag}-${vp.width}x${vp.height}.png`), Buffer.from(shot.data, 'base64'));
  });
  return res;
}

const fits = (m, tol = 0.01) => m.role.w + tol >= m.role.tw && m.cnt.w + tol >= m.cnt.tw;

function assertTiny(m, label) {
  check(`${label}：对局进入且手牌为 17 张`, !!m && !m.missing && m.n === 17, m && m.n);
  if (!m || m.missing) return;
  check(`${label}：#my-role 的 scrollWidth 不超 clientWidth（无省略号）`, m.role.sw <= m.role.cw + 1, { sw: m.role.sw, cw: m.role.cw });
  check(`${label}：#my-role 亚像素完整（盒宽 ≥ 字形宽，没有被切掉半格）`, m.role.w + 0.01 >= m.role.tw, { boxW: m.role.w, textW: m.role.tw, boxH: m.role.h });
  check(`${label}：#my-count 的 scrollWidth 不超 clientWidth（无省略号）`, m.cnt.sw <= m.cnt.cw + 1, { sw: m.cnt.sw, cw: m.cnt.cw });
  check(`${label}：#my-count 亚像素完整`, m.cnt.w + 0.01 >= m.cnt.tw, { boxW: m.cnt.w, textW: m.cnt.tw });
  check(`${label}：剩余张数读得出真实数字（等于手牌张数）`, m.cnt.text === String(m.n), { text: m.cnt.text, hand: m.n });
  check(`${label}：「张」仍完整可见`, m.zhang.length === 1 && m.zhang[0].w + 0.01 >= m.zhang[0].tw && m.zhang[0].r <= m.line1.r + 1, m.zhang[0]);
  check(`${label}：身份文字仍是「身份待定 / 地主 / 农民」之一`, /^(身份待定|地主|农民)$/.test(m.role.text), m.role.text);
  check(`${label}：#hand 仍是单行（flex-wrap:nowrap）`, m.hand.wrap === 'nowrap', m.hand.wrap);
  check(`${label}：#hand 没有横向内容溢出（不产生横向滚动）`, m.hand.sw <= m.hand.cw + 1, { sw: m.hand.sw, cw: m.hand.cw });
  check(`${label}：最后一张牌右边不越过 #hand 右边界 +1px`, m.hand.lastR <= m.hand.r + 1, { lastR: m.hand.lastR, handR: m.hand.r });
  check(`${label}：最后一张牌右边不越过视口`, m.hand.lastR <= m.vw + 1, { lastR: m.hand.lastR, vw: m.vw });
  const overlap = !(m.brief.r <= m.hand.l + 0.5 || m.brief.l >= m.hand.r - 0.5 || m.brief.b <= m.hand.t + 0.5 || m.brief.t >= m.hand.b - 0.5);
  check(`${label}：.pl-brief 与 #hand 不重叠`, !overlap, { brief: m.brief, hand: { l: m.hand.l, r: m.hand.r, t: m.hand.t, b: m.hand.b } });
  check(`${label}：.pl-brief 不越出视口`, m.brief.l >= -0.5 && m.brief.r <= m.vw + 0.5 && m.brief.t >= -0.5 && m.brief.b <= m.vh + 0.5, m.brief);
  check(`${label}：可点按钮仍 ≥44px 高`, m.btns.length > 0 && m.btns.every(b => b.h >= 44), m.btns);
}

/* ---------- 极矮屏：这一档是本次修的目标 ---------- */
const t640 = await playDdz({ width: 640, height: 286 }, 'tiny640');
assertTiny(t640, '640×286');
const t700 = await playDdz({ width: 700, height: 350 }, 'tiny700');
assertTiny(t700, '700×350');

/* ---------- 对照视口：几何必须与改前一模一样（硬指标） ---------- */
const near = (a, b, tol = 0.6) => Math.abs(a - b) <= tol;
function assertControl(m, label, ref) {
  check(`${label}：对局进入且手牌为 17 张`, !!m && !m.missing && m.n === 17, m && m.n);
  if (!m || m.missing) return;
  check(`${label}：.pl-line 仍是单行 nowrap（极矮屏规则没有外溢）`, m.line1.wrap === 'nowrap', m.line1.wrap);
  check(`${label}：.pl-brief 仍参与 flex 收缩（未被极矮屏规则接管）`, m.briefFlexShrink !== '0', m.briefFlexShrink);
  check(`${label}：.pl-brief 宽高与改前一致`, near(m.brief.w, ref.briefW) && near(m.brief.h, ref.briefH), { got: { w: m.brief.w, h: m.brief.h }, ref: { w: ref.briefW, h: ref.briefH } });
  check(`${label}：#hand 宽高与改前一致`, near(m.hand.w, ref.handW) && near(m.hand.h, ref.handH), { got: { w: m.hand.w, h: m.hand.h }, ref: { w: ref.handW, h: ref.handH } });
  check(`${label}：.pl-line 行高与改前一致`, near(parseFloat(m.line1.h), ref.line1H, 0.11), { got: m.line1.h, ref: ref.line1H });
  check(`${label}：状态行字号与改前一致`, near(parseFloat(m.role.fs), ref.fs, 0.02), { got: m.role.fs, ref: ref.fs });
  check(`${label}：本来就能读全（role / count 亚像素完整）`, fits(m), { role: [m.role.w, m.role.tw], cnt: [m.cnt.w, m.cnt.tw] });
  check(`${label}：最后一张牌右边仍不越过 #hand 右边界 +1px`, m.hand.lastR <= m.hand.r + 1, { lastR: m.hand.lastR, handR: m.hand.r });
}

/* 参考值取自 2026-11-10 改前的真实测量（同一页面、同一 17 张开局）。 */
const s915 = await playDdz({ width: 915, height: 412 }, 'short915');
assertControl(s915, '915×412', { briefW: 104, briefH: 33, handW: 781.1, handH: 65.1, line1H: 15, fs: 11 });
const d1365 = await playDdz({ width: 1365, height: 768 }, 'desk1365');
assertControl(d1365, '1365×768', { briefW: 112.4, briefH: 34, handW: 1200.8, handH: 109.1, line1H: 16, fs: 12.288 });

const failures = rows.filter(r => !r.passed);
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({
  scope: 'real games/doudizhu/doudizhu.html in isolated Chromium; 640x286 & 700x350 tiny vs 915x412 & 1365x768 control',
  rows, tiny: { t640, t700 }, control: { s915, d1365 }
}, null, 2));
console.log(JSON.stringify({ passed: rows.length - failures.length, failed: failures.length, failures, output: out }, null, 2));
process.exitCode = failures.length ? 1 : 0;
