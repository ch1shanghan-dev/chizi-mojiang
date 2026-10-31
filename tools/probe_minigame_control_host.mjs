import fs from 'node:fs';import path from 'node:path';import {spawn} from 'node:child_process';import {pathToFileURL,fileURLToPath} from 'node:url';
const arg=(k,d)=>{let i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];},root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),out=arg('--out');if(!out)throw Error('External --out required');fs.mkdirSync(out,{recursive:true});
const ddHook=`window.__controlTest={get:function(){return game;},selected:function(){return selIds.slice();},fixture:function(){clearAllTimers();game.phase='play';game.turn=0;game.landlord=2;game.over=false;game.auto=false;game.lastPlay=null;game.passCount=0;game.actions=[null,null,null];game.plays=[0,0,0];var d=buildDeck();game.hands=[[d[0],d[1],d[4],d[8],d[12],d[16],d[20]],[d[51]],[d[32],d[36],d[40]]];selIds=[];hintIdx=0;renderAll();}};`;
const unoHook=`window.__controlTest={get:function(){return room;},fixture:function(){clearAllTimers();room.autoPlay=false;room.state='playing';room.current=0;room.direction=1;room.turnHasDrawn=false;room.drawnCardId=null;room.players[0].hand=[{id:'fixture-skip',color:'red',value:'skip'},{id:'fixture-seven',color:'red',value:'7'}];room.players[0].uno=false;room.topCard={id:'fixture-top',color:'red',value:'2'};room.activeColor='red';room.discard=[room.topCard];room.broadcastState();}};`;
const tail=`window.__controlSounds=[];if(SFX){var originalSound=SFX.play;SFX.play=function(name,opt){window.__controlSounds.push(name);return originalSound.call(SFX,name,opt);};}`;
const tests=String.raw`
async function controlHost(){
 await page.evaluate('(async()=>{await lib.__cshLoadDebug();lib.cshWallet.wallet.add(50000,"isolated control fixture");lib.cshWallet.flushSave();lib.cshDebug.openLobby();})()');
 for(const key of ['doudizhu','uno']){
  await page.evaluate('lib.cshShell.close("control-test");lib.cshShell.open('+JSON.stringify(key)+',{buyIn:1000})');
  if(await page.evaluate('!!document.querySelector(".csh-fee-go")'))await clickElement('document.querySelector(".csh-fee-go")');
  await until('document.getElementById("csh-shell-frame")?.contentWindow?.__controlTest',key+' hook ready');await delay(450);
  const d='document.getElementById("csh-shell-frame").contentDocument',w='document.getElementById("csh-shell-frame").contentWindow';
  await clickElement(d+'.getElementById("btn-start-game")',true);await delay(200);
  await page.evaluate(w+'.__controlTest.fixture()');await delay(200);
  if(key==='doudizhu'){
   await clickElement(d+'.getElementById("btn-hint")',true);const selected=await page.evaluate(w+'.__controlTest.selected()');check('native free-lead hint selects a valid recommendation',selected.length>0,selected);
   await clickElement(d+'.getElementById("btn-hint")',true);check('native repeated hint continues cycling',await page.evaluate(w+'.__controlTest.selected().length')>0);
  }
  const before=await page.evaluate('JSON.stringify('+w+'.__controlTest.get().'+(key==='uno'?'players[0].hand':'hands[0]')+')');
  await clickElement(d+'.getElementById("btn-auto")',true);
  check(key+' native auto turns on',await page.evaluate(w+'.__controlTest.get().'+(key==='uno'?'autoPlay':'auto'))===true);
  await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await page.send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27,autoRepeat:true});await page.send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(1200);
  const after=await page.evaluate('(()=>{const w='+w+',g=w.__controlTest.get();return {auto:g.'+(key==='uno'?'autoPlay':'auto')+',hand:JSON.stringify(g.'+(key==='uno'?'players[0].hand':'hands[0]')+'),pressed:'+d+'.getElementById("btn-auto").getAttribute("aria-pressed"),text:'+d+'.getElementById("btn-auto").textContent,sounds:w.__controlSounds,errors:w.__hostSmoke.errors,rejections:w.__hostSmoke.rejections};})()');
  check(key+' Escape takes control without closing table',after.auto===false&&after.text==='托管'&&after.pressed==='false',after);
  check(key+' cancelled queued auto does not play later',after.hand===before,after);
  check(key+' auto on/off sound follows actual state',after.sounds.includes('assist.on')&&after.sounds.includes('assist.off'),after.sounds);
  check(key+' native hint and takeover have no runtime errors',!after.errors.length&&!after.rejections.length,after);
  for(const [width,height]of [[915,412],[640,286]]){await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(150);stage(key+'-takeover-'+width,{screenshot:await snap(key+'-takeover-'+width)});}
 }
 await page.evaluate('lib.cshShell.close("control-done")');
}
`;
let source=fs.readFileSync(root+'/tools/probe_host_smoke.mjs','utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
const marker='    const stream = fs.createReadStream(target);';if(!source.includes(marker))throw Error('Server marker');source=source.replace(marker,'    if(target.endsWith(path.join("doudizhu","doudizhu.html"))||target.endsWith(path.join("uno","uno.html"))){let body=fs.readFileSync(target,"utf8");const hook=target.endsWith(path.join("doudizhu","doudizhu.html"))?'+JSON.stringify(ddHook+tail)+':'+JSON.stringify(unoHook+tail)+';const end=body.lastIndexOf("</script>");if(end<0)throw Error("closure missing");body=body.slice(0,end)+hook+body.slice(end);res.end(body);return;}\n'+marker);
source=source.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--control-host'))await controlHost();\n    else if(process.argv.includes('--world-layout-410'))");const runner=path.join(out,'isolated-control-runner.mjs');fs.writeFileSync(runner,tests+'\n'+source);const p=spawn(process.execPath,[runner,'--control-host','--out',out],{stdio:'inherit',windowsHide:true});await new Promise(r=>p.once('exit',c=>{process.exitCode=c||0;r();}));
