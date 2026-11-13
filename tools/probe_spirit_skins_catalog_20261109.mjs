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

check('生产注册表已产出 v2 汇总', !!meta && meta.version === 2, meta);
check('解锁策略是每套 10,000 CBY', !!meta && meta.unlock === 'cby-10000' && meta.price === 10000, meta && meta.unlock);
check('34 位妖灵 / 112 套装扮（2026-11-13 接 10 组 25 张）', !!meta && meta.spiritCount === 34 && meta.skinCount === 112, meta);
check('注册表不再含与经典基座同图的 empress/s1', !catalogSrc.includes('empress/s1'), 'empress/s1 仍在注册表里');

/* 从源码里把 DATA 表解析出来，逐项核对 */
const dataBlock = catalogSrc.slice(catalogSrc.indexOf('var DATA = {'), catalogSrc.indexOf('  };\n  var spiritCount'));
const entries = [...dataBlock.matchAll(/'(csh_boss_minion_[a-z0-9_]+)':\s*\[([\s\S]*?)\]/g)];
const parsed = entries.map(([, id, body]) => ({
  id,
  rows: [...body.matchAll(/\{\s*id:\s*'([A-Za-z0-9_-]+)',\s*name:\s*'([^']+)',\s*portrait:\s*'([^']+)',\s*face:\s*'([^']+)'\s*\}/g)]
    .map(([, sid, name, portrait, face]) => ({ sid, name, portrait, face }))
}));
check('数据表可解析且条目数吻合', parsed.length === 34 && parsed.reduce((n, e) => n + e.rows.length, 0) === 112,
  { groups: parsed.length, rows: parsed.reduce((n, e) => n + e.rows.length, 0) });

const all = parsed.flatMap(e => e.rows.map(r => ({ ...r, spirit: e.id })));
check("春丽 3 套和蒂法 2 套都已登记", ["chunli","tifa"].every((slug,i) => S.list("csh_boss_minion_"+slug,"classic.webp").length === 4-i));
const ids = parsed.map(e => e.id);
check('妖灵 ID 全部是 canonical 且互不重复', new Set(ids).size === 34 && ids.every(id => /^csh_boss_minion_[a-z0-9_]{1,50}$/.test(id)), ids);
check('装扮 ID 全表唯一（含罗宾 s1a/s1b）', new Set(all.map(r => r.spirit + '/' + r.sid)).size === 112);
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
check('224 个资源文件全部存在', missing.length === 0, missing.slice(0, 6));
check('全部是合法 webP', wrongFmt.length === 0, wrongFmt.slice(0, 6));
check('立绘统一 1300x1600 / 头像统一 400x500', wrongSize.length === 0, wrongSize.slice(0, 6));
check('资源路径符合基座 asset() 白名单（无中文/上级路径/远程）',
  assets.every(a => /^image\/[A-Za-z0-9_\-/]+\.webp$/.test(a.path) && !a.path.split('/').includes('..')));

/* ---------- 加载图与发布清单（前面吃过「写了没加载 / 漏收 catalog」的亏） ---------- */
check('codex.html 真的引入了生产注册表（不是只在文本里提到）',
  /<script[^>]+src="[^"]*csh_spirit_skins_catalog\.js"/.test(codex));
check('基座脚本排在注册表之前', codex.indexOf('csh_spirit_skins.js') < codex.indexOf('csh_spirit_skins_catalog.js'));
check('弹层文案如实说明经典免费与 10,000 CBY 解锁', codex.includes('经典形象免费') && codex.includes('10,000 CBY'));
check('不再残留「更多装扮将在后续加入」的旧文案', !codex.includes('更多装扮将在后续加入'));
check('catalog.js 收录了注册表模块', release.includes('core/csh_spirit_skins_catalog.js'));
const notInRelease = assets.filter(a => !release.includes('"' + a.path + '"')).map(a => a.path);
check('发布清单收录全部 224 个资源', notInRelease.length === 0, notInRelease.slice(0, 6));
check('迁移域已覆盖装扮偏好（导入导出不丢选择）', /\["spiritSkins",\s*"csh_spirit_skin_v1"/.test(migrate));

/* ---------- 解锁权益：未购买不能选，付款权益后任意切换 ---------- */
const store = (() => { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; })();
const list = S.list('csh_boss_minion_robin', 'classic.webp');
function unlock(id, skin, target = store) { const tx = S.prepareUnlock(id, skin, S.read(target)); S.write(tx.state, target); return tx; }
check('list 返回经典形象 + 该妖灵全部装扮（无隐藏项）', list.length === 7 && list[0].id === 'classic', list.map(r => r.id));
check('未解锁非经典装扮不能直接 select', (() => {
  try { S.select('csh_boss_minion_robin', 's5', store); return false; } catch (e) { return e.message.includes('解锁'); }
})());
check('解锁后任意非首套装扮能选中', (() => {
  try { return unlock('csh_boss_minion_robin', 's5').cost === 10000 && S.select('csh_boss_minion_robin', 's5', store) === true && S.resolve('csh_boss_minion_robin', 'classic.webp', store).skin.id === 's5'; }
  catch (e) { return 'ERR ' + e.message; }
})() === true);
check('罗宾 s1a / s1b 都能选中（两张同名原图未合并）', (() => {
  try { unlock('csh_boss_minion_robin', 's1a'); S.select('csh_boss_minion_robin', 's1a', store); const a = S.resolve('csh_boss_minion_robin', 'classic.webp', store).skin.id;
        unlock('csh_boss_minion_robin', 's1b'); S.select('csh_boss_minion_robin', 's1b', store); const b = S.resolve('csh_boss_minion_robin', 'classic.webp', store).skin.id;
        return a === 's1a' && b === 's1b'; } catch (e) { return false; }
})());
const bufA = fs.readFileSync(path.join(root, 'image/spirit-skins/robin/s1a.webp'));
const bufB = fs.readFileSync(path.join(root, 'image/spirit-skins/robin/s1b.webp'));
check('s1a 与 s1b 内容确实不同', !bufA.equals(bufB));
check('可随时恢复经典', (() => { try { return S.select('csh_boss_minion_robin', 'classic', store) === true && S.resolve('csh_boss_minion_robin', 'classic.webp', store).skin.id === 'classic'; } catch (e) { return false; } })());

/* ---------- 4.0.17 作者授权新增与旧 ID 兼容 ---------- */
check('新增装扮全部可选，纲手保留原妖灵 ID', Object.entries({ mai:5, valentine:4, wonder:1, guangxi:1, oniko:3 }).every(([slug, n]) => {
  const id = 'csh_boss_minion_' + slug;
  const skins = S.list(id, 'classic.webp');
  return skins.length === n + 1 && skins.slice(1).every(row => unlock(id, row.id).cost === 10000 && S.select(id, row.id, store) && S.resolve(id, 'classic.webp', store).skin.id === row.id);
}));
check('只有带素材的 34 位妖灵进表，空文件夹不占位', parsed.length === 34 && parsed.every(e => e.rows.length > 0));
check('没有把桌面原图扩展名带进仓库', !catalogSrc.includes('.jfif') && !catalogSrc.includes('.jpg'));

/* ---------- 皮肤互动第 2 层：只读查询口 + 装扮回应 ---------- */
check('基座导出只读 skinOf 查询口', typeof S.skinOf === 'function');
const skinMem = new Map(), skinWrites = [];
const skinStore = {
  getItem: k => skinMem.has(k) ? skinMem.get(k) : null,
  setItem: (k, v) => { skinWrites.push(k); skinMem.set(k, String(v)); },
  removeItem: k => skinMem.delete(k),
};
check('skinOf 未选择时回 classic', S.skinOf('csh_boss_minion_robin', skinStore).id === 'classic');
check('skinOf 读出当前装扮且带显示名', (() => {
  unlock('csh_boss_minion_robin', 's1a', skinStore); S.select('csh_boss_minion_robin', 's1a', skinStore);
  const r = S.skinOf('csh_boss_minion_robin', skinStore);
  return !!r && r.id === 's1a' && r.name === '花衫';
})());
skinWrites.length = 0;
check('skinOf 归一化助战别名到同一妖灵', S.skinOf('csh_aux_robin', skinStore).id === 's1a');
check('skinOf 对无效 ID 返回 null 而不抛', S.skinOf('not_a_minion', skinStore) === null);
check('skinOf 偏好损坏时回 classic，不把异常抛到业务层', (() => {
  try { return S.skinOf('csh_boss_minion_robin', { getItem: () => '{bad json', setItem() {}, removeItem() {} }).id === 'classic'; }
  catch (e) { return false; }
})());
check('skinOf 全程零写入（只读查询）', skinWrites.length === 0, skinWrites);

const greetBlock = codex.slice(codex.indexOf('var SKIN_GREETINGS'), codex.indexOf('function showSkinGreeting'));
const gctx = vm.createContext({ console });
vm.runInContext(greetBlock + '\nthis.greet = skinGreeting; this.pool = SKIN_GREETINGS;', gctx);
check('装扮回应是有限确定性短句集合', Array.isArray(gctx.pool) && gctx.pool.length >= 4 && gctx.pool.length <= 12);
check('短句含装扮名占位符', gctx.pool.some(s => s.includes('{n}')));
const greetIt = { id: 'csh_boss_minion_eve' };
const g1 = gctx.greet(greetIt, { id: 's1', name: '魔女' });
const g2 = gctx.greet(greetIt, { id: 's1', name: '魔女' });
check('同一妖灵同一装扮回应确定性一致', typeof g1 === 'string' && g1.length > 0 && g1 === g2);
check('回应插入真实装扮名，不留占位符', !g1.includes('{n}'));
check('不同装扮可得到不同回应（不是一句万能话）',
  new Set(['s1', 's2', 's3', 's4', 's5'].map(s => gctx.greet(greetIt, { id: s, name: '造型' }))).size > 1);
check('恢复经典有专属回应', gctx.greet(greetIt, { id: 'classic', name: '经典形象' }).includes('原来这身'));

const showBlock = codex.slice(codex.indexOf('function showSkinGreeting'), codex.indexOf('function paintSpiritFace'));
check('回应只写内存 AFF.say，不写存档 / 不碰好感与互动接口',
  /AFF\.say\s*=/.test(showBlock) && !/setItem|localStorage|saveAllowed|\.interact\(|\.gift\(/.test(showBlock));
check('回应复用既有 .affsay 行，不重建关系控件',
  /querySelector\("\.affsay"\)/.test(showBlock) && !/box\.innerHTML/.test(showBlock));
check('换装成功路径真的调用回应', /showSkinGreeting\(it,selected\.skin\)/.test(codex));
check('改前基线可判红：移除调用会被接线断言检出',
  /showSkinGreeting\(it,selected\.skin\)/.test(codex) &&
  !/showSkinGreeting\(it,selected\.skin\)/.test(codex.replace('showSkinGreeting(it,selected.skin);', '')));

/* ---------- 皮肤互动第 3 层：宿主唯一只读口 + 跨页可见性 ---------- */
function extractFn(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let depth = 0;
  const j = src.indexOf('{', i);
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}' && --depth === 0) return src.slice(i, k + 1);
  }
  return '';
}
const bootSrc = read('main/bootstrap.js');
const shellSrc = read('core/csh_shell.js');
const auxSrc = read('core/csh_aux_spirit.js');
const goldSrc = read('games/goldfish.html');
const pageSrc = read('core/csh_page.js');

check('宿主 bootstrap 显式加载装扮基座与生产注册表',
  /import "\.\.\/core\/csh_spirit_skins\.js"/.test(bootSrc) && /import "\.\.\/core\/csh_spirit_skins_catalog\.js"/.test(bootSrc));
check('两者排在 csh_shell 与 installAuxSpirit() 之前', (() => {
  const a = bootSrc.indexOf('import "../core/csh_spirit_skins.js";');
  const b = bootSrc.indexOf('import "../core/csh_spirit_skins_catalog.js";');
  const shell = bootSrc.indexOf('import "../core/csh_shell.js";');
  const aux = bootSrc.indexOf('installAuxSpirit({');
  return a >= 0 && b >= 0 && shell >= 0 && aux >= 0 && a < shell && b < shell && shell < aux;
})());
check('宿主导出 lib.cshShell.skinOf 唯一只读口', /skinOf: skinOf/.test(shellSrc));
check('shell-goldfish 随同一次快照下发 skins 映射',
  /skinMap\[srow\.id\]\s*=\s*sInfo/.test(shellSrc) && /skins: skinMap/.test(shellSrc));
check('skins 映射只带非经典项', /sInfo\.id !== "classic"/.test(shellSrc));
check('快照用浅拷贝，不污染 market 内部对象', /Object\.assign\(\{\}, outG, \{ skins: skinMap \}\)/.test(shellSrc));

/* 真实基座 + 真实宿主 skinOf 函数体在 VM 里跑 */
const hostMem = new Map(), hostWrites = [];
const hostStorage = {
  getItem: k => hostMem.has(k) ? hostMem.get(k) : null,
  setItem: (k, v) => { hostWrites.push(k); hostMem.set(k, String(v)); },
  removeItem: k => hostMem.delete(k),
};
const hostCtx = vm.createContext({ window: { localStorage: hostStorage }, console });
hostCtx.globalThis = hostCtx;
vm.runInContext(baseSrc, hostCtx);
vm.runInContext(catalogSrc, hostCtx);
vm.runInContext('function wallet(){return null;}\n' + extractFn(shellSrc, 'skinOf') + '\nthis.skinOf = skinOf;', hostCtx);
check('宿主 skinOf 未选装扮时回 classic 空路径',
  hostCtx.skinOf('csh_boss_minion_robin').id === 'classic' && hostCtx.skinOf('csh_boss_minion_robin').portrait === '');
const hostUnlock = hostCtx.window.CSHSpiritSkins.prepareUnlock('csh_boss_minion_robin', 's1a', hostCtx.window.CSHSpiritSkins.read(hostStorage));
hostCtx.window.CSHSpiritSkins.write(hostUnlock.state, hostStorage);
hostCtx.window.CSHSpiritSkins.select('csh_boss_minion_robin', 's1a', hostStorage);
hostWrites.length = 0;
const got = hostCtx.skinOf('csh_boss_minion_robin');
check('宿主 skinOf 返回裸仓库路径（去掉 ../ 前缀）',
  got && got.id === 's1a' && got.portrait === 'image/spirit-skins/robin/s1a.webp' &&
  got.face === 'image/spirit-skins/robin/s1a_face.webp', got);
check('宿主 skinOf 归一化 csh_aux_ 助战别名', hostCtx.skinOf('csh_aux_robin').id === 's1a');
check('宿主 skinOf 全程零写入', hostWrites.length === 0, hostWrites);
hostMem.set('csh_spirit_skin_v1', '{bad json');
check('宿主 skinOf 偏好损坏回 classic 且不抛到业务层', (() => {
  try { return hostCtx.skinOf('csh_boss_minion_robin').id === 'classic'; } catch (e) { return false; }
})());
const noBase = vm.createContext({ window: { localStorage: hostStorage }, console });
noBase.globalThis = noBase;
vm.runInContext('function wallet(){return null;}\n' + extractFn(shellSrc, 'skinOf') + '\nthis.skinOf = skinOf;', noBase);
check('装扮基座未加载时返回 null，不阻塞业务', noBase.skinOf('csh_boss_minion_robin') === null);

/* 金鳞市 skinPath 真实函数体 */
const gpCtx = vm.createContext({
  Data: { snap: { skins: { csh_boss_minion_robin: { id: 's1a', portrait: 'image/spirit-skins/robin/s1a.webp', face: 'image/spirit-skins/robin/s1a_face.webp' } } } },
  console,
});
vm.runInContext(extractFn(goldSrc, 'skinPath') + '\nthis.path = skinPath;', gpCtx);
const gIt = { id: 'csh_boss_minion_robin', img: 'extension/池子魔将/image/csh_minion_robin.webp' };
check('金鳞市卡面取装扮头像并补 ../ 前缀', gpCtx.path(gIt, 'face') === '../image/spirit-skins/robin/s1a_face.webp');
check('金鳞市大图取装扮立绘', gpCtx.path(gIt, 'portrait') === '../image/spirit-skins/robin/s1a.webp');
check('未装扮妖灵返回 null，页面回退经典真源', gpCtx.path({ id: 'csh_boss_minion_eve' }, 'face') === null);

/* 接线与红线：只换图，不碰 id / 资金 / AI / 存档 */
const auxBlock = auxSrc.slice(auxSrc.indexOf('for(const [id,m] of Object.entries(MINIONS))'), auxSrc.indexOf('lib.translate[alias]'));
check('助战妖灵只换 img，不改 id / 技能 / 血量 / 资金 / AI',
  /img:skinImg/.test(auxBlock) && /skills:\['csh_aux_guard'/.test(auxBlock) &&
  !/setItem|fund|stake|aiStake|persona/.test(auxBlock));
check('助战立绘用宿主根相对路径', /'extension\/池子魔将\/'\s*\+\s*sk\.portrait/.test(auxSrc));
check('助战读的是宿主唯一只读口', /lib\.cshShell\.skinOf\(id\)/.test(auxBlock));
check('金鳞市卡面与大图两处都走 skinPath', (goldSrc.match(/img\.src = skinPath\(it,/g) || []).length === 2);
check('金鳞市只从快照 skins 读，不直读 localStorage',
  !/localStorage/.test(extractFn(goldSrc, 'skinPath')));
check('装扮图失效回经典主立绘（卡面与大图都有回退）',
  (goldSrc.match(/img\.src\.indexOf\(deep\)/g) || []).length >= 2);
check('复用既有 shell-goldfish 快照，未新增桥命令 / 未改 csh_page 白名单',
  !/shell-skin-of/.test(goldSrc) && !/shell-skin-of/.test(shellSrc) && !/shell-skin-of/.test(pageSrc));
check('改前基线可判红：移除宿主加载行会被加载图断言检出',
  /import "\.\.\/core\/csh_spirit_skins\.js"/.test(bootSrc) &&
  !/import "\.\.\/core\/csh_spirit_skins\.js"/.test(bootSrc.replace('import "../core/csh_spirit_skins.js";', '')));

/* ---------- 改前基线：把加载行去掉应当判红 ---------- */
const stripped = codex.replace(/<script[^>]+src="[^"]*csh_spirit_skins_catalog\.js"[^>]*><\/script>/, '');
check('改前基线可检出：移除加载行会失去注册表', !/<script[^>]+src="[^"]*csh_spirit_skins_catalog\.js"/.test(stripped));

const result = { scope: 'Production spirit skin catalog: assets, load graph, release manifest, wallet-backed unlock selection.',
  passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed).length, rows };
const outIdx = process.argv.indexOf('--out');
if (outIdx > -1 && process.argv[outIdx + 1]) {
  const p = process.argv[outIdx + 1];
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(result, null, 2));
}
console.log(JSON.stringify({ ...result, rows: result.rows.filter(r => !r.passed) }));
if (result.failed) process.exitCode = 1;
