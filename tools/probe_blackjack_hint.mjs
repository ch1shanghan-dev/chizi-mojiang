import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {fileURLToPath} from 'node:url';import {parse,walk} from './lib/skill_audit.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),arg=(k,d)=>{const i=process.argv.indexOf(k);return i<0?d:process.argv[i+1];},sourceRoot=arg('--source',root),out=arg('--out');if(!out)throw Error('External --out required');
const html=fs.readFileSync(sourceRoot+'/games/blackjack/blackjack.html','utf8'),s=html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],c=vm.createContext({}),rows=[],check=(name,ok,detail)=>rows.push({name,passed:!!ok,...(!ok?{detail}:{})});
walk(parse(s),n=>{if(n.type==='FunctionDeclaration'&&['cardRank','bjValue','bjPairValue','bjBasic','canDoubleNow','renderHint'].includes(n.id.name))vm.runInContext(s.slice(...n.range),c);});
const card=(r,s=0)=>(r<<2)|s;let count=0;
for(const up of [5,6])for(const canDouble of [false,true])for(const canSplit of [false,true]){const actual=c.bjBasic([card(4),card(4,1)],card(up),canDouble,canSplit,true);check('NDAS 4,4 versus '+up+' flags '+canDouble+'/'+canSplit,actual==='hit',actual);count++;}
check('split Aces advice unchanged',c.bjBasic([card(14),card(14,1)],card(6),true,true,true)==='split');
check('split Eights advice unchanged',c.bjBasic([card(8),card(8,1)],card(10),true,true,true)==='split');
check('Tens still stand',c.bjBasic([card(10),card(13)],card(6),true,true,true)==='stand');
c.state={chips:1000,hands:[]};check('actual table still forbids doubling a split hand',!c.canDoubleNow({cards:[card(4),card(6)],wager:100,fromSplit:true}));
const el={classList:{remove(){},add(){}},innerHTML:''};c.$=()=>el;c.ACT_NAME={hit:'要牌',split:'分牌',stand:'停牌'};c.set={hintOn:true};c.lastCan={canDouble:true,canSplit:true,canSurr:true};
for(const up of [5,6]){c.state={phase:'play',activeHand:0,hands:[{cards:[card(4),card(4,1)],done:false}],dealer:[card(up)]};c.renderHint();check('actual rendered hint says hit versus '+up,el.innerHTML.includes('要牌')&&!el.innerHTML.includes('分牌'),el.innerHTML);}
const result={scope:'Actual blackjack strategy, NDAS guard and hint renderer; isolated state only',passed:rows.filter(r=>r.passed).length,failed:rows.filter(r=>!r.passed).length,rows};fs.writeFileSync(out,JSON.stringify(result,null,2));console.log(JSON.stringify({passed:result.passed,failed:result.failed,failures:rows.filter(r=>!r.passed)},null,2));if(result.failed)process.exitCode=1;
