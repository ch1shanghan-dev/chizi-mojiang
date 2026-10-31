// Installed page in a real host, using an isolated browser profile only.
import fs from 'node:fs';import path from 'node:path';import {spawn}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';
const arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1]},root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),out=arg('--out');if(!out)throw Error('External --out required');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function sameMatchFilter(){
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshDebug.openLobby();lib.cshShell.open("achv")})()');
 await until('!!document.getElementById("csh-shell-frame")?.contentDocument?.getElementById("summary")','achievement page');await delay(250);
 const frame=js=>page.evaluate('(()=>{const d=document.getElementById("csh-shell-frame").contentDocument,w=d.defaultView;return ('+js+');})()');
 const select=async(id,value)=>frame('(d.getElementById('+JSON.stringify(id)+').value='+JSON.stringify(value)+',d.getElementById('+JSON.stringify(id)+').dispatchEvent(new w.Event("change")),true)');
 await select('category','同局挑战');
 check('all 128 same-match challenges are discoverable',await frame('d.getElementById("rule-note").textContent.includes("128 项")&&d.querySelectorAll(".row").length===80&&d.querySelector(".load-more").textContent.includes("48")'));
 await clickElement('document.getElementById("csh-shell-frame").contentDocument.querySelector(".load-more")',true);
 check('expansion keeps only the 100 hero feats and 28 tactical challenges',await frame('d.querySelectorAll(".row").length===128&&[...d.querySelectorAll(".row")].every(n=>{const r=w.CSH_POOL_ACHV.RULES.find(r=>r.id===n.dataset.id);return r.scope==="feat"||!!r.tactic})'));
 check('rule note is explicit without extra header block',await frame('d.getElementById("rule-note").textContent.includes("不合并不同对局")&&d.querySelectorAll(".note").length===1'));
 await select('hero','general');await select('category','同局挑战');
 check('general filter isolates all 28 new challenges',await frame('d.querySelectorAll(".row").length===28&&[...d.querySelectorAll(".row")].every(n=>n.dataset.id.startsWith("tc_"))&&d.getElementById("rule-note").textContent.includes("28 项")'));
 await frame('(d.getElementById("search").value="三才成阵",d.getElementById("search").dispatchEvent(new w.Event("input")),true)');
 check('search composes with category',await frame('d.querySelectorAll(".row").length===1&&d.querySelector(".row").dataset.id==="tc_three_types"&&d.querySelector(".meta").textContent.includes("同局挑战")'));
 await select('status','已领取');
 check('empty status filter explains zero results',await frame('!d.querySelector(".row")&&d.querySelector(".empty").textContent.includes("没有匹配")&&d.getElementById("rule-note").textContent.includes("0 项")'));
 await select('status','全部状态');await select('sort','进度优先');
 check('sorting preserves selected category and result',await frame('d.getElementById("category").value==="同局挑战"&&d.querySelectorAll(".row").length===1'));
 await frame('(d.getElementById("search").value="",d.getElementById("search").dispatchEvent(new w.Event("input")),true)');
 await select('hero','csh_haozhao');await select('category','同局挑战');
 check('named hero keeps only own signature',await frame('d.querySelectorAll(".row").length===1&&d.querySelector(".row").dataset.id==="ca_haozhao_signature"&&d.getElementById("rule-note").textContent.includes("1 项")'));
 await select('category','全部分类');
 check('leaving category restores original 13 and original note',await frame('d.querySelectorAll(".row").length===13&&d.getElementById("rule-note").textContent.includes("武将胜场跨局累计")'));
 await select('hero','general');await select('category','同局挑战');
 for(const [width,height]of [[1365,768],[915,412],[640,286]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(150);
  await frame('(d.querySelector(".row").scrollIntoView({block:"nearest"}),true)');
  const m=await frame('(()=>{const r=d.querySelector(".row").getBoundingClientRect();return {overflow:d.documentElement.scrollWidth>w.innerWidth+1,rowWidth:r.width,rowY:r.y,rowBottom:r.bottom,height:w.innerHeight}})()');
  check('same-match list readable in landscape '+width,!m.overflow&&m.rowWidth>280&&m.rowY<m.height&&m.rowBottom>0,m);stage('same-match-'+width,{screenshot:await snap('same-match-'+width)});
 }
 check('opening filter never unlocks or pays',await frame('Object.keys(w.CSH_POOL_ACHV.load().got).length===0&&Object.keys(w.CSH_POOL_ACHV.load().seen).length===0'));
}
`;
let source=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
const marker="if(process.argv.includes('--world-layout-410'))";if(!source.includes(marker))throw Error('Host anchor changed');source=source.replace(marker,"if(process.argv.includes('--same-match-filter'))await sameMatchFilter();\n    else "+marker);
const file=path.join(out,'runner.mjs');fs.writeFileSync(file,tests+'\n'+source);const child=spawn(process.execPath,[file,'--same-match-filter','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((r,j)=>{child.once('error',j);child.once('exit',code=>{process.exitCode=code||0;r()})});
