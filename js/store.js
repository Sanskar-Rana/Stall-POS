/* StallPOS v2 — state, persistence and actions.
   Every change goes through an action here, then SP.store.commit() saves and notifies the UI. */
SP.store = (() => {
  const U = SP.util, D = SP.domain;
  const VERSION = 3;
  let S = null;
  const listeners = [];

  function blankState() {
    return {
      version: VERSION,
      setupDone: false,
      settings: { stallName: 'My Stall', currency: '€', adminPin: '', paypalLink: '', weekendDays: [5, 6, 0], coverDays: 3 },
      eventDays: [],
      employees: [],
      items: [], optionGroups: [], combos: [], supplies: [],   // supplies = packaging only
      targets: { weekday: {}, weekend: {}, overrides: {} },
      movements: [], orders: [], shifts: [], openShiftId: null, tipJar: [],
      dayFlags: {},          // { day: { hardAllowed: { itemId: true } } }
      orderCounters: {},     // { day: lastNumber }
      lastBackupDownload: null
    };
  }

  // ---------- persistence ----------
  const saveNow = async () => {
    try { await SP.db.set('state', S); }
    catch (e) { SP.ui && SP.ui.toast('Could not save — storage may be full. Download a backup now.', 'error', 8000); }
  };
  const saveSoon = U.debounce(saveNow, 250);

  async function load() {
    const saved = await SP.db.get('state');
    const next = saved && saved.version === 2 ? migrateV2(saved) : saved;
    S = next && next.version === VERSION ? Object.assign(blankState(), next) : blankState();
    U.setCurrency(S.settings.currency);
    await autoBackup();
    return S;
  }

  // v2 → v3: ingredients and the central kitchen are gone. Keep packaging, make every item a counted item,
  // keep only stall movements for items and packaging.
  function migrateV2(old) {
    const S = JSON.parse(JSON.stringify(old));
    const keep = new Set(S.supplies.filter(s => s.type === 'packaging').map(s => s.id));
    S.supplies = S.supplies.filter(s => keep.has(s.id)).map(s => ({ id: s.id, name: s.name, unit: 'pcs', lowAlert: s.lowAlert || 0 }));
    S.items.forEach(it => { delete it.stockMode; delete it.recipe; it.packaging = (it.packaging || []).filter(p => keep.has(p.supplyId)); });
    S.optionGroups.forEach(g => g.choices.forEach(c => { delete c.recipe; }));
    S.movements = S.movements.filter(m => (m.loc || 'stall') === 'stall' && (m.kind === 'item' || keep.has(m.refId))).map(m => { const { loc, transferId, ...rest } = m; return rest; });
    S.settings.coverDays = (S.settings.restock && S.settings.restock.coverDays) || 3;
    delete S.settings.restock; delete S.restockLog;
    S.version = 3;
    return S;
  }
  // Replacing state (restore / import) also accepts v2 backups
  const upgrade = st => (st && st.version === 2 ? migrateV2(st) : st);

  // One automatic snapshot per calendar day, keep the last 7
  async function autoBackup() {
    if (!S.setupDone) return;
    const key = `backup:${U.dayStr()}`;
    const existing = await SP.db.get(key);
    if (!existing) await SP.db.set(key, { at: U.nowISO(), state: S });
    const keys = (await SP.db.keys()).filter(k => String(k).startsWith('backup:')).sort();
    for (const k of keys.slice(0, Math.max(0, keys.length - 7))) await SP.db.del(k);
  }
  async function listAutoBackups() {
    const keys = (await SP.db.keys()).filter(k => String(k).startsWith('backup:')).sort().reverse();
    const out = [];
    for (const k of keys) { const b = await SP.db.get(k); if (b) out.push({ key: k, at: b.at, orders: b.state.orders.length }); }
    return out;
  }
  async function restoreAutoBackup(key) {
    const b = await SP.db.get(key);
    if (!b) return false;
    replaceState(b.state);
    return true;
  }
  function replaceState(next) {
    S = Object.assign(blankState(), upgrade(next));
    U.setCurrency(S.settings.currency);
    commit('all');
  }

  function commit(topic = 'all') {
    saveSoon();
    listeners.forEach(fn => fn(topic));
  }
  const subscribe = fn => listeners.push(fn);
  const get = () => S;

  // ---------- movements: the ONLY way stock changes ----------
  function move(kind, refId, qty, reason, ctx, extra = {}) {
    const q = U.qty(qty);
    if (!q) return null;
    const m = { id: U.uid('mv'), ts: U.nowISO(), day: ctx.day, kind, refId, qty: q, reason, note: extra.note || '', by: ctx.by || '', orderId: extra.orderId || null };
    S.movements.push(m);
    return m;
  }

  // ---------- shifts ----------
  function beginShift({ employeeId, employeeName, day, opening }) {
    const shift = {
      id: U.uid('shift'), employeeId, employeeName, day, status: 'open',
      openedAt: U.nowISO(), opening: { ...opening }, paused: false, pausedAt: null
    };
    S.shifts.push(shift);
    S.openShiftId = shift.id;
    commit('shift');
    return shift;
  }
  function pauseShift() { const sh = D.openShift(S); if (sh && !sh.paused) { sh.paused = true; sh.pausedAt = U.nowISO(); commit('shift'); } }
  function resumeShift() { const sh = D.openShift(S); if (sh && sh.paused) { sh.paused = false; sh.pausedAt = null; commit('shift'); } }
  function closeShift(counted) {
    const sh = D.openShift(S);
    if (!sh) return null;
    const totals = D.shiftTotals(S, sh);
    Object.assign(sh, {
      status: 'closed', closedAt: U.nowISO(), paused: false,
      tracked: D.liveDrawer(S, sh), counted: { ...counted },
      expected: totals.expectedCash, countedTotal: D.denomTotal(counted),
      variance: D.denomTotal(counted) - totals.expectedCash, totals
    });
    S.openShiftId = null;
    commit('shift');
    return sh;
  }

  // ---------- orders ----------
  function nextOrderNo(day) { S.orderCounters[day] = (S.orderCounters[day] || 0) + 1; return S.orderCounters[day]; }

  // cart lines are already priced; payment = { method, tip, cash:{givenCents,in,out}, card:{last4}, customer }
  function placeOrder(lines, payment, ctx) {
    const subtotal = U.sum(lines, l => l.unitCents * l.qty);
    const order = {
      id: U.uid('ord'), no: nextOrderNo(ctx.day), day: ctx.day, shiftId: ctx.shiftId, by: ctx.by, ts: U.nowISO(),
      lines: lines.map(l => ({ ...l })), subtotal, tip: Math.max(0, Math.round(payment.tip || 0)),
      method: payment.method, cash: payment.cash || null, card: payment.card || null,
      customer: (payment.customer || '').trim(), status: 'preparing', statusAt: U.nowISO(), voided: false
    };
    S.orders.push(order);
    D.orderUse(S, order).forEach(u => move(u.kind, u.id, -u.qty, 'sale', ctx, { orderId: order.id }));
    commit('order');
    return order;
  }

  function voidOrder(orderId, reason, ctx) {
    const o = S.orders.find(x => x.id === orderId);
    if (!o || o.voided) return false;
    o.voided = true; o.voidedAt = U.nowISO(); o.voidReason = reason || ''; o.voidedBy = ctx.by;
    // Return stock on the order's own day so that day's ledger nets out
    D.orderUse(S, o).forEach(u => move(u.kind, u.id, u.qty, 'void', { ...ctx, day: o.day }, { orderId: o.id, note: `Void #${o.no}` }));
    commit('order');
    return true;
  }

  const STATUS_FLOW = ['preparing', 'ready', 'collected'];
  function advanceOrder(orderId, back = false) {
    const o = S.orders.find(x => x.id === orderId);
    if (!o || o.voided) return;
    const i = STATUS_FLOW.indexOf(o.status);
    const ni = U.clamp(i + (back ? -1 : 1), 0, STATUS_FLOW.length - 1);
    o.status = STATUS_FLOW[ni]; o.statusAt = U.nowISO();
    commit('queue');
  }

  // ---------- stock actions ----------
  // Received / added at the stall (central kitchen delivery, store purchase, …)
  function restock(kind, id, qty, note, ctx) { move(kind, id, qty, 'restock', ctx, { note }); commit('stock'); }

  // Loss of food portions (optionally with their packaging) or of packaging alone
  function logLoss(kind, id, qty, reason, note, withPackaging, ctx) {
    if (kind === 'item') {
      const it = D.item(S, id);
      if (!it) return;
      move('item', id, -qty, reason, ctx, { note });
      if (withPackaging) (it.packaging || []).forEach(p => move('supply', p.supplyId, -p.qty * qty, reason, ctx, { note: `${qty}× ${it.name}${note ? ' — ' + note : ''}` }));
    } else move('supply', id, -qty, reason, ctx, { note });
    commit('stock');
  }

  // entries: [{kind, id, counted}] — differences become 'count' movements
  function applyCount(entries, note, ctx) {
    const oh = D.onHandAll(S);
    let changed = 0;
    entries.forEach(e => {
      const diff = U.qty(e.counted - D.onHand(S, e.kind, e.id, oh));
      if (diff) { move(e.kind, e.id, diff, 'count', ctx, { note }); changed++; }
    });
    commit('stock');
    return changed;
  }

  // Set on-hand directly from an admin edit form (logged as a manual edit)
  function setOnHand(kind, id, value, ctx, note = 'Edited by admin') {
    const diff = U.qty(value - D.onHand(S, kind, id));
    if (diff) move(kind, id, diff, 'edit', ctx, { note });
    commit('stock');
  }

  function addTipJar(cents, ctx) {
    S.tipJar.push({ id: U.uid('tip'), ts: U.nowISO(), day: ctx.day, shiftId: ctx.shiftId, by: ctx.by, cents });
    commit('tips');
  }

  function allowOverLimit(day, itemId) {
    S.dayFlags[day] = S.dayFlags[day] || { hardAllowed: {} };
    S.dayFlags[day].hardAllowed[itemId] = true;
    commit('limits');
  }
  const isOverLimitAllowed = (day, itemId) => !!(S.dayFlags[day] && S.dayFlags[day].hardAllowed[itemId]);

  return {
    load, get, commit, subscribe, blankState, replaceState, saveNow, migrateV2,
    listAutoBackups, restoreAutoBackup, autoBackup,
    move, beginShift, pauseShift, resumeShift, closeShift,
    placeOrder, voidOrder, advanceOrder, STATUS_FLOW,
    restock, logLoss, applyCount, setOnHand, addTipJar, allowOverLimit, isOverLimitAllowed
  };
})();
