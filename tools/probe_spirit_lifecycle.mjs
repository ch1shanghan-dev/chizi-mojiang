import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import{webcrypto}from'node:crypto';import{fileURLToPath,pathToFileURL}from'node:url';
const arg=(n,d)=>{const i=process.argv.indexOf(n);return i<0?d:process.argv[i+1];},root=arg('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const {parse,walk}=await import(pathToFileURL(path.join(root,'tools/lib/skill_audit.mjs')));
const src=fs.readFileSync(arg('--source',path.join(root,'core/csh_aux_spirit.js')),'utf8').replace(/^import .*;\r?\n/gm,'');
const data='import {MINIONS,MINION_NAMES} from '+JSON.stringify(pathToFileURL(path.join(root,'core/csh_bossdata.js')).href)+';\nconst console={warn(){}};\n'+src;
const {installAuxSpirit}=await import('data:text/javascript;base64,'+Buffer.from(data).toString('base64'));
const old=fs.readFileSync(path.join(root,'tools/probe_aux_spirit.mjs'),'utf8').replace(/^import .*;\r?\n/gm,''),split=old.indexOf("for(const role of ['zhu'");
if(split<0)throw Error('Native fixture marker changed');const prefix=old.slice(0,split),body=old.slice(split,old.indexOf('const result={scope:'));
const extra=String.raw`
{
 const h=harness(),native=h.game.addPlayerOL,before=h.game.players.slice();let release,added;const gate=new Promise(r=>release=r);
 h.game.addPlayerOL=async function(...args){added=await native.apply(this,args);await gate;return added;};const pending=h.A.start();for(let i=0;i<5;i++)await Promise.resolve();
 const fresh=harness('zhu',4);h.game.players=fresh.game.players;h.game.me=fresh.game.me;h.game.playerMap=fresh.game.playerMap;const current=h.game.players.slice();release();const value=await pending;
 check('late spawn cannot remove or reposition any newer-table participant',!value&&h.game.players.length===4&&current.every((p,i)=>h.game.players[i]===p&&p.dataset.position===String(i)));
}
{
 const h=harness(),native=h.game.addPlayerOL;let release,entered;const gate=new Promise(r=>release=r);h.game.addPlayerOL=async function(...args){const p=await native.apply(this,args);p.draw=async()=>{entered=true;await gate;};return p;};const pending=h.A.start();for(let i=0;i<12&&!entered;i++)await Promise.resolve();
 const fresh=harness('zhu',3);h.game.players=fresh.game.players;h.game.me=fresh.game.me;const current=h.game.players.slice();release();const value=await pending;
 check('post-draw continuation checks session before announcing success',!!entered&&!value&&h.game.players.length===3&&current.every((p,i)=>h.game.players[i]===p));
}
{
 const h=harness(),native=h.game.addPlayerOL;let release;const gate=new Promise(r=>release=r);h.game.addPlayerOL=async function(...args){const p=await native.apply(this,args);await gate;return p;};const pending=h.A.start();for(let i=0;i<5;i++)await Promise.resolve();const fresh=harness('zhu',4);h.game.players=fresh.game.players;h.game.me=fresh.game.me;h.game.zhu=fresh.game.zhu;h.A.arm();const armed=h.A.current();release();await pending;
 check('old rollback leaves the newer assisted session and hooks active',h.A.current()===armed&&h.status.cshAssistedMatch===true&&h.game.players.length===4);
}
{
 const h=harness();delete h.game.swapControl;let value;try{value=h.A.arm();}catch{}check('missing scoped host hook refuses before setting assisted marker',value===null&&!h.status.cshAssistedMatch);
}
{
 const h=harness(),native=h.game.addPlayerOL,before=h.game.players.slice();let release,entered;const gate=new Promise(r=>release=r);h.game.addPlayerOL=async function(...args){const p=await native.apply(this,args);p.draw=async()=>{entered=true;await gate;};return p;};const pending=h.A.start();for(let i=0;i<12&&!entered;i++)await Promise.resolve();h.data.set('csh_migrate_recovery','{"v":1}');release();const value=await pending;
 check('recovery starting during entry cancels only the provisional guardian',!!entered&&!value&&h.game.players.length===before.length&&before.every(p=>h.game.players.includes(p)));
}
{
 const h=harness(),r=await h.A.start(),p=r.spirit;p.storage.cshAuxGuard=2;p.storage.cshAuxAid=1;p.storage.cshAuxRescue=true;const s=h.A.summary?.();check('public support summary reports exact finite remaining support',s&&s.guardLeft===1&&s.aidLeft===2&&s.rescueReady===false&&s.summoned);
 h.data.set('csh_migrate_recovery','{"v":1}');check('support pauses while save recovery owns the session',!h.lib.skill.csh_aux_guard.filter({player:h.game.me,num:2},p)&&!h.lib.skill.csh_aux_aid.filter({},p));
}
{
 const h=harness();h.A.arm();h.game.over(true);check('armed but never summoned terminal is cancelled without auxiliary victory',h.A.summary().state==='cancelled'&&h.W.assistedStats().wins===0&&h.A.summary().saved);
}
{
 const h=harness(),r=await h.A.start(),p=r.spirit;p.storage.cshAuxGuard=1;p.dead=true;check('dead guardian summary separates remaining stock from current usability',h.A.summary().state==='dead'&&!h.A.summary().supportActive&&h.A.summary().guardLeft===2);p.dead=false;check('revival restores only remaining stock without another summon',h.A.summary().state==='active'&&h.A.summary().guardLeft===2&&h.game.players.filter(x=>x._cshAuxSpirit).length===1);
 h.game.me.dead=true;check('owner death blocks support while guardian remains independently alive',h.A.summary().state==='owner-dead'&&!h.A.summary().supportActive&&h.A.summary().alive);
}
{
 const h=harness(),r=await h.A.start();h.game.me.identity='fan';check('owner identity change pauses support with visible reason',h.A.summary().state==='paused'&&h.A.summary().reason.includes('身份')&&!h.lib.skill.csh_aux_guard.filter({player:h.game.me,num:1},r.spirit));
}

`;
const box=vm.createContext({fs,vm,webcrypto,root,parse,walk,installAuxSpirit,process,console,TextEncoder,TextDecoder,btoa,atob});vm.runInContext(prefix,box);const result=await vm.runInContext('(async()=>{'+body+'\n'+extra+'\nreturn {passed:rows.filter(x=>x.passed).length,failed:rows.filter(x=>!x.passed).length,failures:rows.filter(x=>!x.passed),checks:rows};})()',box);
const out=arg('--out');if(out){fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'spirit-lifecycle.json'),JSON.stringify(result,null,2));}console.log(JSON.stringify({...result,checks:undefined},null,2));if(result.failed)process.exitCode=1;
