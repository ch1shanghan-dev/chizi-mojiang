/* 妖灵装扮生产注册表验收（2026-11-09 首批素材）
 * 只做只读静态 + 模型级核对，不启浏览器、不写玩家存档。
 * 锁住四件事：资源真实存在且规格统一、脚本真的进了加载图、
 * 全部装扮无门槛可选、发布清单收录了每一个文件。 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(!ok ? { detail } : {}) });
const read = p => fs.readFileSync(path.join(root, p), 'utf8');

const baseSrc = read('core/csh_spirit_skins.js');
const catalogSrc = read('core/csh_spirit_skins_catalog.js');
const codex = read('games/codex.html');
const release = read('catalog.js');
const migrate = read('core/csh_migrate.js');

/* ---------- 在隔离 realm 里跑真实基座 + 真实生产注册表 ---------- */
const ctx = { window: {}, console };
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(baseSrc, ctx, { filename: 'csh_spirit_skins.js' });
vm.runInContext(catalogSrc, ctx, { filename: 'csh_spirit_skins_catalog.js' });
const S = ctx.window.CSHSpiritSkins;
const meta = ctx.window.CSHSpiritSkinCatalog;

check('生产注册表已产出汇总', !!meta && meta.version === 1, meta);
check('解锁策略是全部开放（all）', !!meta && meta.unlock === 'all', meta && meta.unlock);
check('18 位妖灵 / 70 套装扮', !!meta && meta.spiritCount === 18 && meta.skinCount === 70, meta);

/* 从源码里把 DATA 表解析出来，逐项核对 */
const dataBlock = catalogSrc.slice(catalogSrc.indexOf('var DATA = {'), catalogSrc.indexOf('  };\n  var spiritCount'));
const entries = [...dataBlock.matchAll(/'(csh_boss_minion_[a-z0-9_]+)':\s*\[([\s\S]*?)\]/g)];
const parsed = entries.map(([, id, body]) => ({
  id,
  rows: [...body.matchAll(/\{\s*id:\s*'([A-Za-z0-9_-]+)',\s*name:\s*'([^']+)',\s*portrait:\s*'([^']+)',\s*face:\s*'([^']+)'\s*\}/g)]
    .map(([, sid, name, portrait, face]) => ({ sid, name, portrait, face }))
}));
check('数据表可解析且条目数吻合', parsed.length === 18 && parsed.reduce((n, e) => n + e.rows.length, 0) === 70,
  { groups: parsed.length, rows: parsed.reduce((n, e) => n + e.rows.length, 0) });

const all = parsed.flatMap(e => e.rows.map(r => ({ ...r, spirit: e.id })));
const ids = parsed.map(e => e.id);
check('妖灵 ID 全部是 canonical 且互不重复', new Set(ids).size === 18 && ids.every(id => /^csh_boss_minion_[a-z0-9_]{1,50}$/.test(id)), ids);
check('装扮 ID 全表唯一（含罗宾 s1a/s1b）', new Set(all.map(r => r.spirit + '/' + r.sid)).size === 70);
check('装扮 ID 符合基座白名单且不含 classic', all.every(r => /^[A-Za-z0-9_-]{1,60}$/.test(r.sid) && r.sid !== 'classic'));
check('每个显示名都非空且不超长', all.every(r => r.name.trim().length > 0 && r.name.length <= 40));
check('同一妖灵内显示名不重复', parsed.every(e => new Set(e.rows.map(r => r.name)).size === e.rows.length));

/* ---------- webP 二进制规格：不依赖任何图像库 ---------- */
function webpSize(buf) {
  if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WEBP') return null;
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') {
    const b = [buf[21], buf[22], buf[23], buf[24]];
    return [(b[0] | ((b[1] & 0x3f) << 8)) + 1, ((b[1] >> 6) | (b[2] << 2) | ((b[3] & 0xf) << 10)) + 1];
  }
  return null;
}
const assets = [];
for (const r of all) for (const p of [r.portrait, r.face]) assets.push({ path: p, face: p.endsWith('_face.webp') });
let missing = [], wrongFmt = [], wrongSize = [];
for (const a of assets) {
  const f = path.join(root, a.path);
  if (!fs.existsSync(f)) { missing.push(a.path); continue; }
  const buf = fs.readFileSync(f);
  const dim = webpSize(buf);
  if (!dim) { wrongFmt.push(a.path); continue; }
  const expect = a.face ? [400, 500] : [1300, 1600];
  if (dim[0] !== expect[0] || dim[1] !== expect[1]) wrongSize.push({ path: a.path, dim, expect });
}
check('140 个资源文件全部存在', missing.length === 0, missing.slice(0, 6));
check('全部是合法 webP', wrongFmt.length === 0, wrongFmt.slice(0, 6));
check('立绘统一 1300x1600 / 头像统一 400x500', wrongSize.length === 0, wrongSize.slice(0, 6));
check('资源路径符合基座 asset() 白名单（无中文/上级路径/远程）',
  assets.every(a => /^image\/[A-Za-z0-9_\-/]+\.webp$/.test(a.path) && !a.path.split('/').includes('..')));

