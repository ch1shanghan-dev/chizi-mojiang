/* 牌桌人物头像 · 常驻门禁（2026-11-14 批次 E）
 *
 * 为什么需要：四桌座位长期只有 CRD.avatar() 的程序化「姓氏首字」SVG。世界名册
 * = 武将 csh_*（100 条 img 立绘）+ 妖灵 csh_boss_minion_*（51 张经典头像 + 装扮头像），
 * 两层都有真实图。本探针在真实页面里问 CSH.cards.facePath/faceHTML，验证
 * 名字与图零错配、装扮跟随、缺图回退，并锁住五处调用点。
 *
 * 用法：node tools/probe_table_faces_20261114.mjs [--out <dir>]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { withChromium } from './lib/chromium_audit.mjs';
import { auditTempRoot } from './lib/audit_scratch.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const out = path.resolve(arg('--out', path.join(auditTempRoot(), 'table-faces')));
fs.mkdirSync(out, { recursive: true });
const rows = [];
const check = (name, ok, detail) => rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });
const save = o => { try { fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify(o, null, 2)); } catch (e) {} };

const cards = fs.readFileSync(path.join(root, 'core/csh_cards.js'), 'utf8');
const pages = {
  texas: fs.readFileSync(path.join(root, 'games/texas/texas.html'), 'utf8'),
  blackjack: fs.readFileSync(path.join(root, 'games/blackjack/blackjack.html'), 'utf8'),
  doudizhu: fs.readFileSync(path.join(root, 'games/doudizhu/doudizhu.html'), 'utf8'),
  uno: fs.readFileSync(path.join(root, 'games/uno/uno.html'), 'utf8'),
};
const character = fs.readFileSync(path.join(root, 'character/index.js'), 'utf8');
const bossdata = fs.readFileSync(path.join(root, 'core/csh_bossdata.js'), 'utf8');

/* ---------- 静态：共享层与五处接线 ---------- */
check('共享层提供 facePath / faceHTML 且已导出', /function facePath\(/.test(cards) && /function faceHTML\(/.test(cards) && /avatar: avatar, facePath: facePath, faceHTML: faceHTML/.test(cards));
check('人物头像铺满容器且圆形裁切', /csh-face-img[^}]*object-fit:cover/.test(cards));
check('缺图 error 监听会把头像换回程序化 SVG', /addEventListener\("error"/.test(cards) && /csh-face-img/.test(cards) && /box\.innerHTML = avatar\(/.test(cards));
check('德州座位按 worldId 取图', /CRD\.faceHTML\(p\.worldId/.test(pages.texas));
check('廿一点庄家按 dealerSeat.id 取图，开局占位保留', /CRD\.faceHTML\(dealerSeat && dealerSeat\.id/.test(pages.blackjack) && /CRD\.avatar\('庄', 'math', 30\)/.test(pages.blackjack));
check('斗地主保存 worldIds 并用于座位取图', /game\.worldIds = \[null,null,null\]/.test(pages.doudizhu) && /CRD\.faceHTML\(game\.worldIds && game\.worldIds\[p\]/.test(pages.doudizhu));
check('UNO 按世界座位 name→id 映射取图', /__unoWorldIds\[name\] = seat\.id/.test(pages.uno) && /CRD\.faceHTML\(wid,/.test(pages.uno));
check('未派生新资产、未改桥命令名', !/image\/avatars\//.test(cards) && !/shell-face/.test(cards));

/* ---------- 静态：id→文件一一对应（名字与图零错配） ---------- */
const warlordIds = [...character.matchAll(/"(csh_[a-z0-9_]+)"\s*:\s*\{([\s\S]*?)\n\s*\},/g)]
  .map(m => ({ id: m[1], img: (m[2].match(/img\s*:\s*"([^"]+)"/) || [])[1] }))
  .filter(x => x.img);
const minionIds = [...bossdata.matchAll(/^\tcsh_boss_minion_([a-z0-9_]+): \{/gm)].map(m => m[1]);
check('武将 100 条 / 妖灵 50 位名册可解析', warlordIds.length === 100 && minionIds.length === 50, { warlord: warlordIds.length, minion: minionIds.length });
const wrongStem = warlordIds.filter(x => x.img.split('/').pop().replace(/\.[^.]+$/, '') !== x.id);
check('武将 img 文件名与 id 全部一致（错配 0）', wrongStem.length === 0, wrongStem.slice(0, 5));
const missingFiles = [
  ...warlordIds.map(x => x.img.replace('extension/池子魔将/', '')),
  ...minionIds.map(id => 'image/csh_face_' + id + '.webp'),
].filter(rel => !fs.existsSync(path.join(root, rel)));
check('推导出的 150 张人物图实体全部存在', missingFiles.length === 0, missingFiles.slice(0, 8));

/* ---------- 运行时：真实页面问 facePath / faceHTML ---------- */
/* 2026-11-16：牌桌页在 games/<桌>/，浏览器按文档 URL 解析图片 src，
   根 image/ 必须是 ../../image/。旧值 ../image/ 会解析成 games/image/（不存在）→ 404
   → error 监听回退 SVG，玩家实际看不到真人头像。期望值同步为真实可解码路径。 */
const CASES = [
  ['csh_dz', '../../image/csh_dz.jpg'],
  ['csh_diaochan', '../../image/csh_diaochan.webp'],
  ['csh_boss_minion_ada', '../../image/csh_face_ada.webp'],
];
const RUNTIME = `(() => {
  const C = window.CSH && window.CSH.cards;
  if (!C) return { ready:false };
  const ids = ${JSON.stringify(CASES.map(c => c[0]))};
  return {
    ready:true,
    hasApi: typeof C.facePath==='function' && typeof C.faceHTML==='function',
    paths: ids.map(id => C.facePath(id)),
    html: C.faceHTML('csh_dz','张','math',34,123),
    fallback: C.faceHTML(null,'张','math',34,123),
    badId: C.facePath('../etc/passwd'),
    /* 妖灵跟随装扮：模拟宿主唯一只读口 skinOf */
    follow: (()=>{ const bak=window.lib; window.lib={cshShell:{skinOf:()=>({face:'image/spirit-skins/ada/s1_face.webp'})}};
      const p=C.facePath('csh_boss_minion_ada'); window.lib=bak; return p; })(),
    /* 缺图回退：插入坏图，等 error 捕获把容器换回 SVG */
    broken: (()=>{ const box=document.createElement('div'); box.className='seat-av';
      box.innerHTML='<img class="csh-face-img" src="__missing_face__.webp" data-surname="张" data-persona="math" data-px="30" data-seed="7">';
      document.body.appendChild(box); return box; })()
  };
})()`;

let m;
try {
  m = await withChromium({ width: 915, height: 412 }, async send => {
    const val = async expr => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
      return r.result.value;
    };
    await send('Page.enable'); await send('Runtime.enable');
    await send('Page.navigate', { url: pathToFileURL(path.join(root, 'games/texas/texas.html')).href });
    for (let i = 0; i < 200; i++) { if (await val('document.readyState === "complete"')) break; await new Promise(r => setTimeout(r, 50)); }
    await new Promise(r => setTimeout(r, 400));
    const a = await val(RUNTIME);
    await new Promise(r => setTimeout(r, 500));
    const recovered = await val(`(()=>{const b=[...document.querySelectorAll('.seat-av')].pop();return b?{hasImg:!!b.querySelector('img.csh-face-img'),html:b.innerHTML.slice(0,90)}:null;})()`);
    /* 2026-11-16：真实解码断言。静态路径字符串曾把错误的 ../image/ 锁成"正确"，
       浏览器按文档(games/<桌>/)解析成 games/image/ → 404 → 回退 SVG，玩家根本看不到图。
       这里在真实页面按 facePath 的结果 <img> 加载，问 naturalWidth 真值。 */
    const realLoad = await val(`(async () => {
      const C = window.CSH && window.CSH.cards;
      if (!C) return { ready:false };
      const p = C.facePath('csh_diaochan');
      const img = new Image();
      img.className = 'csh-face-img';
      let done = false;
      const finish = () => { done = true; };
      img.onload = finish; img.onerror = finish;
      img.src = p;
      await new Promise(r => { img.onload = () => { finish(); r(); }; img.onerror = () => { finish(); r(); }; setTimeout(r, 1500); });
      return { ready:true, path:p, naturalWidth:img.naturalWidth, naturalHeight:img.naturalHeight, baseURI:document.baseURI };
    })()`);
    return { a, recovered, realLoad };
  });
} catch (e) {
  check('真实页面可加载并取图', false, String(e));
}
if (m) {
  const a = m.a;
  check('页面里 CSH.cards 已加载且暴露新 API', a.ready === true && a.hasApi === true, a);
  check('按 id 推导的路径与实体一致（含 jpg / webp / 妖灵）',
    JSON.stringify(a.paths) === JSON.stringify(CASES.map(c => c[1])), a.paths);
  check('faceHTML 输出真实 <img> 且携带回退数据', /<img class="csh-face-img"/.test(a.html) && /data-surname=/.test(a.html), a.html);
  check('无 id 时回退程序化 SVG（不空白）', /svg|csh-av-fallback/.test(a.fallback), a.fallback);
  check('非法 id 不会拼出越界路径', a.badId === '', a.badId);
  check('妖灵同桌跟随宿主已选装扮', a.follow === '../../image/spirit-skins/ada/s1_face.webp', a.follow);
  check('坏图自动回退为程序化头像、不留破图', m.recovered && m.recovered.hasImg === false && /svg|csh-av-fallback/.test(m.recovered.html), m.recovered);
  /* 2026-11-16 真值：路径必须真的能解码，静态字符串对了但图片 404 仍算失败 */
  check('真实 <img> 能解码加载（naturalWidth>0，非 games/image 404）',
    m.realLoad && m.realLoad.ready === true && m.realLoad.naturalWidth > 0, m.realLoad);
  check('头像是真实图片而非回退 SVG（走根 image/ 且已解码）',
    m.realLoad && /image\/csh_diaochan/.test(m.realLoad.path || '') && m.realLoad.naturalWidth > 0, m.realLoad);
}

const result = { scope: 'Table seat real portraits: id->file mapping, skin follow, broken-image fallback, 5 call sites', passed: rows.filter(r => r.passed).length, failed: rows.filter(r => !r.passed).length, rows };
save(result);
console.log(JSON.stringify(result));
if (result.failed) process.exitCode = 1;
