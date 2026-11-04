// Real wallet/engine/migration and extracted shell handlers; durable isolated storage only.
import fs from'node:fs';import path from'node:path';import vm from'node:vm';import{webcrypto}from'node:crypto';import{fileURLToPath,pathToFileURL}from'node:url';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];},root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..')),sourceRoot=arg('--source',root),out=arg('--out');if(!out)throw Error('External --out required');const{parse,walk}=await import(pathToFileURL(root+'/tools/lib/skill_audit.mjs').href);
const src=p=>fs.readFileSync(sourceRoot+'/core/'+p,'utf8'),clean=s=>s.replace(/^import .*?;.*\r?\n/gm,'');const checks=[],check=(n,yes,d)=>checks.push({name:n,passed:!!yes,...(!yes?{detail:d}:{})});
function storage(){const data=new Map();return{data,fail:'',readFail:'',get length(){return data.size;},key(i){return [...data.keys()][i]??null;},getItem(k){if(this.readFail===k)throw Error('isolated read');return data.get(k)??null;},setItem(k,v){if(this.fail===k)throw Error('isolated write');data.set(k,String(v));},removeItem(k){data.delete(k);}};}
let shell=src('csh_shell.js'),handlers={},realBuild;walk(parse(shell),n=>{if(n.type==='IfStatement'&&n.test.type==='BinaryExpression'&&n.test.left.name==='cmd'&&['shell-ach-claim','shell-ach-claim-all','shell-career-sync'].includes(n.test.right.value))handlers[n.test.right.value]=shell.slice(...n.range);if(n.type==='FunctionDeclaration'&&n.id.name==='buildStats')realBuild=shell.slice(...n.range).replace('function buildStats','function realBuildStats');});
function harness(store=storage()){
 const ctx=vm.createContext({localStorage:store,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,lib:{config:{},configprefix:'probe_',skill:{},translate:{}},game:{saveConfig(){},addGlobalSkill(){}},ui:{},get:{},ai:{},_status:{},console:{log(){},warn(){},error(){}},window:{CSH:{},addEventListener(){}},document:{addEventListener(){}},setTimeout(){return 1;},clearTimeout(){}});
 for(const p of['csh_wallet.js','csh_achv.js','csh_migrate.js'])vm.runInContext(clean(src(p)),ctx,{filename:p});
 vm.runInContext('var current="career",stats={pc:1000,pcPeak:1000,careerStatsReliable:true},acks=[],feedback=[];lib.cshUI={achievement:(rows,options)=>feedback.push({rows,options})};function wallet(){return lib.cshWallet;}function buildStats(){var s=Object.assign({},stats);if(lib.cshWallet.wallet.careerUnlocks)s.careerUnlocks=lib.cshWallet.wallet.careerUnlocks();return s;}function ackToGame(cmd,ok,data){acks.push({cmd,ok,data});}function paintPc(){}function presentAchievement(){}function shellToast(){}function fmt(n){return String(n);}',ctx);
 for(const [key,code]of Object.entries(handlers))vm.runInContext('function '+({'shell-ach-claim':'claim','shell-ach-claim-all':'bulk','shell-career-sync':'sync'}[key])+'(key){var cmd='+JSON.stringify(key)+',d={key:key};'+code+'}',ctx);
 return{ctx,store,W:ctx.lib.cshWallet.wallet,A:ctx.window.CSH_ACHV,M:ctx.lib.cshMigrate,call(n,k){ctx[n](k);return ctx.acks.at(-1);},row(k){return ctx.window.CSH_ACHV.evalAll(ctx.buildStats()).find(r=>r.key===k);}};
}
let h=harness();check('feature available',typeof h.W.syncCareerUnlocks==='function'&&typeof h.W.careerUnlocks==='function');
if(typeof h.W.syncCareerUnlocks==='function'){
 const balance=h.W.pc();let x=h.call('sync');check('first trusted snapshot persists baseline without rewards',x.ok&&h.W.careerUnlocks().baseline&&h.W.pc()===balance);check('legacy baseline is silent',h.ctx.feedback.length===0);check('baseline met entry has unknown date',h.W.careerUnlocks().entries.rich_1000?.observedAt===0);
 h.ctx.stats.pc=3000;h.ctx.stats.pcPeak=3000;x=h.call('sync');const entry=h.W.careerUnlocks().entries.rich_3000;check('new completion strictly persists first observed timestamp',x.ok&&entry?.observedAt>0);check('unlock feedback follows persistence and is not a claim',h.ctx.feedback.length===1&&h.ctx.feedback[0].options.kind==='unlock'&&h.ctx.feedback[0].rows.some(r=>r.id==='rich_3000')&&h.W.pc()===balance);
 h.ctx.stats.pc=100;let row=h.row('rich_3000');check('current value falls but saved completion remains',row.done&&row.recorded&&!row.conditionMet&&row.cur===100,row);check('single eligibility reads same permanent record',h.A.test(h.A.byId('rich_3000'),h.ctx.buildStats()));
 h.call('sync');const feedbackCount=h.ctx.feedback.length;h.call('sync');check('identical snapshot has no duplicate unlock feedback',h.ctx.feedback.length===feedbackCount&&h.ctx.feedback.flatMap(x=>x.rows).filter(x=>x.id==='rich_3000').length===1);
 const reload=harness(h.store);reload.ctx.stats.pc=100;check('whole module reload retains eligibility and time',reload.row('rich_3000').done&&reload.row('rich_3000').observedAt===entry.observedAt);
 let paid=reload.call('claim','rich_3000');check('actual shell single claim accepts saved completion after current fall',paid.ok&&paid.data.gained===h.A.byId('rich_3000').reward,paid);const pc=reload.W.pc();paid=reload.call('claim','rich_3000');check('actual wallet receipt prevents repeat payment',paid.ok&&paid.data.already&&reload.W.pc()===pc);
 const e=reload.M._clean.wallet(JSON.parse(h.store.getItem('csh_wallet')));check('real migration cleaner preserves record and date',e.careerUnlocks.entries.rich_3000.observedAt===entry.observedAt);check('old wallet without field stays uninitialized',reload.M._clean.wallet({pc:500}).careerUnlocks===null);
 const unknown={v:1,baseline:true,entries:{future_rule_001:{observedAt:0}}};check('valid unknown id survives cleaner without receiving a definition',reload.M._clean.wallet({pc:1,careerUnlocks:unknown}).careerUnlocks.entries.future_rule_001.observedAt===0&&!reload.A.byId('future_rule_001'));
 for(const bad of[{v:2,baseline:true,entries:{}},{v:1,baseline:false,entries:{}},{v:1,baseline:true,entries:[]},{v:1,baseline:true,entries:{x:{observedAt:-1}}},{v:1,baseline:true,entries:{x:{observedAt:1.5}}},JSON.parse('{"v":1,"baseline":true,"entries":{"__proto__":{"observedAt":0}}}')]){let rejected=false;try{reload.M._clean.wallet({pc:1,careerUnlocks:bad});}catch{rejected=true;}check('malformed record rejected '+JSON.stringify(bad),rejected);}
 h=harness();h.store.fail='csh_wallet';x=h.call('sync');check('failed baseline does not initialize or display unlock',!x.ok&&h.W.careerUnlocks()===null&&h.ctx.feedback.length===0);h.store.fail='';h.call('sync');h.ctx.stats.pc=3000;h.ctx.stats.pcPeak=3000;h.store.fail='csh_wallet';x=h.call('sync');check('failed new unlock has no memory adoption or feedback',!x.ok&&!h.W.careerUnlocks().entries.rich_3000&&h.ctx.feedback.length===0);h.store.fail='';h.call('sync');check('retry records exactly one real unlock',h.W.careerUnlocks().entries.rich_3000.observedAt>0&&h.ctx.feedback.length===1);
 h=harness();h.ctx.stats.careerStatsReliable=false;h.ctx.stats.pc=3000;x=h.call('sync');check('incomplete host stats cannot create baseline',!x.ok&&h.W.careerUnlocks()===null);h.ctx.stats.careerStatsReliable=true;h.ctx.current='texas';x=h.call('sync');check('other game cannot trigger career-open-only rules',!x.ok&&h.W.careerUnlocks()===null);
 h=harness();h.store.setItem('csh_career_achv',JSON.stringify({rich_3000:1}));x=h.call('sync');check('old paid but currently unmet id is silently historical',x.ok&&h.W.careerUnlocks().entries.rich_3000.observedAt===0&&h.ctx.feedback.length===0);check('old paid receipt is not repaid',h.call('claim','rich_3000').data.already);
 h=harness();h.store.readFail='csh_career_achv';x=h.call('sync');check('unreadable legacy claim source does not initialize history',!x.ok&&h.W.careerUnlocks()===null);h.store.readFail='';h.store.setItem('csh_career_achv','{bad');x=h.call('sync');check('damaged legacy claim source is not discarded/rebaselined',!x.ok&&h.W.careerUnlocks()===null);
 h=harness();h.call('sync');h.ctx.stats.pc=3000;h.ctx.stats.pcPeak=3000;h.call('sync');h.ctx.stats.pc=100;h.ctx.stats.pcPeak=100;const beforeBulk=h.W.pc(),bulk=h.call('bulk');check('actual shell bulk claim includes permanent completion',bulk.ok&&h.W.pc()>beforeBulk&&h.W.careerUnlocks().entries.rich_3000,bulk);const afterBulk=h.W.pc();h.call('bulk');check('bulk replay pays no additional rewards',h.W.pc()===afterBulk);
 check('engine keeps original zero-snapshot anti-fake self test',h.A.selfTest().ok,h.A.selfTest());
 h=harness();h.ctx.lib.cshWallet.reloadSave({wallet:{pc:2000,careerClaims:{rich_3000:0}},rank:{},dailyTask:{}},{memoryOnly:true});h.store.setItem('csh_career_achv',JSON.stringify({rich_3000:1}));h.call('sync');check('legacy truth is not overwritten by false wallet claim value',h.W.careerUnlocks().entries.rich_3000.observedAt===0&&h.ctx.feedback.length===0);
 h=harness();h.store.fail=h.ctx.lib.cshWallet.pending.KEY;h.ctx.lib.cshWallet.pending.put('match','volatile-career-adopt-0001',{mode:'identity',win:true,amount:300});const pendingBefore=h.ctx.lib.cshWallet.pending.status(),epoch=h.ctx.lib.cshWallet.saveEpoch();let rejected=false;try{h.ctx.lib.cshWallet.reloadSave({wallet:{pc:2000,careerUnlocks:{v:2,baseline:true,entries:{}}},rank:{},dailyTask:{}},{memoryOnly:true});}catch{rejected=true;}const pendingAfter=h.ctx.lib.cshWallet.pending.status();check('bad incoming record rejects before clearing volatile pending results',rejected&&pendingBefore.volatile===1&&pendingAfter.volatile===1&&pendingAfter.count===pendingBefore.count&&h.ctx.lib.cshWallet.saveEpoch()===epoch);
 h=harness();h.call('sync');h.ctx.stats.pc=3000;h.ctx.stats.pcPeak=3000;h.call('sync');const saved=JSON.parse(h.store.getItem('csh_wallet'));h.ctx.lib.cshWallet.reloadSave({wallet:{pc:2000},rank:{},dailyTask:{}},{memoryOnly:true});check('adopting old wallet does not keep prior in-memory unlocks',h.W.careerUnlocks()===null);h.ctx.lib.cshWallet.reloadSave({wallet:saved,rank:{},dailyTask:{}},{memoryOnly:true});check('adopting saved wallet restores exact first observed time',h.W.careerUnlocks().entries.rich_3000.observedAt===saved.careerUnlocks.entries.rich_3000.observedAt);
 h=harness();vm.runInContext(realBuild,h.ctx);check('real stats builder defers missing required modules',h.ctx.realBuildStats().careerStatsReliable===false);
 vm.runInContext('lib.cshWorld={list:()=>[],stats:()=>({}),gambleStats:()=>({})};lib.cshInteract={stats:()=>({playerThrows:0})};lib.cshBossRecord={summary:()=>({})};',h.ctx);check('real stats builder accepts initialized empty modules',h.ctx.realBuildStats().careerStatsReliable===true);
 h.ctx.lib.cshWorld.stats=()=>{throw Error('isolated stats read failure');};check('real stats builder marks read exception unreliable',h.ctx.realBuildStats().careerStatsReliable===false);
}

