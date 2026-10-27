# VIVARIUM — verification harness

Independent QA by **verifier**. No npm dependencies (Node 24 + local Google Chrome).

## Run everything

```bash
node verify/run-all.mjs          # engine + static + browser suites, then verify/REPORT.md
```

Individual suites:

```bash
node verify/engine.test.mjs      # contract/determinism in node:vm (DOM-free)
node verify/static.test.mjs      # single-file / offline / no-external requests
node verify/browser.test.mjs     # headless-Chrome matrix + screenshots in shots/verify-*.png
node verify/report.mjs --write   # compose REPORT.md from results JSON + visual-notes.md
```

Useful env vars:

| variable | effect |
|---|---|
| `VERIFY_TARGET=path` | static suite checks an alternative HTML file (e.g. a preview) |
| `VERIFY_PAGE=path` | browser suite runs against an alternative HTML file; results go to `results-browser-preview.json` |
| `CHROME_BIN=/path` | override Chrome executable |

## Files

- `lib/cdp.mjs` — dependency-free Chrome DevTools Protocol driver (launch, navigate, network/console capture, screenshots, keyboard/mouse input).
- `lib/probe.mjs` — in-page probe (`window.__VERIFY`) for DOM/pixel/ARIA/overflow/contrast queries; `injectProbe(page)` + `waitUntil`.
- `lib/engine.mjs` — node:vm loader for `src/engine.js` + history validators.
- `lib/check.mjs` — tiny PASS/FAIL recorder with ids/areas/severities.
- `lib/workspace.mjs` — stable snapshot of the evolving deliverable, hashes, paths.
- `engine.test.mjs` / `static.test.mjs` / `browser.test.mjs` — suites (`B*`, `A*`, `C/D/E/F/G/H-*` ids map to the brief).
- `module-qa.mjs` — pre-integration run: assembles a no-boot preview and drives renderer, controls and dashboard manually (useful while boot was being built).
- `visual-notes.md` — manual screenshot inspection, folded into REPORT.md.
- `REPORT.md` — generated PASS/FAIL matrix, prioritized findings, screenshot list.
- `results-*.json` — last run of each suite (machine-readable evidence).

## Conventions

- Every check has a stable id, an area (`engine`, `offline`, `controls`, `catastrophe`, `dashboard`, `a11y`, `layout`, `autostart`, `errors`) and a severity (`blocker`/`major`/`minor`/`info`).
- The browser suite always snapshots `round 1/index.html` (two byte-identical reads) before testing, so it never runs against a half-written file; the snapshot hash is printed in the report.
- Screenshot moments: initial (t≈1.2s), mid-run, each catastrophe banner (settled 320ms), record at natural 40-gen end, record at 1280×800, reduced-motion record, `?cat=0` record.
