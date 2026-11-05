import { auditTempRoot, removeAuditScratch, disposeAuditBrowser } from './audit_scratch.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
export async function withChromium({width,height,browser='C:/Program Files/Google/Chrome/Application/chrome.exe'},run){
  const profile=fs.mkdtempSync(path.join(auditTempRoot(),'csh-browser-audit-'));
  const proc=spawn(browser,['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{windowsHide:true,stdio:'ignore',env:{...globalThis.process.env,TEMP:profile,TMP:profile}});
  let ws;
  try{
    const portFile=path.join(profile,'DevToolsActivePort');
    for(let i=0;i<180&&!fs.existsSync(portFile);i++)await new Promise(r=>setTimeout(r,50));
    /* Windows: 文件刚被 Chrome 创建时可能短暂 EBUSY / 尚未写完端口行 */
    let port='';
    for(let i=0;i<40;i++){
      try{port=fs.readFileSync(portFile,'utf8').split('\n')[0].trim();if(port)break;}
      catch(e){if(!['EBUSY','EACCES','EPERM'].includes(e.code))throw e;}
      await new Promise(r=>setTimeout(r,50));
    }
    if(!port)throw Error('DevToolsActivePort 未能读取');
    const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    let seq=0;const pending=new Map();
    ws.onmessage=e=>{const d=JSON.parse(e.data);if(d.id){const p=pending.get(d.id);pending.delete(d.id);d.error?p?.reject(Error(JSON.stringify(d.error))):p?.resolve(d.result);}};
    const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
    await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
    return await run(send);
  }finally{ws?.close();await disposeAuditBrowser(proc,profile);}
}
