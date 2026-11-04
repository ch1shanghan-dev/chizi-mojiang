import fs from'node:fs';import path from'node:path';import{spawn}from'node:child_process';import{pathToFileURL,fileURLToPath}from'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out='D:/CodexWork/chizi-mojiang/work/career-player-unlocks-20261104/host-round';fs.mkdirSync(out,{recursive:true});
let s=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root='+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
s=s.replace('async function reloadHost(ready, description, ms = 15000)', 'async function reloadHost(ready, description, ms = 45000)');
const anchor="  stage('natural-match-CBY', {openingBalance,payment});";
if(!s.includes(anchor))throw Error('host receipt anchor missing');
s=s.replace(anchor,anchor+String.raw`
  const personal=await page.evaluate('(()=>{const p=lib.cshWallet.playerMatches(),me=game.me._trueMe||game.me;return {record:p,ownKill:me.stat.reduce((n,s)=>n+(s.kill>0?s.kill:0),0),stats:lib.cshShell.stats({readOnly:true}),disk:JSON.parse(localStorage.getItem("csh_wallet")).playerMatches}})()');
  check('natural terminal player result matches original receipt once',personal.record?.receipts.length===1&&personal.record.modes[matchMode].games===1&&personal.record.modes[matchMode][receipt.win?'win':'lose']===1,personal);
  check('natural actual kill and player character record exclude other actors',personal.record.modes[matchMode].kill===personal.ownKill&&personal.record.chars.includes(sample.me),personal);
  check('native shell and durable wallet show one accepted personal game',personal.stats.wrGames===1&&JSON.stringify(personal.record)===JSON.stringify(personal.disk),personal.stats);
  const qualified=await page.evaluate('lib.cshWallet.wallet.careerUnlocks()');
  check('natural actual terminal qualifies games/chars/modes without opening career', ['games_1','chars_1','modes_1',receipt.win?'wins_1':'loses_1'].every(k=>qualified?.entries[k]?.observedAt===personal.record.receipts[0].t),qualified);
  stage('natural-personal-record',{personal,qualified});
`);
const r="    stage('natural-mode-reward-reloaded',{state:restored,screenshot:await snap('natural-mode-reward-reloaded')});";
if(!s.includes(r))throw Error('host reload anchor missing');
s=s.replace(r,r+String.raw`
    const reloadedPersonal=await page.evaluate('lib.cshWallet.playerMatches()');
    check('complete native host reload preserves personal one-game record and original date',JSON.stringify(reloadedPersonal)===JSON.stringify(personal.record),reloadedPersonal);
    const reloadedQualifications=await page.evaluate('lib.cshWallet.wallet.careerUnlocks()');check('complete native reload retains exact personal qualification dates',JSON.stringify(reloadedQualifications.entries.games_1)===JSON.stringify(qualified.entries.games_1),reloadedQualifications);
`);
const runner=path.join(out,'runner.mjs');fs.writeFileSync(runner,s);const child=spawn(process.execPath,[runner,'--match-until-over','--match-mode','identity','--reward-only','--out',out],{stdio:'inherit',windowsHide:true});try{await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code||0;resolve()})})}finally{fs.rmSync(runner,{force:true})}
