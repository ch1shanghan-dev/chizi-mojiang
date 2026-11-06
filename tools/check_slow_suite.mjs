#!/usr/bin/env node
/**
 * 独立慢速验证通道（B14，2026-11-06）
 *
 * 承接 docs/audit/WORKBUDDY_B9_ORPHAN_PROBES_20261106.md §五.4 / §六.3：
 * `probe_achievement_quality.mjs` 实跑 78/0 但耗时 118–166s（本次副本实测见报告），
 * 远超 tools/check.js 里 runProbeJson 默认 20s / E57—E94 段 30s 的预算。
 * 把 2 分钟级探针塞进快速门禁会把每次检查拖到十几分钟，因此这里提供一条
 * **独立、可选、手动触发**的慢速验证入口：发布前或怀疑回归时跑，不进日常门禁。
 *
 * 用法：
 *   node tools/check_slow_suite.mjs --out D:/.../slow-run
 *   node tools/check_slow_suite.mjs --out D:/.../slow-run --only probe_achievement_quality.mjs
 *   node tools/check_slow_suite.mjs --out D:/.../slow-run --only achievement_quality
 *
 * 契约：
 *   · 逐个 spawn，每个探针给独立超时（quality ≥ 240000ms）；
 *   · 记录每个探针的 exit / 耗时(ms) / passed / failed / 结果来源；
 *   · 汇总写 <out>/slow-suite.json；stdout 输出**纯 JSON** {passed, failed, results:[...]}；
 *   · 单个探针失败不中断其余；整体 failed>0 时 process.exitCode=1；
 *   · stdout 非纯 JSON 的探针：先尝试解析文本汇总，仍拿不到则如实标注 unparsed/blocked，
 *     不冒充通过；**不修改任何探针文件**；
 *   · 所有 --out 产物与日志都落在 --out（D 盘）目录内，不写仓库内文件。
 *
 * 全程只读业务文件；不提交、不推送、不升版本、不改 check.js / check_update_suite.mjs。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (n, d = null) => { const i = argv.indexOf(n); return i < 0 || !argv[i + 1] ? d : argv[i + 1]; };
const emit = obj => process.stdout.write(JSON.stringify(obj) + '\n');

/* ------------------------------------------------------------------ *
 * 慢速探针清单（B14 实测清点结果，见 docs/audit/WORKBUDDY_B14_SLOW_SUITE_20261106.md）
 *   out: 'dir' = --out 目录 | 'file' = --out 结果文件 | 'none' = 不传 --out
 *   timeout: 每个探针独立超时（ms）
 * 只纳入「本副本能跑通且实测耗时明显 >30s」的探针；*_host.mjs 等环境起不来的
 * 一律不塞进来冒充通过。min passed 不设下界，按 exit / failed 判定（见报告残余限制）。
 * ------------------------------------------------------------------ */
const SPEC = [
  // 实测耗时降序（B14 清点，见报告 §三/§四）；每个超时独立且留足余量。
  { name: 'probe_achievement_quality.mjs',       out: 'file', timeout: 240000 }, // 89.7s / 78/0
  { name: 'probe_career_achievements.mjs',       out: 'dir',  timeout: 200000 }, // 77.3s / 142/0
  { name: 'probe_update_lifecycle_20261105.mjs', out: 'dir',  timeout: 200000 }, // 66.9s / 29/0
  { name: 'probe_world_ui_rebuild.mjs',          out: 'dir',  timeout: 180000 }, // 48.1s / 80/0
  { name: 'probe_world_memoir_ui.mjs',           out: 'dir',  timeout: 180000 }, // 36.9s / 92/0
  { name: 'probe_update_ui_20261105.mjs',        out: 'dir',  timeout: 180000 }, // 33.1s / 33/0
  { name: 'probe_panel_window.mjs',              out: 'dir',  timeout: 180000 }, // 33.2s / 69/0
  // B14 时 92/12 被排除，B15 查明是探针夹具漏加载 csh_world_view.js + 两处写死旧 DOM，
  // 修好后 108/0（见 WORKBUDDY_B15_WORLD_ENTRY_20261106.md），重新纳入。
  { name: 'probe_world_entry.mjs',               out: 'dir',  timeout: 180000 }, // 49.1s / 108/0
];

/** 从 stdout 提取 passed/failed：先纯 JSON（单行或多行 pretty），再文本汇总回退。 */
function parseCounts(stdout) {
  let json = null;
  for (const line of stdout.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith('{')) continue;
    try { const o = JSON.parse(t); if (typeof o.passed === 'number' && typeof o.failed === 'number') json = o; } catch {}
  }
  if (!json) {
    const first = stdout.indexOf('{'), last = stdout.lastIndexOf('}');
    if (first >= 0 && last > first) {
      try { const o = JSON.parse(stdout.slice(first, last + 1)); if (typeof o.passed === 'number' && typeof o.failed === 'number') json = o; } catch {}
    }
  }
  if (json) return { passed: json.passed, failed: json.failed, via: 'json' };
  let m;
  if ((m = /Career achievement browser:\s*(\d+)\s*PASS\s*\/\s*(\d+)\s*FAIL/i.exec(stdout))) return { passed: +m[1], failed: +m[2], via: 'text' };
  if ((m = /First batch:\s*PASS\s*(\d+)\s*\/\s*FAIL\s*(\d+)/i.exec(stdout))) return { passed: +m[1], failed: +m[2], via: 'text' };
  if ((m = /PASS\s*(\d+)\s*\/\s*FAIL\s*(\d+)/i.exec(stdout))) return { passed: +m[1], failed: +m[2], via: 'text' };
  return { passed: null, failed: null, via: 'none' };
}

