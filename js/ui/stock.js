/* StallPOS v2 — stall stock: food (portions per menu item) and packaging (pieces).
   On hand, daily ledger, stock log, received / added, waste / loss, stock count. */
(() => {
  const U = SP.util, D = SP.domain, UI = SP.ui, A = SP.app;
  const st = () => SP.store.get();
  let sub = 'onhand';          // 'onhand' | 'ledger' | 'log'
  let logAllDays = false;

  const refOf = (kind, id) => kind === 'item' ? D.item(st(), id) : D.supply(st(), id);
  const unitOf = kind => kind === 'item' ? 'portions' : 'pcs';
  const nameOf = (kind, id) => (refOf(kind, id) || {}).name || '(removed)';
  const fq = (kind, q) => `${U.fmtQty(q)} ${unitOf(kind)}`;

  SP.views.stock = {
    render: () => {
      const admin = A.ui.mode === 'admin';
      const subs = [['onhand', 'On hand'], ...(admin ? [['ledger', 'Daily ledger'], ['log', 'Stock log']] : [])];
      if (!subs.some(s => s[0] === sub)) sub = 'onhand';
      return `
        <div class="row-between wrap">
          <div class="row-gap">
            <h2>Stall stock</h2>
            ${subs.length > 1 ? `<div class="seg">${subs.map(([id, l]) => `<button class="seg-btn ${sub === id ? 'active' : ''}" data-action="stock-sub" data-s="${id}">${l}</button>`).join('')}</div>` : ''}
          </div>
          <div class="row-gap">
            <button class="btn btn-soft-danger" data-action="loss-open">Log waste / loss</button>
            <button class="btn btn-outline" data-action="count-open">Stock count</button>
          </div>
        </div>
        ${sub === 'onhand' ? onHandHTML(admin) : sub === 'ledger' ? ledgerHTML() : logHTML()}`;
    },
    openCount: (ctx, after) => openCount(ctx, after)
  };
  UI.on('stock-sub', ({ s }) => { sub = s; A.render(); });

  // ---------------- On hand ----------------
  function onHandHTML(admin) {
    const S = st(), oh = D.onHandAll(S), day = A.currentDay(), sold = D.soldOnDay(S, day);
    const statusTag = (v, low) => v < 0 ? UI.badge('recount', 'red') : v <= (low || 0) ? UI.badge('low', 'warn') : '';
    const btns = (kind, id) => `${admin ? `<button class="btn btn-soft-success btn-sm" data-action="restock-open" data-k="${kind}" data-id="${id}">Add</button>` : ''}
      <button class="btn btn-ghost btn-sm" data-action="loss-open" data-k="${kind}" data-id="${id}">Waste</button>`;
    const food = S.items.map(it => {
      const v = D.onHand(S, 'item', it.id, oh), t = D.targetFor(S, it.id, day), left = Math.max(0, t - (sold[it.id] || 0));
      const lim = D.limitedBy(S, it.id, oh);
      return `<tr><td><b>${U.esc(it.name)}</b>${lim ? `<div class="small warn-text">only ${Math.max(0, D.canMake(S, it.id, oh))} can be served — ${U.esc(lim.name)} running out</div>` : ''}</td>
        <td class="r"><b class="${v < 0 ? 'neg' : ''}">${U.fmtQty(v)}</b> ${statusTag(v, it.lowAlert)}</td>
        <td class="r">${t ? `${left} <span class="muted-text small">of ${t}</span>` : '<span class="muted-text small">no plan</span>'}</td>
        <td class="r nowrap">${btns('item', it.id)}</td></tr>`;
    }).join('');
    const pkg = S.supplies.map(s => {
      const v = D.onHand(S, 'supply', s.id, oh);
      return `<tr><td><b>${U.esc(s.name)}</b></td><td class="r"><b class="${v < 0 ? 'neg' : ''}">${U.fmtQty(v)}</b> ${statusTag(v, s.lowAlert)}</td>
        <td class="small muted-text">${U.esc(S.items.filter(i => (i.packaging || []).some(p => p.supplyId === s.id)).map(i => i.name).join(', ') || '—')}</td>
        <td class="r nowrap">${btns('supply', s.id)}</td></tr>`;
    }).join('');
    return `
      <div class="panel"><h3>Food — portions</h3>
        <table class="table"><thead><tr><th>Item</th><th class="r">On hand</th><th class="r">Today's plan left</th><th></th></tr></thead>
        <tbody>${food || '<tr><td colspan="4">No menu items</td></tr>'}</tbody></table></div>
      <div class="panel"><h3>Packaging — pieces</h3>
        <table class="table"><thead><tr><th>Item</th><th class="r">On hand</th><th>Used by</th><th></th></tr></thead>
        <tbody>${pkg || '<tr><td colspan="4">No packaging</td></tr>'}</tbody></table></div>
      <p class="muted-text small">Every sale takes off one portion and its packaging. On hand is calculated from the stock log; count at closing to keep it honest.</p>`;
  }

  // ---------------- Daily ledger ----------------
  function ledgerHTML() {
    const S = st(), day = A.currentDay();
    const row = r => {
      const l = D.ledger(S, r.kind, r.id, day), f = v => U.fmtQty(v);
      return `<tr><td><b>${U.esc(r.name)}</b></td><td class="r">${f(l.opening)}</td><td class="r pos">${l.restock ? '+' + f(l.restock) : '·'}</td>
        <td class="r">${l.sold ? '−' + f(l.sold) : '·'}</td><td class="r neg">${l.loss ? '−' + f(l.loss) : '·'}</td>
        <td class="r">${l.adjust ? (l.adjust > 0 ? '+' : '') + f(l.adjust) : '·'}</td><td class="r"><b>${f(l.closing)}</b></td></tr>`;
    };
    const head = `<thead><tr><th></th><th class="r">Opening</th><th class="r">Received</th><th class="r">Sold</th><th class="r">Waste / loss</th><th class="r">Count / edit</th><th class="r">Closing</th></tr></thead>`;
    const refs = D.stockRefs(S);
    return `
      <div class="panel"><h3>Daily ledger · ${U.fmtDay(day)}</h3>
        <p class="muted-text small">Opening + received − sold − waste ± corrections = closing. Each day opens with the previous day's closing. Change the day in the header (Admin, no shift open).</p>
        <h4>Food (portions)</h4><table class="table">${head}<tbody>${refs.filter(r => r.kind === 'item').map(row).join('')}</tbody></table>
        <h4>Packaging (pcs)</h4><table class="table">${head}<tbody>${refs.filter(r => r.kind === 'supply').map(row).join('')}</tbody></table>
      </div>`;
  }

  // ---------------- Stock log ----------------
  function logHTML() {
    const S = st(), day = A.currentDay();
    const rows = S.movements.filter(m => m.reason !== 'sale' && (logAllDays || m.day === day)).slice().reverse().slice(0, 500);
    return `
      <div class="panel">
        <div class="row-between wrap"><h3>Stock log · ${logAllDays ? 'all days' : U.fmtDay(day)} (${rows.length})</h3>
          <div class="row-gap"><button class="btn btn-outline btn-sm" data-action="log-all">${logAllDays ? 'This day only' : 'All days'}</button>
          <button class="btn btn-success btn-sm" data-action="log-csv">Download CSV</button></div></div>
        <p class="muted-text small">Deliveries, waste, counts, edits and voids. Individual sales are summarised in the daily ledger.</p>
        <table class="table"><thead><tr><th>When</th><th>Day</th><th>What</th><th class="r">Change</th><th>Reason</th><th>Note</th><th>By</th></tr></thead><tbody>
          ${rows.map(m => `<tr><td class="nowrap">${U.fmtDateTime(m.ts)}</td><td class="nowrap">${U.fmtDay(m.day)}</td><td><b>${U.esc(nameOf(m.kind, m.refId))}</b></td>
            <td class="r ${m.qty > 0 ? 'pos' : 'neg'}">${m.qty > 0 ? '+' : ''}${fq(m.kind, m.qty)}</td>
            <td>${U.esc((D.REASONS[m.reason] || { label: m.reason }).label)}</td><td class="muted-text">${U.esc(m.note)}</td><td>${U.esc(m.by)}</td></tr>`).join('') || '<tr><td colspan="7">Nothing logged.</td></tr>'}
        </tbody></table>
      </div>`;
  }
  UI.on('log-all', () => { logAllDays = !logAllDays; A.render(); });
  UI.on('log-csv', () => {
    const S = st();
    const rows = [['Timestamp', 'Business_Day', 'Type', 'Name', 'Change', 'Unit', 'Reason', 'Note', 'By', 'Order'],
      ...S.movements.map(m => [m.ts, m.day, m.kind === 'item' ? 'food' : 'packaging', nameOf(m.kind, m.refId), m.qty, unitOf(m.kind), (D.REASONS[m.reason] || { label: m.reason }).label, m.note, m.by,
        m.orderId ? '#' + ((S.orders.find(o => o.id === m.orderId) || {}).no || '') : ''])];
    U.download(`StallPOS_stock_log_${U.dayStr()}.csv`, U.toCSV(rows), 'text/csv;charset=utf-8');
    UI.toast('Stock log downloaded', 'success');
  });

  // ---------------- Received / added ----------------
  let rs = null;
  UI.on('restock-open', ({ k, id }) => {
    rs = { kind: k, id };
    const quick = k === 'item' ? [5, 10, 20, 50] : [10, 50, 100, 250];
    UI.modal(`
      <div class="modal-head"><h3>Add to stock — ${U.esc(nameOf(k, id))}</h3><button class="btn btn-ghost btn-sm" data-action="modal-close">Close</button></div>
      <div class="modal-body">
        <p class="muted-text">On hand: <b>${fq(k, D.onHand(st(), k, id))}</b>. Logged on ${U.fmtDay(A.currentDay())}.</p>
        <label class="label">Note (where it came from)</label>
        <input id="rs-note" placeholder="e.g. central kitchen delivery, Metro" />
        <label class="label">Quantity (${unitOf(k)})</label>
        <div class="row-gap">${quick.map(n => `<button class="btn btn-soft-success" data-action="restock-do" data-q="${n}">+${n}</button>`).join('')}</div>
        <div class="row-gap"><input id="rs-qty" type="number" inputmode="numeric" step="1" placeholder="Custom" class="flex1" data-enter="restock-do" /><button class="btn btn-primary" data-action="restock-do">Add</button></div>
      </div>`, { size: 'sm' });
  });
  UI.on('restock-do', ({ q }) => {
    const qty = U.qty(q != null ? Number(q) : parseFloat(String(document.getElementById('rs-qty').value).replace(',', '.')));
    if (!(qty > 0)) return UI.toast('Enter a quantity', 'warn');
    const note = document.getElementById('rs-note').value.trim();
    UI.closeModal();
    SP.store.restock(rs.kind, rs.id, qty, note, A.ctx());
    UI.toast(`${nameOf(rs.kind, rs.id)} +${fq(rs.kind, qty)}`, 'success');
  });

  // ---------------- Waste / loss ----------------
  UI.on('loss-open', ({ k, id }) => {
    const S = st();
    const opts = [
      `<optgroup label="Food (portions)">${S.items.map(i => `<option value="item:${i.id}" ${k === 'item' && id === i.id ? 'selected' : ''}>${U.esc(i.name)}</option>`).join('')}</optgroup>`,
      `<optgroup label="Packaging (pcs)">${S.supplies.map(s => `<option value="supply:${s.id}" ${k === 'supply' && id === s.id ? 'selected' : ''}>${U.esc(s.name)}</option>`).join('')}</optgroup>`];
    UI.modal(`
      <div class="modal-head"><h3>Log waste / loss</h3><button class="btn btn-ghost btn-sm" data-action="modal-close">Close</button></div>
      <div class="modal-body">
        <p class="muted-text small">Anything that left the stall without being sold.</p>
        <label class="label">What</label><select id="loss-ref" data-change="loss-ref">${opts.join('')}</select>
        <div class="grid2">
          <div><label class="label">Quantity <span id="loss-unit" class="muted-text"></span></label><input id="loss-qty" type="number" inputmode="numeric" step="1" value="1" /></div>
          <div><label class="label">Reason</label><select id="loss-reason" data-change="loss-ref">${D.LOSS_REASONS.map(r => `<option value="${r}">${D.REASONS[r].label}</option>`).join('')}</select></div>
        </div>
        <label class="check" id="loss-pkg-row"><input type="checkbox" id="loss-pkg" /> Also remove its packaging (it was served)</label>
        <label class="label">Note</label><input id="loss-note" placeholder="e.g. burnt batch, end-of-night leftovers" />
      </div>
      <div class="modal-foot"><button class="btn btn-danger" data-action="loss-save">Log loss</button></div>`, { size: 'sm' });
    lossRefChanged();
  });
  function lossRefChanged() {
    const [kind, id] = document.getElementById('loss-ref').value.split(':');
    const it = kind === 'item' ? D.item(st(), id) : null;
    document.getElementById('loss-unit').textContent = `(${unitOf(kind)})`;
    const has = !!(it && (it.packaging || []).length);
    document.getElementById('loss-pkg-row').style.display = has ? '' : 'none';
    document.getElementById('loss-pkg').checked = has && ['staff_meal', 'given_away', 'damaged'].includes(document.getElementById('loss-reason').value);
  }
  UI.on('loss-ref', lossRefChanged);
  UI.on('loss-save', () => {
    const [kind, id] = document.getElementById('loss-ref').value.split(':');
    const qty = U.qty(parseFloat(String(document.getElementById('loss-qty').value).replace(',', '.')));
    if (!(qty > 0)) return UI.toast('Enter a quantity', 'warn');
    const reason = document.getElementById('loss-reason').value;
    const note = document.getElementById('loss-note').value.trim();
    const withPkg = document.getElementById('loss-pkg').checked;
    UI.closeModal();
    SP.store.logLoss(kind, id, qty, reason, note, withPkg, A.ctx());
    UI.toast(`Logged ${fq(kind, qty)} ${nameOf(kind, id)} — ${D.REASONS[reason].label.toLowerCase()}`, 'warn');
  });

  // ---------------- Stock count ----------------
  let countCtx = null, countAfter = null;
  function openCount(ctx, after) {
    countCtx = ctx || A.ctx(); countAfter = after || null;
    const S = st(), oh = D.onHandAll(S);
    const row = r => {
      const v = D.onHand(S, r.kind, r.id, oh);
      return `<tr><td><b>${U.esc(r.name)}</b></td><td class="r">${U.fmtQty(v)}</td>
        <td class="r"><input class="count-input" type="number" inputmode="numeric" step="1" placeholder="—" data-k="${r.kind}" data-id="${r.id}" data-sys="${v}" data-input="count-diff" /></td>
        <td class="r" id="cd-${r.kind}-${r.id}"></td></tr>`;
    };
    const refs = D.stockRefs(S);
    UI.modal(`
      <div class="modal-head"><h3>Stock count · ${U.fmtDay(countCtx.day)}</h3><button class="btn btn-ghost btn-sm" data-action="count-cancel">Skip</button></div>
      <div class="modal-body">
        <p class="muted-text small">Count what's physically at the stall. Leave a box empty to skip it. Differences are logged as count corrections.</p>
        <table class="table"><thead><tr><th>What</th><th class="r">App says</th><th class="r">Counted</th><th class="r">Diff</th></tr></thead><tbody>
          <tr><td colspan="4" class="label">Food (portions)</td></tr>${refs.filter(r => r.kind === 'item').map(row).join('')}
          <tr><td colspan="4" class="label">Packaging (pcs)</td></tr>${refs.filter(r => r.kind === 'supply').map(row).join('')}
        </tbody></table>
        <label class="label">Note</label><input id="count-note" placeholder="e.g. end-of-day count" />
      </div>
      <div class="modal-foot"><button class="btn btn-primary btn-lg" data-action="count-save">Save count</button></div>`, { size: 'lg', closable: false });
  }
  UI.on('count-open', () => openCount(A.ctx(), null));
  UI.on('count-diff', (ds, el) => {
    const out = document.getElementById(`cd-${ds.k}-${ds.id}`);
    if (el.value === '') { out.textContent = ''; return; }
    const diff = U.qty(parseFloat(el.value.replace(',', '.')) - Number(ds.sys));
    out.textContent = diff === 0 ? 'OK' : (diff > 0 ? '+' : '') + U.fmtQty(diff);
    out.className = `r ${diff < 0 ? 'neg' : diff > 0 ? 'pos' : 'ok-text'}`;
  });
  UI.on('count-save', () => {
    const entries = [...document.querySelectorAll('.count-input')].filter(i => i.value !== '')
      .map(i => ({ kind: i.dataset.k, id: i.dataset.id, counted: U.qty(parseFloat(i.value.replace(',', '.'))) }));
    if (!entries.length) return UI.toast('Enter at least one count, or tap Skip', 'warn');
    const note = document.getElementById('count-note').value.trim() || 'Stock count';
    const after = countAfter; countAfter = null;
    UI.closeModal();
    const changed = SP.store.applyCount(entries, note, countCtx);
    UI.toast(`Count saved: ${entries.length} counted, ${changed} corrected`, changed ? 'warn' : 'success');
    if (after) after();
  });
  UI.on('count-cancel', () => { const after = countAfter; countAfter = null; UI.closeModal(); if (after) after(); });
})();
