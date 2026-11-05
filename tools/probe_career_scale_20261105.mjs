/* 生涯成就页 2000 条规模交互检查（交接第 7 节「2000条生涯页规模交互仍需完整检查」）。
   真实 games/career.html + 真实 core/csh_achv.js 的 2000 条定义，只模拟宿主传输；
   不访问安装数据，不冒充实体设备。重点：渐进加载能否走完全部 2000 条、筛选/排序/焦点是否仍正确、
   全量重绘代价、三种横屏是否溢出。 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from './lib/skill_audit.mjs';
import { withChromium } from './lib/chromium_audit.mjs';
import { auditTempRoot, removeAuditScratch } from './lib/audit_scratch.mjs';

const option = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const tmp = fs.mkdtempSync(path.join(auditTempRoot(), 'csh-career-scale-'));
process.once('exit', () => { try { removeAuditScratch(tmp); } catch (e) { console.warn('Audit cleanup:', e.message); } });
const out = option('--out', 'D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-next-update/b2/scale');
fs.mkdirSync(out, { recursive: true });

let source = fs.readFileSync(path.join(root, 'games/career.html'), 'utf8');
source = source.replace(/(src|href)="\.\.\/([^"]+)"/g, (_, attr, f) => attr + '="' + pathToFileURL(path.join(root, f)).href + '"');
const mock = `<script>
window.auditHost={calls:[],claims:[]};
CSHPage.transport=function(){return {active:true,call(cmd,data,cb){
  const h=window.auditHost;h.calls.push({cmd,data});
  if(cmd==='shell-wallet')cb(true,{pc:500,pcPeak:500,rank:{rank:2,merit:20},world:{}});
  else if(cmd==='shell-world')cb(true,{ai:[],story:{},stats:{playerOpponents:3,playerHands:10,playerRevenge:1},news:[]});
  else if(cmd==='shell-stats'||cmd==='shell-career-sync'){const stats={rank:2,merit:20,interactTotal:7,worldSkillTop:0.75};cb(true,cmd==='shell-career-sync'?{ok:true,stats}:stats);}
  else if(cmd==='shell-ach-claim')h.claims.push({data,cb});
  else cb(false,null);
}};};
</script>`;
source = source.replace('<script>\n', mock + '<script>\n').replace('<script>\r\n', mock + '<script>\r\n');
const end = source.lastIndexOf('})();');
source = source.slice(0, end) + 'window.auditCareer={rows:()=>achRows,limit:()=>achLimit,paint:paintAchGrid,refresh:renderAch,reset:()=>{achLimit=60;paintAchGrid();}};\n' + source.slice(end);
const file = path.join(tmp, 'career-scale.html');
fs.writeFileSync(file, source);

let result = null;
try {
	await withChromium({ width: 915, height: 412 }, async send => {
		const val = async expression => {
			const r = await send('Runtime.evaluate', { expression, returnByValue: true });
			if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
			return r.result.value;
		};
		await send('Page.navigate', { url: pathToFileURL(file).href });
		await send('Emulation.setDeviceMetricsOverride', { width: 915, height: 412, deviceScaleFactor: 1, mobile: false });
		for (let i = 0; i < 200; i++) {
			if (await val('!!window.auditCareer && auditCareer.rows().length===2000')) break;
			await new Promise(r => setTimeout(r, 50));
		}
		result = await val(`(()=>{
  const checks=[],check=(name,ok,detail)=>checks.push({name,passed:!!ok,...(ok?{}:{detail})});
  const $=s=>document.querySelector(s),keys=()=>[...document.querySelectorAll('#ach-grid .ach')].map(c=>c.dataset.key);
  const set=(id,value,event='change')=>{const n=$('#'+id);if(n){n.value=value;n.dispatchEvent(new Event(event,{bubbles:true}));}};
  const reset=()=>$('#ach-reset')?.click();
  const metrics={batches:0,maxRepaintMs:0,totalMs:0,defs:0,rows:0};
  try{
    document.querySelector('[data-p="ach"]').click();
    metrics.defs=CSH_ACHV.defs.length;metrics.rows=auditCareer.rows().length;
    check('real engine exposes all 2000 career definitions',metrics.defs===2000&&metrics.rows===2000,metrics);
    check('initial batch is bounded to 60 cards',keys().length===60&&auditCareer.limit()===60);
    check('remaining counter is honest at scale',$('#ach-more').textContent.includes('还有 1940 枚')&&$('#ach-results').textContent.includes('全部 2000 枚'),$('#ach-results').textContent);
    $('#ach-more').click();
    check('second batch has 120 unique cards and focus lands on first new card',keys().length===120&&new Set(keys()).size===120&&document.activeElement===$('#ach-grid').children[60]?.querySelector('.adetail'));
    reset();
    const t0=performance.now();let guard=0;
    while($('#ach-more')&&!$('#ach-more').hidden&&guard++<45){
      const one=performance.now();$('#ach-more').click();
      const cost=performance.now()-one;if(cost>metrics.maxRepaintMs)metrics.maxRepaintMs=cost;
      metrics.batches++;
    }
    metrics.totalMs=performance.now()-t0;
    const all=keys(),want=auditCareer.rows().map(r=>r.key);
    check('all 2000 definitions reachable through show-more',all.length===2000&&new Set(all).size===2000,all.length);
    check('no definition is lost or duplicated at full scale',new Set(want).size===2000&&new Set(all).size===new Set(want).size&&want.every(k=>new Set(all).has(k)));
    check('show more hidden when exhausted',!!$('#ach-more')?.hidden&&getComputedStyle($('#ach-more')).display==='none');
    check('show-more batch count matches 60-per-batch',metrics.batches===33,metrics);
    reset();check('reset returns to 60 cards',keys().length===60&&auditCareer.limit()===60);
    set('ach-state','claimed');
    const claimed=keys(),claimRows=auditCareer.rows().filter(r=>r.claimed);
    check('claimed filter stays correct over 2000 rows',claimed.length===Math.min(60,claimRows.length)&&claimed.every(k=>auditCareer.rows().find(r=>r.key===k).claimed));
    reset();set('ach-state','ready');
    check('ready filter excludes incomplete and claimed over 2000 rows',keys().every(k=>{const r=auditCareer.rows().find(x=>x.key===k);return r.done&&!r.claimed;}));
    reset();set('ach-sort','catalog');
    check('catalog sort matches engine order at scale',keys().every((k,i)=>k===auditCareer.rows()[i].key));
    reset();set('ach-search','不存在的目标xyz','input');
    check('empty result explains recovery without phantom cards',keys().length===0&&!$('#ach-empty')?.hidden&&$('#ach-more')?.hidden);
    reset();set('ach-search','功勋','input');
    const hits=auditCareer.rows().filter(r=>(r.label+' '+r.desc+' '+r.cat).toLocaleLowerCase().includes('功勋')).length;
    check('search count over 2000 rows matches engine filter',hits>60&&keys().length===60&&$('#ach-results').textContent.includes('匹配 '+hits+' 枚'),{hits,shown:keys().length});
    reset();
    const detail=$('#ach-grid .adetail'),first=auditCareer.rows()[0];
    detail?.click();
    check('detail expands for a real scale row',$('#ach-note').textContent.includes(first.desc)||!!document.querySelector('.ach-insight:not([hidden])'));
    check('all visible details are native keyboard buttons',[...document.querySelectorAll('#ach-grid .adetail')].every(n=>n.tagName==='BUTTON'&&n.type==='button'));
  }catch(e){checks.push({name:'probe threw',passed:false,detail:String(e&&e.stack||e)});}
  return {checks,metrics};
})()`);

		for (const [w, h] of [[640, 286], [915, 412], [1365, 768]]) {
			await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
			await new Promise(r => setTimeout(r, 120));
			const d = await val(`(()=>{const more=document.getElementById('ach-more'),grid=document.getElementById('ach-grid');return {w:innerWidth,h:innerHeight,scroll:document.documentElement.scrollWidth,moreH:more?more.getBoundingClientRect().height:0,cardH:grid&&grid.firstElementChild?grid.firstElementChild.getBoundingClientRect().height:0}})()`);
			result.checks.push({ name: w + 'x' + h + ' no horizontal overflow, 44px controls',
				passed: d.scroll <= w && d.moreH >= 44 && d.cardH > 0, ...(d.scroll <= w && d.moreH >= 44 && d.cardH > 0 ? {} : { detail: d }) });
		}
	});
} finally {
	removeAuditScratch(tmp);
}

const summary = {
	scope: 'Real career.html + real 2000-definition achievement engine in headless Chromium; simulated host transport only. No installed profile or physical device.',
	passed: result.checks.filter(c => c.passed).length,
	failed: result.checks.filter(c => !c.passed).length,
	metrics: result.metrics,
	checks: result.checks,
};
fs.writeFileSync(path.join(out, 'career-scale.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ ...summary, checks: result.checks.filter(c => !c.passed) }));
if (summary.failed) process.exitCode = 1;
