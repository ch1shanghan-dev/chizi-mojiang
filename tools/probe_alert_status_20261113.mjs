/* 报错状态边界（2026-11-13）
 * 用户问「报错修复好了吗」——答案必须分层、且不许把代码层修补等同于真机治愈。
 * 本探针把这条诚实边界变成硬约束：异常边界在位、真机待验标记不丢、
 * 工作板/方案里不得出现「已完全治愈」这类无证据结论。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditTempRoot } from './lib/audit_scratch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(auditTempRoot(), 'alert-status')));
fs.mkdirSync(out, { recursive: true });
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });
const save = o => { try { fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(o, null, 2)); } catch (e) {} };

const fb = read('core/csh_achievement_feedback.js');
const plan = read('docs/audit/PLAN_4_0_17_20261112.md');
const work = read('docs/audit/CURRENT_WORK.md');

check('通知层有统一异常入口 report/safely/safeHandler',
  /function report\(/.test(fb) && /function safely\(/.test(fb) && /function safeHandler\(/.test(fb));
check('对外 API 逐个 guarded 兜底（异常不冒到宿主）',
  /var guarded=\{\}/.test(fb) && /try\{return fn\.apply\(null,arguments\);\}catch\(e\)\{report\('api\.'/.test(fb) &&
  /return guarded;/.test(fb) && (fb.match(/safeHandler\(/g) || []).length >= 5);
check('降级只写 console.warn + env.onError，不弹原生 Alert',
  !/window\.alert|\balert\(/.test(fb) && /console\.warn/.test(fb) && /env\.onError/.test(fb));
check('方案明确记录「安卓横屏复测」是未闭环项',
  /安卓.*复测|真机待验/.test(plan) && /未通过前不宣称/.test(plan));
check('方案明确旧截图设备可能仍运行 4.0.16（不能归因到本地 4.0.17）',
  /4\.0\.16/.test(plan) && /截图设备/.test(plan));
check('全库无「已完全治愈 Alert」这类无证据结论',
  !/Alert[^。\n]{0,20}已完全治愈|已完全治愈[^。\n]{0,20}Alert/.test(plan + work));

const failures = rows.filter(r => !r.passed);
save({ rows });
console.log(JSON.stringify({ passed: rows.length - failures.length, failed: failures.length, failures, output: out }, null, 2));
process.exitCode = failures.length ? 1 : 0;
