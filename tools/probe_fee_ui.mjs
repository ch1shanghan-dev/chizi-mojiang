import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import {pathToFileURL} from 'node:url';import {root} from './lib/skill_audit.mjs';import {openProbe} from './lib/browser_probe.mjs';
const arg=process.argv.indexOf('--out'),out=arg>=0?process.argv[arg+1]:fs.mkdtempSync(path.join(os.tmpdir(),'csh-fee-ui-'));fs.mkdirSync(out,{recursive:true});
let html=fs.readFileSync(root+'/games/texas/texas.html','utf8').replace(/\r\n/g,'\n').replace(/(src|href)="\.\.\/\.\.\/([^"]+)"/g,(_,attr,f)=>attr+'="'+pathToFileURL(path.join(root,f)).href+'"');
const marker='\n})();\n</script>';if(!html.includes(marker))throw Error('texas scope anchor');
html=html.replace(marker,`
window.__feeUI=function(){
 document.getElementById('sign-mask').classList.add('hidden');G=makeSession();G.players=G.players.slice(0,2);G.n=2;G.dealer=0;G.community=[CSHPots.card(14,0),CSHPots.card(13,3),CSHPots.card(9,1),CSHPots.card(9,3),CSHPots.card(5,2)];G.handNo=1;G.pot=448;
 G.players.forEach(function(p,i){p.id=i;p.chips=9776;p.contrib=224;p.hole=i?[CSHPots.card(14,1),CSHPots.card(12,2)]:[CSHPots.card(13,0),CSHPots.card(13,2)];p.folded=false;p.allIn=false;});
 settleHand();G.winners=G.players.filter(function(p){return G.ledger.ledger.some(function(l){return l.id===p.id&&l.payout>0;});});switchView('view-game');showHandBanner();return {text:document.getElementById('banner').innerText,fee:G.ledger.systemCollected,ledger:G.ledger.ledger};
};
`+marker);
const rows=[],check=(name,v)=>rows.push({name,passed:!!v});const page=await openProbe(html);try{
 check('fee terms visible before entry',await page.evaluate("document.getElementById('fee-tip').textContent.includes('场供 1%')&&document.getElementById('fee-tip').textContent.includes('无金额上限')"));
 for(const [name,width,height]of [['desktop',1200,800],['phone',390,844],['short',915,412]]){
 await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});const r=await page.evaluate('__feeUI()');check(name+' real ledger render separates fee and refund',r.fee===4&&['本手投入','底池获奖','未跟注返还','本手场供','本手净变化','结算后筹码'].every(t=>r.text.includes(t)));check(name+' result panel fits viewport width',await page.evaluate("document.querySelector('.rs-panel').getBoundingClientRect().width<=innerWidth"));await page.evaluate('new Promise(r=>setTimeout(r,350))');const shot=await page.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));
 }
}finally{await page.close();}
const result={scope:'actual Texas page isolated Chromium, fixed hand; no user wallet or live multiplayer game',passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).length,failures:rows.filter(r=>!r.passed)};console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;
