import fs from 'node:fs';import path from 'node:path';import{spawn}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1]},root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),out=arg('--out');if(!out)throw Error('External --out required');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function recentAchievements(){
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshDebug.openLobby();lib.cshShell.open("achv")})()');
 await until('!!document.getElementById("csh-shell-frame")?.contentDocument?.getElementById("summary")','achievement page');await delay(250);
 const frame=js=>page.evaluate('(()=>{const d=document.getElementById("csh-shell-frame").contentDocument,w=d.defaultView;return ('+js+');})()');
 const select=async(id,value)=>frame('(d.getElementById('+JSON.stringify(id)+').value='+JSON.stringify(value)+',d.getElementById('+JSON.stringify(id)+').dispatchEvent(new w.Event("change")),true)');
 const ids=()=>frame('[...d.querySelectorAll(".row")].map(n=>n.dataset.id)');
 check('default remains claim priority',await frame('d.getElementById("sort").value==="待领优先"&&[...d.getElementById("sort").options].some(n=>n.value==="最近达成")'));
 check('isolated test records seed',await frame('(()=>{const p=w.CSH_POOL_ACHV,s=p.load();s.got.op_one_slash={t:1690000000000,m:"identity",n:1};s.got.op_thunder={t:1700000000000,m:"identity",n:1};s.seen.op_thunder=1;s.got.op_empty_win={t:1700000000000,m:"versus",n:1};s.got.op_five_cards={t:"1695000000000",m:"identity",n:1};s.got.op_untouched={t:0,m:"identity",n:1};s.got.op_judge3={t:"bad",m:"identity",n:1};s.seen.op_multi_target=1;return p.save(s)})()'));
 const stored=await frame('JSON.stringify({got:w.CSH_POOL_ACHV.load().got,seen:w.CSH_POOL_ACHV.load().seen})');
 await select('sort','最近达成');
 const expected=['op_thunder','op_empty_win','op_five_cards','op_one_slash','op_untouched','op_judge3','op_multi_target'];
 check('known dates descending, unknown records then locked',JSON.stringify((await ids()).slice(0,7))===JSON.stringify(expected));
 check('claimed dated item participates with its unlock timestamp',await frame('d.querySelector(".row").dataset.id==="op_thunder"&&d.querySelector(".row .claim").textContent==="已领取"'));
 const first=await ids();await select('sort','最近达成');check('equal timestamps and unknown groups stay stable',JSON.stringify(await ids())===JSON.stringify(first));
 await select('status','待领取');
 check('pending filter composes with recent ordering',JSON.stringify(await ids())===JSON.stringify(['op_empty_win','op_five_cards','op_one_slash','op_untouched','op_judge3']));
 await select('status','已领取');check('claimed filter keeps dates before unknown history',JSON.stringify(await ids())===JSON.stringify(['op_thunder','op_multi_target']));
 await select('status','全部状态');
 await frame('(d.getElementById("search").value="史诗",d.getElementById("search").dispatchEvent(new w.Event("input")),true)');
 check('rarity search keeps recent order',await frame('d.querySelector(".row").dataset.id==="op_thunder"&&[...d.querySelectorAll(".rarity-label")].every(n=>n.textContent==="史诗")'));
 await frame('(d.getElementById("search").value="",d.getElementById("search").dispatchEvent(new w.Event("input")),true)');
 await select('hero','csh_haozhao');
 check('hero with no dated records retains original sequence',await frame('JSON.stringify([...d.querySelectorAll(".row")].map(n=>n.dataset.id))===JSON.stringify(w.CSH_POOL_ACHV.RULES.filter(r=>r.hero==="csh_haozhao").map(r=>r.id))'));
 await select('hero','all');await select('sort','原始顺序');check('original ordering is still available',await frame('d.querySelector(".row").dataset.id===w.CSH_POOL_ACHV.RULES[0].id'));
 await select('sort','最近达成');
 for(const [width,height]of [[1365,768],[915,412],[640,286]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(150);
  await frame('(d.querySelector(".row").scrollIntoView({block:"nearest"}),true)');
  const m=await frame('(()=>{const row=d.querySelector(".row"),r=row.getBoundingClientRect();return {overflow:d.documentElement.scrollWidth>w.innerWidth+1,width:r.width,targets:[...row.querySelectorAll("button")].every(n=>n.getBoundingClientRect().height>=44),date:!!row.querySelector("time")}})()');
  check('recent ordering usable in landscape '+width,!m.overflow&&m.width>280&&m.targets&&m.date,m);stage('recent-'+width,{screenshot:await snap('recent-'+width)});
 }
 check('sort never mutates unlock times or claims',await frame('JSON.stringify({got:w.CSH_POOL_ACHV.load().got,seen:w.CSH_POOL_ACHV.load().seen})')===stored);
 const e=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('no runtime errors or rejections',!e.errors.length&&!e.rejections.length,e);
}
`;
let source=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
const marker="if(process.argv.includes('--world-layout-410'))";if(!source.includes(marker))throw Error('Host anchor changed');source=source.replace(marker,"if(process.argv.includes('--recent-achievements'))await recentAchievements();\n    else "+marker);
const file=path.join(out,'runner.mjs');fs.writeFileSync(file,tests+'\n'+source);const child=spawn(process.execPath,[file,'--recent-achievements','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((r,j)=>{child.once('error',j);child.once('exit',code=>{process.exitCode=code||0;r()})});
