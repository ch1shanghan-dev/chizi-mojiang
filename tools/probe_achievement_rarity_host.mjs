import fs from 'node:fs';import path from 'node:path';import{spawn}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1]},root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),out=arg('--out');if(!out)throw Error('External --out required');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function rarityLabels(){
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshDebug.openLobby();lib.cshShell.open("achv")})()');
 await until('!!document.getElementById("csh-shell-frame")?.contentDocument?.getElementById("summary")','achievement page');await delay(250);
 const frame=js=>page.evaluate('(()=>{const d=document.getElementById("csh-shell-frame").contentDocument,w=d.defaultView;return ('+js+');})()');
 const labelsMatch='[...d.querySelectorAll(".row")].every(n=>{const r=w.CSH_POOL_ACHV.RULES.find(r=>r.id===n.dataset.id),label=n.querySelector(".rarity-label");return !!label&&label.textContent===["","普通","稀有","史诗"][r.rare]&&label.getAttribute("aria-label")==="稀有度："+label.textContent})';
 check('first 80 labels exactly match original rarity data',await frame('d.querySelectorAll(".row").length===80&&'+labelsMatch));
 await frame('(d.getElementById("hero").value="csh_haozhao",d.getElementById("hero").dispatchEvent(new w.Event("change")),true)');
 check('all three rarities appear on the 13 hero achievements',await frame('d.querySelectorAll(".row").length===13&&new Set([...d.querySelectorAll(".rarity-label")].map(n=>n.textContent)).size===3&&'+labelsMatch));
 await frame('(d.getElementById("search").value="郝昭 史诗",d.getElementById("search").dispatchEvent(new w.Event("input")),true)');
 check('rarity search matches the visible labels',await frame('d.querySelectorAll(".row").length===5&&[...d.querySelectorAll(".rarity-label")].every(n=>n.textContent==="史诗")'));
 await frame('(d.getElementById("search").value="",d.getElementById("search").dispatchEvent(new w.Event("input")),true)');
 for(const [width,height]of [[1365,768],[915,412],[640,286]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(150);
  await frame('(d.querySelector(".row").scrollIntoView({block:"nearest"}),true)');
  const m=await frame('(()=>{const row=d.querySelector(".row"),r=row.getBoundingClientRect(),label=row.querySelector(".rarity-label"),b=label.getBoundingClientRect();return {overflow:d.documentElement.scrollWidth>w.innerWidth+1,font:parseFloat(w.getComputedStyle(label).fontSize),label:{left:b.left,right:b.right,top:b.top,bottom:b.bottom},row:{left:r.left,right:r.right,top:r.top,bottom:r.bottom},targets:[...row.querySelectorAll("button")].every(n=>n.getBoundingClientRect().height>=44),header:d.querySelector("header").getBoundingClientRect().height}})()');
  check('rarity remains readable in landscape '+width,!m.overflow&&m.font>=12&&m.label.left>=m.row.left&&m.label.right<=m.row.right&&m.label.bottom<=m.row.bottom&&m.targets&&m.header<=48,m);stage('rarity-'+width,{screenshot:await snap('rarity-'+width)});
 }
 await frame('(w.__savedBadges=w.CSHAchievementBadges,w.CSHAchievementBadges=null,d.getElementById("search").dispatchEvent(new w.Event("input")),true)');
 check('rarity stays explicit when icon module is unavailable',await frame('!d.querySelector(".row svg")&&'+labelsMatch));
 await frame('(w.CSHAchievementBadges=w.__savedBadges,d.getElementById("search").dispatchEvent(new w.Event("input")),true)');
 check('no additional permanent filter or header was introduced',await frame('d.querySelectorAll(".filters select").length===4&&d.querySelectorAll("header").length===1'));
 const e=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('no runtime errors or rejected promises',!e.errors.length&&!e.rejections.length,e);
}
`;
let source=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
const marker="if(process.argv.includes('--world-layout-410'))";if(!source.includes(marker))throw Error('Host anchor changed');source=source.replace(marker,"if(process.argv.includes('--rarity-labels'))await rarityLabels();\n    else "+marker);
const file=path.join(out,'runner.mjs');fs.writeFileSync(file,tests+'\n'+source);const child=spawn(process.execPath,[file,'--rarity-labels','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((r,j)=>{child.once('error',j);child.once('exit',code=>{process.exitCode=code||0;r()})});