/* ---------- 加载图与发布清单（前面吃过「写了没加载 / 漏收 catalog」的亏） ---------- */
check('codex.html 真的引入了生产注册表（不是只在文本里提到）',
  /<script[^>]+src="[^"]*csh_spirit_skins_catalog\.js"/.test(codex));
check('基座脚本排在注册表之前', codex.indexOf('csh_spirit_skins.js') < codex.indexOf('csh_spirit_skins_catalog.js'));
check('弹层文案如实说明全部开放、无解锁顺序', codex.includes('全部装扮已开放') && codex.includes('无解锁顺序'));
check('不再残留「更多装扮将在后续加入」的旧文案', !codex.includes('更多装扮将在后续加入'));
check('catalog.js 收录了注册表模块', release.includes('core/csh_spirit_skins_catalog.js'));
const notInRelease = assets.filter(a => !release.includes('"' + a.path + '"')).map(a => a.path);
check('发布清单收录全部 140 个资源', notInRelease.length === 0, notInRelease.slice(0, 6));
check('迁移域已覆盖装扮偏好（导入导出不丢选择）', /\["spiritSkins",\s*"csh_spirit_skin_v1"/.test(migrate));

/* ---------- 无顺序解锁：任意装扮第一次打开就能选 ---------- */
const store = (() => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
const list = S.list('csh_boss_minion_robin', 'classic.webp');
check('list 返回经典形象 + 该妖灵全部装扮（无隐藏项）', list.length === 7 && list[0].id === 'classic', list.map(r => r.id));
check('顺序无关：任意非首套装扮都能直接 select 成功', (() => {
  try { return S.select('csh_boss_minion_robin', 's5', store) === true && S.resolve('csh_boss_minion_robin', 'classic.webp', store).skin.id === 's5'; }
  catch (e) { return 'ERR ' + e.message; }
})() === true);
check('罗宾 s1a / s1b 都能选中（两张同名原图未合并）', (() => {
  try { S.select('csh_boss_minion_robin', 's1a', store); const a = S.resolve('csh_boss_minion_robin', 'classic.webp', store).skin.id;
        S.select('csh_boss_minion_robin', 's1b', store); const b = S.resolve('csh_boss_minion_robin', 'classic.webp', store).skin.id;
        return a === 's1a' && b === 's1b'; } catch (e) { return false; }
})());
const bufA = fs.readFileSync(path.join(root, 'image/spirit-skins/robin/s1a.webp'));
const bufB = fs.readFileSync(path.join(root, 'image/spirit-skins/robin/s1b.webp'));
check('s1a 与 s1b 内容确实不同', !bufA.equals(bufB));
check('可随时恢复经典', (() => { try { return S.select('csh_boss_minion_robin', 'classic', store) === true && S.resolve('csh_boss_minion_robin', 'classic.webp', store).skin.id === 'classic'; } catch (e) { return false; } })());

/* ---------- 取舍边界：空文件夹与「暂时不动」不入库 ---------- */
check('纲手（暂时不动）没有进注册表', !catalogSrc.includes('tsunade') && !catalogSrc.includes('纲手'));
check('只有带素材的 18 位妖灵进表，空文件夹不占位', parsed.length === 18 && parsed.every(e => e.rows.length > 0));
check('没有把桌面原图扩展名带进仓库', !catalogSrc.includes('.jfif') && !catalogSrc.includes('.jpg'));

/* ---------- 改前基线：把加载行去掉应当判红 ---------- */
const stripped = codex.replace(/<script[^>]+src="[^"]*csh_spirit_skins_catalog\.js"[^>]*><\/script>/, '');
check('改前基线可检出：移除加载行会失去注册表', !/<script[^>]+src="[^"]*csh_spirit_skins_catalog\.js"/.test(stripped));

const result = { scope: 'Production spirit skin catalog: assets, load graph, release manifest, all-unlocked selection.',
  passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed).length, rows };
const outIdx = process.argv.indexOf('--out');
if (outIdx > -1 && process.argv[outIdx + 1]) {
  const p = process.argv[outIdx + 1];
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(result, null, 2));
}
console.log(JSON.stringify({ ...result, rows: result.rows.filter(r => !r.passed) }));
if (result.failed) process.exitCode = 1;
