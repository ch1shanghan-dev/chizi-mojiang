/* Read-only AST inventory. Reuses the host's ESLint parser; no installed dependency. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = path.resolve(root, '../..');
const pnpm = path.join(host, 'node_modules/.pnpm');
const bundle = fs.readdirSync(pnpm).filter(x => x.startsWith('eslint-linter-browserify@')).sort().at(-1);
if (!bundle) throw new Error('Host ESLint bundle unavailable; no dependencies were installed');
const { Linter } = await import(pathToFileURL(path.join(pnpm, bundle, 'node_modules/eslint-linter-browserify/linter.js')));
const linter = new Linter({ configType: 'eslintrc' });
let captured;
linter.defineRule('capture', { create() { return { Program(node) { captured = node; } }; } });
const globals = Object.fromEntries(('lib game ui get ai _status player target targets card cards event trigger result source num Evt status' +
  ' setTimeout clearTimeout setInterval clearInterval console window document localStorage navigator location performance requestAnimationFrame cancelAnimationFrame fetch Image Audio MutationObserver ResizeObserver URL Blob FileReader HTMLElement CustomEvent AbortController TextDecoder TextEncoder').split(' ').map(x => [x, 'readonly']));
function parse(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const messages = linter.verify(source, { env: { es6: true, browser: true }, globals,
    parserOptions: { ecmaVersion: 'latest', sourceType: 'module' }, rules: { capture: 'error', 'no-undef': 'error' } });
  const fatal = messages.filter(x => x.fatal);
  if (fatal.length) throw new Error(file + ': ' + JSON.stringify(fatal));
  return { source, ast: captured, messages };
}
function walk(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === 'parent' || key === 'tokens' || key === 'comments') continue;
    if (Array.isArray(value)) value.forEach(x => { if (x?.type) walk(x, visit); });
    else if (value?.type) walk(value, visit);
  }
}
const keyOf = p => p.key?.name ?? p.key?.value;
const props = node => node?.type === 'ObjectExpression' ? node.properties.filter(p => p.type === 'Property') : [];
const prop = (node, name) => props(node).find(p => keyOf(p) === name)?.value;
const textOf = (source, node) => node ? source.slice(...node.range) : '';
const strings = node => node?.type === 'ArrayExpression' ? node.elements.filter(x => x?.type === 'Literal' && typeof x.value === 'string').map(x => x.value) : [];
function variable(ast, name) { let found; walk(ast, n => { if (n.type === 'VariableDeclarator' && n.id.name === name) found = n.init; }); return found; }
function defaultObject(ast) { return ast.body.find(n => n.type === 'ExportDefaultDeclaration')?.declaration; }
function filesAt(dir, suffixes) {
  const entries = fs.readdirSync(path.join(root, dir), { withFileTypes: true });
  return entries.flatMap(e => e.isDirectory() ? filesAt(path.posix.join(dir, e.name), suffixes) : suffixes.some(s => e.name.endsWith(s)) ? [path.posix.join(dir, e.name)] : []);
}
const files = ['extension.js', 'package.js', 'decadeUI-compat.js', ...['main', 'core', 'skills', 'character', 'card', 'mobilefx'].flatMap(d => filesAt(d, ['.js']))];
const parsed = new Map(files.map(file => [file, parse(file)]));
const characters = [];
const characterData = parsed.get('character/index.js');
function literal(node) {
  if (!node) return undefined;
  if (node.type === 'Literal') return node.value;
  if (node.type === 'ArrayExpression') return node.elements.map(literal);
  if (node.type === 'ObjectExpression') return Object.fromEntries(props(node).map(p => [keyOf(p), literal(p.value)]));
  if (node.type === 'UnaryExpression' && node.operator === '-') return -literal(node.argument);
  return undefined;
}
const roster = {};
for (const p of props(prop(defaultObject(characterData.ast), 'character'))) {
  const values = p.value.elements || [];
  roster[keyOf(p)] = literal(p.value);
  characters.push({ id: keyOf(p), file: 'character/index.js', line: p.loc.start.line,
    name: prop(prop(defaultObject(characterData.ast), 'translate'), keyOf(p))?.value || keyOf(p),
    skills: strings(prop(p.value, 'skills') || values[3]) });
}
// The zero-import data module is explicitly designed as a pure constructor.
const bossData = await import(pathToFileURL(path.join(root, 'core/csh_bossdata.js')));
const built = bossData.buildBossEntries(roster, Object.fromEntries(characters.map(c => [c.id,c.name])), {}, '');
const derivedCharacters = [
  ...Object.entries(built.entries).map(([id,entry]) => ({id, kind:'derived-boss', original:bossData.origIdOf(id), name:built.names[id], skills:entry.skills, file:'core/csh_bossdata.js', factory:'buildBossEntries'})),
  ...Object.entries(built.minionEntries).map(([id,entry]) => ({id, kind:'minion', name:built.minionNames[id], skills:entry.skills, file:'core/csh_bossdata.js', factory:'buildBossEntries'})),
];
const skills = [], aiRanges = new Map();
for (const file of ['skills/index.js', 'skills/boss.js', 'card/index.js']) {
  const { ast, source, messages } = parsed.get(file);
  const pack = file === 'skills/index.js' ? variable(ast, 'cshSkillPack') : defaultObject(ast);
  const definitions = file === 'skills/boss.js' ? variable(ast, 'skill') : prop(pack, 'skill');
  const translations = file === 'skills/boss.js' ? variable(ast, 'translate') : prop(pack, 'translate');
  const ranges = []; aiRanges.set(file, ranges);
  function add(p, parent) {
    const local = keyOf(p), id = parent ? parent + '_' + local : local, value = p.value;
    if (!value || value.type !== 'ObjectExpression') return;
    const fields = props(value).map(keyOf), code = textOf(source, value);
    const callbacks = [];
    walk(value, n => {
      if (n.type === 'Property' && ['ai', 'ai1', 'ai2', 'check', 'processAI', 'prompt', 'prompt2'].includes(keyOf(n))) {
        callbacks.push({ kind: keyOf(n), line: n.loc.start.line, code: textOf(source, n.value) });
        if (['ai', 'ai1', 'ai2', 'check', 'processAI'].includes(keyOf(n))) ranges.push(n.range);
      }
      if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression' && n.callee.property.name === 'set' && ['ai', 'ai1', 'ai2', 'processAI'].includes(n.arguments[0]?.value)) {
        callbacks.push({ kind: '.set(' + n.arguments[0].value + ')', line: n.loc.start.line, code: textOf(source, n.arguments[1]) }); ranges.push(n.range);
      }
    });
    const aiHelpers = props(value).filter(p => String(keyOf(p)).startsWith('_') && /FunctionExpression|ArrowFunctionExpression/.test(p.value?.type) && callbacks.some(c => c.code.includes('.' + keyOf(p) + '(')))
      .map(p => ({ name: keyOf(p), line: p.loc.start.line, code: textOf(source, p.value) }));
    for (const helper of aiHelpers) callbacks.push({ kind: 'helper.' + helper.name, line: helper.line, code: helper.code });
    const type = [];
    for (const [key, label] of [['enable','主动'],['trigger','触发'],['forced','锁定/强制'],['juexingji','觉醒'],['limited','限定'],['dutySkill','使命'],['zhuanhuanji','转换'],['viewAs','视为'],['hiddenCard','响应提示'],['equipSkill','装备'],['charlotte','辅助'],['global','全局挂接']]) {
      if (prop(value, key) && prop(value, key)?.value !== false) type.push(label);
    }
    const details = Object.fromEntries(['enable','trigger','filter','cost','filterCard','selectCard','position','filterTarget','selectTarget','check','viewAs','group','global','inherit','usable'].filter(k => fields.includes(k)).map(k => [k, textOf(source, prop(value, k))]));
    const calls = new Set();
    walk(value, n => { if (n.type === 'CallExpression' && /choose|damage|recover|draw|discard|gain|mark|useCard|respond|lose|change|storage/i.test(textOf(source, n.callee))) calls.add(textOf(source, n.callee)); });
    const ownAI = prop(value, 'ai');
    const unresolved = messages.filter(m => m.ruleId === 'no-undef' && callbacks.some(c => {
      const start = c.line, end = start + c.code.split('\n').length - 1; return m.line >= start && m.line <= end;
    })).map(m => ({ line: m.line, message: m.message }));
    skills.push({ id, parent: parent || null, file, line: p.loc.start.line,
      name: prop(translations, id)?.value || id, description: prop(translations, id + '_info')?.value || null,
      characters: [...characters, ...derivedCharacters].filter(c => c.skills.includes(parent || id)).map(c => c.id),
      types: type.length ? type : ['其他/辅助'], fields, details, interactionCalls: [...calls],
      aiFields: props(ownAI).map(keyOf), aiHelpers, callbacks, unresolved,
      reviewStatus: '已建立静态结构索引；语义与实战待核查',
      focus: unresolved.length ? 'AI/选择回调存在未解析标识符，优先复核编译上下文' : fields.includes('enable') || callbacks.length ? '核对收益、代价、目标和默认 AI' : '核对自动结算及组合技能；缺 ai 字段不直接判错' });
    for (const child of props(prop(value, 'subSkill'))) add(child, id);
  }
  for (const p of props(definitions)) add(p);
}
const modules = [];
for (const [file, { ast, source }] of parsed) {
  const imports = ast.body.filter(n => n.type === 'ImportDeclaration').map(n => ({ from: n.source.value, line: n.loc.start.line }));
  const publicState = [], persistence = [], listeners = [], requests = [];
  walk(ast, n => {
    if (n.type === 'AssignmentExpression' && /^(lib|game|window)\./.test(textOf(source, n.left))) publicState.push({ key: textOf(source, n.left), line: n.loc.start.line });
    if (n.type !== 'CallExpression') return;
    const callee = textOf(source, n.callee), line = n.loc.start.line;
    if (/saveConfig|saveExtensionConfig|localStorage\.(getItem|setItem|removeItem)|indexedDB/.test(callee)) persistence.push({ callee, arguments: n.arguments.map(a => textOf(source, a)).join(', ').slice(0, 200), line });
    if (/addEventListener|removeEventListener|setTimeout|setInterval|clearTimeout|clearInterval/.test(callee)) listeners.push({ callee, line });
    if (/fetch|XMLHttpRequest|\.open\b/.test(callee)) requests.push({ callee, line });
  });
  modules.push({ file, lines: source.split('\n').length, imports, publicState, persistence, listeners, possibleRequests: requests });
}
const config = parsed.get('main/config.js');
const settings = props(variable(config.ast, 'cshConfig')).map(p => ({ key: keyOf(p), line: p.loc.start.line,
  name: prop(p.value, 'name')?.value, intro: prop(p.value, 'intro')?.value,
  init: textOf(config.source, prop(p.value, 'init')), onclick: textOf(config.source, prop(p.value, 'onclick')), clear: prop(p.value,'clear')?.value || false }));
const effects = [];
for (const file of [...files, ...filesAt('games', ['.html']), ...filesAt('core', ['.css'])]) {
  fs.readFileSync(path.join(root, file), 'utf8').split('\n').forEach((text, i) => {
    if (/text-shadow|text-stroke|(?:filter:|filter\s*=).*?(?:blur|drop-shadow)/i.test(text)) effects.push({ file, line: i + 1, source: text.trim(), status: '候选样式；需区分正文、标题、图片、背景和锁定内容' });
  });
}
const counts = { sourceModules: modules.length, characters: characters.length, topLevelSkills: skills.filter(s => !s.parent).length, subSkills: skills.filter(s => s.parent).length,
  derivedBosses: derivedCharacters.filter(c => c.kind === 'derived-boss').length, minions: derivedCharacters.filter(c => c.kind === 'minion').length,
  settings: settings.length, effects: effects.length, aiUnresolvedCandidates: skills.filter(s => s.unresolved.length).length };
const assets = ['image','audio','font','effect'].filter(d=>fs.existsSync(path.join(root,d))).map(directory=>({directory, files:filesAt(directory,[''])}));
const out = path.join(root, 'docs/audit'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'inventory.json'), JSON.stringify({ schema: 1, generatedBy: 'tools/audit_inventory.mjs', basis: 'current working tree; AST structure is not semantic approval', counts, characters, derivedCharacters, skills, settings, modules, assets, effects }, null, 2) + '\n');
const escape = s => String(s || '').replaceAll('|', '\\|').replaceAll('\n', ' ');
fs.writeFileSync(path.join(out, '技能清单.md'), '# 武将与技能静态索引\n\n由 `node tools/audit_inventory.mjs` 生成。完整触发/代价/目标/AI 回调源码、组合关系、翻译和入口见 [inventory.json](inventory.json)。本表不是实战通过证明。动态 BOSS 注册从角色名册派生，不把生成条目误当独立原创武将；详见总报告。\n\n' +
  '普通名册 ' + counts.characters + ' 位；派生魔王 ' + counts.derivedBosses + ' 位；妖灵 ' + counts.minions + ' 位；顶层技能 ' + counts.topLevelSkills + ' 个；子技能 ' + counts.subSkills + ' 个。语义复核结论单列在总报告，生成表不会伪造通过状态。\n\n' +
  '| 技能 ID / 名称 | 文件:行 | 直接关联武将 | 类型 | AI / check / set / helper 回调数 | 重点 |\n| --- | --- | --- | --- | --- | --- |\n' +
  skills.map(s => `| ${escape(s.id)} / ${escape(s.name)} | [${s.file}:${s.line}](../../${s.file}#L${s.line}) | ${s.characters.join(', ') || (s.parent ? '子技能：' + s.parent : '辅助/动态关联待核对')} | ${s.types.join('、')} | ${s.callbacks.filter(c => !c.kind.startsWith('prompt')).length} | ${s.unresolved.length ? '未解析标识符候选 ' + s.unresolved.length : s.focus} |`).join('\n') + '\n');
console.log(JSON.stringify({ counts, parser: bundle, output: ['docs/audit/inventory.json', 'docs/audit/技能清单.md'] }, null, 2));
