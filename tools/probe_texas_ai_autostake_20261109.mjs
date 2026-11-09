// P1 手册 §7：德州 AI 自主全额带入。复用现有 world harness，不另造引导层。
// 旧实现 normalStake = min(buyIn, floor(fund*0.3))：富 AI 自动全额、穷 AI 按比例，
// 完全没有「人物策略」。本探针锁住新的策略差异与资金硬约束。
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {root} from './lib/skill_audit.mjs';
const original=fs.readFileSync(root+'/tools/probe_world_lifecycle.mjs','utf8'),mark='const tests=[];';
const prefix=original.slice(0,original.indexOf(mark)).replace("from './lib/skill_audit.mjs'","from "+JSON.stringify(pathToFileURL(root+'/tools/lib/skill_audit.mjs').href));
const tests=String.raw`
const rows=[];const ck=(n,ok,d)=>rows.push({name:n,passed:!!ok,...(!ok?{detail:d}:{})});
const BUYIN=20000,MIN=200;
function seed(h,persona,fund,form,retireCount){
  const raw=h.W.raw();
  for(const a of raw.ai){a.persona=persona;a.fund=fund;a.form=form;a.retireCount=retireCount;a.retired=false;a.mood=0;}
  h.W.importRaw(raw);
}
const stakes=(h,n,buyIn)=>(h.W.seat(n,buyIn)||[]).map(s=>s.stake);
const all=(xs,fn)=>xs.length>0&&xs.every(fn);

/* 1. 资金中等（3 倍带入）时，人物策略才真正体现差异 */
{
  const h=harness();seed(h,'aggro',BUYIN*3,0.8,0);const xs=stakes(h,5,BUYIN);
  ck('激进牌风 + 手感好 + 资金足 → 自主全额带入',all(xs,x=>x===BUYIN),xs);
  ck('全额带入不超过玩家带入、不超过自己资金',all(xs,x=>x<=BUYIN&&x<=BUYIN*3),xs);
  ck('全额带入后亏完仍留最低带入（不因单局立刻退隐）',all(xs,x=>BUYIN*3-x>=MIN),xs);
}
{
  const h=harness();seed(h,'tight',BUYIN*3,0.8,0);const xs=stakes(h,5,BUYIN);
  ck('保守牌风维持原短码基线（30% 资金）',all(xs,x=>x===Math.floor(BUYIN*3*0.3)),xs);
}
{
  const h=harness();seed(h,'aggro',BUYIN*3,0.2,0);
  ck('手感差时不敢全额',all(stakes(h,5,BUYIN),x=>x<BUYIN));
}
{
  const h=harness();seed(h,'aggro',BUYIN*3,0.8,1);
  ck('刚复出（有退隐史）时不敢全额',all(stakes(h,5,BUYIN),x=>x<BUYIN));
}
{
  const h=harness();seed(h,'aggro',BUYIN*1.5,0.8,0);
  ck('资金不足两倍带入时不敢全额',all(stakes(h,5,BUYIN),x=>x<BUYIN));
}
{
  const h=harness();seed(h,'aggro',BUYIN*2,0.8,0);const xs=stakes(h,5,BUYIN);
  ck('恰好两倍资金的边界允许全额',all(xs,x=>x===BUYIN),xs);
  ck('边界处仍不触碰退隐线',all(xs,x=>BUYIN*2-x>=MIN),xs);
}
{
  const h=harness();seed(h,'bluff',BUYIN*3,0.8,0);
  ck('高诈唬牌风同样敢全额',all(stakes(h,5,BUYIN),x=>x===BUYIN));
}
{
  const h=harness();seed(h,'math',BUYIN*3,0.8,0);
  ck('数学家牌风保持短码（策略有区分，不是一刀切）',all(stakes(h,5,BUYIN),x=>x<BUYIN));
}

/* 2. 全档位的硬约束：任何带入都不许超出真实余额或桌规 */
{
  const bad=[];
  for(const persona of ['aggro','tight','bluff','math','wild','chaser','trapper']){
    for(const fund of [BUYIN*1.1,BUYIN*2,BUYIN*3,BUYIN*10]){
      const h=harness();seed(h,persona,fund,0.8,0);
      for(const x of stakes(h,5,BUYIN)){
        if(x>BUYIN||x>fund||x<MIN||fund-x<MIN)bad.push({persona,fund,stake:x});
      }
    }
  }
  ck('7 种牌风 × 4 档资金：带入恒在桌规内、不超自有资金、亏完不退隐',bad.length===0,bad.slice(0,4));
}

/* 3. 确定性与豪赌桌隔离 */
{
  const h=harness();seed(h,'aggro',BUYIN*3,0.8,0);
  const a=stakes(h,5,BUYIN),b=stakes(h,5,BUYIN);
  ck('同状态重复调用结果一致（无随机、可解释）',a.length===b.length&&a.every((x,i)=>x===b[i]),{a,b});
}
{
  /* 豪赌池准入资金 ≥200 万，用 300 万才不会空池；此路径应完全不经 normalStake。 */
  const h=harness();seed(h,'aggro',3000000,0.8,0);
  const g=stakes(h,5,200000);
  ck('豪赌桌仍走独立 gambleStakeOf，不被普通桌策略改写',
    g.length>0&&all(g,x=>x<=Math.floor(3000000*0.6)&&x>=MIN),g);
}

/* 4. 静态口径：候选池过滤与实际返回必须用同一个函数 */
const worldSrc=fs.readFileSync(root+'/core/csh_world.js','utf8');
ck('seat() 实际返回调用 normalStake(a, buyIn)',/g\.stake : normalStake\(a, buyIn\)/.test(worldSrc));
ck('候选池过滤同样走 normalStake',/return normalStake\(a, buyIn\) >= AI_MIN_STAKE/.test(worldSrc));
ck('不再有重复写死的 30% 短码表达式',!/Math\.min\(buyIn, Math\.floor\(a\.fund \* 0\.3\)\)/.test(worldSrc));

/* 5. 改前基线：旧实现对激进 AI 无法全额，也没有任何策略差异 */
const legacy=(persona,fund,buyIn)=>Math.min(buyIn,Math.floor(fund*0.3));
ck('改前基线：人人 30% 短码，激进 AI 拿不到全额',legacy('aggro',BUYIN*3,BUYIN)!==BUYIN,{legacy:legacy('aggro',BUYIN*3,BUYIN)});
ck('改前基线：激进与保守完全同额（零策略）',legacy('aggro',BUYIN*3,BUYIN)===legacy('tight',BUYIN*3,BUYIN));

const passed=rows.filter(r=>r.passed).length,failed=rows.length-passed;
console.log(JSON.stringify({passed,failed,failures:rows.filter(r=>!r.passed)},null,2));
if(failed)process.exitCode=1;
`;
await import('data:text/javascript,'+encodeURIComponent(prefix+tests));
