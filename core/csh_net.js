/* Bounded legacy protocol adapter. Policy owns the trusted endpoint; no wallet imports. */
(function (root) {
    'use strict';
    var MAX = 524288, CACHE_KEY = 'csh_rank_cache_v2', BACKOFF_KEY = 'csh_online_backoff_v1';
    var LEGACY_KEY = 'csh_rank_cache_v1', active = [], failures = null, manualAt = {};
    function text(value, n) { return typeof value === 'string' ? value.slice(0, n || 200) : ''; }
    function integer(value) { return Number.isSafeInteger(value) && value >= 0 ? value : 0; }
    function row(value) {
        value = value && typeof value === 'object' ? value : {};
        return {uid: text(value.uid, 100), name: text(value.name, 40), sig: text(value.sig, 160),
            rank: integer(value.rank), merit: integer(value.merit), cby: integer(value.cby), seg: text(value.seg, 40), ago: text(value.ago, 60)};
    }
    function board(value) {
        value = value && typeof value === 'object' ? value : {};
        return {list: Array.isArray(value.list) ? value.list.slice(0, 50).map(row) : [], me: value.me ? row(value.me) : null, n: integer(value.n)};
    }
    function girls(value) {
        return Array.isArray(value) ? value.slice(0, 100).filter(function (item) {
            return item && /^csh_boss_minion_[a-z0-9_]{1,40}$/.test(item.girl);
        }).map(function (item) {
            return {girl: item.girl, total: integer(item.total), n: integer(item.n), chief_name: text(item.chief_name, 40),
                chief_sig: text(item.chief_sig, 160), chief_amt: integer(item.chief_amt), top_name: text(item.top_name, 40),
                top_amt: integer(item.top_amt), me_amt: integer(item.me_amt), tier: text(item.tier, 40),
                tops: Array.isArray(item.tops) ? item.tops.slice(0, 10).map(function (t) { return {name: text(t.name, 40), sig: text(t.sig, 160), amt: integer(t.amt)}; }) : []};
        }) : [];
    }
    function policy() { return root.CSHOnline || null; }
    function service() { var p = policy(); return p ? p.service() : {id: 'legacy-board-v1', base: '', writes: false}; }
    function save(key, value) {
        try {
            if (root.CSHPage && root.CSHPage.lsSet) return root.CSHPage.lsSet(key, value);
            root.localStorage.setItem(key, value); return true;
        } catch (error) { return false; }
    }
    function load(key) { try { return JSON.parse(root.localStorage.getItem(key) || 'null'); } catch (error) { return null; } }
    function backoff() {
        if (!failures) {
            var old = load(BACKOFF_KEY);
            failures = old && old.v === 1 && old.items && typeof old.items === 'object' && !Array.isArray(old.items) ? old.items : {};
        }
        return failures;
    }
    function waitState(key) {
        var entry = backoff()[key], now = Date.now();
        if (!entry || !Number.isSafeInteger(entry.next) || entry.next < 0 || entry.next > now + 905000 || !Number.isSafeInteger(entry.failures)) return null;
        return entry;
    }
    function record(key, success, retryAfter) {
        var list = backoff(), previous = waitState(key);
        if (success) delete list[key];
        else {
            var count = Math.min(10, (previous ? previous.failures : 0) + 1);
            var delay = Math.max(Math.min(900000, retryAfter || 0), Math.min(900000, 3000 * Math.pow(2, count - 1)) * (0.85 + Math.random() * 0.3));
            list[key] = {failures: count, next: Math.floor(Date.now() + delay), manual: previous && previous.manual || 0};
        }
        var bounded = {}; Object.keys(list).slice(-12).forEach(function (k) { bounded[k] = list[k]; }); failures = bounded;
        save(BACKOFF_KEY, JSON.stringify({v: 1, items: bounded}));
    }
    function request(path, method, body, callback, timeout, options) {
        options = options || {};
        var done = false, timer = null, abort = null, unlink = null, externalAbort = null;
        var p = policy(), descriptor = service(), generation, url, payload = '', key;
        function cleanup() {
            if (timer !== null) clearTimeout(timer);
            if (unlink) unlink();
            if (options.signal && externalAbort) options.signal.removeEventListener('abort', externalAbort);
            var at = active.indexOf(cancel); if (at >= 0) active.splice(at, 1);
        }
        function finish(ok, value, meta) {
            if (done) return; done = true; cleanup(); callback(!!ok, value, meta || {});
        }
        function cancel() { if (done) return; finish(false, null, {code: 'cancelled'}); if (abort) abort(); }
        function valid() { return p && p.enabled() && p.snapshot().epoch === generation; }
        try {
            if (typeof path !== 'string' || !p || !p.enabled()) { finish(false, null, {code: 'offline'}); return {cancel: cancel}; }
            generation = p.snapshot().epoch;
            url = new URL(path, descriptor.base);
            if (url.origin !== descriptor.base || url.protocol !== 'https:' || url.username || url.password || path.charAt(0) !== '/' || path.length > 2048 ||
                !((method === 'GET' && /^\/(girls|board)$/.test(url.pathname)) || (method === 'POST' && /^\/(submit|cheer)$/.test(url.pathname)))) throw Error('request');
            payload = body ? JSON.stringify(body) : '';
            if (new TextEncoder().encode(payload).length > 4096) throw Error('payload');
            if (method === 'POST' && !p.canPublish()) { finish(false, null, {code: 'write-unavailable', reason: descriptor.writeReason}); return {cancel: cancel}; }
            key = descriptor.id + ':' + url.pathname;
            var waiting = waitState(key);
            if (waiting && waiting.next > Date.now() && !options.manual) {
                finish(false, null, {code: 'backoff', next: waiting.next}); return {cancel: cancel};
            }
            if(options.manual){var now=Date.now(),last=Object.prototype.hasOwnProperty.call(manualAt,key)?manualAt[key]:waiting&&waiting.manual;if(last!=null&&now>=last&&now-last<1000){finish(false,null,{code:'backoff',next:last+1000});return {cancel:cancel};}manualAt[key]=now;if(waiting)waiting.manual=now;}
            if (active.length >= 4) { finish(false, null, {code: 'busy'}); return {cancel: cancel}; }
        } catch (error) { finish(false, null, {code: 'invalid-request'}); return {cancel: cancel}; }
        active.push(cancel); unlink = p.watch(cancel);
        if (options.signal) {
            externalAbort = cancel;
            if (options.signal.aborted) { cancel(); return {cancel: cancel}; }
            options.signal.addEventListener('abort', externalAbort, {once: true});
        }
        timer = setTimeout(function () { if (!done) { record(key, false); finish(false, null, {code: 'timeout'}); if (abort) abort(); } }, Math.min(10000, Math.max(1000, timeout || 4500)));
        function fail(code) { if (!done) { if (valid()) record(key, false); finish(false, null, {code: code}); } }
        function response(status, headers, data) {
            if (done) return;
            if (!valid()) { cancel(); return; }
            var value, contentType = headers && headers('content-type') || '';
            if (contentType && !/^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i.test(contentType)) { fail('invalid-content-type'); return; }
            try { value = JSON.parse(data); } catch (error) { fail('invalid-json'); return; }
            if (!value || typeof value !== 'object' || Array.isArray(value)) { fail('invalid-schema'); return; }
            var ok = status >= 200 && status < 300, retry = 0;
            if (headers) {
                var raw = headers('retry-after');
                if (raw) retry = /^\d+$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw) - Date.now();
            }
            if (ok && value.ok !== false) record(key, true);
            else if (status === 429 || status >= 500) record(key, false, Number.isFinite(retry) ? Math.max(0, retry) : 0);
            finish(ok, value, {code: ok ? 'response' : 'http', status: status});
        }
        var req = null;
        try { req = root.require || null; } catch (error) {}
        if (req) {
            try {
                var https = req('https'), r = https.request(url.href, {method: method, timeout: timeout || 4500,
                    headers: payload ? {'Content-Type': 'application/json', 'Content-Length': new TextEncoder().encode(payload).length} : {}}, function (res) {
                    var size = 0, chunks = [];
                    res.on('data', function (chunk) { size += chunk.length; if (size > MAX) { fail('response-too-large'); res.destroy(); return; } chunks.push(chunk); });
                    res.on('error', function () { fail('network'); });
                    res.on('end', function () { if (!done) response(res.statusCode, function (name) { return res.headers && res.headers[name] || ''; }, req('buffer').Buffer.concat(chunks).toString('utf8')); });
                });
                abort = function () { r.destroy(); };
                r.on('error', function () { fail('network'); }); r.on('timeout', function () { fail('timeout'); r.destroy(); });
                r.end(payload); return {cancel: cancel};
            } catch (error) { fail('network'); return {cancel: cancel}; }
        }
        try {
            var controller = new AbortController(); abort = function () { controller.abort(); };
            root.fetch(url.href, {method: method, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error',
                signal: controller.signal, headers: payload ? {'Content-Type': 'application/json'} : undefined, body: payload || undefined}).then(async function (res) {
                if (done) return;
                if (Number(res.headers.get('content-length')) > MAX) { fail('response-too-large'); abort(); return; }
                if (!res.body || typeof res.body.getReader !== 'function') { fail('stream-unavailable'); abort(); return; }
                var reader = res.body.getReader(), size = 0, chunks = [];
                while (true) {
                    var next = await reader.read(); if (done) { await reader.cancel(); return; } if (next.done) break;
                    size += next.value.byteLength;
                    if (size > MAX) { fail('response-too-large'); await reader.cancel(); abort(); return; }
                    chunks.push(next.value);
                }
                var bytes = new Uint8Array(size), position = 0;
                chunks.forEach(function (chunk) { bytes.set(chunk, position); position += chunk.byteLength; });
                response(res.status || (res.ok ? 200 : 500), function (name) { return res.headers.get(name); }, new TextDecoder().decode(bytes));
            }).catch(function () { fail('network'); });
        } catch (error) { fail('network'); }
        return {cancel: cancel};
    }

    function slot(kind, uid) { return JSON.stringify([service().id, service().protocol || 'legacy', kind, 1, text(uid, 100)]); }
    function cacheRead(kind, uid) {
        if (!['cby', 'merit', 'cheer'].includes(kind)) return null;
        var store = load(CACHE_KEY), value = store && store.v === 2 && store.slots && store.slots[slot(kind, uid)];
        if (!value && kind !== 'cheer' && service().id === 'legacy-board-v1') {
            var old = load(LEGACY_KEY);
            if (old && old.kind === kind && Array.isArray(old.rows)) value = Object.assign({}, old, {me: old.me && old.me.uid === uid ? old.me : null, legacy: true});
        }
        if (!value || !Number.isSafeInteger(value.ts) || value.ts < 0) return null;
        if (kind === 'cheer') return Array.isArray(value.girls) ? {ts: value.ts, kind: kind, girls: girls(value.girls), legacy: !!value.legacy} : null;
        if (!Array.isArray(value.rows)) return null;
        var safe = board({list: value.rows, me: value.me, n: value.n});
        return {ts: value.ts, kind: kind, rows: safe.list, me: safe.me, n: safe.n, legacy: !!value.legacy};
    }
    function cacheWrite(kind, uid, value) {
        if (!['cby', 'merit', 'cheer'].includes(kind)) return false;
        var store = load(CACHE_KEY);
        if (!store || store.v !== 2 || !store.slots || Array.isArray(store.slots)) store = {v: 2, slots: {}};
        var safe = kind === 'cheer' ? {girls: girls(value.girls)} : board({list: value.rows, me: value.me, n: value.n});
        var item = kind === 'cheer' ? {girls: safe.girls} : {rows: safe.list, me: safe.me, n: safe.n};
        item.ts = Date.now(); item.kind = kind;
        var next = {v: 2, slots: Object.assign({}, store.slots)}; next.slots[slot(kind, uid)] = item;
        var keys = Object.keys(next.slots).sort(function (a, b) { return (next.slots[b].ts || 0) - (next.slots[a].ts || 0); });
        keys.slice(12).forEach(function (key) { delete next.slots[key]; });
        var json = JSON.stringify(next); if (json.length > 1048576) return false;
        return save(CACHE_KEY, json);
    }
    root.CSHNet = {request: request, board: board, girls: girls, text: text, integer: integer,
        cache: {KEY: CACHE_KEY, read: cacheRead, write: cacheWrite}, service: service,
        cancelAll: function () { active.slice().forEach(function (cancel) { cancel(); }); },
        status: function () { return {active: active.length, enabled: !!(policy() && policy().enabled())}; }};
})(typeof window !== 'undefined' ? window : globalThis);
