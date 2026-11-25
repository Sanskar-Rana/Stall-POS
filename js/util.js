/* StallPOS v2 — small helpers shared by every file. No dependencies. */
window.SP = window.SP || {};

SP.util = (() => {
  const uid = (p = 'id') => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---- Money: always integer cents ----
  let currencySymbol = '€';
  const setCurrency = sym => { currencySymbol = sym || '€'; };
  const money = cents => {
    const c = Math.round(Number(cents) || 0);
    return `${c < 0 ? '−' : ''}${currencySymbol}${(Math.abs(c) / 100).toFixed(2)}`;
  };
  // "9.50", "9,50", "9" -> 950
  const toCents = v => {
    const n = parseFloat(String(v == null ? '' : v).replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };
  const centsToInput = c => (Math.round(c) / 100).toFixed(2);

  // ---- Quantities (kg / l / pcs) — keep 3 decimals, avoid float noise ----
  const qty = n => Math.round((Number(n) || 0) * 1000) / 1000;
  const fmtQty = (n, unit) => {
    const v = qty(n);
    // up to 3 decimals for small amounts (0.175 l), 2 otherwise; trailing zeros dropped
    const s = Number.isInteger(v) ? String(v) : v.toFixed(unit === 'pcs' ? 0 : Math.abs(v) < 1 ? 3 : 2).replace(/\.?0+$/, '');
    return unit && unit !== 'portions' ? `${s} ${unit}` : s;
  };

  // ---- Dates: business days are 'YYYY-MM-DD' strings in local time ----
  const dayStr = (d = new Date()) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const parseDay = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parseDay(s); d.setDate(d.getDate() + n); return dayStr(d); };
  const weekday = s => parseDay(s).getDay(); // 0 Sun .. 6 Sat
  const fmtDay = s => s ? parseDay(s).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' }) : '—';
  const fmtDayLong = s => s ? parseDay(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '—';
  const fmtTime = iso => iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtDateTime = iso => iso ? new Date(iso).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  const nowISO = () => new Date().toISOString();
  const dayRange = (start, end) => { const out = []; for (let d = start; d <= end; d = addDays(d, 1)) out.push(d); return out; };

  const sum = (arr, f = x => x) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  // CSV cell with formula-injection guard
  const csvCell = v => {
    if (typeof v === 'number') return String(v);
    let s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const toCSV = rows => '﻿' + rows.map(r => r.map(csvCell).join(',')).join('\r\n');

  const download = (filename, content, mime) => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return {
    uid, esc, setCurrency, money, toCents, centsToInput, qty, fmtQty,
    dayStr, parseDay, addDays, weekday, fmtDay, fmtDayLong, fmtTime, fmtDateTime, nowISO, dayRange,
    sum, clamp, debounce, csvCell, toCSV, download
  };
})();
