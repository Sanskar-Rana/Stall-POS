/* StallPOS v2 — register: item grid, options/combo sheets, cart, checkout (cash / PayPal / card). */
(() => {
  const U = SP.util, D = SP.domain, UI = SP.ui, A = SP.app;
  const st = () => SP.store.get();
  const ui = A.ui;

  // ---------------- view ----------------
  SP.views.register = {
    render: () => {
      if (!A.canSell()) {
        return `<div class="panel">${UI.empty(ui.mode === 'admin'
          ? 'No shift is open. To sell as Admin: Exit Admin → choose Admin → Begin shift as Admin.'
          : 'Shift paused.')}</div>`;
      }
      const S = st();
      const cats = ['All', ...new Set(S.items.map(i => i.category || 'Other')), ...(S.combos.length ? ['Combos'] : [])];
      return `
        <div class="register">
          <section class="reg-left">
            <div class="reg-toolbar">
              <div class="chips">${cats.map(c => `<button class="chip ${ui.category === c ? 'active' : ''}" data-action="reg-cat" data-c="${U.esc(c)}">${U.esc(c)}</button>`).join('')}</div>
              <input type="search" class="search" placeholder="Search menu…" value="${U.esc(ui.search)}" data-input="reg-search" />
            </div>
            <div id="reg-grid">${gridHTML()}</div>
          </section>
          <aside class="reg-cart" id="reg-cart">${cartHTML()}</aside>
        </div>`;
    }
  };

  // ---------------- grid ----------------
  function gridHTML() {
    const S = st(), day = A.currentDay(), oh = D.onHandAll(S), sold = D.soldOnDay(S, day);
    const q = ui.search.trim().toLowerCase();
    const inCart = {};
    ui.cart.forEach(l => {
      if (l.type === 'combo') l.picks.forEach(p => { inCart[p.itemId] = (inCart[p.itemId] || 0) + l.qty; });
      else inCart[l.itemId] = (inCart[l.itemId] || 0) + l.qty;
    });
    const items = S.items.filter(i => (ui.category === 'All' || (i.category || 'Other') === ui.category) && (!q || i.name.toLowerCase().includes(q)));
    const combos = (ui.category === 'All' || ui.category === 'Combos') ? S.combos.filter(c => !q || c.name.toLowerCase().includes(q)) : [];
    if (!items.length && !combos.length) return UI.empty('Nothing matches.');
    const itemCard = it => {
      const target = D.targetFor(S, it.id, day);
      const used = (sold[it.id] || 0) + (inCart[it.id] || 0);
      const left = target - used;
      const can = D.canMake(S, it.id, oh) - (inCart[it.id] || 0);
      const limiting = D.limitedBy(S, it.id, oh);
      let planTag;
      if (target <= 0) planTag = `<span class="tag">no plan today</span>`;
      else if (left >= 0) planTag = `<span class="tag ${left <= Math.max(3, target * 0.1) ? 'tag-warn' : 'tag-blue'}">${left} left today</span>`;
      else planTag = `<span class="tag tag-warn">+${-left} over plan</span>`;
      const blocked = it.hardLimit && target > 0 && left <= 0 && !SP.store.isOverLimitAllowed(day, it.id);
      const stockLine = can <= 0
        ? `<div class="stock-line neg">${limiting ? `Out of ${U.esc(limiting.name)}` : 'Stock shows 0 — recount'}</div>`
        : `<div class="stock-line ${can <= (it.lowAlert || 0) ? 'warn' : ''}">${can} in stock${limiting ? ` · ${U.esc(limiting.name)} low` : ''}</div>`;
      return `
        <button class="card-item ${inCart[it.id] ? 'in-cart' : ''} ${blocked ? 'blocked' : ''}" data-action="reg-tap" data-id="${it.id}">
          ${inCart[it.id] ? `<span class="qty-badge">${inCart[it.id]}</span>` : ''}
          <div class="ci-name">${U.esc(it.name)}</div>
          <div class="ci-price">${U.money(it.priceCents)}${it.optionGroupIds.length ? ' <span class="opt-dot" title="has options">+</span>' : ''}</div>
          <div class="ci-meta">${planTag}${blocked ? '<span class="tag tag-red">Admin PIN</span>' : ''}</div>
          ${stockLine}
        </button>`;
    };
    const comboCard = c => `
      <button class="card-item combo" data-action="reg-combo" data-id="${c.id}">
        <div class="ci-name">${U.esc(c.name)}</div>
        <div class="ci-price">${U.money(c.priceCents)}</div>
        <div class="ci-meta"><span class="tag">combo · ${c.slots.map(s => U.esc(s.label)).join(' + ')}</span></div>
      </button>`;
    return `<div class="grid-items">${items.map(itemCard).join('')}${combos.map(comboCard).join('')}</div>`;
  }
  const refreshGrid = () => A.refresh('reg-grid', gridHTML());
  const refreshCart = () => A.refresh('reg-cart', cartHTML());
  const refreshBoth = () => { refreshGrid(); refreshCart(); };

  UI.on('reg-cat', ({ c }) => { ui.category = c; A.render(); });
  UI.on('reg-search', (_, el) => { ui.search = el.value; refreshGrid(); });  // only the grid redraws → search keeps focus

  // ---------------- adding items ----------------
  UI.on('reg-tap', ({ id }) => {
    const S = st(), it = D.item(S, id), day = A.currentDay();
    const target = D.targetFor(S, id, day);
    const inCart = U.sum(ui.cart.filter(l => l.itemId === id), l => l.qty) + U.sum(ui.cart.filter(l => l.type === 'combo'), l => l.picks.filter(p => p.itemId === id).length * l.qty);
    const willBe = (D.soldOnDay(S, day)[id] || 0) + inCart + 1;
    if (it.hardLimit && target > 0 && willBe > target && !SP.store.isOverLimitAllowed(day, id)) {
      return UI.confirmBox({
        title: `${it.name}: today's plan reached`,
        message: `${it.name} has a hard limit of ${target} today to protect stock for other days. Admin can allow extra sales for today.`,
        confirmLabel: 'Allow (Admin PIN)',
        onConfirm: () => UI.askAdminPin('Allow extra sales today', () => { SP.store.allowOverLimit(day, id); UI.toast(`Extra ${it.name} allowed today`, 'success'); })
      });
    }
    if (it.optionGroupIds.length) return openOptions(it);
    addLine({ type: 'item', itemId: it.id, name: it.name, qty: 1, unitCents: it.priceCents, options: [] });
  });

  function addLine(line) {
    const key = lineKey(line);
    const existing = ui.cart.find(l => lineKey(l) === key);
    if (existing) existing.qty += line.qty; else ui.cart.push({ ...line, lineId: U.uid('ln') });
    softWarnings(line);
    refreshBoth();
  }
  const lineKey = l => l.type === 'combo'
    ? `c:${l.comboId}:${l.picks.map(p => p.itemId).join(',')}`
    : `i:${l.itemId}:${(l.options || []).map(o => o.choiceId).sort().join(',')}`;

  // Non-blocking: over plan / out of stock just inform
  function softWarnings(line) {
    const S = st(), day = A.currentDay();
    const ids = line.type === 'combo' ? line.picks.map(p => p.itemId) : [line.itemId];
    ids.forEach(id => {
      const it = D.item(S, id), target = D.targetFor(S, id, day);
      const total = (D.soldOnDay(S, day)[id] || 0) + U.sum(ui.cart, l => l.type === 'combo' ? l.picks.filter(p => p.itemId === id).length * l.qty : (l.itemId === id ? l.qty : 0));
      if (target > 0 && total === target + 1) UI.toast(`${it.name} is now over today's plan (${target}). Selling into other days' stock.`, 'warn', 4500);
      if (D.canMake(S, id) - total < 0) UI.toast(`Stock for ${it.name} shows empty — sale allowed, recount later.`, 'warn', 4500);
    });
  }

  // ---------------- options sheet ----------------
  let opt = null;
  function openOptions(it) {
    const S = st();
    const groups = it.optionGroupIds.map(id => D.group(S, id)).filter(Boolean);
    opt = { item: it, groups, picked: {}, qty: 1 };
    groups.forEach(g => { opt.picked[g.id] = g.required && !g.multi && g.choices[0] ? [g.choices[0].id] : []; });
    renderOptions();
  }
  function optPrice() {
    let extra = 0;
    opt.groups.forEach(g => opt.picked[g.id].forEach(cid => { const c = g.choices.find(x => x.id === cid); if (c) extra += c.priceCents; }));
    return opt.item.priceCents + extra;
  }
  function renderOptions() {
    UI.modal(`
      <div class="modal-head"><h3>${U.esc(opt.item.name)}</h3><button class="btn btn-ghost btn-sm" data-action="modal-close">Cancel</button></div>
      <div class="modal-body">
        ${opt.groups.map(g => `
          <div class="opt-group">
            <div class="label">${U.esc(g.name)} ${g.required ? '<span class="muted-text small">(choose 1)</span>' : g.multi ? '<span class="muted-text small">(any)</span>' : ''}</div>
            <div class="chips">${g.choices.map(c => {
              const on = opt.picked[g.id].includes(c.id);
              return `<button class="chip big ${on ? 'active' : ''}" data-action="opt-pick" data-g="${g.id}" data-c="${c.id}">${U.esc(c.name)}${c.priceCents ? ` +${U.money(c.priceCents)}` : ''}</button>`;
            }).join('')}</div>
          </div>`).join('')}
        <div class="row-between">
          <div class="stepper"><button class="btn btn-outline" data-action="opt-qty" data-d="-1">−</button><b>${opt.qty}</b><button class="btn btn-outline" data-action="opt-qty" data-d="1">+</button></div>
          <button class="btn btn-primary btn-lg" data-action="opt-add">Add ${U.money(optPrice() * opt.qty)}</button>
        </div>
      </div>`, { size: 'md' });
  }
  UI.on('opt-pick', ({ g, c }) => {
    const grp = opt.groups.find(x => x.id === g);
    const cur = opt.picked[g];
    if (grp.multi) opt.picked[g] = cur.includes(c) ? cur.filter(x => x !== c) : [...cur, c];
    else opt.picked[g] = grp.required ? [c] : (cur.includes(c) ? [] : [c]);
    renderOptions();
  });
  UI.on('opt-qty', ({ d }) => { opt.qty = Math.max(1, opt.qty + Number(d)); renderOptions(); });
  UI.on('opt-add', () => {
    const missing = opt.groups.find(g => g.required && !opt.picked[g.id].length);
    if (missing) return UI.toast(`Choose ${missing.name}`, 'warn');
    const options = [];
    opt.groups.forEach(g => opt.picked[g.id].forEach(cid => { const c = g.choices.find(x => x.id === cid); options.push({ groupId: g.id, choiceId: c.id, name: c.name, priceCents: c.priceCents }); }));
    UI.closeModal();
    addLine({ type: 'item', itemId: opt.item.id, name: opt.item.name, qty: opt.qty, unitCents: optPrice(), options });
  });

  // ---------------- combo sheet ----------------
  let cmb = null;
  UI.on('reg-combo', ({ id }) => {
    const c = D.combo(st(), id);
    cmb = { combo: c, picks: c.slots.map(s => s.itemIds[0]), qty: 1 };
    renderCombo();
  });
  function renderCombo() {
    const S = st();
    const normal = U.sum(cmb.picks, id => (D.item(S, id) || {}).priceCents || 0);
    UI.modal(`
      <div class="modal-head"><h3>${U.esc(cmb.combo.name)}</h3><button class="btn btn-ghost btn-sm" data-action="modal-close">Cancel</button></div>
      <div class="modal-body">
        ${cmb.combo.slots.map((s, i) => `
          <div class="opt-group"><div class="label">${U.esc(s.label)}</div>
            <div class="chips">${s.itemIds.map(id => { const it = D.item(S, id); return it ? `<button class="chip big ${cmb.picks[i] === id ? 'active' : ''}" data-action="combo-pick" data-i="${i}" data-id="${id}">${U.esc(it.name)}</button>` : ''; }).join('')}</div>
          </div>`).join('')}
        ${normal > cmb.combo.priceCents ? `<p class="note ok">Customer saves ${U.money(normal - cmb.combo.priceCents)} vs ordering separately.</p>` : ''}
        <div class="row-between">
          <div class="stepper"><button class="btn btn-outline" data-action="combo-qty" data-d="-1">−</button><b>${cmb.qty}</b><button class="btn btn-outline" data-action="combo-qty" data-d="1">+</button></div>
          <button class="btn btn-primary btn-lg" data-action="combo-add">Add ${U.money(cmb.combo.priceCents * cmb.qty)}</button>
        </div>
      </div>`);
  }
  UI.on('combo-pick', ({ i, id }) => { cmb.picks[Number(i)] = id; renderCombo(); });
  UI.on('combo-qty', ({ d }) => { cmb.qty = Math.max(1, cmb.qty + Number(d)); renderCombo(); });
  UI.on('combo-add', () => {
    const S = st();
    UI.closeModal();
    addLine({ type: 'combo', comboId: cmb.combo.id, name: cmb.combo.name, qty: cmb.qty, unitCents: cmb.combo.priceCents,
      picks: cmb.picks.map((id, i) => ({ slot: cmb.combo.slots[i].label, itemId: id, name: D.item(S, id).name })) });
  });

  // ---------------- cart ----------------
  const cartTotal = () => U.sum(ui.cart, l => l.unitCents * l.qty);
  function cartHTML() {
    if (!ui.cart.length) return `<div class="cart-head"><h3>Current order</h3></div>${UI.empty('Tap items to add them.')}`;
    return `
      <div class="cart-head"><h3>Current order</h3><button class="btn btn-ghost btn-sm danger-text" data-action="cart-clear">Clear</button></div>
      <div class="cart-lines">
        ${ui.cart.map(l => `
          <div class="cart-line">
            <div class="cl-main">
              <div class="cl-name">${U.esc(l.name)}</div>
              <div class="cl-sub">${l.type === 'combo' ? l.picks.map(p => U.esc(p.name)).join(' + ') : (l.options || []).map(o => U.esc(o.name)).join(', ')}</div>
              <div class="cl-price">${U.money(l.unitCents)} × ${l.qty} = <b>${U.money(l.unitCents * l.qty)}</b></div>
            </div>
            <div class="stepper sm">
              <button class="btn btn-outline btn-sm" data-action="cart-qty" data-id="${l.lineId}" data-d="-1">−</button>
              <b>${l.qty}</b>
              <button class="btn btn-outline btn-sm" data-action="cart-qty" data-id="${l.lineId}" data-d="1">+</button>
            </div>
          </div>`).join('')}
      </div>
      <div class="cart-foot">
        <div class="row-between total"><span>Total</span><b>${U.money(cartTotal())}</b></div>
        <button class="btn btn-success btn-xl btn-block" data-action="pay-open">Pay ${U.money(cartTotal())}</button>
      </div>`;
  }
  UI.on('cart-clear', () => { ui.cart = []; refreshBoth(); });
  UI.on('cart-qty', ({ id, d }) => {
    const l = ui.cart.find(x => x.lineId === id);
    if (!l) return;
    l.qty += Number(d);
    if (l.qty <= 0) ui.cart = ui.cart.filter(x => x !== l); else if (Number(d) > 0) softWarnings({ ...l, qty: 1 });
    refreshBoth();
  });

  // ---------------- checkout ----------------
  let pay = null;
  UI.on('pay-open', () => {
    if (!ui.cart.length) return;
    if (!A.canSell()) return UI.toast('Open a shift first', 'warn');
    pay = { method: 'cash', given: 0, pieces: null, makeIt: null, tip: 0, last4: '', customer: '' };
    renderPay();
  });
  const due = () => cartTotal();
  function cashNumbers() {
    const total = due();
    const deduct = pay.makeIt != null ? pay.makeIt : total;
    return { total, deduct, tip: Math.max(0, deduct - total), change: pay.given - deduct };
  }
  function changePlan(change) {
    const S = st(), sh = D.openShift(S);
    const received = pay.pieces || D.breakdown(pay.given).map;
    const avail = D.addDenoms(D.liveDrawer(S, sh), received);
    const b = D.breakdown(change, avail);
    return b.ok ? b : { map: D.breakdown(change).map, ok: false };
  }
  function cashSummaryHTML() {
    const n = cashNumbers();
    if (pay.given <= 0) return `<div class="note">Tap the notes and coins the customer hands over.</div>`;
    if (n.change < 0) return `<div class="note bad">Short by ${U.money(-n.change)}</div>`;
    const plan = n.change > 0 ? changePlan(n.change) : null;
    return `
      <div class="pay-summary">
        <div><span>Received</span><b>${U.money(pay.given)}</b><small>${D.describeDenoms(pay.pieces || D.breakdown(pay.given).map)}${pay.pieces ? '' : ' (assumed)'}</small></div>
        <div><span>Tip</span><b class="${n.tip ? 'pos' : ''}">${U.money(n.tip)}</b></div>
        <div><span>Change</span><b class="big">${U.money(n.change)}</b>${plan ? `<small class="${plan.ok ? '' : 'warn-text'}">${plan.ok ? 'Give back: ' : 'Drawer may lack coins: '}${D.describeDenoms(plan.map)}</small>` : ''}</div>
      </div>`;
  }
  function renderPay() {
    const S = st(), total = due();
    const tabs = [['cash', 'Cash'], ['paypal', 'PayPal'], ['card', 'Card']];
    let body = '';
    if (pay.method === 'cash') {
      body = `
        <div class="pieces">${D.DENOMS.filter(d => d.c >= 10).slice().reverse().map(d => `<button class="piece ${d.type}" data-action="pay-piece" data-c="${d.c}">+${d.label}</button>`).join('')}</div>
        <div class="row-gap">
          <button class="btn btn-outline" data-action="pay-exact">Exact</button>
          <button class="btn btn-ghost danger-text" data-action="pay-clear">Clear</button>
          <input type="number" inputmode="decimal" step="0.01" id="pay-given" placeholder="or type amount" value="${pay.given ? U.centsToInput(pay.given) : ''}" data-input="pay-given" class="flex1" />
        </div>
        <div class="row-gap">
          <label class="label nowrap">Make it (tip)</label>
          <input type="number" inputmode="decimal" step="0.5" id="pay-makeit" placeholder="${U.centsToInput(total)}" value="${pay.makeIt != null ? U.centsToInput(pay.makeIt) : ''}" data-input="pay-makeit" class="flex1" />
          <button class="btn btn-outline" data-action="pay-keepall">Keep all change</button>
        </div>
        <div id="pay-cash-summary">${cashSummaryHTML()}</div>
        <button class="btn btn-success btn-xl btn-block" data-action="pay-done">Complete cash payment</button>`;
    } else if (pay.method === 'paypal') {
      const url = paypalUrl(total + pay.tip);
      body = `
        <div class="qr-wrap">${url ? `<button class="qr-btn" data-action="qr-zoom">${SP.qr.toSvg(url, 220)}</button><div class="muted-text small">Tap to enlarge · ${U.esc(url)}</div>` : UI.empty('Add your PayPal.me link in Settings to show a QR code.')}</div>
        ${tipRow()}
        <button class="btn btn-primary btn-xl btn-block" data-action="pay-done">PayPal payment received</button>`;
    } else {
      body = `
        <div class="note">Charge <b>${U.money(total + pay.tip)}</b> on the card terminal, then confirm here. (Simulated — no terminal connection in the demo.)</div>
        ${tipRow()}
        <label class="label">Last 4 digits (optional)</label>
        <input id="pay-last4" inputmode="numeric" maxlength="4" value="${U.esc(pay.last4)}" data-input="pay-last4" />
        <button class="btn btn-primary btn-xl btn-block" data-action="pay-done">Approved on terminal</button>`;
    }
    UI.modal(`
      <div class="modal-head"><h3>Pay ${U.money(total)}</h3><button class="btn btn-ghost btn-sm" data-action="modal-close">Cancel</button></div>
      <div class="modal-body">
        <div class="seg">${tabs.map(([id, l]) => `<button class="seg-btn ${pay.method === id ? 'active' : ''}" data-action="pay-method" data-m="${id}">${l}</button>`).join('')}</div>
        <input id="pay-customer" placeholder="Customer name for the queue (optional)" value="${U.esc(pay.customer)}" data-input="pay-customer" />
        ${body}
      </div>`, { size: 'lg' });
  }
  const tipRow = () => `
    <label class="label">Tip</label>
    <div class="row-gap">${[0, 50, 100, 200].map(c => `<button class="btn btn-sm ${pay.tip === c ? 'btn-dark' : 'btn-outline'}" data-action="pay-tip" data-c="${c}">${c ? U.money(c) : 'No tip'}</button>`).join('')}
      <input type="number" inputmode="decimal" step="0.5" placeholder="other" class="flex1" data-input="pay-tip-other" value="${[0, 50, 100, 200].includes(pay.tip) ? '' : U.centsToInput(pay.tip)}" /></div>`;
  function paypalUrl(cents) {
    const base = (st().settings.paypalLink || '').trim().replace(/\/+$/, '');
    if (!base) return '';
    const full = /^https?:\/\//i.test(base) ? base : 'https://' + base;
    const l = full.toLowerCase();
    return (l.includes('paypal.me/') || l.includes('/paypalme/')) ? `${full}/${(cents / 100).toFixed(2)}EUR` : full;
  }
  const refreshCash = () => A.refresh('pay-cash-summary', cashSummaryHTML());
  UI.on('pay-method', ({ m }) => { pay.method = m; pay.tip = 0; renderPay(); });
  UI.on('pay-customer', (_, el) => { pay.customer = el.value; });
  UI.on('pay-last4', (_, el) => { pay.last4 = el.value.replace(/\D/g, ''); });
  UI.on('pay-piece', ({ c }) => {
    if (!pay.pieces) pay.pieces = pay.given ? D.breakdown(pay.given).map : D.emptyDenoms();
    pay.pieces[c] = (pay.pieces[c] || 0) + 1;
    pay.given = D.denomTotal(pay.pieces);
    document.getElementById('pay-given').value = U.centsToInput(pay.given);
    refreshCash();
  });
  UI.on('pay-exact', () => { pay.pieces = null; pay.given = due(); pay.makeIt = null; renderPay(); });
  UI.on('pay-clear', () => { pay.pieces = null; pay.given = 0; pay.makeIt = null; renderPay(); });
  UI.on('pay-given', (_, el) => { pay.pieces = null; pay.given = U.toCents(el.value); refreshCash(); });
  UI.on('pay-makeit', (_, el) => { pay.makeIt = el.value === '' ? null : U.toCents(el.value); refreshCash(); });
  UI.on('pay-keepall', () => {
    if (pay.given < due()) return UI.toast('Received is less than the total', 'warn');
    pay.makeIt = pay.given; renderPay();
  });
  UI.on('pay-tip', ({ c }) => { pay.tip = Number(c); renderPay(); });
  UI.on('pay-tip-other', (_, el) => { pay.tip = Math.max(0, U.toCents(el.value)); });
  UI.on('qr-zoom', () => {
    const url = paypalUrl(due() + pay.tip);
    const ov = document.createElement('div');
    ov.className = 'qr-zoom'; ov.innerHTML = `<div>${SP.qr.toSvg(url, 420)}<p>${U.money(due() + pay.tip)} · tap to close</p></div>`;
    ov.addEventListener('click', () => ov.remove());
    document.body.appendChild(ov);
  });

  UI.on('pay-done', () => {
    const S = st(), sh = D.openShift(S), ctx = A.ctx();
    if (!sh) return UI.toast('No open shift', 'error');
    const payment = { method: pay.method, customer: pay.customer };
    if (pay.method === 'cash') {
      const n = cashNumbers();
      if (pay.given <= 0 || n.change < 0) return UI.toast('Cash received is less than the amount to take', 'warn');
      if (n.deduct < n.total) return UI.toast('"Make it" cannot be less than the total', 'warn');
      payment.tip = n.tip;
      payment.cash = { givenCents: pay.given, in: pay.pieces || D.breakdown(pay.given).map, out: n.change > 0 ? changePlan(n.change).map : D.emptyDenoms(), changeCents: n.change };
    } else {
      payment.tip = pay.tip;
      if (pay.method === 'card') payment.card = { last4: pay.last4 };
    }
    const lines = ui.cart.map(({ lineId, ...l }) => l);
    UI.closeModal();
    const order = SP.store.placeOrder(lines, payment, ctx);
    ui.cart = [];
    A.render();
    showOrderNumber(order);
  });

  function showOrderNumber(o) {
    UI.modal(`
      <div class="order-done" data-action="modal-close">
        <div class="muted-text">Order</div>
        <div class="order-no">#${o.no}</div>
        <div>${o.customer ? U.esc(o.customer) + ' · ' : ''}${U.money(o.subtotal)}${o.tip ? ` + tip ${U.money(o.tip)}` : ''} · ${o.method.toUpperCase()}</div>
        ${o.method === 'cash' && o.cash.changeCents ? `<div class="change-callout">Change ${U.money(o.cash.changeCents)}: ${D.describeDenoms(o.cash.out)}</div>` : ''}
        <div class="muted-text small">Tap to continue</div>
      </div>`, { size: 'sm' });
    setTimeout(() => { const el = document.querySelector('.order-done'); if (el) UI.closeModal(); }, o.method === 'cash' && o.cash.changeCents ? 6000 : 2500);
  }

  SP.register = { gridHTML, cartHTML, refreshBoth };
})();
