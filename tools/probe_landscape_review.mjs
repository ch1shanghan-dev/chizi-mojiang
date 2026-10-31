// Complete registered pages, developer tabs and representative secondary flows in a disposable host.
import fs from 'node:fs';import path from 'node:path';import{spawn}from'node:child_process';import{pathToFileURL,fileURLToPath}from'node:url';
const arg=n=>{let i=process.argv.indexOf(n);return i<0?null:process.argv[i+1];},root=arg('--root')||path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=arg('--out');if(!out)throw Error('Use external --out');fs.mkdirSync(out,{recursive:true});
const tests=String.raw`
async function landscapeReview(){
 await surveyNoncharacter({page,out,snap,until,delay,clickElement,check,stage});
 await page.evaluate('lib.cshDebugMenu.open()');
 const tabs=await page.evaluate('[...document.querySelectorAll("#csh-dbg-tabs .csh-dbg-tab")].map(n=>n.textContent)');
 for(const [width,height]of [[1365,768],[915,412],[844,390],[640,286]]){
  await page.send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await delay(400);
  for(const tab of tabs){
   await clickElement('[...document.querySelectorAll("#csh-dbg-tabs .csh-dbg-tab")].find(n=>n.textContent==='+JSON.stringify(tab)+')');await delay(150);
   const metric=await page.evaluate('(()=>{const body=document.getElementById("csh-dbg-body"),r=body.getBoundingClientRect(),visible=n=>{const b=n.getBoundingClientRect(),s=getComputedStyle(n);return b.width>0&&b.height>0&&b.bottom>r.y&&b.y<r.bottom&&s.display!=="none"&&s.visibility!=="hidden";};return {width:innerWidth,height:innerHeight,body:{x:r.x,y:r.y,w:r.width,h:r.height,right:r.right,bottom:r.bottom},overflow:body.scrollWidth>body.clientWidth+2,small:[...body.querySelectorAll("button,input,label,p,span")].filter(visible).filter(n=>n.textContent.trim()&&parseFloat(getComputedStyle(n).fontSize)<12).slice(0,8).map(n=>({text:n.textContent.slice(0,35),size:getComputedStyle(n).fontSize})),controls:[...body.querySelectorAll("input,select,button")].filter(visible).filter(n=>n.getBoundingClientRect().right>r.right+2).slice(0,8).map(n=>n.textContent.slice(0,35))};})()');
   check('developer '+tab+' usable boundaries '+width+'x'+height,metric.body.h>=60&&metric.body.x>=-1&&metric.body.right<=width+1&&metric.body.bottom<=height+1&&!metric.overflow&&!metric.controls.length,metric);
   if(width===915||width===1365)stage('developer-'+tab+'-'+width+'x'+height,{screenshot:await snap('developer-'+tabs.indexOf(tab)+'-'+width+'x'+height)});
  }
 }
 await page.send('Emulation.setDeviceMetricsOverride',{width:1365,height:768,deviceScaleFactor:1,mobile:false});
 // Existing harness drives market detail, career awards and native host debug actors.
 await smokeExperience();await smokeUiRecovery();
 const e=await page.evaluate('({errors:__hostSmoke.errors,rejections:__hostSmoke.rejections})');check('landscape review no extension runtime errors',!e.errors.length&&!e.rejections.length,e);
}
`;
let source=fs.readFileSync(path.join(root,'tools/probe_host_smoke.mjs'),'utf8');
let survey=fs.readFileSync(path.join(root,'tools/lib/noncharacter_host_survey.mjs'),'utf8');survey=survey.replace('[[1365,768],[915,412],[390,844]]','[[1920,1080],[1365,768],[915,412],[844,390],[640,286]]');
const surveyFile=path.join(out,'landscape-survey.mjs');fs.writeFileSync(surveyFile,survey);
source=source.replace(/const root = path.resolve\(path.dirname\(fileURLToPath\(import.meta.url\)\), '\.\.'\);/,'const root = '+JSON.stringify(root)+';').replace(/from '\.\/([^']+)'/g,(_,f)=>'from '+JSON.stringify(pathToFileURL(f==='lib/noncharacter_host_survey.mjs'?surveyFile:path.join(root,'tools',f)).href));
source=source.replace("if(process.argv.includes('--world-layout-410'))","if(process.argv.includes('--landscape-review'))await landscapeReview();\n    else if(process.argv.includes('--world-layout-410'))");
// Phone means landscape. Retain desktop variants and the separate portrait fallback tools.
source=source.replaceAll('width:390,height:844','width:915,height:412').replace('[[1280,573],[915,412],[640,360],[640,286],[390,844]]','[[1365,768],[915,412],[844,390],[640,360],[640,286]]');
const runner=path.join(out,'isolated-landscape-runner.mjs');fs.writeFileSync(runner,tests+'\n'+source);
const child=spawn(process.execPath,[runner,'--landscape-review','--out',out],{stdio:'inherit',windowsHide:true});await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>{process.exitCode=code||0;resolve();});});
