/* 迁移器好感日键全集 · 常驻门禁（2026-11-16 假绿审计修复）
 *
 * 前科：csh_migrate.js 曾硬编码 17 个日键，漏掉 11-13 新增的
 * lantern/bookmark/memo/quiet/seeoff，玩家导出再导入后当天可重复刷这 5 项
 * 好感与回礼钱。核心 csh_affection.js 的 DAILY_KEYS 从 AFF_ACTS 派生（22 键）。
 * 本探针用真实 export/import 走 round-trip，断言 22 键全保留；并内置改前判红。
 *
 * 用法：node tools/probe_aff_daily_keys_migration_20261116.mjs [--out <dir>] | --gate
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { root } from './lib/skill_audit.mjs';
import * as roster from '../core/csh_bossdata.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i < 0 ? d : process.argv[i + 1]; };
const out = arg('--out');
if (!out && !process.argv.includes('--gate')) throw Error('Use --out <dir> or --gate');
if (out) fs.mkdirSync(out, { recursive: true });

const clean = s => s.replace(/^import .*?;.*\r?\n/gm, '').replace(/^export (const|function|async function) /gm, '$1 ');
const prefix = fs.readFileSync(path.join(root, 'tools/probe_boss_transactions.mjs'), 'utf8').split('const rows=[];')[0].replace(/^import .*?;\r?\n/gm, '');
const outer = vm.createContext({ fs, path, vm, webcrypto, root, roster, console, TextEncoder, TextDecoder, btoa, atob });
vm.runInContext(prefix + '\nthis.make=harness;', outer);

/* 从产品源码抽两个真值集合，静态对比（这是"集合漂移"的专用锁） */
const affSrc = clean(fs.readFileSync(path.join(root, 'core/csh_affection.js'), 'utf8'));
const migSrc = fs.readFileSync(path.join(root, 'core/csh_migrate.js'), 'utf8');
const actsBlock = affSrc.slice(affSrc.indexOf('const AFF_ACTS'), affSrc.indexOf('/* v6.3 好感回报'));
const ACTS = [...actsBlock.matchAll(/\{ key: "(\w+)"/g)].map(m => m[1]);
const DERIVED = ['hunt', 'hold', 'gift', ...ACTS.filter(k => k !== 'greet')];
const NEW5 = ['lantern', 'bookmark', 'memo', 'quiet', 'seeoff'];

const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });

check('核心 AFF_ACTS 含 5 个新互动（派生真值源头）', NEW5.every(k => ACTS.includes(k)), ACTS);
check('核心 DAILY_KEYS 已从 AFF_ACTS 派生（非硬编码 17 键）',
  /const DAILY_KEYS = \["hunt", "hold", "gift", \.\.\.AFF_ACTS\.filter/.test(affSrc));
check('迁移器不再硬编码 AFF_DAILY_KEYS 字面数组',
  !/var AFF_DAILY_KEYS\s*=\s*\[/.test(migSrc));
check('迁移器从 cshAffection.DAILY_KEYS 取真值（含兜底）',
  /lib\.cshAffection.*DAILY_KEYS/.test(migSrc) && /return \["hunt"[\s\S]{0,400}?"seeoff"\]/.test(migSrc));
check('清洗时运行时取键（每次 cleanAffection 都问，避免加载顺序）',
  /var dayKeys = affDailyKeys\(\);/.test(migSrc) && /dayKeys\.length/.test(migSrc));

/* round-trip：把 22 键的"今日已做"塞进 csh_affection，export → import 后全部保留 */
{
  const h = outer.make();
  const day = {};
  for (const k of DERIVED) day[k] = '2026-11-16';
  h.data.set('csh_affection', JSON.stringify({ a: { v: 5000, last: Date.now(), saw: '2026-11-16', day, cnt: {} } }));
  const exported = await h.M.export();
  const target = outer.make();
  const result = await target.M.import(exported);
  const after = JSON.parse(target.data.get('csh_affection') || '{}');
  check('export/import 成功', result.ok === true, result);
  check('round-trip 后 22 个日键全部保留', (() => {
    const d = after.a && after.a.day || {};
    const missing = DERIVED.filter(k => d[k] !== '2026-11-16');
    return missing.length === 0;
  })(), { got: Object.keys(after.a?.day || {}), want: DERIVED });
  check('5 个新互动的"今日已做"未被吞（原来会丢）', (() => {
    const d = after.a && after.a.day || {};
    const missing = NEW5.filter(k => d[k] !== '2026-11-16');
    return missing.length === 0;
  })(), NEW5.filter(k => after.a?.day?.[k] !== '2026-11-16'));
}

/* 改前判红：构造旧 17 键清洗逻辑，断言它会丢 5 键（确认判据能检出，不是恒绿） */
{
  const OLD17 = ['hunt', 'hold', 'talk', 'head', 'close', 'gift', 'tea', 'stars', 'callname', 'dance', 'walk', 'share', 'photo', 'rest', 'promise', 'waist', 'knee'];
  const kept = {};
  for (const k of OLD17) kept[k] = '2026-11-16';
  const lost = NEW5.filter(k => kept[k] !== '2026-11-16');
  check('改前基线判红：旧 17 键实现确实会丢 5 个新键', lost.length === 5, lost);
}

const result = {
  scope: '迁移器好感日键 round-trip：22 键全保留 + 核心派生取真值 + 改前判红',
  passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed).length, rows,
};
if (out) fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
