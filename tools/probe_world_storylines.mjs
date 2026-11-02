import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {root,parse,walk} from './lib/skill_audit.mjs';
const prefix=fs.readFileSync(root+'/tools/probe_world_lifecycle.mjs','utf8').split('const tests=[];')[0].replace(/^import .*;\r?\n/gm,'');const outer=vm.createContext({fs,path,vm,root,parse,walk,process,console});vm.runInContext(prefix+'\nthis.make=harness;',outer);const make=outer.make,rows=[],check=(name,v)=>rows.push({name,passed:!!v});
{const h=make(),before=h.writes.length,a=h.W.storylines(3),b=h.W.storylines(3);check('stable bounded stories from real roster',a.length===3&&JSON.stringify(a)===JSON.stringify(b)&&a.every(r=>h.W.byId(r.id)?.name===r.name));check('reading stories never invents progress or writes',h.W.stats().playerHands===0&&h.writes.length===before&&a.every(r=>r.hands===0&&r.text.includes('尚未与你同桌')));check('limit is bounded',h.W.storylines(1000).length<=6);}
{const h=make(),id=h.W.storylines(1)[0].id;check('valid invitation selects real first opponent next table',h.W.inviteNext(id).ok&&h.W.seat(3,200)[0].id===id);check('invitation is consumed once',h.W.storylines(6).every(r=>!r.invited));check('unknown and prototype IDs refused',!h.W.inviteNext('__proto__').ok&&!h.W.inviteNext('missing').ok);}
{const h=make(),id=h.W.storylines(1)[0].id;h.W.inviteNext(id);h.W.seat(0,200);check('zero-seat queries never consume invitation',h.W.storylines(1)[0].invited);h.W.reloadSave(h.W.raw());check('save adoption clears ephemeral invitation',!h.W.storylines(1)[0].invited);}
{const h=make(),id=h.W.storylines(1)[0].id;h.W.settleResult(id,true);const row=h.W.storylines(1)[0];check('real meeting changes personal storyline',row.id===id&&row.hands===1&&!row.text.includes('尚未与你同桌'));h.storage.setItem('csh_migrate_recovery','broken');check('recovery blocks new invitation',!h.W.inviteNext(id).ok);}

