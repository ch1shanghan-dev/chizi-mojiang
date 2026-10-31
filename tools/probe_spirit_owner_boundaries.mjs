import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import{webcrypto}from'node:crypto';import{spawn}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];},root=path.resolve(arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'))),out=path.resolve(arg('--out',''));
if(!arg('--out')||out.toLowerCase()===root.toLowerCase()||out.toLowerCase().startsWith(root.toLowerCase()+path.sep))throw Error('Use external --out');fs.mkdirSync(out,{recursive:true});
const{parse,walk}=await import(pathToFileURL(path.join(root,'tools/lib/skill_audit.mjs')));
const src=fs.readFileSync(arg('--source',path.join(root,'core/csh_aux_spirit.js')),'utf8').replace(/^import .*;\r?\n/gm,'');
const data='import {MINIONS,MINION_NAMES} from '+JSON.stringify(pathToFileURL(path.join(root,'core/csh_bossdata.js')).href)+';\nconst console={warn(){}};\n'+src;
const{installAuxSpirit}=await import('data:text/javascript;base64,'+Buffer.from(data).toString('base64'));
const old=fs.readFileSync(path.join(root,'tools/probe_aux_spirit.mjs'),'utf8').replace(/^import .*;\r?\n/gm,''),split=old.indexOf("for(const role of ['zhu'");if(split<0)throw Error('fixture anchor');
const box=vm.createContext({fs,vm,webcrypto,root,parse,walk,installAuxSpirit,process,console,TextEncoder,TextDecoder,btoa,atob});vm.runInContext(old.slice(0,split),box);
const unit=String.raw`
const change={identity:h=>h.game.me.identity='fan',control:h=>h.game.me=h.game.players[1],ownerDead:h=>h.game.me.dead=true,spiritDead:(h,p)=>p.dead=true,recovery:h=>h.data.set('csh_migrate_recovery','{}'),epoch:h=>h.lib.cshWallet.reloadSave({wallet:h.W.get(),rank:h.lib.cshWallet.rank.get()},{memoryOnly:true}),ended:h=>h.status.over=true};
for(const [kind,mutate]of Object.entries(change))for(const skill of ['guard','aid','rescue']){
 const h=harness(),r=await h.A.start(),p=r.spirit,o=r.owner,k=h.lib.skill['csh_aux_'+skill],t={player:o,num:2};o.hp=0;
 const passed=k.filter(t,p),before={guard:p.storage.cshAuxGuard||0,aid:p.storage.cshAuxAid||0,rescue:!!p.storage.cshAuxRescue,hand:o.hand.length,hp:o.hp};mutate(h,p);await k.content({},t,p);
 check(kind+' invalidated '+skill+' does not execute or consume support',passed&&t.num===2&&(p.storage.cshAuxGuard||0)===before.guard&&(p.storage.cshAuxAid||0)===before.aid&&!!p.storage.cshAuxRescue===before.rescue&&o.hand.length===before.hand&&o.hp===before.hp);
}
for(const skill of ['guard','aid','rescue']){
 const h=harness(),r=await h.A.start(),p=r.spirit,o=r.owner,t={player:o,num:2};o.hp=0;
 const k=h.lib.skill['csh_aux_'+skill],passed=k.filter(t,p);if(skill==='guard')p.storage.cshAuxGuard=3;if(skill==='aid')p.storage.cshAuxAid=3;if(skill==='rescue')p.storage.cshAuxRescue=true;const hand=o.hand.length;await k.content({},t,p);
 check('already-consumed '+skill+' remains capped at execution',passed&&t.num===2&&(p.storage.cshAuxGuard||0)<=3&&(p.storage.cshAuxAid||0)<=3&&o.hp===0&&o.hand.length===hand);
}
{
 const h=harness(),r=await h.A.start(),p=r.spirit,o=r.owner,bystander=h.game.players[1],t={player:bystander,num:2};o.hp=0;bystander.hp=0;await h.lib.skill.csh_aux_guard.content({},t,p);await h.lib.skill.csh_aux_rescue.content({},t,p);
 check('late support refuses target changed away from owner',t.num===2&&!p.storage.cshAuxGuard&&!p.storage.cshAuxRescue&&o.hp===0&&bystander.hp===0);
}
{
 const h=harness(),r=await h.A.start(),p=r.spirit,o=r.owner,t={player:o,num:0};o.hp=1;await h.lib.skill.csh_aux_guard.content({},t,p);await h.lib.skill.csh_aux_rescue.content({},t,p);
 check('nonpositive damage and recovered owner do not consume support',t.num===0&&!p.storage.cshAuxGuard&&!p.storage.cshAuxRescue&&o.hp===1);
}
{
 const h=harness(),r=await h.A.start(),p=r.spirit,o=r.owner;p.storage.cshAuxGuard=1;p.storage.cshAuxAid=2;p.storage.cshAuxRescue=true;p.dead=true;const n=h.game.players.length,s=h.A.summary();await h.A.start();p.dead=false;const revived=h.A.summary();
 check('dead start cannot replace guardian and revive keeps counters',s.state==='dead'&&!s.supportActive&&h.game.players.length===n&&h.A.current()===r&&revived.state==='active'&&revived.guardLeft===2&&revived.aidLeft===1&&!revived.rescueReady);
 o.dead=true;check('owner-dead guardian remains same native identity and stops support',p.identity==='zhong'&&h.A.summary().state==='owner-dead'&&!h.A.summary().supportActive);o.dead=false;check('revived owner resumes only remaining support',h.A.summary().state==='active'&&h.A.summary().guardLeft===2&&h.A.summary().aidLeft===1&&!h.A.summary().rescueReady);
}
{
 const h=harness(),r=await h.A.start(),p=r.spirit,o=r.owner;p.storage.cshAuxRescue=false;o.hp=-3;await h.lib.skill.csh_aux_rescue.content({},{player:o},p);check('normal rescue still recovers exactly one without promising survival',p.storage.cshAuxRescue===true&&o.hp===-2);
 const e={player:o,num:2};await h.lib.skill.csh_aux_guard.content({},e,p);await h.lib.skill.csh_aux_aid.content({},null,p);check('normal guard and aid retain exact original effects',e.num===1&&p.storage.cshAuxGuard===1&&p.storage.cshAuxAid===1&&o.hand.length===1);
}
return {scope:'actual spirit module, native host addPlayer/checkResult methods, real wallet/recovery in disposable VM; separate --host runs full engine',passed:rows.filter(x=>x.passed).length,failed:rows.filter(x=>!x.passed).length,checks:rows};
`;
const result=await vm.runInContext('(async()=>{'+unit+'})()',box);fs.writeFileSync(path.join(out,'spirit-owner-boundaries.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:undefined,failures:result.checks.filter(x=>!x.passed)},null,2));if(result.failed)process.exitCode=1;
if(process.argv.includes('--host')){
const tests=String.raw`
async function auditSpiritOwner(){
 if(await page.evaluate('[...document.querySelectorAll(".control")].some(n=>n.textContent==="确定")'))await clickElement('[...document.querySelectorAll(".control")].find(n=>n.textContent==="确定")');
 await until('!!_status.gameStarted','native game starts',25000);
 await page.evaluate('('+function(){
  window.__ownerAudit=null;
  lib.skill.__audit_spirit_owner={trigger:{global:'phaseUseBegin'},forced:true,silent:true,firstDo:true,filter(){return !!lib.cshAuxSpirit.current()?.spirit&&!window.__ownerAudit;},async content(){
   window.__ownerAudit={running:true};const A=lib.cshAuxSpirit,r=A.current(),p=r.spirit,o=r.owner,rows=[],snap=()=>JSON.parse(JSON.stringify(A.summary()));const check=(name,passed,detail)=>rows.push({name,passed:!!passed,detail});
   try{
    const originalIdentity=o.identity,count=game.players.length,position=p.dataset.position,assisted=_status.cshAssistedMatch,pc=lib.cshWallet.wallet.pc();
    check('fixture owner uses allowed non-monarch native identity',originalIdentity==='fan'||originalIdentity==='zhong',{identity:originalIdentity});
    p.storage.cshAuxGuard=1;p.storage.cshAuxAid=1;p.storage.cshAuxRescue=false;
    await p.die(o);let s=snap();
    check('native spirit death exits living ring and keeps dead node',!p.isIn()&&!game.players.includes(p)&&game.dead.includes(p)&&p.classList.contains('dead')&&p.isConnected,{state:s,players:game.players.length});
    check('death shows unavailable support with remaining count',s.state==='dead'&&!s.supportActive&&s.guardLeft===2&&s.aidLeft===2&&s.rescueReady,s);
    await A.start();check('start while guardian dead never summons replacement',A.current()===r&&game.players.concat(game.dead).length===count&&game.players.concat(game.dead).filter(x=>x._cshAuxSpirit).length===1);
    p.revive(2);s=snap();
    check('native revive restores living list original seat and remaining support',p.isIn()&&game.players.includes(p)&&!game.dead.includes(p)&&p.dataset.position===position&&s.state==='active'&&s.guardLeft===2&&s.aidLeft===2&&s.rescueReady,s);
    const spiritIdentity=p.identity;await o.die(p);s=snap();
    check('owner native death leaves guardian alive in original camp',!o.isIn()&&p.isIn()&&p.identity===spiritIdentity&&!_status.over,{summary:s,owner:o.identity,guardian:p.identity});
    check('owner-dead state and all support filters are inactive',s.state==='owner-dead'&&!s.supportActive&&!lib.skill.csh_aux_guard.filter({player:o,num:2},p)&&!lib.skill.csh_aux_aid.filter({},p)&&!lib.skill.csh_aux_rescue.filter({player:o},p),s);
    o.revive(2);s=snap();check('native owner revive resumes only remaining support',o.isIn()&&s.state==='active'&&s.guardLeft===2&&s.aidLeft===2&&s.rescueReady,s);
    o.identity=originalIdentity==='fan'?'zhong':'fan';s=snap();check('identity change pauses with player-facing reason',s.state==='paused'&&s.reason.includes('身份')&&!s.supportActive,s);o.identity=originalIdentity;
    const another=game.players.find(x=>x!==o&&x!==p);game.swapControl(another);s=snap();check('native control switch pauses original owner support',game.me===another&&s.state==='paused'&&s.reason.includes('控制'),s);game.swapControl(o);s=snap();check('native control return resumes and never transfers ownership',game.me===o&&A.current().owner===o&&s.state==='active',s);
    game.swapControl(p);check('native control handoff cannot take guardian',game.me===o);
    async function execute(name,trigger){const e=game.createEvent('audit_'+name);e.player=p;e._trigger=trigger;e.setContent(lib.skill[name].content);await e;}
    let t={player:o,num:2};const guardFilter=lib.skill.csh_aux_guard.filter(t,p);o.identity=originalIdentity==='fan'?'zhong':'fan';await execute('csh_aux_guard',t);
    check('real queued guard refuses identity invalidated after filter',guardFilter&&t.num===2&&p.storage.cshAuxGuard===1,{damage:t.num,count:p.storage.cshAuxGuard,summary:snap()});o.identity=originalIdentity;
    o.hp=0;t={player:o};const rescueFilter=lib.skill.csh_aux_rescue.filter(t,p);o.identity=originalIdentity==='fan'?'zhong':'fan';await execute('csh_aux_rescue',t);
    check('real queued rescue cannot consume charge after support pauses',rescueFilter&&!p.storage.cshAuxRescue&&o.hp===0,{used:p.storage.cshAuxRescue,hp:o.hp,summary:snap()});o.identity=originalIdentity;o.hp=2;
    p.storage.cshAuxGuard=3;p.storage.cshAuxAid=3;p.storage.cshAuxRescue=true;t={player:o,num:2};const hand=o.countCards('h');await execute('csh_aux_guard',t);await execute('csh_aux_aid',null);o.hp=0;await execute('csh_aux_rescue',{player:o});
    check('real queued duplicate callbacks cannot exceed support quota',p.storage.cshAuxGuard===3&&p.storage.cshAuxAid===3&&p.storage.cshAuxRescue&&t.num===2&&o.countCards('h')===hand&&o.hp===0,{storage:p.storage,damage:t.num,hand:o.countCards('h')});o.hp=2;
    check('native death revival and paused support never alter economic wallet',lib.cshWallet.wallet.pc()===pc&&_status.cshAssistedMatch===assisted,{before:pc,after:lib.cshWallet.wallet.pc(),assisted:_status.cshAssistedMatch});
    window.__ownerAudit={rows,summary:snap(),errors:__hostSmoke.errors,rejections:__hostSmoke.rejections,ownerIdentity:originalIdentity,count,after:game.players.length};
   }catch(e){window.__ownerAudit={rows,error:String(e.stack||e),errors:__hostSmoke.errors,rejections:__hostSmoke.rejections};}
  }};game.addGlobalSkill('__audit_spirit_owner');
 }.toString()+')()');
 if(!await page.evaluate('!!_status.auto'))await clickElement('ui.auto');
 await until('window.__ownerAudit?.rows','native spirit owner boundary chain',45000);
 const data=await page.evaluate('window.__ownerAudit');for(const row of data.rows)check(row.name,row.passed,row.detail);check('full native spirit chain completes without runtime rejection',!data.error&&!data.errors.length&&!data.rejections.length,data);fs.writeFileSync(path.join(out,'native-owner-chain.json'),JSON.stringify(data,null,2));
 await page.send('Emulation.setDeviceMetricsOverride',{width:915,height:412,deviceScaleFactor:1,mobile:false});await delay(300);stage('native-spirit-owner-boundaries',{data,screenshot:await snap('native-spirit-owner-boundaries')});
}
`;
let s=fs.readFileSync(path.join(root,'tools/probe_host_smoke.mjs'),'utf8').replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(path.join(root,'tools',f)).href));
s=s.replace("show_splash:'off'","continue_name:['csh_pingfan'],player_number_mode_config_identity:'4',ban_identity_mode_config_identity:'zhu',ban_identity2_mode_config_identity:'nei',game_speed:'vvfast',show_splash:'off'");
s=s.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--audit-spirit-owner'))await auditSpiritOwner();\n    else if(process.argv.includes('--world-layout-410'))");
if(arg('--source')){const anchor="    const target = resolveReadOnly(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));";s=s.replace(anchor,'    if(decodeURIComponent(url.pathname)==="/extension/池子魔将/core/csh_aux_spirit.js"){item.status=200;res.writeHead(200,{"Content-Type":"text/javascript; charset=utf-8","Cache-Control":"no-cache"});return res.end(fs.readFileSync('+JSON.stringify(path.resolve(arg('--source')))+'));}\n'+anchor);}
const runner=path.join(out,'isolated-spirit-owner-runner.mjs');fs.writeFileSync(runner,tests+'\n'+s);const child=spawn(process.execPath,[runner,'--spirit','--audit-spirit-owner','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{if(code)process.exitCode=code;resolve();});});
}
