// Disposable Chromium profile; never attach to the player's browser or game.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
export async function openProbe(html, browser='C:/Program Files/Google/Chrome/Application/chrome.exe') {
  const temp=fs.mkdtempSync(path.join(os.tmpdir(),'csh-maintenance-browser-'));
  const file=path.join(temp,'probe.html');fs.writeFileSync(file,html);
  const child=spawn(browser,['--headless=new','--no-sandbox','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-port=0','--user-data-dir='+path.join(temp,'profile'),'about:blank'],{windowsHide:true,stdio:'ignore'});
  let ws, launchError;
  child.on('error',e=>{launchError=e;});
  try {
    const portFile=path.join(temp,'profile','DevToolsActivePort');
    for(let n=0;!fs.existsSync(portFile)&&n<160;n++){if(launchError)throw launchError;await new Promise(r=>setTimeout(r,50));}
    const port=fs.readFileSync(portFile,'utf8').split('\n')[0];
    const targets=await(await fetch('http://127.0.0.1:'+port+'/json/list')).json();
    ws=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject;});
    let seq=0;const pending=new Map();
    ws.onclose=()=>{for(const p of pending.values())p.reject(Error('Probe browser disconnected'));pending.clear();};
    ws.onmessage=e=>{const data=JSON.parse(e.data);if(data.id){const p=pending.get(data.id);pending.delete(data.id);data.error?p?.reject(Error(JSON.stringify(data.error))):p?.resolve(data.result);}};
    const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++seq;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
    const evaluate=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.text+' '+JSON.stringify(r.exceptionDetails.exception));return r.result.value;};
    await send('Page.navigate',{url:pathToFileURL(file).href});
    for(let n=0;n<160;n++){if(await evaluate('document.readyState === "complete"'))break;await new Promise(r=>setTimeout(r,25));}
    return {send,evaluate,temp,async close(){try{await send('Browser.close');}catch{}ws.close();child.kill();}};
  } catch(e){ws?.close();child.kill();throw e;}
}
