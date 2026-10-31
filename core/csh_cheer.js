/* Host-owned paid cheer outbox. Wallet commits balance and intent atomically. */
export function installCheer(lib) {
    if (!lib || lib.cshCheer) return lib && lib.cshCheer;
    const MAX_PENDING = 100, MAX_ACKED = 4096, MAX_LEGACY = 4096;
    const REQUEST_AGE = 10 * 60 * 1000, ACK_AGE = 24 * 60 * 60 * 1000;
    const clone = value => JSON.parse(JSON.stringify(value));
    const validText = (value, max, required) => typeof value === 'string' && value.length <= max && (!required || value.length > 0);
    const validId = (value, max) => validText(value, max, true) && /^[A-Za-z0-9_.:-]+$/.test(value);
    const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : '';
    const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
    function wallet() { return lib.cshWallet && lib.cshWallet.wallet; }
    function refused(reason) { return { ok: false, reason: reason || '保存未完成，请稍后重试' }; }
    function state() {
        const w = wallet();
        if (!w || typeof w.cheerState !== 'function' || typeof w.commitCheerState !== 'function') throw new Error('钱包尚未就绪');
        const s = w.cheerState();
        if (!s) return { v: 1, freeDate: '', pending: [], acked: [], legacyImported: [] };
        if (s.legacyImported == null) s.legacyImported = [];
        if (s.v !== 1 || !Array.isArray(s.pending) || !Array.isArray(s.acked) || !Array.isArray(s.legacyImported)) throw new Error('应援记录暂不可读取');
        return clone(s);
    }
    function oldFreeDate() { return date(localStorage.getItem('csh_rank_cheer_day')); }
    function mergeDay(s, legacy) { s.freeDate = [date(s.freeDate), date(legacy), oldFreeDate()].sort().at(-1) || ''; }
    function trimAcknowledged(s, now) {
        const keep = s.acked.filter(entry => now - entry.t <= ACK_AGE);
        if (keep.length !== s.acked.length) s.requestFloor = Math.max(Number.isSafeInteger(s.requestFloor) ? s.requestFloor : 0, now - REQUEST_AGE);
        s.acked = keep;
    }
    function listed(id) {
        const all = lib.cshMarket && lib.cshMarket.LISTED;
        return Array.isArray(all) && all.includes(id);
    }
    function entryValid(e) {
        return e && validId(e.cid, 120) && validId(e.uid, 100)
            && validText(e.name, 40, false) && validText(e.sig, 160, false)
            && /^csh_boss_minion_[a-z0-9_]{1,40}$/.test(e.girl)
            && validText(e.gname, 12, false) && Number.isSafeInteger(e.amt) && e.amt >= 1 && e.amt <= 1000000
            && typeof e.free === 'boolean' && Number.isSafeInteger(e.t) && e.t >= 0;
    }
    function sameIntent(entry, d) { return entry.uid === d.uid && entry.girl === d.girl && (entry.free || entry.amt === d.amt); }
    function commit(s, charge, reason) {
        const result = wallet().commitCheerState(s, charge, reason);
        return result && result.ok ? result : refused(result && result.reason);
    }
    function requestTime(cid) {
        const parts = cid.split('-'), stamp = parts.at(-2);
        if (parts[0] !== 'c' || !stamp || !/^[a-z0-9]+$/.test(stamp)) return NaN;
        const value = parseInt(stamp, 36);
        return Number.isSafeInteger(value) ? value : NaN;
    }
    function enqueue(d) {
        try {
            if (!d || !validId(d.cid, 120) || !validId(d.uid, 100) || !validText(d.name, 40, true)
                || !validText(d.sig || '', 160, false) || !validText(d.gname || '', 12, false)
                || typeof d.girl !== 'string' || !listed(d.girl)
                || !Number.isSafeInteger(d.amt) || d.amt < 100 || d.amt > 1000000) return refused('应援信息未就绪，请重新进入');
            const s = state(), old = s.pending.find(e => e.cid === d.cid);
            if (old) return sameIntent(old, d) ? { ok: true, already: true, cid: old.cid, free: old.free, amt: old.amt, pc: wallet().pc(), pending: s.pending.length } : refused('应援记录不一致，请重新进入');
            const paid = s.acked.find(e => e.cid === d.cid);
            if (paid) return paid.uid === d.uid ? { ok: true, already: true, complete: true, cid: paid.cid, pc: wallet().pc(), pending: s.pending.length } : refused('应援记录不一致，请重新进入');
            const now = Date.now(), stamp = requestTime(d.cid);
            if (!Number.isSafeInteger(stamp) || stamp > now + 60000 || now - stamp > REQUEST_AGE || stamp < (s.requestFloor || 0)) return refused('此笔请求已过期，请重新发起');
            trimAcknowledged(s, now);
            if (s.pending.length >= MAX_PENDING || s.pending.length + s.acked.length >= MAX_ACKED) return refused('待报记录较多，请完成补报后再试');
            mergeDay(s);
            const free = s.freeDate < today(), charge = free ? 0 : d.amt;
            const entry = { cid: d.cid, uid: d.uid, name: d.name, sig: d.sig || '', girl: d.girl, gname: d.gname || '', amt: free ? 1 : d.amt, free, t: now };
            if (!entryValid(entry)) return refused('应援信息未就绪，请重新进入');
            s.pending.push(entry);
            if (free) s.freeDate = today();
            const result = commit(s, charge, '缠头:' + (entry.gname || entry.girl));
            if (!result.ok) return result;
            return { ok: true, cid: entry.cid, pc: result.balance, free, amt: entry.amt, pending: s.pending.length, ledgerPending: !!result.ledgerPending };
        } catch (error) { return refused(error.message); }
    }
    function pending(d) {
        try {
            if (!d || typeof d.uid !== 'string' || d.uid !== '' && !validId(d.uid, 100)) return refused('请先留名');
            const s = state(), list = s.pending.filter(e => e.uid === d.uid);
            return { ok: true, list: clone(list), pending: list.length, otherPending: s.pending.length - list.length };
        } catch (error) { return refused(error.message); }
    }
    function ack(d) {
        try {
            if (!d || !validId(d.cid, 120) || !validId(d.uid, 100)) return refused('应援信息无效');
            const s = state(), at = s.pending.findIndex(e => e.cid === d.cid && e.uid === d.uid);
            if (at < 0) return s.acked.some(e => e.cid === d.cid && e.uid === d.uid) ? { ok: true, already: true } : refused('应援记录未找到');
            const now = Date.now(); trimAcknowledged(s, now);
            if (s.acked.length >= MAX_ACKED) return refused('应援记录整理中，请稍后重试');
            s.pending.splice(at, 1); s.acked.push({ cid: d.cid, uid: d.uid, t: now });
            const result = commit(s, 0, '应援上报确认');
            return result.ok ? { ok: true, pending: s.pending.length } : result;
        } catch (error) { return refused(error.message); }
    }
    function importLegacy(d) {
        try {
            if (!d || !validId(d.uid, 100) || !Array.isArray(d.entries) || d.entries.length > MAX_PENDING
                || !validText(d.name || '', 40, false) || !validText(d.sig || '', 160, false)) return refused('旧应援记录暂不可读取');
            const s = state(); mergeDay(s, d.freeDate); trimAcknowledged(s, Date.now());
            const seen = new Set(s.legacyImported), staged = new Set();
            for (const old of d.entries) {
                if (!old || !validId(old.cid, 120) || !/^csh_boss_minion_[a-z0-9_]{1,40}$/.test(old.girl)
                    || !Number.isSafeInteger(old.amt) || old.amt < 1 || old.amt > 1000000
                    || !Number.isSafeInteger(old.t) || old.t < 0) return refused('旧应援记录暂不可读取');
                if (old.cid.startsWith('c-') && !old.cid.startsWith('c-' + d.uid.slice(-8) + '-')) return refused('旧应援记录等待原留名身份');
                if (seen.has(old.cid) || staged.has(old.cid)) continue;
                const existing = s.pending.find(e => e.cid === old.cid) || s.acked.find(e => e.cid === old.cid);
                if (existing && existing.uid !== d.uid) return refused('旧应援记录等待原留名身份');
                if (!existing) s.pending.push({ cid: old.cid, uid: d.uid, name: d.name || '', sig: d.sig || '', girl: old.girl, gname: String(old.gname || '').slice(0, 12), amt: old.amt, free: old.amt === 1, t: old.t });
                s.legacyImported.push(old.cid); staged.add(old.cid);
            }
            if (s.pending.length > MAX_PENDING || s.acked.length + s.pending.length > MAX_ACKED || s.legacyImported.length > MAX_LEGACY) return refused('旧记录较多，请先完成补报');
            const result = commit(s, 0, '旧应援待报保全');
            return result.ok ? { ok: true, imported: staged.size, pending: s.pending.length } : result;
        } catch (error) { return refused(error.message); }
    }
    const api = { enqueue, pending, ack, importLegacy, limits: { pending: MAX_PENDING, acknowledged: MAX_ACKED } };
    lib.cshCheer = api;
    return api;
}
