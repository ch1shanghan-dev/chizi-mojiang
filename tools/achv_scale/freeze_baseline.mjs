/* M0 · 冻结 1946 条原定义基线
   ------------------------------------------------------------
   目的：在任何新增之前，把当前 1946 条的 ID / 条件 / 奖励 / 资格判定形态
   固化成不可变快照，并复现交接书附录 A 的规范化 ID 集合 SHA-256。

   只读。不加载宿主、不读取玩家存档。
   用法：node tools/achv_scale/freeze_baseline.mjs --root <扩展根> --out <输出目录>
*/
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const sha256 = (text) => crypto.createHash('sha256').update(text).digest('hex');

export function loadDefinitions(root) {
  const context = vm.createContext({ window: {} });
  const files = ['core/csh_achv.js', 'core/csh_pool_achv.js'];
  const fileHashes = {};
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    fileHashes[file] = sha256(source);
    vm.runInContext(source, context, { timeout: 8000, filename: file });
  }
  return {
    career: context.window.CSH_ACHV,
    pool: context.window.CSH_POOL_ACHV,
    fileHashes,
  };
}

/* 生涯定义的判定形态：prog 可能是函数，取源码做签名（同源码不同闭包参数会撞，
   所以同时记录 reward 与 cat 一起参与签名）。 */
function careerSignature(def) {
  const prog = def.prog;
  let shape = 'none';
  if (typeof prog === 'function') shape = 'fn:' + prog.toString().replace(/\s+/g, '');
  else if (prog && typeof prog === 'object') shape = 'obj:' + JSON.stringify(prog);
  return sha256([shape, def.cat, String(def.reward)].join('|')).slice(0, 16);
}

function poolSignature(rule) {
  return sha256([
    rule.cat || '',
    rule.metric || (typeof rule.test === 'function' ? 'test:' + rule.test.toString().replace(/\s+/g, '') : ''),
    rule.scope || '',
    rule.goal == null ? '' : rule.goal,
    JSON.stringify(rule.requires || null),
    (rule.modes || []).slice().sort().join(','),
    String(rule.rare || ''),
  ].join('|')).slice(0, 16);
}

export function freeze(root) {
  const { career, pool, fileHashes } = loadDefinitions(root);

  const careerRows = career.defs.map((d) => ({
    namespace: 'career',
    rid: 'career:' + d.key,
    id: d.key,
    cat: d.cat || '',
    title: d.label || '',
    condition: d.desc || '',
    reward: Number(d.reward) || 0,
    rare: d.rare == null ? null : d.rare,
    hidden: Object.hasOwn(d, 'hidden') ? d.hidden : null,
    signature: careerSignature(d),
  }));

  const poolRows = pool.RULES.map((r) => ({
    namespace: 'pool',
    rid: 'pool:' + r.id,
    id: r.id,
    cat: r.cat || '',
    title: r.name || '',
    condition: r.desc || '',
    hint: r.hint || '',
    rare: r.rare == null ? null : r.rare,
    modes: (r.modes || []).slice().sort(),
    on: (r.on || []).slice().sort(),
    hero: r.hero || null,
    heroName: r.heroName || null,
    metric: r.metric || null,
    scope: r.scope || null,
    goal: r.goal == null ? null : r.goal,
    requires: r.requires || null,
    signature: poolSignature(r),
  }));

  const all = careerRows.concat(poolRows);
  const ids = all.map((r) => r.rid).slice().sort();

  const byCat = {};
  for (const row of all) {
    const key = row.namespace + '/' + (row.cat || '(无分类)');
    byCat[key] = (byCat[key] || 0) + 1;
  }
  const byReward = {};
  for (const row of careerRows) byReward[String(row.reward)] = (byReward[String(row.reward)] || 0) + 1;

  const duplicateIds = all.length - new Set(all.map((r) => r.rid)).size;

  return {
    schemaVersion: 1,
    capturedAt: new Date().toISOString(),
    scope: '只读冻结：定义、条件文本、奖励、判定形态签名。不含玩家存档、不含运行时进度。',
    fileHashes,
    counts: {
      career: careerRows.length,
      pool: poolRows.length,
      total: all.length,
      uniqueRid: new Set(all.map((r) => r.rid)).size,
      duplicateIds,
      retiredCareer: Object.keys(career.RETIRED || {}).length,
    },
    idSetSha256: sha256(JSON.stringify(ids)),
    byCat,
    careerRewardHistogram: byReward,
    career: careerRows,
    pool: poolRows,
  };
}

const argOf = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
};

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const root = path.resolve(argOf('--root') || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..'));
  const out = argOf('--out');
  const snap = freeze(root);
  if (out) {
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'baseline-1946.json'), JSON.stringify(snap, null, 2));
  }
  console.log(JSON.stringify({
    counts: snap.counts,
    idSetSha256: snap.idSetSha256,
    expectedIdSetSha256: 'aa24064e0c57495f2b4768f59e5a690f566412af380cbedfa581352f477504b3',
    idSetMatch: snap.idSetSha256 === 'aa24064e0c57495f2b4768f59e5a690f566412af380cbedfa581352f477504b3',
    fileHashes: snap.fileHashes,
  }, null, 2));
}
