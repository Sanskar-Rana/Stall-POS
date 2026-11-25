/* StallPOS v2 — planning: over-plan notices, stock cover (food portions + packaging),
   whole-event totals, targets & event days. */
(() => {
  const U = SP.util, D = SP.domain, UI = SP.ui, A = SP.app;
  const st = () => SP.store.get();
  let overrideDay = null;
  const WD = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['0', 'Sun']];

  SP.views.plan = {
    render: () => {
      const S = st(), day = A.currentDay();
      const over = D.overPlan(S, day);
      return `
        ${over.length ? `<div class="panel warn-panel"><h3>Over today's plan (${U.fmtDay(day)})</h3>
          <div class="chips">${over.map(x => `<span class="chip warn">${U.esc(x.item.name)}: ${x.sold} / ${x.target} (+${x.sold - x.target})</span>`).join('')}</div>
          <p class="muted-text small">These are selling into stock planned for other days — the stock cover below already uses the faster pace.</p></div>` : ''}
        <div id="plan-cover">${coverHTML()}</div>
        ${eventTotalsHTML()}
        ${targetsHTML()}
        ${eventDaysHTML()}`;
    }
  };

  // ---------------- Stock cover ----------------
  function coverHTML() {
    const S = st(), day = A.currentDay(), n = S.settings.coverDays || 3, C = D.cover(S, day, n);
    const lastDay = S.eventDays[S.eventDays.length - 1];
    const paceTag = r => r.paceDays ? `<b class="${r.pace > 1.05 ? 'neg' : r.pace < 0.95 ? 'blue' : 'pos'}">${Math.round(r.pace * 100)}%</b>` : '<small class="muted-text">—</small>';
    const runs = r => r.runsOut ? UI.badge(U.fmtDay(r.runsOut), r.runsOut <= (C.window[0] || day) ? 'red' : 'warn') : UI.badge(lastDay ? `lasts to ${U.fmtDay(lastDay)}` : 'ok', 'ok');
    const row = r => `<tr><td><b>${U.esc(r.name)}</b></td>${r.kind === 'item' ? `<td class="r">${paceTag(r)}</td>` : ''}
      <td class="r">${U.fmtQty(r.onHand)}</td><td class="r">${r.need}</td>
      <td class="r">${r.toGet ? `<b class="neg">${r.toGet}</b>` : '<span class="pos">covered</span>'}</td><td>${runs(r)}</td></tr>`;
    const until = C.window.length ? C.window[C.window.length - 1] : day;
    return `
      <div class="panel">
        <div class="row-between wrap">
          <div><h3>Stock cover</h3>
            <p class="muted-text small">What the stall needs for the rest of today plus the next <b>${n} event day${n > 1 ? 's' : ''}</b> (until ${U.fmtDay(until)}), at the real sales pace once there are sales. "To get" = need − on hand (packaging rounded to 10).</p></div>
          <div class="row-gap"><label class="label nowrap">Cover</label>
            <select class="inline-select" data-change="cover-days">${[1, 2, 3, 4, 5, 7].map(x => `<option value="${x}" ${x === n ? 'selected' : ''}>${x} day${x > 1 ? 's' : ''}</option>`).join('')}</select></div>
        </div>
        <h4>Food (portions)</h4>
        <table class="table"><thead><tr><th>Item</th><th class="r">Pace</th><th class="r">On hand</th><th class="r">Need</th><th class="r">To get</th><th>Runs out</th></tr></thead>
          <tbody>${C.rows.filter(r => r.kind === 'item').map(row).join('')}</tbody></table>
        <h4>Packaging (pcs)</h4>
        <table class="table"><thead><tr><th>Item</th><th class="r">On hand</th><th class="r">Need</th><th class="r">To get</th><th>Runs out</th></tr></thead>
          <tbody>${C.rows.filter(r => r.kind === 'supply').map(row).join('')}</tbody></table>
        <p class="muted-text small">Pace = real sales ÷ plan on the last 5 event days. "Runs out" = first day the stall would be short with what it has now.</p>
      </div>`;
  }
  UI.on('cover-days', (_, el) => { st().settings.coverDays = Number(el.value) || 3; SP.store.commit(); });

  // ---------------- Whole event totals ----------------
  function eventTotalsHTML() {
    const S = st(), today = A.currentDay();
    const all = D.needForDays(S, S.eventDays), rest = D.needForDays(S, S.eventDays.filter(d => d >= today));
    const row = r => `<tr><td><b>${U.esc(r.name)}</b></td><td class="r">${U.fmtQty(all[r.key] || 0)}</td><td class="r">${U.fmtQty(rest[r.key] || 0)}</td></tr>`;
    const refs = D.stockRefs(S);
    return `
      <div class="panel"><h3>Whole event — ${S.eventDays.length} days${S.eventDays.length ? ` (${U.fmtDay(S.eventDays[0])} – ${U.fmtDay(S.eventDays[S.eventDays.length - 1])})` : ''}</h3>
        <p class="muted-text small">From the daily targets (no pace).</p>
        <table class="table"><thead><tr><th></th><th class="r">Whole event</th><th class="r">From ${U.fmtDay(today)}</th></tr></thead><tbody>
          <tr><td colspan="3" class="label">Food (portions)</td></tr>${refs.filter(r => r.kind === 'item').map(row).join('')}
          <tr><td colspan="3" class="label">Packaging (pcs)</td></tr>${refs.filter(r => r.kind === 'supply').map(row).join('')}
        </tbody></table></div>`;
  }

  // ---------------- Targets ----------------
  function targetsHTML() {
    const S = st();
    if (!overrideDay || !S.eventDays.includes(overrideDay)) overrideDay = S.eventDays.includes(A.currentDay()) ? A.currentDay() : S.eventDays[0];
    const ov = (overrideDay && S.targets.overrides[overrideDay]) || {};
    const weekendLabel = WD.filter(([n]) => (S.settings.weekendDays || []).includes(Number(n))).map(x => x[1]).join(', ') || 'none';
    const totals = it => U.sum(S.eventDays, d => D.targetFor(S, it.id, d));
    return `
      <div class="panel">
        <h3>Daily targets (portions)</h3>
        <p class="muted-text small">Weekday and weekend templates fill every event day (weekend = ${weekendLabel}). Override a single day where needed. Targets warn, they don't block — unless an item has a hard limit (Menu).</p>
        <table class="table"><thead><tr><th>Item</th><th class="r">Weekday</th><th class="r">Weekend</th>
          <th class="r">Override: <select data-change="ov-day" class="inline-select">${S.eventDays.map(d => `<option value="${d}" ${d === overrideDay ? 'selected' : ''}>${U.fmtDay(d)}</option>`).join('')}</select></th>
          <th class="r">Event total</th></tr></thead><tbody>
          ${S.items.map(it => `<tr><td><b>${U.esc(it.name)}</b></td>
            <td class="r"><input class="num-input" type="number" min="0" value="${S.targets.weekday[it.id] || 0}" data-change="tgt" data-t="weekday" data-id="${it.id}" /></td>
            <td class="r"><input class="num-input" type="number" min="0" value="${S.targets.weekend[it.id] || 0}" data-change="tgt" data-t="weekend" data-id="${it.id}" /></td>
            <td class="r"><input class="num-input" type="number" min="0" placeholder="${D.isWeekend(S, overrideDay) ? (S.targets.weekend[it.id] || 0) : (S.targets.weekday[it.id] || 0)}" value="${typeof ov[it.id] === 'number' ? ov[it.id] : ''}" data-change="tgt" data-t="override" data-id="${it.id}" /></td>
            <td class="r" id="tt-${it.id}">${totals(it)}</td></tr>`).join('')}
        </tbody></table>
        <div class="row-gap"><span class="label">Weekend days:</span>${WD.map(([n, l]) => `<label class="check"><input type="checkbox" ${(S.settings.weekendDays || []).includes(Number(n)) ? 'checked' : ''} data-change="wk-day" data-n="${n}" /> ${l}</label>`).join('')}</div>
      </div>`;
  }
  UI.on('ov-day', (_, el) => { overrideDay = el.value; A.render(); });
  UI.on('tgt', ({ t, id }, el) => {
    const S = st();
    if (t === 'override') {
      S.targets.overrides[overrideDay] = S.targets.overrides[overrideDay] || {};
      if (el.value === '') delete S.targets.overrides[overrideDay][id];
      else S.targets.overrides[overrideDay][id] = Math.max(0, parseInt(el.value, 10) || 0);
    } else S.targets[t][id] = Math.max(0, parseInt(el.value, 10) || 0);
    SP.store.commit('quiet');   // save without redrawing, so focus stays in the table
    const it = D.item(S, id);
    A.refresh(`tt-${id}`, String(U.sum(S.eventDays, d => D.targetFor(S, it.id, d))));
    A.refresh('plan-cover', coverHTML());
  });
  UI.on('wk-day', ({ n }, el) => {
    const S = st(), v = Number(n);
    S.settings.weekendDays = el.checked ? [...new Set([...(S.settings.weekendDays || []), v])] : (S.settings.weekendDays || []).filter(x => x !== v);
    SP.store.commit();
  });

  // ---------------- Event days ----------------
  function eventDaysHTML() {
    const S = st();
    const first = S.eventDays[0], last = S.eventDays[S.eventDays.length - 1];
    return `
      <div class="panel">
        <h3>Event days (${S.eventDays.length})</h3>
        <div class="row-gap wrap">
          <label class="label">From</label><input type="date" id="ev-from" value="${first || U.dayStr()}" />
          <label class="label">To</label><input type="date" id="ev-to" value="${last || U.dayStr()}" />
          <button class="btn btn-outline" data-action="ev-range">Set range</button>
        </div>
        <p class="muted-text small">Tap a day to remove it (e.g. a closed day). Add a single day with the date picker.</p>
        <div class="chips">${S.eventDays.map(d => `<button class="chip ${D.isWeekend(S, d) ? 'weekend' : ''}" data-action="ev-toggle" data-d="${d}">${U.fmtDay(d)} ✕</button>`).join('')}</div>
        <div class="row-gap"><input type="date" id="ev-add" /><button class="btn btn-outline btn-sm" data-action="ev-add">Add day</button></div>
      </div>`;
  }
  UI.on('ev-range', () => {
    const a = document.getElementById('ev-from').value, b = document.getElementById('ev-to').value;
    if (!a || !b || a > b) return UI.toast('Choose a valid range', 'warn');
    const days = U.dayRange(a, b);
    if (days.length > 60) return UI.toast('Maximum 60 days', 'warn');
    st().eventDays = days; SP.store.commit();
  });
  UI.on('ev-toggle', ({ d }) => { const S = st(); S.eventDays = S.eventDays.filter(x => x !== d); SP.store.commit(); });
  UI.on('ev-add', () => {
    const v = document.getElementById('ev-add').value; if (!v) return;
    const S = st(); S.eventDays = [...new Set([...S.eventDays, v])].sort(); SP.store.commit();
  });
})();
