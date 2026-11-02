/* Display-only window state. Never participates in wallet or portable saves. */
(function (root) {
    if (root.CSHPanelWindow) return;
    function mount(overlay, panel, head, handle, closeSettings) {
        var key = panel.getAttribute('data-view') === 'world' ? 'csh_ui_panel_window_world' : 'csh_ui_panel_window_developer', saved = {};
        try { saved = JSON.parse(localStorage.getItem(key) || '{}') || {}; } catch (ignored) {}
        var floating = saved.floating === true, collapsed = false, snap = saved.snap === true, drag = null, suppressClick = false, disposed = false;
        var rect = { x: Number(saved.x), y: Number(saved.y), w: 920, h: 560 };
        if (!Number.isFinite(rect.x)) rect.x = 32;
        if (!Number.isFinite(rect.y)) rect.y = 32;
        if (!document.getElementById('csh-panel-window-css')) {
            var style = document.createElement('style'); style.id = 'csh-panel-window-css';
            style.textContent = `
html.csh-panel-window-feedback-bottom #csh-ach-feedback[data-compact="true"]{top:auto!important;bottom:max(8px,env(safe-area-inset-bottom,0px))!important}
#csh-dbg-overlay.csh-windowed{background:transparent!important;pointer-events:none!important;animation:none!important}
#csh-dbg-overlay.csh-windowed #csh-dbg-panel{position:fixed!important;left:var(--csh-window-x)!important;top:var(--csh-window-y)!important;right:auto!important;bottom:auto!important;width:var(--csh-window-w)!important;height:var(--csh-window-h)!important;padding:0!important;border:1px solid rgba(var(--csh-bg-rgb),.24)!important;border-radius:10px!important;box-shadow:0 12px 36px #0004!important;animation:none!important}
#csh-dbg-overlay.csh-windowed .csh-dbg-head-main{cursor:grab!important;touch-action:none!important;user-select:none!important;min-height:44px!important;display:flex!important;flex-direction:column!important;justify-content:center!important}
#csh-dbg-overlay.csh-windowed.csh-window-dragging .csh-dbg-head-main{cursor:grabbing!important}
#csh-dbg-panel .csh-window-options{position:static!important;display:none!important;flex:1 0 100%!important;gap:8px!important;align-items:center!important;flex-wrap:wrap!important;order:20!important}
#csh-dbg-panel.csh-head-settings-open .csh-window-options{display:flex!important}
#csh-dbg-panel .csh-window-options button,#csh-dbg-panel #csh-window-fold{position:static!important;min-width:44px!important;min-height:44px!important;padding:6px 10px!important;background:var(--csh-paper)!important;color:var(--csh-bg)!important;border:1px solid rgba(var(--csh-bg-rgb),.22)!important;border-radius:6px!important;font:500 12px/1.4 system-ui!important;cursor:pointer!important}
#csh-dbg-panel #csh-window-fold{display:none!important;order:2!important}
#csh-dbg-overlay.csh-windowed #csh-window-fold{display:inline-block!important}
#csh-dbg-overlay.csh-window-collapsed #csh-dbg-main,#csh-dbg-overlay.csh-window-collapsed #csh-dbg-sub,#csh-dbg-overlay.csh-window-collapsed #csh-dbg-settings-toggle,#csh-dbg-overlay.csh-window-collapsed #csh-dbg-bgm,#csh-dbg-overlay.csh-window-collapsed #csh-dbg-skin,#csh-dbg-overlay.csh-window-collapsed #csh-dbg-skin-row,#csh-dbg-overlay.csh-window-collapsed .csh-window-options{display:none!important}
html #csh-dbg-overlay.csh-window-collapsed #csh-dbg-panel #csh-dbg-head{display:flex!important;flex-wrap:nowrap!important;gap:6px!important;padding:6px 10px!important;min-height:56px!important}
`;
            document.documentElement.appendChild(style);
        }
        function button(id, text, act) {
            var b = document.createElement('button'); b.type = 'button'; b.id = id; b.textContent = text;
            b.addEventListener('click', act); return b;
        }
        var options = document.createElement('div'); options.className = 'csh-window-options';
        var mode = button('csh-window-mode', '切换浮窗', function () { finish(null, true); floating = !floating; collapsed = false; closeSettings(); layout(); persist(); document.getElementById("csh-dbg-settings-toggle").focus({ preventScroll: true }); });
        var reset = button('csh-window-reset', '重置位置', function () { finish(null, true); rect.x = 32; rect.y = 32; layout(); persist(); });
        var edge = button('csh-window-snap', '贴边：关闭', function () { snap = !snap; layout(); persist(); });
        options.appendChild(mode); options.appendChild(reset); options.appendChild(edge); head.appendChild(options);
        var fold = button('csh-window-fold', '收起', function () { finish(null, true); collapsed = !collapsed; closeSettings(); layout(); fold.focus({ preventScroll: true }); });
        head.insertBefore(fold, document.getElementById('csh-dbg-close'));
        function active() { return floating && innerWidth >= innerHeight && innerWidth >= 600; }
        function persist() {
            try { localStorage.setItem(key, JSON.stringify({ floating: floating, snap: snap, x: rect.x, y: rect.y })); } catch (ignored) { /* Geometry is optional; no game state is lost. */ }
        }
        function layout() {
            if (disposed) return;
            var on = active(), margin = 8;
            rect.w = Math.min(innerWidth - margin * 2, collapsed ? 360 : 920);
            rect.h = Math.min(innerHeight - margin * 2, collapsed ? 58 : 560);
            rect.x = Math.max(margin, Math.min(innerWidth - rect.w - margin, rect.x));
            rect.y = Math.max(margin, Math.min(innerHeight - rect.h - margin, rect.y));
            document.documentElement.classList.toggle('csh-panel-window-feedback-bottom', on && rect.y < innerHeight / 2 && !document.getElementById('csh-shell-overlay'));
            overlay.classList.toggle('csh-windowed', on); overlay.classList.toggle('csh-window-collapsed', on && collapsed);
            panel.setAttribute('aria-modal', String(!on));
            for (var field of ['x', 'y', 'w', 'h']) panel.style.setProperty('--csh-window-' + field, rect[field] + 'px');
            mode.textContent = floating ? '恢复全屏' : '切换浮窗'; mode.setAttribute('aria-pressed', String(floating));
            fold.textContent = collapsed ? '展开' : '收起'; fold.setAttribute('aria-expanded', String(!collapsed)); fold.setAttribute('aria-label', collapsed ? '展开面板' : '收起面板');
            reset.disabled = !on; edge.disabled = !on; edge.textContent = '贴边：' + (snap ? '开启' : '关闭'); edge.setAttribute('aria-pressed', String(snap));
            handle.title = on ? '拖动标题移动面板' : '';
        }
        function down(e) {
            if (!active() || !e.isPrimary || e.button !== 0 || e.target.closest('button,input,select,textarea,a')) return;
            drag = { id: e.pointerId, x: e.clientX, y: e.clientY, left: rect.x, top: rect.y, moved: false };
            try { handle.setPointerCapture(e.pointerId); } catch (ignored) {}
            document.addEventListener('pointermove', move, true); document.addEventListener('pointerup', finish, true); document.addEventListener('pointercancel', cancel, true);
        }
        function move(e) {
            if (!drag || e.pointerId !== drag.id) return;
            if (!active()) { finish(null, true); return; }
            var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
            if (!drag.moved && Math.hypot(dx, dy) < 6) return;
            drag.moved = true; suppressClick = true; e.preventDefault();
            rect.x = drag.left + dx; rect.y = drag.top + dy; overlay.classList.add('csh-window-dragging'); layout();
        }
        function finish(e, abandon) {
            if (!drag || (e && e.pointerId !== drag.id)) return;
            var old = drag; drag = null;
            document.removeEventListener('pointermove', move, true); document.removeEventListener('pointerup', finish, true); document.removeEventListener('pointercancel', cancel, true);
            try { if (handle.hasPointerCapture(old.id)) handle.releasePointerCapture(old.id); } catch (ignored) {}
            overlay.classList.remove('csh-window-dragging');
            if (abandon) { rect.x = old.left; rect.y = old.top; }
            else if (old.moved && snap) {
                if (rect.x < 32) rect.x = 8;
                else if (innerWidth - rect.x - rect.w < 32) rect.x = innerWidth - rect.w - 8;
                if (rect.y < 32) rect.y = 8;
                else if (innerHeight - rect.y - rect.h < 32) rect.y = innerHeight - rect.h - 8;
            }
            layout(); if (!abandon && old.moved) persist();
            setTimeout(function () { suppressClick = false; }, 0);
        }
        function cancel(e) { finish(e, true); }
        function stopClick(e) { if (suppressClick) { e.preventDefault(); e.stopImmediatePropagation(); } }
        function resize() { finish(null, true); layout(); }
        var observer = new MutationObserver(function () { layout(); });
        observer.observe(document.documentElement, { childList: true });
        handle.addEventListener('pointerdown', down); handle.addEventListener('lostpointercapture', cancel); handle.addEventListener('click', stopClick, true); window.addEventListener('resize', resize);
        layout();
        return { isFloating: active, dispose: function () { finish(null, true); disposed = true; observer.disconnect(); document.documentElement.classList.remove('csh-panel-window-feedback-bottom'); handle.removeEventListener('pointerdown', down); handle.removeEventListener('lostpointercapture', cancel); handle.removeEventListener('click', stopClick, true); window.removeEventListener('resize', resize); } };
    }
    root.CSHPanelWindow = { mount: mount };
})(typeof window === 'undefined' ? globalThis : window);
