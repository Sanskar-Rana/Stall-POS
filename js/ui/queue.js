/* StallPOS v2 — kitchen queue (Preparing → Ready → Collected) and full-screen customer display. */
(() => {
  const U = SP.util, UI = SP.ui, A = SP.app;
  const st = () => SP.store.get();

  const ageMin = iso => Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  const todays = () => st().orders.filter(o => !o.voided && o.day === A.currentDay());

  function card(o) {
    const age = ageMin(o.ts);
    return `
      <div class="q-card ${o.status}">
        <button class="q-main" data-action="q-next" data-id="${o.id}">
          <div class="q-top"><span class="q-no">#${o.no}</span>${o.customer ? `<span class="q-cust">${U.esc(o.customer)}</span>` : ''}<span class="q-age ${age >= 10 && o.status === 'preparing' ? 'late' : ''}">${age} min</span></div>
          <ul class="q-lines">${o.lines.map(l => `<li><b>${l.qty}×</b> ${U.esc(l.name)}${l.type === 'combo' ? ` <small>(${l.picks.map(p => U.esc(p.name)).join(' + ')})</small>` : (l.options || []).length ? ` <small>(${l.options.map(x => U.esc(x.name)).join(', ')})</small>` : ''}</li>`).join('')}</ul>
          <div class="q-hint">${o.status === 'preparing' ? 'Tap when ready →' : 'Tap when collected ✓'}</div>
        </button>
        <button class="q-back" data-action="q-back" data-id="${o.id}" title="Move back">↩</button>
      </div>`;
  }

  SP.views.queue = {
    render: () => {
      const orders = todays();
      const prep = orders.filter(o => o.status === 'preparing').sort((a, b) => a.no - b.no);
      const ready = orders.filter(o => o.status === 'ready').sort((a, b) => a.no - b.no);
      const done = orders.filter(o => o.status === 'collected').sort((a, b) => new Date(b.statusAt) - new Date(a.statusAt)).slice(0, 8);
      return `
        <div class="row-between"><h2>Kitchen queue · ${U.fmtDay(A.currentDay())}</h2>
          <button class="btn btn-dark" data-action="q-screen">Customer screen</button></div>
        <div class="queue">
          <section><h3>Preparing <span class="tab-count">${prep.length}</span></h3>${prep.map(card).join('') || UI.empty('Nothing cooking')}</section>
          <section><h3>Ready <span class="tab-count ok">${ready.length}</span></h3>${ready.map(card).join('') || UI.empty('Nothing waiting')}</section>
        </div>
        ${done.length ? `<h3>Recently collected</h3><div class="chips">${done.map(o => `<button class="chip" data-action="q-back" data-id="${o.id}" title="Undo">#${o.no} ↩</button>`).join('')}</div>` : ''}`;
    },
    customerScreen: () => {
      const orders = todays();
      const nums = s => orders.filter(o => o.status === s).sort((a, b) => a.no - b.no).map(o => `<span class="cs-no">${o.no}</span>`).join('') || '<span class="cs-empty">—</span>';
      return `
        <div class="customer-screen" data-action="q-screen-exit">
          <div class="cs-col"><h2>Preparing</h2><div class="cs-nums">${nums('preparing')}</div></div>
          <div class="cs-col ready"><h2>Ready — please collect</h2><div class="cs-nums">${nums('ready')}</div></div>
          <div class="cs-foot">${U.esc(st().settings.stallName)} · tap anywhere to exit</div>
        </div>`;
    }
  };

  UI.on('q-next', ({ id }) => SP.store.advanceOrder(id));
  UI.on('q-back', ({ id }) => SP.store.advanceOrder(id, true));
  UI.on('q-screen', () => { A.ui.customerScreen = true; A.render(); });
  UI.on('q-screen-exit', () => { A.ui.customerScreen = false; A.render(); });

  // Keep "x min" ages and the customer screen fresh
  setInterval(() => {
    if (A.ui.customerScreen || (A.ui.tab === 'queue' && !A.ui.locked && !UI.modalOpen())) A.render();
  }, 30000);
})();
