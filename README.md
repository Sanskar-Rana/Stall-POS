# StallPOS v2 (demo)

A rebuilt version of StallPOS in plain HTML, CSS and JavaScript. No build tools, no server, no internet needed.
What it does and why is in **SPEC.md**.

## Open it
- **Computer:** double-click `index.html` (Chrome, Edge, Safari or Firefox).
- **Run the tests:** double-click `tests.html` — all lines should be green.
- **iPad, fully offline (no laptop, no internet at the event):** put the folder online once, install it from Safari,
  and from then on it runs from the iPad itself.
  1. At home, with internet: upload this folder to GitHub Pages (or Netlify) to get an `https://…` link.
  2. On the iPad, open the link in **Safari** → Share → **Add to Home Screen**.
  3. Open the **StallPOS icon** once while still online, then check **Settings → Offline** shows two green ticks.
  4. Set up the event *inside the Home Screen app* (Safari tabs have separate storage).
  5. Test: Airplane Mode on → open the icon → make a test sale. It should work exactly the same.
  Daily: Settings → **Download backup** (saves to Files, works offline). Don't clear Safari website data.
  Updates: change files, bump `CACHE` in `sw.js`, upload; the iPad picks it up next time it opens online.

## First run
Choose a stall name and Admin PIN, then **Load sample event** (27 Nov – 13 Dec, your 7 items).
- Cashier 1 PIN: `1111`
- Admin: pick **Admin** on the lock screen, or tap **Admin** in the header.

The sample is the Grimma event from your PDFs: prices, weekday/weekend targets, and the packaging per dish
(bowl + napkin + spoon for mains, snack bowl for samosa/wedges, paper cup for tea). The stall starts with the
first 3 days of portions and packaging. Ingredients and the central kitchen live on the paper stock sheets.

### A typical day
1. When food or packaging arrives: Stock → **Add** on that line.
2. Sell. Log waste / staff meals in Stock.
3. Close the shift with **Close & count stock** (portions + packaging).
4. Plan → **Stock cover** shows what to bring for the next days.

## Files
```
index.html            page shell, loads the scripts in order
tests.html            unit tests (open in a browser)
css/styles.css        all styling
js/util.js            money (cents), dates, CSV, download helpers
js/domain.js          pure logic: targets, stock ledger, drawer, stock cover  ← unit-tested
js/db.js              IndexedDB storage (falls back to localStorage)
js/store.js           app state + every action that changes data
js/sample.js          the sample event
js/qr.js              offline PayPal QR generator
js/app.js             app shell: header, tabs, business day, rendering
js/ui/*.js            one file per screen (lock, register, queue, stock, plan, menu, shift, reports, settings)
sw.js, manifest.webmanifest, icons/   offline Home Screen app when served over https
```
