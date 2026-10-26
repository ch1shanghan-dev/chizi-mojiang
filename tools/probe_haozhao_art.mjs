// Actual Noname CSS and setBackground loader in a disposable Chromium fixture; no game/profile import.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { openProbe } from './lib/browser_probe.mjs';
import { parse, property } from './lib/skill_audit.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = path.resolve(root, '../..');
const opt = (name, fallback) => { const i = process.argv.indexOf(name); return i < 0 ? fallback : process.argv[i + 1]; };
const out = path.resolve(opt('--out', path.join(root, 'docs/audit/ui/haozhao-art')));
const candidates = path.resolve(opt('--candidates', 'D:/noname-audit-backups/chizi-mojiang/20261022-art-rebuild/characters/haozhao'));
const baseline = opt('--baseline');
const faceBox = opt('--face-box','130,76,90,115').split(',').map(Number);
if(faceBox.length!==4 || faceBox.some(v=>!Number.isFinite(v)||v<0))throw Error('Expected annotated face box x,y,w,h');
fs.mkdirSync(out, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const rows = [], check = (name, passed, detail) => rows.push({ name, passed: !!passed, ...(detail === undefined ? {} : { detail }) });
function normalized(value) {
  if (Array.isArray(value)) return value.map(normalized);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !['parent', 'tokens', 'comments', 'loc', 'range', 'start', 'end', 'raw'].includes(key)).map(([key, val]) => [key, normalized(val)]));
  return value;
}
const preservation = [];
for (const file of ['character/index.js', 'skills/index.js', 'skills/boss.js']) {
  const current = fs.readFileSync(path.join(root, file));
  const committed = baseline ? fs.readFileSync(path.join(baseline,file.replaceAll('/','_')+'.before')) : execFileSync('git', ['show', 'HEAD:' + file], { cwd: root, maxBuffer: 8 * 1024 * 1024 });
  const byteEqual = current.equals(committed), lfContentEqual = current.toString('utf8').replace(/\r\n/g, '\n') === committed.toString('utf8').replace(/\r\n/g, '\n');
  const astEqual = JSON.stringify(normalized(parse(current.toString('utf8')))) === JSON.stringify(normalized(parse(committed.toString('utf8'))));
  preservation.push({ file, current_sha256: hash(current), head_sha256: hash(committed), byteEqual, lfContentEqual, lineEndingOnly: !byteEqual && lfContentEqual, astEqual });
  check(file + ' '+(baseline?'batch baseline':'HEAD')+' content and AST unchanged (working tree CRLF normalized)', lfContentEqual && astEqual);
}
const characterSource = fs.readFileSync(path.join(root, 'character/index.js'), 'utf8');
const pack = parse(characterSource).body.find(node => node.type === 'ExportDefaultDeclaration')?.declaration;
const registrationNode = property(property(pack, 'character'), 'csh_haozhao');
if (!registrationNode) throw Error('Actual Haozhao character registration not found');
const registration = new Function('return (' + characterSource.slice(registrationNode.start, registrationNode.end) + ')')();
const registeredPath = path.resolve(host, registration.img);
check('actual registered image resolves to the installed Haozhao image', registeredPath === path.join(root, 'image/csh_haozhao.jpg') && fs.existsSync(registeredPath));
const variants = [
  { id: 'old', label: '旧图 · 保留对照', file: path.join(candidates, 'original-400x472.jpg') },
  { id: 'candidate1', label: '候选一 · 对照', file: path.join(candidates, 'candidate-1-400x472.jpg') },
  { id: 'installed', label: opt('--selected-label','当前注册图 · 候选二'), file: registeredPath }
].map(item => ({ ...item, sha256: hash(fs.readFileSync(item.file)), img: item.id === 'installed' ? registration.img : pathToFileURL(item.file).href }));
check('installed bytes match candidate 2 derivative', variants[2].sha256 === hash(fs.readFileSync(path.join(candidates, 'candidate-2-400x472.jpg'))));
const polyfill = fs.readFileSync(path.join(host, 'noname/init/polyfill.js'), 'utf8');
const loaderStart = polyfill.indexOf('Reflect.defineProperty(HTMLDivElement.prototype, "setBackground", {');
const loaderEnd = polyfill.indexOf('HTMLDivElement.prototype.listen =', loaderStart);
if (loaderStart < 0 || loaderEnd < 0) throw Error('Actual host image loader anchors changed');
const loader = polyfill.slice(loaderStart, loaderEnd);
const stylesheets = ['layout/default/layout.css', 'layout/default/menu.css'];
const assetURL = pathToFileURL(host + path.sep).href;
const fixture = `<!doctype html><html><head><meta charset="utf-8"><base href="${assetURL}">${stylesheets.map(file => `<link rel="stylesheet" href="${pathToFileURL(path.join(host, file)).href}">`).join('')}
<style>
html,body{background:#171f28;color:#f0e8d7;font-family:'Microsoft YaHei',sans-serif}*{animation:none!important;transition:none!important}
.fixture-title{position:absolute;left:22px;top:14px;font-size:20px}.fixture-subtitle{position:absolute;left:22px;top:44px;font-size:12px;color:#b2bfca}
.fixture-column{position:absolute;top:76px;width:410px;height:690px}.fixture-caption{position:absolute;left:5px;top:0;font-size:16px}
.fixture-label{position:absolute;font-size:12px;color:#b2bfca;white-space:nowrap}.fixture-cell{position:absolute}
.fixture-portrait{position:absolute!important;left:0!important;top:32px!important;width:410px!important;height:482px!important;transform:none!important;background:transparent!important;box-shadow:none!important;border:0!important;opacity:1!important;overflow:visible!important}
.fixture-ava{position:absolute!important;left:0!important;top:0!important;width:410px!important;height:482px!important}
.fixture-player{position:absolute!important;left:0!important;top:0!important;width:120px!important;height:120px!important;margin:0!important;transform:none!important;box-shadow:none!important;background:transparent!important}
.fixture-button{position:absolute!important;left:0!important;top:0!important;margin:0!important;width:85px!important}
</style></head><body><div class="fixture-title">郝昭立绘 · 无名杀加载与裁切预览</div><div class="fixture-subtitle">隔离 Chromium 夹具，使用宿主实际 CSS / setBackground；85px 选将宽度为指定验收尺寸；非游戏实机</div>
<script>
const registration=${JSON.stringify(registration)},variants=${JSON.stringify(variants)};
const records=Object.fromEntries(variants.map(v=>[v.id,{...registration,img:v.img}]));
const lib={assetURL:'',characterDefaultPicturePath:${JSON.stringify(assetURL + 'image/character/default_silhouette_')},config:{skin:{},mode_config:{}},characterPack:{},filter:{none(){}}};
const get={mode:()=> 'identity',character:name=>records[name]},game={getDB:()=>Promise.reject(Error('No profile DB in fixture'))};
Array.prototype.unique=function(){return [...new Set(this)]};
${loader}
const fixtureNodes=[];
function make(tag,cls,parent,styles){const node=document.createElement(tag);node.className=cls||'';if(styles)Object.assign(node.style,styles);parent.append(node);return node;}
for(let index=0;index<variants.length;index++){
 const variant=variants[index],column=make('div','fixture-column',document.body,{left:(20+index*425)+'px'});
 make('div','fixture-caption',column).textContent=variant.label;
 const portrait=make('div','menubg charactercard fixture-portrait',column),ava=make('div','ava fixture-ava',portrait),view=make('div','avatar',ava);view.setBackground(variant.id,'character');
 fixtureNodes.push({variant:variant.id,context:'view400',node:view,w:400,h:472});
 make('div','fixture-label',column,{left:'5px',top:'520px'}).textContent='查看 · 400 × 472';
 const primaryCell=make('div','fixture-cell',column,{left:'0px',top:'548px'}),primary=make('div','player fixture-player',primaryCell),avatar=make('div','avatar',primary);avatar.setBackground(variant.id,'character');
 fixtureNodes.push({variant:variant.id,context:'avatar100',node:avatar,w:100,h:100});
 make('div','fixture-label',column,{left:'10px',top:'662px'}).textContent='头像 · 100 × 100';
 const secondaryCell=make('div','fixture-cell',column,{left:'73px',top:'488px'}),secondary=make('div','player fixture-player',secondaryCell),avatar2=make('div','avatar2',secondary);avatar2.setBackground(variant.id,'character');
 fixtureNodes.push({variant:variant.id,context:'dual42',node:avatar2,w:42,h:42});
 make('div','fixture-label',column,{left:'143px',top:'662px'}).textContent='双将 · 42 × 42';
 const dialog=make('div','dialog',column,{left:'272px',top:'548px',width:'100px',height:'108px',margin:'0',padding:'0',transform:'none',opacity:'1',background:'transparent',boxShadow:'none'}),buttons=make('div','buttons',dialog,{left:'0',top:'0'}),button=make('div','button character longcharacter fixture-button',buttons);button.setBackground(variant.id,'character');
 make('div','name',button).textContent='郝昭';
 fixtureNodes.push({variant:variant.id,context:'select85',node:button,w:85,h:108});
 make('div','fixture-label',column,{left:'272px',top:'662px'}).textContent='选将 · 85 × 108';
}
globalThis.fixtureReady=true;
</script></body></html>`;
const page = await openProbe(fixture, opt('--browser', undefined));
const cases = [];
try {
  const decoded = await page.evaluate(`Promise.all(variants.map(async variant=>{const image=new Image();image.src=new URL(variant.img,document.baseURI).href;await image.decode();return {id:variant.id,width:image.naturalWidth,height:image.naturalHeight,url:image.src};}))`);
  for (const image of decoded) check(image.id + ' resource decodes at 400 x 472', image.width === 400 && image.height === 472);
  for (const dpr of [1, 2]) {
    await page.send('Emulation.setDeviceMetricsOverride', { width: 1300, height: 790, deviceScaleFactor: dpr, mobile: false });
    await page.evaluate('(async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))})()');
    const geometry = await page.evaluate(`fixtureNodes.map(item=>{const rect=item.node.getBoundingClientRect(),css=getComputedStyle(item.node);return {variant:item.variant,context:item.context,expected:{w:item.w,h:item.h},rect:{x:rect.x,y:rect.y,w:rect.width,h:rect.height,right:rect.right,bottom:rect.bottom},backgroundSize:css.backgroundSize,backgroundPositionX:css.backgroundPositionX,backgroundPositionY:css.backgroundPositionY,backgroundImage:css.backgroundImage,overflow:css.overflow,dpr:devicePixelRatio};})`);
    for (const entry of geometry) {
      const primarySize = entry.backgroundSize.split(',')[0].trim(), primaryX = entry.backgroundPositionX.split(',')[0].trim(), primaryY = entry.backgroundPositionY.split(',')[0].trim();
      check(entry.variant + '/' + entry.context + ' DPR ' + dpr + ' native CSS geometry', entry.rect.w === entry.expected.w && entry.rect.h === entry.expected.h && entry.dpr === dpr && primarySize === 'cover' && primaryX === '50%');
      const scale = Math.max(entry.rect.w / 400, entry.rect.h / 472), offsetX = (entry.rect.w - 400 * scale) * .5, offsetY = (entry.rect.h - 472 * scale) * parseFloat(primaryY) / 100;
      entry.visibleSource = { x: -offsetX / scale, y: -offsetY / scale, w: entry.rect.w / scale, h: entry.rect.h / scale };
      if (entry.variant === 'installed') {
        // Conservative face region, manually located in the installed 400x472 derivative.
        const face = { x: faceBox[0], y: faceBox[1], w: faceBox[2], h: faceBox[3] }, visible = entry.visibleSource;
        entry.faceRegion = face;
        check(entry.context + ' DPR ' + dpr + ' installed face remains inside source crop', face.x >= visible.x && face.y >= visible.y && face.x + face.w <= visible.x + visible.w && face.y + face.h <= visible.y + visible.h);
      }
      const shot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip: { x: entry.rect.x, y: entry.rect.y, width: entry.rect.w, height: entry.rect.h, scale: 1 } });
      entry.screenshot = entry.variant + '-dpr' + dpr + '-' + entry.context + '.png';
      const png = Buffer.from(shot.data, 'base64');
      entry.screenshotPixels = { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };
      check(entry.variant + '/' + entry.context + ' DPR ' + dpr + ' screenshot pixel geometry', entry.screenshotPixels.w === entry.expected.w * dpr && entry.screenshotPixels.h === entry.expected.h * dpr);
      fs.writeFileSync(path.join(out, entry.screenshot), png);
    }
    const overview = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const screenshot = 'runtime-dpr' + dpr + '.png';fs.writeFileSync(path.join(out, screenshot), Buffer.from(overview.data, 'base64'));
    cases.push({ dpr, viewport: { w: 1300, h: 790 }, screenshot, geometry });
  }
} finally { await page.close(); }
const failures = rows.filter(row => !row.passed);
const result = { scope: 'Disposable Chromium fixture. Actual host default layout/menu CSS and exact setBackground/setBackgroundImage source, actual csh_haozhao registration. No Noname game launch, saves or user profile. 85px select width is the requested test override over host default width. Face box is manually annotated, not automated recognition or art rating.', passed: rows.length - failures.length, failed: failures.length, failures, checks: rows, registration, variants, hostSources: { loader: 'noname/init/polyfill.js:93-207', loader_sha256: hash(loader), stylesheets: stylesheets.map(file => ({ file, sha256: hash(fs.readFileSync(path.join(host, file))) })) }, preservation, cases };
fs.writeFileSync(path.join(out, 'runtime-probe.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ scope: result.scope, passed: result.passed, failed: result.failed, failures, screenshots: cases.reduce((sum, item) => sum + item.geometry.length + 1, 0), out }, null, 2));
process.exitCode = failures.length ? 1 : 0;