/** 识别「环境起不来」而非真实断言失败：只认明确的宿主标志，避免把真实失败误判成环境限制。 */
function envReason(text) {
  const t = (text || '').slice(0, 8000);
  if (/index\.html[\s\S]{0,120}(404|Not found)/i.test(t) || /["']?extensionLoaded["']?\s*:\s*false/i.test(t))
    return '缺 ext/app/index.html，宿主浏览器起不来（GET /index.html 404）';
  return null;
}

function classify(s, exit, c, timedOut, stdout, stderr, ms) {
  const item = {
    probe: s.name, out: s.out, timeout: s.timeout,
    exit, ms, passed: c.passed, failed: c.failed, via: c.via, timedOut,
  };
  if (timedOut) { item.status = 'timeout'; item.reason = '超过独立超时 ' + s.timeout + 'ms'; return item; }
  // 环境限制优先：即便 stdout 带 passed/failed，只要宿主明确起不来就如实标 blocked，不冒充通过。
  const er = envReason(stderr + '\n' + stdout);
  if (exit !== 0 && er) { item.status = 'blocked'; item.reason = '环境限制：' + er; return item; }
  if (exit === 0 && c.failed === 0 && c.passed !== null) { item.status = 'pass'; return item; }
  if (c.passed === null) {
    item.status = 'unparsed';
    item.reason = 'stdout 非纯 JSON 且无法解析文本汇总（如实标注，不冒充通过）';
    return item;
  }
  item.status = 'fail';
  item.reason = 'exit=' + exit + ' failed=' + c.failed;
  return item;
}

function failConfig(reason) {
  emit({ passed: 0, failed: 1, results: [{ probe: 'config', status: 'error', reason }] });
  process.exitCode = 1;
}

function main(outArg, only) {
  const out = path.resolve(outArg);
  fs.mkdirSync(out, { recursive: true });
  const logs = path.join(out, 'logs');
  fs.mkdirSync(logs, { recursive: true });
  const temp = arg('--temp', 'D:/CodexWork/chizi-mojiang/workbuddy/temp');
  const env = { ...process.env, TEMP: temp, TMP: temp, CSH_AUDIT_TEMP: temp };

  let list = SPEC;
  if (only) {
    const key = only.trim();
    list = SPEC.filter(s => s.name === key || s.name === key + '.mjs' ||
      s.name.replace(/^probe_/, '').replace(/\.mjs$/, '') === key);
    if (list.length === 0) {
      failConfig('未知 --only: ' + key + '（可用: ' + SPEC.map(s => s.name).join(', ') + '）');
      return;
    }
  }

  const results = [];
  for (const s of list) {
    const base = s.name.replace(/\.mjs$/, '');
    const dest = path.join(out, base);
    const args = ['tools/' + s.name];
    if (s.out === 'dir')  { fs.mkdirSync(dest, { recursive: true }); args.push('--out', dest); }
    if (s.out === 'file') { args.push('--out', dest + '.json'); }

    const t0 = Date.now();
    let r;
    try {
      r = spawnSync(process.execPath, args, {
        cwd: root, env, encoding: 'utf8', timeout: s.timeout,
        maxBuffer: 64 * 1024 * 1024, windowsHide: true,
      });
    } catch (e) {
      r = { status: -1, stdout: '', stderr: String(e.stack || e), error: e };
    }
    const stdout = r.stdout || '', stderr = r.stderr || '';
    fs.writeFileSync(path.join(logs, base + '.stdout.log'), stdout, 'utf8');
    fs.writeFileSync(path.join(logs, base + '.stderr.log'), stderr, 'utf8');
    const c = parseCounts(stdout);
    const ms = Date.now() - t0;
    const timedOut = !!(r.error && /ETIMEDOUT|timed ?out/i.test(String(r.error)));
    const item = classify(s, r.status, c, timedOut, stdout, stderr, ms);
    results.push(item);
    process.stderr.write(`[${item.status}] ${s.name} exit=${r.status} ${ms}ms passed=${c.passed} failed=${c.failed} via=${c.via}\n`);
  }

  const failed = results.filter(x => x.status !== 'pass').length;
  const passed = results.length - failed;
  const summary = {
    scope: 'Independent optional slow verification suite (B14). Read-only probes, D-drive scratch. Not part of the fast gate.',
    at: new Date().toISOString(),
    repo: root, out, only: only || null,
    total: results.length, passed, failed,
    results,
  };
  fs.writeFileSync(path.join(out, 'slow-suite.json'), JSON.stringify(summary, null, 2));
  emit({ passed, failed, results });
  process.exitCode = failed ? 1 : 0;
}

const outArg = arg('--out');
const only = arg('--only');
if (!outArg) {
  failConfig('--out <D盘目录> 必需');
} else if (!/^D:/i.test(path.parse(path.resolve(outArg)).root.toUpperCase())) {
  failConfig('--out 必须指向 D 盘目录（当前: ' + path.parse(path.resolve(outArg)).root + '）；产物不得写入仓库内');
} else {
  main(outArg, only);
}
