/* StallPOS v2 — sample event: Grimma, 17 days, 27 Nov – 13 Dec 2026.
   From "Grimma Updated.pdf" and "Food Requirement.pdf". Stock is kept for food (portions) and packaging only;
   ingredients and the central kitchen are tracked on the paper sheets. */
SP.sample = (() => {
  const U = SP.util;

  function build(adminPin, stallName) {
    const S = SP.store.blankState();
    S.settings.stallName = stallName || 'Momo & More — Grimma';
    S.settings.adminPin = adminPin;
    S.settings.coverDays = 3;
    S.eventDays = U.dayRange('2026-11-27', '2026-12-13');
    S.employees = [{ id: U.uid('emp'), name: 'Cashier 1', pin: '1111' }];

    // ---- Packaging ----
    const pkg = (name, lowAlert) => { const s = { id: U.uid('sup'), name, unit: 'pcs', lowAlert }; S.supplies.push(s); return s; };
    const bowl = pkg('500ml bowl', 150);
    const snackBowl = pkg('Snack bowl', 100);
    const cup = pkg('Paper cup', 40);
    const napkin = pkg('Napkin', 150);
    const spoon = pkg('Wooden spoon', 150);
    const p = (s, qty = 1) => ({ supplyId: s.id, qty });
    const bowlServe = [p(bowl), p(napkin), p(spoon)];

    // ---- Menu (prices + targets from Grimma Updated.pdf) ----
    const mk = (name, category, price, packaging, weekday, weekend, lowAlert) => {
      const it = { id: U.uid('item'), name, category, priceCents: U.toCents(price), packaging, optionGroupIds: [], lowAlert, hardLimit: false };
      S.items.push(it);
      S.targets.weekday[it.id] = weekday;
      S.targets.weekend[it.id] = weekend;
      return it;
    };
    mk('Chicken Chilli', 'Mains', 9.50, bowlServe, 70, 100, 15);
    mk('Meat Jhol Momo', 'Mains', 8.50, bowlServe, 25, 40, 8);
    mk('Veg Jhol Momo', 'Mains', 8.50, bowlServe, 15, 20, 5);
    mk('Rajma Bowl', 'Mains', 7.00, bowlServe, 30, 60, 8);
    mk('Samosa', 'Snacks', 6.50, [p(snackBowl)], 25, 60, 10);
    mk('Potato Wedges', 'Snacks', 5.50, [p(snackBowl)], 50, 80, 12);
    mk('Highway to Everest Tee', 'Drinks', 3.50, [p(cup)], 30, 50, 8);

    // ---- Opening stock: the first 3 days of portions and packaging ----
    const D = SP.domain;
    const need = D.needForDays(S, S.eventDays.slice(0, S.settings.coverDays));
    const ctx = { day: S.eventDays[0], by: 'Setup' };
    D.stockRefs(S).forEach(r => {
      const q = r.kind === 'supply' ? Math.ceil((need[r.key] || 0) / 10) * 10 : Math.ceil(need[r.key] || 0);
      if (q) S.movements.push({ id: U.uid('mv'), ts: U.nowISO(), day: ctx.day, kind: r.kind, refId: r.id, qty: q, reason: 'opening', note: 'Opening load (first 3 days)', by: ctx.by, orderId: null });
    });

    S.setupDone = true;
    return S;
  }

  return { build };
})();
