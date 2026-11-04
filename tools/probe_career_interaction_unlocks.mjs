// Actual native throws + real interaction/wallet/observer/migration; disposable stores only.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import * as roster from '../core/csh_bossdata.js';import {root,host,parse,walk,keyOf} from './lib/skill_audit.mjs';
const at=process.argv.indexOf('--out');if(at<0)throw Error('External D: --out required');const out=path.resolve(process.argv[at+1]);if(process.platform==='win32'&&/^c:/i.test(out))throw Error('No C: test output');
const prefix=fs.readFileSync(root+'/tools/probe_boss_transactions.mjs','utf8').split('const rows=[];')[0].replace(/^import .*?;\r?\n/gm,'');const outer=vm.createContext({fs,path,vm,webcrypto,root,console,...roster,roster,TextEncoder,TextDecoder,btoa,atob});vm.runInContext(prefix+'\nthis.makeBase=harness;',outer);
const clean=s=>s.replace(/^import [\s\S]*?;\r?\n/gm,'').replace(/\bexport /g,''),read=p=>fs.readFileSync(root+'/core/csh_'+p+'.js','utf8');let build,nativeThrow;walk(parse(read('shell')),n=>{if(n.type==='FunctionDeclaration'&&n.id.name==='buildStats')build=read('shell').slice(...n.range).replace('function buildStats','function realBuildStats')});const native=fs.readFileSync(host+'/noname/library/element/player.js','utf8');walk(parse(native),n=>{if(n.type==='MethodDefinition'&&keyOf(n)==='throwEmotion')nativeThrow=native.slice(...n.range)});if(!nativeThrow)throw Error('Native throw missing');
function make(options={}){const h=outer.makeBase(options);h.ctx.EXTRA_LINES={};h.ctx.GEN_LINES={};h.ctx.ui={};h.ctx.get={attitude:()=>-2,translation:v=>v.name||String(v)};
 vm.runInContext('var visuals=0,nativeFails=false;class Player{constructor(id){this.playerid=this.name=id;this.alive=true;this.node={avatar:{}};}isIn(){return this.alive;}isUnderControl(){return !!this.controlled;}$throwEmotion(){visuals++;}chat(){}emotion(){}'+nativeThrow+'} var me=new Player("me"),npc=new Player("npc"),other=new Player("other");lib.element={Player};game.me=me;game.players=[me,npc,other];game.broadcastAll=function(fn,...args){if(nativeFails)throw Error("native failure");fn(...args)};_status.gameStarted=true;Array.prototype.randomGet=function(){return this[0]};',h.ctx);
 vm.runInContext(clean(read('achv')),h.ctx);h.ctx.wallet=()=>h.lib.cshWallet;h.ctx.projectBossCareer=h.ctx.careerSnapshot;vm.runInContext(build,h.ctx);h.lib.cshWorld={list:()=>[],stats:()=>({}),gambleStats:()=>({}),reloadSave:()=>true};
 vm.runInContext(clean(read('interact')),h.ctx);h.I=h.lib.cshInteract;h.I.install();h.lib.cshShell={stats:o=>h.ctx.realBuildStats(o)};h.feedback=[];h.lib.cshUI={achievement:(rows,options)=>h.feedback.push({rows,options})};vm.runInContext(clean(read('career_observer')),h.ctx);h.O=h.lib.cshCareerObserver;h.bank=h.lib.cshWallet;if(options.start!==false)h.O.start();h.send=(emotion='egg')=>vm.runInContext('me.throwEmotion(npc,'+JSON.stringify(emotion)+')',h.ctx);return h;}
