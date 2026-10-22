// Fresh headless Chromium: native poptip element/manager/Get.poptipIntro, local portrait.
// The UI dialog factory is a DOM adapter; this is not a running Noname match.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {root,host,parse,walk,keyOf,property,skillsOf} from './lib/skill_audit.mjs';
import {withChromium} from './lib/chromium_audit.mjs';
const skillText=fs.readFileSync(path.join(root,'skills/index.js'),'utf8'),skillTree=parse(skillText);
let translations;walk(skillTree,n=>{if(n.type==='VariableDeclarator'&&n.id.name==='cshSkillPack')translations=property(n.init,'translate');});
const description=property(translations,'csh_juwei_info');
const pop=fs.readFileSync(path.join(host,'noname/library/poptip.js'),'utf8'),getText=fs.readFileSync(path.join(host,'noname/get/index.js'),'utf8');
let map,classes=[],intro;
walk(parse(pop),n=>{if(n.type==='VariableDeclarator'&&n.id.name==='_poptipMap')map=pop.slice(...n.init.range);if(n.type==='ClassDeclaration'&&['PoptipManager','HTMLPoptipElement'].includes(n.id.name))classes.push(pop.slice(...n.range));});
walk(parse(getText),n=>{if(n.type==='MethodDefinition'&&keyOf(n)==='poptipIntro')intro=getText.slice(...n.range);});
const character=fs.readFileSync(path.join(root,'character/index.js'),'utf8'),tree=parse(character);let data;
walk(tree,n=>{if(n.type==='Property'&&keyOf(n)==='csh_haozhao'&&n.value.type==='ObjectExpression')data=character.slice(...n.value.range);});
const portrait='data:image/jpeg;base64,'+fs.readFileSync(path.join(root,'image/csh_haozhao.jpg')).toString('base64');
const out=path.join(root,'docs/audit/ui/haozhao');fs.mkdirSync(out,{recursive:true});
const results=[];
await withChromium({width:960,height:720},async send=>{
  await send('Runtime.evaluate',{expression:`document.body.innerHTML='<style>body{margin:24px;background:#20252e;color:#eee;font:16px system-ui}.card{display:flex;gap:24px}.portrait{width:240px;height:283px;object-fit:cover}.avatar{width:96px;height:116px;object-fit:cover}.skills{max-width:600px;line-height:1.8}noname-poptip{color:#e6c97a;text-decoration:underline;cursor:pointer}#poptip{position:fixed;padding:20px;max-width:440px;background:#353f50;border:1px solid #c9a84c;z-index:50!important}.poplayer{position:fixed;inset:0;z-index:40}</style><div class="card"><img class="portrait"><div><h1>郝昭 · 孤城不摧</h1><p id="stats"></p><img class="avatar"><div class="skills"><h2>拒围</h2><p id="desc"></p><h2>重垒</h2><p>锁定技，当你的体力值发生变化时，你获得1点护甲。</p></div></div></div>';`});
  const setup=`const lib={config:{touchscreen:false},translate:{},skill:{},card:{},placePoppedDialog(d){d.style.left='220px';d.style.top='320px';}};
  const _status={};const ui={window:document.body,create:{dialog(){const d=document.createElement('div');d.add=h=>{d.insertAdjacentHTML('beforeend',h);return d.lastChild;};d.delete=()=>d.remove();d.contentContainer=d;return d;},div(sel,parent){const d=document.createElement('div');d.className=sel.slice(1);parent.appendChild(d);return d;}}};
  const game={closePoptipDialog(){_status.poptip?.forEach(x=>x.remove());delete _status.poptip;}};const get={translation:k=>lib.translate[k],${intro},poptip:id=>lib.poptip.getElement(id)};
  const _poptipMap=${map};${classes.join('\n')}lib.poptip=new PoptipManager();lib.poptip.init();
  const character=${data};document.querySelector('#stats').textContent=character.group+' · '+character.sex+' · '+character.hp+'/'+character.maxHp+' · 护甲 '+character.hujia+' · legend（传说）';
  document.querySelectorAll('img').forEach(x=>x.src=${JSON.stringify(portrait)});document.querySelector('#desc').innerHTML=${skillText.slice(...description.range)};`;
  const setupResult=await send('Runtime.evaluate',{expression:setup});if(setupResult.exceptionDetails)throw Error(JSON.stringify(setupResult.exceptionDetails));
  const res=await send('Runtime.evaluate',{expression:`(async()=>{await Promise.all([...document.images].map(x=>x.decode()));const tip=document.querySelector('noname-poptip');tip.click();await new Promise(r=>requestAnimationFrame(r));return {portrait:[...document.images].every(i=>i.naturalWidth===400&&i.naturalHeight===472),text:tip.textContent,info:document.querySelector('#poptip')?.textContent,templateLiteral:document.querySelector('#desc').textContent.includes('$'+'{'),id:tip.getAttribute('poptip')};})()`,awaitPromise:true,returnByValue:true});
  const value=res.result.value;if(!value)throw Error(JSON.stringify(res));
  results.push({name:'two portrait uses decode exact native dimensions',passed:value.portrait},{name:'native element resolves official name',passed:value.text==='背水'&&value.id==='rule_beishui'},{name:'click opens official consequence/order explanation through native Get',passed:value.info?.includes('其余选项依次执行')&&value.info.includes('无法选择背水')},{name:'description has no literal interpolation',passed:!value.templateLiteral});
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'portrait-and-poptip.png'),Buffer.from(shot.data,'base64'));
  await send('Runtime.evaluate',{expression:`document.querySelector('.poplayer').click();`});
  const closed=await send('Runtime.evaluate',{expression:`!document.querySelector('#poptip')&&!document.querySelector('.poplayer')`,returnByValue:true});results.push({name:'native poptip closes without residual layer',passed:closed.result.value===true});
});
console.log(JSON.stringify({scope:'isolated native poptip/browser + portrait preview; not game UI acceptance',passed:results.filter(r=>r.passed).length,failed:results.filter(r=>!r.passed).length,results},null,2));process.exitCode=results.some(r=>!r.passed)?1:0;
