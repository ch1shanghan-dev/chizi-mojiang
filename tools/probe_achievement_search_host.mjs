import fs from 'node:fs';import path from 'node:path';import{spawn}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1]},root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),out=arg('--out');if(!out)throw Error('External --out required');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function searchAndReset(){
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshDebug.openLobby();lib.cshShell.open("achv")})()');
 await until('!!document.getElementById("csh-shell-frame")?.contentDocument?.getElementById("summary")','achievement page');await delay(250);
 const frame=js=>page.evaluate('(()=>{const d=document.getElementById("csh-shell-frame").contentDocument,w=d.defaultView;return ('+js+');})()');
 const query=async value=>frame('(d.getElementById("search").value='+JSON.stringify(value)+',d.getElementById("search").dispatchEvent(new w.Event("input")),[...d.querySelectorAll(".row")].map(n=>n.dataset.id))');
 const snapshot=await frame('JSON.stringify({got:w.CSH_POOL_ACHV.load().got,seen:w.CSH_POOL_ACHV.load().seen})');
 const expected=await frame('w.CSH_POOL_ACHV.RULES.filter(r=>r.hero==="csh_haozhao"&&r.rare===3).map(r=>r.id)');
 const first=await query('郝昭 史诗');
 check('name and rarity are AND combined',JSON.stringify(first)===JSON.stringify(expected)&&first.length>0,{first,expected});
 check('keyword order does not matter',JSON.stringify(await query('史诗 郝昭'))===JSON.stringify(first));
 check('full width whitespace and repeated spaces normalize',JSON.stringify(await query('　 郝昭　\t  史诗　'))===JSON.stringify(first));
 const modeIds=await query('主阵不坠 身份');check('mode names are searchable',modeIds.length===1&&modeIds[0]==='tc_lord_stand');
 const lower=await query('cby');check('ASCII case folds',JSON.stringify(await query('CBY'))===JSON.stringify(lower));
 // Verify against a small isolated in-memory definition rename, not saved or counted as content.
 const normalized=await frame('(()=>{const r=w.CSH_POOL_ACHV.RULES.find(r=>r.id==="op_one_slash"),name=r.name;try{r.name="ＡＢＣ１２３";d.getElementById("search").value="abc123";d.getElementById("search").dispatchEvent(new w.Event("input"));return d.querySelectorAll(".row").length===1&&d.querySelector(".row").dataset.id===r.id}finally{r.name=name}})()');
 check('NFKC full width text normalizes to ASCII',normalized);
 await query('<img src=x onerror=alert(1)>');
 check('literal special characters produce safe empty state',await frame('!d.querySelector(".row")&&!d.querySelector("#list img")&&d.querySelectorAll(".clear-filters").length===1'));
 await frame('(d.getElementById("hero").value="csh_haozhao",d.getElementById("category").value="同局挑战",d.getElementById("status").value="已领取",d.getElementById("sort").value="进度优先",d.getElementById("status").dispatchEvent(new w.Event("change")),true)');
 for(const [width,height]of [[1365,768],[915,412],[640,286]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(150);
  await frame('(d.querySelector(".clear-filters").scrollIntoView({block:"nearest"}),true)');
  const m=await frame('(()=>{const n=d.querySelector(".clear-filters"),r=n.getBoundingClientRect();return {overflow:d.documentElement.scrollWidth>w.innerWidth+1,width:r.width,height:r.height,hit:d.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===n}})()');
  check('empty reset is reachable in landscape '+width,!m.overflow&&m.height>=44&&m.hit,m);stage('empty-reset-'+width,{screenshot:await snap('empty-reset-'+width)});
 }
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.querySelector(".clear-filters")',true);
 check('reset clears all filters and restores default ordering',await frame('d.getElementById("search").value===""&&d.getElementById("hero").value==="all"&&d.getElementById("category").value==="全部分类"&&d.getElementById("status").value==="全部状态"&&d.getElementById("sort").value==="待领优先"'));
 check('reset restores first batch and search focus',await frame('d.querySelectorAll(".row").length===80&&!d.querySelector(".clear-filters")&&d.activeElement===d.getElementById("search")'));
 check('no unlock or claimed record changed',await frame('JSON.stringify({got:w.CSH_POOL_ACHV.load().got,seen:w.CSH_POOL_ACHV.load().seen})')===snapshot);
 const e=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('no runtime exceptions or rejected promises',!e.errors.length&&!e.rejections.length,e);
}
`;
let source=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
const marker="if(process.argv.includes('--world-layout-410'))";if(!source.includes(marker))throw Error('Host anchor changed');source=source.replace(marker,"if(process.argv.includes('--search-reset'))await searchAndReset();\n    else "+marker);
const file=path.join(out,'runner.mjs');fs.writeFileSync(file,tests+'\n'+source);const child=spawn(process.execPath,[file,'--search-reset','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((r,j)=>{child.once('error',j);child.once('exit',code=>{process.exitCode=code||0;r()})});
