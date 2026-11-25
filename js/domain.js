/* StallPOS v2 — domain logic. Pure functions of the state `S`, so they can be unit-tested.
   Money = integer cents. Days = 'YYYY-MM-DD'. Stock = sum of movements.
   Stock is kept for food (portions per menu item) and packaging (pieces). No ingredients. */
SP.domain = (() => {
  const U = SP.util;

  // ===================== Cash denominations (cents) =====================
  const DENOMS = [
    { c: 1, label: '1c', type: 'coin' }, { c: 2, label: '2c', type: 'coin' }, { c: 5, label: '5c', type: 'coin' },
    { c: 10, label: '10c', type: 'coin' }, { c: 20, label: '20c', type: 'coin' }, { c: 50, label: '50c', type: 'coin' },
    { c: 100, label: '€1', type: 'coin' }, { c: 200, label: '€2', type: 'coin' },
    { c: 500, label: '€5', type: 'note' }, { c: 1000, label: '€10', type: 'note' }, { c: 2000, label: '€20', type: 'note' },
    { c: 5000, label: '€50', type: 'note' }, { c: 10000, label: '€100', type: 'note' }, { c: 20000, label: '€200', type: 'note' }
  ];
  const DESC = [...DENOMS].sort((a, b) => b.c - a.c);
  const emptyDenoms = () => Object.fromEntries(DENOMS.map(d => [d.c, 0]));
  const denomTotal = m => U.sum(DENOMS, d => d.c * (Number(m && m[d.c]) || 0));
  const addDenoms = (a, b, sign = 1) => {
    const out = emptyDenoms();
    DENOMS.forEach(d => { out[d.c] = (Number(a && a[d.c]) || 0) + sign * (Number(b && b[d.c]) || 0); });
    return out;
  };
  // Largest-first split of an amount; with `available`, never uses more pieces than exist.
  function breakdown(amountCents, available = null) {
    let rem = Math.round(amountCents);
    const map = emptyDenoms();
    DESC.forEach(d => {
      if (rem <= 0) return;
      let n = Math.floor(rem / d.c);
      if (available) n = Math.min(n, Math.max(0, Number(available[d.c]) || 0));
      map[d.c] = n; rem -= n * d.c;
    });
    return { map, ok: rem === 0 };
  }
  const describeDenoms = m => {
    const parts = DESC.filter(d => (m[d.c] || 0) > 0).map(d => `${m[d.c]}× ${d.label}`);
    return parts.length ? parts.join(' + ') : 'nothing';
  };

  // ===================== Lookups =====================
  const item = (S, id) => S.items.find(i => i.id === id);
  const supply = (S, id) => S.supplies.find(s => s.id === id);
  const combo = (S, id) => S.combos.find(c => c.id === id);
  const group = (S, id) => S.optionGroups.find(g => g.id === id);
  const openShift = S => S.shifts.find(s => s.id === S.openShiftId) || null;

  // ===================== Plans / targets =====================
  const isWeekend = (S, day) => (S.settings.weekendDays || [5, 6, 0]).includes(U.weekday(day));
  const isEventDay = (S, day) => S.eventDays.includes(day);
  function targetFor(S, itemId, day) {
    const ov = S.targets.overrides[day];
    if (ov && typeof ov[itemId] === 'number') return ov[itemId];
    if (!isEventDay(S, day)) return 0;
    const t = isWeekend(S, day) ? S.targets.weekend : S.targets.weekday;
    return Number(t[itemId]) || 0;
  }

  // ===================== Orders → servings & stock use =====================
  // Servings per item for one order (used for targets and "sold").
  function orderServings(S, order) {
    const out = {};
    order.lines.forEach(l => {
      if (l.type === 'combo') (l.picks || []).forEach(p => { out[p.itemId] = (out[p.itemId] || 0) + l.qty; });
      else out[l.itemId] = (out[l.itemId] || 0) + l.qty;
    });
    return out;
  }

  // Stock use of one serving: 1 portion of the item + its packaging
  function servingUse(S, itemId) {
    const it = item(S, itemId);
    if (!it) return [];
    return [{ kind: 'item', id: it.id, qty: 1 }, ...(it.packaging || []).map(p => ({ kind: 'supply', id: p.supplyId, qty: p.qty }))];
  }

  // Total stock use of an order, merged: [{kind, id, qty}]
  function orderUse(S, order) {
    const acc = {};
    const add = (u, times) => { const k = `${u.kind}:${u.id}`; acc[k] = U.qty((acc[k] || 0) + u.qty * times); };
    order.lines.forEach(l => {
      if (l.type === 'combo') (l.picks || []).forEach(p => servingUse(S, p.itemId).forEach(u => add(u, l.qty)));
      else servingUse(S, l.itemId).forEach(u => add(u, l.qty));
    });
    return Object.entries(acc).map(([k, q]) => { const [kind, id] = k.split(':'); return { kind, id, qty: q }; });
  }

  const ordersOnDay = (S, day, withVoided = false) => S.orders.filter(o => o.day === day && (withVoided || !o.voided));

  function soldOnDay(S, day) {
    const out = {};
    ordersOnDay(S, day).forEach(o => {
      Object.entries(orderServings(S, o)).forEach(([id, q]) => { out[id] = (out[id] || 0) + q; });
    });
    return out;
  }

  // ===================== Stock (movement log) =====================
  // Two kinds of stock: food portions (kind 'item') and packaging pieces (kind 'supply').
  function onHandAll(S) {
    const out = {};
    S.movements.forEach(m => { const k = `${m.kind}:${m.refId}`; out[k] = U.qty((out[k] || 0) + m.qty); });
    return out;
  }
  const onHand = (S, kind, id, cache) => U.qty((cache || onHandAll(S))[`${kind}:${id}`] || 0);

  // Portions that can be served now: food on hand, limited by packaging
  function canMake(S, itemId, cache) {
    const it = item(S, itemId);
    if (!it) return 0;
    const oh = cache || onHandAll(S);
    const pkg = (it.packaging || []).filter(p => p.qty > 0).map(p => Math.floor(onHand(S, 'supply', p.supplyId, oh) / p.qty + 1e-9));
    return Math.min(Math.floor(onHand(S, 'item', it.id, oh) + 1e-9), ...pkg);
  }
  // The packaging that limits an item below its food portions (null when food is the limit)
  function limitedBy(S, itemId, cache) {
    const it = item(S, itemId);
    if (!it) return null;
    const oh = cache || onHandAll(S);
    const food = Math.floor(onHand(S, 'item', it.id, oh) + 1e-9);
    let best = null;
    (it.packaging || []).filter(p => p.qty > 0).forEach(p => {
      const n = Math.floor(onHand(S, 'supply', p.supplyId, oh) / p.qty + 1e-9);
      if (n < food && (!best || n < best.n)) best = { n, s: supply(S, p.supplyId) };
    });
    return best ? best.s : null;
  }

  const REASONS = {
    opening: { label: 'Opening stock', group: 'in' },
    restock: { label: 'Received / added', group: 'in' },
    sale: { label: 'Sale', group: 'sold' },
    void: { label: 'Void (returned)', group: 'sold' },
    waste: { label: 'Waste / spoiled', group: 'loss' },
    staff_meal: { label: 'Staff meal', group: 'loss' },
    given_away: { label: 'Given away', group: 'loss' },
    damaged: { label: 'Dropped / damaged', group: 'loss' },
    count: { label: 'Count correction', group: 'adjust' },
    edit: { label: 'Manual edit', group: 'adjust' }
  };
  const LOSS_REASONS = ['waste', 'staff_meal', 'given_away', 'damaged'];

  // Daily ledger: opening + received − sold − loss ± adjust = closing (sold already net of voids)
  function ledger(S, kind, id, day) {
    let before = 0;
    const d = { opening: 0, restock: 0, sold: 0, loss: 0, adjust: 0, closing: 0 };
    S.movements.forEach(m => {
      if (m.kind !== kind || m.refId !== id) return;
      if (m.day < day) { before += m.qty; return; }
      if (m.day > day) return;
      const g = (REASONS[m.reason] || {}).group;
      if (m.reason === 'opening') d.opening += m.qty;
      else if (g === 'in') d.restock += m.qty;
      else if (g === 'sold') d.sold -= m.qty;
      else if (g === 'loss') d.loss -= m.qty;
      else d.adjust += m.qty;
    });
    d.opening = U.qty(d.opening + before);
    ['restock', 'sold', 'loss', 'adjust'].forEach(k => { d[k] = U.qty(d[k]); });
    d.closing = U.qty(d.opening + d.restock - d.sold - d.loss + d.adjust);
    return d;
  }

  // Everything that is stocked, as uniform refs: food first, then packaging
  function stockRefs(S) {
    return [
      ...S.items.map(it => ({ kind: 'item', id: it.id, key: `item:${it.id}`, name: it.name, unit: 'portions', lowAlert: it.lowAlert || 0, ref: it })),
      ...S.supplies.map(s => ({ kind: 'supply', id: s.id, key: `supply:${s.id}`, name: s.name, unit: s.unit || 'pcs', lowAlert: s.lowAlert || 0, ref: s }))
    ];
  }

  // ===================== Cash drawer =====================
  function liveDrawer(S, shift) {
    if (!shift) return emptyDenoms();
    let drawer = addDenoms(emptyDenoms(), shift.opening);
    S.orders.forEach(o => {
      if (o.shiftId !== shift.id || o.voided || o.method !== 'cash' || !o.cash) return;
      drawer = addDenoms(drawer, o.cash.in, 1);
      drawer = addDenoms(drawer, o.cash.out, -1);
    });
    return drawer;
  }
  function shiftTotals(S, shift) {
    const orders = S.orders.filter(o => o.shiftId === shift.id && !o.voided);
    const by = m => orders.filter(o => o.method === m);
    return {
      orders: orders.length,
      cashSales: U.sum(by('cash'), o => o.subtotal), cashTips: U.sum(by('cash'), o => o.tip),
      paypalSales: U.sum(by('paypal'), o => o.subtotal), paypalTips: U.sum(by('paypal'), o => o.tip),
      cardSales: U.sum(by('card'), o => o.subtotal), cardTips: U.sum(by('card'), o => o.tip),
      expectedCash: denomTotal(liveDrawer(S, shift))
    };
  }

  // ===================== Planner =====================
  // Real sales ÷ plan over the last 5 event days before `day` that had sales (1 = on plan)
  function pace(S, itemId, day) {
    const past = S.eventDays.filter(d => d < day && ordersOnDay(S, d).length > 0).sort().slice(-5);
    let sold = 0, plan = 0;
    past.forEach(d => { sold += soldOnDay(S, d)[itemId] || 0; plan += targetFor(S, itemId, d); });
    if (!past.length || plan <= 0) return { pace: 1, days: 0 };
    return { pace: U.clamp(sold / plan, 0.2, 3), days: past.length };
  }

  // Servings expected on a day (today = what's left of today's plan), scaled by pace if given
  function servingsOn(S, d, today, paces) {
    const sold = d === today ? soldOnDay(S, d) : {};
    const out = {};
    S.items.forEach(it => {
      const t = targetFor(S, it.id, d);
      const left = d === today ? Math.max(0, t - (sold[it.id] || 0)) : t;
      out[it.id] = left * (paces ? paces[it.id] : 1);
    });
    return out;
  }
  // Stock needed for a servings map: { 'item:id' | 'supply:id': qty }
  function needFor(S, servings) {
    const need = {};
    const add = (k, q) => { need[k] = U.qty((need[k] || 0) + q); };
    S.items.forEach(it => {
      const n = servings[it.id] || 0;
      if (!n) return;
      add(`item:${it.id}`, n);
      (it.packaging || []).forEach(p => add(`supply:${p.supplyId}`, p.qty * n));
    });
    return need;
  }
  const addNeeds = (a, b) => { const o = { ...a }; Object.entries(b).forEach(([k, v]) => { o[k] = U.qty((o[k] || 0) + v); }); return o; };

  // Everything the plan needs over a set of days (no pace), as { key: qty }
  function needForDays(S, days) {
    return days.reduce((acc, d) => addNeeds(acc, needFor(S, servingsOn(S, d, null))), {});
  }

  // Stock cover: for every food item and packaging — on hand, need for the rest of today + the next
  // `horizon` event days at the current pace, what to get, and the day it runs out.
  function cover(S, day, horizon) {
    const oh = onHandAll(S);
    const upcoming = S.eventDays.filter(d => d > day).sort();
    const window = upcoming.slice(0, horizon);
    const paces = {}, paceDays = {};
    S.items.forEach(it => { const p = pace(S, it.id, day); paces[it.id] = p.pace; paceDays[it.id] = p.days; });
    const daily = [day, ...upcoming].map(d => ({ day: d, need: needFor(S, servingsOn(S, d, day, paces)) }));
    const inWindow = daily.slice(0, 1 + window.length);
    const rows = stockRefs(S).map(r => {
      const have = oh[r.key] || 0;
      const need = U.sum(inWindow, x => x.need[r.key] || 0);
      let cum = 0, runsOut = null;
      for (const x of daily) { cum += x.need[r.key] || 0; if (cum > have + 1e-9) { runsOut = x.day; break; } }
      const round = r.kind === 'item' ? Math.ceil : (q => Math.ceil(q / 10) * 10);
      return { ...r, onHand: have, need: Math.ceil(need - 1e-9), toGet: Math.max(0, round(need - have - 1e-9)), runsOut,
        pace: r.kind === 'item' ? paces[r.id] : null, paceDays: r.kind === 'item' ? paceDays[r.id] : null };
    });
    return { window, rows };
  }

  // ===================== Over-plan notices =====================
  function overPlan(S, day) {
    const sold = soldOnDay(S, day);
    return S.items
      .map(it => ({ item: it, sold: sold[it.id] || 0, target: targetFor(S, it.id, day) }))
      .filter(x => x.target > 0 && x.sold > x.target);
  }

  // ===================== Day stats (reports) =====================
  function dayStats(S, day) {
    const orders = ordersOnDay(S, day);
    const by = m => orders.filter(o => o.method === m);
    const sold = soldOnDay(S, day);
    const revenueByLine = {};
    orders.forEach(o => o.lines.forEach(l => {
      const key = l.type === 'combo' ? `combo:${l.comboId}` : `item:${l.itemId}`;
      revenueByLine[key] = (revenueByLine[key] || 0) + l.unitCents * l.qty;
    }));
    const tipJar = (S.tipJar || []).filter(t => t.day === day);
    return {
      orders: orders.length,
      gross: U.sum(orders, o => o.subtotal),
      cash: U.sum(by('cash'), o => o.subtotal), paypal: U.sum(by('paypal'), o => o.subtotal), card: U.sum(by('card'), o => o.subtotal),
      tipsCash: U.sum(by('cash'), o => o.tip), tipsPaypal: U.sum(by('paypal'), o => o.tip), tipsCard: U.sum(by('card'), o => o.tip),
      tipJar: U.sum(tipJar, t => t.cents),
      voided: ordersOnDay(S, day, true).filter(o => o.voided).length,
      sold, revenueByLine,
      avgOrder: orders.length ? Math.round(U.sum(orders, o => o.subtotal) / orders.length) : 0
    };
  }

  return {
    DENOMS, emptyDenoms, denomTotal, addDenoms, breakdown, describeDenoms,
    item, supply, combo, group, openShift,
    isWeekend, isEventDay, targetFor,
    orderServings, servingUse, orderUse, ordersOnDay, soldOnDay,
    onHandAll, onHand, canMake, limitedBy, REASONS, LOSS_REASONS, ledger, stockRefs,
    liveDrawer, shiftTotals, pace, servingsOn, needFor, needForDays, cover, overPlan, dayStats
  };
})();
