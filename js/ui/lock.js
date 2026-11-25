/* StallPOS v2 — first-run setup, lock screen, opening / resuming / closing shifts. */
(() => {
  const U = SP.util, D = SP.domain, UI = SP.ui, A = SP.app;
  const st = () => SP.store.get();
  const ADMIN = '__admin__';

  // ================= First-run setup =================
  SP.views.setup = {
    render: () => `
      <div class="center-screen">
        <div class="panel narrow">
          <h1>Welcome to StallPOS</h1>
          <p class="muted-text">Set your stall name and Admin PIN. Load the Grimma event or start empty.</p>
          <label class="label">Stall name</label>
          <input id="su-name" value="Momo &amp; More" />
          <div class="grid2">
            <div><label class="label">Admin PIN (4–6 digits)</label><input id="su-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" /></div>
            <div><label class="label">Confirm PIN</label><input id="su-pin2" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" /></div>
          </div>
          <label class="label">PayPal.me link (optional)</label>
          <input id="su-pp" placeholder="paypal.me/yourstall" />
          <div class="grid2">
            <button class="btn btn-primary btn-lg" data-action="setup-sample">Load sample event</button>
            <button class="btn btn-outline btn-lg" data-action="setup-empty">Start empty</button>
          </div>
          <p class="muted-text small">Sample: Grimma, 27 Nov – 13 Dec, your 7 items, prices and weekday/weekend targets, and the 5 packaging items. The stall starts with 3 days of food portions and packaging. Sample cashier PIN is <b>1111</b>.</p>
        </div>
      </div>`
  };
  function readSetup() {
    const name = document.getElementById('su-name').value.trim() || 'My Stall';
    const pin = document.getElementById('su-pin').value.trim();
    const pin2 = document.getElementById('su-pin2').value.trim();
    if (!/^\d{4,6}$/.test(pin)) { UI.toast('Admin PIN must be 4–6 digits', 'warn'); return null; }
    if (pin !== pin2) { UI.toast('PINs do not match', 'warn'); return null; }
    return { name, pin, paypal: document.getElementById('su-pp').value.trim() };
  }
  UI.on('setup-sample', () => {
    const r = readSetup(); if (!r) return;
    const S = SP.sample.build(r.pin, r.name);
    S.settings.paypalLink = r.paypal;
    SP.store.replaceState(S);
    UI.toast('Sample event loaded. Cashier 1 PIN is 1111.', 'success', 5000);
  });
  UI.on('setup-empty', () => {
    const r = readSetup(); if (!r) return;
    const S = SP.store.blankState();
    Object.assign(S.settings, { stallName: r.name, adminPin: r.pin, paypalLink: r.paypal });
    S.employees = [{ id: U.uid('emp'), name: 'Cashier 1', pin: '1111' }];
    S.eventDays = [U.dayStr()];
    S.setupDone = true;
    SP.store.replaceState(S);
    A.ui.mode = 'admin'; A.ui.locked = false; A.ui.tab = 'menu';
    A.render();
    UI.toast('Empty setup. Add packaging and menu items in Menu, event days in Plan.', 'info', 6000);
  });

  // ================= Lock screen =================
  let lockSel = null, lockError = '';
  SP.views.lock = {
    render: () => {
      const S = st(), sh = D.openShift(S);
      const people = [...S.employees.map(e => [e.id, e.name]), [ADMIN, 'Admin']];
      if (!lockSel || !people.some(p => p[0] === lockSel)) lockSel = sh ? sh.employeeId : people[0][0];
      const isOwner = sh && sh.employeeId === lockSel;
      const isAdmin = lockSel === ADMIN;
      const lock = UI.lockedFor();
      let primary;
      if (isAdmin) primary = `<button class="btn btn-dark btn-lg btn-block" data-action="lock-go" data-mode="admin">Open Admin</button>
        ${!sh ? `<button class="btn btn-primary btn-block" data-action="lock-go" data-mode="shift">Begin shift as Admin</button>` : ''}
        ${isOwner ? `<button class="btn btn-primary btn-block" data-action="lock-go" data-mode="resume">Resume Admin shift</button>` : ''}`;
      else primary = `<button class="btn btn-primary btn-lg btn-block" data-action="lock-go" data-mode="${isOwner ? 'resume' : sh ? 'switch' : 'shift'}">
          ${isOwner ? 'Resume shift' : sh ? 'Take over register' : 'Begin shift'}</button>`;
      return `
        <div class="center-screen dark">
          <div class="panel narrow">
            <h1>${U.esc(S.settings.stallName)}</h1>
            <p class="muted-text">${sh ? `Open shift: <b>${U.esc(sh.employeeName)}</b> · ${U.fmtDay(sh.day)}${sh.paused ? ' (paused)' : ''}` : 'Register locked — no shift open'}</p>
            <label class="label">Who are you?</label>
            <select data-change="lock-sel">${people.map(([id, name]) => `<option value="${id}" ${id === lockSel ? 'selected' : ''}>${U.esc(name)}${sh && sh.employeeId === id ? ' (on shift)' : ''}</option>`).join('')}</select>
            <label class="label">${isAdmin ? 'Admin PIN' : 'Your PIN'}</label>
            <input id="lock-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="PIN" autofocus data-enter="lock-go-default" />
            ${lock ? `<div class="error-text">Too many wrong attempts. Try again in ${lock}s.</div>` : lockError ? `<div class="error-text">${U.esc(lockError)}</div>` : ''}
            ${primary}
            ${sh ? `<button class="btn btn-soft-danger btn-block" data-action="lock-go" data-mode="close">Close ${U.esc(sh.employeeName)}'s shift (their PIN or Admin PIN)</button>` : ''}
          </div>
        </div>`;
    },
    after: () => { const p = document.getElementById('lock-pin'); if (p) p.focus(); }
  };
  UI.on('lock-sel', (_, el) => { lockSel = el.value; lockError = ''; A.render(); });
  UI.on('lock-go-default', () => {
    const btn = document.querySelector('[data-action="lock-go"]');
    if (btn) btn.click();
  });

  function checkPin(personId) {
    const S = st(), pin = (document.getElementById('lock-pin') || {}).value || '';
    if (UI.lockedFor()) { lockError = ''; A.render(); return false; }
    const expected = personId === ADMIN ? S.settings.adminPin : (S.employees.find(e => e.id === personId) || {}).pin;
    if (!pin || pin !== expected) { UI.pinFailed(); lockError = 'Incorrect PIN'; A.render(); return false; }
    UI.pinOk(); lockError = ''; return true;
  }
  const personName = id => id === ADMIN ? 'Admin' : (st().employees.find(e => e.id === id) || {}).name;

  UI.on('lock-go', ({ mode }) => {
    const S = st(), sh = D.openShift(S);
    if (mode === 'close') {
      const pin = (document.getElementById('lock-pin') || {}).value || '';
      const owner = S.employees.find(e => e.id === sh.employeeId);
      if (UI.lockedFor()) return A.render();
      if (pin !== S.settings.adminPin && !(owner && owner.pin === pin)) { UI.pinFailed(); lockError = `Enter ${sh.employeeName}'s PIN or the Admin PIN above`; return A.render(); }
      UI.pinOk(); lockError = '';
      return openCloseShift({ thenBeginFor: null });
    }
    if (!checkPin(lockSel)) return;
    if (mode === 'admin') { A.ui.mode = 'admin'; A.ui.locked = false; A.ui.tab = sh ? 'register' : 'plan'; lockSel = null; return A.render(); }
    if (mode === 'shift') return openBeginShift(lockSel);
    if (mode === 'switch') {
      return UI.confirmBox({
        title: `Take over from ${sh.employeeName}?`,
        message: `${sh.employeeName}'s shift will be closed first (count the drawer), then your shift starts.`,
        confirmLabel: 'Close their shift',
        onConfirm: () => openCloseShift({ thenBeginFor: lockSel })
      });
    }
    if (mode === 'resume') {
      // Shift opened on an earlier calendar day? Don't silently keep using yesterday's business day.
      if (U.dayStr() > sh.day) return staleShift(lockSel);
      SP.store.resumeShift();
      A.ui.locked = false; A.ui.tab = 'register';
      if (lockSel === ADMIN) A.ui.mode = 'admin';
      return A.render();
    }
  });

  function staleShift(personId) {
    const sh = D.openShift(st());
    UI.modal(`
      <div class="modal-head warn"><h3>New day — this shift is from ${U.fmtDay(sh.day)}</h3></div>
      <div class="modal-body">
        <p>Today is ${U.fmtDay(U.dayStr())}. Close yesterday's shift (count the drawer) and start a new one, so each day's sales, targets and cash stay separate.</p>
        <button class="btn btn-primary btn-lg btn-block" data-action="stale-close" data-p="${personId}">Close shift &amp; start ${U.fmtDay(U.dayStr())}</button>
        <button class="btn btn-outline btn-block" data-action="stale-keep" data-p="${personId}">Keep selling on ${U.fmtDay(sh.day)} (late night)</button>
        <button class="btn btn-ghost btn-block" data-action="modal-close">Cancel</button>
      </div>`, { size: 'sm', closable: false });
  }
  UI.on('stale-close', ({ p }) => openCloseShift({ thenBeginFor: p }));
  UI.on('stale-keep', ({ p }) => {
    UI.closeModal(); SP.store.resumeShift();
    A.ui.locked = false; A.ui.tab = 'register'; if (p === ADMIN) A.ui.mode = 'admin';
    A.render(); UI.toast('Still selling on the shift\'s day. Close the shift when the night ends.', 'warn', 5000);
  });

  // ================= Begin shift =================
  let begin = { personId: null, day: null, counts: null };
  function openBeginShift(personId) {
    const S = st(), today = U.dayStr();
    const lastClosed = [...S.shifts].reverse().find(s => s.status === 'closed');
    begin = { personId, day: S.eventDays.includes(today) || !S.eventDays.length ? today : today, counts: D.emptyDenoms() };
    renderBegin(lastClosed);
  }
  function renderBegin(lastClosed) {
    const S = st(), today = U.dayStr();
    const days = [...new Set([today, ...S.eventDays])].sort();
    const isEvent = S.eventDays.includes(begin.day);
    UI.modal(`
      <div class="modal-head"><h3>Begin shift — ${U.esc(personName(begin.personId))}</h3><button class="btn btn-ghost btn-sm" data-action="modal-close">Cancel</button></div>
      <div class="modal-body">
        <label class="label">Business day for this shift</label>
        <select data-change="begin-day">${days.map(d => `<option value="${d}" ${d === begin.day ? 'selected' : ''}>${U.fmtDay(d)}${d === today ? ' — today' : ''}${S.eventDays.includes(d) ? '' : ' (not an event day)'}</option>`).join('')}</select>
        ${!isEvent ? `<div class="note warn">${U.fmtDay(begin.day)} is not an event day: there are no targets, sales still count. Fine for testing.</div>` : ''}
        ${begin.day !== today ? `<div class="note warn">You are opening a shift for ${U.fmtDay(begin.day)}, not today.</div>` : ''}
        <div class="row-between">
          <label class="label">Opening cash — count coins &amp; notes</label>
          ${lastClosed && lastClosed.counted ? `<button class="btn btn-outline btn-sm" data-action="begin-use-last">Use last closing count (${U.money(lastClosed.countedTotal)})</button>` : ''}
        </div>
        <div id="begin-counter">${UI.counterHTML(begin.counts)}</div>
      </div>
      <div class="modal-foot"><button class="btn btn-primary btn-lg" data-action="begin-confirm">Start shift</button></div>`, { size: 'lg' });
  }
  UI.on('begin-day', (_, el) => { begin.day = el.value; renderBegin([...st().shifts].reverse().find(s => s.status === 'closed')); });
  UI.on('begin-use-last', () => {
    const last = [...st().shifts].reverse().find(s => s.status === 'closed');
    if (last) { begin.counts = D.addDenoms(D.emptyDenoms(), last.counted); document.getElementById('begin-counter').innerHTML = UI.counterHTML(begin.counts); }
  });
  UI.on('begin-confirm', () => {
    const name = personName(begin.personId);
    SP.store.beginShift({ employeeId: begin.personId, employeeName: name, day: begin.day, opening: begin.counts });
    UI.closeModal();
    A.ui.locked = false; A.ui.tab = 'register'; A.ui.cart = [];
    if (begin.personId === ADMIN) A.ui.mode = 'admin';
    lockSel = null;
    A.render();
    UI.toast(`Shift started for ${U.fmtDay(begin.day)}`, 'success');
  });

  // ================= Close shift =================
  let closing = { counts: null, thenBeginFor: null, compare: false };
  function openCloseShift({ thenBeginFor }) {
    closing = { counts: D.emptyDenoms(), thenBeginFor, compare: false };
    renderClose();
  }
  function renderClose() {
    const S = st(), sh = D.openShift(S);
    if (!sh) return UI.closeModal();
    const t = D.shiftTotals(S, sh);
    UI.modal(`
      <div class="modal-head"><h3>Close shift — ${U.esc(sh.employeeName)} · ${U.fmtDay(sh.day)}</h3><button class="btn btn-ghost btn-sm" data-action="modal-close">Cancel</button></div>
      <div class="modal-body">
        <div class="stats4">
          <div class="stat"><span>Orders</span><b>${t.orders}</b></div>
          <div class="stat"><span>Cash sales</span><b>${U.money(t.cashSales)}</b></div>
          <div class="stat"><span>PayPal + Card</span><b>${U.money(t.paypalSales + t.cardSales)}</b></div>
          <div class="stat"><span>Expected in drawer</span><b>${U.money(t.expectedCash)}</b></div>
        </div>
        <label class="label">Count the drawer</label>
        ${UI.counterHTML(closing.counts, () => updateCloseVariance())}
        <div id="close-variance">${varianceHTML()}</div>
        <button class="btn btn-outline btn-sm" data-action="close-compare">${closing.compare ? 'Hide' : 'Compare with'} tracked coins &amp; notes</button>
        <div id="close-compare">${closing.compare ? compareHTML() : ''}</div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-outline btn-lg" data-action="close-confirm" data-count="1">Close &amp; count stock</button>
        <button class="btn btn-danger btn-lg" data-action="close-confirm">Close shift</button>
      </div>`, { size: 'lg', closable: false });
  }
  function varianceHTML() {
    const S = st(), sh = D.openShift(S);
    const expected = D.shiftTotals(S, sh).expectedCash, counted = D.denomTotal(closing.counts), v = counted - expected;
    const cls = v === 0 ? 'ok' : v > 0 ? 'over' : 'short';
    return `<div class="variance ${cls}"><span>Counted ${U.money(counted)} vs expected ${U.money(expected)}</span><b>${v === 0 ? 'Balanced' : (v > 0 ? 'Over ' : 'Short ') + U.money(Math.abs(v))}</b></div>`;
  }
  function compareHTML() {
    const S = st(), live = D.liveDrawer(S, D.openShift(S));
    const rows = D.DENOMS.filter(d => (closing.counts[d.c] || 0) !== (live[d.c] || 0));
    if (!rows.length) return `<div class="note ok">Every coin and note matches what the register tracked.</div>`;
    return `<table class="table"><thead><tr><th>Coin/note</th><th class="r">Counted</th><th class="r">Tracked</th><th class="r">Diff</th></tr></thead><tbody>
      ${rows.map(d => { const c = closing.counts[d.c] || 0, t = live[d.c] || 0; return `<tr><td>${d.label}</td><td class="r">${c}</td><td class="r">${t}</td><td class="r ${c - t < 0 ? 'neg' : 'pos'}">${c - t > 0 ? '+' : ''}${c - t}</td></tr>`; }).join('')}
      </tbody></table><p class="muted-text small">Differences in similar coins usually mean change was given differently than suggested — only the total matters.</p>`;
  }
  function updateCloseVariance() {
    A.refresh('close-variance', varianceHTML());
    if (closing.compare) A.refresh('close-compare', compareHTML());
  }
  UI.on('close-compare', () => { closing.compare = !closing.compare; renderClose(); });
  UI.on('close-confirm', ({ count }) => {
    const sh = SP.store.closeShift(closing.counts);
    const next = closing.thenBeginFor;
    UI.closeModal();
    A.ui.locked = true; A.ui.mode = 'cashier'; A.ui.cart = [];
    A.render();
    UI.toast(`Shift closed · ${sh.variance === 0 ? 'drawer balanced' : (sh.variance > 0 ? 'over ' : 'short ') + U.money(Math.abs(sh.variance))}`, sh.variance === 0 ? 'success' : 'warn', 5000);
    const after = () => { if (next) openBeginShift(next); };
    if (count) SP.views.stock.openCount({ day: sh.day, by: sh.employeeName, shiftId: null }, after);
    else after();
  });

  SP.lock = { openBeginShift, openCloseShift, ADMIN };
})();
