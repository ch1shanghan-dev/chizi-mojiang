/* Local network preferences. No request or identity creation during installation. */
(function (root) {
    'use strict';
    if (root.CSHOnline) return;
    try {
        if (root.parent && root.parent !== root && root.parent.CSHOnline) {
            root.CSHOnline = root.parent.CSHOnline;
            return;
        }
    } catch (error) { /* An isolated frame starts disabled. */ }

    var KEY = 'csh_online_policy_v1', epoch = 0, listeners = [], active = [];
    // Legacy public reads only. A new origin/authentication protocol is not guessed here.
    var SERVICE = Object.freeze({
        id: 'legacy-board-v1', base: 'https://chishanghan.duckdns.org',
        protocol: 'legacy', label: '旧服务历史社区榜', reads: true, writes: false,
        writeReason: '在线发布与全球应援暂未接入已验证的身份和幂等接口；已付记录保留在本机'
    });
    var ORIGINS = [SERVICE.base, 'https://raw.githubusercontent.com', 'https://api.github.com',
        'https://cdn.jsdelivr.net', 'https://fastly.jsdelivr.net', 'https://ghproxy.net', 'https://gh-proxy.com'];
    function clean(value) {
        if (!value || value.v !== 1 || typeof value.enabled !== 'boolean' ||
            typeof value.publishFor !== 'string' || value.publishFor.length > 120) throw Error('联网设置格式异常');
        return {v: 1, enabled: value.enabled, publishFor: value.publishFor};
    }
    function read() {
        try {
            var raw = root.localStorage.getItem(KEY);
            return {value: raw === null ? {v: 1, enabled: false, publishFor: ''} : clean(JSON.parse(raw)), error: ''};
        } catch (error) {
            return {value: {v: 1, enabled: false, publishFor: ''}, error: '联网设置不可读取，已保持离线'};
        }
    }
    var current = read();
    function notify() {
        epoch++;
        active.slice().forEach(function (cancel) { try { cancel(); } catch (error) {} });
        listeners.slice().forEach(function (fn) { try { fn(snapshot()); } catch (error) {} });
    }
    function refresh() {
        var next = read();
        if (JSON.stringify(next) !== JSON.stringify(current)) { current = next; notify(); }
    }
    function snapshot() {
        return {enabled: current.value.enabled && !current.error, consented: current.value.publishFor === SERVICE.id,
            epoch: epoch, error: current.error, service: SERVICE};
    }
    function enabled() { refresh(); return snapshot().enabled; }
    function canPublish() { return enabled() && current.value.publishFor === SERVICE.id && SERVICE.writes; }
    function save(next) {
        try {
            next = clean(next);
            root.localStorage.setItem(KEY, JSON.stringify(next));
            if (root.localStorage.getItem(KEY) !== JSON.stringify(next)) throw Error('readback');
            current = {value: next, error: ''}; notify();
            return {ok: true, state: snapshot()};
        } catch (error) { return {ok: false, reason: '联网设置未保存，请恢复本机存储后重试'}; }
    }
    function setEnabled(value) {
        if (typeof value !== 'boolean') return {ok: false, reason: '联网设置无效'};
        refresh();
        return save({v: 1, enabled: value, publishFor: current.value.publishFor});
    }
    function setPublishConsent(value) {
        if (typeof value !== 'boolean') return {ok: false, reason: '发布设置无效'};
        refresh();
        if (value && !SERVICE.writes) return {ok: false, reason: SERVICE.writeReason};
        return save({v: 1, enabled: current.value.enabled, publishFor: value ? SERVICE.id : ''});
    }
    function subscribe(fn) {
        if (typeof fn !== 'function') return function () {};
        listeners.push(fn);
        return function () { var at = listeners.indexOf(fn); if (at >= 0) listeners.splice(at, 1); };
    }
    function watch(cancel) {
        active.push(cancel);
        return function () { var at = active.indexOf(cancel); if (at >= 0) active.splice(at, 1); };
    }
    function refusal() { return Object.assign(Error(current.error || '当前为离线模式，请在联网设置中开启公开信息读取'), {code: 'offline'}); }

    // Explicit remote requests only. Never patch the engine's or another extension's fetch.
    async function external(url, options) {
        if (!enabled()) throw refusal();
        var target = new URL(url);
        if (target.protocol !== 'https:' || target.username || target.password || ORIGINS.indexOf(target.origin) < 0)
            throw Error('联网来源不在可信列表');
        options = options || {};
        if (options.method && options.method !== 'GET' && options.method !== 'HEAD') throw Error('此入口仅供只读信息和资源');
        var generation = epoch, controller = new AbortController(), closed = false, timer, unlink;
        var signal = options.signal;
        function cleanup() {
            if (closed) return; closed = true;
            clearTimeout(timer); if (unlink) unlink();
            if (signal) signal.removeEventListener('abort', abort);
        }
        function abort() { controller.abort(); cleanup(); }
        timer = setTimeout(abort, 15000);
        unlink = watch(abort);
        if (signal) { if (signal.aborted) abort(); else signal.addEventListener('abort', abort, {once: true}); }
        function valid() {
            if (controller.signal.aborted || !enabled() || generation !== epoch) throw Object.assign(Error('联网请求已取消'), {code: 'cancelled'});
        }
        try {
            valid();
            var settings = Object.assign({}, options, {signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error'});
            var response = await root.fetch(target.href, settings); valid();
            async function consume(kind) {
                var limit = kind === 'arrayBuffer' ? 16 * 1024 * 1024 : 512 * 1024;
                try {
                    valid();
                    if (Number(response.headers.get('content-length')) > limit) throw Error('联网文件超出大小限制');
                    if (!response.body || typeof response.body.getReader !== 'function') throw Error('当前环境缺少有界读取能力，请使用完整安装包');
                    var reader = response.body.getReader(), chunks = [], total = 0;
                    while (true) {
                        var part = await reader.read(); valid(); if (part.done) break;
                        total += part.value.byteLength;
                        if (total > limit) { await reader.cancel(); throw Error('联网文件超出大小限制'); }
                        chunks.push(part.value);
                    }
                    var bytes = new Uint8Array(total), offset = 0;
                    chunks.forEach(function (item) { bytes.set(item, offset); offset += item.byteLength; });
                    valid();
                    if (kind === 'arrayBuffer') return bytes.buffer;
                    var text = new TextDecoder().decode(bytes);
                    return kind === 'json' ? JSON.parse(text) : text;
                } finally { cleanup(); }
            }
            if (!response.ok) abort(); else if (options.method === 'HEAD') cleanup();
            return {ok: response.ok, status: response.status, headers: response.headers, url: response.url,
                text: function () { return consume('text'); }, json: function () { return consume('json'); },
                arrayBuffer: function () { return consume('arrayBuffer'); }};
        } catch (error) { cleanup(); throw error; }
    }
    function local(url, options) {
        var target = new URL(url, root.location.href), here = new URL(root.location.href);
        if (target.username || target.password || !((target.protocol === 'file:' && here.protocol === 'file:') || target.origin === here.origin))
            return Promise.reject(Error('本机资源地址无效'));
        if (!/\/extension\/池子魔将\/store\.json$/.test(decodeURIComponent(target.pathname)))
            return Promise.reject(Error('本机资源路径无效'));
        return root.fetch(target.href, options);
    }
    try { root.addEventListener('storage', function (event) { if (event.key === KEY || event.key === null) refresh(); }); } catch (error) {}
    root.CSHOnline = {KEY: KEY, service: function () { return SERVICE; }, enabled: enabled,
        snapshot: function () { refresh(); return snapshot(); }, canPublish: canPublish,
        setEnabled: setEnabled, setPublishConsent: setPublishConsent, subscribe: subscribe, watch: watch,
        external: external, local: local};
})(typeof window !== 'undefined' ? window : globalThis);