const checks=[],check=(name,passed,detail)=>checks.push({name,passed:!!passed,...(!passed?{detail}:{})}),tick=async()=>{for(let i=0;i<8;i++)await Promise.resolve()},entry=(h,k)=>h.W.careerUnlocks()?.entries[k],disk=h=>JSON.parse(h.data.get('csh_player_interact')||'null'),Q=h=>h.bank.pending;
{
 const h=make(),pc=h.W.pc();h.send();const saved=disk(h),stamp=saved.careerUnlocks.entries.interact_1.observedAt;await tick();
 check('successful real native throw strictly saves total qualification and result receipt together',saved.total===1&&saved.receipts.length===1&&stamp>0&&h.ctx.visuals===1);
 check('passive aggregate keeps source date and original manual reward without a career page',entry(h,'interact_1')?.observedAt===stamp&&h.W.pc()===pc&&!h.disk().careerClaims?.interact_1);
 check('fresh interaction unlock feedback is emitted once after accepted aggregate',h.feedback.flatMap(x=>x.rows).filter(x=>x.id==='interact_1').length===1);
 for(const e of ['flower','wine','shoe'])h.send(e);await tick();check('all four native types count but under-threshold next milestone stays locked',disk(h).total===4&&!entry(h,'interact_5'));
 h.send();await tick();check('fifth distinct native action meets the existing threshold',disk(h).total===5&&entry(h,'interact_5')?.observedAt>0);
 const r=make({data:h.data});await tick();check('module restart retains exact date quietly',entry(r,'interact_1')?.observedAt===stamp&&disk(r).total===5&&r.feedback.length===0);
 const before=h.W.pc(),reward=h.ctx.window.CSH_ACHV.byId('interact_1').reward,paid=h.W.claimCareer('interact_1',reward,'manual interaction reward');h.W.claimCareer('interact_1',reward,'manual interaction reward');check('manual claim preserves original reward and pays only once',paid.ok&&h.W.pc()===before+reward);
}
{
 const h=make();h.fault.key='csh_player_interact';h.send();await tick();const job=JSON.parse(h.data.get(Q(h).KEY)).entries[0];
 check('source quota failure preserves completed native visual with no phantom progress',h.ctx.visuals===1&&disk(h)===null&&!entry(h,'interact_1')&&h.feedback.length===0&&Q(h).status().count===1&&job.kind==='interaction');
 h.ctx._status.over=true;h.fault.key=null;Q(h).retry();await tick();check('retry after game ends saves original action time without replaying a visual',disk(h).total===1&&entry(h,'interact_1')?.observedAt===job.data.t&&h.ctx.visuals===1&&Q(h).status().count===0);
 Q(h).put('interaction',job.id,job.data);Q(h).retry();await tick();check('replayed accepted receipt cannot increment total or replay feedback',disk(h).total===1&&h.ctx.visuals===1&&h.feedback.flatMap(x=>x.rows).filter(x=>x.id==='interact_1').length===1);
}
{
 const h=make();h.fault.key='csh_player_interact';h.send();const job=JSON.parse(h.data.get(Q(h).KEY)).entries[0],r=make({data:h.data});Q(r).retry();await tick();check('durable pending action survives module restart with original date and no replay',disk(r).total===1&&entry(r,'interact_1')?.observedAt===job.data.t&&r.ctx.visuals===0&&Q(r).status().count===0);
}
{
 const h=make();h.fault.key=Q(h).KEY;h.send();check('journal failure retains volatile intent and does not silently adopt source progress',Q(h).status().volatile===1&&disk(h)===null&&h.ctx.visuals===1);
 h.fault.key=null;Q(h).retry();await tick();check('volatile recovery records a native action once without repeating visual',disk(h).total===1&&entry(h,'interact_1')?.observedAt>0&&Q(h).status().count===0&&h.ctx.visuals===1);
}
{
 const h=make(),store=h.ctx.localStorage,remove=store.removeItem;store.removeItem=k=>{if(k===Q(h).KEY)throw Error('cleanup quota');return remove(k)};h.send();await tick();const stamp=entry(h,'interact_1')?.observedAt;
 check('accepted action receipt remains durable when journal cleanup fails',disk(h).total===1&&disk(h).receipts.length===1&&stamp>0&&Q(h).status().count===1);store.removeItem=remove;Q(h).retry();Q(h).retry();await tick();check('cleanup retry cannot duplicate source count or first date',disk(h).total===1&&entry(h,'interact_1')?.observedAt===stamp&&Q(h).status().count===0);
}
{
 const h=make();h.fault.key='csh_wallet';h.send();await tick();const stamp=disk(h).careerUnlocks.entries.interact_1.observedAt;check('aggregate failure retains exact source fact with no premature reward or feedback',stamp>0&&!entry(h,'interact_1')&&h.feedback.length===0);let blocked=false;try{await h.M.export()}catch{blocked=true}check('export blocks until accepted interaction qualification can aggregate',blocked);h.fault.key=null;h.bank.flushSave();await tick();check('aggregate retry restores source time once',entry(h,'interact_1')?.observedAt===stamp&&disk(h).total===1);
}
{
 const h=make();h.fault.key='csh_wallet';h.send();await tick();const stamp=disk(h).careerUnlocks.entries.interact_1.observedAt,r=make({data:h.data});await tick();check('source-only cold restart retains original date quietly',entry(r,'interact_1')?.observedAt===stamp&&r.feedback.length===0);
}
{
 const h=make({start:false}),stats=h.I.stats;h.I.stats=()=>{throw Error('not ready')};h.send();await tick();const stamp=disk(h).careerUnlocks.entries.interact_1.observedAt;check('before readiness accepted native action keeps source truth but no premature aggregate',stamp>0&&!entry(h,'interact_1'));h.I.stats=stats;h.O.start();await tick();check('readiness recovery preserves fresh date and emits feedback once',entry(h,'interact_1')?.observedAt===stamp&&h.feedback.flatMap(x=>x.rows).filter(x=>x.id==='interact_1').length===1);
}
{
 const data=new Map([['csh_player_interact',JSON.stringify({v:1,total:5})],['csh_wallet',JSON.stringify({pc:2000,pcPeak:2000,careerUnlocks:{v:1,baseline:true,entries:{}}})]]),h=make({data});await tick();check('known legacy actions initialize quietly with unknown historic date',entry(h,'interact_1')?.observedAt===0&&entry(h,'interact_5')?.observedAt===0&&h.feedback.length===0);h.send();await tick();check('next action does not relabel legacy achievements as newly earned',disk(h).total===6&&disk(h).careerUnlocks.entries.interact_5.observedAt===0&&h.feedback.length===0);
}
{
 const data=new Map([['csh_player_interact',JSON.stringify({v:1,total:29999})]]),h=make({data});h.send();await tick();const defs=h.ctx.window.CSH_ACHV.defs.filter(d=>d.cat==='互动').filter(d=>!/^cx_/.test(d.key));check('all twenty original interaction rules bind to reliable legacy and accepted native facts',defs.length===20&&defs.every(d=>entry(h,d.key))&&entry(h,'interact_30000')?.observedAt>0&&disk(h).total===30000);
}
{
 const h=make();h.send();await tick();const stamp=entry(h,'interact_1').observedAt,exported=await h.M.inspect(await h.M.export());check('real portable export preserves count exact source dates and deduplication receipt',exported.ok&&exported.data.playerInteract.total===1&&exported.data.playerInteract.careerUnlocks.entries.interact_1.observedAt===stamp&&exported.data.playerInteract.receipts.length===1&&exported.data.wallet.careerUnlocks.entries.interact_1.observedAt===stamp);
 const fresh=make();fresh.data.set("csh_player_interact",JSON.stringify({v:1,total:0}));const r=await h.M.import(await fresh.M.export());await tick();h.O.start();check('actual new-save import clears prior source qualification and old queued callbacks',r.ok&&h.I.stats().playerThrows===0&&!entry(h,'interact_1'));
 const rb=await h.M.rollback(r.backup);await tick();h.O.start();check('actual rollback restores exact qualification and receipt',rb.ok&&entry(h,'interact_1')?.observedAt===stamp&&disk(h).receipts.length===1);
}
{
 const h=make();h.send();await tick();const ex=await h.M.inspect(await h.M.export());for(const [field,value]of [['careerUnlocks',{v:2,baseline:true,entries:{}}],['receipts',['bad']]]){const body=JSON.parse(JSON.stringify(ex.data));body.playerInteract[field]=value;const r=await h.M.inspect('CSHMIG1.'+Buffer.from(JSON.stringify({meta:{v:1},...body})).toString('base64url'));check('malformed new source metadata is rejected by actual import cleaning '+field,!r.ok);}
 const before=h.I.careerRevision();h.data.set('csh_player_interact','{"v":1,"total":1,"receipts":["bad"]}');h.send();await tick();check('corrupt stored source refuses writes without fabricating progress or advancing revision',h.I.careerRevision()===before&&Q(h).status().count===1&&JSON.parse(h.data.get('csh_player_interact')).total===1);
}
for(const invalid of ['video','connectMode','over','not-started','observe','online','dead-source','dead-target','controlled-target','foreign-target','AI-source','helper','native-failure']){
 const h=make();if(invalid==='not-started')h.ctx._status.gameStarted=false;else if(invalid==='observe'||invalid==='online')h.game[invalid]=true;else if(invalid==='dead-source')h.ctx.me.alive=false;else if(invalid==='dead-target')h.ctx.npc.alive=false;else if(invalid==='controlled-target')h.ctx.npc.controlled=true;else if(invalid==='foreign-target')h.game.players=[h.ctx.me];else if(invalid==='native-failure')h.ctx.nativeFails=true;else h.ctx._status[invalid]=true;
 let threw=false;try{if(invalid==='AI-source')vm.runInContext('npc.throwEmotion(other,"egg")',h.ctx);else if(invalid==='helper')h.I.throw(h.ctx.me,h.ctx.npc,'egg');else h.send()}catch{threw=true}await tick();check('non-player or invalid source cannot create interaction qualification '+invalid,disk(h)===null&&!entry(h,'interact_1')&&Q(h).status().count===0&&(invalid!=='native-failure'||threw));
}
{
 const h=make();h.send('unknown');await tick();check('unsupported emotion retains native visual but does not count',h.ctx.visuals===1&&disk(h)===null);h.data.set('csh_migrate_recovery','blocked');h.send();check('persistent recovery guard preserves native visual and blocks new facts',h.ctx.visuals===2&&disk(h)===null&&Q(h).status().count===0);
}
{
 const h=make();h.lib.config['extension_池子魔将_csh_interact']=false;h.I.install();h.I.install();h.send();await tick();check('disabled AI chatter and repeated installation do not block or duplicate player facts',disk(h).total===1&&entry(h,'interact_1')?.observedAt>0);
 let scans=0;h.ctx.window.CSH_ACHV.defs.filter(d=>d.cat==='互动').forEach(d=>{const fn=d.prog;d.prog=s=>{scans++;return fn(s)}});h.W.add(10,'unrelated');h.bank.flushSave();await tick();check('unchanged interaction source is cached across unrelated wallet changes',scans===0,{scans});
}
{
 const h=make();h.send();const ex=await h.M.inspect(await h.M.export());check('immediate export includes exact accepted source and permanent qualification',ex.ok&&ex.data.playerInteract.careerUnlocks.entries.interact_1.observedAt===ex.data.wallet.careerUnlocks.entries.interact_1.observedAt);
}
const result={scope:'Actual native Player.throwEmotion with real interaction/wallet/observer/migration; isolated stores and injected failures, not physical device or natural full match.',passed:checks.filter(r=>r.passed).length,failed:checks.filter(r=>!r.passed).length,checks};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;
