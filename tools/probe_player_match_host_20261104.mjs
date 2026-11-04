import fs from'node:fs';import path from'node:path';import{spawn}from'node:child_process';import{pathToFileURL,fileURLToPath}from'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out='D:/CodexWork/chizi-mojiang/work/career-source-20261104/host';fs.mkdirSync(out,{recursive:true});
let s=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root='+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
const anchor="  stage('natural-match-CBY', {openingBalance,payment});";
if(!s.includes(anchor))throw Error('host receipt anchor missing');
s=s.replace(anchor,anchor+String.raw`
  const personal=await page.evaluate('(()=>{const p=lib.cshWallet.playerMatches(),me=game.me._trueMe||game.me;return {record:p,ownKill:me.stat.reduce((n,s)=>n+(s.kill>0?s.kill:0),0),stats:lib.cshShell.stats({readOnly:true}),disk:JSON.parse(localStorage.getItem("csh_wallet")).playerMatches}})()');
  check('natural terminal player result matches original receipt once',personal.record?.receipts.length===1&&personal.record.modes[matchMode].games===1&&personal.record.modes[matchMode][receipt.win?'win':'lose']===1,personal);
  check('natural actual kill and player character record exclude other actors',personal.record.modes[matchMode].kill===personal.ownKill&&personal.record.chars.includes(sample.me),personal);
  check('native shell and durable wallet show one accepted personal game',personal.stats.wrGames===1&&JSON.stringify(personal.record)===JSON.stringify(personal.disk),personal.stats);
  stage('natural-personal-record',{personal});
`);
const r="    stage('natural-mode-reward-reloaded',{state:restored,screenshot:await snap('natural-mode-reward-reloaded')});";
if(!s.includes(r))throw Error('host reload anchor missing');
s=s.replace(r,r+String.raw`
    const reloadedPersonal=await page.evaluate('lib.cshWallet.playerMatches()');
    check('complete native host reload preserves personal one-game record and original date',JSON.stringify(reloadedPersonal)===JSON.stringify(personal.record),reloadedPersonal);
`);
const runner=path.join(out,'runner.mjs');fs.writeFileSync(runner,s);const child=spawn(process.execPath,[runner,'--match-until-over','--match-mode','identity','--reward-only','--out',out],{stdio:'inherit',windowsHide:true});try{await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code||0;resolve()})})}finally{fs.rmSync(runner,{force:true})}
