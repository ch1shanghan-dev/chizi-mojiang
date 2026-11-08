import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { auditTempRoot, removeAuditScratch } from './lib/audit_scratch.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const fixture = fs.mkdtempSync(path.join(auditTempRoot(), 'csh-release-metadata-'));
const catalog = path.join(fixture, 'catalog.js');
const rows = [];
function check(name, ok, detail) {
  rows.push({ name, passed: !!ok, ...(ok ? {} : { detail }) });
}
function command(bin, args) {
  const result = spawnSync(bin, args, { cwd: fixture, encoding: 'utf8', windowsHide: true });
  if (result.error) throw result.error;
  return { code: result.status, output: (result.stdout || '') + (result.stderr || '') };
}
function git(...args) {
  const result = command('git', args);
  if (result.code !== 0) throw Error(result.output);
}
function release(...args) {
  return command(process.execPath, ['tools/release.js', ...args]);
}
function commit(message) {
  git('add', '.');
  git('-c', 'user.name=Release Probe', '-c', 'user.email=release@example.invalid', 'commit', '-qm', message);
}

try {
  fs.mkdirSync(path.join(fixture, 'tools', 'lib'), { recursive: true });
  for (const file of ['tools/release.js', 'tools/catalog_git_bytes.mjs', 'tools/lib/update_limits.mjs']) {
    fs.copyFileSync(path.join(root, file), path.join(fixture, file));
  }
  fs.writeFileSync(path.join(fixture, '.gitattributes'), '* text=auto eol=lf\n');
  fs.writeFileSync(path.join(fixture, 'info.json'), JSON.stringify({
    version: '4.0.16',
    intro: '<font color=#c9a84c>版本</font> <font color=#00FFFF>4.0.16</font>'
  }));
  fs.writeFileSync(path.join(fixture, 'package.js'),
    'extension["池子魔将"]={\n intro:"<font color=#00FFFF>4.0.14</font>",\n version:"4.0.16",\n files:["info.json","package.js","extension.js"]\n};\n');
  fs.writeFileSync(path.join(fixture, 'extension.js'),
    'export default {package:{\n intro:"<font color=#00FFFF>4.0.16</font>",\n version:"4.0.16"\n}};\n');
  git('init', '-qb', 'work/release-test');
  commit('isolated initial metadata');
  const stale = release('--check');
  check('release rejects a stale player-facing title before writing anything',
    stale.code === 1 && stale.output.includes('安装版本或版本标题不一致') && !fs.existsSync(catalog), stale.output);

  const generation = release('4.9.1');
  check('explicit version synchronizes all three inputs and generates the catalog',
    generation.code === 0 && ['info.json', 'package.js', 'extension.js', 'catalog.js'].every(file => {
      const value = fs.readFileSync(path.join(fixture, file), 'utf8');
      return value.includes('<font color=#00FFFF>4.9.1</font>') && /"?(?:version)"?\s*:\s*"4\.9\.1"/.test(value);
    }), generation.output);
  const valid = release('--check');
  check('synchronized candidate passes read-only check', valid.code === 0, valid.output);

  const original = fs.readFileSync(catalog, 'utf8');
  fs.writeFileSync(catalog, original.replace('"version": "4.9.1"', '"version": "4.9.2"'));
  const drift = release('--check');
  check('read-only check rejects catalog-only version drift despite valid payload hashes',
    drift.code === 1 && drift.output.includes('"versionOk": false') && drift.output.includes('"mismatchCount": 0'), drift.output);
  commit('catalog version mismatch');
  const rev = command(process.execPath, ['tools/catalog_git_bytes.mjs', '--rev', 'HEAD']);
  check('commit verification detects catalog-only version drift',
    rev.code === 1 && rev.output.includes('"versionOk": false') && rev.output.includes('"mismatchCount": 0'), rev.output);

  const blocked = release('4.9.3', '--push');
  check('development branch push stops before any file or commit changes',
    blocked.code === 1 && blocked.output.includes('只能从本地 main') &&
    !command('git', ['status', '--porcelain']).output, blocked.output);
} finally {
  removeAuditScratch(fixture);
}

const result = { passed: rows.filter(row => row.passed).length, failed: rows.filter(row => !row.passed).length,
  failures: rows.filter(row => !row.passed) };
console.log(JSON.stringify(result));
process.exitCode = result.failed ? 1 : 0;