// Passive wallet collection: same durable write, deferred presentation, real chain witnesses.
function backgroundHarness(store=storage(),options={}){
 const h=harness(store);vm.runInContext(realBuild,h.ctx);
 vm.runInContext('lib.cshWorld={list:()=>[],stats:()=>({}),gambleStats:()=>({})};lib.cshInteract={stats:()=>({playerThrows:0})};lib.cshBossRecord={summary:()=>({})};lib.cshShell={stats:(options)=>realBuildStats(options)};',h.ctx);
 vm.runInContext(clean(src('csh_career_observer.js')),h.ctx,{filename:'csh_career_observer.js'});
 h.O=h.ctx.lib.cshCareerObserver;h.bank=h.ctx.lib.cshWallet;h.disk=()=>JSON.parse(h.store.getItem('csh_wallet')||'{}');
 h.flush=()=>h.bank.flushSave();if(options.start!==false)h.O.start();return h;
}
const feedbackTick=async()=>{await Promise.resolve();await Promise.resolve();};
{
 let b=backgroundHarness(),initial=b.W.pc();
 check('background start persists a silent historical baseline without opening the hall',b.W.careerUnlocks()?.baseline&&b.W.careerUnlocks().entries.rich_1000?.observedAt===0&&b.ctx.feedback.length===0&&b.W.pc()===initial);
 const walletComboKeys=new Set(),walletFields=new Set(['pc','pcPeak','streak']),definitionSource=src('csh_achv.js');walk(parse(definitionSource),n=>{if(n.type==='VariableDeclarator'&&n.id?.name==='ROWS')vm.runInNewContext('('+definitionSource.slice(...n.init.range)+')').forEach(r=>{if(r.a&&r.a.every(a=>walletFields.has(a[0])))walletComboKeys.add(r.k);});});
 let evaluated=[];b.A.defs.forEach(d=>{const original=d.prog;d.prog=function(stats){evaluated.push(d.key);return original(stats);};});
 b.W.add(2000,'fixture background gain');b.W.spend(2500,'fixture same batch spend');
 check('uncommitted eligibility stays out of permanent memory and disk',!b.W.careerUnlocks().entries.rich_3000&&!b.disk().careerUnlocks.entries.rich_3000&&b.ctx.feedback.length===0);
 check('background checks only indexed wallet rules, without scanning all career rules',walletComboKeys.size===27&&evaluated.length>0&&evaluated.every(k=>walletComboKeys.has(k)||b.A.byId(k).cat==='资产'||b.A.byId(k).cat==='签到'||b.A.byId(k).cat==='任务'||['egg_signed_first','egg_hungry','egg_rich_first','task_1','task_2','task_3','egg_task_full','egg_full_house'].includes(k)));
 const writes=[],put=b.store.setItem.bind(b.store);b.store.setItem=(k,v)=>{put(k,v);if(k==='csh_wallet')writes.push(JSON.parse(v));};
 check('same debounce batch commits successfully',b.flush());await feedbackTick();
 const recorded=b.W.careerUnlocks().entries.rich_3000;
 check('transient balance eligibility shares the first economic write',writes[0]?.pc===1500&&writes[0]?.careerUnlocks.entries.rich_3000?.observedAt>0);
 check('transient gain survives spending before the first flush',recorded?.observedAt>0&&b.W.pc()===1500&&b.ctx.feedback.some(f=>f.rows.some(r=>r.id==='rich_3000')));
 check('background collection never pays rewards',b.W.pc()===initial+2000-2500&&!b.disk().careerClaims?.rich_3000);
 b.flush();await feedbackTick();check('repeated persistence neither rewrites first time nor repeats feedback',b.W.careerUnlocks().entries.rich_3000.observedAt===recorded.observedAt&&b.ctx.feedback.flatMap(f=>f.rows).filter(r=>r.id==='rich_3000').length===1);
 const restart=backgroundHarness(b.store);check('permanent transient completion survives whole module reload',restart.W.pc()===1500&&restart.W.careerUnlocks().entries.rich_3000.observedAt===recorded.observedAt);
 const ack=restart.call('claim','rich_3000'),paidBalance=restart.W.pc();restart.call('claim','rich_3000');check('manual host claim after the balance falls pays exactly once',ack.ok&&ack.data.gained>0&&restart.W.pc()===paidBalance);

 b=backgroundHarness();b.W.add(4000,'fixture long batch');for(let i=0;i<600;i++){b.W.add(1,'fixture chain roll');b.W.spend(1,'fixture chain roll');}b.W.spend(5000,'fixture fall');b.flush();await feedbackTick();
 check('transient eligibility survives bounded chain eviction within a long debounce batch',b.W.pc()===1000&&b.W.careerUnlocks().entries.rich_3000?.observedAt>0);
 check('a same-batch peak remains true in the wallet as well as the achievement',b.disk().pcPeak===6001&&b.W.careerUnlocks().entries.peak_5000?.observedAt>0);
 b=backgroundHarness();b.W.spend(b.W.pc(),'fixture zero');b.W.add(500,'fixture recover');b.flush();await feedbackTick();
 check('zero-balance milestone survives an immediate recovery in the same batch',b.W.pc()===500&&b.W.careerUnlocks().entries.egg_hungry?.observedAt>0);

 b=backgroundHarness();const clock=vm.runInContext('Date',b.ctx);clock.now=()=>1700000000000;b.W.add(2000,'fixture failed write');
 b.store.fail='csh_wallet';check('failed flush returns failure',b.flush()===false);await feedbackTick();
 check('failed write adopts neither eligibility nor feedback',!b.W.careerUnlocks().entries.rich_3000&&!b.disk().careerUnlocks.entries.rich_3000&&b.ctx.feedback.length===0);
 clock.now=()=>1700000010000;b.W.spend(3000,'fixture decrease before retry');b.store.fail='';b.flush();await feedbackTick();
 check('retry retains the actual first observed time and transient witness',b.W.pc()===1000&&b.W.careerUnlocks().entries.rich_3000?.observedAt===1700000000000);

 b=backgroundHarness();const before=b.W.pc();b.store.fail='csh_wallet';let claim=b.W.claimCareer('fixture_reward',1500,'fixture reward');await feedbackTick();
 check('strict reward failure rolls back money, receipt and prepared eligibility',!claim.ok&&b.W.pc()===before&&!b.W.careerUnlocks().entries.rich_3000&&!b.disk().careerClaims?.fixture_reward&&b.ctx.feedback.length===0);
 b.store.fail='';claim=b.W.claimCareer('fixture_reward',1500,'fixture reward');await feedbackTick();
 check('strict reward retry atomically includes money, receipt and new eligibility',claim.ok&&b.W.pc()===3500&&b.disk().careerClaims.fixture_reward===1&&b.disk().careerUnlocks.entries.rich_3000?.observedAt>0);

 b=backgroundHarness();let market=b.W.commitMarket({hold:{}},1500,'fixture market return');await feedbackTick();
 check('market checkpoint commits use the same passive collector',market.ok&&b.disk().pc===3500&&b.disk().careerUnlocks.entries.rich_3000?.observedAt>0);
 b=backgroundHarness();let pool=b.W.claimPool('fixture_pool',1500,1,'fixture pool');await feedbackTick();
 check('pool reward commits use the same passive collector',pool.ok&&b.disk().pc===3500&&b.disk().careerUnlocks.entries.rich_3000?.observedAt>0);
 b=backgroundHarness();let signed=b.bank.sign();b.flush();await feedbackTick();
 check('sign-in collection records the real committed streak',signed.ok&&b.disk().streak===1&&b.disk().careerUnlocks.entries.egg_signed_first?.observedAt>0);

 b=backgroundHarness();b.W.add(2000,'fixture old save pending');const saved=JSON.parse(b.store.getItem('csh_wallet'));
 b.bank.reloadSave({wallet:saved,rank:{},dailyTask:{}},{memoryOnly:true});b.flush();await feedbackTick();
 check('save adoption invalidates old uncommitted witnesses',!b.W.careerUnlocks().entries.rich_3000&&b.W.pc()===2000&&b.ctx.feedback.length===0);
 b=backgroundHarness();b.W.add(2000,'fixture old callback');b.flush();const old=b.W.careerUnlocks().entries.rich_3000;
 b.bank.reloadSave({wallet:{pc:2000},rank:{},dailyTask:{}},{memoryOnly:true});await feedbackTick();
 check('late committed feedback is suppressed after save adoption',old.observedAt>0&&b.W.careerUnlocks()===null&&b.ctx.feedback.length===0);
 b.O.start();check('adopted legacy wallet establishes its own silent baseline',b.W.careerUnlocks()?.baseline&&!b.W.careerUnlocks().entries.rich_3000&&b.ctx.feedback.length===0);

 b=backgroundHarness();b.bank.reloadSave({wallet:{pc:2000},rank:{},dailyTask:{}},{memoryOnly:true});b.W.add(2000,'fixture first gain after import');b.W.spend(3000,'fixture first spend after import');b.flush();await feedbackTick();
 check('first new transient event after save adoption survives deferred baseline initialization',b.W.pc()===1000&&b.W.careerUnlocks()?.entries.rich_3000?.observedAt>0);
 b=backgroundHarness(storage(),{start:false});b.W.add(2000,'fixture before initialization');b.W.spend(3000,'fixture before initialization');b.flush();await feedbackTick();
 check('accepted transient events before initial readiness are captured without historical rewards',b.W.pc()===1000&&b.W.careerUnlocks()?.entries.rich_3000?.observedAt>0&&!b.disk().careerClaims?.rich_3000);
 b=backgroundHarness();b.store.setItem('csh_migrate_recovery','{}');b.W.add(2000,'fixture recovery locked');b.flush();await feedbackTick();
 check('recovery lock neither spends nor records background achievements',b.W.pc()===2000&&!b.W.careerUnlocks().entries.rich_3000&&b.ctx.feedback.length===0);
 b=backgroundHarness();b.ctx._status.connectMode=true;b.W.add(2000,'fixture network');b.flush();await feedbackTick();
 check('network mode suspends passive achievement collection',!b.W.careerUnlocks().entries.rich_3000&&b.ctx.feedback.length===0);
 b=backgroundHarness();b.ctx._status.video=true;b.W.add(2000,'fixture replay');b.flush();await feedbackTick();
 check('replays suspend passive achievement collection',!b.W.careerUnlocks().entries.rich_3000);

 b=backgroundHarness(storage(),{start:false});b.ctx.lib.cshWorld.stats=()=>{throw Error('fixture stats unavailable');};
 check('incomplete sources cannot establish a false historical baseline',!b.O.start()&&b.W.careerUnlocks()===null);
 b.ctx.lib.cshWorld.stats=()=>({});check('source recovery can retry initialization',b.O.start()&&b.W.careerUnlocks().baseline);
 b=backgroundHarness(storage(),{start:false});const actualStats=b.ctx.lib.cshShell.stats;b.ctx.lib.cshShell.stats=()=>Object.assign(actualStats(),{nightOwl:true});b.O.start();
 check('background startup cannot satisfy the career-hall-only night rule',!b.W.careerUnlocks().entries.egg_night_owl);
 b=backgroundHarness(storage(),{start:false});b.store.fail='csh_wallet';b.bank.task.add('hands',10);const beforeStart=b.W.pc(),waiting=b.bank.pending.status().count;b.store.fail='';
 check('passive baseline leaves pending task money and progress untouched',waiting>0&&b.O.start()&&b.W.pc()===beforeStart&&b.bank.pending.status().count===waiting&&!b.W.careerUnlocks().entries.task_1);
 b=backgroundHarness(storage(),{start:false});b.store.readFail='csh_daily_task';
 const taskKey=b.bank.KEYS.task;b.store.readFail=taskKey;
 check('valid durable task checkpoint does not depend on an unreadable mirror',b.O.start()&&b.W.careerUnlocks().baseline);
 b=backgroundHarness(storage(),{start:false});b.store.setItem('csh_career_achv','{bad');check('damaged legacy claims prevent background rebaselining',!b.O.start()&&b.W.careerUnlocks()===null);
}

