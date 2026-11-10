/* 国内更新镜像 · 客户端接缝验收（2026-11-10）
 *
 * 状态：COS / Nginx 的 HTTPS 基址还没拿到，所以这一批只落「可插拔接缝」，
 * 默认空串 = **零行为变化**。拿到基址后只改 csh_online.js 的一行常量即可接通。
 * 本夹具锁住三件事：
 *   ① 空串时白名单与更新源清单与改前完全一致（不偷偷多发一个请求）；
 *   ② 配置合法 HTTPS 基址后，它确实进入联网白名单，且自动成为第一个更新源；
 *   ③ 源码里不硬编码域名、不写凭据、不改默认离线与 writes:false。
 *
 * 用法：node tools/probe_mirror_seam_20261110.mjs [--out <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { auditTempRoot } from './lib/audit_scratch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(auditTempRoot(), 'mirror-seam')));
fs.mkdirSync(out, { recursive: true });
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });

const onlineSrc = read('core/csh_online.js');
const debugSrc = read('core/csh_debug.js');
const FAKE = 'https://mirror.example.com/';

/* ---------- 静态 ---------- */
check('白名单侧定义了可插拔常量且默认为空串', /var DOMESTIC_MIRROR = '';/.test(onlineSrc));
check('对外暴露 domestic() 只读访问器', /domestic:\s*function\s*\(\)\s*\{\s*return DOMESTIC_MIRROR;\s*\}/.test(onlineSrc));
check('更新侧用 cshHome() 动态取基址（不复制第二份域名）', /function cshHome\(\)/.test(debugSrc) && /sources\.unshift\(\{ name: "国内镜像", base: home \}\)/.test(debugSrc));
check('探测列表是 CSH_UPDATE_SOURCES 的副本（不污染原数组）', /var sources = CSH_UPDATE_SOURCES\.slice\(\);/.test(debugSrc));
check('接缝里没有硬编码任何真实域名/密钥', !/myqcloud\.com|cos\.ap-|SECRET_ID|SECRET_KEY|chishanghan\.icu/.test(onlineSrc + debugSrc));
check('既有 5 个更新源一个不少', (debugSrc.match(/\{ name: "[^"]+", base: (?:CSH_UPDATE_SRC|CSH_UPDATE_MIRRORS\[\d\]) \}/g) || []).length === 5);

/* ---------- 运行时：把常量替换成假基址，在 VM 里跑真实模块 ---------- */
function loadModule(url) {
  const store = {};
  const sandbox = {
    URL, AbortController, TextDecoder, console, setTimeout, clearTimeout,
    localStorage: {
      getItem: k => store[k] === undefined ? JSON.stringify({ v: 1, enabled: true, publishFor: '' }) : store[k],
      setItem: (k, v) => { store[k] = v; }, removeItem: k => { delete store[k]; }
    },
    addEventListener() {},
    fetch() { return Promise.reject(Error('FETCH_REACHED')); }   // 过了白名单才会到这里
  };
  sandbox.globalThis = sandbox;
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  const src = url
    ? onlineSrc.replace("var DOMESTIC_MIRROR = '';", "var DOMESTIC_MIRROR = '" + url + "';")
    : onlineSrc;
  vm.runInContext(src, sandbox, { filename: 'csh_online.js' });
  return sandbox.CSHOnline;
}

async function reason(api, url) {
  try { await api.external(url, {}); return 'OK'; }
  catch (e) { return String(e && e.message); }
}

const plain = loadModule('');
const configured = loadModule(FAKE);

check('空串：domestic() 返回空', plain.domestic() === '');
check('空串：默认仍是离线优先（writes 仍 false）', plain.service().writes === false);
check('空串：陌生 HTTPS 源仍被白名单拒绝', (await reason(plain, FAKE + 'info.json')).includes('不在可信列表'));

check('配置后：domestic() 返回同一基址', configured.domestic() === FAKE);
check('配置后：该源进入可信白名单（external 放行到 fetch）',
  (await reason(configured, FAKE + 'info.json')) === 'FETCH_REACHED');
check('配置后：其它陌生域名仍在白名单外',
  (await reason(configured, 'https://evil.example.net/info.json')).includes('不在可信列表'));

const failures = rows.filter(r => !r.passed);
fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ rows, fake: FAKE }, null, 2));
console.log(JSON.stringify({ passed: rows.length - failures.length, failed: failures.length, failures, output: out }, null, 2));
process.exitCode = failures.length ? 1 : 0;
