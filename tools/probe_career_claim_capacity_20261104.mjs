// Source transaction coverage for the 22 expanded ratio achievements. VM stores only.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {webcrypto} from 'node:crypto';import * as roster from '../core/csh_bossdata.js';import {root,parse,walk} from './lib/skill_audit.mjs';
const at=process.argv.indexOf('--out');if(at<0)throw Error('--out required');const out=path.resolve(process.argv[at+1]);fs.mkdirSync(out,{recursive:true});
function fixture(file){let src=fs.readFileSync(root+'/tools/'+file,'utf8').split('const checks=')[0].replace(/^import .*?;\r?\n/gm,'');src=src.replace(/const out='[^']*';fs.mkdirSync\(out,\{recursive:true\}\);/,'const out="unused";');const ctx=vm.createContext({fs,path,vm,webcrypto,root,parse,walk,console,...roster,roster,TextEncoder,TextDecoder,btoa,atob,process});vm.runInContext(src+'\nthis.makeFixture=make;',ctx);return ctx.makeFixture;}

const make=fixture('probe_career_player_unlocks_20261104.mjs'),checks=[],check=(name,x)=>checks.push({name,passed:!!x}),tick=async()=>{for(let i=0;i<16;i++)await Promise.resolve()};
function seed(kind){const h=make(),keys=h.ctx.window.CSH_ACHV.defs.map(d=>d.key),raw=JSON.parse(h.data.get('csh_wallet'));raw.careerClaims={};raw.careerUnlocks={v:1,baseline:true,entries:{}};keys.forEach((k,i)=>{if(!k.startsWith("skilltop_"))raw.careerUnlocks.entries[k]={observedAt:0};if(kind!=='legacy'&&(kind!=='mixed'||i<1000))raw.careerClaims[k]=1;});h.data.set('csh_wallet',JSON.stringify(raw));const legacy={};if(kind!=='wallet')keys.forEach((k,i)=>{if(kind==='legacy'||i>=1000)legacy[k]=1});h.data.set('csh_career_achv',JSON.stringify(legacy));return {h:make({data:h.data}),keys};}
for(const kind of ['wallet','legacy','mixed']){
 const {h,keys}=seed(kind);await tick();const payload=await h.M.export(),ex=await h.M.inspect(payload),wc=ex.data?.wallet?.careerClaims||{},lc=ex.data?.achv||{};
 check(kind+'/2000 definitions used, including two decimal IDs',keys.length===2000&&keys.includes('cx_ratio_killper_1.2'));
 check(kind+'/export retains every paid receipt across both stores',ex.ok&&keys.every(k=>wc[k]||lc[k]));
 const imported=make(),r=await imported.M.import(payload);await tick();const disk=JSON.parse(imported.data.get('csh_wallet')),old=JSON.parse(imported.data.get('csh_career_achv')||'{}');
 check(kind+'/actual import retains all paid receipts',r.ok&&keys.every(k=>disk.careerClaims?.[k]||old[k]));
 const before=imported.W.pc();check(kind+'/all 2000 repeat claims remain paid with zero reward',keys.every(k=>imported.W.claimCareer(k,imported.ctx.window.CSH_ACHV.byId(k).reward,'capacity replay').already)&&before===imported.W.pc());
 const reboot=make({data:imported.data});await tick();check(kind+'/last receipt remains paid after complete module restart',reboot.W.claimCareer(keys.at(-1),reboot.ctx.window.CSH_ACHV.byId(keys.at(-1)).reward,'after restart').already);
}
{
 const h=make(),raw=JSON.parse(h.data.get('csh_wallet'));raw.careerClaims={};for(let i=0;i<16385;i++)raw.careerClaims['future_career_'+i]=1;h.data.set('csh_wallet',JSON.stringify(raw));const seeded=make({data:h.data,start:false}),before=seeded.data.get('csh_wallet');let refused=false;try{await seeded.M.export()}catch{refused=true}check('oversized paid-receipt map refuses export rather than returning truncated backup',refused);check('refused oversized export leaves original wallet intact',seeded.data.get('csh_wallet')===before);
}

for(const kind of ['wallet','legacy']){
 const h=make(),raw=JSON.parse(h.data.get('csh_wallet')),claims={};for(let i=0;i<16384;i++)claims['future_career_'+i]=1;raw.careerClaims=kind==='wallet'?claims:{};h.data.set('csh_wallet',JSON.stringify(raw));h.data.set('csh_career_achv',JSON.stringify(kind==='legacy'?claims:{}));
 const seeded=make({data:h.data,start:false}),payload=await seeded.M.export(),ex=await seeded.M.inspect(payload);check(kind+'/exact 16384 boundary and unknown historical IDs preserved',ex.ok&&Object.keys(kind==='wallet'?ex.data.wallet.careerClaims:ex.data.achv).length===16384);
 if(kind==='legacy'){claims.future_career_16384=1;seeded.data.set('csh_career_achv',JSON.stringify(claims));let refused=false;try{await seeded.M.export()}catch{refused=true}check('oversized legacy map also refuses export without truncation',refused);}
}
{
 const h=make();check('every existing achievement ID is accepted by qualification validator',h.ctx.window.CSH_ACHV.defs.every(d=>{try{return !!h.bank.validateCareerUnlocks({v:1,baseline:true,entries:{[d.key]:{observedAt:0}}})}catch{return false}}));
}
{
 const old=vm.createContext({window:{}}),now=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(path.dirname(out)+'/before-csh_achv.js','utf8'),old);vm.runInContext(fs.readFileSync(root+'/core/csh_achv.js','utf8'),now);
 const a=old.window.CSH_ACHV.defs,b=now.window.CSH_ACHV.defs;check('all 2000 IDs, categories, rewards and predicate bodies preserved',a.length===b.length&&a.every((d,i)=>d.key===b[i].key&&d.cat===b[i].cat&&d.reward===b[i].reward&&String(d.prog).replace(/\r/g,'')===String(b[i].prog).replace(/\r/g,'')));
 const rows=[],ctx=vm.createContext({counter:{ratio:0},rewardFor:()=>1,addRow:r=>{rows.push(r);return true}}),src=fs.readFileSync(root+'/tools/achv_scale/gen_career_expand.mjs','utf8');vm.runInContext(src.slice(src.indexOf('const RATIOS ='),src.indexOf('/* ---------- 自检')),ctx);
 check('generator retains all 22 exact ratio IDs and numeric thresholds',rows.length===22&&rows.every(r=>{const d=now.window.CSH_ACHV.byId(r.key),s={[r.ratio.den]:r.ratio.minDen,[r.ratio.num]:r.ratio.minDen*r.ratio.goal};return d&&d.prog(s)[0]>=d.prog(s)[1]}));
 check('all six generated kill-per-game units match shipped corrected descriptions',rows.filter(r=>r.ratio.num==='wrKill').every(r=>{const d=now.window.CSH_ACHV.byId(r.key);return r.label===d.label&&r.desc===d.desc&&d.desc.includes(String(r.ratio.goal)+'人/局')&&!d.label.includes('%')}));
}
const failures=checks.filter(x=>!x.passed),result={scope:'Actual wallet/migration with 2000 real definition IDs and isolated synthetic paid receipts; no rewards newly earned.',passed:checks.length-failures.length,failed:failures.length,checks};fs.writeFileSync(out+'/results.json',JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:failures}));process.exitCode=failures.length?1:0;
