import { lib } from "../../../noname.js";
// Scoped local raster decoration. Existing handlers and data own behavior.
(function () {
    if (lib.cshArt) return;
    var ICONS = { debug: "debug-workshop.png", winrate: "war-record.png", interact: "interaction-strategy.png" };
    var PANELS = { "csh-dbg-panel": "debug", "csh-wr-panel": "winrate", "csh-ia-panel": "interact", "csh-pick-panel": "debug", "csh-skillcode": "debug", "csh-cardinfo": "debug", "csh-dbg-ask": "debug", "csh-redeem": "debug", "csh-extstore": "debug", "csh-update": "debug", "csh-wr-io": "winrate", "csh-ia-cust-ov": "interact", "csh-ui-confirm": "debug" };
    var TABS = ".csh-dbg-tab,.csh-dbg-chip,.csh-wr-tab,.csh-wr-seg-item,.csh-wr-fbtn,.csh-ia-seg .it,.csh-cust-seg .it";
    var LABEL_ACTIONS = { "复制状态":"copy", "复制BUG报告":"copy", "复制全部":"copy", "复制 ID":"copy", "复制文本":"copy", "导出日志":"transfer", "导出全部":"transfer", "导出":"transfer", "导入":"transfer", "导入（合并）":"transfer", "导入并合并":"transfer", "粘贴":"transfer", "从剪贴板粘贴":"transfer", "下载 .json":"transfer", "打开卡牌检索器…":"search", "查看":"search", "查看技能代码":"search", "刷新状态":"inspect", "刷新追踪":"inspect", "查技能奇才":"inspect", "断言检查":"inspect", "保存快照":"inspect", "比较最近二快照":"inspect", "生成BUG报告":"inspect", "Core自检":"inspect", "播报链路自检":"inspect", "开Event":"inspect", "关Event":"inspect", "开Storage轮询":"inspect", "关Storage轮询":"inspect", "打印storage":"inspect", "场上角色":"target", "我的技能":"inspect", "删除":"clear", "清空日志":"clear", "清空追踪":"clear", "移除":"clear", "移出":"clear", "清空本模式":"clear", "清空全部":"clear", "卸EventHook":"clear", "清skill次数":"clear" };
    var ACTION_ICONS = { copy:"copy-scroll.png", transfer:"transfer-chest.png", search:"search-lens.png", inspect:"inspect-compass.png", clear:"clear-brazier.png", target:"target-banner.png" };
    // Explicit original actions. Audio previews such as 重伤3点 are not damage actions.
    var DANGEROUS = new Set(["造成伤害…","减少体力上限…","减少护甲…","清空护甲","弃牌…","清空手牌","全场南蛮(除己)","全场南蛮(含己)","全场万箭(除己)","全场万箭(含己)","对目标杀","对目标决斗","对目标过河","全场各伤…","弃光自己装备","清空他人装备","清skill次数","目标伤1","删除","覆盖","清空日志","清空追踪","卸EventHook","1. 确认删除","1. 确认覆盖"]);
    var buttonLoads = {};
    function baseURL() {
        return (lib.assetURL || "") + "extension/池子魔将/image/ui/art-v1/";
    }
    function ensureStyle() {
        if (document.getElementById("csh-art-sample-css")) return;
        var style = document.createElement("style");
        style.id = "csh-art-sample-css";
        if(!document.getElementById("csh-experience-css")){var link=document.createElement("link");link.id="csh-experience-css";link.rel="stylesheet";link.href=(lib.assetURL||"")+"extension/池子魔将/core/csh_experience.css";(document.head||document.documentElement).appendChild(link);}
        var roots = Object.keys(PANELS).map(function(id){return "#"+id+".csh-art-sample";});
        function rule(suffix, body) { return roots.map(function (r) { return suffix.split(",").map(function (s) { return r + " " + s; }).join(","); }).join(",") + "{" + body + "}"; }
        style.textContent = [
            rule(".csh-art-heading", "display:flex!important;align-items:center!important;gap:10px!important;min-height:44px!important;"),
            "#csh-wr-panel.csh-art-sample .csh-art-heading{justify-content:center!important;}",
            "#csh-dbg-panel.csh-art-sample #csh-dbg-title.csh-art-heading::before{display:none!important;}",
            rule(".csh-art-module-icon", "position:static!important;display:block!important;flex:0 0 44px!important;width:44px!important;height:44px!important;object-fit:contain!important;pointer-events:none!important;user-select:none!important;"),
            rule(".csh-art-action-icon", "position:static!important;display:inline-block!important;vertical-align:middle!important;width:20px!important;height:20px!important;margin-right:5px!important;object-fit:contain!important;pointer-events:none!important;user-select:none!important;"),
            rule(".csh-art-rowlink", "display:inline-flex!important;align-items:center!important;min-height:44px!important;cursor:pointer!important;"),
            rule(".csh-art-input", "min-height:44px!important;box-sizing:border-box!important;"),
            rule(".csh-art-cardtile", "display:block!important;min-height:80px!important;padding:8px 18px!important;text-align:center!important;"),
            rule(".csh-art-cardtile .t,.csh-art-cardtile .i", "font-size:var(--csh-lfs-sm,12px)!important;"),
            rule(".csh-art-empty-mark", "font-size:0!important;"),
            rule(".csh-art-empty-mark>img", "display:block!important;position:static!important;width:44px!important;height:44px!important;object-fit:contain!important;margin:auto!important;pointer-events:none!important;"),
            rule(".csh-art-primary", "position:relative!important;isolation:isolate;min-width:108px!important;min-height:44px!important;padding-left:28px!important;padding-right:28px!important;box-sizing:border-box!important;font-family:inherit!important;color:#f3e3bd!important;text-shadow:none!important;background:transparent!important;border-color:transparent!important;box-shadow:0 4px 6px -4px rgba(0,0,0,.6)!important;overflow:visible!important;transition:transform .12s ease,filter .12s ease,box-shadow .12s ease!important;"),
            "html:has(#csh-wr-panel.csh-art-sample) #csh-dbg-float-btn,html:has(#csh-ia-panel.csh-art-sample) #csh-dbg-float-btn{display:none!important;}",
            rule(".csh-art-primary[data-csh-art-button-source]", "color:#f3e3bd!important;background:transparent!important;border-color:transparent!important;"),
            rule(".csh-dbg-psfb .fb-toggle.csh-art-primary", "display:inline-flex!important;align-items:center!important;justify-content:center!important;"),
            "#csh-ui-confirm.csh-art-sample .csh-ui-cf-card.danger .csh-ui-cf-btn.ok.csh-art-primary{color:#f3e3bd!important;background:transparent!important;border-color:transparent!important;}",
            rule(".csh-art-primary::before", "content:''!important;position:absolute!important;inset:-1px!important;z-index:-1!important;pointer-events:none!important;border-style:solid!important;border-color:transparent!important;border-width:8px 30px!important;border-image-source:var(--csh-art-button)!important;border-image-slice:22 150 28 150 fill!important;border-image-width:8px 30px!important;border-image-repeat:stretch!important;"),
            rule(".csh-art-primary:hover:not(:disabled):not(.dis)", "filter:brightness(1.09)!important;transform:translateY(-1px)!important;"),
            rule(".csh-art-primary:active:not(:disabled):not(.dis)", "transform:translateY(2px)!important;box-shadow:0 1px 2px rgba(0,0,0,.3)!important;filter:brightness(.94)!important;"),
            rule(".csh-art-primary:focus-visible", "outline:2px solid var(--csh-accent,#e2bd69)!important;outline-offset:3px!important;"),
            rule(".csh-art-primary:disabled,.csh-art-primary.dis,.csh-art-primary[aria-disabled='true']", "filter:saturate(.3)!important;opacity:.6!important;transform:none!important;cursor:default!important;"),
            rule(".csh-art-tab", "min-width:44px!important;min-height:44px!important;padding:8px 12px!important;font-family:inherit!important;text-shadow:none!important;box-shadow:none!important;"),
            rule(".csh-art-tab:not(.csh-art-selected)", "background:transparent!important;border:1px solid transparent!important;color:var(--csh-gray)!important;"),
            rule(".csh-art-tab:not(.csh-art-selected)::before", "display:none!important;"),
            rule(".csh-art-tab.csh-art-selected", "min-width:70px!important;font-weight:600!important;outline:1px solid var(--csh-accent)!important;outline-offset:-2px!important;"),
            rule(".csh-art-tab::before", "border-width:7px 16px!important;border-image-width:7px 16px!important;"),
            rule(".csh-art-compact,.csh-art-sort", "min-width:44px!important;min-height:44px!important;color:inherit!important;text-shadow:none!important;box-sizing:border-box!important;cursor:pointer!important;"),
            rule(".csh-art-sort", "font:inherit!important;padding:4px!important;border:0!important;background:none!important;"),
            rule(".csh-art-slim", "min-width:70px!important;padding-left:16px!important;padding-right:16px!important;"),
            rule(".csh-art-slim::before", "border-width:7px 16px!important;border-image-width:7px 16px!important;"),
            rule(".csh-art-compact:focus-visible,.csh-art-sort:focus-visible,.csh-art-field:focus-visible,.csh-art-switch:focus-visible,.csh-art-rowlink:focus-visible,.csh-art-input:focus-visible", "outline:2px solid var(--csh-accent)!important;outline-offset:2px!important;"),
            rule(".csh-art-field", "min-height:44px!important;box-sizing:border-box!important;background-image:var(--csh-art-field-icon)!important;background-repeat:no-repeat!important;background-size:22px 22px!important;background-position:9px center!important;padding-left:38px!important;"),
            rule(".csh-art-switch", "min-width:50px!important;min-height:44px!important;height:44px!important;padding:7px 3px!important;background-clip:content-box!important;"),
            "#csh-dbg-panel.csh-art-sample #csh-dbg-bgm-rd{min-height:44px!important;}",
            "#csh-dbg-float-btn.csh-art-float{width:48px!important;height:48px!important;min-width:48px!important;min-height:48px!important;}#csh-dbg-float-btn.csh-art-float>.csh-art-float-icon{position:absolute!important;inset:4px!important;width:40px!important;height:40px!important;object-fit:contain!important;pointer-events:none!important;}",
            "#csh-dbg-float-btn.csh-art-float:focus-visible{outline:2px solid var(--csh-accent)!important;outline-offset:2px!important;}",
            "@media(prefers-reduced-motion:reduce){" + rule(".csh-art-primary", "transition:none!important;") + "}",
        ].join("");
        (document.head || document.documentElement).appendChild(style);
    }
    function nativeDelegatedButton(node) {
        if (node.tagName === "BUTTON") return node;
        if (node.tagName === "TH") {
            var sort=node.querySelector("button");
            if(!sort){sort=document.createElement("button");sort.type="button";sort.className="csh-art-sort";sort.textContent=node.textContent;node.textContent="";node.appendChild(sort);}
            return sort;
        }
        // Only winrate's root event delegation uses this path; direct listeners stay on their nodes.
        var button = document.createElement("button");
        Array.prototype.forEach.call(node.attributes, function (attr) { button.setAttribute(attr.name, attr.value); });
        button.type = "button";
        button.textContent = node.textContent;
        node.parentNode.replaceChild(button, node);
        return button;
    }
    function decorateButton(button,variant) {
        var url = baseURL() + "button-"+variant+".png";
        button.setAttribute("data-csh-art-button-source", url);
        button.setAttribute("data-csh-art-variant",variant);
        button.style.setProperty("--csh-art-button", "url(\"" + url + "\")");
        if (!buttonLoads[url]) {
            var image = new Image();
            var entry = buttonLoads[url] = { ready: false, image: image };
            image.addEventListener("load", function () {
                entry.ready = true;
                Array.prototype.forEach.call(document.querySelectorAll(".csh-art-sample [data-csh-art-button-source]"), function (node) {
                    if (node.getAttribute("data-csh-art-button-source") === url) node.classList.add("csh-art-primary");
                });
            });
            image.addEventListener("error", function () { entry.ready = false; });
            image.src = url;
        }
        // Missing image keeps the original readable button; no painted substitute is claimed.
        if (buttonLoads[url].ready) button.classList.add("csh-art-primary");
    }
    function decorate(panel, kind) {
        if (!panel || !ICONS[kind]) return;
        if(panel.id==="csh-dbg-panel"&&document.documentElement.classList.contains("csh-world-view"))return;
        if(panel.id==="csh-ui-confirm"&&!document.querySelector("#csh-dbg-panel.csh-art-sample,#csh-wr-panel.csh-art-sample,#csh-ia-panel.csh-art-sample"))return;
        ensureStyle();
        panel.classList.add("csh-art-sample");
        panel.style.setProperty("--csh-art-button", "url(\"" + baseURL() + "button-primary.png\")");
        var heading = panel.querySelector(kind === "debug" ? "#csh-dbg-title" : kind === "winrate" ? "#csh-wr-title" : "#csh-ia-title");
        if (heading && !heading.querySelector(".csh-art-module-icon") && heading.getAttribute("data-csh-art-icon-failed")!==baseURL()+ICONS[kind]) {
            var icon = document.createElement("img");
            icon.className = "csh-art-module-icon";
            icon.alt = "";
            icon.setAttribute("aria-hidden", "true");
            icon.draggable = false;
            icon.addEventListener("error", function () { heading.setAttribute("data-csh-art-icon-failed",baseURL()+ICONS[kind]);icon.remove(); heading.classList.remove("csh-art-heading"); });
            icon.src = baseURL() + ICONS[kind];
            heading.classList.add("csh-art-heading");
            heading.insertBefore(icon, heading.firstChild);
        }
        var emptyMark=panel.querySelector('.csh-wr-empty-icon');
        if(emptyMark&&!emptyMark.querySelector('img')&&!emptyMark.__cshArtEmptyFailed){var emptyImage=document.createElement('img');emptyImage.alt='';emptyImage.setAttribute('aria-hidden','true');emptyImage.onload=function(){emptyMark.classList.add('csh-art-empty-mark');emptyMark.setAttribute('aria-hidden','true');};emptyImage.onerror=function(){emptyMark.__cshArtEmptyFailed=true;emptyImage.remove();};emptyImage.src=baseURL()+ICONS.winrate;emptyMark.appendChild(emptyImage);}
        if(kind==="winrate")panel.querySelectorAll("[data-act]").forEach(nativeDelegatedButton);
        panel.querySelectorAll("button,.csh-dbg-tab,.csh-dbg-chip,.csh-pick-card,.csh-dbg-psfb .fb-toggle,.csh-ia-sw,.csh-ia-seg .it,.csh-cust-seg .it,.csh-cust-line .del,.csh-cust-add .b,.csh-cust-btn").forEach(function(button){
            if(button.classList.contains("csh-art-sort")||button.closest(".csh-dbg-gamebtn"))return;
            keyboard(button);
            if(button.classList.contains("csh-ia-sw")){button.classList.add("csh-art-switch");button.setAttribute("role","switch");button.setAttribute("aria-label",button.closest('.csh-ia-card')?.querySelector('.t')?.textContent||'互动开关');button.setAttribute("aria-checked",String(button.classList.contains("on")));return;}
            if(button.tagName==="BUTTON"&&button.classList.contains("dis")){button.disabled=true;button.setAttribute("data-csh-art-disabled","1");}
            else if(button.getAttribute("data-csh-art-disabled")==="1"){button.disabled=false;button.removeAttribute("data-csh-art-disabled");}
            var label=button.textContent.trim(),act=button.getAttribute("data-act"),tab=button.matches(TABS);
            if(button.classList.contains("csh-dbg-tab")){
                if(button.classList.contains("csh-art-primary"))button.classList.remove("csh-art-primary","csh-art-tab","csh-art-selected","csh-art-slim");
                var pressed=String(button.classList.contains("on"));if(button.getAttribute("aria-pressed")!==pressed)button.setAttribute("aria-pressed",pressed);
                return;
            }
            if(button.classList.contains("csh-pick-card"))button.classList.add("csh-art-cardtile");
            if(button.id==="csh-dbg-skin")button.classList.add("csh-art-slim");
            if(/^(×|✕|✖|X|‹|›)$/.test(label)||button.classList.contains("del")||button.id==="csh-dbg-close"){button.classList.add("csh-art-compact");if(!button.getAttribute("aria-label"))button.setAttribute("aria-label",button.title||(button.classList.contains("del")?"删除台词":"关闭"));return;}
            var variant=(["del","clearall","clearmode","io-confirm"].indexOf(act)>=0||DANGEROUS.has(label)||(button.classList.contains("ok")&&panel.querySelector(".csh-ui-cf-card.danger")))?"danger":(["export","io-copy","io-import"].indexOf(act)>=0||["摸牌…","试 发","确定","兑换","立即更新"].indexOf(label)>=0)?"primary":"secondary";
            if(tab){variant="secondary";button.classList.add("csh-art-tab");var selected=button.classList.contains("on");button.classList.toggle("csh-art-selected",selected);button.setAttribute("aria-pressed",String(selected));}
            decorateButton(button,variant);
            var action=({"export":"transfer","import":"transfer","io-copy":"copy","io-paste":"transfer","io-download":"transfer","io-import":"transfer","del":"clear","clearall":"clear","clearmode":"clear","io-confirm":"clear","undo":"inspect"})[act]||LABEL_ACTIONS[label];
            if(action){button.setAttribute("data-csh-art-action",action);actionIcon(button,ACTION_ICONS[action]);}
        });
        panel.querySelectorAll('input[type="text"],input:not([type]),select').forEach(function(field){field.classList.add("csh-art-input");var file=field.tagName==="SELECT"?"target-banner.png":/搜索/.test(field.placeholder||"")?"search-lens.png":null;if(file&&ready(baseURL()+file)){field.classList.add("csh-art-field");field.style.setProperty("--csh-art-field-icon","url(\""+baseURL()+file+"\")");}});
        panel.querySelectorAll('#csh-dbg-skill-list > .csh-dbg-sk .csh-dbg-sk-info > .n').forEach(function(name){if(!name.hasAttribute('aria-label'))name.setAttribute('aria-label','查看'+name.textContent);name.classList.add('csh-art-rowlink');keyboard(name);actionIcon(name,ACTION_ICONS.search);});
        watch(panel);
    }
    function ready(url){if(!buttonLoads[url]){var image=new Image(),entry=buttonLoads[url]={ready:false,image:image};image.onload=function(){entry.ready=true;document.querySelectorAll(".csh-art-sample").forEach(queue);};image.src=url;}return buttonLoads[url].ready;}
    function actionIcon(button,file){var url=baseURL()+file;if(button.getAttribute("data-csh-art-action-failed")===url||button.querySelector(".csh-art-action-icon"))return;var img=document.createElement("img");img.className="csh-art-action-icon";img.alt="";img.setAttribute("aria-hidden","true");img.draggable=false;img.onerror=function(){button.setAttribute("data-csh-art-action-failed",url);img.remove();};img.src=url;button.insertBefore(img,button.firstChild);}
    function keyboard(node){if(/^(BUTTON|INPUT|SELECT|TEXTAREA|A)$/.test(node.tagName))return;if(!node.hasAttribute("role"))node.setAttribute("role","button");node.tabIndex=0;if(node.__cshArtKey)return;node.__cshArtKey=true;node.addEventListener("keydown",function(e){if((e.key==="Enter"||e.key===" ")&&!node.classList.contains("dis")&&node.getAttribute("aria-disabled")!=="true"){e.preventDefault();e.stopPropagation();node.click();}});}
    function queue(panel){if(panel.__cshArtQueued)return;panel.__cshArtQueued=true;Promise.resolve().then(function(){panel.__cshArtQueued=false;if(panel.isConnected)decorate(panel,PANELS[panel.id]);});}
    function watch(panel){if(panel.__cshArtObserver||typeof MutationObserver==="undefined")return;panel.__cshArtObserver=new MutationObserver(function(records){records.forEach(function(record){record.removedNodes.forEach(cleanRemoved);});queue(panel);});panel.__cshArtObserver.observe(panel,{childList:true,subtree:true});if(!panel.__cshArtEvents){panel.__cshArtEvents=true;panel.addEventListener("click",function(){queue(panel);},true);panel.addEventListener("change",function(){queue(panel);},true);panel.addEventListener("input",function(){queue(panel);},true);}}
    function cleanRemoved(node){if(node.nodeType!==1)return;[node].concat(Array.from(node.querySelectorAll(".csh-art-sample"))).forEach(function(panel){if(panel.__cshArtObserver){panel.__cshArtObserver.disconnect();panel.__cshArtObserver=null;}});}
    function decorateFloat(node){if(node.__cshArtFloat)return;node.__cshArtFloat=true;ensureStyle();keyboard(node);node.classList.add('csh-art-seal');node.setAttribute('aria-label','池子调试；拖动移动');node.querySelectorAll('.csh-art-float-icon').forEach(function(n){n.remove();});var text=node.querySelector('.csh-dbg-fb-main');if(text){text.style.visibility='visible';text.textContent='池';}}
    function discover(node){if(!node||node.nodeType!==1)return;if(node.id==="csh-dbg-float-btn")decorateFloat(node);if(node.id==="csh-wr-overlay"&&!node.__cshArtObserver){node.__cshArtObserver=new MutationObserver(function(records){records.forEach(function(record){record.addedNodes.forEach(discover);record.removedNodes.forEach(cleanRemoved);});});node.__cshArtObserver.observe(node,{childList:true});}if(PANELS[node.id])decorate(node,PANELS[node.id]);node.querySelectorAll(Object.keys(PANELS).map(function(id){return "#"+id;}).join(",")).forEach(function(panel){decorate(panel,PANELS[panel.id]);});}
    if(typeof MutationObserver!=="undefined"&&document.documentElement){var observer=new MutationObserver(function(records){records.forEach(function(record){record.addedNodes.forEach(discover);record.removedNodes.forEach(cleanRemoved);});});observer.observe(document.documentElement,{childList:true});}
    lib.cshArt = { decorate: decorate };
})();
