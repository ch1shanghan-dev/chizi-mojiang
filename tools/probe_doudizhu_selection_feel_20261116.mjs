/* 斗地主卡面与选牌手感 · 常驻门禁（2026-11-16 F4）
 *
 * 作者截图：①同一花色在牌右下角与中央重复 ②不能一次选很多牌（与欢乐斗地主手感不同）。
 * 本探针锁：卡面角标形态（点数+小花色在左上，右下无第二枚）、按住扫选状态机
 * （按下锁目标态、拖动连续设态、6px 阈值、全选/清空快捷），且在真实 Chromium
 * 页面里问 DOM 真值。不碰牌型判定/结算/托管。
 *
 * 用法：node tools/probe_doudizhu_selection_feel_20261116.mjs [--out <dir>] | --gate
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
const html = fs.readFileSync(path.join(root, 'games/doudizhu/doudizhu.html'), 'utf8');

/* ---------- 静态：卡面不再画两枚花色 ---------- */
check('卡面去掉右下角重复花色（.s 不再输出）',
  /<span class="r[^"]*">[\s\S]{0,80}<i class="rs">/.test(html) && !/<span class="s">/.test(html) && !/\.pcard \.s \{/.test(html));
check('点数下方有小花色角标 .rs（标准扑克角标）', /\.pcard \.r \.rs \{/.test(html) && /display:\s*block/.test(html));
check('中央大花色仍在（牌面可辨识）', /<span class="mid">['"]?\s*\+?\s*SUITS|class="mid"/.test(html));

/* ---------- 静态：扫选状态机与快捷按钮 ---------- */
check('存在扫选状态机与 6px 阈值',
  /var ddzDrag = null/.test(html) && /DDZ_DRAG_PX\s*=\s*6/.test(html) &&
  /pointerdown/.test(html) && /pointermove/.test(html) && /function endDrag/.test(html));
check('扫选锁定目标态而非逐张 toggle（setCardAt(idx, want)）',
  /function setCardAt\(idx, want\)/.test(html) && /setCardAt\(idx, ddzDrag\.want\)/.test(html) &&
  /setCardAt\(cardIndexAt\(e\.clientX\), ddzDrag\.want\)/.test(html));
check('全选 / 清空快捷按钮与实现存在',
  /id="btn-sel-all"/.test(html) && /id="btn-sel-none"/.test(html) &&
  /function ddzSelectAll\(on\)/.test(html) &&
  /\$\('#btn-sel-all'\)\.addEventListener/.test(html) && /\$\('#btn-sel-none'\)\.addEventListener/.test(html));
check('未改动牌型判定与结算（classify / tryPlay 仍在）',
  /function classify\(/.test(html) && /function tryPlay\(/.test(html) && /function doPass\(/.test(html));

/* ---------- 动态：真实 Chromium 里问 DOM ---------- */
let dom = null;
try {
  dom = await withChromium({ width: 1024, height: 600 }, async send => {
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.navigate', { url: pathToFileURL(path.join(root, 'games/doudizhu/doudizhu.html')).href });
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
    return await val(`(function(){
      var out = { ready:true };
      /* 用真实 cardHTML 造一张红桃2，看它生成几个花色符号 */
      if (typeof cardHTML === 'function') {
        var box = document.createElement('div');
        box.innerHTML = cardHTML({rank:2, suit:1, id:999});
        var card = box.firstChild;
        out.suitSpans = card ? card.querySelectorAll('.mid, .rs, .s').length : -1;
        out.hasBottomS = !!(card && card.querySelector('.s'));
        out.hasCornerRs = !!(card && card.querySelector('.r .rs'));
        out.cardHTML = card ? card.innerHTML.slice(0,200) : '';
      } else out.ready = false;
      /* 按钮与函数可见性 */
      out.selAllBtn = !!document.querySelector('#btn-sel-all');
      out.selNoneBtn = !!document.querySelector('#btn-sel-none');
      out.hasDrag = typeof ddzDrag !== 'undefined' && typeof DDZ_DRAG_PX === 'number';
      out.threshold = typeof DDZ_DRAG_PX === 'number' ? DDZ_DRAG_PX : -1;
      return out;
    })()`);
  });
} catch (e) { check('真实页面 DOM 可读', false, String(e)); }

if (dom) {
  check('真实 cardHTML 只输出 2 个花色位（中央+左上小角标），无右下重复',
    dom.ready === true && dom.suitSpans === 2 && dom.hasBottomS === false && dom.hasCornerRs === true, dom);
  check('真实页面有全选/清空按钮且扫选阈值就绪',
    dom.selAllBtn === true && dom.selNoneBtn === true && dom.hasDrag === true && dom.threshold === 6, dom);
}

const result = {
  scope: '斗地主卡面无重复花色 + 按住扫选批量选牌（不改牌型/结算/托管）',
  passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed).length, rows,
};
if (out) fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
