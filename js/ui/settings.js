/* StallPOS v2 — settings: stall, PIN, PayPal, team, backups (download / restore / automatic), reset. */
(() => {
  const U = SP.util, D = SP.domain, UI = SP.ui, A = SP.app;
  const st = () => SP.store.get();
  let autoList = null;

  SP.views.settings = {
    render: () => {
      const S = st();
      if (!autoList) SP.store.listAutoBackups().then(l => { autoList = l; if (A.ui.tab === 'settings') A.refresh('auto-backups', autoHTML()); });
      return `
        <div class="grid2">
          <div class="panel"><h3>Stall</h3>
            <label class="label">Stall name</label><input id="set-name" value="${U.esc(S.settings.stallName)}" />
            <div class="grid2"><div><label class="label">Currency symbol</label><input id="set-cur" value="${U.esc(S.settings.currency)}" maxlength="3" /></div>
              <div><label class="label">New Admin PIN (blank = keep)</label><input id="set-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="${(S.settings.adminPin || '').length} digits now" /></div></div>
            <label class="label">PayPal.me link</label><input id="set-pp" value="${U.esc(S.settings.paypalLink)}" placeholder="paypal.me/yourstall" />
            <button class="btn btn-primary" data-action="set-save">Save</button>
          </div>
          <div class="panel"><h3>Team</h3>
            <table class="table"><tbody>${S.employees.map(e => `<tr><td><b>${U.esc(e.name)}</b></td>
              <td class="r nowrap"><button class="btn btn-outline btn-sm" data-action="emp-pin" data-id="${e.id}">Change PIN</button>
              <button class="btn btn-ghost btn-sm danger-text" data-action="emp-del" data-id="${e.id}">Remove</button></td></tr>`).join('')}</tbody></table>
            <div class="grid2"><input id="emp-name" placeholder="Name" /><input id="emp-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="PIN (4–6 digits)" /></div>
            <button class="btn btn-outline" data-action="emp-add">Add employee</button>
          </div>
        </div>
        <div class="panel"><h3>Offline</h3>${offlineHTML()}</div>
        <div class="panel"><h3>Backups</h3>
          <p class="muted-text small">Data is stored on this device (${SP.db.mode === 'indexeddb' ? 'IndexedDB' : 'localStorage'}). A snapshot is saved automatically once per day (last 7 kept). Download a file at the end of each day and keep it somewhere safe.</p>
          <p class="small">Last downloaded backup: <b>${S.lastBackupDownload ? U.fmtDateTime(S.lastBackupDownload) : 'never'}</b></p>
          <div class="row-gap wrap">
            <button class="btn btn-success" data-action="bk-download">Download backup</button>
            <label class="btn btn-outline">Restore from file<input type="file" accept=".json,application/json" class="hidden" data-change="bk-file" /></label>
          </div>
          <h4>Automatic daily snapshots</h4><div id="auto-backups">${autoHTML()}</div>
        </div>
        <div class="panel danger-panel"><h3>Reset</h3>
          <div class="row-gap wrap">
            <button class="btn btn-outline" data-action="reset-sample">Reload sample event</button>
            <button class="btn btn-danger" data-action="reset-all">Erase everything</button>
          </div>
          <p class="muted-text small">Both replace all data on this device. Download a backup first.</p>
        </div>`;
    }
  };
  function autoHTML() {
    if (!autoList) return '<p class="muted-text small">Loading…</p>';
    if (!autoList.length) return '<p class="muted-text small">None yet.</p>';
    return `<table class="table"><tbody>${autoList.map(b => `<tr><td>${U.fmtDateTime(b.at)}</td><td>${b.orders} orders</td><td class="r"><button class="btn btn-outline btn-sm" data-action="bk-auto" data-k="${b.key}">Restore</button></td></tr>`).join('')}</tbody></table>`;
  }

  UI.on('set-save', () => {
    const S = st();
    const name = document.getElementById('set-name').value.trim(), cur = document.getElementById('set-cur').value.trim() || '€';
    const pin = document.getElementById('set-pin').value.trim(), pp = document.getElementById('set-pp').value.trim();
    if (pin && !/^\d{4,6}$/.test(pin)) return UI.toast('Admin PIN must be 4–6 digits', 'warn');
    if (pin && S.employees.some(e => e.pin === pin)) return UI.toast('Admin PIN cannot match an employee PIN', 'warn');
    Object.assign(S.settings, { stallName: name || S.settings.stallName, currency: cur, paypalLink: pp });
    if (pin) S.settings.adminPin = pin;
    U.setCurrency(cur);
    SP.store.commit();
    UI.toast(pin ? `Saved · Admin PIN changed (${pin.length} digits)` : 'Saved', 'success');
  });

  const pinConflict = (pin, exceptId) => {
    const S = st();
    if (pin === S.settings.adminPin) return 'PIN cannot be the Admin PIN';
    const o = S.employees.find(e => e.pin === pin && e.id !== exceptId);
    return o ? `PIN already used by ${o.name}` : null;
  };
  UI.on('emp-add', () => {
    const name = document.getElementById('emp-name').value.trim(), pin = document.getElementById('emp-pin').value.trim();
    if (!name || !/^\d{4,6}$/.test(pin)) return UI.toast('Enter a name and a 4–6 digit PIN', 'warn');
    const c = pinConflict(pin, null); if (c) return UI.toast(c, 'warn');
    st().employees.push({ id: U.uid('emp'), name, pin }); SP.store.commit(); UI.toast(`${name} added`, 'success');
  });
  UI.on('emp-del', ({ id }) => {
    const S = st(), sh = D.openShift(S);
    if (sh && sh.employeeId === id) return UI.toast('This person has an open shift — close it first', 'warn');
    if (S.employees.length <= 1) return UI.toast('Keep at least one employee', 'warn');
    S.employees = S.employees.filter(e => e.id !== id); SP.store.commit();
  });
  UI.on('emp-pin', ({ id }) => {
    const e = st().employees.find(x => x.id === id);
    UI.modal(`<div class="modal-head"><h3>New PIN for ${U.esc(e.name)}</h3><button class="btn btn-ghost btn-sm" data-action="modal-close">Cancel</button></div>
      <div class="modal-body"><input id="new-emp-pin" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" autofocus /></div>
      <div class="modal-foot"><button class="btn btn-primary" data-action="emp-pin-save" data-id="${id}">Save</button></div>`, { size: 'sm' });
  });
  UI.on('emp-pin-save', ({ id }) => {
    const pin = document.getElementById('new-emp-pin').value.trim();
    if (!/^\d{4,6}$/.test(pin)) return UI.toast('4–6 digits', 'warn');
    const c = pinConflict(pin, id); if (c) return UI.toast(c, 'warn');
    st().employees.find(x => x.id === id).pin = pin; UI.closeModal(); SP.store.commit(); UI.toast('PIN changed', 'success');
  });

  // Offline readiness: installed from the Home Screen + app files cached by the service worker
  function offlineHTML() {
    const installed = window.navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
    const cached = !!(navigator.serviceWorker && navigator.serviceWorker.controller);
    const line = (ok, yes, no) => `<li class="${ok ? 'ok-text' : 'warn-text'}">${ok ? '✔' : '✘'} ${ok ? yes : no}</li>`;
    return `<ul class="plain-list">
      ${line(cached, 'App files are saved on this device — opens without internet', location.protocol === 'file:' ? 'Opened as a file — offline install needs the hosted link (see README)' : 'App files not saved yet — reload once while online')}
      ${line(installed, 'Running as the Home Screen app', 'Running in a browser tab — use Share → Add to Home Screen, then always open the app icon')}
    </ul>
    <p class="muted-text small">Sales are stored on this iPad in the Home Screen app only (a Safari tab has separate storage). Turn on Airplane Mode and open the app once before the event to check.</p>`;
  }

  UI.on('bk-download', () => {
    const S = st();
    S.lastBackupDownload = U.nowISO();
    U.download(`StallPOS_backup_${U.dayStr()}_${new Date().toTimeString().slice(0, 5).replace(':', '')}.json`, JSON.stringify({ app: 'StallPOS', version: 3, exportedAt: U.nowISO(), state: S }), 'application/json');
    SP.store.commit();
    UI.toast('Backup downloaded', 'success');
  });
  UI.on('bk-file', (_, el) => {
    const file = el.files && el.files[0]; el.value = '';
    if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      let data; try { data = JSON.parse(r.result); } catch (e) { return UI.toast('Not a valid backup file', 'error'); }
      if (!data || data.app !== 'StallPOS' || ![2, 3].includes(data.version) || !data.state) return UI.toast('Not a StallPOS backup', 'error');
      UI.confirmBox({ title: 'Restore this backup?', message: `Replaces all data with the backup from ${U.fmtDateTime(data.exportedAt)} (${data.state.orders.length} orders).`, confirmLabel: 'Restore', danger: true,
        onConfirm: () => { SP.store.replaceState(data.state); A.ui.mode = 'cashier'; A.ui.locked = true; A.render(); UI.toast('Backup restored', 'success'); } });
    };
    r.readAsText(file);
  });
  UI.on('bk-auto', ({ k }) => UI.confirmBox({ title: 'Restore snapshot?', message: 'Replaces all current data with this snapshot.', confirmLabel: 'Restore', danger: true,
    onConfirm: async () => { await SP.store.restoreAutoBackup(k); A.ui.mode = 'cashier'; A.ui.locked = true; A.render(); UI.toast('Snapshot restored', 'success'); } }));

  UI.on('reset-sample', () => UI.confirmBox({ title: 'Reload the sample event?', message: 'All current data is replaced. Your Admin PIN and stall name are kept.', confirmLabel: 'Reload sample', danger: true,
    onConfirm: () => { const S = st(); SP.store.replaceState(SP.sample.build(S.settings.adminPin, S.settings.stallName)); A.ui.mode = 'cashier'; A.ui.locked = true; A.render(); UI.toast('Sample reloaded · Cashier 1 PIN 1111', 'success'); } }));
  UI.on('reset-all', () => UI.confirmBox({ title: 'Erase everything?', message: 'All data on this device is deleted and setup starts again.', confirmLabel: 'Erase', danger: true,
    onConfirm: () => { SP.store.replaceState(SP.store.blankState()); A.ui.mode = 'cashier'; A.ui.locked = true; A.render(); } }));
})();
