/* 图鉴降级互动表与核心 AFF_ACTS 一致性 · 常驻门禁（2026-11-16 假绿审计修复）
 *
 * 前科：codex.html 本地兜底 acts 只有 7 项，核心 csh_affection.AFF_ACTS 已有 20 项；
 * affApi() 为 null（独立打开/宿主未就绪）时玩家只看到 7 项，13 项互动凭空消失。
 * 本探针静态对比两个 key 集合，并在真实浏览器里验证降级渲染出全部 20 项按钮。
 *
 * 用法：node tools/probe_codex_acts_parity_20261116.mjs [--out <dir>] | --gate
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { root } from './lib/skill_audit.mjs';
import { withChromium } from './lib/chromium_audit.mjs';
import { auditTempRoot } from './lib/audit_scratch.mjs';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const out = arg('--out');
if (!out && !process.argv.includes('--gate')) throw Error('Use --out <dir> or --gate');
if (out) fs.mkdirSync(out, { recursive: true });

const affSrc = fs.readFileSync(path.join(root, 'core/csh_affection.js'), 'utf8');
const codexHtml = fs.readFileSync(path.join(root, 'games/codex.html'), 'utf8');
const coreBlock = affSrc.slice(affSrc.indexOf('export const AFF_ACTS'), affSrc.indexOf('/* v6.3 好感回报'));
const localBlock = codexHtml.slice(codexHtml.indexOf('  acts: ['), codexHtml.indexOf('  perks: ['));
const CORE = [...coreBlock.matchAll(/\{ key: "(\w+)"/g)].map(m => m[1]);
const LOCAL = [...localBlock.matchAll(/\{ key: "(\w+)", name:/g)].map(m => m[1]);

const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });

check('核心 AFF_ACTS 20 项可解析', CORE.length === 20, CORE);
check('页面降级 acts 与核心 20 项 key 集合完全一致', (() => {
  const missing = CORE.filter(k => !LOCAL.includes(k));
  const extra = LOCAL.filter(k => !CORE.includes(k));
  return missing.length === 0 && extra.length === 0 && LOCAL.length === CORE.length;
})(), { core: CORE.length, local: LOCAL.length, missing: CORE.filter(k => !LOCAL.includes(k)), extra: LOCAL.filter(k => !CORE.includes(k)) });
check('降级表同步 adultsOnly 与解锁档位（关键字段不丢）',
  /"waist"[^}]*adultsOnly:\s*true/.test(localBlock) && /"knee"[^}]*adultsOnly:\s*true/.test(localBlock) &&
  /"close"[^}]*need:\s*"B"/.test(localBlock) && /"seeoff"[^}]*needV:\s*38000/.test(localBlock));
check('降级路径仍是"仅可查看"：affApi 为空时按钮 disabled，不伪造可写',
  /if \(!actionApi\) \{\s*detail = "宿主未连接，仅可查看"/.test(codexHtml));
check('改前基线判红：旧 7 项实现确实缺 13 项',
  ['greet','talk','head','close','tea','stars','callname'].every(k => CORE.includes(k)) &&
  CORE.filter(k => !['greet','talk','head','close','tea','stars','callname'].includes(k)).length === 13);

/* 真实浏览器：独立打开 codex（affApi 为 null），检查降级渲染出的按钮数 */
try {
  await withChromium({ width: 1024, height: 600 }, async send => {
    let html = codexHtml.replace(/(src|href)="\.\.\/([^"]+)"/g, (_, k, f) => k + '="' + pathToFileURL(path.join(root, f)).href + '"');
    /* 产品页是 IIFE，照 codex_selection 探针的做法在末尾导出内部符号供量测 */
    const at = html.lastIndexOf('})();');
    html = html.slice(0, at) + 'window.ct={Data:Data,AFF:AFF,affApi:affApi};\n' + html.slice(at);
    const tmp = fs.mkdtempSync(path.join(auditTempRoot(), 'codex-acts-'));
    const file = path.join(tmp, 'codex.html');
    fs.writeFileSync(file, html);
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.navigate', { url: pathToFileURL(file).href });
    for (let i = 0; i < 150; i++) {
      const r = await send('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true });
      if (r.result.value === 'complete') break;
      await new Promise(r => setTimeout(r, 40));
    }
    const val = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    const m = await val(`(() => {
      const A = window.ct && window.ct.AFF || window.AFF;
      const apiNull = !!(A && !window.ct.affApi());
      return { ready: !!window.ct, localCount: A && A.acts ? A.acts.length : -1,
               names: A && A.acts ? A.acts.map(x=>x.key) : [], apiNull };
    })()`);
    check('真实页面降级表长度为 20', m.ready === true && m.localCount === 20, m);
    check('真实页面降级表 key 与核心一致', JSON.stringify(m.names) === JSON.stringify(CORE), m);
  });
} catch (e) { check('真实浏览器降级渲染可读', false, String(e)); }

const result = {
  scope: '图鉴降级互动表与核心 AFF_ACTS 一致性（key 集合/关键字段/独立页真实渲染）',
  passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed).length, rows,
};
if (out) fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