function adoptActor(h,id,patch){const raw=h.W.raw();Object.assign(raw.ai.find(a=>a.id===id),patch);if(!h.W.reloadSave(raw))throw Error('fixture world adoption failed');}
// Invitation responses use only the adopted roster and the player's actual meetings.
{
 const h=make(),id=h.W.storylines(1)[0].id,a=h.W.byId(id),snapshot=JSON.stringify(h.W.raw()),writes=h.writes.length;
 const first=h.W.inviteNext(id),again=h.W.inviteNext(id);
 check('first invitation returns an in-character response and repeat keeps the same response',first.ok&&first.response.length>0&&!first.repeated&&again.repeated&&again.response===first.response);
 check('invitation and response never create meetings, world history or money',JSON.stringify(h.W.raw())===snapshot&&h.writes.length===writes);
 check('pending invitation stays visible at the head of the bounded story list',h.W.storylines(1)[0].id===id&&h.W.storylines(1)[0].response===first.response);
 check('cancel clears only ephemeral invitation and keeps all world facts',h.W.cancelInvite(id).ok&&h.W.storylines(6).every(r=>!r.invited)&&JSON.stringify(h.W.raw())===snapshot);
 check('duplicate cancellation is harmless',h.W.cancelInvite(id).already===true);
 const responses=new Set();for(const key of Object.keys(h.W.PERSONAS)){adoptActor(h,id,{persona:key});h.W.inviteNext(id);responses.add(h.W.storylines(1)[0].response);h.W.cancelInvite(id);}
 check('all twelve real personas have distinct response wording',responses.size===12);
}
{
 const h=make(),all=h.W.list(),first=all[0].id,second=all[1].id;
 h.W.inviteNext(first);h.W.inviteNext(second);const old=h.W.cancelInvite(first);
 check('stale cancel cannot cancel a later invitation',!old.ok&&h.W.storylines(1)[0].id===second&&h.W.storylines(1)[0].invited);
 adoptActor(h,first,{fund:500});h.W.inviteNext(second);const refused=h.W.inviteNext(first);
 check('cannot promise a player who cannot afford any normal table',!refused.ok&&refused.reason.includes('带入')&&h.W.storylines(1)[0].id===second);
 adoptActor(h,first,{fund:1000,retired:true});h.W.inviteNext(second);
 check('retired invite target is refused without replacing the existing request',!h.W.inviteNext(first).ok&&h.W.storylines(1)[0].id===second);
}
{
 const h=make(),id=h.W.storylines(1)[0].id,a=h.W.byId(id);adoptActor(h,id,{fund:1000});h.W.inviteNext(id);
 const rich=h.W.seat(2,200000);check('ineligible high-stakes table does not silently consume a small-table invitation',rich.every(r=>r.id!==id)&&h.W.storylines(1)[0].invited);
 const seated=h.W.seat(1,200);check('next eligible real seat consumes invitation and its reply exactly once',seated[0].id===id&&h.W.storylines(6).every(r=>!r.invited&&!r.response));
 h.W.inviteNext(id);h.W.reloadSave(h.W.raw());check('save adoption clears both pending invitation and its previous response',h.W.storylines(6).every(r=>!r.invited&&!r.response));
}
{
 const h=make(),id=h.W.storylines(1)[0].id,a=h.W.byId(id);
 adoptActor(h,id,{hands:9999,wins:8888});const fresh=h.W.inviteNext(id);check('AI autonomous hands do not imply personal history',fresh.response.startsWith('初次同桌'));h.W.cancelInvite(id);
 adoptActor(h,id,{withPlayer:{hands:3,wins:0,losses:0,draws:3}});let r=h.W.storylines(1)[0];check('draw-only personal meetings explicitly remain undecided',r.id===id&&r.title==='平局未了'&&r.text.includes('3次和局')&&!r.text.includes('占到上风'));
 check('draw-only invitation does not claim either side previously won',h.W.inviteNext(id).response.includes('还没分出胜负'));h.W.cancelInvite(id);
 adoptActor(h,id,{withPlayer:{hands:2,wins:0,losses:2}});check('response labels AI victories from the correct perspective',h.W.inviteNext(id).response.includes('我占了上风'));h.W.cancelInvite(id);
 adoptActor(h,id,{withPlayer:{hands:2,wins:2,losses:0}});check('response labels player victories from the correct perspective',h.W.inviteNext(id).response.includes('让你占了上风'));h.W.cancelInvite(id);
 adoptActor(h,id,{withPlayer:{hands:4,wins:2,losses:2}});check('both sides winning produces a mutual rivalry response',h.W.inviteNext(id).response.includes('你我都赢过'));
 adoptActor(h,id,{withPlayer:{hands:20,wins:10,losses:10}});check('long-standing personal acquaintance survives outcome-specific wording',h.W.inviteNext(id).response.startsWith('老牌友'));
}
{
 const h=make(),id=h.W.storylines(1)[0].id;h.W.inviteNext(id);
 for(const [obj,key]of [[h.ctx._status,'connectMode'],[h.ctx._status,'video'],[h.ctx.game,'online'],[h.ctx.game,'observe']]){obj[key]=true;check('restricted mode refuses invite and cancel: '+key,!h.W.inviteNext(id).ok&&!h.W.cancelInvite(id).ok&&h.W.storylines(1)[0].invited);obj[key]=false;}
 h.storage.setItem('csh_migrate_recovery','broken');check('recovery lock retains pending invitation when a cancellation is refused',!h.W.cancelInvite(id).ok&&h.W.storylines(1)[0].invited);
}
{
 const h=make(),id=h.W.storylines(1)[0].id,fund=h.W.byId(id).fund;h.W.inviteNext(id);h.W.settleLose(id,fund-500);
 const writes=h.writes.length;
 check('refresh discards an invitation whose person can no longer take a normal seat',h.W.storylines(6).every(r=>!r.invited)&&h.writes.length===writes);
 h.W.settleWin(id,2000);check('later funding does not resurrect a discarded invitation',h.W.storylines(6).every(r=>!r.invited));
}
// Actual settlement calls establish the orientation; do not infer it from field names.
{
 const h=make(),id=h.W.storylines(1)[0].id;h.W.settleWin(id,1000);
 check('real AI gain is a player loss and response names AI advantage',h.W.byId(id).withPlayer.losses===1&&h.W.inviteNext(id).response.includes('我占了上风')&&h.W.storylines(1)[0].text.includes('对方占了上风'));
 h.W.cancelInvite(id);h.W.settleLose(id,500);
 check('real opposing settlements describe player wins and losses explicitly',h.W.byId(id).withPlayer.wins===1&&h.W.storylines(1)[0].text.includes('你1胜、1负'));
 const other=make(),op=other.W.storylines(1)[0].id;other.W.settleLose(op,500);
 check('real AI loss is a player win and response names player advantage',other.W.byId(op).withPlayer.wins===1&&other.W.inviteNext(op).response.includes('让你占了上风')&&other.W.storylines(1)[0].text.includes('你占了上风'));
}
console.log(JSON.stringify({scope:'actual world, temporary stores, real player meeting data; no live player profile',passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).length,failures:rows.filter(r=>!r.passed)},null,2));if(rows.some(r=>!r.passed))process.exitCode=1;
