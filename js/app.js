/* StallPOS v2 — app shell: boot, session, header/nav, routing, partial refresh. */
SP.views = SP.views || {};
SP.app = (() => {
  const U = SP.util, D = SP.domain, UI = SP.ui;
  const st = () => SP.store.get();

  // Session (not saved): who is using the device right now
  const ui = {
    mode: 'cashier',      // 'cashier' | 'admin'
    locked: true,         // lock screen shown
    tab: 'register',
    adminDay: null,       // day admin views when no shift is open
    cart: [], search: '', category: 'All',
    customerScreen: false
  };

  const CASHIER_TABS = [['register', 'Register'], ['queue', 'Queue'], ['stock', 'Stock'], ['shift', 'Shift']];
  const ADMIN_TABS = [['register', 'Register'], ['queue', 'Queue'], ['stock', 'Stock'], ['plan', 'Plan'], ['reports', 'Reports'], ['menu', 'Menu'], ['shift', 'Shifts'], ['settings', 'Settings']];

  // The business day everything is recorded under: the open shift's day, else the admin's chosen day
  function currentDay() {
    const sh = D.openShift(st());
    if (sh) return sh.day;
    if (!ui.adminDay) ui.adminDay = defaultDay();
    return ui.adminDay;
  }
  function defaultDay() {
    const S = st(), today = U.dayStr();
    if (S.eventDays.includes(today) || !S.eventDays.length) return today;
    return S.eventDays.find(d => d >= today) || S.eventDays[S.eventDays.length - 1];
  }
  function ctx() {
    const sh = D.openShift(st());
    return { day: currentDay(), by: ui.mode === 'admin' ? 'Admin' : (sh ? sh.employeeName : 'Staff'), shiftId: sh ? sh.id : null };
  }
  const canSell = () => { const sh = D.openShift(st()); return !!sh && !sh.paused; };

  // ---------- rendering ----------
  function render() {
    const S = st();
    const app = document.getElementById('app');
    if (!S.setupDone) { app.innerHTML = SP.views.setup.render(); return; }
    if (ui.customerScreen) { app.innerHTML = SP.views.queue.customerScreen(); return; }
    const sh = D.openShift(S);
    if (ui.mode !== 'admin' && (ui.locked || !sh || sh.paused)) { ui.locked = true; app.innerHTML = SP.views.lock.render(); return; }
    const tabs = ui.mode === 'admin' ? ADMIN_TABS : CASHIER_TABS;
    if (!tabs.some(t => t[0] === ui.tab)) ui.tab = 'register';
    app.innerHTML = `
      <header class="top" id="region-header">${header()}</header>
      <nav class="tabs" id="region-nav">${tabs.map(([id, label]) =>
        `<button class="tab ${ui.tab === id ? 'active' : ''}" data-action="tab" data-tab="${id}">${label}${tabBadge(id)}</button>`).join('')}</nav>
      <main id="region-main" class="main">${SP.views[ui.tab].render()}</main>`;
    if (SP.views[ui.tab].after) SP.views[ui.tab].after();
  }
  // Redraw a single region by id (e.g. 'region-header', 'reg-grid', 'reg-cart')
  function refresh(id, html) { const el = document.getElementById(id); if (el) el.innerHTML = html; }
  const refreshHeader = () => refresh('region-header', header());

  function tabBadge(id) {
    if (id === 'queue') {
      const n = st().orders.filter(o => !o.voided && o.day === currentDay() && o.status !== 'collected').length;
      return n ? ` <span class="tab-count">${n}</span>` : '';
    }
    if (id === 'plan' && ui.mode === 'admin') {
      const n = D.overPlan(st(), currentDay()).length;
      return n ? ` <span class="tab-count warn">${n}</span>` : '';
    }
    return '';
  }

  function header() {
    const S = st(), sh = D.openShift(S), day = currentDay();
    const eventLabel = S.eventDays.includes(day) ? '' : ' <span class="badge badge-warn">not an event day</span>';
    const daySel = !sh && ui.mode === 'admin'
      ? `<select class="day-select" data-change="admin-day">${dayOptions(day)}</select>`
      : `<span>${U.fmtDay(day)}</span>`;
    return `
      <div class="brand">
        <strong>${U.esc(S.settings.stallName)}</strong>
        ${ui.mode === 'admin' ? '<span class="badge badge-admin">ADMIN</span>' : ''}
        <div class="sub">${daySel}${eventLabel} · ${sh ? `${U.esc(sh.employeeName)}'s shift${sh.paused ? ' (paused)' : ''}` : 'No shift open'}</div>
      </div>
      <div class="top-actions">
        ${sh ? `<button class="btn btn-sm btn-dark" data-action="tip-jar">Tip jar</button>` : ''}
        ${ui.mode === 'admin'
          ? `<button class="btn btn-sm btn-warn" data-action="admin-exit">Exit Admin</button>`
          : `<button class="btn btn-sm btn-dark" data-action="lock">Lock / Switch</button>
             <button class="btn btn-sm btn-dark" data-action="admin-enter">Admin</button>`}
      </div>`;
  }
  function dayOptions(selected) {
    const S = st();
    const days = [...new Set([...S.eventDays, U.dayStr(), ...S.orders.map(o => o.day)])].sort();
    return days.map(d => `<option value="${d}" ${d === selected ? 'selected' : ''}>${U.fmtDay(d)}${S.eventDays.includes(d) ? '' : ' (off)'}</option>`).join('');
  }

  // ---------- global actions ----------
  UI.on('tab', ({ tab }) => { ui.tab = tab; render(); });
  UI.on('admin-day', (_, el) => { ui.adminDay = el.value; render(); });
  UI.on('lock', () => { SP.store.pauseShift(); ui.locked = true; render(); });
  UI.on('admin-enter', () => UI.askAdminPin('Admin PIN', () => { ui.mode = 'admin'; ui.locked = false; render(); }));
  UI.on('admin-exit', () => {
    ui.mode = 'cashier'; ui.locked = true;
    SP.store.pauseShift();
    render();
  });
  UI.on('tip-jar', () => {
    UI.modal(`
      <div class="modal-head"><h3>Tip jar</h3><button class="btn btn-ghost btn-sm" data-action="modal-close">Close</button></div>
      <div class="modal-body">
        <p class="muted-text">Cash tips left in the tip jar (kept separate from the drawer and from sales).</p>
        <input id="tipjar-amt" type="number" inputmode="decimal" step="0.1" placeholder="0.00" autofocus data-enter="tipjar-save" />
        <div class="chips">${[50, 100, 200, 500].map(c => `<button class="btn btn-outline btn-sm" data-action="tipjar-quick" data-c="${c}">${U.money(c)}</button>`).join('')}</div>
      </div>
      <div class="modal-foot"><button class="btn btn-primary" data-action="tipjar-save">Add tip</button></div>`, { size: 'sm' });
  });
  UI.on('tipjar-quick', ({ c }) => { document.getElementById('tipjar-amt').value = U.centsToInput(Number(c)); });
  UI.on('tipjar-save', () => {
    const c = U.toCents(document.getElementById('tipjar-amt').value);
    if (c <= 0) return UI.toast('Enter an amount', 'warn');
    SP.store.addTipJar(c, ctx()); UI.closeModal(); UI.toast(`Tip jar +${U.money(c)}`, 'success');
  });

  // Store changes → redraw what's visible (inline edits use topic 'quiet')
  SP.store.subscribe(topic => {
    if (topic === 'quiet') return;
    render(); // the modal lives outside #app, so an open modal is not disturbed
  });
  function refreshNav() {
    const nav = document.getElementById('region-nav');
    if (!nav) return;
    nav.querySelectorAll('.tab').forEach(b => {
      const id = b.dataset.tab; const label = (ui.mode === 'admin' ? ADMIN_TABS : CASHIER_TABS).find(t => t[0] === id);
      if (label) b.innerHTML = label[1] + tabBadge(id);
    });
  }

  async function boot() {
    await SP.store.load();
    SP.db.requestPersistence();
    render();
    // Re-check the shift day when the app comes back to the foreground (e.g. next morning)
    document.addEventListener('visibilitychange', () => { if (document.hidden) SP.store.saveNow(); });
    window.addEventListener('pagehide', () => SP.store.saveNow());
  }

  return { ui, boot, render, refresh, refreshHeader, refreshNav, ctx, currentDay, canSell, defaultDay, dayOptions };
})();

document.addEventListener('DOMContentLoaded', () => SP.app.boot ? SP.app.boot() : null);
