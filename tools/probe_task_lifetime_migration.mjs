// Actual wallet/migration modules, isolated stores; no live player files or browser profiles.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {webcrypto,createHash} from 'node:crypto';
import {root,parse,walk} from './lib/skill_audit.mjs';
const at=process.argv.indexOf('--out');if(at<0)throw Error('External --out on D: required');const out=path.resolve(process.argv[at+1]);if(out.toLowerCase().startsWith(root.toLowerCase()+path.sep)||(process.platform==='win32'&&path.parse(out).root.toUpperCase().startsWith('C:')))throw Error('Use external D: result path');
const probe=fs.readFileSync(root+'/tools/probe_migration_failures.mjs','utf8');const before='const code=await portable();';if(!probe.includes(before))throw Error('migration harness anchor missing');const prefix=probe.split(before)[0].replace(/^import .*?;\r?\n/gm,'');
const outer=vm.createContext({fs,path,vm,root,parse,walk,process,console,webcrypto,TextEncoder,TextDecoder,btoa,atob,setImmediate});vm.runInContext(prefix+'\nthis.make=harness;',outer);const make=outer.make;
const checks=[],check=(name,passed,detail)=>checks.push({name,passed:!!passed,...(detail===undefined?{}:{detail})});const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function seed(h,lifetime){const raw=h.disk();raw.taskLifetime=lifetime;delete raw._sig;h.store.setItem('csh_wallet',JSON.stringify(raw));h.lib.cshWallet.reloadSave();h.lib.cshWallet.flushSave();return h.disk();}
function pack(body){const copy=JSON.parse(JSON.stringify(body));delete copy.meta.sum;copy.meta.sum=createHash('sha256').update(JSON.stringify(copy)).digest().subarray(0,8).toString('base64url');return 'CSHMIG1.'+Buffer.from(JSON.stringify(copy)).toString('base64url');}
{
 const h=make();check('real wallet exposes strict task lifetime validator',typeof h.lib.cshWallet.validateTaskLifetime==='function');
 const cleaned=h.M._clean.wallet({pc:1234});check('old wallet without lifetime remains unknown rather than guessing cumulative history',cleaned.taskLifetime===null);
 check('explicit null remains old-format compatible',h.M._clean.wallet({pc:1234,taskLifetime:null}).taskLifetime===null);
 const good={v:1,completed:27,fullDays:8},actual=h.M._clean.wallet({pc:1234,taskLifetime:good});check('real wallet cleaner preserves valid cumulative facts',same(actual.taskLifetime,good));
 good.completed=999;check('cleaner returns a detached cumulative record',actual.taskLifetime.completed===27);
 const upper={v:1,completed:1000000000,fullDays:333333333};check('safe upper bound survives cleaner without clamping',same(h.M._clean.wallet({pc:1234,taskLifetime:upper}).taskLifetime,upper));
 for(const [name,value]of [
  ['unknown version',{v:2,completed:3,fullDays:1}],['missing version',{completed:3,fullDays:1}],['array',[]],['string','3'],['missing count',{v:1,fullDays:0}],['negative count',{v:1,completed:-1,fullDays:0}],['fractional count',{v:1,completed:3.5,fullDays:1}],['string count',{v:1,completed:'3',fullDays:1}],['unsafe count',{v:1,completed:Number.MAX_SAFE_INTEGER+1,fullDays:0}],['above supported cap',{v:1,completed:1000000001,fullDays:0}],['negative full days',{v:1,completed:3,fullDays:-1}],['fractional full days',{v:1,completed:3,fullDays:.5}],['impossible full days',{v:1,completed:5,fullDays:2}],['non-finite',{v:1,completed:Infinity,fullDays:0}]
 ]){let refused=false;try{h.M._clean.wallet({pc:1234,taskLifetime:value})}catch{refused=true}check('invalid '+name+' is rejected instead of reset/clamped',refused)}
}
const source=make(),facts={v:1,completed:27,fullDays:8};seed(source,facts);source.store.setItem('csh_ddz_name','source-name');const code=await source.M.export(),parsed=await source.M.inspect(code);
check('real export/inspect preserves lifetime counts exactly',parsed.ok&&same(parsed.data.wallet.taskLifetime,facts));
check('lifetime stays nested in wallet rather than creating a separate migration domain',parsed.ok&&!Object.hasOwn(parsed.data,'taskLifetime')&&source.M.WHITELIST.every(k=>k!=='taskLifetime'));
{
 const target=make(),previous={v:1,completed:4,fullDays:1};seed(target,previous);const imported=await target.M.import(code);
 check('real import commits accepted source counts and adopts wallet memory',imported.ok&&same(target.disk().taskLifetime,facts));
 const archive=imported.backup&&JSON.parse(target.store.getItem('csh_mig_backup_'+imported.backup)||'null');check('import first archives exact prior cumulative facts',archive&&same(archive.wallet.taskLifetime,previous));
 const rolled=imported.backup?await target.M.rollback(imported.backup):{ok:false};check('real backup rollback restores exact prior counts rather than merging saves',rolled.ok&&same(target.disk().taskLifetime,previous));
}
{
 const target=make(),previous={v:1,completed:12,fullDays:3};seed(target,previous);let hit=false;target.store.fault=(op,k)=>op==='write'&&k==='csh_ddz_name'&&!hit&&(hit=true);
 const imported=await target.M.import(code);check('mid-import failure restores prior lifetime counts with original money',!imported.ok&&same(target.disk().taskLifetime,previous)&&target.W.pc()===2000&&target.M.recoveryState().pending===false,imported);
 target.store.fault=null;
}
{
 const body=JSON.parse(JSON.stringify(parsed.data));delete body.wallet.taskLifetime;const oldCode=pack(body),oldRead=await source.M.inspect(oldCode);check('checksum-valid old portable file without lifetime is accepted as unknown',oldRead.ok&&oldRead.data.wallet.taskLifetime===null);
 const target=make();seed(target,{v:1,completed:27,fullDays:8});const imported=await target.M.import(oldCode);check('old portable import does not carry the previous save cumulative count into a blank source',imported.ok&&(target.disk().taskLifetime==null||target.disk().taskLifetime.completed===0));
}
{
 const target=make(),previous={v:1,completed:15,fullDays:4};seed(target,previous);const before=target.store.getItem('csh_wallet'),body=JSON.parse(JSON.stringify(parsed.data));body.wallet.taskLifetime={v:2,completed:99,fullDays:33};const invalid=pack(body),inspection=await target.M.inspect(invalid);const imported=await target.M.import(invalid);
 check('checksum-valid unsupported lifetime version fails actual inspect',!inspection.ok&&inspection.err.includes('wallet'));
 check('invalid import leaves wallet bytes and cumulative facts unchanged and creates no backup',!imported.ok&&target.store.getItem('csh_wallet')===before&&same(target.disk().taskLifetime,previous)&&target.M.backups().length===0);
}
const result={scope:'Actual wallet and migration APIs with isolated LS/config and valid portable checksums; no player profile or natural match.',passed:checks.filter(r=>r.passed).length,failed:checks.filter(r=>!r.passed).length,checks};fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,failed:result.failed,failures:checks.filter(r=>!r.passed)},null,2));process.exitCode=result.failed?1:0;
