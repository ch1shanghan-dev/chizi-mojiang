import { lib, game, ui, get, ai, _status } from "../../../noname.js";
// 池子魔将 · 胜负统计（从 extension.js 拆出）
// [胜负统计] 单机身份场武将胜负记录与统计面板（联机统计已移除）
    (function(){
        if(lib.csh_winrate) return;
        var STAT_KEY="extension_池子魔将_winrateData";
        var MODE_NAMES={identity:"身份场",versus:"对决",doudizhu:"斗地主",guozhan:"国战"};
        var PAGE_SIZE=10;
        var wr={mode:"identity",view:"list",sortKey:"winrate",sortAsc:false,page:0,dialog:null,minGames:5,search:"",_undo:null};

        // Debug 二次安全封装：lib.cshDebug 不存在或其方法抛异常时，绝不能影响原生结算
        function dbgError(msg, err){
            try{
                if(lib.cshDebug&&typeof lib.cshDebug.error=="function"){
                    lib.cshDebug.error("winrate: "+msg, err);
                }else{
                    console.log("胜负统计异常", msg, err);
                }
            }catch(_e){}
        }
        function dbgInfo(msg, data){
            try{
                if(lib.cshDebug&&typeof lib.cshDebug.info=="function"){
                    lib.cshDebug.info("winrate: "+msg, data);
                }
            }catch(_e){}
        }

        function readData(){
            var d=lib.config[STAT_KEY];
            if(!d||typeof d!="object"||Array.isArray(d)) d={};
            var needSave=false;
            function cleanWL(e){ // 通用清洗：{games,win,lose}数值校验、平局残留清除、场次对账；返回是否有有效数据
                if(!e||typeof e!="object"||Array.isArray(e)) return false;
                ["games","win","lose"].forEach(function(k){
                    if(typeof e[k]!="number"||!isFinite(e[k])||e[k]<0){ e[k]=0; needSave=true; }
                });
                if(e.draw){ delete e.draw; needSave=true; } // 身份场不存在平局：清除异常终局残留
                var csum=(e.win||0)+(e.lose||0);
                if(e.games!=csum){ e.games=csum; needSave=true; }
                return csum>0;
            }
            for(var m in d){
                if(m=="camps"||m=="me") continue; // 阵营胜率与玩家操控数据结构独立清洗
                var md=d[m];
                if(!md||typeof md!="object"||Array.isArray(md)){ delete d[m]; continue; }
                // 旧格式迁移：合并 online/offline 子结构为单份单机数据
                if(md.online||md.offline){
                    var flat={};
                    function absorb(src){
                        if(!src||typeof src!="object") return;
                        for(var n in src){
                            var e=src[n];
                            if(!e||!e.games) continue;
                            if(!flat[n]) flat[n]={games:0,win:0,lose:0,damage:0,damaged:0,gain:0,discard:0,kill:0};
                            for(var k in flat[n]){ if(typeof e[k]=="number") flat[n][k]+=e[k]; }
                        }
                    }
                    absorb(md.offline);
                    absorb(md.online);
                    d[m]=flat;
                    needSave=true;
                }
            }
            if(!d.identity||typeof d.identity!="object"||Array.isArray(d.identity)) d.identity={};
            // 确保对决/斗地主/国战数据桶存在
            ["versus","doudizhu","guozhan"].forEach(function(mk){
                if(!d[mk]||typeof d[mk]!="object"||Array.isArray(d[mk])) d[mk]={};
            });
            // 历史脏数据清洗：负值归零、平局残留清除、胜负合计与场次对账、无效条目删除
            var flat=d.identity;
            for(var n in flat){
                var e=flat[n];
                if(!e||typeof e!="object"){ delete flat[n]; needSave=true; continue; }
                if("name" in e){ delete e.name; needSave=true; }
                ["damage","damaged","gain","discard","kill"].forEach(function(k){
                    if(typeof e[k]!="number"||!isFinite(e[k])||e[k]<0){ e[k]=0; needSave=true; }
                });
                if(e.draw){ e.draw=0; needSave=true; } // 身份场不存在平局：历史平局计数为异常终局残留，直接清除
                ["win","lose"].forEach(function(k){ if(typeof e[k]!="number"||e[k]<0){ e[k]=0; needSave=true; } });
                var results=(e.win||0)+(e.lose||0);
                if(typeof e.games!="number"||e.games<0||e.games!=results){ e.games=results; needSave=true; }
                if(e.games<=0){ delete flat[n]; needSave=true; }
            }
            // 阵营胜率数据清洗：数值校验、平局残留清除、胜负合计与场次对账、空结构剔除
            if(d.camps&&typeof d.camps=="object"&&!Array.isArray(d.camps)){
                for(var c in d.camps){
                    if(!cleanWL(d.camps[c])){ delete d.camps[c]; needSave=true; }
                }
                if(!Object.keys(d.camps).length){ delete d.camps; needSave=true; }
            }
            else if(d.camps){ delete d.camps; needSave=true; }
            // 玩家操控数据清洗：chars（角色战绩）与 camps（身份战绩）两个子结构
            if(d.me&&typeof d.me=="object"&&!Array.isArray(d.me)){
                ["chars","camps"].forEach(function(k){
                    var md=d.me[k];
                    if(md===undefined) return;
                    if(!md||typeof md!="object"||Array.isArray(md)){ delete d.me[k]; needSave=true; return; }
                    for(var n in md){
                        if(!cleanWL(md[n])){ delete md[n]; needSave=true; }
                    }
                    if(!Object.keys(md).length){ delete d.me[k]; needSave=true; }
                });
                if(!Object.keys(d.me).length){ delete d.me; needSave=true; }
            }
            else if(d.me){ delete d.me; needSave=true; }
            /* 【2026-10-03 用户实机反馈】十常侍旧账合并（一次性、幂等）：
               把历史上按化身 id（scs_bilan / scs_zhaozhong…）记下的条目并回本体 shichangshi。
               依据两条事实：① 这些化身 id 只会出现在十常侍机制里，不是可单独选用的武将；
               ② 同一玩家的同一份 stat 每局被记两遍（name1 + name2）⇒
                  合并口径 = 各字段求和后折半（场次、胜负、伤害等量值都是"重复的同一份"，
                  折半即真实值：如 1 场 6 伤会记成 毕岚{1场,6伤} + 赵忠{1场,6伤}
                  → 求和 (2,12) 折半 = 1 场 6 伤 ✓）。
               只有 1 条孤例（理论上不该出现）时按原值并入，不折半 —— 宁可保守。
               幂等：合并后不再有 scs_ 键，且 charNames 已不再产生新键，故无需迁移标记。 */
            (function mergeShichangshi(){
                var merged=false;
                function mergeBucket(bucket){
                    if(!bucket||typeof bucket!="object"||Array.isArray(bucket)) return;
                    var sum=null,cnt=0;
                    for(var n in bucket){
                        if(n.indexOf("scs_")!==0) continue;
                        var e=bucket[n];
                        cnt++;
                        if(e&&typeof e=="object"){
                            if(!sum) sum={games:0,win:0,lose:0,damage:0,damaged:0,gain:0,discard:0,kill:0};
                            for(var k in sum){ if(typeof e[k]=="number"&&isFinite(e[k])) sum[k]+=e[k]; }
                        }
                        delete bucket[n];
                        merged=true;
                    }
                    if(!sum) return;
                    var dst=bucket.shichangshi;
                    if(!dst) dst=bucket.shichangshi={games:0,win:0,lose:0,damage:0,damaged:0,gain:0,discard:0,kill:0};
                    var div=cnt>=2?2:1;
                    for(var k2 in sum){ dst[k2]=(dst[k2]||0)+Math.round(sum[k2]/div); }
                }
                for(var m in d){
                    if(m=="camps"||m=="me") continue;
                    mergeBucket(d[m]);
                }
                if(d.me&&d.me.chars) mergeBucket(d.me.chars);
                if(merged) needSave=true;
            })();
            if(needSave) game.saveConfig(STAT_KEY,d);
            return d;
        }
        function modeKey(){
            var m=get.mode();
            if(m==="two"||m==="2v2") m="versus";
            if(m==="identity_normal") m="identity";
            return MODE_NAMES[m]?m:null;
        }
        function collect(player){
            var r={damage:0,damaged:0,gain:0,discard:0,kill:0};
            try{
                if(player&&Array.isArray(player.stat)){
                    for(var i=0;i<player.stat.length;i++){
                        var s=player.stat[i]||{};
                        // 钳制负值：伤害被回滚/防止时stat可能出现负数，避免场均伤害为负
                        if(typeof s.damage=="number"&&s.damage>0) r.damage+=s.damage;
                        if(typeof s.damaged=="number"&&s.damaged>0) r.damaged+=s.damaged;
                        if(typeof s.gain=="number"&&s.gain>0) r.gain+=s.gain;
                        if(typeof s.kill=="number"&&s.kill>0) r.kill+=s.kill;
                    }
                }
            }catch(e){ dbgError("collect stat", e); }
            try{
                if(player&&Array.isArray(player.actionHistory)){
                    for(var i=0;i<player.actionHistory.length;i++){
                        var loses=player.actionHistory[i]&&player.actionHistory[i].lose;
                        if(!Array.isArray(loses)) continue;
                        for(var j=0;j<loses.length;j++){
                            var ev=loses[j];
                            if(ev&&ev.type=="discard"&&Array.isArray(ev.cards)) r.discard+=ev.cards.length;
                        }
                    }
                }
            }catch(e){ dbgError("collect actionHistory", e); }
            return r;
        }
        /* 【2026-10-03 用户实机反馈】十常侍（shichangshi）特例：
           它的 name1/name2 不是「另一名武将」，而是**当前两名化身**的独立 id ——
           character/mobile/skill.js:17219/17222 把抽到的 first/chosen 直接写进
           player.name1 / player.name2，而每个化身在 translate 里各有名字
           （scs_bilan→毕岚、scs_zhaozhong→赵忠…，mobile/translate.js:751-778）。
           旧写法按 name1/name2 记账 ⇒ 一局被记成两条（用户截图：毕岚/赵忠 数据完全相同）。
           本体始终是 player.name === "shichangshi"，按本体记一条（translate → 十常侍）。 */
        function charNames(player){
            var arr=[];
            if(!player) return arr;
            try{
                if(player.name==="shichangshi") return ["shichangshi"];
            }catch(eScs){}
            if(player.name1) arr.push(player.name1);
            if(player.name2&&player.name2!=player.name1) arr.push(player.name2);
            if(!arr.length&&player.name) arr.push(player.name);
            return arr;
        }
        function record(mode,name,win,st){
            var d=readData();
            var e=d[mode][name];
            if(!e) e=d[mode][name]={games:0,win:0,lose:0,damage:0,damaged:0,gain:0,discard:0,kill:0};
            e.games++;
            if(win) e.win++;
            else e.lose++;
            e.damage+=st.damage;e.damaged+=st.damaged;e.gain+=st.gain;e.discard+=st.discard;e.kill+=st.kill;
            game.saveConfig(STAT_KEY,d);
        }
        // 阵营胜率分支：按身份（主/忠/反/内）累计胜负，展示时主忠合并
        function recordCamp(camp,win){
            var d=readData();
            if(!d.camps||typeof d.camps!="object"||Array.isArray(d.camps)) d.camps={};
            var e=d.camps[camp];
            if(!e) e=d.camps[camp]={games:0,win:0,lose:0};
            e.games++;
            if(win) e.win++;
            else e.lose++;
            game.saveConfig(STAT_KEY,d);
        }
        // 玩家操控统计：kind="chars"按角色、kind="camps"按身份，只记本地玩家自己的战绩
        function recordMe(kind,key,win){
            var d=readData();
            if(!d.me||typeof d.me!="object"||Array.isArray(d.me)) d.me={};
            if(!d.me[kind]||typeof d.me[kind]!="object"||Array.isArray(d.me[kind])) d.me[kind]={};
            var e=d.me[kind][key];
            if(!e) e=d.me[kind][key]={games:0,win:0,lose:0};
            e.games++;
            if(win) e.win++;
            else e.lose++;
            game.saveConfig(STAT_KEY,d);
        }
        function capture(result,result2){
            if(_status.over) return;
            if(_status.video) return;
            var mode=modeKey();
            if(!mode) return;
            // 联机对局不记录（联机统计功能已移除）
            if(game.online||_status.connectMode) return;
            var all=(game.players||[]).concat(game.dead||[]);
            if(Array.isArray(game.additionaldead)) all=all.concat(game.additionaldead);
            if(!all.length) return;
            if(result!==true&&result!==false) return; // 正常终局必为布尔；平局/异常终局（如谋攻篇无主公视角）不入账
            var useCheck=(typeof game.checkOnlineResult=="function");
            var me2=game.me?(game.me._trueMe||game.me):null;
            var seen={};
            for(var i=0;i<all.length;i++){
                var p=all[i];
                if(!p||!p.playerid||seen[p.playerid]) continue;
                seen[p.playerid]=true;
                var win=null;
                if(useCheck){
                    try{
                        var r=game.checkOnlineResult(p);
                        if(r===true) win=true;
                        else if(r===false) win=false;
                    }catch(e){ dbgError("checkOnlineResult", e); }
                }
                if(win===null && p==me2){
                    win=result;
                }
                // 对决/斗地主：按阵营与本地玩家同侧推算胜负（单机）
                if(win===null && me2 && (result===true||result===false)){
                    try{
                        if(mode==="versus" || mode==="guozhan"){
                            if(p.side!=null && me2.side!=null){
                                win=(p.side===me2.side)?result:!result;
                            }
                        }else if(mode==="doudizhu"){
                            var isLord=function(x){
                                if(!x) return false;
                                var id=x.identity;
                                return id==="zhu"||id==="dizhu"||id==="landlord";
                            };
                            if(p.identity && me2.identity){
                                win=(isLord(p)===isLord(me2))?result:!result;
                            }
                        }
                    }catch(eCamp){ dbgError("camp side judge", eCamp); }
                }
                if(win===null) continue; // 胜负无法判定（如谋攻篇无主公导致判定异常），该角色不入账；不猜测、不入账
                var st=collect(p);
                var nm=charNames(p);
                for(var j=0;j<nm.length;j++) record(mode,nm[j],win,st);
                // 阵营胜率：按身份入账，明忠并入忠臣；渲染时主忠合并
                var idn=p.identity;
                if(idn=="mingzhong") idn="zhong";
                if(idn=="zhu"||idn=="zhong"||idn=="fan"||idn=="nei"||idn=="commoner"){
                    recordCamp(idn,win);
                    // 玩家操控：本地玩家自己的角色战绩与身份战绩
                    if(p==me2){
                        for(var j=0;j<nm.length;j++) recordMe("chars",nm[j],win);
                        recordMe("camps",idn,win);
                    }
                }
            }
        }
        // 联机结算时引擎会把 game.over 序列化发送给客户端执行（clients[i].send(game.over,...)），
        // 包装函数体内严禁引用闭包变量：原始引用与统计入口挂到 game 属性上；
        // 未安装本扩展的联机客户端收到此函数时回退调用本端原生 game.over。
        // 幂等安装：本模块只包装一次；重复加载仅刷新 capture 指针，绝不形成 wrapper 套娃。
        // 注意：此处保存的是“安装本扩展时捕获到的上一层 game.over”，不一定是引擎真正原生实现；
        // 不解除其他扩展的 wrapper，也不猜测隐藏原生引用。
        game._csh_statsCapture = capture;
        if(!game._csh_winrateOverInstalled){
            if(typeof game.over!="function"){
                dbgError("game.over 不是函数，无法安装胜负统计包装", typeof game.over);
            }else{
                game._csh_originalOver = game.over;
                game.over = function (result) {
                    // 1) 统计捕获：任何异常都不能阻断后续原生结算
                    try {
                        if (!game.online && !_status.connectMode && typeof game._csh_statsCapture == "function") {
                            game._csh_statsCapture(result, arguments[1]);
                        }
                    } catch (e) {
                        dbgError("game.over 统计捕获异常", e);
                    }
                    // 2) 非核心：背景恢复，异常同样不得阻断
                    try {
                        if (_status.tempBackground == "ext:池子魔将/image/csh_lunjing_bg.jpg") {
                            delete _status.tempBackground;
                            if (typeof game.updateBackground == "function") game.updateBackground();
                        }
                    } catch (e) {
                        dbgError("game.over 背景恢复异常", e);
                    }
                    // 3) 无条件调用已保存的上一层 game.over；禁止回退到 game.over 自身（会无限递归）
                    var orig = game._csh_originalOver;
                    if (typeof orig == "function") {
                        return orig.apply(game, arguments);
                    }
                    dbgError("game._csh_originalOver 不可用，无法继续原生结算", typeof orig);
                };
                game._csh_winrateOverInstalled = true;
            }
        }

        function esc(str){
            return String(str).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
        }
        function cname(name){
            var t="";
            try{ t=get.translation(name); }catch(e){}
            if(!t||t==name) t=name;
            return t;
        }
        /** 引擎把 document.body 整体缩放（素版 transform:scale(documentZoom)，
         *  十周年UI 走 body.style.zoom）；面板挂在 documentElement 上不参与 body 缩放，
         *  因此必须用真实 CSS 像素布局。历史 bug：乘 documentZoom 后手机端（≈0.4）面板只剩
         *  四成且表格被挤出屏幕、PC 端（可达 2）又整体溢出。故 --csh-z 恒为 1。 */
        function uiScale(){
            return 1;
        }
        function uiHost(){
            return document.documentElement||document.body;
        }
        function ensureStyle(){
            if(document.getElementById("csh-winrate-style")) return;
            try{
                document.documentElement.style.setProperty("--csh-z","1");
            }catch(eZ){}
            var st=document.createElement("style");
            st.id="csh-winrate-style";
            st.textContent=[
                /* ---------- 动效 ---------- */
                "@keyframes cshWrFade{from{opacity:0;}to{opacity:1;}}",
                "@keyframes cshWrRise{from{opacity:0;transform:translateY(18px);}to{opacity:1;transform:translateY(0);}}",
                /* ---------- 遮罩 ---------- */
                /* 【2026-09-30 修复】原为 999999，低于 #csh-dbg-overlay 的 1000001
                   ⇒ 调试面板开着时打开胜负统计会被压在下面。
                   提到 1000003：高于调试面板(1000001)与局内互动(1000002)，与本扩展其它浮层一致。
                   （本 overlay 本身已正确挂在 documentElement 上，纯粹是数值差一档。） */
                "#csh-wr-overlay{position:fixed!important;left:0!important;top:0!important;width:100%!important;height:100%!important;z-index:1000003!important;",
                "display:flex!important;justify-content:center!important;box-sizing:border-box!important;",
                "padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)!important;",
                "background:radial-gradient(120% 80% at 50% 0%,rgba(216,180,106,.10),rgba(0,0,0,0) 60%),rgba(6,5,4,.86)!important;",
                "-webkit-backdrop-filter:blur(3px)!important;backdrop-filter:blur(3px)!important;",
                "font-family:'Microsoft YaHei','PingFang SC','STHeiti',sans-serif!important;animation:cshWrFade .18s ease-out!important;}",
                /* ---------- 面板外壳 ----------
                 * margin:auto + 去 align-items:center：内容高于屏幕时顶端不会被顶出可视区 */
                "#csh-wr-panel{position:relative!important;display:block!important;box-sizing:border-box!important;margin:auto!important;",
                /* overflow-x 用 auto 而非 hidden 兜底：【2026-10-01 紧凑化】后武将排行整表
                 * 约 680px，≥760px 视口一屏装完不再出现横滑条；更窄的视口回落为横滚
                 * （表格自带 min-width:640px + 前两列吸附），用 hidden 会直接裁掉右侧列。 */
                "width:min(94vw,1060px)!important;max-height:calc(100% - 14px)!important;overflow-y:auto!important;overflow-x:auto!important;",
                "-webkit-overflow-scrolling:touch!important;overscroll-behavior:contain!important;",
                "padding:18px 14px 14px!important;border-radius:18px!important;",
                "color:#ece5d6!important;background:linear-gradient(168deg,#1e1811 0%,#15110c 46%,#0b0a08 100%)!important;",
                "border:1px solid rgba(216,180,106,.6)!important;",
                "box-shadow:0 32px 84px rgba(0,0,0,.82),0 0 0 1px rgba(0,0,0,.5),0 0 90px rgba(216,180,106,.06) inset!important;",
                "animation:cshWrRise .24s cubic-bezier(.2,.8,.2,1)!important;}",
                "#csh-wr-panel::-webkit-scrollbar{width:9px;}",
                "#csh-wr-panel::-webkit-scrollbar-track{background:rgba(255,255,255,.03);}",
                "#csh-wr-panel::-webkit-scrollbar-thumb{background:rgba(216,180,106,.26);border-radius:5px;}",
                "#csh-wr-panel::-webkit-scrollbar-thumb:hover{background:rgba(216,180,106,.46);}",
                "#csh-wr-panel *{box-sizing:border-box!important;}",
                /* 引擎全局 div{position:absolute;display:inline-block;transition:all .5s} 必须整体复位 */
                "#csh-wr-panel div{position:static!important;display:block!important;}",
                "#csh-wr-panel span{position:static!important;display:inline-block!important;}",
                "#csh-wr-panel table,#csh-wr-panel thead,#csh-wr-panel tbody,#csh-wr-panel tr,#csh-wr-panel td,#csh-wr-panel th,#csh-wr-panel caption{position:static!important;}",
                /* ---------- 顶部：标题 / 口径 / 控件 ---------- */
                "#csh-wr-root{width:100%!important;font-size:14px;color:#ece5d6;text-align:left;line-height:1.5;}",
                /* 【2026-09-30 空间修复】标题原为 26px + 字距 5px + 上距14/下距16，
                   合计独占约 65px 高度却只放「胜负统计」4 个字（对比调试面板同样功能的
                   头部仅 57px，还多带皮肤切换 + 关闭按钮）。收紧后回收约 30px。 */
                "#csh-wr-title{display:block!important;position:relative!important;text-align:center!important;font-size:19px!important;font-weight:700!important;letter-spacing:2px!important;",
                "line-height:1.3!important;padding:0 0 8px!important;margin:0 0 10px!important;",
                "font-family:'Microsoft YaHei','PingFang SC','Heiti SC','STHeiti',sans-serif!important;",
                "color:#f6e5b6!important;-webkit-text-fill-color:#f6e5b6!important;background:none!important;",
                "-webkit-text-stroke:0!important;text-shadow:0 2px 6px rgba(0,0,0,.85)!important;}",
                "#csh-wr-title::after{content:'';position:absolute!important;left:0;right:0;bottom:0;height:1px;",
                "background:linear-gradient(90deg,transparent,rgba(216,180,106,.42) 18%,rgba(216,180,106,.42) 82%,transparent);}",
                "#csh-wr-panel .csh-wr-ctrl{display:flex!important;flex-wrap:wrap!important;gap:12px!important;align-items:center!important;justify-content:center!important;margin:0 0 16px!important;}",
                /* 模式：分段控件 */
                "#csh-wr-panel .csh-wr-seg{display:inline-flex!important;flex-wrap:wrap!important;gap:4px!important;padding:4px!important;border-radius:999px!important;",
                "background:rgba(0,0,0,.44)!important;border:1px solid rgba(216,180,106,.18)!important;}",
                "#csh-wr-panel .csh-wr-seg-item{display:inline-block!important;cursor:pointer!important;padding:12px 16px!important;min-height:44px!important;border-radius:999px!important;",
                "font-size:13px!important;letter-spacing:1px!important;color:#b9b09c!important;background:transparent!important;border:1px solid transparent!important;",
                "transition:color .18s ease,background .18s ease,border-color .18s ease!important;}",
                "#csh-wr-panel .csh-wr-seg-item:hover{color:#f0e3c4!important;background:rgba(216,180,106,.1)!important;}",
                "#csh-wr-panel .csh-wr-seg-item.on{color:#221a0c!important;font-weight:700!important;border-color:rgba(216,180,106,.85)!important;",
                "background:linear-gradient(180deg,#f4dfa8,#cfa958)!important;box-shadow:0 2px 12px rgba(216,180,106,.3)!important;}",
                /* 视图：下划线页签（选择器带面板前缀，避免被 #csh-wr-panel div 复位规则盖掉） */
                "#csh-wr-panel #csh-wr-tabs{display:inline-flex!important;flex-wrap:wrap!important;gap:6px!important;padding:0 0 0 2px!important;}",
                "#csh-wr-panel .csh-wr-tab{display:inline-block!important;cursor:pointer!important;padding:11px 14px!important;min-height:44px!important;font-size:14px!important;letter-spacing:1px!important;",
                "color:#b0a68f!important;background:transparent!important;border:none!important;border-bottom:2px solid transparent!important;",
                "transition:color .18s ease,border-color .18s ease!important;}",
                "#csh-wr-panel .csh-wr-tab:hover{color:#f0e3c4!important;}",
                "#csh-wr-panel .csh-wr-tab.on{color:#f6e3b0!important;font-weight:700!important;border-bottom-color:rgba(216,180,106,.9)!important;",
                "text-shadow:0 0 14px rgba(216,180,106,.4)!important;}",
                /* ---------- KPI ---------- */
                "#csh-wr-panel .csh-wr-kpis{display:flex!important;flex-wrap:wrap!important;gap:10px!important;margin:0 0 16px!important;}",
                /* 【2026-09-30 空间修复】min-width 132→104：手机可用内容宽约 330px，
                   132 时 3 列需 416px 放不下只能排 2 列；降到 104 后 3 列只需 320px，
                   正好一屏 3 个 KPI，少一行约 90px。padding 同步收紧。 */
                "#csh-wr-panel .csh-wr-kpi{flex:1 1 108px!important;min-width:104px!important;padding:10px 11px!important;border-radius:12px!important;",
                "background:linear-gradient(180deg,rgba(255,255,255,.055),rgba(255,255,255,.015))!important;",
                "border:1px solid rgba(216,180,106,.2)!important;box-shadow:0 6px 18px rgba(0,0,0,.35)!important;}",
                "#csh-wr-panel .csh-wr-kpi .k{font-size:11.5px!important;color:#9d947e!important;letter-spacing:1px!important;}",
                "#csh-wr-panel .csh-wr-kpi .v{font-size:22px!important;font-weight:700!important;color:#f6e3b0!important;margin-top:4px!important;",
                "font-family:Consolas,Menlo,monospace!important;text-shadow:0 0 16px rgba(216,180,106,.28)!important;}",
                "#csh-wr-panel .csh-wr-kpi .n{font-size:11px!important;color:#7f7767!important;margin-top:2px!important;}",
                "#csh-wr-panel .csh-wr-kpi.hi .v{color:#8fe6cf!important;text-shadow:0 0 16px rgba(127,216,196,.3)!important;}",
                "#csh-wr-panel .csh-wr-kpi.lo .v{color:#f0a3b0!important;text-shadow:0 0 16px rgba(214,110,124,.3)!important;}",
                /* ---------- 区块标题 ---------- */
                "#csh-wr-panel .csh-wr-sec{display:flex!important;align-items:center!important;gap:10px!important;margin:6px 0 10px!important;}",
                "#csh-wr-panel .csh-wr-sec .t{font-size:14px!important;color:#e6d7ac!important;letter-spacing:2px!important;font-weight:600!important;white-space:nowrap!important;}",
                "#csh-wr-panel .csh-wr-sec .line{flex:1 1 auto!important;height:1px!important;",
                "background:linear-gradient(90deg,rgba(216,180,106,.4),rgba(216,180,106,.04))!important;}",
                /* ---------- 表格 ----------
                 * 武将排行有 12 列。这里有个必须显式覆盖的坑：
                 * 引擎 layout.css 里有全局 `table{table-layout:fixed}`，固定布局下列宽
                 * 与单元格内容完全脱钩 —— 只在 td 上写 min-width 是不生效的（历史 bug）。
                 * 所以：先把 table-layout 复位成 auto，让列宽跟内容走；再给关键列显式宽度。
                 * 【2026-10-01 紧凑化】原策略 min-width:900px + 面板 overflow-x:auto 横滚，
                 *   用户实测仍需左右拖动才能看全（横滚 = 布局不紧凑）。
                 *   现改为三档响应式（README §三十二.1）：去掉 900px 下限，
                 *   靠「表头缩写 + 列宽/内距收紧」压缩整表；胜负条全程保留（功能非装饰）。
                 *   宽松档（基础样式，≥840px 视口）~700px；紧凑档（620~839px）~560px；
                 *   更窄的视口才回落到横滚 + 前两列吸附兜底（见下方媒体查询）。 */
                "#csh-wr-panel table{table-layout:auto!important;width:100%!important;border-collapse:separate!important;border-spacing:0!important;margin:0 0 6px!important;}",
                "#csh-wr-panel #csh-wr-table{min-width:0!important;}",
                /* 紧凑档（620~839px 视口）：主流手机横屏 CSS 宽 640~920px 的下半区。
                 * 列宽/字号/内距整体再收一档，整表压到 ~560px：
                 * 视口 640 → 面板可用 94vw−28=574 ≥ 560 ✓ 一屏装下、零横滚。 */
                "@media (max-width:839px){",
                "#csh-wr-panel thead th{padding:6px 4px!important;font-size:12px!important;}",
                "#csh-wr-panel tbody td{padding:5px 4px!important;font-size:12px!important;}",
                "#csh-wr-panel #csh-wr-table th:nth-child(1),#csh-wr-panel #csh-wr-table td:nth-child(1){width:34px!important;}",
                "#csh-wr-panel #csh-wr-table th:nth-child(2),#csh-wr-panel #csh-wr-table td:nth-child(2){max-width:72px!important;}",
                "#csh-wr-panel #csh-wr-table th:nth-child(3),#csh-wr-panel #csh-wr-table td:nth-child(3),#csh-wr-panel #csh-wr-table th:nth-child(4),#csh-wr-panel #csh-wr-table td:nth-child(4),#csh-wr-panel #csh-wr-table th:nth-child(5),#csh-wr-panel #csh-wr-table td:nth-child(5){width:38px!important;}",
                "#csh-wr-panel #csh-wr-table th:nth-child(6),#csh-wr-panel #csh-wr-table td:nth-child(6){width:84px!important;}",
                "#csh-wr-panel #csh-wr-table th:nth-child(n+7),#csh-wr-panel #csh-wr-table td:nth-child(n+7){width:44px!important;}",
                "#csh-wr-panel td.rate{min-width:72px!important;}",
                "#csh-wr-panel .csh-wr-bar{width:30px!important;}",
                "}",
                /* 兜底档（<620px 视口，如手机竖屏 360~430px）：12 列物理装不下，
                 * 启用横滚 + 名次/武将两列吸附，滚到右边时身份列始终可见。
                 * 背景必须用不透明纯色，否则滚过去的单元格会从吸附列下方透出来
                 * （取值与 thead 渐变末端一致）。sticky left 与紧凑档 # 列宽 34px 对齐。 */
                "@media (max-width:619px){",
                "#csh-wr-panel #csh-wr-table{min-width:520px!important;}",
                "#csh-wr-panel #csh-wr-table th:nth-child(1),#csh-wr-panel #csh-wr-table td:nth-child(1){position:sticky!important;left:0!important;z-index:2!important;background:#191309!important;}",
                "#csh-wr-panel #csh-wr-table th:nth-child(2),#csh-wr-panel #csh-wr-table td:nth-child(2){position:sticky!important;left:34px!important;z-index:2!important;background:#191309!important;box-shadow:1px 0 0 rgba(216,180,106,.22)!important;}",
                "#csh-wr-panel #csh-wr-table thead th:nth-child(1),#csh-wr-panel #csh-wr-table thead th:nth-child(2){z-index:4!important;}",
                /* 【2026-10-05】触屏 hover 无意义，删除原「悬停时前两列变深」规则（避免窄屏出现框感） */
                "}",
                "#csh-wr-panel #csh-wr-table th:nth-child(1),#csh-wr-panel #csh-wr-table td:nth-child(1){width:40px!important;}",
                "#csh-wr-panel #csh-wr-table th:nth-child(2),#csh-wr-panel #csh-wr-table td:nth-child(2){max-width:96px!important;}",
                "#csh-wr-panel #csh-wr-table th:nth-child(3),#csh-wr-panel #csh-wr-table td:nth-child(3),#csh-wr-panel #csh-wr-table th:nth-child(4),#csh-wr-panel #csh-wr-table td:nth-child(4),#csh-wr-panel #csh-wr-table th:nth-child(5),#csh-wr-panel #csh-wr-table td:nth-child(5){width:46px!important;}",
                "#csh-wr-panel #csh-wr-table th:nth-child(6),#csh-wr-panel #csh-wr-table td:nth-child(6){width:108px!important;}",
                "#csh-wr-panel #csh-wr-table th:nth-child(n+7),#csh-wr-panel #csh-wr-table td:nth-child(n+7){width:58px!important;}",
                /* 阵营胜率 / 玩家操控：一屏放下，禁止横向滚动 */
                "#csh-wr-panel #csh-wr-camps,#csh-wr-panel #csh-wr-table2,#csh-wr-panel #csh-wr-mytable{min-width:0!important;width:100%!important;table-layout:auto!important;}",
                "#csh-wr-panel #csh-wr-mytable th:nth-child(1),#csh-wr-panel #csh-wr-mytable td:nth-child(1){width:46px!important;}",
                "#csh-wr-panel #csh-wr-mytable th:nth-child(3),#csh-wr-panel #csh-wr-mytable td:nth-child(3),#csh-wr-panel #csh-wr-mytable th:nth-child(4),#csh-wr-panel #csh-wr-mytable td:nth-child(4),#csh-wr-panel #csh-wr-mytable th:nth-child(5),#csh-wr-panel #csh-wr-mytable td:nth-child(5){width:52px!important;}",
                "#csh-wr-panel thead th{position:sticky!important;top:0;z-index:2!important;padding:8px 6px!important;font-size:12.5px!important;font-weight:600!important;",
                "letter-spacing:.5px!important;color:#e0c98c!important;white-space:nowrap!important;cursor:pointer!important;",
                "background:linear-gradient(180deg,#241d13,#191309)!important;border-bottom:1px solid rgba(216,180,106,.34)!important;",
                "transition:color .16s ease,background .16s ease!important;}",
                "#csh-wr-panel thead th:hover{color:#fbeec4!important;background:linear-gradient(180deg,#2c2417,#1e170c)!important;}",
                "#csh-wr-panel thead th.nosort{cursor:default!important;}",
                "#csh-wr-panel thead th.nosort:hover{color:#e0c98c!important;background:linear-gradient(180deg,#241d13,#191309)!important;}",
                "#csh-wr-panel thead th.on{color:#fbeec4!important;text-shadow:0 0 12px rgba(216,180,106,.45)!important;}",
                /* 脚注 / 口径说明 */
                "#csh-wr-panel .csh-wr-note{display:block!important;margin:2px 0 12px!important;font-size:11.5px!important;line-height:1.7!important;color:#8b8271!important;letter-spacing:.2px!important;}",
                "#csh-wr-panel tbody td{padding:7px 6px!important;font-size:13px!important;text-align:center!important;white-space:nowrap!important;",
                "color:#ddd4c0!important;border-bottom:1px solid rgba(216,180,106,.09)!important;transition:background .14s ease!important;}",
                "#csh-wr-panel tbody tr:hover td{background:rgba(216,180,106,.055)!important;}",
                "#csh-wr-panel tbody tr:last-child td{border-bottom:none!important;}",
                "#csh-wr-panel td.wname{text-align:left!important;font-weight:600!important;color:#f0e3bd!important;letter-spacing:.3px!important;",
                "overflow:hidden!important;text-overflow:ellipsis!important;}",
                "#csh-wr-panel td.wname.ext{color:#ffd97a!important;}",
                /* 【2026-10-05 修复】原 tr.myext 整行金色背景（0.07 / hover 0.13）会在
                   「非扩展行 → 扩展行」的边界处形成醒目的明暗横线——用户报「卡尔和界曹丕中间
                   有一条金色的线」（卡尔恰夹在非扩展行与扩展行之间、又是唯一多场行，最显眼）。
                   扩展武将的区分改由「金色名字 + ★」承担（td.wname.ext 已有规则），
                   行背景一律均匀，不再使用整行底色。 */
                "#csh-wr-panel tr.sub td{font-size:12.5px!important;color:#bfb59c!important;}",
                "#csh-wr-panel tr.sub td.wname{padding-left:26px!important;font-weight:400!important;color:#cdc3a4!important;}",
                "#csh-wr-panel .win{color:#7fe0a8!important;font-weight:600!important;}",
                "#csh-wr-panel .lose{color:#f2909d!important;font-weight:600!important;}",
                /* 名次徽记 */
                "#csh-wr-panel .csh-wr-rank{display:inline-block!important;min-width:22px;padding:2px 6px;border-radius:6px;font-size:12px!important;",
                "font-family:Consolas,Menlo,monospace!important;color:#a99f88!important;background:rgba(255,255,255,.045)!important;border:1px solid rgba(216,180,106,.14)!important;}",
                "#csh-wr-panel .csh-wr-rank.r1{color:#2a2008!important;background:linear-gradient(180deg,#f7e3a6,#d3ac53)!important;border-color:rgba(247,227,166,.8)!important;box-shadow:0 0 12px rgba(216,180,106,.4)!important;}",
                "#csh-wr-panel .csh-wr-rank.r2{color:#1f2429!important;background:linear-gradient(180deg,#dfe6ec,#a9b6c1)!important;border-color:rgba(223,230,236,.7)!important;}",
                "#csh-wr-panel .csh-wr-rank.r3{color:#2b1a10!important;background:linear-gradient(180deg,#e6b78d,#bd8557)!important;border-color:rgba(230,183,141,.7)!important;}",
                /* 胜率条保留：条 + 百分比同行，列宽由上面第 6 列的显式宽度兜住 */
                "#csh-wr-panel td.rate{min-width:100px!important;}",
                "#csh-wr-panel .csh-wr-bar{display:inline-block!important;vertical-align:middle!important;width:40px;height:6px;border-radius:3px;overflow:hidden;",
                "background:rgba(255,255,255,.09)!important;box-shadow:0 0 0 1px rgba(0,0,0,.3) inset!important;}",
                "#csh-wr-panel .csh-wr-bar i{display:block!important;position:static!important;height:100%!important;border-radius:3px!important;",
                "background:linear-gradient(90deg,rgba(216,180,106,.5),#f0d79c)!important;}",
                "#csh-wr-panel .csh-wr-bar i.hi{background:linear-gradient(90deg,rgba(127,216,196,.5),#8fe6cf)!important;}",
                "#csh-wr-panel .csh-wr-bar i.lo{background:linear-gradient(90deg,rgba(214,110,124,.5),#f0a3b0)!important;}",
                "#csh-wr-panel .csh-wr-pct{display:inline-block!important;vertical-align:middle!important;margin-left:5px;font-size:12px!important;",
                "font-family:Consolas,Menlo,monospace!important;color:#e8dcbc!important;}",
                "#csh-wr-panel .csh-wr-pct.hi{color:#8fe6cf!important;}",
                "#csh-wr-panel .csh-wr-pct.lo{color:#f0a3b0!important;}",
                /* ---------- 分页 / 底部 ---------- */
                "#csh-wr-panel #csh-wr-page{display:flex!important;align-items:center!important;justify-content:center!important;flex-wrap:wrap!important;gap:14px!important;",
                "margin:16px 0 2px!important;padding:14px 0 0!important;border-top:1px solid rgba(216,180,106,.18)!important;font-size:13px!important;color:#b8ad94!important;}",
                "#csh-wr-panel .csh-wr-pbtn{display:inline-block!important;cursor:pointer!important;padding:12px 18px!important;min-height:44px!important;border-radius:999px!important;",
                "border:1px solid rgba(216,180,106,.3)!important;color:#e3d6b2!important;background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.015))!important;",
                "transition:border-color .16s ease,background .16s ease,transform .16s ease!important;}",
                "#csh-wr-panel .csh-wr-pbtn:hover{border-color:rgba(216,180,106,.8)!important;background:linear-gradient(180deg,rgba(216,180,106,.18),rgba(216,180,106,.05))!important;transform:translateY(-1px)!important;}",
                "#csh-wr-panel .csh-wr-pbtn.dis{opacity:.32!important;pointer-events:none!important;}",
                "#csh-wr-panel .csh-wr-pageinfo{font-family:Consolas,Menlo,monospace!important;letter-spacing:.5px!important;color:#a99f88!important;}",
                "#csh-wr-panel .csh-wr-danger{cursor:pointer!important;padding:7px 18px!important;border-radius:999px!important;color:#f2b9c2!important;",
                "border:1px solid rgba(214,110,124,.38)!important;background:linear-gradient(180deg,rgba(214,110,124,.14),rgba(214,110,124,.03))!important;",
                "transition:border-color .16s ease,background .16s ease!important;}",
                "#csh-wr-panel .csh-wr-danger:hover{border-color:rgba(230,130,144,.85)!important;background:linear-gradient(180deg,rgba(214,110,124,.26),rgba(214,110,124,.08))!important;}",
                /* ---------- 过滤栏 / 删除（2026-10-01 D1/D2/D3/D5） ---------- */
                "#csh-wr-filter{display:flex!important;flex-wrap:wrap!important;gap:8px!important;align-items:center!important;margin:10px 0 2px!important;}",
                "#csh-wr-panel .csh-wr-flabel{font-size:12px!important;color:#8b8271!important;}",
                "#csh-wr-panel .csh-wr-fbtn{display:inline-block!important;cursor:pointer!important;padding:6px 12px!important;min-height:32px!important;border-radius:999px!important;border:1px solid rgba(216,180,106,.3)!important;color:#a99f88!important;}",
                "#csh-wr-panel .csh-wr-fbtn.on{border-color:rgba(216,180,106,.8)!important;color:#e3d6b2!important;background:rgba(216,180,106,.18)!important;}",
                "#csh-wr-search{flex:1 1 140px!important;min-width:120px!important;padding:8px 12px!important;border-radius:999px!important;border:1px solid rgba(216,180,106,.3)!important;background:rgba(0,0,0,.25)!important;color:#e3d6b2!important;font-size:13px!important;}",
                "#csh-wr-panel .csh-wr-del{cursor:pointer!important;width:34px!important;height:34px!important;min-width:34px!important;min-height:34px!important;border-radius:50%!important;border:1px solid rgba(214,110,124,.5)!important;background:rgba(214,110,124,.12)!important;color:#f2b9c2!important;font-size:16px!important;line-height:1!important;}",
                "#csh-wr-panel .csh-wr-del:hover{border-color:rgba(230,130,144,.9)!important;background:rgba(214,110,124,.28)!important;}",
                /* ---------- 空态 ---------- */
                "#csh-wr-empty{display:block!important;padding:46px 16px!important;text-align:center!important;color:#a99f88!important;}",
                "#csh-wr-panel .csh-wr-empty-icon{font-size:22px!important;color:rgba(216,180,106,.5)!important;margin-bottom:12px!important;letter-spacing:8px!important;}",
                "#csh-wr-panel .csh-wr-empty-t{font-size:15px!important;color:#ddd2b6!important;letter-spacing:1px!important;}",
                "#csh-wr-panel .csh-wr-empty-n{margin-top:8px!important;font-size:12.5px!important;color:#8b8271!important;line-height:1.8!important;}",
                /* ---------- 移动端压缩 ----------
                 * 必须放在整张表最后：同一选择器 + 同为 !important 时后写的生效，
                 * 放前面会被上面的基础规则原样盖回去（历史 bug）。
                 * 目的：阵营胜率 / 玩家操控在一屏内看完，不必拖滑条。 */
                "@media (max-width:600px){",
                "#csh-wr-panel{padding:12px 12px 10px!important;width:96vw!important;}",
                /* 【2026-09-30 第六轮】此处原为 flex:1 1 calc(50% - 10px)（强制 2 列），
                   与上面基础规则的「降到 104px 让手机一屏 3 个 KPI」优化互相打架
                   （本块后写生效，把 3 列优化整个反压掉了）。改为 33.333% 让 3 列真正生效：
                   3×(33.333%−7px) + 2×10px(gap) = 100% − 1px，正好放下。 */
                "#csh-wr-panel .csh-wr-kpi{padding:8px 10px!important;min-width:0!important;flex:1 1 calc(33.333% - 7px)!important;}",
                "#csh-wr-panel .csh-wr-kpi .v{font-size:18px!important;}",
                "#csh-wr-panel .csh-wr-kpi .n{font-size:10.5px!important;}",
                "#csh-wr-panel thead th{padding:6px 6px!important;font-size:11.5px!important;}",
                "#csh-wr-panel tbody td{padding:5px 6px!important;font-size:12.5px!important;}",
                "#csh-wr-panel .csh-wr-sec{margin-top:9px!important;}",
                "#csh-wr-panel table{margin:0 0 4px!important;}",
                "#csh-wr-panel .csh-wr-note{font-size:11.5px!important;margin:2px 0 8px!important;}",
                "#csh-wr-panel td.rate{min-width:88px!important;}",
                /* 【2026-09-30 第六轮】触摸目标：模式分段/视图页签/翻页/危险操作原本高约 31~37px，
                   低于 §E.1 的 44px 红线。仅移动端把上下内距加到 14px（≈44px 高），文字仍居中。 */
                "#csh-wr-panel .csh-wr-seg-item,#csh-wr-panel .csh-wr-tab,#csh-wr-panel .csh-wr-pbtn,#csh-wr-panel .csh-wr-danger{padding-top:14px!important;padding-bottom:14px!important;}",
                "}",
                /* ============================================================
                 * 【2026-10-02 手机横滚根治】必须放在本数组最末尾。
                 *
                 * 上面那个 @media (max-width:600px) 块（约 521 起）排在基础规则
                 * （约 441~535）**之前**，两者同为 !important、特异度相同，
                 * 后写者胜 —— 于是手机档的字号/内距全部被基础规则原样盖回，
                 * 是彻底的死代码。实测（headless Chromium，视口 360~480px）：
                 *   tbody td 取到基础档 6px/12.5px（而非手机档 5px/12.5px 以上版本），
                 *   整表 521px 塞进 446px 内容盒 → 横向溢出 +72px，必须左右拖。
                 * 这里不改上面任何一行（避免动到已验证的桌面档），只在末尾补一档
                 * 后写的窄屏规则：把武将排行从「12 列表格」换成「逐行卡片」，
                 * 从左到右所需宽度一次性降到 0 横滚。
                 * ============================================================ */
                /* 面板宽度：原来只写 min(94vw,1060px)，窄屏只剩 ~338px 且与内容互相
                   撑宽。补 max-width 让面板先服从屏幕，内部再自己消化。 */
                "#csh-wr-panel{width:min(94vw,1060px)!important;max-width:calc(100vw - 12px)!important;}",
                /* 默认：表格可见、卡片容器不参与布局。
                   选择器必须写成 #csh-wr-panel #csh-wr-cards（0,1,1）——
                   面板里有一条 `#csh-wr-panel div{display:block!important}` 的
                   引擎复位规则，单写 #csh-wr-cards（0,1,0）特异度更低会被它压掉，
                   表现就是桌面端表格与卡片同时出现（实测确认）。 */
                "#csh-wr-panel #csh-wr-cards{display:none!important;}",
                /* ---------- 窄屏（<620px 视口 = 手机竖屏） ---------- */
                "@media (max-width:619px){",
                /* 12 列物理装不下，改成逐武将卡片：场次/胜/负/胜率 + 5 项场均一行读完。 */
                "#csh-wr-panel #csh-wr-table{display:none!important;}",
                "#csh-wr-panel #csh-wr-cards{display:block!important;margin:0 0 6px!important;}",
                "#csh-wr-cards .wr-card{position:relative!important;display:block!important;padding:9px 6px 9px 0!important;",
                "border-bottom:1px solid rgba(216,180,106,.09)!important;}",
                "#csh-wr-cards .wr-card:last-child{border-bottom:none!important;}",
                "#csh-wr-cards .wr-t1{display:flex!important;align-items:center!important;gap:8px!important;",
                "padding-right:42px!important;min-height:26px!important;line-height:1.35!important;}",
                "#csh-wr-cards .wr-t1 .wname{display:block!important;flex:1 1 auto!important;min-width:0!important;",
                "text-align:left!important;font-weight:600!important;color:#f0e3bd!important;",
                "overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;}",
                "#csh-wr-cards .wr-t1 .wname.ext{color:#ffd97a!important;}",
                "#csh-wr-cards .wr-t2{display:flex!important;flex-wrap:wrap!important;align-items:center!important;",
                "gap:2px 9px!important;margin-top:4px!important;font-size:12.5px!important;color:#ddd4c0!important;line-height:1.5!important;}",
                "#csh-wr-cards .wr-t2 .csh-wr-pct{margin-left:0!important;font-size:12.5px!important;}",
                "#csh-wr-cards .wr-games{color:#9d947e!important;}",
                /* 「均伤 4.14」这类键值对：标签弱化、数值保留对比度，靠 gap 分隔而不画线 */
                "#csh-wr-cards .wr-m{white-space:nowrap!important;}",
                "#csh-wr-cards .wr-m i{font-style:normal!important;color:#8b8271!important;margin-right:3px!important;font-size:11.5px!important;}",
                /* 删除按钮：贴到卡片右上角，命中区仍保 44px（§E.1 触摸红线） */
                "#csh-wr-cards .csh-wr-del{position:absolute!important;top:8px!important;right:0!important;",
                "width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important;}",
                "}",
                /* ---------- 超窄（<400px）：再收一档字号，保住一行读完 ---------- */
                "@media (max-width:399px){",
                "#csh-wr-cards .wr-t2{gap:2px 7px!important;font-size:12px!important;}",
                "#csh-wr-cards .wr-t2 .csh-wr-pct{font-size:12px!important;}",
                "#csh-wr-cards .wr-m i{font-size:11px!important;margin-right:2px!important;}",
                "}",
                /* ============================================================
                 * 导入 / 导出 / 清空浮层（2026-10-18）
                 * 独立于 #csh-wr-panel：挂在遮罩上、盖住面板，所以 div/span 复位
                 * 必须再写一份（引擎全局 div{display:inline-block;position:absolute}）。
                 * 尺寸单位可用 vw/vh —— 本浮层挂在 documentElement 上，不参与 body 缩放。
                 * ============================================================ */
                "#csh-wr-io{position:absolute!important;left:0!important;top:0!important;width:100%!important;height:100%!important;z-index:9!important;",
                "display:flex!important;align-items:center!important;justify-content:center!important;padding:14px!important;box-sizing:border-box!important;",
                "background:rgba(4,3,2,.66)!important;-webkit-backdrop-filter:blur(2px)!important;backdrop-filter:blur(2px)!important;",
                "animation:cshWrFade .16s ease-out!important;}",
                "#csh-wr-io *{box-sizing:border-box!important;}",
                "#csh-wr-io div{position:static!important;display:block!important;}",
                "#csh-wr-io span{position:static!important;display:inline-block!important;}",
                /* 选择器带两个 id：`#csh-wr-io div` 的 display:block!important 特异度更高，
                   单写 #csh-wr-io-card 会被它压成 block（卡片就失去 flex 收缩能力） */
                "#csh-wr-io #csh-wr-io-card{position:relative!important;display:flex!important;flex-direction:column!important;",
                "width:min(94vw,620px)!important;max-height:min(88vh,780px)!important;overflow-y:auto!important;padding:16px 16px 14px!important;border-radius:16px!important;",
                "background:linear-gradient(168deg,#1e1811 0%,#15110c 46%,#0b0a08 100%)!important;",
                "border:1px solid rgba(216,180,106,.55)!important;box-shadow:0 30px 80px rgba(0,0,0,.82)!important;",
                "animation:cshWrRise .2s cubic-bezier(.2,.8,.2,1)!important;}",
                "#csh-wr-io-title{font-size:17px!important;font-weight:700!important;letter-spacing:2px!important;color:#f6e5b6!important;margin:0 0 6px!important;}",
                "#csh-wr-io-title.danger{color:#f2b9c2!important;}",
                "#csh-wr-io-tip{font-size:12.5px!important;line-height:1.75!important;color:#9d947e!important;margin:0 0 10px!important;}",
                "#csh-wr-io-text,#csh-wr-io-input{width:100%!important;margin:0 0 8px!important;padding:10px 12px!important;",
                "border-radius:10px!important;border:1px solid rgba(216,180,106,.35)!important;background:rgba(0,0,0,.46)!important;",
                "color:#ece5d6!important;font-size:13px!important;line-height:1.6!important;-webkit-text-fill-color:#ece5d6!important;}",
                /* 长 JSON 必须多行显示：pre-wrap + break-all，横向永不出现「一条线」 */
                "#csh-wr-io-text{flex:1 1 auto!important;min-height:150px!important;height:34vh!important;max-height:46vh!important;resize:vertical!important;",
                "font-family:Consolas,Menlo,monospace!important;font-size:12.5px!important;white-space:pre-wrap!important;word-break:break-all!important;",
                "overflow:auto!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior:contain!important;}",
                "#csh-wr-io-text[disabled]{opacity:.72!important;}",
                "#csh-wr-io-input{flex:0 0 auto!important;height:44px!important;text-align:center!important;letter-spacing:4px!important;}",
                "#csh-wr-io-text:focus,#csh-wr-io-input:focus{outline:none!important;border-color:rgba(216,180,106,.85)!important;}",
                "#csh-wr-io-stat{min-height:20px!important;font-size:12px!important;line-height:1.6!important;color:#8b8271!important;",
                "margin:0 0 10px!important;word-break:break-all!important;}",
                "#csh-wr-io-stat.ok{color:#8fe6cf!important;}",
                "#csh-wr-io-stat.bad{color:#f0a3b0!important;}",
                "#csh-wr-io #csh-wr-io-acts{display:flex!important;flex-wrap:wrap!important;justify-content:flex-end!important;gap:10px!important;}",
                "#csh-wr-io .csh-wr-iobtn{display:inline-block!important;cursor:pointer!important;padding:11px 20px!important;min-height:44px!important;",
                "border-radius:999px!important;border:1px solid rgba(216,180,106,.3)!important;color:#e3d6b2!important;font-size:13.5px!important;letter-spacing:1px!important;",
                "background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.015))!important;",
                "transition:border-color .16s ease,background .16s ease!important;}",
                "#csh-wr-io .csh-wr-iobtn:hover{border-color:rgba(216,180,106,.8)!important;background:linear-gradient(180deg,rgba(216,180,106,.2),rgba(216,180,106,.05))!important;}",
                "#csh-wr-io .csh-wr-iobtn.primary{color:#221a0c!important;font-weight:700!important;border-color:rgba(216,180,106,.85)!important;",
                "background:linear-gradient(180deg,#f4dfa8,#cfa958)!important;}",
                "#csh-wr-io .csh-wr-iobtn.danger{color:#f2b9c2!important;border-color:rgba(214,110,124,.5)!important;",
                "background:linear-gradient(180deg,rgba(214,110,124,.18),rgba(214,110,124,.04))!important;}",
                "#csh-wr-io .csh-wr-iobtn.dis{opacity:.32!important;pointer-events:none!important;}",
                "@media (max-width:600px){",
                "#csh-wr-io{padding:8px!important;}",
                "#csh-wr-io #csh-wr-io-card{width:100%!important;max-height:94vh!important;padding:14px 13px 12px!important;}",
                "#csh-wr-io-text{height:40vh!important;max-height:none!important;}",
                "#csh-wr-io #csh-wr-io-acts{justify-content:stretch!important;}",
                "#csh-wr-io #csh-wr-io-acts .csh-wr-iobtn{flex:1 1 auto!important;text-align:center!important;}",
                "}",
                /* 矮窗（手机横屏 360~470 高）：文本域再收一档，保证底部按钮不被挤出屏幕。
                   紧凑断点用 max-height 而不是宽度 —— 915×412 比 900px 桌面断点还宽。 */
                "@media (max-height:470px){",
                "#csh-wr-io #csh-wr-io-text{height:30vh!important;min-height:110px!important;}",
                "#csh-wr-io #csh-wr-io-card{max-height:96vh!important;}",
                "}",
            ].join("");
            (document.head||document.documentElement).appendChild(st);
        }
        function sval(e,key){
            switch(key){
                case "winrate": return e.games?e.win/e.games:0;
                case "avgdamage": return e.games?e.damage/e.games:0;
                case "avgdamaged": return e.games?e.damaged/e.games:0;
                case "avggain": return e.games?e.gain/e.games:0;
                case "avgdiscard": return e.games?e.discard/e.games:0;
                case "avgkill": return e.games?e.kill/e.games:0;
                default: return e[key]||0;
            }
        }
        function tableData(){
            var d=readData()[wr.mode]||{};
            var arr=[];
            for(var n in d){
                var e=d[n];
                if(!e||!e.games) continue;
                if(e.games<wr.minGames) continue; // 场次不足阈值不参与排行，避免小样本胜率排序失真
                if(wr.search && cname(n).indexOf(wr.search)<0) continue; // 关键字搜索（2026-10-01 D5）
                // 复制为独立行对象，避免直接修改lib.config中的存储数据（曾导致name字段被写入数据库）
                var row={};
                for(var k in e){ if(typeof e[k]=="number") row[k]=e[k]; }
                row.name=n;
                arr.push(row);
            }
            var key=wr.sortKey;
            arr.sort(function(a,b){
                var va=sval(a,key),vb=sval(b,key);
                if(va!=vb) return (vb-va)*(wr.sortAsc?-1:1);
                return (b.games-a.games)*(wr.sortAsc?-1:1);
            });
            return arr;
        }
        function fmtPct(v){ return (v*100).toFixed(1)+"%"; }
        function fmtNum(v){ return (Math.round(v*100)/100).toString(); }
        function rateOf(e){ return e&&e.games?e.win/e.games:0; }
        function toneOf(r){ return r>=0.55?"hi":(r<0.45?"lo":""); }
        /** 胜率条 + 百分比：色随高低切换，避免满屏同色 */
        function barCell(e){
            /* 胜率条是原有功能，保留（条 + 百分比同行）。紧凑化只动列宽/内距/表头文案，不动元素。 */
            var r=rateOf(e), t=toneOf(r);
            var w=Math.max(0,Math.min(1,r))*100;
            return '<div class="rate"><span class="csh-wr-bar"><i class="'+t+'" style="width:'+w.toFixed(1)+'%"></i></span>'
                +'<span class="csh-wr-pct '+t+'">'+fmtPct(r)+'</span></div>';
        }
        function rankBadge(i){
            var cls=i===0?"r1":(i===1?"r2":(i===2?"r3":""));
            return '<span class="csh-wr-rank '+cls+'">'+(i+1)+'</span>';
        }
        /** 窄屏（<620px 视口）逐武将卡片：与表格同源同数据，仅换排布。
         *  目的：手机竖屏不再需要左右拖动（表格 12 列物理装不下 360px）。
         *  保留全部既有指标：名次 / 武将 / 场次 / 胜 / 负 / 胜率 / 均伤 / 均杀 /
         *  均受 / 均摸 / 均弃 / 删除。桌面档仍走表格，功能一处未减。 */
        function cardList(rows,start){
            var h='<div id="csh-wr-cards">',i,e,ext;
            for(i=0;i<rows.length;i++){
                e=rows[i];
                ext=e.name.indexOf("csh_")==0&&e.name.indexOf("csh_m_")!=0;
                h+='<div class="wr-card'+(ext?' myext':'')+'">';
                h+='<div class="wr-t1">'+rankBadge(start+i)
                    +'<span class="wname'+(ext?" ext":"")+'">'+esc(cname(e.name))+(ext?" ★":"")+'</span></div>';
                h+='<div class="wr-t2">'
                    +'<span class="wr-games">'+e.games+' 场</span>'
                    +'<span class="win">'+e.win+' 胜</span>'
                    +'<span class="lose">'+e.lose+' 负</span>'
                    +'<span class="csh-wr-pct '+toneOf(rateOf(e))+'">'+fmtPct(rateOf(e))+'</span>'
                    +'</div>';
                h+='<div class="wr-t2">'
                    +'<span class="wr-m"><i>均伤</i>'+fmtNum(e.games?e.damage/e.games:0)+'</span>'
                    +'<span class="wr-m"><i>均杀</i>'+fmtNum(e.games?e.kill/e.games:0)+'</span>'
                    +'<span class="wr-m"><i>均受</i>'+fmtNum(e.games?e.damaged/e.games:0)+'</span>'
                    +'<span class="wr-m"><i>均摸</i>'+fmtNum(e.games?e.gain/e.games:0)+'</span>'
                    +'<span class="wr-m"><i>均弃</i>'+fmtNum(e.games?e.discard/e.games:0)+'</span>'
                    +'</div>';
                h+='<button class="csh-wr-del" data-act="del" data-val="'+esc(e.name)+'" title="删除该武将战绩">×</button>';
                h+='</div>';
            }
            return h+'</div>';
        }
        function secTitle(t){
            return '<div class="csh-wr-sec"><span class="t">'+esc(t)+'</span><span class="line"></span></div>';
        }
        function kpiRow(items){
            var h='<div class="csh-wr-kpis">';
            for(var i=0;i<items.length;i++){
                var it=items[i]||{};
                h+='<div class="csh-wr-kpi'+(it.tone?" "+it.tone:"")+'">'
                    +'<div class="k">'+esc(it.k||"")+'</div>'
                    +'<div class="v">'+esc(it.v==null?"—":String(it.v))+'</div>'
                    +(it.n?'<div class="n">'+esc(it.n)+'</div>':"")
                    +'</div>';
            }
            return h+'</div>';
        }
        function emptyBox(title,note){
            return '<div id="csh-wr-empty">'
                +'<div class="csh-wr-empty-icon">· · ·</div>'
                +'<div class="csh-wr-empty-t">'+esc(title)+'</div>'
                +'<div class="csh-wr-empty-n">'+note+'</div>'
                +'</div>';
        }
        function panelHead(){
            // 右上角 × 已移除：底部「关 闭」+ Esc + 点击面板外均可关闭
            // 副标题「池子魔将 · 单机战绩台账」已按要求删除，只保留大标题
            return '<div id="csh-wr-title">胜负统计</div>';
        }
        function navBar(){
            var seg='<div class="csh-wr-seg">';
            for(var mk in MODE_NAMES){
                if(!MODE_NAMES.hasOwnProperty(mk)) continue;
                seg+='<span class="csh-wr-seg-item'+(wr.mode==mk?" on":"")+'" data-act="mode" data-val="'+mk+'">'+MODE_NAMES[mk]+'</span>';
            }
            seg+='</div>';
            var tabs='<div id="csh-wr-tabs">'
                +'<span class="csh-wr-tab'+(wr.view!="camps"&&wr.view!="me"?" on":"")+'" data-act="tab" data-val="list">武将排行</span>'
                +'<span class="csh-wr-tab'+(wr.view=="camps"?" on":"")+'" data-act="tab" data-val="camps">阵营胜率</span>'
                +'<span class="csh-wr-tab'+(wr.view=="me"?" on":"")+'" data-act="tab" data-val="me">玩家操控</span>'
                +'</div>';
    return '<div class="csh-wr-ctrl">'+seg+tabs+'</div>'+filterBar();
}
/* 场次阈值切换 + 关键字搜索 + 清空（2026-10-01 D2/D3/D5） */
function filterBar(){
    var opts=[1,5,10].map(function(v){
        return '<span class="csh-wr-fbtn'+(wr.minGames==v?" on":"")+'" data-act="mingames" data-val="'+v+'">≥'+v+'场</span>';
    }).join("");
    return '<div id="csh-wr-filter">'
        +'<span class="csh-wr-flabel">场次</span>'+opts
        +'<input id="csh-wr-search" type="text" placeholder="搜索武将名" value="'+esc(wr.search)+'">'
        +'<span class="csh-wr-pbtn" data-act="clearmode">清空本模式</span>'
        +'<span class="csh-wr-danger" data-act="clearall">清空全部</span>'
        +'</div>';
}
        /* ============================================================
           导入 / 导出（2026-10-18 重做）
           ------------------------------------------------------------
           旧实现用 window.prompt + window.alert：
             · Electron 渲染进程**不支持 prompt** ⇒ 点「导入」直接抛
               “prompt() is not supported.”（作者 PC 截图），功能完全不可用；
             · 手机/浏览器虽支持，但 prompt 是**单行**输入框，几 KB 的 JSON
               被压成一条线，看不见也改不了（作者手机截图）。
           新实现 = 面板内浮层：多行 textarea + 实时校验 + 合并结果回显；
           导出同样走浮层（可复制 / 桌面端可下载 .json），不再用 alert 塞长文本。
           ============================================================ */
        var ioLayer=null;
        function closeIO(){
            if(ioLayer){
                try{ if(ioLayer.parentNode) ioLayer.parentNode.removeChild(ioLayer); }catch(e){}
                ioLayer=null;
            }
        }
        function ioStat(msg,tone){
            var el=ioLayer&&ioLayer.querySelector("#csh-wr-io-stat");
            if(!el) return;
            el.className=tone||"";
            el.textContent=msg||"";
        }
        function fmtSize(str){
            var n=0;
            try{ n=String(str).length; }catch(e){}
            return n>=1024?(n/1024).toFixed(1)+" KB":n+" 字符";
        }
        function legacyCopy(txt){
            var ta=null;
            try{
                ta=document.createElement("textarea");
                ta.value=txt;
                ta.setAttribute("readonly","readonly");
                ta.style.cssText="position:fixed;left:-9999px;top:0;opacity:0;";
                document.body.appendChild(ta);
                ta.select();
                try{ ta.setSelectionRange(0,ta.value.length); }catch(eSel){}
                var ok=document.execCommand("copy");
                document.body.removeChild(ta);
                return ok;
            }catch(e){
                try{ if(ta&&ta.parentNode) ta.parentNode.removeChild(ta); }catch(e2){}
                return false;
            }
        }
        function copyText(txt,cb){
            var done=false;
            function fin(ok){ if(done) return; done=true; cb(!!ok); }
            try{
                if(navigator.clipboard&&typeof navigator.clipboard.writeText==="function"){
                    navigator.clipboard.writeText(txt).then(function(){ fin(true); },function(){ fin(legacyCopy(txt)); });
                    return;
                }
            }catch(e){}
            fin(legacyCopy(txt));
        }
        function payloadSummary(p){
            var n=0,g=0,d=(p&&p.data)||{};
            ["identity","versus","doudizhu","guozhan"].forEach(function(mk){
                var b=d[mk];
                if(!b||typeof b!=="object"||Array.isArray(b)) return;
                for(var k in b){
                    if(!b.hasOwnProperty(k)) continue;
                    var e=b[k];
                    if(!e||typeof e!=="object"||Array.isArray(e)) continue;
                    n++;
                    g+=(typeof e.games==="number"&&isFinite(e.games)?e.games:0);
                }
            });
            return {chars:n,games:g};
        }
        function parsePayload(raw){
            raw=String(raw==null?"":raw).trim();
            if(!raw) return {ok:false,error:"尚未粘贴内容。"};
            var p;
            try{ p=JSON.parse(raw); }
            catch(e){ return {ok:false,error:"JSON 解析失败："+((e&&e.message)||e)}; }
            if(!p||p.__csh!=="winrate"||!p.data||typeof p.data!=="object"||Array.isArray(p.data)){
                return {ok:false,error:"这不是胜负统计的导出数据（缺少 __csh=\"winrate\" 标记）。"};
            }
            return {ok:true,payload:p};
        }
        /* 合并策略：逐模式逐角色累加，而不是覆盖（避免误操作清空现有记录）。
           只接受已知数值字段，且只累加正数 —— 负数/NaN 是脏数据，不入账。 */
        function mergePayload(p){
            var cur=readData();
            var touched=0,games=0;
            function mergeBucket(src,dst,count){
                for(var n in src){
                    if(!src.hasOwnProperty(n)) continue;
                    var se=src[n];
                    if(!se||typeof se!=="object"||Array.isArray(se)) continue;
                    if(!dst[n]) dst[n]={games:0,win:0,lose:0,damage:0,damaged:0,gain:0,discard:0,kill:0};
                    ["games","win","lose","damage","damaged","gain","discard","kill"].forEach(function(k){
                        if(typeof se[k]==="number"&&isFinite(se[k])&&se[k]>0) dst[n][k]=(dst[n][k]||0)+se[k];
                    });
                    if(count){
                        touched++;
                        games+=(typeof se.games==="number"&&isFinite(se.games)?se.games:0);
                    }
                }
            }
            ["identity","versus","doudizhu","guozhan"].forEach(function(mk){
                if(p.data[mk]&&typeof p.data[mk]==="object"&&!Array.isArray(p.data[mk])){
                    mergeBucket(p.data[mk],cur[mk]||(cur[mk]={}),true);
                }
            });
            if(p.data.camps&&typeof p.data.camps==="object"&&!Array.isArray(p.data.camps)){
                if(!cur.camps||typeof cur.camps!=="object") cur.camps={};
                mergeBucket(p.data.camps,cur.camps,false);
            }
            if(p.data.me&&typeof p.data.me==="object"){
                if(!cur.me||typeof cur.me!=="object") cur.me={};
                ["chars","camps"].forEach(function(k){
                    if(p.data.me[k]&&typeof p.data.me[k]==="object"&&!Array.isArray(p.data.me[k])){
                        if(!cur.me[k]||typeof cur.me[k]!=="object") cur.me[k]={};
                        mergeBucket(p.data.me[k],cur.me[k],false);
                    }
                });
            }
            game.saveConfig(STAT_KEY,cur);
            return {chars:touched,games:games};
        }
        /* 浮层骨架：html 里必须有 #csh-wr-io-text（或 #csh-wr-io-input）、#csh-wr-io-stat、
           #csh-wr-io-acts；点击 [data-act] 交给 onAct（Close 由这里统一处理）。 */
        function openIO(html,value,onAct){
            closeIO();
            var host=wr.dialog||uiHost();
            if(!host) return null;
            var layer=document.createElement("div");
            layer.id="csh-wr-io";
            layer.innerHTML='<div id="csh-wr-io-card">'+html+'</div>';
            host.appendChild(layer);
            ioLayer=layer;
            var ta=layer.querySelector("#csh-wr-io-text");
            if(ta&&value!=null) ta.value=value;
            layer.addEventListener("click",function(e){
                var t=e.target;
                while(t&&t!==layer&&!(t.getAttribute&&t.getAttribute("data-act"))) t=t.parentNode;
                if(!t||t===layer){
                    if(e.target===layer) closeIO();
                    return;
                }
                var act=t.getAttribute("data-act");
                if(act==="io-close"){ closeIO(); return; }
                try{ if(onAct) onAct(act,layer,ta); }
                catch(err){ ioStat("操作失败："+((err&&err.message)||err),"bad"); }
            });
            return layer;
        }
        function downloadJSON(json){
            try{
                var blob=new Blob([json],{type:"application/json;charset=utf-8"});
                var url=URL.createObjectURL(blob);
                var a=document.createElement("a");
                a.href=url;
                a.download="池子魔将-胜负统计.json";
                a.style.display="none";
                document.body.appendChild(a);
                a.click();
                setTimeout(function(){
                    try{ if(a.parentNode) a.parentNode.removeChild(a); URL.revokeObjectURL(url); }catch(e){}
                },1200);
                ioStat("已发出下载请求；若没有弹出保存框，请改用「复制文本」。","ok");
            }catch(e){
                ioStat("下载失败："+((e&&e.message)||e)+"，请改用「复制文本」。","bad");
            }
        }
        function pasteTo(ta,after){
            if(!ta) return;
            function fallback(msg){
                try{ ta.focus(); }catch(e){}
                ioStat(msg||"请长按文本框，用系统菜单粘贴。","");
            }
            try{
                if(navigator.clipboard&&typeof navigator.clipboard.readText==="function"){
                    navigator.clipboard.readText().then(function(txt){
                        if(!txt){ fallback("剪贴板是空的，请长按文本框手动粘贴。"); return; }
                        ta.value=txt;
                        /* 直接回调刷新：不依赖 Event 构造器（老 WebView 可能没有） */
                        if(typeof after==="function"){ try{ after(); }catch(eR){} }
                        else { try{ ta.dispatchEvent(new Event("input",{bubbles:true})); }catch(eD){} }
                        try{ ta.focus(); }catch(e2){}
                    },function(){ fallback("系统不允许读取剪贴板，请长按文本框手动粘贴。"); });
                    return;
                }
            }catch(e){}
            fallback();
        }
        function exportData(){
            var payload={__csh:"winrate",ver:1,data:readData()};
            var json=JSON.stringify(payload);
            var sum=payloadSummary(payload);
            var desktop=false;
            try{ desktop=!lib.config.touchscreen; }catch(e){}
            openIO(
                '<div id="csh-wr-io-title">导出胜负统计</div>'
                +'<div id="csh-wr-io-tip">共 '+sum.chars+' 名武将 · '+sum.games+' 场记录 · 文本 '+fmtSize(json)
                +'。复制后到另一台设备的「导入」里粘贴即可（导入按场次累加，不会覆盖现有记录）。</div>'
                +'<textarea id="csh-wr-io-text" readonly spellcheck="false"></textarea>'
                +'<div id="csh-wr-io-stat">桌面端点「复制文本」；手机端长按文本框 → 全选 → 复制。</div>'
                +'<div id="csh-wr-io-acts">'
                +'<span class="csh-wr-iobtn primary" data-act="io-copy">复制文本</span>'
                +(desktop?'<span class="csh-wr-iobtn" data-act="io-download">下载 .json</span>':'')
                +'<span class="csh-wr-iobtn" data-act="io-close">关 闭</span>'
                +'</div>',
                json,
                function(act){
                    if(act==="io-copy"){
                        copyText(json,function(ok){
                            ioStat(ok?"已复制到剪贴板。":"复制失败，请长按文本框手动全选复制。",ok?"ok":"bad");
                        });
                    }
                    else if(act==="io-download") downloadJSON(json);
                }
            );
        }
        function importData(){
            openIO(
                '<div id="csh-wr-io-title">导入胜负统计</div>'
                +'<div id="csh-wr-io-tip">把之前「导出」得到的 JSON 文本粘贴到下面。导入按场次累加，不会覆盖现有记录。</div>'
                +'<textarea id="csh-wr-io-text" spellcheck="false" placeholder="在这里粘贴 JSON 文本…"></textarea>'
                +'<div id="csh-wr-io-stat">尚未粘贴内容。</div>'
                +'<div id="csh-wr-io-acts">'
                +'<span class="csh-wr-iobtn" data-act="io-paste">从剪贴板粘贴</span>'
                +'<span class="csh-wr-iobtn" data-act="io-cancel">取 消</span>'
                +'<span class="csh-wr-iobtn primary dis" data-act="io-import" id="csh-wr-io-ok">导入并合并</span>'
                +'</div>',
                "",
                function(act,layer,ta){
                    if(act==="io-paste"){ pasteTo(ta,refresh); return; }
                    if(act==="io-cancel"){ closeIO(); return; }
                    if(act!=="io-import") return;
                    var res=parsePayload(ta.value);
                    if(!res.ok){ ioStat(res.error,"bad"); return; }
                    var added=mergePayload(res.payload);
                    wr.page=0;
                    var root=document.getElementById("csh-wr-root");
                    if(root) render(root);
                    try{ ta.disabled=true; }catch(eD){}
                    var acts=layer.querySelector("#csh-wr-io-acts");
                    if(acts) acts.innerHTML='<span class="csh-wr-iobtn primary" data-act="io-close">完 成</span>';
                    ioStat("导入完成：已合并 "+added.chars+" 名武将 · "+added.games+" 场（与现有记录累加）。","ok");
                }
            );
            if(!ioLayer) return;
            var ta=ioLayer.querySelector("#csh-wr-io-text");
            var okBtn=ioLayer.querySelector("#csh-wr-io-ok");
            function refresh(){
                var raw=ta?ta.value:"";
                if(!String(raw||"").trim()){
                    ioStat("尚未粘贴内容。","");
                    if(okBtn) okBtn.classList.add("dis");
                    return;
                }
                var res=parsePayload(raw);
                if(!res.ok){
                    ioStat(res.error,"bad");
                    if(okBtn) okBtn.classList.add("dis");
                    return;
                }
                var s=payloadSummary(res.payload);
                ioStat("已识别："+s.chars+" 名武将 · "+s.games+" 场记录。点「导入并合并」开始。","ok");
                if(okBtn) okBtn.classList.remove("dis");
            }
            if(ta) ta.addEventListener("input",refresh);
            refresh();
            /* 桌面端直接把光标放进文本框（省一次点击）；手机端不抢焦点，避免软键盘顶掉浮层 */
            try{
                if(!lib.config.touchscreen) setTimeout(function(){ try{ ta.focus(); }catch(e){ } },30);
            }catch(e){}
        }
        /* 清空全部：旧实现用 prompt 让人输入「确认」，Electron 下同样不可用。
           这里换成浮层输入框，语义不变（必须打出「确认」二字才可执行）。 */
        function openClearAll(root){
            openIO(
                '<div id="csh-wr-io-title" class="danger">清空全部胜负统计</div>'
                +'<div id="csh-wr-io-tip">将清空全部武将战绩、阵营胜率与玩家操控数据（不含钱包 / AI 世界 / 成就），且无法撤销。<br>如需继续，请在下面输入「确认」二字。</div>'
                +'<input id="csh-wr-io-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="输入 确认">'
                +'<div id="csh-wr-io-stat">仅清空胜负统计。</div>'
                +'<div id="csh-wr-io-acts">'
                +'<span class="csh-wr-iobtn" data-act="io-close">取 消</span>'
                +'<span class="csh-wr-iobtn danger dis" data-act="io-confirm" id="csh-wr-io-ok">清 空</span>'
                +'</div>',
                null,
                function(act,layer){
                    if(act!=="io-confirm") return;
                    var inp=layer.querySelector("#csh-wr-io-input");
                    if(!inp||inp.value.trim()!=="确认"){ ioStat("请输入「确认」二字后再清空。","bad"); return; }
                    game.saveConfig(STAT_KEY,{});
                    wr.page=0;
                    render(root);
                    closeIO();
                }
            );
            if(!ioLayer) return;
            var inp=ioLayer.querySelector("#csh-wr-io-input");
            var ok=ioLayer.querySelector("#csh-wr-io-ok");
            if(inp){
                inp.addEventListener("input",function(){
                    var ready=inp.value.trim()==="确认";
                    if(ok) ok.classList.toggle("dis",!ready);
                    ioStat(ready?"确认无误，点「清空」将删除全部战绩。":"仅清空胜负统计，输入「确认」后可继续。",ready?"bad":"");
                });
                setTimeout(function(){ try{ inp.focus(); }catch(e){} },30);
            }
        }
        function pageBar(pages,withReset){
            var h='<div id="csh-wr-page">';
            h+='<span class="csh-wr-pbtn'+(wr.page<=0?" dis":"")+'" data-act="prev">◀ 上一页</span>';
            h+='<span class="csh-wr-pageinfo">第 '+(wr.page+1)+' / '+pages+' 页</span>';
            h+='<span class="csh-wr-pbtn'+(wr.page>=pages-1?" dis":"")+'" data-act="next">下一页 ▶</span>';
            if(withReset) h+='<span class="csh-wr-danger" data-act="resetcamps">重置阵营数据</span>';
            if(wr._undo) h+='<span class="csh-wr-pbtn" data-act="undo">撤销删除</span>';
            h+='<span class="csh-wr-pbtn" data-act="export">导出</span>';
            h+='<span class="csh-wr-pbtn" data-act="import">导入</span>';
            h+='<span class="csh-wr-pbtn" data-act="close">关 闭</span>';
            return h+'</div>';
        }
        function footBar(withReset){
            var h='<div id="csh-wr-page">';
            if(withReset) h+='<span class="csh-wr-danger" data-act="resetcamps">重置阵营数据</span>';
            if(wr._undo) h+='<span class="csh-wr-pbtn" data-act="undo">撤销删除</span>';
            h+='<span class="csh-wr-pbtn" data-act="export">导出</span>';
            h+='<span class="csh-wr-pbtn" data-act="import">导入</span>';
            h+='<span class="csh-wr-pbtn" data-act="close">关 闭</span>';
            return h+'</div>';
        }
        /** 阵营行单元格：场次 / 胜 / 负 / 胜率条 */
        function campCells(e){
            return '<td>'+e.games+'</td><td class="win">'+e.win+'</td><td class="lose">'+e.lose+'</td>'
                +'<td class="rate">'+barCell(e)+'</td>';
        }
        function renderCamps(root){
            var html=[panelHead(),navBar()];
            if(wr.mode!="identity"){
                html.push(emptyBox("阵营胜率仅适用于身份场",
                    "请先切换到「身份场」，再查看主公 / 忠臣 / 反贼 / 内奸的分阵营战绩；<br>或改看「武将排行」。"));
                html.push(footBar(false));
                root.innerHTML=html.join("");
                return;
            }
            var camps=(readData().camps)||{};
            function zero(){ return {games:0,win:0,lose:0}; }
            function add(a,b){ return {games:a.games+b.games,win:a.win+b.win,lose:a.lose+b.lose}; }
            var zhu=camps.zhu||zero(),zhong=camps.zhong||zero(),fan=camps.fan||zero(),nei=camps.nei||zero(),commoner=camps.commoner||zero();
            var merged=add(zhu,zhong);
            var total=merged.games+fan.games+nei.games+commoner.games;
            var games=zhu.games; // 每局恰1名主公，主公场次即局数
            if(!total){
                html.push(emptyBox("暂无阵营统计数据",
                    "完成一局身份场后，主公 / 忠臣 / 反贼 / 内奸的胜负会自动记录在这里。"));
                html.push(footBar(false));
                root.innerHTML=html.join("");
                return;
            }
            html.push(kpiRow([
                {k:"总局数",v:games,n:"每局恰 1 名主公"},
                {k:"主忠胜率",v:fmtPct(rateOf(merged)),n:"主公 + 忠臣合并",tone:toneOf(rateOf(merged))},
                {k:"反贼胜率",v:fmtPct(rateOf(fan)),n:"反贼阵营",tone:toneOf(rateOf(fan))},
                {k:"内奸胜率",v:fmtPct(rateOf(nei)),n:"内奸阵营",tone:toneOf(rateOf(nei))}
            ]));
            html.push(secTitle("分阵营明细"));
            var rows=[
                ["主公忠臣",merged,"#ffd97a",false],
                ["主公",zhu,"#ffe9a8",true],
                ["忠臣",zhong,"#ffe9a8",true],
                ["反贼",fan,"#ff9f9f",false],
                ["内奸",nei,"#c0aef7",false],
                ["平民",commoner,"#9fd89f",false]
            ];
            html.push('<table id="csh-wr-camps">');
            html.push('<thead><tr><th class="nosort">阵营</th><th class="nosort">场次</th><th class="nosort">胜</th><th class="nosort">负</th><th class="nosort">胜率</th></tr></thead><tbody>');
            for(var i=0;i<rows.length;i++){
                if(rows[i][1].games<=0) continue;
                var cls=rows[i][3]?' class="sub"':'';
                var prefix=rows[i][3]?'└ ':'';
                html.push('<tr'+cls+'><td class="wname" style="color:'+rows[i][2]+'">'+prefix+rows[i][0]+'</td>'+campCells(rows[i][1])+'</tr>');
            }
            html.push('</tbody></table>');
            html.push('<div class="csh-wr-note">共 '+total+' 人次（每局每名角色各计 1 人次，胜率 = 胜 ÷ 场次）；主公 / 忠臣合并统计并附分项，明忠计入忠臣。</div>');
            html.push(footBar(true));
            root.innerHTML=html.join("");
        }

        function renderMe(root){
            var med=(readData().me)||{};
            var chars=med.chars||{}, mcamps=med.camps||{};
            function zero(){ return {games:0,win:0,lose:0}; }
            function add(a,b){ return {games:a.games+b.games,win:a.win+b.win,lose:a.lose+b.lose}; }
            var arr=[];
            for(var n in chars){
                var ce=chars[n];
                if(!ce||!ce.games||ce.games<wr.minGames) continue; // 场次不足阈值不上榜
                if(wr.search && cname(n).indexOf(wr.search)<0) continue; // 关键字搜索（2026-10-01 D5）
                arr.push({name:n,games:ce.games,win:ce.win,lose:ce.lose});
            }
            arr.sort(function(a,b){
                var ra=a.games?a.win/a.games:0, rb=b.games?b.win/b.games:0;
                if(ra!=rb) return rb-ra;
                return b.games-a.games;
            });
            var zhu=mcamps.zhu||zero(),zhong=mcamps.zhong||zero(),fan=mcamps.fan||zero(),nei=mcamps.nei||zero(),commoner=mcamps.commoner||zero();
            var merged=add(zhu,zhong);
            var mtotal=merged.games+fan.games+nei.games+commoner.games;
            var html=[panelHead(),navBar()];
            if(!arr.length&&!mtotal){
                html.push(emptyBox("暂无玩家操控数据",
                    "完成一局身份场后，你操控的角色胜率与身份战绩会自动记录在这里。"));
                html.push(footBar(false));
                root.innerHTML=html.join("");
                return;
            }
            var myGames=0,myWin=0;
            for(var mi=0;mi<arr.length;mi++){ myGames+=arr[mi].games; myWin+=arr[mi].win; }
            var best=arr[0];
            html.push(kpiRow([
                {k:"操控角色",v:arr.length,n:"场次 ≥ "+wr.minGames+" 才上榜"},
                {k:"总场次",v:myGames,n:"已统计的对局"},
                {k:"整体胜率",v:myGames?fmtPct(myWin/myGames):"—",n:"加权（胜 ÷ 场次）",tone:myGames?toneOf(myWin/myGames):""},
                {k:"最佳角色",v:best?esc(cname(best.name)):"—",n:best?("胜率 "+fmtPct(rateOf(best))):"暂无达标角色",tone:"hi"}
            ]));
            if(arr.length){
                var pages=Math.max(1,Math.ceil(arr.length/PAGE_SIZE));
                if(wr.page>=pages) wr.page=pages-1;
                if(wr.page<0) wr.page=0;
                var start=wr.page*PAGE_SIZE;
                var pageRows=arr.slice(start,start+PAGE_SIZE);
                html.push(secTitle("角色胜率排行"));
                html.push('<table id="csh-wr-mytable">');
                html.push('<thead><tr><th class="nosort">名次</th><th class="nosort">角色</th><th class="nosort">场次</th><th class="nosort">胜</th><th class="nosort">负</th><th class="nosort">胜率</th></tr></thead><tbody>');
                for(var i=0;i<pageRows.length;i++){
                    var e=pageRows[i];
                    var ext=e.name.indexOf("csh_")==0&&e.name.indexOf("csh_m_")!=0;
                    html.push('<tr'+(ext?' class="myext"':'')+'>'
                        +'<td>'+rankBadge(start+i)+'</td>'
                        +'<td class="wname'+(ext?" ext":"")+'">'+esc(cname(e.name))+(ext?" ★":"")+'</td>'
                        +'<td>'+e.games+'</td><td class="win">'+e.win+'</td><td class="lose">'+e.lose+'</td>'
                        +'<td class="rate">'+barCell(e)+'</td></tr>');
                }
                html.push('</tbody></table>');
                /* 窄屏卡片视图：手机竖屏同样不再横滚（CSS 在 <620px 切换） */
                html.push(cardList(pageRows,start));
                html.push(pageBar(pages,false));
            }
            if(mtotal){
                var rows=[
                    ["主公忠臣",merged,"#ffd97a",false],
                    ["主公",zhu,"#ffe9a8",true],
                    ["忠臣",zhong,"#ffe9a8",true],
                    ["反贼",fan,"#ff9f9f",false],
                    ["内奸",nei,"#c0aef7",false],
                    ["平民",commoner,"#9fd89f",false]
                ];
                html.push(secTitle("你的阵营胜率"));
                html.push('<table id="csh-wr-table2">');
                html.push('<thead><tr><th class="nosort">阵营</th><th class="nosort">场次</th><th class="nosort">胜</th><th class="nosort">负</th><th class="nosort">胜率</th></tr></thead><tbody>');
                for(var i2=0;i2<rows.length;i2++){
                    if(rows[i2][1].games<=0) continue;
                    var cls2=rows[i2][3]?' class="sub"':'';
                    var prefix2=rows[i2][3]?'└ ':'';
                    html.push('<tr'+cls2+'><td class="wname" style="color:'+rows[i2][2]+'">'+prefix2+rows[i2][0]+'</td>'+campCells(rows[i2][1])+'</tr>');
                }
                html.push('</tbody></table>');
            }
            if(!arr.length) html.push(footBar(false));
            root.innerHTML=html.join("");
        }

        function renderList(root){
            var arr=tableData();
            var pages=Math.max(1,Math.ceil(arr.length/PAGE_SIZE));
            if(wr.page>=pages) wr.page=pages-1;
            if(wr.page<0) wr.page=0;
            var start=wr.page*PAGE_SIZE;
            var rows=arr.slice(start,start+PAGE_SIZE);
            var html=[panelHead(),navBar()];
            if(!arr.length){
                html.push(emptyBox("暂无"+MODE_NAMES[wr.mode]+"模式的统计数据",
                    "完成一局游戏后，登场武将的战绩会自动记录在这里。<br>仅统计场次 ≥ "+wr.minGames+" 的武将，避免小样本胜率失真。"));
                html.push(footBar(false));
                root.innerHTML=html.join("");
                return;
            }
            var tGames=0,tWin=0,tKill=0,tDmg=0;
            for(var ti=0;ti<arr.length;ti++){
                tGames+=arr[ti].games||0; tWin+=arr[ti].win||0;
                tKill+=arr[ti].kill||0; tDmg+=arr[ti].damage||0;
            }
            var top=arr[0];
            html.push(kpiRow([
                {k:"上榜武将",v:arr.length,n:"场次 ≥ "+wr.minGames+" 才上榜"},
                {k:"总场次",v:tGames,n:esc(MODE_NAMES[wr.mode])},
                {k:"整体胜率",v:tGames?fmtPct(tWin/tGames):"—",n:"加权（胜 ÷ 场次）",tone:tGames?toneOf(tWin/tGames):""},
                {k:"场均击杀",v:tGames?fmtNum(tKill/tGames):"—",n:"全榜合计 ÷ 场次"},
                {k:"当前首位",v:esc(cname(top.name)),n:"按当前排序",tone:"hi"}
            ]));
            var cols=[
                ["rank","#"],
                ["name","武将"],
                ["games","场次"],
                ["win","胜"],
                ["lose","负"],
                ["winrate","胜率"],
                ["avgdamage","均伤"],
                ["avgkill","均杀"],
                ["avgdamaged","均受"],
                ["avggain","均摸"],
                ["avgdiscard","均弃"],
                ["del",""]
            ];
            html.push(secTitle("武将排行 · 第 "+(wr.page+1)+" / "+pages+" 页"));
            html.push('<table id="csh-wr-table">');
            html.push('<thead><tr>');
            for(var i=0;i<cols.length;i++){
                var c=cols[i];
                if(c[0]=="rank"){ html.push('<th class="nosort">#</th>'); continue; }
                if(c[0]=="del"){ html.push('<th class="nosort"></th>'); continue; }
                var arrow=(wr.sortKey==c[0]?(wr.sortAsc?" ▲":" ▼"):"");
                var cls=(wr.sortKey==c[0]?" class='on'":"");
                html.push('<th'+cls+' data-act="sort" data-val="'+c[0]+'">'+c[1]+arrow+'</th>');
            }
            html.push('</tr></thead><tbody>');
            for(var i=0;i<rows.length;i++){
                var e=rows[i];
                var ext=e.name.indexOf("csh_")==0&&e.name.indexOf("csh_m_")!=0;
                html.push('<tr'+(ext?' class="myext"':'')+'>');
                html.push('<td>'+rankBadge(start+i)+'</td>');
                html.push('<td class="wname'+(ext?" ext":"")+'">'+esc(cname(e.name))+(ext?" ★":"")+'</td>');
                html.push('<td>'+e.games+'</td>');
                html.push('<td class="win">'+e.win+'</td>');
                html.push('<td class="lose">'+e.lose+'</td>');
                html.push('<td class="rate">'+barCell(e)+'</td>');
                html.push('<td>'+fmtNum(e.games?e.damage/e.games:0)+'</td>');
                html.push('<td>'+fmtNum(e.games?e.kill/e.games:0)+'</td>');
                html.push('<td>'+fmtNum(e.games?e.damaged/e.games:0)+'</td>');
                html.push('<td>'+fmtNum(e.games?e.gain/e.games:0)+'</td>');
                html.push('<td>'+fmtNum(e.games?e.discard/e.games:0)+'</td>');
                html.push('<td><button class="csh-wr-del" data-act="del" data-val="'+esc(e.name)+'" title="删除该武将战绩">×</button></td>');
                html.push('</tr>');
            }
            html.push('</tbody></table>');
            /* 窄屏卡片视图（CSS 在 <620px 时切换显示）：与上表同数据同排序同分页 */
            html.push(cardList(rows,start));
            html.push('<div class="csh-wr-note">点表头可切换排序（再点一次反向）· 带 ★ 为池子魔将扩展武将 · 均伤/均杀/均受/均摸/均弃 = 场均伤害/杀敌/受伤/摸牌/弃牌</div>');
            html.push(pageBar(pages,false));
            root.innerHTML=html.join("");
        }
        function closePanel(){
            closeIO();
            if(wr.dialog){
                try{ if(wr.dialog.parentNode) wr.dialog.parentNode.removeChild(wr.dialog); }catch(e){}
                wr.dialog=null;
            }
        }
        /* 原生 confirm 的替身：优先走界面基座（自绘、层级/触屏/文案都可控）；
           基座缺席时退回原生 confirm（功能不残）。 */
        function uiConfirm(opts,cb){
            try{
                if(lib.cshUI&&typeof lib.cshUI.confirm==="function"){ lib.cshUI.confirm(opts,cb); return; }
            }catch(e){}
            try{ cb(!!confirm(String((opts&&opts.message)||""))); }catch(e2){ cb(false); }
        }
        /* D1 单条删除（联动 me.chars，避免两页数据打架）+ D4 撤销快照 */
        function delChar(name,root){
            var d=readData();
            var e=(d[wr.mode]||{})[name];
            if(!e) return;
            var summary="场次 "+e.games+" · 胜 "+e.win+" · 负 "+e.lose+" · 胜率 "+fmtPct(rateOf(e))+" · 场均击杀 "+fmtNum(e.games?e.kill/e.games:0);
            uiConfirm({
                title:"删除武将战绩",
                message:"确定删除【"+cname(name)+"】在「"+MODE_NAMES[wr.mode]+"」的战绩吗？\n"+summary+"\n删除后不可恢复（可点「撤销」）。",
                ok:"删除",
                danger:true,
            },function(ok){
                if(!ok) return;
                wr._undo=JSON.parse(JSON.stringify(d));               // D4：内存级快照（不落盘）
                delete d[wr.mode][name];
                if(d.me&&d.me.chars){ delete d.me.chars[name]; if(!Object.keys(d.me.chars).length) delete d.me.chars; }
                if(d.me&&!Object.keys(d.me).length) delete d.me;
                game.saveConfig(STAT_KEY,d);
                render(root);
                if(wr._undoTimer) clearTimeout(wr._undoTimer);
                wr._undoTimer=setTimeout(function(){ wr._undo=null; },8000);   // 8 秒后撤销失效
            });
        }
        // Esc 关闭：全局只绑一次，面板不存在时直接放行，不干扰引擎其它快捷键
        function bindEsc(){
            if(lib.__csh_wr_esc) return;
            lib.__csh_wr_esc=true;
            try{
                document.addEventListener("keydown",function(e){
                    if(e.key!=="Escape"&&e.keyCode!==27) return;
                    if(!document.getElementById("csh-wr-overlay")) return;
                    try{ e.preventDefault(); e.stopPropagation(); }catch(_e){}
                    /* 导入/导出/清空浮层开着时，Esc 只关浮层，不连面板一起关 */
                    if(document.getElementById("csh-wr-io")){ closeIO(); return; }
                    closePanel();
                },true);
            }catch(_e2){}
        }
        function makeOverlay(renderFn){
            ensureStyle();
            bindEsc();
            var overlay=document.createElement("div");
            overlay.id="csh-wr-overlay";
            var panel=document.createElement("div");
            panel.id="csh-wr-panel";
            var root=document.createElement("div");
            root.id="csh-wr-root";
            panel.appendChild(root);
            overlay.appendChild(panel);
            overlay.addEventListener("click",function(e){
                if(e.target===overlay) closePanel();
            });
            root.addEventListener("click",function(e){
                var t=e.target;
                while(t&&t!=root&&!(t.getAttribute&&t.getAttribute("data-act"))) t=t.parentNode;
                if(!t||t==root) return;
                var act=t.getAttribute("data-act");
                var val=t.getAttribute("data-val");
                if(act=="mode"){
                    if(MODE_NAMES[val] && wr.mode!=val){ wr.mode=val; wr.page=0; render(root); }
                }
                else if(act=="tab"){
                    if(wr.view!=val){ wr.view=val; wr.page=0; render(root); }
                }
                else if(act=="sort"){
                    if(wr.sortKey==val) wr.sortAsc=!wr.sortAsc;
                    else{ wr.sortKey=val; wr.sortAsc=false; }
                    render(root);
                }
                else if(act=="prev"){ if(wr.page>0){ wr.page--; render(root); } }
                else if(act=="next"){ wr.page++; render(root); }
                else if(act=="resetcamps"){
                    uiConfirm({
                        title:"重置阵营数据",
                        message:"确定清空阵营胜率数据吗？\n（含全场阵营与你自己的阵营战绩，武将排行与角色胜率排行不受影响）",
                        ok:"重置",
                        danger:true,
                    },function(ok){
                        if(!ok) return;
                        var d=readData();
                        delete d.camps;
                        if(d.me){ delete d.me.camps; if(!Object.keys(d.me).length) delete d.me; }
                        game.saveConfig(STAT_KEY,d);
                        render(root);
                    });
                }
                else if(act=="mingames"){
                    var g=parseInt(val,10);
                    if(g==1||g==5||g==10){ wr.minGames=g; wr.page=0; render(root); }
                }
                else if(act=="del"){ delChar(val,root); }
                else if(act=="undo"){
                    if(wr._undo){ game.saveConfig(STAT_KEY,wr._undo); wr._undo=null; render(root); }
                }
                else if(act=="clearmode"){
                    uiConfirm({
                        title:"清空本模式战绩",
                        message:"将清空【"+MODE_NAMES[wr.mode]+"】全部武将战绩。\n阵营胜率与玩家操控数据不受影响。",
                        ok:"清空",
                        danger:true,
                    },function(ok){
                        if(!ok) return;
                        var d2=readData();
                        delete d2[wr.mode];
                        game.saveConfig(STAT_KEY,d2);
                        wr.page=0; render(root);
                    });
                }
                else if(act=="clearall"){ openClearAll(root); }
                else if(act=="export"){ exportData(); }
                else if(act=="import"){ importData(); }
                else if(act=="close"){ closePanel(); }
            });
            // 搜索框：input 事件委托（render 重建 DOM 后仍有效）
            root.addEventListener("input",function(e){
                if(e.target&&e.target.id==="csh-wr-search"){
                    wr.search=e.target.value.trim();
                    wr.page=0;
                    render(root);
                    var s2=root.querySelector("#csh-wr-search");
                    if(s2){ try{ s2.focus(); }catch(_e){} }
                }
            });
            renderFn(root);
            uiHost().appendChild(overlay);
            return overlay;
        }
        function render(root){
            if(wr.view=="camps") renderCamps(root);
            else if(wr.view=="me") renderMe(root);
            else renderList(root);
        }
        wr.open=function(){
            try{
                // 联机禁用入口（与 debug/emote 一致；记录本身也已在联机跳过）
                if ((typeof _status !== "undefined" && _status.connectMode) || (typeof game !== "undefined" && game.online)) {
                    alert("胜负统计仅单机可用（联机已禁用）");
                    return;
                }
                closePanel();
                wr.page=0;
                wr.dialog=makeOverlay(render);
            }catch(e){
                alert("胜负统计面板打开失败："+((e&&e.message)||e));
            }
        };
        lib.csh_winrate=wr;
        /* U5（2026-10-01）：补双挂载，与 csh_world.js:678 / csh_wallet.js:1402 惯例一致 */
        try { if (typeof window !== "undefined") { window.CSH = window.CSH || {}; window.CSH.winrate = wr; } } catch (e) {}
    })();



export default null;
