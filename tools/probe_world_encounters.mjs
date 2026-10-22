// Actual 149-person world, real player settlement APIs, shell stats and achievements.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';
import {webcrypto} from 'node:crypto';import {root,parse,walk} from './lib/skill_audit.mjs';
const option=(n,f)=>{const i=process.argv.indexOf(n);return i<0?f:process.argv[i+1];};
const read=f=>fs.readFileSync(path.join(root,f),'utf8');
const world=fs.readFileSync(option('--source',path.join(root,'core/csh_world.js')),'utf8');
const shell=fs.readFileSync(option('--shell',path.join(root,'core/csh_shell.js')),'utf8');
let build;walk(parse(shell),n=>{if(n.type==='FunctionDeclaration'&&n.id.name==='buildStats')build=shell.slice(...n.range);});
const clean=s=>s.replace(/^import .*?;.*\r?\n/gm,'').replace(/^export (const|function) /gm,'$1 ');
function harness(data=new Map()){
  const store={get length(){return data.size;},key:i=>[...data.keys()][i]??null,getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
  const ctx=vm.createContext({localStorage:store,crypto:webcrypto,TextEncoder,TextDecoder,btoa,atob,
    lib:{config:{},configprefix:'probe_',skill:{},translate:{}},game:{saveConfig(){},addGlobalSkill(){}},ui:{},get:{poptip:()=>''},ai:{},_status:{},cshVoices:{},
    window:{CSH:{},addEventListener(){}},document:{addEventListener(){}},console:{log(){},warn(){},error(){}},setTimeout(){return 1;},clearTimeout(){}});
  vm.runInContext(clean(read('character/index.js')).replace('export default','var cshCharacter ='),ctx);
  vm.runInContext(clean(read('core/csh_bossdata.js')),ctx);
  for(const f of ['core/csh_wallet.js','core/csh_achv.js'])vm.runInContext(clean(read(f)),ctx);
  vm.runInContext(clean(world),ctx);vm.runInContext(clean(read('core/csh_migrate.js')),ctx);
  vm.runInContext('var wallet=()=>lib.cshWallet;var buildStats='+build,ctx);
  const W=ctx.lib.cshWorld,AC=ctx.window.CSH_ACHV;
  return {ctx,data,store,W,AC,M:ctx.lib.cshMigrate,id:W.list()[0].id,other:W.list()[1].id,stats:()=>ctx.buildStats()};
}
const results=[];async function check(name,fn){try{const v=await fn();results.push({name,passed:v===true,detail:v===true?undefined:v});}catch(e){results.push({name,passed:false,detail:e.message});}}
await check('actual 149-person roster used',()=>harness().W.list().length===149);
await check('fresh world is not player table experience',()=>{const h=harness(),s=h.stats();return s.worldHands===0&&s.worldSkillTop===0&&s.playerOpponents===0;});
await check('fresh global high skill cannot unlock met-opponent awards',()=>{const h=harness();return !h.AC.evalAll(h.stats()).filter(r=>r.key.startsWith('skilltop_')).some(r=>r.done);});
await check('offline world games cannot create player experience',()=>{const h=harness();h.W.playRounds(8);const s=h.stats();return h.W.stats().hands>0&&s.worldHands===0&&s.worldSkillTop===0&&s.playerOpponents===0;});
await check('AI loss records a player win and one real encounter',()=>{const h=harness();h.W.settleLose(h.id,10);const p=h.W.byId(h.id).withPlayer;return p.hands===1&&p.wins===1&&p.losses===0&&h.stats().worldHands===1;});
await check('AI win records a player loss',()=>{const h=harness();h.W.settleWin(h.id,10);const p=h.W.byId(h.id).withPlayer;return p.hands===1&&p.wins===0&&p.losses===1;});
await check('UNO result direction follows actual AI outcome',()=>{const h=harness();h.W.settleResult(h.id,true);h.W.settleResult(h.other,false);return h.W.byId(h.id).withPlayer.losses===1&&h.W.byId(h.other).withPlayer.wins===1;});
await check('real draw records encounter without a winner',()=>{const h=harness();h.W.settlePlay(h.id,true);const p=h.W.byId(h.id).withPlayer;return p.hands===1&&p.draws===1&&p.wins===0&&p.losses===0;});
await check('unresolved departure records no invented win/loss/draw',()=>{const h=harness();h.W.settlePlay(h.id,false);const p=h.W.byId(h.id).withPlayer;return p.hands===1&&p.draws===0&&p.wins===0&&p.losses===0;});
await check('zero money movement cannot invent a win',()=>{const h=harness();h.W.settleLose(h.id,0);h.W.settleWin(h.id,0);return h.W.byId(h.id).withPlayer.hands===0;});
await check('unknown opponent cannot count',()=>{const h=harness();h.W.settleResult('foreign',false);return h.stats().worldHands===0;});
await check('distinct friends and recurring friend tracked independently',()=>{const h=harness();h.W.settlePlay(h.id);h.W.settlePlay(h.id);h.W.settlePlay(h.other);const s=h.stats();return s.worldHands===3&&s.playerOpponents===2&&s.playerFamiliar===2;});
await check('met-opponent skill is captured before settlement changes fund',()=>{const h=harness(),skill=h.W.byId(h.id).skill;h.W.settleLose(h.id,50000);return h.stats().worldSkillTop===skill;});
await check('later offline evolution cannot raise met-opponent skill record',()=>{const h=harness();h.W.settlePlay(h.id);const before=h.stats().worldSkillTop;h.W.playRounds(10);return h.stats().worldSkillTop===before;});
await check('revenge requires loss then win against same opponent',()=>{const h=harness();h.W.settleWin(h.id,10);h.W.settleLose(h.other,10);if(h.stats().playerRevenge!==0)return false;h.W.settleLose(h.id,10);return h.stats().playerRevenge===1;});
await check('win then loss does not falsely count chronological revenge',()=>{const h=harness();h.W.settleLose(h.id,10);h.W.settleWin(h.id,10);return h.stats().playerRevenge===0;});
await check('repeated comeback wins count one distinct revenge opponent',()=>{const h=harness();h.W.settleWin(h.id,10);for(let i=0;i<4;i++)h.W.settleLose(h.id,10);return h.stats().playerRevenge===1;});
await check('balanced rivalry uses wins and losses against same opponent',()=>{const h=harness();for(let i=0;i<3;i++)h.W.settleLose(h.id,10);for(let i=0;i<3;i++)h.W.settleWin(h.other,10);if(h.stats().playerBalanced!==0)return false;h.W.settleWin(h.id,10);return h.stats().playerBalanced===1;});
await check('read-only stats/news/list do not grow player records',()=>{const h=harness();h.W.settlePlay(h.id);const before=JSON.stringify(h.W.raw());h.stats();h.W.news();h.W.list();h.W.worldStory();return before===JSON.stringify(h.W.raw());});
await check('encounters survive module restart',()=>{const h=harness();h.W.settleWin(h.id,10);h.W.settleLose(h.id,10);const restarted=harness(h.data);return restarted.stats().worldHands===2&&restarted.stats().playerRevenge===1;});
await check('migration export/import preserves player encounters and chronology',async()=>{const h=harness();h.W.settleWin(h.id,10);h.W.settleLose(h.id,10);const code=await h.M.export(),ins=await h.M.inspect(code),target=harness();await target.M.import(code);return ins.ok&&target.stats().worldHands===2&&target.stats().playerRevenge===1;});
await check('old world total hands are not backfilled as player history',()=>{const h=harness(),raw=h.W.raw();raw.ai.forEach(a=>{a.hands=1000;delete a.withPlayer;});h.W.importRaw(raw);return h.W.stats().hands===149000&&h.stats().worldHands===0;});
await check('malformed encounter counters are safely normalized',()=>{const h=harness(),raw=h.W.raw();raw.ai[0].withPlayer={hands:-1,wins:20,losses:20,draws:20,skillTop:Infinity,revenge:true};h.W.importRaw(raw);const p=h.W.byId(h.id).withPlayer;return p.hands===0&&p.wins===0&&p.losses===0&&p.draws===0&&p.skillTop===0&&!p.revenge;});
await check('all 465 old keys retained and 28 meaningful definitions added',()=>{const h=harness(),old=JSON.parse(read('tools/fixtures/career_v4_0_9_ids.json'));return old.length===465&&h.AC.defs.length===493&&old.every(key=>h.AC.byKey(key))&&h.AC.selfTest().ok;});
for(const field of ['playerOpponents','playerFamiliar','playerRevenge','playerBalanced']){
  await check(field+' new family requires real threshold and preserves all tiers',()=>{const h=harness(),prefix={playerOpponents:'tablefriends_',playerFamiliar:'oldfriend_',playerRevenge:'revengefriend_',playerBalanced:'balancedfriend_'}[field],defs=h.AC.defs.filter(d=>d.key.startsWith(prefix));return defs.length>0&&defs.every(d=>{const goal=d.prog({})[1];return !h.AC.test(d,{[field]:goal-1})&&h.AC.test(d,{[field]:goal});});});
}
await check('actual player settlement unlocks first friend achievement',()=>{const h=harness();h.W.settlePlay(h.id);const row=h.AC.evalAll(h.stats()).find(r=>r.key==='tablefriends_1');return row.done&&row.cur===1;});
await check('revenge produces one visible stable world story',()=>{const h=harness();h.W.settleWin(h.id,10);h.W.settleLose(h.id,10);h.W.settleLose(h.id,10);const events=h.W.raw().history.filter(e=>e.kind==='playerrevenge'),news=h.W.news(20);return events.length===1&&news.some(n=>n.text.includes(h.W.byId(h.id).name))&&JSON.stringify(news)===JSON.stringify(h.W.news(20));});
await check('old friend milestone is narrated once at ten encounters',()=>{const h=harness();for(let i=0;i<11;i++)h.W.settlePlay(h.id);const e=h.W.raw().history.filter(e=>e.kind==='oldfriend');return e.length===1&&e[0].c===10&&h.W.news(20).some(n=>n.text.includes('10'));});
await check('new player stories survive portable migration',async()=>{const h=harness();h.W.settleWin(h.id,10);h.W.settleLose(h.id,10);const code=await h.M.export(),target=harness();await target.M.import(code);return target.W.raw().history.some(e=>e.kind==='playerrevenge')&&target.W.news(20).some(n=>n.text.includes(target.W.byId(h.id).name));});
await check('unrelated broke AI cannot unlock player-caused poverty award',()=>{const h=harness(),raw=h.W.raw();raw.ai.find(a=>a.id===h.other).fund=1;h.W.importRaw(raw);h.W.settleWin(h.id,10);return !h.AC.evalAll(h.stats()).filter(r=>r.key.startsWith('poorai_')).some(r=>r.done);});
await check('player-caused poverty records actual remaining funds after win',()=>{const h=harness(),raw=h.W.raw();raw.ai.find(a=>a.id===h.id).fund=300;h.W.importRaw(raw);h.W.settleLose(h.id,295);const s=h.stats();return s.playerFundMin===5&&s.playerFundWitness===1&&h.AC.evalAll(s).find(r=>r.key==='poorai_10').done;});
await check('player-caused poverty milestone survives recovery and migration',async()=>{const h=harness(),raw=h.W.raw();raw.ai.find(a=>a.id===h.id).fund=300;h.W.importRaw(raw);h.W.settleLose(h.id,295);h.W.settleWin(h.id,1000);const code=await h.M.export(),target=harness();await target.M.import(code);return target.stats().playerFundMin===5&&target.AC.evalAll(target.stats()).find(r=>r.key==='poorai_10').done;});
const failures=results.filter(r=>!r.passed);console.log(JSON.stringify({passed:results.length-failures.length,failed:failures.length,failures},null,2));process.exitCode=failures.length?1:0;
