// Source transaction coverage for the 22 expanded ratio achievements. VM stores only.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import * as roster from '../core/csh_bossdata.js';import {root,parse,walk} from './lib/skill_audit.mjs';
const at=process.argv.indexOf('--out');if(at<0)throw Error('--out required');const out=path.resolve(process.argv[at+1]);fs.mkdirSync(out,{recursive:true});
function fixture(file){let src=fs.readFileSync(root+'/tools/'+file,'utf8').split('const checks=')[0].replace(/^import .*?;\r?\n/gm,'');src=src.replace(/const out='[^']*';fs.mkdirSync\(out,\{recursive:true\}\);/,'const out="unused";');const ctx=vm.createContext({fs,path,vm,webcrypto,root,parse,walk,console,...roster,roster,TextEncoder,TextDecoder,btoa,atob,process});vm.runInContext(src+'\nthis.makeFixture=make;',ctx);return ctx.makeFixture;}

const definitionSource=fs.readFileSync(root+'/core/csh_achv.js','utf8');let comboRows=[];walk(parse(definitionSource),n=>{if(n.type==='VariableDeclarator'&&n.id?.name==='ROWS')comboRows=vm.runInNewContext('('+definitionSource.slice(...n.init.range)+')')});const sourceFields=new Set(['gamblePlays','gambleWins','gambleNet','gambleBestStreak','gambleBest','gambleBust']);const expected=comboRows.filter(r=>r.a&&r.a.every(a=>sourceFields.has(a[0]))).map(r=>r.k);
const make=fixture('probe_career_gamble_unlocks.mjs'),checks=[],check=(name,x)=>checks.push({name,passed:!!x}),tick=async()=>{for(let i=0;i<16;i++)await Promise.resolve()},entry=(h,k)=>h.W.careerUnlocks()?.entries[k],source=h=>JSON.parse(h.data.get('csh_world')),first=['gmplay_gmwin','gmplay_gmnet','gmplay_gmstreak','gmwin_gmnet','gmwin_gmstreak','gmnet_gmstreak'].map(x=>'cx_combo_'+x+'_0');
const isCombo=k=>/^cx_combo_(gmplay_gmwin|gmplay_gmnet|gmplay_gmstreak|gmwin_gmnet|gmwin_gmstreak|gmnet_gmstreak)_\d+$/.test(k);
function seed(){const h=make(),raw=h.G.raw();raw.gambles={plays:1899,wins:214,bust:0,push:1685,streak:28,bestStreak:28,net:9999999,best:100000};delete raw.careerUnlocks;h.data.set('csh_world',JSON.stringify(raw));return make({data:h.data});}
{
 const h=seed(),pc=h.W.pc();check('before crossing neither combo qualification nor current predicate is met',first.every(k=>!entry(h,k)&&h.ctx.window.CSH_ACHV.byId(k).prog(h.lib.cshShell.stats({readOnly:true}))[0]===0));
 h.G.noteGamble(1);await tick();const s=source(h),stamp=s.careerUnlocks.entries[first[0]]?.observedAt;check('six source-local combinations share accepted source checkpoint and timestamp',stamp>0&&first.every(k=>s.careerUnlocks.entries[k]?.observedAt===stamp&&entry(h,k)?.observedAt===stamp));
 check('source commit causes exactly one feedback per newly qualified combo and no money',h.W.pc()===pc&&first.every(k=>h.feedback.flatMap(x=>x.rows).filter(r=>r.id===k).length===1));
 h.G.noteGamble(-20000000);await tick();check('net decline does not erase combined eligibility',stamp>0&&first.every(k=>entry(h,k)?.observedAt===stamp));const reboot=make({data:h.data});await tick();check('complete restart preserves combo dates without replay',stamp>0&&first.every(k=>entry(reboot,k)?.observedAt===stamp)&&reboot.feedback.length===0);
 const k='cx_combo_gmplay_gmnet_0',reward=h.ctx.window.CSH_ACHV.byId(k).reward,a=h.W.claimCareer(k,reward,'combo reward'),b=h.W.claimCareer(k,reward,'combo duplicate');check('fallen-net combo remains manually claimable exactly once',entry(h,k)?.observedAt>0&&a.ok&&b.already&&h.W.pc()===pc+reward);
 const ex=await h.M.inspect(await h.M.export());check('export retains original source and permanent combined dates',ex.ok&&stamp>0&&first.every(k=>ex.data.world.careerUnlocks.entries[k]?.observedAt===stamp&&ex.data.wallet.careerUnlocks.entries[k]?.observedAt===stamp));
}
{
 const h=seed(),before=h.data.get('csh_world');h.fault.key='csh_world';h.G.noteGamble(1);await tick();check('source failure publishes no combo record or feedback',h.data.get('csh_world')===before&&first.every(k=>!entry(h,k))&&!h.feedback.flatMap(x=>x.rows).some(r=>isCombo(r.id)));
 const q=JSON.parse(h.data.get(h.bank.pending.KEY)).entries[0];h.fault.key=null;h.bank.pending.retry();await tick();check('durable retry keeps original result time',q&&first.every(k=>entry(h,k)?.observedAt===q.data.t));
 const count=h.feedback.flatMap(x=>x.rows).filter(r=>isCombo(r.id)).length;h.bank.pending.put('gamble',q.id,q.data);h.bank.pending.retry();await tick();check('same accepted source receipt does not repeat combo feedback',h.feedback.flatMap(x=>x.rows).filter(r=>isCombo(r.id)).length===count);
}
{
 const h=seed();h.fault.key='csh_wallet';h.G.noteGamble(1);await tick();const s=source(h),stamp=s.careerUnlocks.entries[first[0]]?.observedAt;check('source accepted but aggregate refused retains proof without feedback',stamp>0&&first.every(k=>!entry(h,k))&&!h.feedback.flatMap(x=>x.rows).some(r=>isCombo(r.id)));
 const reboot=make({data:h.data});await tick();check('source-only reboot quietly recovers exact combined qualification dates',stamp>0&&first.every(k=>entry(reboot,k)?.observedAt===stamp)&&reboot.feedback.length===0);
}
{
 const h=make(),before=h.G.raw(),raw=h.G.raw();raw.gambles={plays:10000,wins:7000,bust:0,push:3000,streak:500,bestStreak:500,net:100000000000,best:100000000};check('all-threshold matrix uses a source shape accepted by actual world validator',h.G.reloadSave(raw));
 const p=h.O.prepareGamble(h.G.raw(),before,1700000000123),defs=expected.map(k=>h.ctx.window.CSH_ACHV.byId(k));check('all 54 actual same-source combo definitions receive exact source qualification',defs.length===54&&defs.every(d=>p.record.entries[d.key]?.observedAt===1700000000123));
 check('cross-source combinations stay outside gamble checkpoint',!Object.keys(p.record.entries).some(k=>k.startsWith('cx_combo_')&&!expected.includes(k)));
}

{
 const h=make(),raw=h.G.raw();raw.gambles={plays:10000,wins:7000,bust:0,push:3000,streak:500,bestStreak:500,net:100000000000,best:100000000};delete raw.careerUnlocks;h.data.set('csh_world',JSON.stringify(raw));const reboot=make({data:h.data});await tick();check('legacy high statistics qualify all 54 quietly with explicitly unknown date',expected.length===54&&expected.every(k=>entry(reboot,k)?.observedAt===0)&&reboot.feedback.length===0);
}
for(const mode of ['connectMode','video']){
 const h=seed();h.ctx._status[mode]=true;h.G.noteGamble(1);await tick();check('restricted mode does not collect new combinations '+mode,first.every(k=>!entry(h,k))&&!h.feedback.flatMap(x=>x.rows).some(r=>isCombo(r.id)));
}
const failures=checks.filter(x=>!x.passed),result={scope:'Actual source/wallet/observer/migration, simulated accepted results and validated high-threshold snapshot; not claimed natural long-term play.',passed:checks.length-failures.length,failed:failures.length,checks};fs.writeFileSync(out+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:failures}));process.exitCode=failures.length?1:0;
