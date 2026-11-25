/* StallPOS v2 — shift: today's orders, voids (Admin PIN), live coin & note drawer (Admin), shift history. */
(() => {
  const U = SP.util, D = SP.domain, UI = SP.ui, A = SP.app;
  const st = () => SP.store.get();

  SP.views.shift = {
    render: () => {
      const S = st(), sh = D.openShift(S), admin = A.ui.mode === 'admin', day = A.currentDay();
      const orders = D.ordersOnDay(S, day, true).slice().reverse();
      return `
        ${sh ? `<div class="panel">
          <div class="row-between wrap"><h3>${U.esc(sh.employeeName)}'s shift · ${U.fmtDay(sh.day)}</h3>
            <button class="btn btn-danger" data-action="shift-close">Close shift</button></div>
          <p class="muted-text small">Opened ${U.fmtDateTime(sh.openedAt)}${sh.paused ? ' · paused' : ''}</p>
          ${admin ? drawerHTML(S, sh) : `<p class="muted-text small">Drawer figures are visible to Admin only.</p>`}
        </div>` : `<div class="panel">${UI.empty('No shift open.')}</div>`}
        <div class="panel"><h3>Orders · ${U.fmtDay(day)} (${orders.filter(o => !o.voided).length})</h3>
          <table class="table"><thead><tr><th>#</th><th>Time</th><th>Items</th><th>Method</th><th class="r">Total</th><th class="r">Tip</th><th>Status</th><th></th></tr></thead><tbody>
          ${orders.map(o => `<tr class="${o.voided ? 'voided' : ''}"><td><b>${o.no}</b></td><td>${U.fmtTime(o.ts)}</td>
            <td class="small">${o.lines.map(l => `${l.qty}× ${U.esc(l.name)}`).join(', ')}</td><td>${o.method}${o.card && o.card.last4 ? ' ••' + U.esc(o.card.last4) : ''}</td>
            <td class="r">${U.money(o.subtotal)}</td><td class="r">${o.tip ? U.money(o.tip) : ''}</td>
            <td>${o.voided ? UI.badge('voided', 'red') : UI.badge(o.status, o.status === 'ready' ? 'ok' : 'muted')}</td>
            <td class="r">${o.voided ? `<small class="muted-text">${U.esc(o.voidReason || '')}</small>` : `<button class="btn btn-ghost btn-sm danger-text" data-action="void" data-id="${o.id}">Void</button>`}</td></tr>`).join('') || '<tr><td colspan="8">No orders yet.</td></tr>'}
          </tbody></table></div>
        ${admin ? historyHTML(S) : ''}`;
    }
  };

  function drawerHTML(S, sh) {
    const t = D.shiftTotals(S, sh), live = D.liveDrawer(S, sh);
    const row = d => { const o = sh.opening[d.c] || 0, n = live[d.c] || 0; return `<tr><td>${d.label}</td><td class="r muted-text">${o}</td><td class="r"><b class="${n < 0 ? 'neg' : ''}">${n}</b></td><td class="r ${n - o > 0 ? 'pos' : n - o < 0 ? 'neg' : 'muted-text'}">${n - o > 0 ? '+' : ''}${n - o}</td></tr>`; };
    return `
      <div class="stats4">
        <div class="stat"><span>Cash sales</span><b>${U.money(t.cashSales)}</b><small>tips ${U.money(t.cashTips)}</small></div>
        <div class="stat"><span>PayPal</span><b>${U.money(t.paypalSales)}</b><small>tips ${U.money(t.paypalTips)}</small></div>
        <div class="stat"><span>Card</span><b>${U.money(t.cardSales)}</b><small>tips ${U.money(t.cardTips)}</small></div>
        <div class="stat"><span>Expected drawer</span><b>${U.money(t.expectedCash)}</b><small>opening ${U.money(D.denomTotal(sh.opening))}</small></div>
      </div>
      <h4>Live drawer — updates with every cash sale</h4>
      ${D.DENOMS.some(d => (live[d.c] || 0) < 0) ? '<div class="note bad">Some counts are below zero — change was given with coins the count did not have. Recount at close.</div>' : ''}
      <div class="grid2">
        <table class="table"><thead><tr><th>Coin</th><th class="r">Opening</th><th class="r">Now</th><th class="r">±</th></tr></thead><tbody>${D.DENOMS.filter(d => d.type === 'coin').map(row).join('')}</tbody></table>
        <table class="table"><thead><tr><th>Note</th><th class="r">Opening</th><th class="r">Now</th><th class="r">±</th></tr></thead><tbody>${D.DENOMS.filter(d => d.type === 'note').map(row).join('')}</tbody></table>
      </div>`;
  }

  function historyHTML(S) {
    const closed = S.shifts.filter(s => s.status === 'closed').slice().reverse().slice(0, 30);
    return `<div class="panel"><h3>Closed shifts</h3>
      <table class="table"><thead><tr><th>Day</th><th>Who</th><th>Open → Close</th><th class="r">Expected</th><th class="r">Counted</th><th class="r">Variance</th></tr></thead><tbody>
      ${closed.map(s => `<tr><td>${U.fmtDay(s.day)}</td><td>${U.esc(s.employeeName)}</td><td>${U.fmtTime(s.openedAt)} → ${U.fmtTime(s.closedAt)}</td>
        <td class="r">${U.money(s.expected)}</td><td class="r">${U.money(s.countedTotal)}</td><td class="r ${s.variance < 0 ? 'neg' : s.variance > 0 ? 'pos' : ''}"><b>${s.variance === 0 ? 'balanced' : (s.variance > 0 ? '+' : '') + U.money(s.variance)}</b></td></tr>`).join('') || '<tr><td colspan="6">None yet.</td></tr>'}
      </tbody></table></div>`;
  }

  UI.on('shift-close', () => SP.lock.openCloseShift({ thenBeginFor: null }));
  UI.on('void', ({ id }) => {
    const o = st().orders.find(x => x.id === id);
    const doVoid = () => UI.modal(`
      <div class="modal-head"><h3>Void order #${o.no}?</h3></div>
      <div class="modal-body"><p>${U.money(o.subtotal)}${o.tip ? ' + tip ' + U.money(o.tip) : ''} · ${o.method}. Stock, totals and the drawer are reversed${o.method === 'cash' ? ' — hand the cash back' : ''}.</p>
        <label class="label">Reason</label><input id="void-reason" placeholder="e.g. wrong item, customer left" autofocus /></div>
      <div class="modal-foot"><button class="btn btn-ghost" data-action="modal-close">Cancel</button><button class="btn btn-danger" data-action="void-do" data-id="${id}">Void order</button></div>`, { size: 'sm' });
    if (A.ui.mode === 'admin') doVoid(); else UI.askAdminPin('Admin PIN to void', doVoid);
  });
  UI.on('void-do', ({ id }) => {
    const reason = document.getElementById('void-reason').value.trim();
    UI.closeModal();
    SP.store.voidOrder(id, reason, A.ctx());
    UI.toast('Order voided', 'warn');
  });
})();
