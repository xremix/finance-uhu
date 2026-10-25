---
name: capture-readme-screenshots
description: Capture and refresh this repository's README screenshots using the local app, Playwright, and the committed demo CSV.
---

# Capture README screenshots

Use this skill when creating or refreshing the screenshots embedded in this repository's README.

Run `npm run screenshots`. The script starts the Angular app on an available local port, launches a fresh Playwright Chromium context, and uses `demo.csv` so it does not reuse browser storage or personal finance files. It writes these images to `docs/screenshots/` and the README already embeds them:

- `startseite.png`: landing page.
- `essen-und-trinken.png`: dashboard with the demo file and the `Essen & Trinken` category selected.
- `alle-buchungen.png`: the lower `Alle Buchungen` tab with the demo transactions.

Install dependencies with `npm install`. If Playwright Chromium is not installed yet, run `npx playwright install chromium`. To capture from an already-running local app, set `SCREENSHOT_BASE_URL` before running the script.
