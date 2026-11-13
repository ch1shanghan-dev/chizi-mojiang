/* PF-01 后半反例：成就通知按需回顾、跨重启归档、分页、换档隔离、容量与写失败保护。
   真实 csh_achievement_feedback.js 在 Chromium 中加载；仅用可控 storage/时钟/存档代次夹具，
   不访问钱包、成就进度或真实玩家档案。 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from './lib/skill_audit.mjs';
import { withChromium } from './lib/chromium_audit.mjs';
import { auditTempRoot, removeAuditScratch } from './lib/audit_scratch.mjs';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i < 0 ? d : process.argv[i + 1]; };
const out = arg('--out', 'D:/CodexWork/chizi-mojiang/workbuddy/outputs/wb-next-update/b1/archive');
fs.mkdirSync(out, { recursive: true });
const temp = fs.mkdtempSync(path.join(auditTempRoot(), 'csh-feedback-archive-'));
const source = fs.readFileSync(path.join(root, 'core/csh_achievement_feedback.js'), 'utf8').replace(/export /g, '');

const fixture = `
var stamp=100000,timers=new Map(),serial=0,store=new Map(),writes=[],errors=[],writeFail=false;
addEventListener('error',function(e){errors.push(e.message)});
var storage={getItem:function(k){return store.has(k)?store.get(k):null},
 setItem:function(k,v){if(writeFail&&k===ACHIEVEMENT_ARCHIVE_KEY)throw Error('quota');writes.push(k);store.set(k,String(v))},
 removeItem:function(k){store.delete(k)}};
var scope={owner:{},epoch:1,blocked:false},f=null,playing=false,scenario=0;
function mk(i){return {id:'arch-'+i,title:'成就 '+i,description:'展示记录，不涉及发奖。',rare:1,pc:1}}
function range(a,b){var out=[];for(var i=a;i<b;i++)out.push(mk(i));return out}
function boot(){if(f)f.destroy();f=createAchievementFeedback({document:document,window:window,storage:storage,
 scope:function(){return scope},isPlaying:function(){return playing},now:function(){return stamp},
 setTimeout:function(fn,ms){var id=++serial;timers.set(id,{fn:fn,at:stamp+ms});return id},
 clearTimeout:function(id){timers.delete(id)},z:9997,modal:9999});return true}
function getF(){return f}
function layer(id){var n=document.createElement('div');n.id=id;n.style.cssText='position:fixed;inset:0;z-index:20000';document.documentElement.appendChild(n);return n}
function tick(ms){var end=stamp+ms;while(true){var next=[...timers].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;stamp=next[1].at;timers.delete(next[0]);next[1].fn()}stamp=end}
function touch(type){document.getElementById('csh-ach-feedback').dispatchEvent(new PointerEvent(type,{bubbles:true,pointerType:'touch',pointerId:1,isPrimary:true}))}
function escape(){document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))}
function status(){var s=f.archiveStatus(),box=document.getElementById('csh-ach-inbox'),rows=null;
 try{rows=JSON.parse(store.get(ACHIEVEMENT_ARCHIVE_KEY)).rows}catch(e){}
 return {rows:s.rows,unread:s.unread,error:s.error,inbox:!!box,text:box?box.textContent:'',title:box?(box.title||''):'',
  hasKey:store.has(ACHIEVEMENT_ARCHIVE_KEY),firstId:rows&&rows.length?rows[0].id:null,
  ids:rows?rows.map(function(r){return r.id}):[],errorCount:errors.length,writes:writes.slice()}}
function clickText(t){var b=[...document.querySelectorAll('#csh-ach-review button')].find(function(n){return n.textContent===t});if(!b)throw Error('missing button '+t);b.click()}
function reviewText(){var r=document.getElementById('csh-ach-review');return r?r.textContent:''}
boot();
`;

const file = path.join(temp, 'index.html');
fs.writeFileSync(file, '<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#15241f;color:white}button{font-family:system-ui}</style><button id="under">原牌桌操作</button><script>' + source + fixture + '</script>');

const rows = [];
try {
	await withChromium({ width: 915, height: 412 }, async send => {
		const val = async expression => {
			const r = await send('Runtime.evaluate', { expression, returnByValue: true });
			if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
			return r.result.value;
		};
		const check = async (name, expr) => {
			const value = await val('(()=>{' + expr + '})()');
			rows.push({ name, passed: value === true, ...(value === true ? {} : { detail: value }) });
		};
		await send('Page.navigate', { url: pathToFileURL(file).href });
		for (let i = 0; i < 100 && !await val('typeof getF==="function" && !!getF()'); i++) await new Promise(r => setTimeout(r, 30));

		await check('1/first run archives notices without mounting a persistent overlay',
			'boot();getF().show(range(0,3));var s=status();return s.rows===3&&s.unread===3&&!s.inbox&&s.errorCount===0');
		await check('2/restart restores archive without a persistent overlay or a replay',
			'boot();var s=status();return s.rows===3&&s.unread===3&&!s.inbox&&!document.getElementById("csh-ach-feedback")&&s.hasKey&&s.errorCount===0');
		await check('3/archive review opens paged list of all three',
			'getF().archive();return !!document.getElementById("csh-ach-review")&&document.querySelectorAll("#csh-ach-review article").length===3&&reviewText().indexOf("第 1 / 1 页")>=0');
		await check('4/marking one entry read decrements unread in place',
			'clickText("标记已读");var s=status();return s.unread===2&&document.querySelectorAll("#csh-ach-review article").length===3');
		await check('5/read state survives restart',
			'boot();var s=status();return s.unread===2&&s.rows===3');
		await check('6/mark all read clears unread and survives restart',
			'getF().archive();clickText("全部标记已读");var a=status();boot();var b=status();return a.unread===0&&b.unread===0');
		await check('7/pagination exposes 20 rows per page and moves both ways',
			'getF().show(range(100,145));getF().archive();var p1=document.querySelectorAll("#csh-ach-review article").length,t1=reviewText();clickText("下一页");var p2=document.querySelectorAll("#csh-ach-review article").length,t2=reviewText();clickText("上一页");var t3=reviewText();return p1===20&&p2===20&&t1.indexOf("第 1 / 3 页")>=0&&t2.indexOf("第 2 / 3 页")>=0&&t3.indexOf("第 1 / 3 页")>=0');
		await check('8/archive keeps newest 200 and drops oldest, never a silent partial credential',
			'boot();getF().show(range(1000,1251));var s=status();return s.rows===200&&s.firstId==="arch-1250"&&s.ids.length===200');
		await check('9/re-showing the same id does not duplicate archive rows',
			'boot();var before=status().rows;getF().show([mk(1250)]);return status().rows===before');
		await check('10/switching save generation clears the old archive and keeps only new rows',
			'scope.epoch=2;getF().show([mk(2000)]);var s=status();return s.rows===1&&s.firstId==="arch-2000"&&s.unread===1&&s.ids.indexOf("arch-1250")<0&&!s.inbox');
		await check('11/storage write failure is reported, never an unhandled exception',
			'window.writeFail=true;getF().show([mk(3000)]);var s=status();window.writeFail=false;getF().archive();return !!s.error&&reviewText().includes("未保存")&&s.errorCount===0&&!s.inbox');
		await check('12/preferences and archive use separate keys; no reward storage writes',
			'getF().setPreferences({sound:true});var ui=JSON.parse(store.get("csh_achievement_ui_v1")),ar=JSON.parse(store.get(ACHIEVEMENT_ARCHIVE_KEY));var s=status();return ui.sound===true&&ar.v===1&&s.writes.every(function(k){return k==="csh_achievement_ui_v1"||k===ACHIEVEMENT_ARCHIVE_KEY})&&!store.has("csh_wallet")&&s.errorCount===0');
		await check('13/original this-run review is unchanged',
			'boot();getF().show(range(4000,4002));getF().review();return document.querySelectorAll("#csh-ach-review article").length===2&&reviewText().indexOf("本次运行最多保留200项")>=0');
		await check('14/touch end and cancellation leave the display clock running',
			'escape();boot();getF().show(range(5000,5002));touch("pointerdown");touch("pointerup");if(getF().status().paused)return false;touch("pointerdown");touch("pointercancel");tick(8001);return !getF().status().paused&&getF().status().current?.id==="arch-5001"');
		await val('boot();getF().show(range(6100,6102))');
		await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
		const touchPoint=await val('(()=>{const r=document.querySelector("#csh-ach-feedback h3").getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()');
		await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[touchPoint]});
		await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
		await send('Emulation.setTouchEmulationEnabled',{enabled:false});
		await check('14a/a native touchscreen tap on the card does not stall the next notice',
			'tick(8001);return !getF().status().paused&&getF().status().current?.id==="arch-6101"');
		await check('14b/hidden navigation and preferences cannot reserve modal space',
			'getF().review();var ok=[...document.querySelectorAll("#csh-ach-review [hidden]")].every(n=>getComputedStyle(n).display==="none"&&n.getClientRects().length===0);escape();return ok');
		for (const [id, playing] of [
			['csh-shell-overlay', false], ['csh-dbg-panel', false], ['csh-update-bg', false],
			['csh-ui-confirm', false], ['csh-prop-picker', false], [null, true],
		]) {
			await check('15/never mounts a feedback card in '+(id||'a live match'),
				'boot();window.playing='+playing+';var n='+JSON.stringify(id)+';var blocker=n?layer(n):null;var before=status().rows;getF().show([mk(9000+(++scenario))]);var during=!document.getElementById("csh-ach-feedback")&&!status().inbox&&status().rows===before+1;if(blocker)blocker.remove();window.playing=false;return during&&!getF().status().current');
		}
		await check('16/entering a new layer removes an existing notification and leaves its archive',
			'boot();getF().show([mk(6300)]);var existed=!!document.getElementById("csh-ach-feedback");layer("csh-shell-overlay");return existed');
		await new Promise(r => setTimeout(r, 450));
		await check('17/underlying shell is clickable after notification yields',
			'var n=document.getElementById("csh-shell-overlay");var ok=!document.getElementById("csh-ach-feedback")&&!status().inbox&&document.elementFromPoint(innerWidth-20,innerHeight-20)===n;n.remove();return ok&&status().ids.includes("arch-6300")');
		await check('18/review opened in a shell is closed when that shell leaves',
			'var n=layer("csh-shell-overlay");var ok=getF().archive();n.remove();return ok');
		await new Promise(r => setTimeout(r, 450));
		await check('19/shell exit leaves no dimmer, listener capture or viewport obstruction',
			'return !document.getElementById("csh-ach-review")&&!status().inbox&&document.elementFromPoint(20,10).id==="under"');
		for (const [w, h] of [[640, 286], [915, 412], [1365, 768]]) {
			await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
			await check('20/' + w + 'x' + h + ' explicit review fits, scrolls and returns focus',
				'var under=document.getElementById("under");under.focus();var before=under.getBoundingClientRect();getF().archive();var r=document.getElementById("csh-ach-review").getBoundingClientRect(),list=document.querySelector(".csh-ach-review-list");var ok=r.right<=innerWidth&&r.bottom<=innerHeight&&list.clientHeight>40&&list.scrollHeight>list.clientHeight&&document.documentElement.scrollWidth<=innerWidth;escape();var after=under.getBoundingClientRect();return ok&&!document.getElementById("csh-ach-review")&&!status().inbox&&document.activeElement===under&&before.width===after.width&&before.height===after.height');
		}
		await check('21/mark read write failure retains unread and can retry',
			'getF().archive();var before=status().unread;writeFail=true;clickText("标记已读");var rejected=status().unread===before&&reviewText().includes("未保存");writeFail=false;clickText("标记已读");return rejected&&status().unread===before-1');
		await check('22/destroy removes review and leaves no unhandled errors',
			'getF().destroy();return !document.querySelector("#csh-ach-inbox,#csh-ach-review,#csh-ach-feedback")&&errors.length===0');
	});
} finally {
	removeAuditScratch(temp);
}

const result = {
	scope: 'Actual feedback module in Chromium with synthetic storage, clock and save generations; no wallet, achievement rules or physical device.',
	passed: rows.filter(r => r.passed).length,
	failed: rows.filter(r => !r.passed).length,
	checks: rows,
};
fs.writeFileSync(path.join(out, 'archive.json'), JSON.stringify(result, null, 2));
console.log(JSON.stringify({ ...result, checks: rows.filter(r => !r.passed) }));
if (result.failed) process.exitCode = 1;
