/* StallPOS v2 — unit tests for the domain logic. Open tests.html to run them. */
(() => {
  const U = SP.util, D = SP.domain;
  const results = [];
  const test = (name, fn) => {
    try { fn(); results.push({ name, ok: true }); }
    catch (e) { results.push({ name, ok: false, msg: e.message }); }
  };
  const eq = (a, b, msg = '') => {
    const A = JSON.stringify(a), B = JSON.stringify(b);
    if (A !== B) throw new Error(`${msg} expected ${B}, got ${A}`);
  };

  // Fresh Grimma sample for each test (does not touch storage)
  const sample = () => SP.sample.build('4321', 'Test');
  const byName = (S, n) => S.items.find(i => i.name === n);
  const sup = (S, n) => S.supplies.find(s => s.name === n);
  const ALL = S => D.needForDays(S, S.eventDays);
  const key = s => `supply:${s.id}`;
  const ikey = it => `item:${it.id}`;

  // Minimal helpers mirroring SP.store
  const move = (S, kind, refId, qty, reason, day) => S.movements.push({ id: U.uid('mv'), ts: U.nowISO(), day, kind, refId, qty: U.qty(qty), reason, note: '', by: 'T', orderId: null });
  const sell = (S, day, lines, extra = {}) => {
    const o = { id: U.uid('o'), no: 1, day, shiftId: extra.shiftId || null, lines, subtotal: U.sum(lines, l => l.unitCents * l.qty), tip: 0, method: extra.method || 'paypal', cash: extra.cash || null, voided: false };
    S.orders.push(o);
    D.orderUse(S, o).forEach(u => move(S, u.kind, u.id, -u.qty, 'sale', day));
    return o;
  };
  const line = (it, qty, options = []) => ({ type: 'item', itemId: it.id, name: it.name, qty, unitCents: it.priceCents + U.sum(options, o => o.priceCents), options });

  // ---------------- money & dates ----------------
  test('toCents handles comma and dot', () => { eq(U.toCents('9,50'), 950); eq(U.toCents('3.5'), 350); eq(U.toCents(''), 0); });
  test('money formats cents', () => { eq(U.money(950), '€9.50'); eq(U.money(-200), '−€2.00'); });
  test('event 27 Nov – 13 Dec = 17 days, 9 weekend days', () => {
    const S = sample(); eq(S.eventDays.length, 17); eq(S.eventDays.filter(d => D.isWeekend(S, d)).length, 9);
  });

  // ---------------- the team's own numbers ----------------
  test('Sample has 7 food items and 5 packaging items, no ingredients', () => {
    const S = sample(); eq([S.items.length, S.supplies.length], [7, 5]);
    eq(S.supplies.map(s => s.name), ['500ml bowl', 'Snack bowl', 'Paper cup', 'Napkin', 'Wooden spoon']);
  });
  test('Samosa: 25 portions weekday, 60 weekend → 740 portions (1,480 pcs) for the event', () => {
    const S = sample(), it = byName(S, 'Samosa');
    eq(D.needForDays(S, ['2026-11-30'])[ikey(it)], 25);
    eq(D.needForDays(S, ['2026-11-28'])[ikey(it)], 60);
    eq(ALL(S)[ikey(it)], 740);
  });
  test('Packaging per day matches Table 6 (140/220 bowls, 75/140 snack bowls, 30/50 cups)', () => {
    const S = sample();
    const g = (d, n) => D.needForDays(S, [d])[key(sup(S, n))];
    eq([g('2026-11-30', '500ml bowl'), g('2026-11-28', '500ml bowl')], [140, 220]);
    eq([g('2026-11-30', 'Snack bowl'), g('2026-11-28', 'Snack bowl')], [75, 140]);
    eq([g('2026-11-30', 'Paper cup'), g('2026-11-28', 'Paper cup')], [30, 50]);
  });
  test('Packaging for one week = 1,220 / 720 / 270; napkins and spoons = bowls', () => {
    const S = sample(), wk = U.dayRange('2026-11-30', '2026-12-06');
    const n = D.needForDays(S, wk);
    eq([n[key(sup(S, '500ml bowl'))], n[key(sup(S, 'Snack bowl'))], n[key(sup(S, 'Paper cup'))]], [1220, 720, 270]);
    eq([n[key(sup(S, 'Napkin'))], n[key(sup(S, 'Wooden spoon'))]], [1220, 1220]);
  });

  // ---------------- opening stock ----------------
  test('Opening: first 3 days (Fri–Sun) — 300 Chicken Chilli, 180 Samosa, 660 bowls', () => {
    const S = sample(), oh = D.onHandAll(S);
    eq([oh[ikey(byName(S, 'Chicken Chilli'))], oh[ikey(byName(S, 'Samosa'))], oh[key(sup(S, '500ml bowl'))]], [300, 180, 660]);
  });

  // ---------------- consumption ----------------
  test('Chicken Chilli ×2 uses 2 portions + 2 bowls, napkins, spoons', () => {
    const S = sample(), cc = byName(S, 'Chicken Chilli'); const use = D.orderUse(S, { lines: [line(cc, 2)] });
    const g = id => (use.find(u => u.id === id) || {}).qty;
    eq([g(cc.id), g(sup(S, '500ml bowl').id), g(sup(S, 'Napkin').id), g(sup(S, 'Wooden spoon').id)], [2, 2, 2, 2]);
    eq(use.length, 4);
  });
  test('options add price only; combos take each component portion + packaging', () => {
    const S = sample(); const cc = byName(S, 'Chicken Chilli'), te = byName(S, 'Highway to Everest Tee'), sa = byName(S, 'Samosa');
    const use1 = D.orderUse(S, { lines: [line(cc, 1, [{ choiceId: 'x', name: 'Extra spicy', priceCents: 50 }])] });
    eq(use1.find(u => u.id === cc.id).qty, 1);
    const o = { lines: [{ type: 'combo', comboId: 'c1', qty: 2, unitCents: 900, picks: [{ itemId: sa.id }, { itemId: te.id }] }] };
    eq(D.orderServings(S, o), { [sa.id]: 2, [te.id]: 2 });
    const u = D.orderUse(S, o), g = id => (u.find(x => x.id === id) || {}).qty;
    eq([g(sa.id), g(te.id), g(sup(S, 'Snack bowl').id), g(sup(S, 'Paper cup').id)], [2, 2, 2, 2]);
  });
  test('canMake = portions on hand, limited by packaging', () => {
    const S = sample(), cc = byName(S, 'Chicken Chilli'), bowl = sup(S, '500ml bowl');
    eq([D.canMake(S, cc.id), D.limitedBy(S, cc.id)], [300, null]);
    move(S, 'supply', bowl.id, -655, 'count', '2026-11-27');   // only 5 bowls left
    eq([D.canMake(S, cc.id), D.limitedBy(S, cc.id).name], [5, '500ml bowl']);
  });

  // ---------------- ledger ----------------
  test('ledger: opening + received − sold − loss ± count = closing; next day opens at closing', () => {
    const S = sample(), it = byName(S, 'Samosa'), d1 = '2026-11-27';
    sell(S, d1, [line(it, 5)]);
    move(S, 'item', it.id, 20, 'restock', d1); move(S, 'item', it.id, -4, 'waste', d1); move(S, 'item', it.id, -2, 'count', d1);
    const l = D.ledger(S, 'item', it.id, d1);
    eq([l.opening, l.restock, l.sold, l.loss, l.adjust, l.closing], [180, 20, 5, 4, -2, 189]);
    eq(D.ledger(S, 'item', it.id, '2026-11-28').opening, 189);
    eq(D.ledger(S, 'supply', sup(S, 'Snack bowl').id, d1).sold, 5);
  });
  test('void on the order day nets sold to zero (food and packaging)', () => {
    const S = sample(), it = byName(S, 'Samosa'); const o = sell(S, '2026-11-27', [line(it, 4)]);
    o.voided = true; D.orderUse(S, o).forEach(u => move(S, u.kind, u.id, u.qty, 'void', o.day));
    eq([D.ledger(S, 'item', it.id, '2026-11-27').sold, D.ledger(S, 'supply', sup(S, 'Snack bowl').id, '2026-11-27').sold], [0, 0]);
  });

  // ---------------- stock cover ----------------
  test('cover on 27 Nov, 3 days: Chicken Chilli needs 370, has 300 → get 70, runs out 30 Nov', () => {
    const S = sample(), C = D.cover(S, '2026-11-27', 3), cc = byName(S, 'Chicken Chilli');
    const r = C.rows.find(x => x.id === cc.id);
    eq(C.window, ['2026-11-28', '2026-11-29', '2026-11-30']);
    eq([r.onHand, r.need, r.toGet, r.runsOut], [300, 370, 70, '2026-11-30']);
    const b = C.rows.find(x => x.id === sup(S, '500ml bowl').id);   // 220+220+220+140 = 800 − 660 = 140
    eq([b.need, b.toGet, b.runsOut], [800, 140, '2026-11-30']);
  });
  test('cover uses the sales pace (120% Chicken Chilli on day 1)', () => {
    const S = sample(), cc = byName(S, 'Chicken Chilli');
    sell(S, '2026-11-27', [line(cc, 120)]);
    const r = D.cover(S, '2026-11-28', 1).rows.find(x => x.id === cc.id);
    eq([r.onHand, r.need, r.toGet], [180, 240, 60]);   // (100 + 100) × 1.2
  });

  // ---------------- migration ----------------
  test('v2 data → v3: ingredients and central kitchen dropped, packaging and portions kept', () => {
    const old = { version: 2, settings: { restock: { coverDays: 4 } }, restockLog: [{}],
      supplies: [{ id: 'chk', name: 'Chicken', type: 'ingredient' }, { id: 'bw', name: 'Bowl', type: 'packaging', unit: 'pcs', source: 'central', lowAlert: 9 }],
      items: [{ id: 'cc', name: 'CC', stockMode: 'recipe', recipe: [{ supplyId: 'chk', qty: 0.2 }], packaging: [{ supplyId: 'bw', qty: 1 }] }],
      optionGroups: [{ choices: [{ id: 'x', recipe: [{ supplyId: 'chk', qty: 0.1 }] }] }],
      movements: [{ kind: 'supply', refId: 'chk', qty: 5, loc: 'stall' }, { kind: 'supply', refId: 'bw', qty: 100, loc: 'central' }, { kind: 'supply', refId: 'bw', qty: 50, loc: 'stall', transferId: 't' }] };
    const S = SP.store.migrateV2(old);
    eq([S.version, S.supplies.map(s => s.id), S.items[0].recipe, S.items[0].stockMode, S.settings.coverDays, S.restockLog], [3, ['bw'], undefined, undefined, 4, undefined]);
    eq([S.movements.length, S.movements[0].qty, 'loc' in S.movements[0]], [1, 50, false]);
  });

  // ---------------- drawer & pace ----------------
  test('drawer: 10×€2 + 2×€5, €3 sale paid with €5, give €2 → €5=3, €2=9', () => {
    const S = sample(); const shift = { id: 'sh1', opening: Object.assign(D.emptyDenoms(), { 200: 10, 500: 2 }) };
    const l = { ...line(byName(S, 'Samosa'), 1), unitCents: 300 };
    const cashIn = Object.assign(D.emptyDenoms(), { 500: 1 });
    const change = D.breakdown(200, D.addDenoms(D.liveDrawer(S, shift), cashIn));
    sell(S, '2026-11-27', [l], { method: 'cash', shiftId: 'sh1', cash: { in: cashIn, out: change.map } });
    const live = D.liveDrawer(S, shift); eq([live[500], live[200]], [3, 9]);
  });
  test('pace = sold ÷ plan on past event days', () => {
    const S = sample(); const cc = byName(S, 'Chicken Chilli');
    sell(S, '2026-11-27', [line(cc, 120)]);
    const p = D.pace(S, cc.id, '2026-11-28'); eq([Math.round(p.pace * 100), p.days], [120, 1]);
  });

  // ---------------- render ----------------
  const ok = results.filter(r => r.ok).length;
  document.getElementById('summary').innerHTML = `<span class="${ok === results.length ? 'pass' : 'fail'}">${ok} / ${results.length} passed</span>`;
  document.getElementById('results').innerHTML = results.map(r =>
    `<li class="${r.ok ? 'pass' : 'fail'}">${r.ok ? '✔' : '✘'} ${U.esc(r.name)}${r.ok ? '' : ` — <code>${U.esc(r.msg)}</code>`}</li>`).join('');
  window.__TEST_RESULTS__ = results;
})();