// Migration snapshots must include accepted transient witnesses before save replacement.
// World adoption below is a deterministic fixture; wallet/migration functions are real.
{
 let b=backgroundHarness(storage(),{start:false});
 b.W.add(2000,'fixture live gain before ready');b.flush();await feedbackTick();
 check('prestart live gain has a dated unlock while historical assets stay unknown and silent',b.W.careerUnlocks()?.entries.rich_3000?.observedAt>0&&b.W.careerUnlocks()?.entries.rich_1000?.observedAt===0&&!b.ctx.feedback.flatMap(f=>f.rows).some(r=>r.id==='rich_1000'));
 b=backgroundHarness();b.bank.reloadSave({wallet:{pc:6000,pcPeak:6000,streak:3,lastSign:'2026-01-01'},rank:{},dailyTask:{}},{memoryOnly:true});
 b.W.add(8000,'fixture new gain before adopted save ready');b.flush();await feedbackTick();
 check('adopted wallet lower asset, peak and sign-in remain historical with no new feedback',['rich_3000','peak_5000','egg_signed_first'].every(k=>b.W.careerUnlocks()?.entries[k]?.observedAt===0)&&!b.ctx.feedback.flatMap(f=>f.rows).some(r=>['rich_3000','peak_5000','egg_signed_first'].includes(r.id)));
 check('adopted wallet new higher asset and peak keep real observed dates',b.W.careerUnlocks()?.entries.rich_8000?.observedAt>0&&b.W.careerUnlocks()?.entries.peak_12000?.observedAt>0);
 b=backgroundHarness(storage(),{start:false});b.W.spend(b.W.pc(),'fixture initial wallet emptied');b.flush();await feedbackTick();
 check('first spend preserves original historical asset and dates only new zero balance milestones',b.W.pc()===0&&b.W.careerUnlocks()?.entries.rich_1000?.observedAt===0&&b.W.careerUnlocks()?.entries.poor_0?.observedAt>0&&b.W.careerUnlocks()?.entries.egg_hungry?.observedAt>0);

 b=backgroundHarness();b.W.add(2000,'fixture transient before immediate export');b.W.spend(2500,'fixture fall before immediate export');
 const exported=await b.M.inspect(await b.M.export()),exportTime=b.W.careerUnlocks()?.entries.rich_3000?.observedAt;
 check('real immediate export includes the transient qualification and exact saved date',exported.ok&&exported.data.wallet.pc===1500&&exportTime>0&&exported.data.wallet.careerUnlocks.entries.rich_3000?.observedAt===exportTime);
 const source=backgroundHarness(),code=await source.M.export();
 b=backgroundHarness();b.ctx.lib.cshWorld.reloadSave=()=>true;b.W.add(2000,'fixture transient before import');b.W.spend(2500,'fixture fall before import');
 const imported=await b.M.import(code),archive=imported.backup&&JSON.parse(b.store.getItem('csh_mig_backup_'+imported.backup)||'null'),backupTime=archive?.wallet?.careerUnlocks?.entries.rich_3000?.observedAt;
 check('real import first backs up the accepted transient qualification',imported.ok&&archive?.wallet?.pc===1500&&backupTime>0,imported);
 const rolled=imported.backup?await b.M.rollback(imported.backup):{ok:false};await feedbackTick();b.O.start();await feedbackTick();
 check('real backup rollback restores the same balance and first observation',rolled.ok&&b.W.pc()===1500&&b.W.careerUnlocks()?.entries.rich_3000?.observedAt===backupTime,rolled);

 b=backgroundHarness(storage(),{start:false});b.ctx.lib.cshWorld.stats=()=>{throw Error('fixture pending retry stats unavailable');};
 let released=false,handled=0;const Q=b.bank.pending;
 Q.register('pool',()=>{if(!released)return{ok:false,reason:'fixture held'};handled++;b.W.add(2000,'fixture retried gain');b.W.spend(2500,'fixture retried fall');return b.flush()?{ok:true}:{ok:false,reason:'fixture wallet not durable'};});
 const queued=Q.put('pool','fixture_career_snapshot_retry_0001',{});
 check('snapshot retry source stays pending before release',queued.pending&&Q.status().count===1&&b.W.pc()===2000);
 released=true;let refused=false;try{await b.M.export();}catch{refused=true;}
 check('snapshot barrier runs after actual pending retry and refuses an unrecorded qualification',refused&&handled===1&&Q.status().count===0&&b.W.pc()===1500&&b.disk().pc===1500&&b.W.careerUnlocks()===null);
 const epoch=b.bank.saveEpoch(),blockedImport=await b.M.import(code);
 check('unready pending qualification blocks import before backup and save adoption',!blockedImport.ok&&b.bank.saveEpoch()===epoch&&b.M.backups().length===0&&b.W.pc()===1500,blockedImport);
 b.ctx.lib.cshWorld.stats=()=>({});const retried=await b.M.inspect(await b.M.export());
 check('source recovery exports the retained qualification without replaying pending money',retried.ok&&retried.data.wallet.careerUnlocks.entries.rich_3000?.observedAt>0&&handled===1&&b.W.pc()===1500);
}

