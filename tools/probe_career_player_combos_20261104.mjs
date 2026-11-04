// Source transaction coverage for the 22 expanded ratio achievements. VM stores only.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import * as roster from '../core/csh_bossdata.js';import {root,parse,walk} from './lib/skill_audit.mjs';
const at=process.argv.indexOf('--out');if(at<0)throw Error('--out required');const out=path.resolve(process.argv[at+1]);fs.mkdirSync(out,{recursive:true});
function fixture(file){let src=fs.readFileSync(root+'/tools/'+file,'utf8').split('const checks=')[0].replace(/^import .*?;\r?\n/gm,'');src=src.replace(/const out='[^']*';fs.mkdirSync\(out,\{recursive:true\}\);/,'const out="unused";');const ctx=vm.createContext({fs,path,vm,webcrypto,root,parse,walk,console,...roster,roster,TextEncoder,TextDecoder,btoa,atob,process});vm.runInContext(src+'\nthis.makeFixture=make;',ctx);return ctx.makeFixture;}

const make=fixture('probe_career_player_unlocks_20261104.mjs'),checks=[],check=(name,x)=>checks.push({name,passed:!!x}),tick=async()=>{for(let i=0;i<16;i++)await Promise.resolve()},entry=(h,k)=>h.W.careerUnlocks()?.entries[k],key='cx_combo_wins_games_0',base=1700000000000;
const definitionSource=fs.readFileSync(root+'/core/csh_achv.js','utf8');let rows=[];walk(parse(definitionSource),n=>{if(n.type==='VariableDeclarator'&&n.id?.name==='ROWS')rows=vm.runInNewContext('('+definitionSource.slice(...n.init.range)+')')});const fields=new Set(['wrGames','wrWin','wrLose','wrKill','wrChars','wrModes']),expected=rows.filter(r=>r.a&&r.a.every(a=>fields.has(a[0]))).map(r=>r.k);
function input(i){return {id:'player-combo-'+String(i).padStart(7,'0'),mode:'identity',win:true,kills:3,chars:['hero'+(i%120)],observedAt:base+i};}
function cumulative(n){const state={v:1,since:base+1,modes:{identity:{games:n,win:n,lose:0,kill:n*3}},chars:[],receipts:[]},names=new Set();for(let i=1;i<=n;i++){const d=input(i);names.add(d.chars[0]);state.receipts.push({id:d.id,payload:JSON.stringify(d),t:d.observedAt});}state.chars=Array.from(names).sort();return state;}
function seed(n=10999,start=true){const h=make(),raw=JSON.parse(h.data.get('csh_wallet'));raw.playerMatches=h.bank.compactPlayerMatches(cumulative(n));h.data.set('csh_wallet',JSON.stringify(raw));return make({data:h.data,start});}
{
 const h=seed(),pc=h.W.pc();check('10999 own results cannot satisfy 11000-win combination',!entry(h,key));const offset=h.writes.length,p=input(11000);h.bank.commitPlayerMatch(p,h.bank.saveEpoch());const disk=JSON.parse(h.writes.slice(offset).find(x=>x.k==='csh_wallet').v);await tick();
 check('first combination shares exact accepted personal wallet write',disk.careerUnlocks.entries[key]?.observedAt===p.observedAt&&disk.playerMatches.v===2&&entry(h,key)?.observedAt===p.observedAt);
 check('qualification feedback follows save without paying automatically',h.W.pc()===pc&&h.feedback.flatMap(x=>x.rows).filter(r=>r.id===key).length===1);
 h.bank.commitPlayerMatch(p,h.bank.saveEpoch());await tick();check('duplicate personal receipt does not repeat count or combination feedback',h.bank.playerMatches().modes.identity.games===11000&&h.feedback.flatMap(x=>x.rows).filter(r=>r.id===key).length===1);
 const reboot=make({data:h.data});await tick();check('whole module restart retains exact combined date quietly',entry(reboot,key)?.observedAt===p.observedAt&&reboot.feedback.length===0);
 const reward=h.ctx.window.CSH_ACHV.byId(key).reward,a=h.W.claimCareer(key,reward,'personal combo'),b=h.W.claimCareer(key,reward,'personal combo repeated');check('manual combination reward is paid once',entry(h,key)?.observedAt>0&&a.ok&&b.already&&h.W.pc()===pc+reward);
 const data=await h.M.export(),ex=await h.M.inspect(data);check('export retains exact date, compacted complete source and paid receipt',ex.ok&&ex.data.wallet.careerUnlocks.entries[key]?.observedAt===p.observedAt&&ex.data.wallet.playerMatches.receipts.length===11000&&ex.data.wallet.careerClaims[key]);const imported=make(),r=await imported.M.import(data);await tick();check('actual import preserves combined date and prevents repeat reward',r.ok&&entry(imported,key)?.observedAt===p.observedAt&&imported.W.claimCareer(key,reward,'after import').already);
}
{
 const h=seed(),before=h.data.get('csh_wallet'),p=input(11000);h.fault.key='csh_wallet';let refused=false;try{h.bank.commitPlayerMatch(p,h.bank.saveEpoch())}catch{refused=true}await tick();check('strict save refusal publishes neither source nor qualification nor feedback',refused&&h.data.get('csh_wallet')===before&&!entry(h,key)&&!h.feedback.flatMap(x=>x.rows).some(r=>r.id===key));
 const q=h.bank.pending.put('player-match',p.id,p);h.fault.key=null;h.bank.pending.retry();await tick();check('durable recovery keeps original personal source date',q.durable&&entry(h,key)?.observedAt===p.observedAt&&h.bank.playerMatches().modes.identity.games===11000);
}
{
 const h=seed(11000,false),reboot=make({data:h.data});await tick();check('late observer replays full compacted receipts to actual first crossing',entry(reboot,key)?.observedAt===input(11000).observedAt&&reboot.feedback.length===0);
}
{
 const h=make();h.lib.config.extension_池子魔将_winrateData={identity:{enemy:{games:999999,win:999999,kill:999999}},me:{chars:{hero:{games:999999}}}};h.O.adopted();h.O.start();await tick();check('table and enemy history cannot satisfy own combinations',expected.every(k=>!entry(h,k)));
 const old=h.bank.saveEpoch();h.bank.reloadSave({wallet:{pc:1000},rank:null,dailyTask:null},{memoryOnly:true});let refused=false;try{h.bank.commitPlayerMatch(input(11000),old)}catch{refused=true}check('previous save generation cannot publish combined eligibility',refused&&expected.every(k=>!entry(h,k)));
}
{
 const h=make(),state=cumulative(15000);check('all-threshold snapshot has complete validated own receipts',!!h.bank.validatePlayerMatches(h.bank.compactPlayerMatches(state)));const stamp=base+15000,p=h.O.preparePlayerMatch({...h.disk(),playerMatches:h.bank.compactPlayerMatches(state)},h.disk(),stamp);check('all 50 actual own-source combo definitions are covered',expected.length===50&&expected.every(k=>p.record.entries[k]?.observedAt===stamp));check('personal checkpoint does not qualify mixed-source combinations',!Object.keys(p.record.entries).some(k=>k.startsWith('cx_combo_')&&!expected.includes(k)));
}
const failures=checks.filter(x=>!x.passed),result={scope:'Actual wallet/observer/migration; validated synthetic own cumulative history and actual threshold commit, not natural long-term human play.',passed:checks.length-failures.length,failed:failures.length,checks};fs.writeFileSync(out+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:failures}));process.exitCode=failures.length?1:0;
