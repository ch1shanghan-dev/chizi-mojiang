// Pure module and SVG contract checks, with an isolated DOM; never reads a player's storage.
import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import{fileURLToPath}from'node:url';
const opt=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1]},root=opt('--root',path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'));
const source=fs.readFileSync(opt('--source',path.join(root,'core/csh_achievement_badges.js')),'utf8'),css=fs.readFileSync(opt('--css',path.join(root,'core/csh_achievement_badges.css')),'utf8');
const context=vm.createContext({window:{}});vm.runInContext(source,context,{timeout:2000});const api=context.window.CSHAchievementBadges,checks=[];
const check=(name,fn)=>{try{const value=fn();checks.push({name,passed:value===true,...(value===true?{}:{detail:value})})}catch(e){checks.push({name,passed:false,error:e.message})}};
function fakeDocument(){const nodes=[];return {nodes,createElementNS(ns,tag){const node={ns,tag,attrs:{},children:[],setAttribute(k,v){this.attrs[k]=String(v)},appendChild(n){this.children.push(n);return n}};Object.defineProperty(node,'innerHTML',{set(){throw Error('Unsafe markup')}});nodes.push(node);return node;}}}
const families={feat:{scope:'feat'},wins:{scope:'wins'},blade:{metric:'d:sha'},shield:{metric:'p:armor'},chain:{cat:'连击'},banner:{cat:'模式'},skill:{metric:'s:test'},cards:{metric:'g:cards'},heal:{metric:'r:recover'},judge:{metric:'q:compare'}};
for(const [family,rule]of Object.entries(families)){
 check(family+' semantic mapping',()=>api.family(rule)===family);
 check(family+' actual SVG uses safe namespace and static paths',()=>{const doc=fakeDocument(),node=api.create(rule,doc);return node.tag==='svg'&&node.attrs['data-family']===family&&doc.nodes.every(n=>n.ns==='http://www.w3.org/2000/svg'&&['svg','g','path'].includes(n.tag))&&doc.nodes.filter(n=>n.tag==='path').every(n=>typeof n.attrs.d==='string'&&n.attrs.d.length>0)});
}
check('tactical and hero feat share one badge family',()=>api.family({tactic:{needs:[]},cat:'模式'})==='feat'&&api.family({scope:'feat',cat:'专属'})==='feat');
check('defensive category takes precedence over generic metric',()=>api.family({cat:'逆境',metric:'d:all'})==='shield');
check('milestone takes precedence over skill metric',()=>api.family({scope:'wins',metric:'s:test'})==='wins');
check('all card metric variants map to cards',()=>['g:cards','l:discard','c:type.basic'].every(metric=>api.family({metric})==='cards'));
check('unknown rules and malformed input fall back safely',()=>[null,undefined,0,false,'<img>',[],{}, {metric:42}].every(r=>api.family(r)==='blade'));
check('throwing accessors cannot interrupt display classification',()=>{const rule={};for(const k of ['scope','cat','metric','tactic','rare'])Object.defineProperty(rule,k,{get(){throw Error('fixture')}});return api.family(rule)==='blade'&&!!api.create(rule,fakeDocument())});
for(const rare of [1,2,3])check('rarity '+rare+' has controlled class and structural grade',()=>{const node=api.create({rare},fakeDocument());return node.attrs.class==='csh-achv-badge csh-achv-badge--rare-'+rare&&node.children.length===(rare===1?3:4)});
check('invalid rarity cannot inject class or attributes',()=>{const r={rare:'3" onload="alert(1)',id:'<script>',name:'<img onerror=bad>',metric:'javascript:bad'},doc=fakeDocument(),svg=api.create(r,doc);return svg.attrs.class.endsWith('--rare-1')&&doc.nodes.every(n=>Object.keys(n.attrs).every(k=>!/^on|href|style|id$/i.test(k)))&&!JSON.stringify(doc.nodes).includes('<script>')});
check('SVG is decorative and never focusable',()=>{const node=api.create({},fakeDocument());return node.attrs['aria-hidden']==='true'&&node.attrs.focusable==='false'&&!('tabindex'in node.attrs)&&!('aria-label'in node.attrs)});
check('missing DOM returns null without external document fallback',()=>api.create({})===null&&api.create({}, {})===null);
check('label comes only from the static semantic family',()=>api.title({scope:'feat',name:'<script>'})==='同局挑战');
check('module reload is idempotent',()=>{vm.runInContext(source,context);return context.window.CSHAchievementBadges===api});
check('API cannot be reassigned piecemeal',()=>Object.isFrozen(api));
check('rules remain byte-equivalent after classification and create',()=>{const r={scope:'feat',rare:3,tactic:{needs:[['c:sha',3]]}},before=JSON.stringify(r);Object.freeze(r.tactic.needs[0]);Object.freeze(r.tactic.needs);Object.freeze(r.tactic);Object.freeze(r);api.family(r);api.create(r,fakeDocument());return JSON.stringify(r)===before});
check('each call returns fresh detached SVG nodes',()=>{const doc=fakeDocument(),a=api.create({},doc),b=api.create({},doc);return a!==b&&a.children!==b.children});
check('stylesheet only owns badge selectors',()=>{const selectors=[...css.matchAll(/([^{}]+)\{/g)].map(m=>m[1].replace(/\/\*[\s\S]*?\*\//g,'').trim()).filter(s=>s&&!s.startsWith('@'));return selectors.every(s=>s.split(',').every(p=>p.trim().startsWith('.csh-achv-badge')))});
check('stylesheet is theme-derived and cannot catch input',()=>css.includes('var(--accent,')&&css.includes('var(--muted,')&&css.includes('pointer-events: none')&&!/animation\s*:|transition\s*:|font-size\s*:|100v[wh]|@keyframes/.test(css));
const pool=vm.createContext({window:{}});vm.runInContext(fs.readFileSync(path.join(root,'core/csh_pool_achv.js'),'utf8'),pool);const rules=pool.window.CSH_POOL_ACHV.RULES;
check('all current definitions produce valid finite SVG nodes',()=>rules.every(rule=>{const d=fakeDocument(),svg=api.create(rule,d);return svg&&d.nodes.length>=5&&d.nodes.length<=7&&Object.hasOwn(families,svg.attrs['data-family'])}));
check('all ten semantic families have actual definition coverage',()=>new Set(rules.map(r=>api.family(r))).size===10);
const result={passed:checks.filter(c=>c.passed).length,failed:checks.filter(c=>!c.passed).length,failures:checks.filter(c=>!c.passed),checks};if(opt('--out'))fs.writeFileSync(opt('--out'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,checks:undefined},null,2));if(result.failed)process.exitCode=1;
