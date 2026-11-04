// Reuse the existing actual world/shell harness; no copied settlement implementation.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {root} from './lib/skill_audit.mjs';
const original=fs.readFileSync(root+'/tools/probe_world_lifecycle.mjs','utf8'),mark='const tests=[];';if(!original.includes(mark))throw Error('World harness anchor missing');
const prefix=original.slice(0,original.indexOf(mark)).replace("from './lib/skill_audit.mjs'","from "+JSON.stringify(pathToFileURL(root+'/tools/lib/skill_audit.mjs').href));
const checks=String.raw`
const rows=[];function check(name,fn){try{rows.push({name,passed:fn()===true})}catch(e){rows.push({name,passed:false,error:e.message})}}
for(const won of[true,false])check('teammate own outcome and no money or player rivalry '+won,()=>{const h=harness('doudizhu'),id=h.W.list()[0].id;h.W.settleResult(id,false);h.W.settleResult(id,true);const a=h.W.byId(id),before=JSON.parse(JSON.stringify(a)),p=JSON.parse(JSON.stringify(a.withPlayer));const out=h.W.settleTeamResult(id,won),b=h.W.byId(id);return out._delta===0&&b.fund===before.fund&&b.hands===before.hands+1&&b.wins===before.wins+(won?1:0)&&b.withPlayer.hands===p.hands+1&&['wins','losses','draws','revenge','lowestFund'].every(k=>b.withPlayer[k]===p[k])});
for(const won of[null,undefined,0,1,'win'])check('invalid team outcome rejected '+String(won),()=>{const h=harness(),id=h.W.list()[0].id,before=JSON.stringify(h.W.raw());return h.W.settleTeamResult(id,won)===null&&before===JSON.stringify(h.W.raw())});
check('unknown teammate id rejected',()=>harness().W.settleTeamResult('not-in-world',true)===null);
check('cooperation only story never invents opponent advantage',()=>{const h=harness(),id=h.W.list()[0].id;h.W.settleTeamResult(id,true);const story=h.W.storylines(6).find(x=>x.id===id);return story&&story.text.includes('相识经历已记下')&&!story.text.includes('对方占了上风')&&h.p(id).wins===0&&h.p(id).losses===0});
const result={passed:rows.filter(x=>x.passed).length,failed:rows.filter(x=>!x.passed).length,checks:rows};const i=process.argv.indexOf('--out');if(i>=0)fs.writeFileSync(process.argv[i+1],JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(result.failed)process.exitCode=1;
`;
await import('data:text/javascript,'+encodeURIComponent(prefix+checks));
