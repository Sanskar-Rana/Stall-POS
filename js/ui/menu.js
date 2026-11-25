/* StallPOS v2 — Admin: menu items (portions / packaging / options / hard limit), option groups, combos, packaging. */
(() => {
  const U = SP.util, D = SP.domain, UI = SP.ui, A = SP.app;
  const st = () => SP.store.get();
  let sub = 'items';
  let draft = null, draftKind = null;

  // Generic form binding: data-input="draft" data-path="a.b.0.c" data-type="cents|num|int|bool|str"
  function setPath(obj, path, value) {
    const keys = path.split('.');
    let o = obj;
    keys.slice(0, -1).forEach(k => { o = o[k]; });
    o[keys[keys.length - 1]] = value;
  }
  function readVal(el) {
    const t = el.dataset.type || 'str';
    if (t === 'bool') return el.checked;
    if (t === 'cents') return U.toCents(el.value);
    if (t === 'num') return U.qty(parseFloat(String(el.value).replace(',', '.')) || 0);
    if (t === 'int') return Math.max(0, parseInt(el.value, 10) || 0);
    return el.value;
  }
  UI.on('draft', (d, el) => { setPath(draft, d.path, readVal(el)); });
  UI.on('draft-r', (d, el) => { setPath(draft, d.path, readVal(el)); renderEditor(); }); // re-render editor (in place)

  SP.views.menu = {
    render: () => {
      const subs = [['items', 'Menu items'], ['supplies', 'Packaging'], ['options', 'Options'], ['combos', 'Combos']];
      return `<div class="seg">${subs.map(([id, l]) => `<button class="seg-btn ${sub === id ? 'active' : ''}" data-action="menu-sub" data-s="${id}">${l}</button>`).join('')}</div>
        ${sub === 'items' ? itemsHTML() : sub === 'supplies' ? suppliesHTML() : sub === 'options' ? optionsHTML() : combosHTML()}`;
    }
  };
  UI.on('menu-sub', ({ s }) => { sub = s; A.render(); });

  const supName = id => (D.supply(st(), id) || {}).name || '?';

  // ================= Items =================
  function itemsHTML() {
    const S = st();
    return `<div class="panel"><div class="row-between"><h3>Menu items</h3><button class="btn btn-primary" data-action="item-edit">+ Add item</button></div>
      <table class="table"><thead><tr><th>Item</th><th>Category</th><th class="r">Price</th><th class="r">Portions on hand</th><th>Packaging per serving</th><th>Options</th><th></th></tr></thead><tbody>
      ${S.items.map(it => `<tr>
        <td><b>${U.esc(it.name)}</b>${it.hardLimit ? ' ' + UI.badge('hard limit', 'red') : ''}</td><td>${U.esc(it.category)}</td><td class="r">${U.money(it.priceCents)}</td>
        <td class="r">${U.fmtQty(D.onHand(S, 'item', it.id))}</td>
        <td class="small">${(it.packaging || []).map(r => `${U.fmtQty(r.qty)}× ${U.esc(supName(r.supplyId))}`).join(', ') || '—'}</td>
        <td class="small">${it.optionGroupIds.map(g => U.esc((D.group(S, g) || {}).name || '')).join(', ') || '—'}</td>
        <td class="r nowrap"><button class="btn btn-outline btn-sm" data-action="item-edit" data-id="${it.id}">Edit</button>
          <button class="btn btn-ghost btn-sm danger-text" data-action="item-del" data-id="${it.id}">Delete</button></td></tr>`).join('')}
      </tbody></table></div>`;
  }
  UI.on('item-edit', ({ id }) => {
    const it = id ? D.item(st(), id) : null;
    draftKind = 'item';
    draft = it ? JSON.parse(JSON.stringify(it)) : { id: null, name: '', category: 'Mains', priceCents: 0, packaging: [], optionGroupIds: [], lowAlert: 5, hardLimit: false };
    draft._onHand = it ? D.onHand(st(), 'item', it.id) : 0;
    renderEditor();
  });
  UI.on('item-del', ({ id }) => {
    const it = D.item(st(), id);
    UI.confirmBox({ title: `Delete ${it.name}?`, message: 'Past orders and reports keep its name. Combos using it lose that choice.', confirmLabel: 'Delete', danger: true,
      onConfirm: () => { const S = st(); S.items = S.items.filter(i => i.id !== id); S.combos.forEach(c => c.slots.forEach(s => { s.itemIds = s.itemIds.filter(x => x !== id); })); SP.store.commit(); } });
  });

  function packagingEditor() {
    const sups = st().supplies;
    return `<div class="label">Packaging per serving</div>
      ${draft.packaging.map((r, i) => `<div class="row-gap">
        <select data-change="draft-r" data-path="packaging.${i}.supplyId">${sups.map(s => `<option value="${s.id}" ${s.id === r.supplyId ? 'selected' : ''}>${U.esc(s.name)}</option>`).join('')}</select>
        <input class="num-input" type="number" step="1" min="0" value="${r.qty}" data-input="draft" data-path="packaging.${i}.qty" data-type="num" />
        <span class="muted-text small nowrap">pcs / serving</span>
        <button class="btn btn-ghost btn-sm danger-text" data-action="row-del" data-i="${i}">✕</button></div>`).join('')}
      ${sups.length ? `<button class="btn btn-outline btn-sm" data-action="row-add">+ Add packaging</button>` : `<p class="muted-text small">Add packaging first under "Packaging".</p>`}`;
  }
  UI.on('row-add', () => { const s = st().supplies[0]; if (s) { draft.packaging.push({ supplyId: s.id, qty: 1 }); renderEditor(); } });
  UI.on('row-del', ({ i }) => { draft.packaging.splice(Number(i), 1); renderEditor(); });

  function itemEditor() {
    const S = st();
    return `
      <div class="modal-head"><h3>${draft.id ? 'Edit' : 'Add'} menu item</h3><button class="btn btn-ghost btn-sm" data-action="modal-close">Cancel</button></div>
      <div class="modal-body">
        <div class="grid3">
          <div><label class="label">Name</label><input value="${U.esc(draft.name)}" data-input="draft" data-path="name" /></div>
          <div><label class="label">Category</label><input value="${U.esc(draft.category)}" data-input="draft" data-path="category" /></div>
          <div><label class="label">Price</label><input type="number" step="0.1" value="${U.centsToInput(draft.priceCents)}" data-input="draft" data-path="priceCents" data-type="cents" /></div>
        </div>
        <div class="grid2">
          <div><label class="label">Portions on hand</label><input type="number" min="0" value="${draft._onHand}" data-input="draft" data-path="_onHand" data-type="num" /></div>
          <div><label class="label">Low alert (portions)</label><input type="number" min="0" value="${draft.lowAlert}" data-input="draft" data-path="lowAlert" data-type="int" /></div>
        </div>
        <label class="check"><input type="checkbox" ${draft.hardLimit ? 'checked' : ''} data-change="draft" data-path="hardLimit" data-type="bool" /> Hard limit: going over today's target needs the Admin PIN</label>
        ${packagingEditor()}
        <div class="label">Option groups</div>
        <div class="chips">${S.optionGroups.map(g => `<label class="check"><input type="checkbox" ${draft.optionGroupIds.includes(g.id) ? 'checked' : ''} data-change="item-grp" data-g="${g.id}" /> ${U.esc(g.name)} <small class="muted-text">(${g.choices.map(c => U.esc(c.name)).join(', ')})</small></label>`).join('') || '<span class="muted-text small">No option groups yet.</span>'}</div>
      </div>
      <div class="modal-foot"><button class="btn btn-primary btn-lg" data-action="item-save">Save item</button></div>`;
  }
  UI.on('item-grp', ({ g }, el) => { draft.optionGroupIds = el.checked ? [...draft.optionGroupIds, g] : draft.optionGroupIds.filter(x => x !== g); });
  UI.on('item-save', () => {
    const S = st();
    if (!draft.name.trim()) return UI.toast('Enter a name', 'warn');
    if (draft.priceCents <= 0) return UI.toast('Enter a price', 'warn');
    const { _onHand, ...clean } = draft;
    clean.name = clean.name.trim();
    if (!clean.id) {
      clean.id = U.uid('item');
      S.items.push(clean);
      S.targets.weekday[clean.id] = 0; S.targets.weekend[clean.id] = 0;
    } else Object.assign(D.item(S, clean.id), clean);
    const cur = D.onHand(S, 'item', clean.id);
    if (U.qty(_onHand) !== cur) SP.store.move('item', clean.id, _onHand - cur, cur === 0 && !S.movements.some(m => m.refId === clean.id) ? 'opening' : 'edit', A.ctx(), { note: 'Set in menu editor' });
    UI.closeModal(); SP.store.commit(); UI.toast(`Saved ${clean.name}. Set its targets in Plan.`, 'success');
  });

  // ================= Packaging =================
  function suppliesHTML() {
    const S = st(), oh = D.onHandAll(S);
    return `<div class="panel"><div class="row-between"><h3>Packaging</h3><button class="btn btn-primary" data-action="sup-edit">+ Add</button></div>
      <table class="table"><thead><tr><th>Name</th><th>Used by</th><th class="r">On hand</th><th class="r">Low alert</th><th></th></tr></thead><tbody>
      ${S.supplies.map(s => `<tr><td><b>${U.esc(s.name)}</b></td>
        <td class="small">${U.esc(S.items.filter(i => (i.packaging || []).some(p => p.supplyId === s.id)).map(i => i.name).join(', ') || '—')}</td>
        <td class="r">${U.fmtQty(D.onHand(S, 'supply', s.id, oh))} pcs</td><td class="r">${U.fmtQty(s.lowAlert)}</td>
        <td class="r nowrap"><button class="btn btn-outline btn-sm" data-action="sup-edit" data-id="${s.id}">Edit</button>
        <button class="btn btn-ghost btn-sm danger-text" data-action="sup-del" data-id="${s.id}">Delete</button></td></tr>`).join('') || '<tr><td colspan="5">No packaging yet</td></tr>'}
      </tbody></table><p class="muted-text small">Use Stock → Add for deliveries so they appear in the stock log. Editing "on hand" here is logged as a manual edit.</p></div>`;
  }
  UI.on('sup-edit', ({ id }) => {
    const s = id ? D.supply(st(), id) : null;
    draftKind = 'supply';
    draft = s ? { ...s } : { id: null, name: '', unit: 'pcs', lowAlert: 50 };
    draft._onHand = s ? D.onHand(st(), 'supply', s.id) : 0;
    renderEditor();
  });
  UI.on('sup-del', ({ id }) => {
    const S = st(), used = S.items.some(i => (i.packaging || []).some(r => r.supplyId === id));
    if (used) return UI.toast('Used by a menu item — remove it from that item first', 'warn', 5000);
    UI.confirmBox({ title: 'Delete packaging?', message: 'Its stock history stays in the log.', danger: true, confirmLabel: 'Delete',
      onConfirm: () => { S.supplies = S.supplies.filter(s => s.id !== id); SP.store.commit(); } });
  });
  function supplyEditor() {
    return `
      <div class="modal-head"><h3>${draft.id ? 'Edit' : 'Add'} packaging</h3><button class="btn btn-ghost btn-sm" data-action="modal-close">Cancel</button></div>
      <div class="modal-body">
        <label class="label">Name</label><input value="${U.esc(draft.name)}" data-input="draft" data-path="name" placeholder="e.g. 500ml bowl" />
        <div class="grid2">
          <div><label class="label">On hand (pcs)</label><input type="number" step="1" value="${draft._onHand}" data-input="draft" data-path="_onHand" data-type="num" /></div>
          <div><label class="label">Low alert (pcs)</label><input type="number" step="1" value="${draft.lowAlert}" data-input="draft" data-path="lowAlert" data-type="num" /></div>
        </div>
      </div>
      <div class="modal-foot"><button class="btn btn-primary btn-lg" data-action="sup-save">Save</button></div>`;
  }
  UI.on('sup-save', () => {
    const S = st();
    if (!draft.name.trim()) return UI.toast('Enter a name', 'warn');
    const { _onHand, ...clean } = draft;
    clean.name = clean.name.trim(); clean.unit = 'pcs';
    let isNew = false;
    if (!clean.id) { clean.id = U.uid('sup'); S.supplies.push(clean); isNew = true; } else Object.assign(D.supply(S, clean.id), clean);
    const cur = D.onHand(S, 'supply', clean.id);
    if (U.qty(_onHand) !== cur) SP.store.move('supply', clean.id, _onHand - cur, isNew ? 'opening' : 'edit', A.ctx(), { note: 'Set in packaging editor' });
    UI.closeModal(); SP.store.commit(); UI.toast('Saved', 'success');
  });

  // ================= Option groups =================
  function optionsHTML() {
    const S = st();
    return `<div class="panel"><div class="row-between"><h3>Option groups</h3><button class="btn btn-primary" data-action="grp-edit">+ Add group</button></div>
      <table class="table"><thead><tr><th>Group</th><th>Rule</th><th>Choices</th><th>Used by</th><th></th></tr></thead><tbody>
      ${S.optionGroups.map(g => `<tr><td><b>${U.esc(g.name)}</b></td><td>${g.required ? 'choose 1 (required)' : g.multi ? 'any number' : 'optional, 1'}</td>
        <td class="small">${g.choices.map(c => `${U.esc(c.name)}${c.priceCents ? ' +' + U.money(c.priceCents) : ''}`).join(' · ')}</td>
        <td class="small">${S.items.filter(i => i.optionGroupIds.includes(g.id)).map(i => U.esc(i.name)).join(', ') || '—'}</td>
        <td class="r nowrap"><button class="btn btn-outline btn-sm" data-action="grp-edit" data-id="${g.id}">Edit</button>
        <button class="btn btn-ghost btn-sm danger-text" data-action="grp-del" data-id="${g.id}">Delete</button></td></tr>`).join('')}
      </tbody></table></div>`;
  }
  UI.on('grp-edit', ({ id }) => {
    const g = id ? D.group(st(), id) : null;
    draftKind = 'group';
    draft = g ? JSON.parse(JSON.stringify(g)) : { id: null, name: '', required: false, multi: true, choices: [{ id: U.uid('ch'), name: '', priceCents: 0 }] };
    renderEditor();
  });
  UI.on('grp-del', ({ id }) => UI.confirmBox({ title: 'Delete option group?', message: 'It is removed from all items. Past orders keep their options.', danger: true, confirmLabel: 'Delete',
    onConfirm: () => { const S = st(); S.optionGroups = S.optionGroups.filter(g => g.id !== id); S.items.forEach(i => { i.optionGroupIds = i.optionGroupIds.filter(x => x !== id); }); SP.store.commit(); } }));
  function groupEditor() {
    return `
      <div class="modal-head"><h3>${draft.id ? 'Edit' : 'Add'} option group</h3><button class="btn btn-ghost btn-sm" data-action="modal-close">Cancel</button></div>
      <div class="modal-body">
        <label class="label">Group name</label><input value="${U.esc(draft.name)}" data-input="draft" data-path="name" placeholder="e.g. Spice level" />
        <div class="row-gap">
          <label class="check"><input type="checkbox" ${draft.required ? 'checked' : ''} data-change="draft-r" data-path="required" data-type="bool" /> Required (choose exactly 1)</label>
          ${draft.required ? '' : `<label class="check"><input type="checkbox" ${draft.multi ? 'checked' : ''} data-change="draft" data-path="multi" data-type="bool" /> Allow several</label>`}
        </div>
        <div class="label">Choices</div>
        ${draft.choices.map((c, i) => `<div class="row-gap">
          <input value="${U.esc(c.name)}" placeholder="Choice" data-input="draft" data-path="choices.${i}.name" class="flex1" />
          <input class="num-input" type="number" step="0.1" value="${U.centsToInput(c.priceCents)}" data-input="draft" data-path="choices.${i}.priceCents" data-type="cents" title="Extra price" />
          <span class="small muted-text nowrap">extra price</span>
          <button class="btn btn-ghost btn-sm danger-text" data-action="ch-del" data-i="${i}">✕</button></div>`).join('')}
        <button class="btn btn-outline btn-sm" data-action="ch-add">+ Add choice</button>
      </div>
      <div class="modal-foot"><button class="btn btn-primary btn-lg" data-action="grp-save">Save group</button></div>`;
  }
  UI.on('ch-add', () => { draft.choices.push({ id: U.uid('ch'), name: '', priceCents: 0 }); renderEditor(); });
  UI.on('ch-del', ({ i }) => { draft.choices.splice(Number(i), 1); renderEditor(); });
  UI.on('grp-save', () => {
    const S = st();
    draft.choices = draft.choices.filter(c => c.name.trim());
    if (!draft.name.trim() || !draft.choices.length) return UI.toast('Enter a name and at least one choice', 'warn');
    if (draft.required) draft.multi = false;
    if (!draft.id) { draft.id = U.uid('grp'); S.optionGroups.push(draft); } else Object.assign(D.group(S, draft.id), draft);
    UI.closeModal(); SP.store.commit(); UI.toast('Option group saved — tick it on menu items to use it', 'success');
  });

  // ================= Combos =================
  function combosHTML() {
    const S = st();
    return `<div class="panel"><div class="row-between"><h3>Combos</h3><button class="btn btn-primary" data-action="combo-edit">+ Add combo</button></div>
      <table class="table"><thead><tr><th>Combo</th><th class="r">Price</th><th>Slots</th><th class="r">Separately</th><th></th></tr></thead><tbody>
      ${S.combos.map(c => {
        const sep = U.sum(c.slots, s => Math.min(...s.itemIds.map(id => (D.item(S, id) || {}).priceCents || 0)));
        return `<tr><td><b>${U.esc(c.name)}</b></td><td class="r">${U.money(c.priceCents)}</td>
        <td class="small">${c.slots.map(s => `${U.esc(s.label)}: ${s.itemIds.map(id => U.esc((D.item(S, id) || {}).name || '?')).join(' / ')}`).join(' · ')}</td>
        <td class="r small">from ${U.money(sep)}</td>
        <td class="r nowrap"><button class="btn btn-outline btn-sm" data-action="combo-edit" data-id="${c.id}">Edit</button>
        <button class="btn btn-ghost btn-sm danger-text" data-action="combo-del" data-id="${c.id}">Delete</button></td></tr>`; }).join('')}
      </tbody></table></div>`;
  }
  UI.on('combo-edit', ({ id }) => {
    const c = id ? D.combo(st(), id) : null;
    draftKind = 'combo';
    draft = c ? JSON.parse(JSON.stringify(c)) : { id: null, name: '', priceCents: 0, slots: [{ label: 'Main', itemIds: [] }, { label: 'Drink', itemIds: [] }] };
    renderEditor();
  });
  UI.on('combo-del', ({ id }) => UI.confirmBox({ title: 'Delete combo?', message: 'Past orders keep it.', danger: true, confirmLabel: 'Delete',
    onConfirm: () => { const S = st(); S.combos = S.combos.filter(c => c.id !== id); SP.store.commit(); } }));
  function comboEditor() {
    const S = st();
    return `
      <div class="modal-head"><h3>${draft.id ? 'Edit' : 'Add'} combo</h3><button class="btn btn-ghost btn-sm" data-action="modal-close">Cancel</button></div>
      <div class="modal-body">
        <div class="grid2"><div><label class="label">Name</label><input value="${U.esc(draft.name)}" data-input="draft" data-path="name" /></div>
          <div><label class="label">Combo price</label><input type="number" step="0.1" value="${U.centsToInput(draft.priceCents)}" data-input="draft" data-path="priceCents" data-type="cents" /></div></div>
        ${draft.slots.map((s, i) => `<div class="slot"><div class="row-gap"><input value="${U.esc(s.label)}" data-input="draft" data-path="slots.${i}.label" class="flex1" placeholder="Slot name" />
          <button class="btn btn-ghost btn-sm danger-text" data-action="slot-del" data-i="${i}">Remove slot</button></div>
          <div class="chips">${S.items.map(it => `<label class="check"><input type="checkbox" ${s.itemIds.includes(it.id) ? 'checked' : ''} data-change="slot-item" data-i="${i}" data-id="${it.id}" /> ${U.esc(it.name)}</label>`).join('')}</div></div>`).join('')}
        <button class="btn btn-outline btn-sm" data-action="slot-add">+ Add slot</button>
      </div>
      <div class="modal-foot"><button class="btn btn-primary btn-lg" data-action="combo-save">Save combo</button></div>`;
  }
  UI.on('slot-add', () => { draft.slots.push({ label: 'Extra', itemIds: [] }); renderEditor(); });
  UI.on('slot-del', ({ i }) => { draft.slots.splice(Number(i), 1); renderEditor(); });
  UI.on('slot-item', ({ i, id }, el) => { const s = draft.slots[Number(i)]; s.itemIds = el.checked ? [...s.itemIds, id] : s.itemIds.filter(x => x !== id); });
  UI.on('combo-save', () => {
    const S = st();
    if (!draft.name.trim() || draft.priceCents <= 0) return UI.toast('Enter a name and price', 'warn');
    if (!draft.slots.length || draft.slots.some(s => !s.itemIds.length)) return UI.toast('Every slot needs at least one item', 'warn');
    if (!draft.id) { draft.id = U.uid('combo'); S.combos.push(draft); } else Object.assign(D.combo(S, draft.id), draft);
    UI.closeModal(); SP.store.commit(); UI.toast('Combo saved', 'success');
  });

  function renderEditor() {
    const html = draftKind === 'item' ? itemEditor() : draftKind === 'supply' ? supplyEditor() : draftKind === 'group' ? groupEditor() : comboEditor();
    UI.modal(html, { size: 'lg', closable: false });
  }
})();
