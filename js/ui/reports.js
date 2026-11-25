/* StallPOS v2 — end-of-day report: sales, tips, items vs plan, combos & options, stock ledger, waste, shifts. CSV + print. */
(() => {
  const U = SP.util, D = SP.domain, UI = SP.ui, A = SP.app;
  const st = () => SP.store.get();

  function data(day) {
    const S = st(), s = D.dayStats(S, day);
    const items = S.items.map(it => {
      const sold = s.sold[it.id] || 0, target = D.targetFor(S, it.id, day);
      return { it, sold, target, diff: sold - target, revenue: s.revenueByLine[`item:${it.id}`] || 0 };
    });
    const combos = S.combos.map(c => ({ c, qty: U.sum(D.ordersOnDay(S, day), o => U.sum(o.lines.filter(l => l.comboId === c.id), l => l.qty)), revenue: s.revenueByLine[`combo:${c.id}`] || 0 })).filter(x => x.qty);
    const optionCounts = {};
    D.ordersOnDay(S, day).forEach(o => o.lines.forEach(l => (l.options || []).forEach(op => {
      const k = op.name; optionCounts[k] = optionCounts[k] || { qty: 0, revenue: 0 };
      optionCounts[k].qty += l.qty; optionCounts[k].revenue += op.priceCents * l.qty;
    })));
    const losses = S.movements.filter(m => m.day === day && D.LOSS_REASONS.includes(m.reason));
    const ledgerRows = D.stockRefs(S).map(r => ({ name: r.name, unit: r.unit, l: D.ledger(S, r.kind, r.id, day) }));
    const shifts = S.shifts.filter(x => x.day === day);
    return { S, s, items, combos, optionCounts, losses, ledgerRows, shifts };
  }

  SP.views.reports = {
    render: () => {
      const day = A.currentDay();
      const { S, s, items, combos, optionCounts, losses, ledgerRows, shifts } = data(day);
      const f = v => U.fmtQty(v);
      return `
        <div class="row-between wrap no-print">
          <h2>End of day · ${U.fmtDayLong(day)}</h2>
          <div class="row-gap"><button class="btn btn-success" data-action="rep-csv">Download CSV</button><button class="btn btn-outline" data-action="rep-print">Print / PDF</button></div>
        </div>
        <p class="muted-text small no-print">Change the day in the header (Admin, with no shift open).</p>
        <div id="print-area">
          <h2 class="print-only">${U.esc(S.settings.stallName)} — ${U.fmtDayLong(day)}</h2>
          <div class="stats4">
            <div class="stat"><span>Sales</span><b>${U.money(s.gross)}</b><small>${s.orders} orders · avg ${U.money(s.avgOrder)}</small></div>
            <div class="stat"><span>Cash / PayPal / Card</span><b class="small-b">${U.money(s.cash)} · ${U.money(s.paypal)} · ${U.money(s.card)}</b></div>
            <div class="stat"><span>Tips</span><b>${U.money(s.tipsCash + s.tipsPaypal + s.tipsCard + s.tipJar)}</b><small>cash ${U.money(s.tipsCash)} · PayPal ${U.money(s.tipsPaypal)} · card ${U.money(s.tipsCard)} · jar ${U.money(s.tipJar)}</small></div>
            <div class="stat"><span>Voided</span><b>${s.voided}</b><small>not in totals</small></div>
          </div>
          <div class="panel"><h3>Items vs plan</h3><table class="table"><thead><tr><th>Item</th><th class="r">Sold</th><th class="r">Plan</th><th class="r">±</th><th class="r">Revenue (single)</th></tr></thead><tbody>
            ${items.map(x => `<tr><td>${U.esc(x.it.name)}</td><td class="r"><b>${x.sold}</b></td><td class="r">${x.target}</td><td class="r ${x.diff > 0 ? 'neg' : x.diff < 0 ? 'blue' : ''}">${x.target ? (x.diff > 0 ? '+' : '') + x.diff : '—'}</td><td class="r">${U.money(x.revenue)}</td></tr>`).join('')}
          </tbody></table><p class="muted-text small">"Sold" includes portions sold inside combos. Revenue here is from single-item sales; combo revenue is below.</p></div>
          <div class="grid2">
            <div class="panel"><h3>Combos</h3>${combos.length ? `<table class="table"><tbody>${combos.map(x => `<tr><td>${U.esc(x.c.name)}</td><td class="r">${x.qty}×</td><td class="r">${U.money(x.revenue)}</td></tr>`).join('')}</tbody></table>` : UI.empty('None sold')}</div>
            <div class="panel"><h3>Options chosen</h3>${Object.keys(optionCounts).length ? `<table class="table"><tbody>${Object.entries(optionCounts).map(([n, v]) => `<tr><td>${U.esc(n)}</td><td class="r">${v.qty}×</td><td class="r">${v.revenue ? U.money(v.revenue) : ''}</td></tr>`).join('')}</tbody></table>` : UI.empty('None')}</div>
          </div>
          <div class="panel"><h3>Stock ledger (food portions · packaging pcs)</h3><table class="table"><thead><tr><th></th><th class="r">Opening</th><th class="r">Received</th><th class="r">Sold</th><th class="r">Waste</th><th class="r">Count/edit</th><th class="r">Closing</th></tr></thead><tbody>
            ${ledgerRows.map(r => `<tr><td>${U.esc(r.name)}</td><td class="r">${f(r.l.opening, r.unit)}</td><td class="r">${f(r.l.restock, r.unit)}</td><td class="r">${f(r.l.sold, r.unit)}</td><td class="r ${r.l.loss ? 'neg' : ''}">${f(r.l.loss, r.unit)}</td><td class="r">${f(r.l.adjust, r.unit)}</td><td class="r"><b>${f(r.l.closing, r.unit)}</b></td></tr>`).join('')}
          </tbody></table></div>
          <div class="grid2">
            <div class="panel"><h3>Waste &amp; loss</h3>${losses.length ? `<table class="table"><tbody>${losses.map(m => {
              const ref = m.kind === 'item' ? D.item(S, m.refId) : D.supply(S, m.refId);
              return `<tr><td>${U.esc(ref ? ref.name : '?')}</td><td class="r neg">${`${U.fmtQty(m.qty)} ${m.kind === 'item' ? 'portions' : 'pcs'}`}</td><td>${U.esc(D.REASONS[m.reason].label)}</td><td class="muted-text small">${U.esc(m.note)}</td></tr>`; }).join('')}</tbody></table>` : UI.empty('No waste logged')}</div>
            <div class="panel"><h3>Shifts</h3>${shifts.length ? `<table class="table"><tbody>${shifts.map(x => `<tr><td>${U.esc(x.employeeName)}</td><td>${U.fmtTime(x.openedAt)}–${x.closedAt ? U.fmtTime(x.closedAt) : 'open'}</td><td class="r">${x.status === 'closed' ? (x.variance === 0 ? 'balanced' : (x.variance > 0 ? '+' : '') + U.money(x.variance)) : ''}</td></tr>`).join('')}</tbody></table>` : UI.empty('No shifts')}</div>
          </div>
        </div>`;
    }
  };

  UI.on('rep-print', () => window.print());
  UI.on('rep-csv', () => {
    const day = A.currentDay();
    const { S, s, items, combos, optionCounts, losses, ledgerRows, shifts } = data(day);
    const m = c => (c / 100).toFixed(2);
    const rows = [
      ['StallPOS end-of-day report'], ['Stall', S.settings.stallName], ['Day', day], ['Generated', U.nowISO()], [],
      ['SUMMARY'], ['Orders', s.orders], ['Sales', m(s.gross)], ['Cash', m(s.cash)], ['PayPal', m(s.paypal)], ['Card', m(s.card)],
      ['Tips_cash', m(s.tipsCash)], ['Tips_paypal', m(s.tipsPaypal)], ['Tips_card', m(s.tipsCard)], ['Tip_jar', m(s.tipJar)], ['Voided_orders', s.voided], [],
      ['ITEMS'], ['Item', 'Sold', 'Plan', 'Diff', 'Revenue_single'], ...items.map(x => [x.it.name, x.sold, x.target, x.diff, m(x.revenue)]), [],
      ['COMBOS'], ['Combo', 'Qty', 'Revenue'], ...combos.map(x => [x.c.name, x.qty, m(x.revenue)]), [],
      ['OPTIONS'], ['Option', 'Qty', 'Revenue'], ...Object.entries(optionCounts).map(([n, v]) => [n, v.qty, m(v.revenue)]), [],
      ['STOCK LEDGER'], ['Name', 'Unit', 'Opening', 'Received', 'Sold', 'Waste', 'Count_edit', 'Closing'],
      ...ledgerRows.map(r => [r.name, r.unit, r.l.opening, r.l.restock, r.l.sold, r.l.loss, r.l.adjust, r.l.closing]), [],
      ['WASTE'], ['Time', 'Name', 'Qty', 'Reason', 'Note', 'By'],
      ...losses.map(x => [x.ts, ((x.kind === 'item' ? D.item(S, x.refId) : D.supply(S, x.refId)) || {}).name, x.qty, D.REASONS[x.reason].label, x.note, x.by]), [],
      ['SHIFTS'], ['Employee', 'Opened', 'Closed', 'Expected', 'Counted', 'Variance'],
      ...shifts.map(x => [x.employeeName, x.openedAt, x.closedAt || '', m(x.expected || 0), m(x.countedTotal || 0), m(x.variance || 0)]), [],
      ['ORDERS'], ['No', 'Time', 'By', 'Method', 'Lines', 'Subtotal', 'Tip', 'Voided'],
      ...D.ordersOnDay(S, day, true).map(o => [o.no, o.ts, o.by, o.method, o.lines.map(l => `${l.qty}x ${l.name}${(l.options || []).length ? ' (' + l.options.map(x => x.name).join(', ') + ')' : ''}${l.picks ? ' [' + l.picks.map(p => p.name).join(' + ') + ']' : ''}`).join('; '), m(o.subtotal), m(o.tip), o.voided ? 'yes' : 'no'])
    ];
    U.download(`StallPOS_EOD_${day}.csv`, U.toCSV(rows), 'text/csv;charset=utf-8');
    UI.toast('Report downloaded', 'success');
  });
})();
