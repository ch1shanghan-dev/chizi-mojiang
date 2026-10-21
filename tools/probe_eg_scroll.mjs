// Actual main/content.js helpers and native engine CSS in disposable Chromium.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { openProbe } from './lib/browser_probe.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const option=(key,fallback)=>{const i=process.argv.indexOf(key);return i<0?fallback:process.argv[i+1];};
const sourceFile=option('--source',path.join(root,'main/content.js'));
const raw=fs.readFileSync(sourceFile,'utf8');
const source=raw.slice(raw.indexOf('var _cshEgMO ='),raw.indexOf('export function cshContent'));
if(!source.includes('function cshEgScrollApply('))throw Error('Adapt helper extraction to source changes');
const css=fs.readFileSync(path.resolve(root,'../../layout/default/layout.css'),'utf8');
const page=await openProbe('<!doctype html><meta charset="utf-8"><title>Faction layout probe</title><style>'+css+'</style><style>body{margin:0;background:#201e1a}#arena{position:relative;height:100%;width:100%}.probe-dialog{left:50%;top:20px;width:850px;height:280px;transform:translateX(-50%)}.probe-dialog .button{position:relative;display:inline-block;width:140px;height:90px}.probe-dialog .caption{position:relative}.probe-dialog .content-container{position:absolute;inset:0}.probe-dialog .content{position:relative}.control>div{display:inline-block;min-width:70px;height:40px}</style><body><div id="arena"></div><div id="control"></div></body>',option('--browser',undefined));
const rows=[];function check(name,passed){rows.push({name,passed:!!passed});}
async function run(expression){return page.evaluate('(async()=>eval('+JSON.stringify(expression)+'))()');}
try {
  await page.send('Emulation.setDeviceMetricsOverride',{width:900,height:600,deviceScaleFactor:1,mobile:false});
  await run(`(()=>{window.lib={config:{},group:['wei','shu','wu','qun','jin','shen'],selectGroup:['shen','devil'],translate:{wei:'魏',shu:'蜀',wu:'吴',qun:'群',jin:'晋',shen:'神'}};window.game={documentZoom:1};window.ui={};new Function('lib','game','ui','_status',${JSON.stringify(source)}+';window.eg={apply:cshEgScrollApply,tag:cshEgTryTag,unstyle:cshEgUnstyle,style:cshEgStyleGroupDialog,isGroup:cshEgIsGroupDialog};')(lib,game,ui,{});
    window.settle=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    window.build=(count=24,title='请选择你的势力',mount=document.getElementById('arena'))=>{const d=document.createElement('div');d.className='dialog probe-dialog';d.innerHTML='<div class="content-container"><div class="content"><div class="caption"></div><div class="buttons"></div></div></div>';d.querySelector('.caption').textContent=title;for(let n=0;n<count;n++){const b=document.createElement('div');b.className='button card';b.textContent=['魏','蜀','吴','群','晋'][n%5];b.link=['','','group_'+lib.group[n%5]];d.querySelector('.buttons').appendChild(b);}if(mount)mount.appendChild(d);return d;};
    window.clear=()=>{eg.apply(false);document.getElementById('arena').replaceChildren();document.getElementById('control').replaceChildren();};
    eg.apply();window.d=build();
  })()`);await run('settle()');
  check('missing config defaults off and leaves dialog alone',await run('!document.documentElement.classList.contains("csh-egsc")&&!d.classList.contains("csh-egdlg")'));
  await run(`clear();window.d=build();d.style.maxHeight='255px';d.style.marginLeft='3px';d.querySelector('.buttons').style.width='321px';d.querySelector('.content-container').style.paddingRight='7px';window.original=[d.style.cssText,d.querySelector('.buttons').style.cssText,d.querySelector('.content-container').style.cssText];eg.apply(true);eg.apply(false);`);
  check('disable restores host dialog styles',await run('d.style.maxHeight==="255px"&&d.style.marginLeft==="3px"'));
  check('disable preserves host button width never owned by patch',await run('d.querySelector(".buttons").style.width==="321px"'));
  check('disable preserves host padding never owned by patch',await run('d.querySelector(".content-container").style.paddingRight==="7px"'));
  await run(`clear();window.d=build();eg.apply(true);d.style.maxWidth='607px';eg.apply(false);`);
  check('disable respects newer host-owned style update',await run('d.style.maxWidth==="607px"'));
  await run(`clear();eg.apply(true);const wrap=document.createElement('section');window.nested=build(24,'请选择你的势力',wrap);document.getElementById('arena').appendChild(wrap);`);await run('settle()');
  check('observer finds dialog inside newly inserted wrapper',await run('nested.classList.contains("csh-egdlg")'));
  await run(`clear();window.d=build();eg.apply(true);d.querySelector('.caption').textContent='请选择卡牌';for(const b of d.querySelectorAll('.button')){b.link=['','','sha'];b.textContent='杀';}`);await run('settle()');
  check('reused dialog no longer classified as faction is released',await run('!d.classList.contains("csh-egdlg")&&!d.style.maxWidth'));
  await run(`clear();eg.apply(true);window.d=build(2);`);await run('settle()');
  check('two-faction dialog is covered',await run('d.classList.contains("csh-egdlg")'));
  await run(`clear();window.d=build();d.classList.add('menu');eg.apply(true);`);
  check('engine options menu is excluded even with faction cards',await run('!d.classList.contains("csh-egdlg")'));
  await run(`clear();window.d=build(2,'查看势力技能说明');for(const b of d.querySelectorAll('.button')){b.link=['','','sha'];b.textContent='杀';}eg.apply(true);`);
  check('unrelated explanation mentioning factions is not captured',await run('!d.classList.contains("csh-egdlg")'));
  await run(`clear();window.d=build(2,'请选择魏势力武将');for(const b of d.querySelectorAll('.button')){b.link='caocao';b.textContent='曹操';}eg.apply(true);`);
  check('ordinary faction-restricted hero selection is not captured',await run('!d.classList.contains("csh-egdlg")'));
  await run(`clear();eg.apply(true);lib.group.push('newFaction');lib.translate.newFaction='新势';const bar=document.createElement('div');bar.className='control';bar.innerHTML='<div>新势</div><div>魏</div>';document.getElementById('control').appendChild(bar);window.dynamicBar=bar;`);await run('settle()');
  check('newly registered faction names are recognized',await run('dynamicBar.classList.contains("csh-egctrl")'));
  await run(`clear();const bar=document.createElement('div');bar.className='control';bar.style.maxWidth='500px';bar.style.transform='translateX(-77px)';bar.innerHTML='<div>魏</div><div>蜀</div>';document.getElementById('control').appendChild(bar);window.bar=bar;eg.apply(true);eg.apply(false);`);
  check('control disable restores original transform and maxWidth',await run('bar.style.transform==="translateX(-77px)"&&bar.style.maxWidth==="500px"'));
  await run(`clear();window.d=build();d.style.width='376px';window.before=[d.getBoundingClientRect().width,d.querySelector('.buttons').getBoundingClientRect().width];eg.apply(true);`);
  check('normal host dialog and button widths stay unchanged',await run('before[0]===d.getBoundingClientRect().width&&before[1]===d.querySelector(".buttons").getBoundingClientRect().width'));
  await run(`clear();window.d=build(60);d.style.width='1400px';eg.apply(true);`);await run('settle()');
  check('over-wide host dialog is capped within viewport',await run('(()=>{const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;})()'));
  await page.send('Emulation.setDeviceMetricsOverride',{width:390,height:600,deviceScaleFactor:1,mobile:false});await run('settle()');
  check('viewport resize recomputes caps on existing dialog',await run('(()=>{const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1;})()'));
  await run(`clear();eg.apply(true);window.d=build(2,'请选择你的势力');for(const b of d.querySelectorAll('.button')){b.link=['','','sha'];b.textContent='杀';}d.querySelector('.caption').firstChild.textContent='请选择卡牌';`);await run('settle()');
  check('text-node changes revalidate semantic classification',await run('!d.classList.contains("csh-egdlg")'));
  for(const [width,height,scale,type] of [[1200,820,1,'transform'],[390,844,1,'transform'],[915,412,0.4,'transform'],[740,360,2,'transform'],[915,412,0.6,'zoom']]) {
    await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await run(`clear();document.body.style.transform='';document.body.style.zoom='';document.body.style.width='${width/scale}px';document.body.style.height='${height/scale}px';document.body.style.transformOrigin='top left';document.body.style.${type}='${type==='transform'?'scale('+scale+')':scale}';game.documentZoom=${scale};window.d=build(60);d.style.width='1400px';d.style.height='280px';eg.apply(true);`);await run('settle()');
    const label=width+'x'+height+' '+type+' '+scale;
    check(label+': dialog rectangle stays within viewport',await run('(()=>{const r=d.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&r.top>=-1&&r.bottom<=innerHeight+1;})()'));
    check(label+': native vertical scroll reaches final button',await run('(()=>{const box=d.querySelector(".content-container"),last=d.querySelector(".buttons").lastElementChild;box.scrollTop=999999;const b=box.getBoundingClientRect(),r=last.getBoundingClientRect();return box.scrollTop>0&&r.bottom<=b.bottom+1;})()'));
    check(label+': final faction receives pointer hit',await run('(()=>{const button=d.querySelector(".buttons").lastElementChild,r=button.getBoundingClientRect();const hit=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);return !!hit&&(hit===button||button.contains(hit));})()'));
  }
  await page.send('Emulation.setDeviceMetricsOverride',{width:900,height:600,deviceScaleFactor:1,mobile:false});
  await run(`clear();document.body.style.cssText='margin:0;width:900px;height:600px';window.d=build(60);eg.apply(true);`);await run('settle()');
  const point=await run('(()=>{const r=d.querySelector(".content-container").getBoundingClientRect();return{x:r.left+20,y:r.top+30};})()');
  await page.send('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY:500});await run('new Promise(r=>setTimeout(r,100))');
  check('native wheel scrolls the faction content',await run('d.querySelector(".content-container").scrollTop>0'));
  await run(`clear();const b=document.createElement('div');b.className='control';for(let n=0;n<30;n++){const item=document.createElement('div');item.textContent=n%2?'魏':'蜀';b.appendChild(item);}document.getElementById('control').appendChild(b);window.bar=b;eg.apply(true);`);await run('new Promise(r=>setTimeout(r,600))');
  check('long faction control stays within viewport',await run('(()=>{const r=bar.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;})()'));
  const controlPoint=await run('(()=>{const r=bar.getBoundingClientRect();return{x:r.left+20,y:r.top+20};})()');
  await page.send('Input.dispatchMouseEvent',{type:'mouseWheel',...controlPoint,deltaX:500,deltaY:0});await run('new Promise(r=>setTimeout(r,100))');
  check('native horizontal wheel scrolls faction control',await run('bar.scrollLeft>0'));
  await run('bar.scrollLeft=999999');
  check('last faction in long control can be clicked',await run('(()=>{const last=bar.lastElementChild,r=last.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===last;})()'));
  for(const [width,height,scale,type] of [[1200,820,1,'transform'],[390,844,1,'transform'],[915,412,0.4,'transform'],[740,360,2,'transform'],[915,412,0.6,'zoom']]) {
    await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    await run(`clear();document.body.style.transform='';document.body.style.zoom='';document.body.style.width='${width/scale}px';document.body.style.height='${height/scale}px';document.body.style.transformOrigin='top left';document.body.style.${type}='${type==='transform'?'scale('+scale+')':scale}';game.documentZoom=${scale};const b=document.createElement('div');b.className='control';for(let n=0;n<30;n++){const item=document.createElement('div');item.textContent=n%2?'魏':'蜀';b.appendChild(item);}document.getElementById('control').appendChild(b);window.bar=b;eg.apply(true);`);await run('new Promise(r=>setTimeout(r,600))');
    const label=width+'x'+height+' '+type+' '+scale;
    check(label+': control rectangle stays within viewport',await run('(()=>{const r=bar.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;})()'));
    await run('bar.scrollLeft=999999');
    check(label+': final control faction receives pointer hit',await run('(()=>{const last=bar.lastElementChild,r=last.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===last;})()'));
  }
  await run(`clear();eg.apply(true);window.d=build();`);await run('settle()');await run('d.remove()');await run('settle()');
  check('detached dialogs are cleaned',await run('!d.classList.contains("csh-egdlg")&&!d.style.maxWidth'));
  await run(`clear();window.d=build();d.querySelector('.buttons').style.setProperty('max-width','87%','important');eg.apply(true);eg.apply(false);`);
  check('host important priority is restored',await run('d.querySelector(".buttons").style.getPropertyValue("max-width")==="87%"&&d.querySelector(".buttons").style.getPropertyPriority("max-width")==="important"'));
  await run('clear();for(let n=0;n<20;n++){eg.apply(true);eg.apply(false);}window.d=build()');await run('settle()');
  check('disabled observer cannot restyle later dialogs',await run('!d.classList.contains("csh-egdlg")'));
  const custom=option('--case',null);
  if(custom) {
    const [width,height,scale,count,buttonWidth]=custom.split(',').map(Number);
    if(![width,height,scale,count,buttonWidth].every(x=>Number.isFinite(x)&&x>0))throw Error('--case expects positive width,height,scale,count,buttonWidth');
    await page.send('Emulation.setDeviceMetricsOverride',{width:Math.round(width),height:Math.round(height),deviceScaleFactor:1,mobile:false});
    for(const parentWidth of [376,849,1400]) {
      await run(`clear();document.body.style.cssText='margin:0;width:${width/scale}px;height:${height/scale}px;transform:scale(${scale});transform-origin:top left';game.documentZoom=${scale};window.d=build(${Math.floor(count)});d.style.width='${parentWidth}px';for(const b of d.querySelectorAll('.button'))b.style.width='${buttonWidth}px';window.before=d.querySelector('.buttons').getBoundingClientRect().width;eg.apply(true);`);await run('new Promise(r=>setTimeout(r,600))');
      check('custom parent '+parentWidth+': viewport bounds',await run('(()=>{const r=d.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1&&r.bottom<=innerHeight+1;})()'));
      check('custom parent '+parentWidth+': final faction receives pointer hit',await run('(()=>{d.querySelector(".content-container").scrollTop=999999;const b=d.querySelector(".buttons").lastElementChild,r=b.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)===b;})()'));
      if(parentWidth<=(width-16)/scale)check('custom parent '+parentWidth+': normal width preserved',await run('Math.abs(before-d.querySelector(".buttons").getBoundingClientRect().width)<0.5'));
    }
  }
  await run('clear()');
  const failed=rows.filter(x=>!x.passed);const result={date:new Date().toISOString(),source:sourceFile,sha256:createHash('sha256').update(raw).digest('hex'),scope:'actual faction-scroll functions + native engine CSS + Chromium; not game/Android validation',passed:rows.length-failed.length,failed:failed.length,failures:failed,checks:rows};
  const out=option('--out',null);if(out){fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');}
  console.log(JSON.stringify({...result,checks:undefined},null,2));process.exitCode=failed.length?1:0;
} finally {await page.close();}
