/* StallPOS v2 — UI building blocks: actions, modal (updates in place), toasts, PIN pad, coin counter. */
SP.ui = (() => {
  const U = SP.util, D = SP.domain;

  // ---------- Action registry: elements use data-action="name" (+ data-* args) ----------
  const actions = {};
  const on = (name, fn) => { actions[name] = fn; };
  function dispatch(e, attr) {
    const el = e.target.closest(`[${attr}]`);
    if (!el) return;
    const fn = actions[el.getAttribute(attr)];
    if (fn) fn(el.dataset, el, e);
  }
  document.addEventListener('click', e => dispatch(e, 'data-action'));
  document.addEventListener('input', e => dispatch(e, 'data-input'));
  document.addEventListener('change', e => dispatch(e, 'data-change'));
  document.addEventListener('keydown', e => { if (e.key === 'Enter') dispatch(e, 'data-enter'); });

  // ---------- Toasts ----------
  function toast(msg, type = 'info', ms = 3200) {
    const box = document.getElementById('toasts');
    if (!box) return;
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 250); }, ms);
  }

  // ---------- Modal: if one is open, swap its content in place (no flicker) ----------
  let modalOnClose = null;
  function modal(html, { size = 'md', closable = true, onClose = null } = {}) {
    const root = document.getElementById('modal-root');
    modalOnClose = onClose;
    let back = document.getElementById('modal-back');
    if (!back) {
      root.innerHTML = `<div id="modal-back" class="modal-back"><div class="modal-card"></div></div>`;
      back = document.getElementById('modal-back');
      back.addEventListener('click', e => { if (e.target === back && back.dataset.closable === '1') closeModal(); });
    }
    back.dataset.closable = closable ? '1' : '0';
    const card = back.querySelector('.modal-card');
    card.className = `modal-card modal-${size}`;
    card.innerHTML = html;
    const first = card.querySelector('[autofocus]');
    if (first) setTimeout(() => first.focus(), 30);
  }
  function closeModal() {
    const root = document.getElementById('modal-root');
    if (root) root.innerHTML = '';
    const cb = modalOnClose; modalOnClose = null;
    if (cb) cb();
  }
  const modalOpen = () => !!document.getElementById('modal-back');
  on('modal-close', () => closeModal());

  function confirmBox({ title, message, confirmLabel = 'Confirm', danger = false, onConfirm }) {
    confirmCb = onConfirm;
    modal(`
      <div class="modal-head"><h3>${U.esc(title)}</h3></div>
      <div class="modal-body"><p class="muted-text">${U.esc(message)}</p></div>
      <div class="modal-foot">
        <button class="btn btn-ghost" data-action="modal-close">Cancel</button>
        <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-action="confirm-yes">${U.esc(confirmLabel)}</button>
      </div>`, { size: 'sm' });
  }
  let confirmCb = null;
  on('confirm-yes', () => { const cb = confirmCb; confirmCb = null; closeModal(); if (cb) cb(); });

  // ---------- Wrong-PIN lockout (shared by every PIN entry) ----------
  const guard = { fails: 0, until: 0, ms: 30000 };
  const lockedFor = () => Math.max(0, Math.ceil((guard.until - Date.now()) / 1000));
  function pinFailed() {
    guard.fails++;
    if (guard.fails >= 5) { guard.until = Date.now() + guard.ms; guard.ms = Math.min(guard.ms * 2, 15 * 60000); guard.fails = 0; }
  }
  const pinOk = () => { guard.fails = 0; guard.ms = 30000; };

  // ---------- Admin PIN pad: dots = PIN length, checks automatically at full length ----------
  let pad = { buf: '', cb: null, title: '', error: false };
  function askAdminPin(title, cb) {
    pad = { buf: '', cb, title, error: false };
    renderPad();
  }
  function renderPad() {
    const pin = SP.store.get().settings.adminPin || '';
    const len = Math.max(4, pin.length);
    const lock = lockedFor();
    modal(`
      <div class="pad">
        <h3>${U.esc(pad.title || 'Admin PIN')}</h3>
        <div class="pad-dots">${Array.from({ length: len }, (_, i) => `<span class="dot ${i < pad.buf.length ? 'on' : ''}"></span>`).join('')}</div>
        <div class="pad-msg">${lock ? `Too many wrong attempts. Try again in ${lock}s.` : pad.error ? 'Incorrect PIN' : '&nbsp;'}</div>
        <div class="pad-keys">
          ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button class="pad-key" data-action="pad-key" data-k="${n}">${n}</button>`).join('')}
          <button class="pad-key pad-alt" data-action="pad-clear">Clear</button>
          <button class="pad-key" data-action="pad-key" data-k="0">0</button>
          <button class="pad-key pad-alt" data-action="pad-back">⌫</button>
        </div>
        <button class="btn btn-ghost btn-block" data-action="modal-close">Cancel</button>
      </div>`, { size: 'pad' });
  }
  on('pad-key', ({ k }) => {
    if (lockedFor()) return renderPad();
    const pin = SP.store.get().settings.adminPin || '';
    if (pad.buf.length >= 6) return;
    pad.buf += k; pad.error = false;
    if (pad.buf.length >= pin.length) {
      if (pad.buf === pin) { pinOk(); const cb = pad.cb; closeModal(); if (cb) cb(); return; }
      pinFailed(); pad.buf = ''; pad.error = true;
    }
    renderPad();
  });
  on('pad-back', () => { pad.buf = pad.buf.slice(0, -1); renderPad(); });
  on('pad-clear', () => { pad.buf = ''; renderPad(); });

  // ---------- Coin & note counter (used for opening/closing the drawer) ----------
  // counts: object {cents: n}; onChange(counts) called after each change
  let counter = { counts: null, onChange: null };
  function counterHTML(counts, onChange) {
    counter = { counts, onChange };
    const row = d => `
      <div class="denom">
        <span class="denom-label">${d.label}</span>
        <button class="denom-btn" data-action="denom-step" data-c="${d.c}" data-d="-1">−</button>
        <input class="denom-input" type="number" inputmode="numeric" min="0" id="denom-${d.c}" value="${counts[d.c] || 0}" data-input="denom-set" data-c="${d.c}" />
        <button class="denom-btn" data-action="denom-step" data-c="${d.c}" data-d="1">+</button>
      </div>`;
    return `
      <div class="denom-grid">
        <div><div class="label">Coins</div>${D.DENOMS.filter(d => d.type === 'coin').map(row).join('')}</div>
        <div><div class="label">Notes</div>${D.DENOMS.filter(d => d.type === 'note').map(row).join('')}</div>
      </div>
      <div class="denom-total"><span>Total</span><strong id="denom-total">${U.money(D.denomTotal(counts))}</strong></div>`;
  }
  function counterUpdated() {
    const t = document.getElementById('denom-total');
    if (t) t.textContent = U.money(D.denomTotal(counter.counts));
    if (counter.onChange) counter.onChange(counter.counts);
  }
  on('denom-step', ({ c, d }) => {
    counter.counts[c] = Math.max(0, (Number(counter.counts[c]) || 0) + Number(d));
    const inp = document.getElementById(`denom-${c}`);
    if (inp) inp.value = counter.counts[c];
    counterUpdated();
  });
  on('denom-set', ({ c }, el) => { counter.counts[c] = Math.max(0, parseInt(el.value, 10) || 0); counterUpdated(); });

  // Small helpers for views
  const badge = (text, kind = 'muted') => `<span class="badge badge-${kind}">${U.esc(text)}</span>`;
  const empty = text => `<div class="empty">${U.esc(text)}</div>`;

  return { on, actions, toast, modal, closeModal, modalOpen, confirmBox, askAdminPin, counterHTML, lockedFor, pinFailed, pinOk, badge, empty };
})();