// Integrity rejection precedes the historical origin captured for an adopted save.
{
 const b=backgroundHarness(),safe=b.disk();b.store.setItem(b.bank.KEYS.snap,JSON.stringify(safe));
 const bad=JSON.parse(JSON.stringify(safe));bad.pc=6000;delete bad.careerUnlocks;b.store.setItem(b.bank.KEYS.wallet,JSON.stringify(bad));
 const restored=b.bank.reloadSave();b.O.start();await feedbackTick();
 check('integrity rollback cannot seed wallet qualification from rejected raw balance',restored.action==='rollback'&&b.W.pc()===2000&&!b.W.careerUnlocks().entries.rich_3000,{restored,record:b.W.careerUnlocks()});
}

// Daily task qualification shares its real checkpoint/reward write, including date rollover.
function freezeTaskClock(b){vm.runInContext('var NativeTaskDate=Date;var taskClock=NativeTaskDate.now();Date=class extends NativeTaskDate{constructor(...args){super(...(args.length?args:[taskClock]))}static now(){return taskClock}};',b.ctx);}
function nextTaskDay(b){vm.runInContext('taskClock+=86400000;',b.ctx);}
{
 const b=backgroundHarness();freezeTaskClock(b);const initial=b.W.pc(),writes=[],put=b.store.setItem.bind(b.store);b.store.setItem=(k,v)=>{put(k,v);if(k==='csh_wallet')writes.push(JSON.parse(v))};
 b.bank.task.add('hands',10);await feedbackTick();const first=b.W.careerUnlocks().entries.task_1;
 const checkpoint=writes.find(w=>w.dailyTaskSaved?.hands===10);
 check('first daily qualification and its automatic task reward share the actual checkpoint write',first?.observedAt>0&&checkpoint?.careerUnlocks.entries.task_1?.observedAt===first.observedAt&&checkpoint.pc===initial+300&&checkpoint.dailyTaskSaved.claimed.includes('hands'));
 check('task collection does not prematurely unlock the second daily task',!b.W.careerUnlocks().entries.task_2&&!b.W.careerUnlocks().entries.egg_task_full);
 b.bank.task.add('wins',3);b.bank.task.add('bigPot',2000);await feedbackTick();const complete=b.W.careerUnlocks();
 check('all three tasks record their reachable career and full-day achievements', ['task_1','task_2','task_3','egg_task_full','egg_full_house'].every(k=>complete.entries[k]?.observedAt>0));
 check('background completion pays only the original daily task rewards',b.W.pc()===initial+300+500+800&&!b.disk().careerClaims?.task_1);
 check('daily-only definitions beyond the real three-task limit are not fabricated',!complete.entries.task_4&&!complete.entries.task_15);
 const counts=b.ctx.feedback.flatMap(f=>f.rows).filter(r=>r.id==='task_1').length;nextTaskDay(b);b.bank.task.ensureDay();b.flush();await feedbackTick();
 check('midnight resets daily progress while keeping the exact permanent task qualification',b.bank.task.peek().defs.every(d=>!d.done)&&b.W.careerUnlocks().entries.task_1.observedAt===first.observedAt&&b.ctx.feedback.flatMap(f=>f.rows).filter(r=>r.id==='task_1').length===counts);
 const saved=await b.M.inspect(await b.M.export());check('real next-day export includes all five exact task observation times',saved.ok&&['task_1','task_2','task_3','egg_task_full','egg_full_house'].every(k=>saved.data.wallet.careerUnlocks.entries[k].observedAt===complete.entries[k].observedAt));
 const before=b.W.pc(),claim=b.call('claim','task_1');b.call('claim','task_1');check('career task can be manually claimed after midnight exactly once',claim.ok&&claim.data.gained===b.A.byId('task_1').reward&&b.W.pc()===before+claim.data.gained);
}
{
 const b=backgroundHarness();const initial=b.W.pc();b.store.fail='csh_wallet';b.bank.task.add('hands',10);await feedbackTick();
 check('failed daily checkpoint records neither reward nor permanent task eligibility or feedback',b.W.pc()===initial&&!b.W.careerUnlocks().entries.task_1&&b.ctx.feedback.length===0&&b.bank.pending.status().count>0);
 b.store.fail='';b.bank.pending.retry();await feedbackTick();const stamp=b.W.careerUnlocks().entries.task_1?.observedAt,after=b.W.pc();b.bank.pending.retry();b.flush();await feedbackTick();
 check('real pending task retry commits qualification and pays daily reward once',stamp>0&&after===initial+300&&b.W.pc()===after&&b.W.careerUnlocks().entries.task_1.observedAt===stamp&&b.ctx.feedback.flatMap(f=>f.rows).filter(r=>r.id==='task_1').length===1);
 const restart=backgroundHarness(b.store);check('complete module reload retains the accepted task date without replaying feedback',restart.W.careerUnlocks().entries.task_1.observedAt===stamp&&restart.ctx.feedback.length===0&&restart.W.pc()===after);
}
{
 const b=backgroundHarness(storage(),{start:false});b.bank.task.add('hands',10);await feedbackTick();
 check('new committed task before initial readiness receives a live date, not historical zero',b.W.careerUnlocks()?.entries.task_1?.observedAt>0&&b.ctx.feedback.flatMap(f=>f.rows).some(r=>r.id==='task_1'));
}
{
 const source=backgroundHarness();source.bank.task.add('hands',10);source.bank.task.add('wins',3);source.bank.task.add('bigPot',2000);
 const raw=source.disk();delete raw.careerUnlocks;delete raw._sig;const date=new Date(raw.dailyTaskSaved.day+'T12:00:00');date.setDate(date.getDate()-1);raw.dailyTaskSaved.day=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
 const store=storage();store.setItem('csh_wallet',JSON.stringify(raw));store.setItem('csh_daily_task','{broken');const old=backgroundHarness(store);await feedbackTick();
 check('old prior-day task checkpoint quietly proves all five historical achievements without invented dates', ['task_1','task_2','task_3','egg_task_full','egg_full_house'].every(k=>old.W.careerUnlocks()?.entries[k]?.observedAt===0)&&old.ctx.feedback.length===0&&old.W.pc()===raw.pc,{record:old.W.careerUnlocks(),feedback:old.ctx.feedback,pc:old.W.pc(),expected:raw.pc,task:old.bank.task.peek(undefined,true)});
 check('current-day read-only task UI still resets the prior day and ignores broken mirror when checkpoint exists',old.bank.task.peek().defs.every(d=>!d.done));
 check('pre-rollover history keeps its actual task day while the current UI remains today',old.bank.task.origin().day===raw.dailyTaskSaved.day&&old.bank.task.peek().day!==raw.dailyTaskSaved.day);
}
{
 const b=backgroundHarness();b.store.fail='csh_wallet';b.bank.task.add('hands',10);b.store.fail='';b.bank.rank.addMerit(100000,'fixture rank changes before pending task retry');b.bank.pending.retry();await feedbackTick();const d=b.bank.task.peek().defs.find(d=>d.key==='hands');
 check('task paid at its original valid tier remains completed when rank raises the current goal',b.bank.rank.get().rank>=10&&d.claimed&&!d.done&&b.W.careerUnlocks().entries.task_1?.observedAt>0);
}
{
 const b=backgroundHarness();freezeTaskClock(b);b.store.fail='csh_wallet';b.bank.task.add('hands',10);nextTaskDay(b);b.store.fail='';b.bank.pending.retry();await feedbackTick();
 check('previous-day durable pending task result records eligibility when it is really paid after midnight',b.W.careerUnlocks().entries.task_1?.observedAt>0&&b.disk().dailyTaskSaved.claimed.includes('hands'));
 b.bank.task.ensureDay();check('a following day reset cannot erase that late accepted eligibility',!!b.W.careerUnlocks().entries.task_1&&b.bank.task.peek().defs.every(d=>!d.done));
}
{
 const b=backgroundHarness();b.ctx._status.video=true;b.bank.task.add('hands',10);await feedbackTick();check('replay mode does not collect new daily career qualification',!b.W.careerUnlocks().entries.task_1);
}
{
 const source=backgroundHarness(),code=await source.M.export(),b=backgroundHarness();b.bank.task.add('hands',10);const stamp=b.W.careerUnlocks().entries.task_1.observedAt;b.ctx.lib.cshWorld.reloadSave=()=>true;
 const imported=await b.M.import(code);await feedbackTick();b.O.start();
 check('actual import of another save clears prior task qualification instead of carrying it across generations',imported.ok&&!b.W.careerUnlocks()?.entries.task_1,imported);
 const rollback=imported.backup?await b.M.rollback(imported.backup):{ok:false};await feedbackTick();b.O.start();
 check('actual backup rollback restores the exact accepted task observation time',rollback.ok&&b.W.careerUnlocks()?.entries.task_1?.observedAt===stamp,rollback);
}
const result={scope:'Actual isolated wallet/achievement/migration modules and extracted real shell handlers; no player data or complete natural match',passed:checks.filter(x=>x.passed).length,failed:checks.filter(x=>!x.passed).length,checks};fs.mkdirSync(path.dirname(path.resolve(out)),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));process.exitCode=result.failed?1:0;
