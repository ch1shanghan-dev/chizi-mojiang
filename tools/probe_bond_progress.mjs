import fs from 'node:fs';import path from 'node:path';import os from 'node:os';import vm from 'node:vm';import {pathToFileURL} from 'node:url';
import {root} from './lib/skill_audit.mjs';import {openProbe} from './lib/browser_probe.mjs';
const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:fs.mkdtempSync(path.join(os.tmpdir(),'csh-bond-'));
fs.mkdirSync(out,{recursive:true});const rows=[];const check=(name,v,detail)=>rows.push({name,passed:!!v,...(!v?{detail}: {})});
const ctx=vm.createContext({});vm.runInContext(fs.readFileSync(path.join(root,'core/csh_bond.js'),'utf8'),ctx);const B=ctx.CSHBond;
for(const [v,key,current,target] of [[0,'D',0,2000],[99,'D',99,2000],[100,'D',100,2000],[101,'D',101,2000],[182,'D',182,2000],[1999,'D',1999,2000],[2000,'C',0,6000],[7999,'C',5999,6000],[8000,'B',0,10000],[18000,'A',0,20000],[38000,'S',0,50000],[87999,'S',49999,50000],[88000,'S',50000,50000]]){const p=B.resolveBondProgress(v);check('boundary '+v,p.level.key===key&&p.current===current&&p.target===target&&p.current<=p.target&&p.percent>=0&&p.percent<=100,p);}
for(const v of [-1,NaN,Infinity,Number.MAX_SAFE_INTEGER+100]){const p=B.resolveBondProgress(v);check('invalid value handled '+v,p.invalidInput&&Number.isFinite(p.percent)&&p.current<=p.target,p);}
for(const tiers of [[{min:100,key:'D'}],[{min:0,key:'D'},{min:0,key:'C'}],[{min:0,key:'D'},{min:2,key:'D'}]]){let rejected=false;try{B.resolveBondProgress(1,tiers);}catch{rejected=true;}check('invalid threshold table rejected',rejected);}
let html=fs.readFileSync(path.join(root,'games/codex.html'),'utf8').replace(/src="\.\.\/([^"]+)"/g,(_,f)=>'src="'+pathToFileURL(path.join(root,f)).href+'"');
const marker='\nboot();';if(!html.includes(marker))throw Error('codex boot anchor missing');
html=html.replace(marker,`window.__bondTest=function(v){var it={id:'probe',name:'测试角色',n:1,affState:{v:v,mood:'warm',acts:{},cnt:{},perks:[],toNext:0}};Data.items=[it];Data.cur=0;document.body.classList.remove("empty");it.img="";renderAll();renderAff(it);var p=CSHBond.resolveBondProgress(v);return {value:document.querySelector('.affval').textContent,level:document.querySelector('.afflv').textContent,width:document.querySelector('.affbar i').style.width,meta:document.querySelector('.affmeta').textContent,aria:document.querySelector('.affbar').getAttribute('aria-valuenow'),expected:p};};\n`+marker);
html=html.replace('</head>','<style>*,*::before,*::after{animation:none!important;transition:none!important}</style></head>');
const browser=await openProbe(html);try{
 for(const [name,width,height]of [['desktop',1200,820],['portrait',390,844],['short',915,412],['tiny',568,320]]){
  await browser.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
  for(const v of [0,182,2000,38000,88000]){const r=await browser.evaluate('__bondTest('+v+')');check(name+' actual render '+v,r.value===r.expected.current+' / '+r.expected.target&&parseFloat(r.width)<=100&&r.aria===String(r.expected.current)&&r.meta.includes('累计亲密度 '+v)&&(!r.expected.complete||r.meta.includes('羁绊圆满')),r);}
  check(name+' header stays compact',await browser.evaluate("document.querySelector('.topbar').getBoundingClientRect().height<=52"));
  const shot=await browser.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,name+'.png'),Buffer.from(shot.data,'base64'));
 }
}finally{await browser.close();}
const result={scope:'pure shared thresholds and actual codex DOM in isolated Chromium; no player saves',passed:rows.filter(x=>x.passed).length,failed:rows.filter(x=>!x.passed).length,failures:rows.filter(x=>!x.passed)};fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({...result,checks:rows},null,2));console.log(JSON.stringify(result,null,2));if(result.failed)process.exitCode=1;
