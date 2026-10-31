// Real career HTML + achievement engine in fresh headless Chromium profiles.
// Only the host transport is simulated; no installed game data is accessed.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {root} from './lib/skill_audit.mjs';
import {withChromium} from './lib/chromium_audit.mjs';
const option=(n,f)=>{const i=process.argv.indexOf(n);return i<0?f:process.argv[i+1];};
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'csh-career-audit-'));
const out=option('--out',path.join(root,'docs/audit/ui/career-achievements'));fs.mkdirSync(out,{recursive:true});
let source=fs.readFileSync(option('--source',path.join(root,'games/career.html')),'utf8');
source=source.replace(/(src|href)="\.\.\/([^"]+)"/g,(_,attr,f)=>attr+'="'+pathToFileURL(path.join(root,f)).href+'"');
const mock=`<script>
window.auditHost={stats:{rank:2,merit:20,interactTotal:7,worldSkillTop:0.75},calls:[],queue:[],claims:[],hold:false};
CSH_ACHV.markClaimed('rank_1');
CSHPage.transport=function(){return {active:true,call(cmd,data,cb){
  const h=auditHost;h.calls.push({cmd,data});
  if(cmd==='shell-wallet')cb(true,{pc:500,pcPeak:500,rank:{rank:2,merit:20},world:{}});
  else if(cmd==='shell-world')cb(true,{ai:[],story:{},stats:{playerOpponents:3,playerHands:10,playerRevenge:1},news:[]});
  else if(cmd==='shell-stats'||cmd==='shell-career-sync'){const reply=(ok,stats)=>cb(ok,cmd==='shell-career-sync'?{ok,stats}:stats);if(h.hold)h.queue.push(reply);else reply(true,h.stats);}
  else if(cmd==='shell-ach-claim')h.claims.push({data,cb});
  else cb(false,null);
}};};
</script>`;
source=source.replace('<script>\n',mock+'<script>\n').replace('<script>\r\n',mock+'<script>\r\n');
// Expose existing functions only, without replacing their implementations.
const end=source.lastIndexOf('})();');
source=source.slice(0,end)+'window.auditCareer={refresh:renderAch,rows:()=>achRows};\n'+source.slice(end);
const cases=[['desktop',1200,820,1],['portrait',390,844,1],['landscape',915,412,1],['zoom',480,400,1.5]];
const all=[];
for(const [name,width,height,scale] of cases){
  const file=path.join(tmp,name+'.html');fs.writeFileSync(file,source);
  const rows=await withChromium({width,height,browser:option('--browser')},async send=>{
    await send('Page.navigate',{url:pathToFileURL(file).href});
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:scale,mobile:false});
    for(let i=0;i<160;i++){
      const r=await send('Runtime.evaluate',{expression:'!!window.auditCareer',returnByValue:true});
      if(r.result.value)break;
      await new Promise(r=>setTimeout(r,50));
    }
    const result=await send('Runtime.evaluate',{expression:`(()=>{
      const checks=[],check=(name,ok,detail)=>checks.push({name,passed:!!ok,detail});
      const $=s=>document.querySelector(s),keys=()=>[...document.querySelectorAll('#ach-grid .ach')].map(c=>c.dataset.key);
      const set=(id,value,event='change')=>{const node=$('#'+id);if(node){node.value=value;node.dispatchEvent(new Event(event,{bubbles:true}));}};
      const reset=()=>$('#ach-reset')?.click();
      try{
        check('real HTML script booted',!!window.auditCareer);
        if(!window.auditCareer)return checks;
        document.querySelector('[data-p="board"]').click();
        check('world page distinguishes actual player encounters',$('#bd-most').textContent.includes('结识 3 位牌友')&&$('#bd-most').textContent.includes('同桌 10 人次'));
        check('world page shows chronological revenge summary',$('#bd-most').textContent.includes('赢回来的对手有 1 位'));
        document.querySelector('[data-p="ach"]').click();
        check('all 493 existing and new definitions retained',CSH_ACHV.defs.length===493&&auditCareer.rows().length===493);
        check('initial render limited to 60 cards',keys().length===60);
        check('default recommends claimable before other states',auditCareer.rows().find(r=>r.key===keys()[0])?.done&&!auditCareer.rows().find(r=>r.key===keys()[0])?.claimed);
        check('show more visible while undisplayed targets remain',$('#ach-more')&&!$('#ach-more').hidden);
        $('#ach-more')?.click();check('next batch appended without duplicate keys',keys().length===120&&new Set(keys()).size===120);
        check('show more moves keyboard focus to first new target',document.activeElement===$('#ach-grid').children[60]?.querySelector('.adetail'));
        let guard=0;while($('#ach-more')&&!$('#ach-more').hidden&&guard++<10)$('#ach-more').click();
        check('every definition remains reachable through batches',keys().length===493&&new Set(keys()).size===493);
        check('show more hidden when exhausted',$('#ach-more')?.hidden&&getComputedStyle($('#ach-more')).display==='none');
        reset();const requests=auditHost.calls.filter(c=>['shell-stats','shell-career-sync'].includes(c.cmd)).length;
        set('ach-search','向 AI 扔出道具','input');
        check('search matches real conditions across 20 tiers',keys().length===20&&keys().every(k=>k.startsWith('interact_')));
        check('filtering does not request new host statistics',auditHost.calls.filter(c=>['shell-stats','shell-career-sync'].includes(c.cmd)).length===requests);
        set('ach-state','ready');check('combined state and keyword excludes incomplete tiers',keys().length>0&&keys().every(k=>auditCareer.rows().find(r=>r.key===k).done));
        reset();set('ach-state','claimed');check('claimed state includes historical claim',keys().length===1&&keys()[0]==='rank_1');
        check('claimed button disabled',$('#ach-grid .aclaim')?.disabled);
        reset();set('ach-state','todo');check('unfinished excludes claimed and ready',keys().length>0&&keys().every(k=>{const r=auditCareer.rows().find(r=>r.key===k);return !r.done&&!r.claimed;}));
        set('ach-search','不存在的目标xyz','input');check('empty search explains recovery',keys().length===0&&!$('#ach-empty')?.hidden&&!$('#ach-more')?.offsetHeight);
        reset();check('reset restores inputs and default batch',$('#ach-search')?.value===''&&$('#ach-state')?.value==='all'&&keys().length===60);
        const cat=[...document.querySelectorAll('#ach-cats button')].find(b=>b.textContent==='互动');cat?.click();
        check('category uses native pressed button and real subset',cat?.getAttribute('aria-pressed')==='true'&&keys().length===20);
        reset();set('ach-search','牌技上限','input');
        check('fractional progress remains legible',[...document.querySelectorAll('.alab')].some(n=>/0\\.75/.test(n.textContent)));
        reset();set('ach-sort','catalog');check('catalog order matches complete engine order',keys().every((k,i)=>k===auditCareer.rows()[i].key));
        const detail=$('#ach-grid .adetail');detail?.click();check('detail button shows actual condition',$('#ach-note').textContent.includes(CSH_ACHV.byKey('rank_1').desc));
        check('all card details are native keyboard buttons',[...document.querySelectorAll('#ach-grid .adetail')].every(n=>n.tagName==='BUTTON'&&n.type==='button'));
        reset();set('ach-state','ready');
        const claim=$('#ach-grid .aclaim'),key=$('#ach-grid .ach')?.dataset.key;
        claim?.click();claim?.click();check('double claim sends one request and stays pending',auditHost.claims.length===1&&claim.disabled&&/领取中/.test(claim.textContent));
        check('pending request does not mark claimed',!CSH_ACHV.claimed(key));
        auditHost.claims.shift()?.cb(false,{reason:'隔离失败'});
        check('failed ACK releases claim for retry',!$('#ach-grid .aclaim')?.disabled&&!CSH_ACHV.claimed(key));
        $('#ach-grid .aclaim')?.click();const pending=auditHost.claims.shift();
        check('retry uses same real key',pending?.data.key===key);
        if(pending){CSH_ACHV.markClaimed(key);pending.cb(true,{ok:true});}
        check('successful ACK removes claim from ready filter',!keys().includes(key)&&CSH_ACHV.claimed(key));
        check('filters survive wallet refresh',$('#ach-state')?.value==='ready');
        reset();auditHost.hold=true;auditCareer.refresh();auditCareer.refresh();
        const older=auditHost.queue.shift(),newer=auditHost.queue.shift();
        newer(true,{...auditHost.stats,interactTotal:17});older(true,{...auditHost.stats,interactTotal:1});
        check('late old statistics cannot replace newer progress',auditCareer.rows().find(r=>r.key==='interact_30000')?.cur===17);
        auditHost.hold=false;
        reset();set('ach-search','向 AI 扔出道具','input');
        const controls=[...document.querySelectorAll('.ach-controls input,.ach-controls select,.ach-controls button')];
        check('controls remain within viewport',controls.length===3&&controls.every(n=>{const r=n.getBoundingClientRect();return r.left>=-1&&r.right<=innerWidth+1;}),controls.map(n=>n.getBoundingClientRect().toJSON()));
        $('#ach-filters-toggle').click();
        const optional=[...document.querySelectorAll('#ach-refinements select,#ach-refinements button')];
        check('expanded filter controls remain reachable and within viewport',!$('#ach-refinements').hidden&&optional.length>2&&optional.every(n=>{const r=n.getBoundingClientRect();return r.width>0&&r.left>=-1&&r.right<=innerWidth+1;}));
        $('#ach-filters-toggle').click();
        check('no horizontal page overflow',document.documentElement.scrollWidth<=innerWidth+1);
        if(innerWidth<=600)check('portrait navigation preserves content width',$('#body').getBoundingClientRect().width>=innerWidth-2&&getComputedStyle($('#tabs')).flexDirection==='row');
        check('current cards contain complete readable conditions',[...document.querySelectorAll('#ach-grid .ach')].every(n=>n.querySelector('.adesc')?.textContent===CSH_ACHV.byKey(n.dataset.key)?.desc));
      }catch(e){check('real page execution',false,e.stack);}
      document.querySelectorAll('body>div').forEach(n=>{if(n!==document.querySelector('#app')&&n!==document.querySelector('#modal'))n.remove();});
      if($('#body'))$('#body').scrollTop=0;
      return checks;
    })()`,returnByValue:true});
    if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));
    const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));
    return result.result.value;
  });
  all.push(...rows.map(r=>({viewport:name,...r})));
}
fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(all,null,2)+'\n');
const failed=all.filter(r=>!r.passed);failed.forEach(r=>console.log('FAIL',r.viewport,r.name,r.detail||''));
console.log('Career achievement browser:',all.length-failed.length,'PASS /',failed.length,'FAIL');
process.exitCode=failed.length?1:0;
