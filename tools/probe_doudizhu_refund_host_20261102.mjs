// Isolated full Noname host: real fee, unfinished DDZ refund, failure/retry and export/reload.
import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL,fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),i=process.argv.indexOf('--out');if(i<0)throw Error('External D: --out required');const out=path.resolve(process.argv[i+1]);if(/^c:/i.test(out)||out.toLowerCase().startsWith(root.toLowerCase()+path.sep))throw Error('Keep output outside C: and install');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function ddzRefundHost(){
 await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});
 await page.evaluate('window.__refundRequests=[];addEventListener("message",e=>{if(e.data&&["shell-settle-session","shell-settle"].includes(e.data.__csh))__refundRequests.push(JSON.parse(JSON.stringify(e.data)))})');
 const f='document.getElementById("csh-shell-frame")',w=f+'.contentWindow',d=f+'.contentDocument';
 const economy='({pc:lib.cshWallet.wallet.pc(),merit:lib.cshWallet.rank.get().merit,world:lib.cshWorld.list().map(a=>({id:a.id,fund:a.fund,hands:a.hands,wins:a.wins,withPlayer:a.withPlayer})),ledger:JSON.parse(localStorage.getItem("csh_ledger")||"[]").filter(e=>e.r==="结算/doudizhu")})';
 const payload=r=>{const data=r.data&&typeof r.data==='object'?r.data:r;return {key:data.key,buyIn:data.buyIn,chips:data.chips,seats:data.seats};};
 async function enter(){const before=await page.evaluate(economy);await page.evaluate('lib.cshShell.open("doudizhu",{buyIn:300})');await until('!!document.querySelector(".csh-fee-go")','real DDZ fee confirmation');await clickElement('document.querySelector(".csh-fee-go")');await until(w+'?.Bridge?.isReady()&&'+w+'.Bridge.opponents().length===2','real DDZ paid world seats');const entry=await page.evaluate('({base:'+w+'.Bridge.buyIn(),state:'+economy+'})');check('real entry debits personal principal only',entry.base>0&&entry.state.pc===before.pc-entry.base,{before:before.pc,entry:entry.state.pc,base:entry.base});return {before,entry};}
 for(const phase of ['idle','bid','play']){
  const {before,entry}=await enter();
  if(phase!=='idle'){await clickElement(d+'.getElementById("btn-start-game")',true);await until(w+'.game.aiStakes.every(n=>n>0)','real started DDZ stakes');await page.evaluate(w+'.clearAllTimers();'+w+'.game.phase='+JSON.stringify(phase)+';'+w+'.game.landlord='+(phase==='play'?'1':'-1')+';'+w+'.game.over=false');}
  const fixture=await page.evaluate('({phase:'+w+'.game.phase,chips:'+w+'.game.chips,base:'+w+'.Bridge.buyIn(),stakes:'+w+'.game.aiStakes.slice()})');
  check(phase+' unfinished settlement owns only personal principal',await page.evaluate(w+'.sessionSettlementData().chips')===entry.base&&(phase==='idle'||fixture.chips===entry.base),fixture);
  const reqBefore=await page.evaluate('__refundRequests.length');await clickElement('document.getElementById("csh-shell-close")');await until('!document.getElementById("csh-shell-frame")','native '+phase+' close refunds before removing iframe');
  const after=await page.evaluate(economy),requests=await page.evaluate('__refundRequests.slice('+reqBefore+')'),data=requests.length?payload(requests[0]):{};
  check(phase+' close uses one canonical refund with no AI seats',requests.length===1&&requests[0].__csh==='shell-settle-session'&&data.buyIn===entry.base&&data.chips===entry.base&&Array.isArray(data.seats)&&data.seats.length===0,requests);
  check(phase+' native close returns exactly principal without money or merit gain',after.pc===before.pc&&after.merit===before.merit&&JSON.parse(await page.evaluate('localStorage.getItem("csh_wallet")')).pc===before.pc,{before:before.pc,after:after.pc,meritBefore:before.merit,meritAfter:after.merit});
  check(phase+' abandoned table changes no AI funds or personal experience',JSON.stringify(after.world)===JSON.stringify(entry.state.world));
  check(phase+' refund creates exactly one real principal receipt',after.ledger.length===before.ledger.length+1&&after.ledger[0].d===entry.base&&!!after.ledger[0].checkpointTx,after.ledger[0]);
  stage('unfinished-'+phase,{fixture,base:entry.base,pc:after.pc,receipt:after.ledger[0]});
 }
 const {before,entry}=await enter();await clickElement(d+'.getElementById("btn-start-game")',true);await until(w+'.game.aiStakes.every(n=>n>0)','retry fixture started DDZ');
 await page.evaluate('window.__realSettleRun=lib.cshWallet.wallet.settleRun;window.__forceOneSettleFailure=true;lib.cshWallet.wallet.settleRun=function(){if(__forceOneSettleFailure){__forceOneSettleFailure=false;return {ok:false,credited:0,reason:"isolated intentional save failure"}}return __realSettleRun.apply(this,arguments)}');
 const reqBefore=await page.evaluate('__refundRequests.length');
 await page.evaluate(w+'.clearAllTimers();'+w+'.game.landlord=1;'+w+'.game.phase="play";'+w+'.game.over=false;'+w+'.game.winner=-1;'+w+'.game.mult=1;'+w+'.game.multLog=[];'+w+'.game.plays=[2,2,2];'+w+'.game.hands[2]=[];'+w+'.endGame(2)');
 await until(w+'.game.over&&!'+w+'.Bridge.isSettled()&&window.__forceOneSettleFailure===false','real failed terminal settlement leaves page retryable');
 check('failed real terminal payout has not credited wallet',await page.evaluate('lib.cshWallet.wallet.pc()')===entry.state.pc);
 const firstRequest=await page.evaluate('__refundRequests['+reqBefore+']'),terminal=payload(firstRequest);
 await page.evaluate(w+'.window.__refundOldDocument=true');await clickElement(d+'.getElementById("btn-again")',true);
 await until('!!document.querySelector(".csh-fee-go")&&'+w+'.Bridge.isSettled()','actual retry settles old result before next fee',15000);
 await clickElement('document.querySelector(".csh-fee-no")');await until('!document.querySelector(".csh-fee-go")&&'+w+'.alive','cancel next entry preserves settled old document');
 const after=await page.evaluate(economy),requests=await page.evaluate('__refundRequests.slice('+reqBefore+')');
 check('failed terminal retry uses identical canonical session data before next entry',requests.length===2&&requests.every(r=>r.__csh==='shell-settle-session')&&JSON.stringify(payload(requests[1]))===JSON.stringify(terminal),requests);
 check('terminal retry credits the actual positive result exactly once',terminal.chips>terminal.buyIn&&after.pc>before.pc&&after.ledger.length===before.ledger.length+1&&after.ledger[0].d===after.pc-entry.state.pc,{before:before.pc,entry:entry.state.pc,after:after.pc,receipt:after.ledger[0]});
 const duplicate=await page.evaluate('(async()=>new Promise(resolve=>'+w+'.CSHPage.transport({timeout:3000}).call("shell-settle-session",'+JSON.stringify(terminal)+',(ok,data)=>resolve({ok,data}))))()');
 check('fresh duplicate after cancelling next entry replays successful host guard without another receipt',duplicate.ok&&duplicate.data.ok&&await page.evaluate('lib.cshWallet.wallet.pc()')===after.pc&&await page.evaluate('JSON.parse(localStorage.getItem("csh_ledger")||"[]").filter(e=>e.r==="结算/doudizhu").length')===after.ledger.length,duplicate);
 stage('terminal-failure-retry',{terminal,pc:after.pc,receipt:after.ledger[0],screenshot:await snap('terminal-retry-refunded')});
 await page.evaluate('lib.cshWallet.wallet.settleRun=window.__realSettleRun');await clickElement('document.getElementById("csh-shell-close")');await until('!document.getElementById("csh-shell-frame")','retry table closes without repaying');
 await page.evaluate('lib.cshShell.open("save")');await until(d+'?.getElementById("b-pack")&&!'+d+'.getElementById("b-pack").disabled','actual bag export control');await clickElement(d+'.getElementById("b-pack")',true);const exported=await until(d+'.getElementById("code").value||false','actual refund export');const inspected=await page.evaluate('lib.cshMigrate.inspect('+JSON.stringify(exported)+')');
 check('actual bag export contains final balance and unique refund/result receipts',inspected.ok&&inspected.data.wallet.pc===after.pc&&inspected.data.ledger.filter(e=>e.r==='结算/doudizhu').length===after.ledger.length&&after.ledger.every(e=>inspected.data.ledger.some(v=>v.checkpointTx===e.checkpointTx&&v.d===e.d)));await clickElement('document.getElementById("csh-shell-close")');
 await reloadHost('!!window.lib?.cshWallet&&!!lib.character?.csh_haozhao','whole host reload after canonical DDZ refunds',20000);
 check('whole host reload retains exactly saved money and every unique payout receipt',await page.evaluate('lib.cshWallet.wallet.pc()')===after.pc&&JSON.parse(await page.evaluate('localStorage.getItem("csh_wallet")')).pc===after.pc&&await page.evaluate('JSON.stringify(JSON.parse(localStorage.getItem("csh_ledger")||"[]").filter(e=>e.r==="结算/doudizhu"))')===JSON.stringify(after.ledger));
 const errors=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('full host refund retry export and reload have no runtime errors',!errors.errors.length&&!errors.rejections.length,errors);
}
`;
let s=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root='+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
s=s.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--ddz-refund-host'))await ddzRefundHost();else if(process.argv.includes('--world-layout-410'))");
s=s.replace("scope: 'Full unmodified host index.html", "scope: 'Unmodified actual DDZ source and complete host; test-only explicit bid/play/terminal state and one failed wallet method fixture. Full unmodified host index.html");const runner=path.join(out,'runner.mjs');fs.writeFileSync(runner,tests+'\n'+s);const child=spawn(process.execPath,[runner,'--ddz-refund-host','--out',out],{stdio:'inherit',windowsHide:true});try{await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code||0;resolve()})})}finally{fs.rmSync(runner,{force:true})}
