// Non-table soft save: addGrudge strict transaction. Reuses the existing world harness.
// Reproduced before the fix by tools/diagnose_world_softsave_20261104.mjs (check 7).
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {root} from './lib/skill_audit.mjs';
const original=fs.readFileSync(root+'/tools/probe_world_lifecycle.mjs','utf8'),mark='const tests=[];';
const prefix=original.slice(0,original.indexOf(mark)).replace("from './lib/skill_audit.mjs'","from "+JSON.stringify(pathToFileURL(root+'/tools/lib/skill_audit.mjs').href));
const tests=String.raw`
const rows=[];const ck=(name,ok,detail)=>rows.push({name,passed:!!ok,...(!ok?{detail}:{})});
const fresh=()=>harness();
const idOf=h=>h.W.list()[0].id;
const disk=h=>h.data.get('csh_world');
const raw=h=>JSON.stringify(h.W.raw());
function refuse(h,mode){
  const set=h.ctx.localStorage.setItem;
  h.ctx.localStorage.setItem=(k,v)=>{
    if(k!=='csh_world')return set(k,v);
    if(mode==='throw')throw Error('isolated disk full');
    if(mode==='silent')return undefined;
    if(mode==='wrong')return set(k,JSON.stringify({broken:true}));
    return set(k,v);
  };
  return set;
}

/* 1. 正常写入：返回值、内存、磁盘三者一致 */
{
  const h=fresh(),id=idOf(h),before=h.W.grudge(id),hist=h.W.raw().history.length;
  const r=h.W.addGrudge(id,3);
  ck('正常写入返回新值',r===before+3,{r,before});
  ck('正常写入后 grudge 可读回',h.W.grudge(id)===before+3);
  ck('正常写入后内存与磁盘逐字节一致',raw(h)===disk(h));
  ck('未跨阈值不写世界动态',h.W.raw().history.length===hist);
}

/* 2. 拒写：绝不假成功，内存与磁盘都保持基线 */
{
  const h=fresh(),id=idOf(h),base=disk(h),snap=raw(h),before=h.W.grudge(id),hist=h.W.raw().history.length;
  const set=refuse(h,'throw');
  const r=h.W.addGrudge(id,5);
  ck('拒写返回 null，不返回已增加的值',r===null,{r});
  ck('拒写后 grudge 仍是原值',h.W.grudge(id)===before,{got:h.W.grudge(id),before});
  ck('拒写后磁盘字节不变',disk(h)===base);
  ck('拒写后公开内存保持基线',raw(h)===snap);
  ck('拒写后世界动态不增加',h.W.raw().history.length===hist);
  h.W.addGrudge(id,5);h.W.addGrudge(id,5);
  ck('连续三次拒写不累计',h.W.grudge(id)===before&&disk(h)===base&&raw(h)===snap);
  h.ctx.localStorage.setItem=set;
  const r2=h.W.addGrudge(id,5);
  ck('存储恢复后重试按原值只成功一次',r2===before+5&&h.W.grudge(id)===before+5,{r2});
}

/* 3. 静默丢写（setItem 不抛但没写进去）必须靠读回发现 */
{
  const h=fresh(),id=idOf(h),base=disk(h),snap=raw(h),before=h.W.grudge(id);
  refuse(h,'silent');
  const r=h.W.addGrudge(id,4);
  ck('静默丢写返回 null',r===null,{r});
  ck('静默丢写后内存保持基线',raw(h)===snap&&h.W.grudge(id)===before);
  ck('静默丢写后磁盘不变',disk(h)===base);
}

/* 4. 读回内容与写入不一致 */
{
  const h=fresh(),id=idOf(h),snap=raw(h),before=h.W.grudge(id);
  refuse(h,'wrong');
  const r=h.W.addGrudge(id,2);
  ck('读回不一致返回 null',r===null,{r});
  ck('读回不一致后内存保持基线',raw(h)===snap&&h.W.grudge(id)===before);
}

/* 5. 磁盘基线被外部有效更新：旧代次不许覆盖新档 */
{
  const h=fresh(),id=idOf(h),foreign=JSON.parse(disk(h));
  foreign.ai[0].fund=123;const foreignRaw=JSON.stringify(foreign);
  h.data.set('csh_world',foreignRaw);
  const r=h.W.addGrudge(id,2);
  ck('磁盘基线已变化时拒绝，不拿旧代次覆盖新档',r===null&&disk(h)===foreignRaw,{r,changed:disk(h)!==foreignRaw});
  ck('基线变化被拒后公开内存不动',JSON.parse(disk(h)).ai[0].fund===123);
}

/* 6. 跨 5/8 阈值的世界动态：只在接受后产生一次 */
{
  const h=fresh(),id=idOf(h),hist=h.W.raw().history.length;
  const set=refuse(h,'throw');
  h.W.addGrudge(id,8);
  ck('跨阈值拒写不留世界动态',h.W.raw().history.length===hist);
  h.ctx.localStorage.setItem=set;
  const r=h.W.addGrudge(id,8);
  ck('跨阈值成功恰记一条世界动态',r===8&&h.W.raw().history.length===hist+1,{r,hist,now:h.W.raw().history.length});
}

/* 7. 边界与成对模型不回归 */
{
  const h=fresh(),id=idOf(h);
  ck('恩怨上限 999',h.W.addGrudge(id,100000)===999);
  ck('恩怨下限 0',h.W.addGrudge(id,-100000)===0);
  ck('未知 id 返回 null',h.W.addGrudge('no_such_id',1)===null);
}
{
  const h=fresh(),id=idOf(h),other='another_target';
  const r=h.W.addGrudge(id,2,other);
  ck('显式 targetKey 生效且不算到玩家账上',r===2&&h.W.grudge(id,other)===2&&h.W.grudge(id)===0,{r,other:h.W.grudge(id,other),mine:h.W.grudge(id)});
}

/* 8. 静态口径：不能绕过四桌事务，也不能退回吞异常的 lsSet */
const src=fs.readFileSync(root+'/core/csh_world.js','utf8');
ck('保留四桌事务 / 心跳草稿统一落盘守卫',/tableCommitTime !== null \|\| heartbeatDraft/.test(src));
ck('独立写入用严格 setItem 并读回确认',/localStorage\.setItem\(K_WORLD, nextRaw\)/.test(src)&&/localStorage\.getItem\(K_WORLD\) !== nextRaw/.test(src));
ck('失败路径把公开内存还原到基线',/world = base;/.test(src));
ck('写盘前核对磁盘基线',/stored !== null && stored !== baseRaw/.test(src));

const passed=rows.filter(r=>r.passed).length,failed=rows.length-passed;
console.log(JSON.stringify({passed,failed,failures:rows.filter(r=>!r.passed)},null,2));
if(failed)process.exitCode=1;
`;
await import('data:text/javascript,'+encodeURIComponent(prefix+tests));
