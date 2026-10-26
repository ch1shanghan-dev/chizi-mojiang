/* Public client transport: bounded HTTPS requests, no secrets or hardware fingerprint. */
(function(root){
 'use strict';
 var BASE='https://chishanghan.duckdns.org',MAX=524288;
 function text(value,n){return typeof value==='string'?value.slice(0,n||200):'';}
 function integer(n){return Number.isSafeInteger(n)&&n>=0?n:0;}
 function row(r){r=r&&typeof r==='object'?r:{};return {uid:text(r.uid,100),name:text(r.name,40),sig:text(r.sig,160),rank:integer(r.rank),merit:integer(r.merit),cby:integer(r.cby),seg:text(r.seg,40),ago:text(r.ago,60)};}
 function board(r){r=r&&typeof r==='object'?r:{};return {list:Array.isArray(r.list)?r.list.slice(0,50).map(row):[],me:r.me?row(r.me):null,n:integer(r.n)};}
 function girls(list){return Array.isArray(list)?list.slice(0,100).filter(function(r){return r&&/^csh_boss_minion_[a-z0-9_]{1,40}$/.test(r.girl);}):[];}
 function request(path,method,body,callback,timeout){
  var done=false,timer=null,abort=null;
  function fin(ok,value){if(done)return;done=true;if(timer!==null)clearTimeout(timer);callback(ok,value);}
  var url,payload='';
  try{url=new URL(path,BASE);if(url.origin!==BASE||url.username||url.password||path.charAt(0)!=='/'||path.length>2048||!((method==='GET'&&/^\/(girls|board)$/.test(url.pathname))||(method==='POST'&&/^\/(submit|cheer)$/.test(url.pathname))))throw Error('request');payload=body?JSON.stringify(body):'';if(new TextEncoder().encode(payload).length>4096)throw Error('payload');}catch(e){fin(false,null);return;}
  timer=setTimeout(function(){fin(false,null);if(abort)abort();},Math.min(10000,Math.max(1000,timeout||4500)));
  var req=null;try{req=root.require||null;}catch(e){}
  if(req){try{
    var https=req('https'),r=https.request(url.href,{method:method,timeout:timeout||4500,headers:payload?{'Content-Type':'application/json','Content-Length':new TextEncoder().encode(payload).length}:{}},function(res){
      var size=0,chunks=[];res.on('data',function(c){size+=c.length;if(size>MAX){fin(false,null);res.destroy();return;}chunks.push(c);});res.on('error',function(){fin(false,null);});res.on('end',function(){if(done)return;try{fin(res.statusCode>=200&&res.statusCode<300,JSON.parse(req('buffer').Buffer.concat(chunks).toString('utf8')));}catch(e){fin(false,null);}});
    });abort=function(){r.destroy();};r.on('error',function(){fin(false,null);});r.on('timeout',function(){fin(false,null);r.destroy();});r.end(payload);return;
  }catch(e){fin(false,null);return;}}
  try{
    var controller=new AbortController();abort=function(){controller.abort();};
    root.fetch(url.href,{method:method,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:controller.signal,headers:payload?{'Content-Type':'application/json'}:undefined,body:payload||undefined}).then(async function(res){
      if(!res.ok){fin(false,null);abort();return;}if(Number(res.headers.get('content-length'))>MAX){fin(false,null);abort();return;}
      var reader=res.body.getReader(),size=0,chunks=[];
      while(true){var next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>MAX){fin(false,null);await reader.cancel();abort();return;}chunks.push(next.value);}
      var bytes=new Uint8Array(size),pos=0;chunks.forEach(function(c){bytes.set(c,pos);pos+=c.byteLength;});try{fin(true,JSON.parse(new TextDecoder().decode(bytes)));}catch(e){fin(false,null);}
    }).catch(function(){fin(false,null);});
  }catch(e){fin(false,null);}
 }
 root.CSHNet={request:request,board:board,girls:girls,text:text,integer:integer};
})(typeof window!=='undefined'?window:globalThis);
