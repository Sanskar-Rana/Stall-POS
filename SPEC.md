# StallPOS v2 — Behaviour Spec

A demo POS + simple stock planner for multi-day street-food events. Plain HTML, CSS and JavaScript.
No build step, no server: open `index.html`. Everything below is what the tests check.

## Agreed decisions
- Separate files (`index.html`, `css/`, `js/`), classic scripts so it works from `file://`.
- Daily targets **warn, don't block**. Per item, an optional *hard limit* requires the Admin PIN.
- Included: order numbers + kitchen queue, item options & combos, simulated card payments.
- Stock is kept for **food (portions per menu item) and packaging (pieces)** only. Ingredients and the central kitchen are tracked on the paper stock sheets.

## Foundations (fixes for the v1 bug classes)
1. **Money is integer cents** everywhere. Display formatting only at the edge.
2. **Business day is chosen when a shift opens** (suggested: today if it's an event day). Orders, waste,
   restocks and counts use the open shift's day. Nothing guesses the day from the clock afterwards.
   Resuming a shift on a later calendar day asks: close & start today, or keep selling (late night).
3. **Stock is a movement log.** On hand = sum of movements (opening, restock, sale, void, waste, count, edit).
   Nothing overwrites a stock number. Every day has a ledger: opening + in − out = closing.
4. **Storage:** IndexedDB (falls back to localStorage). Automatic daily backup snapshots (last 7 kept),
   plus download/restore of a backup file.
5. **Rendering by region:** typing or tapping only redraws the part of the screen that changed.
   Modals update in place (no flicker).
6. **Tests first:** `tests.html` runs the domain unit tests in any browser.

## Stock model
- **Food:** each menu item has portions on hand. Every sale removes one portion per serving (combos: each component).
- **Packaging** (500ml bowl, snack bowl, paper cup, napkin, wooden spoon): removed per serving, per the item's packaging list.
  "Can sell" = portions on hand, limited by packaging (e.g. "Out of Paper cup").
- Stock changes only through: opening, received/added, sale, void, waste/loss, count correction, manual edit.
- Stock may go negative (the food may physically exist); negative shows in red as "recount".
- Options add price only. Data saved by the earlier version (ingredients + central kitchen) is migrated automatically:
  packaging and stall movements are kept, ingredients and central kitchen stock are dropped.

## Plans & limits
- Targets: weekday template, weekend template (weekend days configurable, default Fri–Sun),
  plus per-day overrides.
- Register card shows "N left today" from today's plan; over plan shows "+N over plan" (amber).
- Admin sees a notice of items over plan. Hard-limit items need the Admin PIN once per day to go over.

## Selling
- Order numbers restart at #1 each business day.
- Payment: Cash (tap notes/coins received, suggested change from drawer, tip "make it €X" or keep change),
  PayPal (offline QR, tap to enlarge, tip), Card (simulated approval, tip, optional last 4 digits).
- Kitchen queue: Preparing → Ready → Collected; a full-screen customer display shows numbers.
- Voids (Admin PIN) reverse stock, drawer and totals.

## Cash drawer
- Shift opens with a coin/note count; every cash sale adds notes received and removes change given.
- Closing: count, variance, per-denomination comparison, optional stock count, backup reminder.

## Planning
- Stock cover: for the rest of today + the next N event days (1–7, default 3), per food item and packaging:
  on hand, need (at the real sales pace), to get, and the day the stall would run out.
- Whole-event totals of portions and packaging from the targets.

## Reports
- End of day: sales by method, tips, items vs plan, options/combos, stock ledger, waste, shifts. CSV + print.
