import fs from 'node:fs';import path from 'node:path';import{spawn}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1]},root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),out=arg('--out');if(!out)throw Error('External --out required');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function earnedTime(){
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshDebug.openLobby();lib.cshShell.open("achv")})()');
 await until('!!document.getElementById("csh-shell-frame")?.contentDocument?.getElementById("summary")','achievement page');await delay(250);
 const frame=js=>page.evaluate('(()=>{const d=document.getElementById("csh-shell-frame").contentDocument,w=d.defaultView;return ('+js+');})()');
 const search=async value=>frame('(d.getElementById("search").value='+JSON.stringify(value)+',d.getElementById("search").dispatchEvent(new w.Event("input")),true)');
 check('locked achievements never show a completion date',await frame('!d.querySelector(".earned-time")'));
 check('isolated records can be seeded without real profile',await frame('(()=>{const p=w.CSH_POOL_ACHV,s=p.load();s.got.op_one_slash={t:1700000000123,m:"identity",n:1};s.got.op_thunder={t:0,m:"versus",n:1};s.seen.op_thunder=1;s.got.op_hit3={t:"not-date",m:"doudizhu",n:1};s.got.op_cards4=true;s.got.op_hit5={t:9000000000000000,m:"unknown",n:1};s.got.op_judge3={t:"1700000000123",m:"identity",n:1};s.seen.gen_niliu=1;return p.save(s)})()'));
 await search('一刀两断');
 check('stored timestamp has exact machine readable value and mode',await frame('(()=>{const n=d.querySelector("[data-id=op_one_slash] .earned-time"),t=n.querySelector("time");return t.getAttribute("datetime")===new Date(1700000000123).toISOString()&&n.textContent.includes("达成于 ")&&n.textContent.includes("身份")&&t.title.includes("本机时间")})()'));
 await search('雷霆一击');
 check('claimed legacy record preserves unknown time and mode',await frame('d.querySelector("[data-id=op_thunder] .earned-time").textContent==="达成时间未记录 · 对决"&&!d.querySelector(".earned-time time")&&d.querySelector("[data-id=op_thunder] .claim").textContent==="已领取"'));
 await search('重手');
 check('invalid text timestamp does not become current time',await frame('d.querySelector("[data-id=op_hit3] .earned-time").textContent==="达成时间未记录 · 斗地主"&&!d.querySelector(".earned-time time")'));
 await search('连珠');
 check('legacy boolean record is handled without exception',await frame('d.querySelector("[data-id=op_cards4] .earned-time").textContent==="达成时间未记录"'));
 await search('一击定音');
 check('out of Date range is unknown and unknown mode omitted',await frame('d.querySelector("[data-id=op_hit5] .earned-time").textContent==="达成时间未记录"&&!d.querySelector(".earned-time time")'));
 await search('判若神明');
 check('numeric historical timestamp string is compatible',await frame('d.querySelector("[data-id=op_judge3] .earned-time time").getAttribute("datetime")===new Date(1700000000123).toISOString()'));
 await search('逆流');
 check('claimed receipt without unlock date never invents one',await frame('d.querySelector("[data-id=gen_niliu] .earned-time").textContent==="达成时间未记录"'));
 await search('一刀两断');
 for(const [width,height]of [[1365,768],[915,412],[640,286]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(150);
  await frame('(d.querySelector(".earned-time").scrollIntoView({block:"nearest"}),true)');
  const m=await frame('(()=>{const row=d.querySelector("[data-id=op_one_slash]"),n=row.querySelector(".earned-time"),r=n.getBoundingClientRect(),b=row.getBoundingClientRect();return {overflow:d.documentElement.scrollWidth>w.innerWidth+1,display:w.getComputedStyle(n).display,font:parseFloat(w.getComputedStyle(n).fontSize),contained:r.left>=b.left&&r.right<=b.right&&r.bottom<=b.bottom,targets:[...row.querySelectorAll("button")].every(n=>n.getBoundingClientRect().height>=44)}})()');
  check('earned record remains readable in landscape '+width,!m.overflow&&m.display!=='none'&&m.font>=12&&m.contained&&m.targets,m);stage('earned-'+width,{screenshot:await snap('earned-'+width)});
 }
 const saved=await frame('w.CSH_POOL_ACHV.load()');
 check('display never repairs timestamps or changes legacy claim state',saved.got.op_one_slash.t===1700000000123&&saved.got.op_thunder.t===0&&saved.got.op_hit3.t==='not-date'&&saved.got.op_cards4===true&&saved.seen.op_thunder===1);
 const e=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('no runtime errors or rejected promises',!e.errors.length&&!e.rejections.length,e);
}
`;
let source=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
const marker="if(process.argv.includes('--world-layout-410'))";if(!source.includes(marker))throw Error('Host anchor changed');source=source.replace(marker,"if(process.argv.includes('--earned-time'))await earnedTime();\n    else "+marker);
const file=path.join(out,'runner.mjs');fs.writeFileSync(file,tests+'\n'+source);const child=spawn(process.execPath,[file,'--earned-time','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((r,j)=>{child.once('error',j);child.once('exit',code=>{process.exitCode=code||0;r()})});
