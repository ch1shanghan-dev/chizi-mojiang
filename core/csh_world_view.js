/* Player-world composition: direct actions and personal records available on demand. */
(function(root){
 if(root.CSHWorldView)return;
 function node(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
 function fmt(v){return Math.max(0,Math.floor(Number(v)||0)).toLocaleString('zh-CN');}

 var TALK_KEYS=['aggro','tight','bluff','math','wild','chaser','trapper','grinder','bull','maniac','reader','lucky'];
 // 公开牌风与已保存的玩家亲历；不推测上一手、暗牌、日期或关系先后。
 var TALK_LINES={
  style:['我喜欢先争主动，但该收手时也得收。','等一等没什么，合适的机会值得耐心。','桌上的动作也是话，别急着句句都信。','我更在意判断有没有根据，运气留给牌来定。','我凭感觉上桌，也得认自己做的选择。','我总想看看后面那张牌，也提醒自己别追得太远。','有时候让一步，是为了等一个更合适的位置。','我不急着一把赢完，稳稳打好每一手就够。','我愿意少动几次，把真正要动的那次想清楚。','我爱热闹，不过下一步仍该自己拿主意。','我看得见你的选择，可看不见你的底牌。','我爱讨个好彩头，可不能把好运当作保证。'],
  greet:['还没交过手？那就从一桌认识。','初次同桌，先慢慢熟悉彼此。','先打个招呼，别把我的笑当成牌好。','还没有交手的样本，评价可以晚一点。','新面孔！有机会痛快打上一桌。','还没同过桌，那就让下一次成为开头。','初见不用急，等真正落座再认识。','第一手之前，咱们都还有很多可能。','初次见面，稳稳坐下就好。','还没一块儿玩过？以后找机会热闹一桌。','现在还谈不上了解你，桌上的选择会慢慢说话。','初次见面，先送你一句好彩头。'],
  youWon:['你赢过我，这份本事我认。','你有赢下来的记录，稳妥的选择值得尊重。','你赢过，可别从我的笑里猜下次的牌。','你确实赢过我，不过单凭胜负还说不尽判断。','你赢过我，爽快认账，下次再切磋。','你拿到过胜局，我也还愿意再找机会。','你曾把机会握住，我会更耐心地应对。','你赢下来的那份，是一手一手打出来的。','你赢过，我会认真对待下一次交手。','你赢过我，桌上的热闹还没完呢。','你赢过我，我也会留意你的下一次选择。','你赢过我，看来好彩头也会落到你那边。'],
  youLost:['我也赢过你，下一次仍得重新打。','我有过胜局，不能因此就轻看你。','我赢过，可这句话不替下一桌下注。','我确实占过上风，旧结果不等于下一次概率。','我赢过你，不过下一桌照样有变数。','此前我有过机会，你的下一次还没写完。','我曾等到自己的机会，下次也得重新等。','我也有赢下来的时候，一点点积累罢了。','我赢过，但不会因此省掉下一次的判断。','我拿过胜局，下一桌还能继续热闹。','我曾占过上风，也只说明那些已经发生的交手。','我赢过你，可好运从来不给人打包票。'],
  mixed:['你我都赢过，下一桌才更有意思。','有赢有输，熟悉彼此也得保持耐心。','彼此都占过上风，谁也别急着把谁看透。','胜负都有记录，我更想把下一次判断做好。','你来我往，这才像痛快的切磋。','彼此都有翻出机会的时候，还能继续。','我们都等到过自己的机会，下一桌重新找。','有来有回，牌缘是一手一手攒下来的。','你我都赢过，不必拿旧结果替新的一手作主。','都赢过！下一桌谁得意，还得打了才知道。','我们都占过上风，熟悉也不等于能看穿底牌。','好运到过两边，下一桌仍得认真打。'],
  draw:['这些交手还没分出胜负，下一桌接着来。','既然目前都和了，不妨继续慢慢打。','和局也有意思，别把没分胜负当成没较量。','平手也有平手的道理，不用急着算谁更强。','都没分出来？那这段牌缘还留着悬念。','和局把下一次机会留给了我们。','暂时没分胜负，也不用急着抢一个结论。','和局也是共同打过的一手，照样算相识。','没有分胜负，就先把结论留着。','还没分出来，热闹可没有白凑。','几次相逢都未分胜负，我还想再看看你的选择。','好运还没偏向哪边，悬念留给下次。'],
  unknown:['同过桌就算认识，下一次再认真较量。','先记得一起坐过，不必急着分个高下。','见过你的桌上选择，胜负的话以后慢慢聊。','有交集，不代表现在就能给彼此下结论。','一桌坐过就是缘分，下次接着玩。','相遇已经有了，后面的机会还多。','既然同过桌，之后总能再等一个机会。','相识从一手开始，慢慢积累就好。','坐过同一桌，不必马上争一句谁更强。','都凑过一桌了，下次再添点热闹。','先记住彼此的打法，胜负的事留到下次。','相识也是好彩头，后面的事留给下一桌。'],
  revenge:['你先受过挫，也把胜局打回来了，我认这份韧劲。','你有过失利，也在后来的交手中赢回过一局。','你扳回过胜局，这个转折不是我嘴上能抹掉的。','你曾在失利后赢回来，我会认真看待下一次交手。','你赢回来过，痛快！这段切磋有来有回。','你等到过自己的转机，希望总要靠下一次选择。','你后来把机会抓住了，我会记得认真应对。','失利之后还能稳稳赢回来，这份耐心不容易。','你扳回过胜局，说明我不能拿过去轻看你。','你真的赢回来过，这才叫有后续！','你输过，也后来赢过；下一次的选择仍值得留意。','你等到了自己的好彩头，也把那一局拿住了。'],
  familiar:['同桌多了，较量也更认真些。','已经不止几次相见了，还是按自己的节奏来。','熟面孔也别全信我的表情，牌桌上照样有变数。','交手积累得多了，我仍不会把熟悉当成确定。','都算熟人了，有机会再痛快切磋。','相识不是一两手攒成的，下次还愿意见你。','我们相逢过不少次，耐心也有了来处。','一手一手下来，这段牌缘已经有分量。','熟悉归熟悉，我对每一次交手都认真。','老面孔，一起凑过的热闹可不少。','见过不少彼此的选择，也该给新的选择留余地。','相逢多次，本身就是一份好缘分。'],
  next:['有机会再较量，落座时再见真章。','有合适的桌，咱们慢慢打。','下次有缘落座，别提前猜我的第一步。','有机会再同桌，带入和判断都量力而行。','有机会再来一桌，痛快也别勉强。','下一次还没开场，机会不用急着追。','等一张合适的桌，再慢慢展开。','有缘再坐一桌，稳稳打完就好。','合适的时候再见，谁也不必勉强赴桌。','有合适的桌再热闹一回，眼下先由你安排。','下次若再同桌，我会看你的新选择。','有机会再见，讨个好彩头也得量力而行。'],
  away:['眼下先歇一歇，较量不急在这一刻。','现在不便赴桌，先留一段安静的闲谈。','这会儿不上桌，也不妨坐着聊两句。','当前先不安排牌局，闲谈不需要下注。','眼下先歇会儿，热闹以后还有机会。','现在不便同桌，机会可以慢慢等。','此刻先静一静，不用为了赴桌而勉强。','眼下休息，牌缘不用靠赶这一桌维系。','现在不赴桌，也不必急着作安排。','这会儿先收住，聊两句也挺好。','当前先不坐桌，聊聊彼此的想法就好。','好彩头可以先送给你，现在不急着开桌。']
 };
 function conversationFor(person,p,available){
  var index=TALK_KEYS.indexOf(person.persona);if(index<0)index=3;
  function topic(id,label,scene){return {id:id,label:label,text:TALK_LINES[scene][index]};}
  var scene=!p.hands?'greet':p.revenge?'mixed':p.wins&&p.losses?'mixed':p.draws===p.hands?'draw':p.wins?'youWon':p.losses?'youLost':'unknown';
  var topics=[topic('record',p.hands?'聊聊交手':'初次见面',scene),topic('style','说说牌风','style')];
  if(p.revenge)topics.push(topic('turn','再战转折','revenge'));
  if(p.hands>=10)topics.push(topic('familiar','熟人再会','familiar'));
  topics.push(topic('next',available?'下次见面':'暂别闲谈',available?'next':'away'));
  return topics;
 }
 function renderConversation(W,model,ops){
  if(!document.getElementById('csh-memory-talk-css')){
   var style=node('style');style.id='csh-memory-talk-css';style.textContent=`
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-dialogue{display:grid!important;gap:8px!important;min-width:0!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-topic{display:flex!important;align-items:center!important;gap:12px!important;font:500 var(--csh-lfs-md,13px)/1.5 "Microsoft YaHei",sans-serif!important;color:var(--csh-gray)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-topic select{position:static!important;flex:1!important;min-width:44px!important;max-width:280px!important;min-height:44px!important;background:var(--csh-fg)!important;color:var(--csh-bg)!important;border:1px solid rgba(var(--csh-bg-rgb),.25)!important;border-radius:5px!important;padding:8px!important;font:400 var(--csh-lfs-lg,14px)/1.5 "Microsoft YaHei",sans-serif!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-answer{font:400 var(--csh-lfs-lg2,15px)/1.8 SimSun,serif!important;color:var(--csh-bg)!important;border-left:2px solid var(--csh-accent)!important;padding:4px 0 4px 14px!important;overflow-wrap:anywhere!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-records{position:static!important;min-width:0!important;border-top:1px solid rgba(var(--csh-bg-rgb),.14)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-records>summary{position:static!important;display:flex!important;align-items:center!important;gap:8px!important;min-height:44px!important;list-style:none!important;cursor:pointer!important;color:var(--csh-gray)!important;font:500 var(--csh-lfs-md,13px)/1.5 "Microsoft YaHei",sans-serif!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-records>summary:before{content:'▸'}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-records[open]>summary:before{content:'▾'}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-records>summary:focus-visible{outline:2px solid var(--csh-accent)!important;outline-offset:2px!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-records:not([open])>:not(summary){display:none!important}
@media(orientation:landscape) and (max-height:330px){html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-content{gap:10px!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-answer{font-size:var(--csh-lfs-lg,14px)!important;line-height:1.65!important}}
`;document.documentElement.appendChild(style);
  }
  var dialogue=node('section','csh-memory-dialogue'),label=node('label','csh-memory-topic','聊一聊'),select=node('select'),answer=node('p','csh-memory-answer'),note=node('p','csh-memory-note'),refresh=node('button','csh-memory-refresh','刷新回忆');
  select.setAttribute('aria-label','选择闲谈话题');answer.setAttribute('aria-live','polite');note.setAttribute('role','status');refresh.type='button';refresh.hidden=true;
  model.conversation.forEach(function(t){var option=node('option','',t.label);option.value=t.id;select.appendChild(option);});
  var choice=ops.choices.get(String(model.person.id))||'record';if(!model.conversation.some(function(t){return t.id===choice;}))choice='record';
  function paint(){select.value=choice;var t=model.conversation.find(function(t){return t.id===choice;});answer.textContent=t?'「'+t.text+'」':'';}
  function signature(m){return JSON.stringify([m.person,m.facts]);}
  select.addEventListener('change',function(){
   if(!ops.current())return;
   var fresh;try{fresh=memoryOf(W,model.person.id);}catch(e){note.textContent='回忆暂未读取，保留刚才的内容，可重新读取。';refresh.hidden=false;select.value=choice;return;}
   if(signature(fresh)!==signature(model)){note.textContent='人物记录已更新，请刷新回忆后继续。';refresh.hidden=false;select.value=choice;select.disabled=true;return;}
   if(!model.conversation.some(function(t){return t.id===select.value;})){select.value=choice;return;}
   choice=select.value;ops.choices.set(String(model.person.id),choice);paint();
  });
  refresh.addEventListener('click',function(){if(!ops.current())return;try{memoryOf(W,model.person.id);}catch(e){note.textContent='回忆仍未读取，保留刚才的内容，稍后可重试。';return;}ops.refresh();});paint();label.appendChild(select);dialogue.appendChild(label);dialogue.appendChild(answer);dialogue.appendChild(note);dialogue.appendChild(refresh);return dialogue;
 }

 function personalFacts(raw){
  raw=raw||{};var count=function(v){return Number.isSafeInteger(v)&&v>=0?v:0;},hands=count(raw.hands),wins=Math.min(hands,count(raw.wins)),losses=Math.min(hands-wins,count(raw.losses)),draws=Math.min(hands-wins-losses,count(raw.draws));
  return {hands:hands,wins:wins,losses:losses,draws:draws,unknown:hands-wins-losses-draws,revenge:!!raw.revenge&&wins>0&&losses>0};
 }
 // One read-only snapshot; only explicitly personal history may acquire a date.
 function memoryOf(W,id){
  var snapshot=W.raw();if(!snapshot||!Array.isArray(snapshot.ai))throw Error('World record unavailable');
  var choices=snapshot.ai.filter(function(a){return personalFacts(a.withPlayer).hands>0||String(a.id)===String(id);}).sort(function(a,b){return personalFacts(b.withPlayer).hands-personalFacts(a.withPlayer).hands||String(a.name).localeCompare(String(b.name),'zh-CN');});
  var person=id==null?choices[0]:snapshot.ai.find(function(a){return String(a.id)===String(id);});
  if(!person)return {person:null,choices:choices};
  var p=personalFacts(person.withPlayer),P=W.PERSONAS&&W.PERSONAS[person.persona],milestones=[],dated=[],seen=new Set(),names=snapshot.ai.filter(function(a){return a.name===person.name;}).length;
  if(p.hands)milestones.push({key:'first',title:'一手相识',text:'你们已经在牌桌上有了交集。'});
  [10,40,150].forEach(function(n){if(p.hands>=n)milestones.push({key:'oldfriend-'+n,title:n===10?'渐成牌友':n===40?'熟面孔':'长久牌缘',text:'你与'+person.name+'累计同桌已满 '+fmt(n)+' 手。'});});
  if(p.revenge)milestones.push({key:'revenge',title:'再战破局',text:'你曾输给这位牌友，也在后来的交手中赢回来。'});
  else if(p.wins&&p.losses)milestones.push({key:'balanced',title:'互有胜负',text:'你们都赢过对方，胜负仍有来回。'});
  var now=new Date(),today=Math.floor((Date.UTC(now.getFullYear(),now.getMonth(),now.getDate())-Date.UTC(2026,0,1))/86400000);
  if(names===1)(Array.isArray(snapshot.history)?snapshot.history:[]).forEach(function(e){
   if(!e||e.n!==person.name)return;
   var key=e.kind==='playerrevenge'&&p.revenge?'revenge':e.kind==='oldfriend'&&[10,40,150].includes(e.c)&&p.hands>=e.c?'oldfriend-'+e.c:null;
   if(!key||!Number.isSafeInteger(e.day)||e.day<0||e.day>today||seen.has(key))return;
   var row=milestones.find(function(m){return m.key===key;});if(!row)return;
   var date=new Date(Date.UTC(2026,0,1)+e.day*86400000).toISOString().slice(0,10);dated.push({key:key,title:row.title,text:row.text,date:date,day:e.day});seen.add(key);
  });
  dated.sort(function(a,b){return b.day-a.day;});
  var fragments=dated.concat(milestones.filter(function(m){return !seen.has(m.key);}).reverse());
  var text=!p.hands?'还未同桌，牌缘留待下一手。':p.draws===p.hands?'几次相逢，胜负都留给了下一桌。':p.revenge?'有过受挫，也有过再战得胜，这段牌缘已经有了转折。':p.wins&&p.losses?'你来我往，谁也没有把胜负写成定局。':p.wins?'你曾在交手中占过上风，下一桌仍值得期待。':p.losses?'此前对方占过上风，下一次相逢仍有机会。':'同桌的经历已经记下，未分的胜负仍留着空白。';
  return {person:{id:person.id,name:person.name,persona:P&&P.name||'牌友',description:P&&P.desc||'',available:!person.retired&&Number(person.fund)>=200},choices:choices.map(function(a){return {id:a.id,name:a.name};}),facts:p,text:text,fragments:fragments,conversation:conversationFor(person,p,!person.retired&&Number(person.fund)>=200)};
 }
 function css(){if(document.getElementById('csh-world-board-css'))return;var s=node('style');s.id='csh-world-board-css';s.textContent=`
html.csh-world-view #csh-dbg-panel[data-view="world"] #csh-dbg-body{padding:12px 20px 22px!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-board{position:static!important;display:grid!important;gap:18px!important;width:100%!important;max-width:1220px!important;margin:0 auto!important;color:var(--csh-bg)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-hero{position:static!important;display:flex!important;flex-direction:row!important;align-items:center!important;justify-content:space-between!important;flex-wrap:wrap!important;gap:8px 16px!important;padding:5px 12px!important;min-height:54px!important;margin:0!important;background:var(--csh-fg)!important;border:1px solid rgba(var(--csh-bg-rgb),.13)!important;border-left:3px solid var(--csh-accent)!important;border-radius:8px!important;color:var(--csh-bg)!important;box-shadow:none!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-hero>div{position:static!important;display:flex!important;align-items:baseline!important;flex-wrap:wrap!important;gap:4px 16px!important;flex:1 1 200px!important;min-width:0!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-hero h2{position:static!important;min-width:0!important;margin:0!important;font:600 var(--csh-lfs-lg2,15px)/1.4 "Times New Roman","Microsoft YaHei",sans-serif!important;font-variant-numeric:tabular-nums!important;letter-spacing:0!important;color:inherit!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-hero p{position:static!important;max-width:100%!important;min-width:0!important;margin:0!important;font-size:var(--csh-lfs-sm,12px)!important;line-height:1.5!important;color:var(--csh-gray)!important;overflow-wrap:anywhere!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-hero .csh-world-save-warning{flex-basis:100%!important;color:var(--csh-red)!important;font-weight:600!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-start{position:static!important;transform:none!important;align-self:center!important;min-height:44px!important;margin:0!important;padding:8px 16px!important;border-radius:6px!important;background:var(--csh-accent)!important;color:var(--csh-accent-ink)!important;border:1px solid transparent!important;box-shadow:inset 0 1px 0 #ffffff30!important;font-size:var(--csh-lfs-lg,14px)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-columns{position:static!important;display:grid!important;grid-template-columns:minmax(0,1fr) minmax(248px,.42fr)!important;align-items:start!important;gap:24px!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-primary{position:static!important;display:grid!important;grid-template-columns:minmax(0,1fr)!important;min-width:0!important;gap:22px!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-tables,html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-services{position:static!important;display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;min-width:0!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-section{position:static!important;grid-column:1/-1!important;display:flex!important;align-items:center!important;gap:10px!important;min-width:0!important;margin:0 0 2px!important;color:var(--csh-gray)!important;font:600 var(--csh-lfs-md,13px)/1.5 "Microsoft YaHei",sans-serif!important;letter-spacing:.08em!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-section::after{content:"";flex:1;height:1px;background:rgba(var(--csh-bg-rgb),.12)}
html.csh-world-view #csh-dbg-panel[data-view="world"] button.csh-dbg-gamebtn{position:relative!important;display:flex!important;flex-direction:column!important;align-items:stretch!important;justify-content:center!important;grid-column:auto!important;width:100%!important;height:auto!important;min-height:108px!important;min-width:0!important;padding:14px 14px 14px 64px!important;border-radius:8px!important;background:var(--csh-fg)!important;border:1px solid rgba(var(--csh-bg-rgb),.14)!important;box-shadow:inset 0 1px 0 rgba(var(--csh-bg-rgb),.035)!important;transform:none!important;text-align:left!important;overflow:hidden!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] button.csh-dbg-gamebtn::before,html.csh-world-view #csh-dbg-panel[data-view="world"] button.csh-dbg-gamebtn::after,html.csh-world-view #csh-dbg-panel[data-view="world"] .gb-art{display:none!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-tables button.csh-dbg-gamebtn{background:linear-gradient(135deg,rgba(var(--csh-green-rgb),.10),transparent 80%),var(--csh-fg)!important;border-top-color:rgba(var(--csh-accent-rgb),.5)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-mark{position:absolute!important;left:16px!important;top:50%!important;transform:translateY(-50%)!important;display:grid!important;place-items:center!important;width:32px!important;height:38px!important;pointer-events:none!important;color:var(--csh-accent)!important;opacity:.88!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-mark svg{position:static!important;display:block!important;width:100%!important;height:100%!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .gb-top{position:static!important;display:flex!important;align-items:center!important;flex-wrap:wrap!important;justify-content:space-between!important;gap:4px 8px!important;margin:0 0 6px!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .gb-name{position:static!important;min-width:0!important;font:600 var(--csh-lfs-xl3,18px)/1.35 "Noto Serif SC","Source Han Serif SC",SimSun,serif!important;color:var(--csh-bg)!important;letter-spacing:.02em!important;white-space:normal!important;overflow-wrap:anywhere!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .gb-tag{position:static!important;flex:none!important;padding:2px 6px!important;border-radius:4px!important;background:rgba(var(--csh-bg-rgb),.055)!important;color:var(--csh-gray)!important;font:400 var(--csh-lfs-sm,12px)/1.4 "Microsoft YaHei",sans-serif!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .gb-desc{position:static!important;display:block!important;min-width:0!important;max-height:none!important;overflow:visible!important;-webkit-line-clamp:unset!important;white-space:normal!important;overflow-wrap:anywhere!important;margin:0!important;color:var(--csh-gray)!important;font:400 var(--csh-lfs-md,13px)/1.5 "Microsoft YaHei",sans-serif!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-services button.csh-dbg-gamebtn{min-height:82px!important;padding:11px 12px 11px 49px!important;background:transparent!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-services .csh-world-mark{left:13px!important;width:24px!important;height:30px!important;color:var(--csh-gray)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-services .gb-name{font-size:var(--csh-lfs-lg2,15px)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-services .gb-mid{display:none!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-services :is(.gb-achv,.gb-bossbook) .gb-mid{position:static!important;display:block!important;min-width:0!important;margin:0 0 3px!important;font-size:var(--csh-lfs-sm,12px)!important;line-height:1.4!important;color:var(--csh-gray)!important;overflow-wrap:anywhere!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] button.csh-dbg-gamebtn:hover,html.csh-world-view #csh-dbg-panel[data-view="world"] button.csh-dbg-gamebtn:focus-visible{background-color:var(--csh-fg)!important;border-color:var(--csh-accent)!important;outline:2px solid var(--csh-accent)!important;outline-offset:1px!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-side{position:static!important;display:grid!important;gap:12px!important;min-width:0!important;padding-left:20px!important;border-left:1px solid rgba(var(--csh-bg-rgb),.12)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-digest{position:static!important;display:grid!important;grid-template-columns:minmax(0,1fr)!important;grid-auto-flow:row!important;grid-auto-columns:auto!important;gap:0!important;min-width:0!important;margin:0!important;padding:0!important;overflow:visible!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-digest article{position:relative!important;display:grid!important;grid-template-columns:30px minmax(0,1fr)!important;gap:6px 10px!important;padding:10px 0 12px!important;margin:0!important;min-width:0!important;background:transparent!important;border:0!important;border-bottom:1px solid rgba(var(--csh-bg-rgb),.10)!important;border-radius:0!important;box-shadow:none!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-avatar{position:static!important;display:grid!important;place-items:center!important;grid-row:1/3!important;align-self:start!important;width:30px!important;height:34px!important;border:1px solid rgba(var(--csh-accent-rgb),.35)!important;border-radius:6px!important;color:var(--csh-accent)!important;background:rgba(var(--csh-accent-rgb),.06)!important;font:600 var(--csh-lfs-lg2,15px)/1 SimSun,serif!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-digest b{position:static!important;grid-column:2!important;display:block!important;min-width:0!important;margin:0!important;font:600 var(--csh-lfs-md,13px)/1.5 "Microsoft YaHei",sans-serif!important;color:var(--csh-bg)!important;overflow-wrap:anywhere!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-digest p{position:static!important;grid-column:2!important;min-width:0!important;margin:0!important;white-space:normal!important;overflow-wrap:anywhere!important;font:400 var(--csh-lfs-sm,12px)/1.55 "Microsoft YaHei",sans-serif!important;color:var(--csh-gray)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-digest button{position:static!important;grid-column:2!important;justify-self:start!important;min-height:44px!important;margin:0!important;padding:6px 10px!important;background:transparent!important;border:1px solid rgba(var(--csh-bg-rgb),.22)!important;border-radius:5px!important;color:var(--csh-bg)!important;font:500 var(--csh-lfs-sm,12px)/1.4 "Microsoft YaHei",sans-serif!important;cursor:pointer!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-relationship{position:static!important;grid-column:2!important;display:block!important;min-width:0!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-relationship summary{position:static!important;display:flex!important;flex-wrap:wrap!important;align-items:center!important;gap:2px 8px!important;min-height:44px!important;min-width:0!important;padding:3px 0!important;list-style:none!important;cursor:pointer!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-relationship summary::-webkit-details-marker{display:none!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-relationship summary b{flex:1 1 100%!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-record-hint{font:400 var(--csh-lfs-sm,12px)/1.4 "Microsoft YaHei",sans-serif!important;color:var(--csh-gray)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-record-hint::after{content:" ▾"}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-relationship[open] .csh-world-record-hint::after{content:" ▴"}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-relationship summary:focus-visible{outline:2px solid var(--csh-accent)!important;outline-offset:2px!important;border-radius:3px!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-relationship[open] .csh-world-record{display:grid!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-record{position:static!important;display:none!important;gap:6px!important;padding:8px 0!important;border-top:1px solid rgba(var(--csh-bg-rgb),.12)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-invite-actions{position:static!important;grid-column:2!important;display:flex!important;gap:6px!important;align-items:center!important;flex-wrap:wrap!important;min-width:0!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-news{position:static!important;display:grid!important;gap:10px!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-news p{position:static!important;margin:0!important;padding-left:10px!important;border-left:2px solid rgba(var(--csh-accent-rgb),.25)!important;color:var(--csh-gray)!important;font:400 var(--csh-lfs-sm,12px)/1.65 "Microsoft YaHei",sans-serif!important;overflow-wrap:anywhere!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-news time{color:var(--csh-bg)!important;margin-right:6px!important}
@media(min-width:1200px){html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-services{grid-template-columns:repeat(3,minmax(0,1fr))!important}}
@media(max-height:500px){html.csh-world-view #csh-dbg-panel[data-view="world"] #csh-dbg-body{padding:8px 16px 16px!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-board{gap:12px!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-columns{gap:16px!important;grid-template-columns:minmax(0,1fr) minmax(228px,.45fr)!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-side{padding-left:14px!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-primary{gap:16px!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-tables button.csh-dbg-gamebtn{min-height:88px!important;padding:10px 12px 10px 56px!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-tables .gb-name{font-size:var(--csh-lfs-xl,16px)!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-mark{left:13px!important;width:29px!important;height:34px!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-hero{min-height:52px!important;padding:4px 10px!important}}
@media(max-width:760px) and (orientation:landscape){html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-columns{grid-template-columns:minmax(0,1fr) 196px!important;gap:12px!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-side{padding-left:12px!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-hero>div{flex-basis:240px!important}html.csh-world-view #csh-dbg-panel[data-view="world"] #csh-dbg-body{padding:6px 12px 12px!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .gb-tag{display:none!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-tables .gb-desc{font-size:var(--csh-lfs-sm,12px)!important}}

html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-reading>:not(.csh-world-board){display:none!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] :is(.csh-world-hero,.csh-world-columns)[hidden]{display:none!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-side-head{position:static!important;display:flex!important;align-items:center!important;gap:8px!important;min-width:0!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-side-head h3{flex:1!important;margin:0!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] :is(.csh-world-open-memory,.csh-world-read-memory){position:static!important;min-width:44px!important;min-height:44px!important;padding:6px 10px!important;margin:0!important;border:1px solid rgba(var(--csh-accent-rgb),.45)!important;border-radius:5px!important;background:transparent!important;color:var(--csh-bg)!important;font:500 var(--csh-lfs-sm,12px)/1.4 "Microsoft YaHei",sans-serif!important;white-space:normal!important;cursor:pointer!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-memory{position:static!important;display:grid!important;gap:18px!important;min-width:0!important;font:400 var(--csh-lfs-md,13px)/1.6 "Microsoft YaHei",sans-serif!important;color:var(--csh-bg)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-memory :is(div,section,header,footer,h3,h4,p,span,b,dl,dt,dd,ol,li,label,time){position:static!important;min-width:0!important;margin:0!important;box-sizing:border-box!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-toolbar{display:flex!important;align-items:center!important;justify-content:space-between!important;flex-wrap:wrap!important;gap:8px 16px!important;padding:0 0 10px!important;border-bottom:1px solid rgba(var(--csh-bg-rgb),.16)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-memory button{position:static!important;min-width:44px!important;min-height:44px!important;padding:8px 14px!important;margin:0!important;border:1px solid rgba(var(--csh-bg-rgb),.25)!important;border-radius:5px!important;background:transparent!important;color:var(--csh-bg)!important;font:500 var(--csh-lfs-md,13px)/1.4 "Microsoft YaHei",sans-serif!important;cursor:pointer!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-memory :is(button,select):focus-visible{outline:2px solid var(--csh-accent)!important;outline-offset:2px!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-memory button:disabled{opacity:.6!important;cursor:default!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-picker{display:flex!important;align-items:center!important;gap:10px!important;max-width:100%!important;color:var(--csh-gray)!important;font-size:var(--csh-lfs-sm,12px)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-picker select{position:static!important;width:220px!important;max-width:100%!important;min-width:0!important;min-height:44px!important;padding:7px 30px 7px 10px!important;border:1px solid rgba(var(--csh-bg-rgb),.2)!important;border-radius:5px!important;background:var(--csh-fg)!important;color:var(--csh-bg)!important;font:400 var(--csh-lfs-md,13px)/1.4 "Microsoft YaHei",sans-serif!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-pages{display:grid!important;grid-template-columns:minmax(170px,.32fr) minmax(0,1fr)!important;gap:30px!important;align-items:start!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-person{display:grid!important;gap:12px!important;padding-right:24px!important;border-right:1px solid rgba(var(--csh-bg-rgb),.14)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-seal{display:grid!important;place-items:center!important;width:64px!important;height:72px!important;border:1px solid rgba(var(--csh-accent-rgb),.55)!important;border-radius:7px 7px 20px 7px!important;background:linear-gradient(145deg,rgba(var(--csh-accent-rgb),.12),transparent)!important;color:var(--csh-accent)!important;font:500 var(--csh-lfs-3xl2,30px)/1 SimSun,serif!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-person h3{font:600 var(--csh-lfs-title,20px)/1.4 SimSun,serif!important;overflow-wrap:anywhere!important;color:var(--csh-bg)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-person p{font:400 var(--csh-lfs-sm,12px)/1.6 "Microsoft YaHei",sans-serif!important;color:var(--csh-gray)!important;overflow-wrap:anywhere!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-person footer{display:grid!important;gap:8px!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-actions{display:flex!important;flex-wrap:wrap!important;gap:8px!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-cancel[hidden]{display:none!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-person .csh-memory-invite{justify-self:start!important;border-color:var(--csh-accent)!important;color:var(--csh-bg)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-content{display:grid!important;gap:20px!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-intro{font:400 var(--csh-lfs-lg2,15px)/1.75 SimSun,serif!important;color:var(--csh-bg)!important;overflow-wrap:anywhere!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-facts{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:10px!important;padding:14px 0!important;border-top:1px solid rgba(var(--csh-bg-rgb),.12)!important;border-bottom:1px solid rgba(var(--csh-bg-rgb),.12)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-facts dt{color:var(--csh-gray)!important;font:400 var(--csh-lfs-sm,12px)/1.5 "Microsoft YaHei",sans-serif!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-facts dd{color:var(--csh-bg)!important;font:500 var(--csh-lfs-2xl,22px)/1.4 SimSun,serif!important;font-variant-numeric:tabular-nums!important;overflow-wrap:anywhere!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-content h4{color:var(--csh-gray)!important;font:500 var(--csh-lfs-md,13px)/1.5 "Microsoft YaHei",sans-serif!important;letter-spacing:.06em!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-content .csh-memory-note{color:var(--csh-gray)!important;font:400 var(--csh-lfs-sm,12px)/1.6 "Microsoft YaHei",sans-serif!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-timeline{display:grid!important;gap:0!important;list-style:none!important;padding:0!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-timeline li{display:grid!important;grid-template-columns:96px minmax(0,1fr)!important;gap:6px 16px!important;padding:14px 0!important;border-bottom:1px solid rgba(var(--csh-bg-rgb),.10)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-timeline time{font:400 var(--csh-lfs-sm,12px)/1.6 "Microsoft YaHei",sans-serif!important;color:var(--csh-gray)!important;font-variant-numeric:tabular-nums!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-timeline b{font:500 var(--csh-lfs-lg,14px)/1.6 SimSun,serif!important;color:var(--csh-bg)!important}
html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-timeline p{font:400 var(--csh-lfs-sm,12px)/1.7 "Microsoft YaHei",sans-serif!important;color:var(--csh-gray)!important;overflow-wrap:anywhere!important}
@media(max-height:500px){html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-memory{gap:12px!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-pages{gap:20px!important;grid-template-columns:170px minmax(0,1fr)!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-person{padding-right:16px!important;gap:8px!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-seal{width:44px!important;height:48px!important;font-size:var(--csh-lfs-display,24px)!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-content{gap:12px!important}}
@media(max-width:760px) and (orientation:landscape){html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-pages{grid-template-columns:140px minmax(0,1fr)!important;gap:14px!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-person{padding-right:12px!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-person h3{font-size:var(--csh-lfs-xl2,17px)!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-picker select{width:180px!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-timeline li{grid-template-columns:82px minmax(0,1fr)!important;gap:6px 10px!important}html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-memory-facts dd{font-size:var(--csh-lfs-title,20px)!important}}

@media(forced-colors:active){html.csh-world-view #csh-dbg-panel[data-view="world"] button.csh-dbg-gamebtn,html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-hero,html.csh-world-view #csh-dbg-panel[data-view="world"] .csh-world-digest button{border:1px solid ButtonText!important;background:Canvas!important;color:CanvasText!important}}
`;(document.head||document.documentElement).appendChild(s);}
 // Personal records are read only when requested; AI world totals are not your meetings.
 function relationship(story,W,onRead){
  var detail=node('details','csh-world-relationship'),summary=node('summary'),title=node('b','',story.name+' · '+story.persona),hint=node('span','csh-world-record-hint','相识记录'),content=node('div','csh-world-record');
  summary.setAttribute('aria-label','查看'+story.name+'的相识记录');summary.appendChild(title);summary.appendChild(hint);detail.appendChild(summary);detail.appendChild(content);
  detail.addEventListener('toggle',function(){
   if(!detail.open)return;
   content.textContent='';
   var person;
   try{person=W&&W.byId?W.byId(story.id):null;}catch(e){content.appendChild(node('p','','相识记录暂未读取，请收起后重试。'));return;}
   if(!person){content.appendChild(node('p','','这位牌友目前不在名录中。'));return;}
   var persona=W.PERSONAS&&W.PERSONAS[person.persona];
   content.appendChild(node('p','', '牌风：'+(persona&&persona.name||story.persona)+' · '+(person.retired||Number(person.fund)<200?'暂未在场':'当前在场')));
   var p=person.withPlayer||{},count=function(value){return Number.isSafeInteger(value)&&value>=0?value:0;},hands=count(p.hands);
   var read=node('button','csh-world-read-memory','翻开回忆册');read.type='button';read.addEventListener('click',function(){onRead(story.id,read);});
   if(!hands){content.appendChild(node('p','','尚无与你同桌的记录。完成一手后，这里会留下你们的交集。'));content.appendChild(read);return;}
   var wins=Math.min(hands,count(p.wins)),losses=Math.min(hands-wins,count(p.losses)),draws=Math.min(hands-wins-losses,count(p.draws));
   content.appendChild(node('p','', '与你同桌 '+fmt(hands)+' 手；你 '+fmt(wins)+' 胜、'+fmt(losses)+' 负、'+fmt(draws)+' 和。'));
   var unknown=hands-wins-losses-draws;if(unknown)content.appendChild(node('p','', '另有 '+fmt(unknown)+' 手尚未记录胜负。'));content.appendChild(read);
  });
  return detail;
 }
 // Small semantic marks share one stroke language; no player text enters SVG markup.
 function decorateCard(card){
  var name=card.querySelector('.gb-name').textContent,paths={
   '德州扑克':'M13 8h22v30H13z M19 14h10v18H19z M24 19l4 5-4 5-4-5z',
   '斗地主':'M9 15h18v25H9z M21 8h18v25H28 M15 21l3 4-3 4-3-4z M28 14h5 M28 19h5',
   '廿一点':'M12 7h24v34H12z M18 15h12 M24 15v18 M18 33h12',
   'UNO':'M14 7h20l5 9v22H14z M20 15h12v16H20z M8 14v28h22',
   '生涯大厅':'M24 6l15 9v19l-15 9-15-9V15z M17 33V22h14v11 M20 17h8',
   '讨伐录':'M12 6l24 31 M36 6L12 37 M8 31l9 9 M31 31l9 9 M15 8l-4 7 M33 8l4 7',
   '天下榜':'M8 39h32 M12 39V25h8v14 M20 39V12h8v27 M28 39V19h8v20',
   '行囊':'M10 17h28v23H10z M17 17v-6h14v6 M10 25h28 M21 22h6v7h-6z',
   '池子成就':'M24 6l13 8v16l-13 8-13-8V14z M19 35l-3 9 8-4 8 4-3-9 M24 14l3 6 6 1-5 5 1 6-5-3-5 3 1-6-5-5 6-1z',
   '金鳞市':'M10 37h28 M15 29V13 M11 18h8v8h-8z M31 34V7 M27 13h8v12h-8z',
   '妖灵图鉴':'M12 10h12v29H12z M24 10h12v29H24 M17 17h3 M17 23h3 M28 17h4 M28 23h4 M10 40h28'
  };
  var mark=node('span','csh-world-mark'),ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg'),p=document.createElementNS(ns,'path');mark.setAttribute('aria-hidden','true');svg.setAttribute('viewBox','0 0 48 48');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.5');svg.setAttribute('stroke-linejoin','round');svg.setAttribute('stroke-linecap','round');svg.setAttribute('focusable','false');p.setAttribute('d',paths[name]||paths['生涯大厅']);svg.appendChild(p);mark.appendChild(svg);card.insertBefore(mark,card.firstChild);
 }
 function mount(opt){css();var body=opt.body,list=opt.list,lib=opt.lib,open=opt.openGame,W=lib.cshWorld,facts=W&&W.stats?W.stats():{},snap=lib.cshShell&&lib.cshShell.walletSnapshot?lib.cshShell.walletSnapshot():null;
  var board=node('div','csh-world-board'),head=node('section','csh-world-hero'),intro=node('div');head.setAttribute('aria-label','我的近况');intro.appendChild(node('h2','',snap?'池子币 '+fmt(snap.pc)+' CBY':'我的池子世界'));intro.appendChild(node('p','',(snap?(snap.signedToday?'今日已签到':'今日尚未签到')+' · ':'')+'相识 '+(facts.playerOpponents||0)+' 人 · 同桌 '+(facts.playerHands||0)+' 人次 · 在场 '+Math.max(0,(facts.chars||0)-(facts.retired||0))+' 人'));var pending=lib.cshWallet&&lib.cshWallet.pending&&lib.cshWallet.pending.status();if(pending&&(pending.count||pending.error)){var pendingText=pending.error?'待保存结果处理遇到问题，请到行囊检查':'有 '+pending.count+' 项结果待保存';if(pending.volatile)pendingText+=' · 部分结果尚未写入本机，请保持页面打开';var pendingNote=node('p','csh-world-save-warning',pendingText);pendingNote.setAttribute('role','status');intro.appendChild(pendingNote);var repair=node('button','csh-world-start',pending.error?'去行囊检查':'去行囊恢复');repair.type='button';repair.addEventListener('click',function(){open('save');});head.appendChild(repair);}head.appendChild(intro);var begin=node('button','csh-world-start','去德州牌桌');begin.type='button';begin.addEventListener('click',function(){open('texas');});head.appendChild(begin);board.appendChild(head);
  var columns=node('div','csh-world-columns'),side=node('aside','csh-world-side');side.setAttribute('aria-label','与你有关与世界动态');
  var cards=[].slice.call(list.querySelectorAll('button.csh-dbg-gamebtn'));list.textContent='';var grouped=new Set();
  var tables=node('section','csh-world-tables'),services=node('section','csh-world-services');tables.setAttribute('aria-label','休闲牌桌');services.setAttribute('aria-label','生涯、收藏与记录');list.classList.add('csh-world-primary');
  function group(title,pick,target){var selected=cards.filter(function(c){return !grouped.has(c)&&pick(c);});if(!selected.length)return;target.appendChild(node('h3','csh-world-section',title));selected.forEach(function(c){grouped.add(c);decorateCard(c);target.appendChild(c);});}
  group('休闲牌桌',function(c){return c.classList.contains('gb-table');},tables);group('生涯与记录',function(c){return !c.classList.contains('gb-goldfish')&&!c.classList.contains('gb-codex')&&!c.classList.contains('locked');},services);group('妖灵与市集',function(c){return c.classList.contains('gb-goldfish')||c.classList.contains('gb-codex');},services);group('其他',function(){return true;},services);list.appendChild(tables);list.appendChild(services);
  columns.appendChild(list);var digest=node('section','csh-world-digest');digest.setAttribute('aria-label','与你有关的牌友');var sideHead=node('div','csh-world-side-head'),memoryEntry=node('button','csh-world-open-memory','回忆册');memoryEntry.type='button';memoryEntry.addEventListener('click',function(){openMemory(null,memoryEntry);});sideHead.appendChild(node('h3','csh-world-section',facts.playerOpponents?'与你有关 · 牌友邀约':'初识牌友 · 可以邀约'));sideHead.appendChild(memoryEntry);side.appendChild(sideHead);
  function renderStories(focusId){
   var opened=new Set([].slice.call(digest.querySelectorAll('article')).filter(function(a){return a.querySelector('details').open;}).map(function(a){return a.getAttribute('data-person');}));
   digest.textContent='';
   var stories=W&&W.storylines?W.storylines(3):[];
   stories.forEach(function(story){
    var article=node('article'),title=relationship(story,W,openMemory);title.open=opened.has(String(story.id));
    article.setAttribute('data-person',story.id);
    var text=node('p','',story.invited&&story.response?'「'+story.response+'」 带入合适时优先同桌。':story.text);
    var actions=node('div','csh-world-invite-actions'),action=node('button','',story.invited?'去牌桌':'邀下一桌');action.type='button';
    action.addEventListener('click',function(){
     var r=W.inviteNext(story.id);
     if(!r.ok){if(lib.cshUI)lib.cshUI.toast(r.reason);return;}
     renderStories(story.id);
     if(!r.repeated&&lib.cshUI)lib.cshUI.toast(r.name+'：「'+r.response+'」');
     open('texas');
    });actions.appendChild(action);
    if(story.invited&&W.cancelInvite){
     var cancel=node('button','', '取消邀约');cancel.type='button';cancel.setAttribute('aria-label','取消对'+story.name+'的邀约');
     cancel.addEventListener('click',function(){var r=W.cancelInvite(story.id);if(r.ok)renderStories(story.id);else if(lib.cshUI)lib.cshUI.toast(r.reason);});actions.appendChild(cancel);
    }
    var avatar=node('span','csh-world-avatar',Array.from(story.name||'友')[0]);avatar.setAttribute('aria-hidden','true');article.appendChild(avatar);article.appendChild(title);article.appendChild(text);article.appendChild(actions);digest.appendChild(article);
   });
   if(!stories.length)digest.appendChild(node('p','','还没有同桌记录。去牌桌认识第一位牌友。'));
   if(focusId!=null){var row=[].slice.call(digest.querySelectorAll('article')).find(function(n){return n.getAttribute('data-person')===String(focusId);});if(row)row.querySelector('.csh-world-invite-actions button').focus({preventScroll:true});}
  }

  var talkChoices=new Map(),recordOpen=new Map();
  var reader=null,returnTo=null,returnPerson=null,savedScroll=0,hiddenSiblings=[],scrollHost=body.closest("#csh-dbg-body")||body;
  function closeMemory(){
   if(!reader)return false;reader.remove();reader=null;body.classList.remove("csh-memory-reading");hiddenSiblings.forEach(function(item){
    var n=item.node;if(n.getAttribute('style')===item.masked){if(item.original==null)n.removeAttribute('style');else n.setAttribute('style',item.original);}
    else if(n.style.getPropertyValue('display')==='none'&&n.style.getPropertyPriority('display')==='important'){if(item.display)n.style.setProperty('display',item.display,item.priority);else n.style.removeProperty('display');}
   });hiddenSiblings=[];head.hidden=false;columns.hidden=false;columns.removeAttribute('inert');scrollHost.scrollTop=savedScroll;
   var target=returnTo&&returnTo.isConnected?returnTo:null;
   if(!target&&returnPerson!=null){var row=[].slice.call(digest.querySelectorAll('article')).find(function(n){return n.getAttribute('data-person')===returnPerson;});target=row&&row.querySelector('summary');}
   if(!target)target=memoryEntry;target.focus({preventScroll:true});return true;
  }
  board.__closeMemory=closeMemory;
  function openMemory(id,opener){
   if(!reader){savedScroll=scrollHost.scrollTop;hiddenSiblings=[].slice.call(body.children).filter(function(n){return n!==board;}).map(function(n){var record={node:n,original:n.getAttribute('style'),display:n.style.getPropertyValue('display'),priority:n.style.getPropertyPriority('display')};n.style.setProperty('display','none','important');record.masked=n.getAttribute('style');return record;});returnTo=opener;var origin=opener&&opener.closest('article');returnPerson=origin&&origin.getAttribute('data-person');}
   else reader.remove();
   body.classList.add("csh-memory-reading");reader=node('section','csh-world-memory');reader.setAttribute('aria-label','牌友回忆册');head.hidden=true;columns.hidden=true;columns.setAttribute('inert','');
   var toolbar=node('header','csh-memory-toolbar'),back=node('button','csh-memory-back','返回牌友');back.type='button';back.addEventListener('click',closeMemory);toolbar.appendChild(back);reader.appendChild(toolbar);board.insertBefore(reader,columns);scrollHost.scrollTop=0;
   var model;try{model=memoryOf(W,id);}catch(error){var failure=node('p','csh-memory-note','相识记录暂未读取，请返回后重试。');failure.setAttribute('role','status');reader.appendChild(failure);back.focus({preventScroll:true});return;}
   if(!model.person){reader.appendChild(node('p','csh-memory-note','还没有同桌回忆。完成一手后，再来翻翻你们的故事。'));back.focus({preventScroll:true});return;}
   var picker=node('label','csh-memory-picker','牌友回忆'),select=node('select');select.setAttribute('aria-label','选择回忆中的牌友');model.choices.forEach(function(a){var option=node('option','',a.name);option.value=String(a.id);select.appendChild(option);});select.value=String(model.person.id);select.addEventListener('change',function(){openMemory(select.value,opener);var next=reader.querySelector('select');if(next)next.focus({preventScroll:true});});picker.appendChild(select);toolbar.appendChild(picker);
   var pages=node('div','csh-memory-pages'),profile=node('section','csh-memory-person'),seal=node('span','csh-memory-seal',Array.from(model.person.name||'友')[0]);seal.setAttribute('aria-hidden','true');profile.appendChild(seal);profile.appendChild(node('h3','',model.person.name));profile.appendChild(node('p','',model.person.persona+' · '+(model.person.available?'当前在场':'暂未在场')));if(model.person.description)profile.appendChild(node('p','',model.person.description));
   var footer=node('footer'),actions=node('div','csh-memory-actions'),invite=node('button','csh-memory-invite'),cancel=node('button','csh-memory-cancel','撤回邀约'),reply=node('p'),currentReader=reader;
   invite.type=cancel.type='button';reply.setAttribute('role','status');cancel.setAttribute('aria-label','撤回对'+model.person.name+'的邀约');
   function currentMemory(){return reader===currentReader&&currentReader.isConnected;}
   function syncInvite(fallback){
    var pending=fallback||null;
    try{if(W.storylines)pending=W.storylines(6).find(function(row){return String(row.id)===String(model.person.id)&&row.invited;})||null;}catch(e){}
    var eligibility=null;try{if(typeof W.inviteStatus==='function')eligibility=W.inviteStatus(model.person.id);}catch(e){eligibility={ok:false,reason:'邀约状态暂未读取，请稍后重试'};}
    invite.textContent=!model.person.available?'暂未在场':pending?'去牌桌':'邀下一桌';invite.disabled=!model.person.available||!!(eligibility&&!eligibility.ok);
    if(!pending)reply.textContent=eligibility&&!eligibility.ok?eligibility.reason||'暂时无法应邀':'';
    cancel.hidden=!pending||typeof W.cancelInvite!=='function';
    if(pending)reply.textContent=(pending.response?'「'+pending.response+'」 ':'')+'邀约已留，带入合适时优先同桌。';
    return !!pending;
   }
   invite.addEventListener('click',function(){
    if(!currentMemory())return;
    var r;try{r=W.inviteNext(model.person.id);}catch(e){reply.textContent='邀约暂未确认，请稍后重试。';return;}
    if(!r||!r.ok){reply.textContent=r&&r.reason||'这位牌友暂时无法应邀。';return;}
    syncInvite({invited:true,response:r.response});renderStories();open('texas');
   });
   cancel.addEventListener('click',function(){
    if(!currentMemory()||typeof W.cancelInvite!=='function')return;
    var r;try{r=W.cancelInvite(model.person.id);}catch(e){reply.textContent='撤回暂未完成，请稍后重试。';return;}
    if(!r||!r.ok){syncInvite();reply.textContent=r&&r.reason||'撤回暂未完成，请稍后重试。';if(cancel.hidden)invite.focus({preventScroll:true});return;}
    syncInvite();reply.textContent='邀约已撤回，仍可继续阅读这段牌缘。';renderStories();invite.focus({preventScroll:true});
   });
   syncInvite();actions.appendChild(invite);actions.appendChild(cancel);footer.appendChild(actions);footer.appendChild(reply);profile.appendChild(footer);pages.appendChild(profile);
   var content=node('section','csh-memory-content');content.appendChild(node('p','csh-memory-intro',model.text));
   content.appendChild(renderConversation(W,model,{current:currentMemory,choices:talkChoices,refresh:function(){openMemory(model.person.id,opener);var target=reader.querySelector('.csh-memory-topic select');if(target)target.focus({preventScroll:true});}}));
   var records=node('details','csh-memory-records'),recordsSummary=node('summary','','相识记录与片段');records.appendChild(recordsSummary);records.open=recordOpen.get(String(model.person.id))===true;records.addEventListener('toggle',function(){if(currentMemory())recordOpen.set(String(model.person.id),records.open);});content.appendChild(records);
   var totals=node('dl','csh-memory-facts');[['同桌',model.facts.hands],['你胜',model.facts.wins],['你负',model.facts.losses],['和局',model.facts.draws]].forEach(function(pair){var group=node('div');group.appendChild(node('dt','',pair[0]));group.appendChild(node('dd','',fmt(pair[1])));totals.appendChild(group);});records.appendChild(totals);
   if(model.facts.unknown)records.appendChild(node('p','csh-memory-note','另有 '+fmt(model.facts.unknown)+' 手尚未记录胜负。'));
   records.appendChild(node('h4','','留下的片段'));var timeline=node('ol','csh-memory-timeline');model.fragments.forEach(function(row){var li=node('li'),time=node('time','',row.date||'日期未记'),words=node('div');if(row.date)time.setAttribute('datetime',row.date);words.appendChild(node('b','',row.title));words.appendChild(node('p','',row.text));li.appendChild(time);li.appendChild(words);timeline.appendChild(li);});if(!model.fragments.length)records.appendChild(node('p','csh-memory-note','还没有留下同桌片段。'));else records.appendChild(timeline);pages.appendChild(content);reader.appendChild(pages);back.focus({preventScroll:true});
  }

  renderStories();side.appendChild(digest);
  side.appendChild(node('h3','csh-world-section','世界近况'));var news=node('section','csh-world-news'),events=W&&W.news?W.news(3):[];events.forEach(function(e){var p=node('p');if(e.when&&String(e.text).indexOf(e.when)!==0)p.appendChild(node('time','',e.when+' '));p.appendChild(document.createTextNode(e.text));news.appendChild(p);});if(!events.length)news.appendChild(node('p','','最近暂无新动态。完成一桌后，这里会留下真实的胜负与相遇。'));side.appendChild(news);columns.appendChild(side);board.appendChild(columns);body.insertBefore(board,body.firstChild);return board;
 }
 root.CSHWorldView={mount:mount,memoryOf:memoryOf};
})(typeof window!=='undefined'?window:globalThis);
