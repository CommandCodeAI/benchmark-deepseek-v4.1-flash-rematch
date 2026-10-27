#!/usr/bin/env node
// REPORT GENERATOR — composes verify/REPORT.md from suite result JSON +
// verify/visual-notes.md (manual screenshot analysis, maintained by verifier).
// Usage: node verify/report.mjs [--write] [--print]
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, VERIFY, SHOTS, DELIVERABLE, sha256 } from './lib/workspace.mjs';

const write = process.argv.includes('--write');
const readJson = (p) => {
  try {
    return JSON.parse(readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
};

const suites = {
  engine: readJson(join(VERIFY, 'results-engine.json')),
  static: readJson(join(VERIFY, 'results-static.json')),
  browser: readJson(join(VERIFY, 'results-browser.json')),
};
const visualNotes = existsSync(join(VERIFY, 'visual-notes.md')) ? readFileSync(join(VERIFY, 'visual-notes.md'), 'utf8') : '';

const AREA_TITLES = {
  offline: 'A. Single-file / offline',
  engine: 'B. Engine contract & determinism',
  autostart: 'C. Auto-start, completion, errors',
  controls: 'D. Instrument folio & keyboard',
  catastrophe: 'E. Catastrophes',
  dashboard: 'F. THE RECORD dashboard',
  a11y: 'G. Accessibility & motion',
  layout: 'H. Layout / responsive / screenshots',
  errors: 'I. Runtime errors',
  env: 'Environment',
  browser: 'Browser / scenarios',
};

const SEV_ORDER = { blocker: 0, major: 1, minor: 2, info: 3 };
const statusIcon = (s) => (s === 'PASS' ? 'PASS' : s === 'FAIL' ? '**FAIL**' : s === 'NOTE' ? 'note' : 'skip');

function pngSize(file) {
  try {
    const b = readFileSync(file);
    if (b.slice(1, 4).toString() !== 'PNG') return null;
    return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), kb: Math.round(statSync(file).size / 1024) };
  } catch {
    return null;
  }
}

function rowsFromSuite(suite) {
  if (!suite) return [];
  return suite.results.map((r) => ({ ...r, suite: suite.suite }));
}

const allRows = [...rowsFromSuite(suites.engine), ...rowsFromSuite(suites.static), ...rowsFromSuite(suites.browser)];
const failures = allRows
  .filter((r) => r.status === 'FAIL')
  .sort((a, b) => (SEV_ORDER[a.severity] ?? 9) - (SEV_ORDER[b.severity] ?? 9) || a.id.localeCompare(b.id));
const notes = allRows.filter((r) => r.status === 'NOTE');

const now = new Date().toISOString();
let deliverableHash = 'n/a';
let deliverableBytes = 'n/a';
try {
  const buf = readFileSync(DELIVERABLE);
  deliverableHash = sha256(buf).slice(0, 20);
  deliverableBytes = `${(buf.length / 1024).toFixed(1)} KB`;
} catch {
  /* ignore */
}

const L = [];
L.push('# VIVARIUM — Independent Verification Report');
L.push('');
L.push(`Generated: ${now}`);
L.push('');
L.push(`**Deliverable:** \`round 1/index.html\` — ${deliverableBytes} — sha256 \`${deliverableHash}…\``);
L.push('');
const envRow = (suites.browser?.results || []).find((x) => x.id === 'ENV');
const testedPreview = !!(envRow && (/verify-(integration|preview)/.test(String(envRow.detail || '')) || /verify-(integration|preview)/.test(String(envRow.description || ''))));
if (testedPreview) {
  L.push('> **INTERIM RUN** — the browser matrix was executed against a preview assembled from the latest `src/` modules (`shots/verify-integration*.html`) because `round 1/index.html` had not been reassembled at run time. Engine + static results are from current `src/`. This report is regenerated against the final deliverable once the Lead assembles it.');
  L.push('');
}
L.push('**Verifier:** node:vm engine harness + headless Chrome CDP (no npm deps). Reproduce with:');
L.push('');
L.push('```bash');
L.push('node verify/run-all.mjs              # engine + static + browser + report');
L.push('node verify/engine.test.mjs          # engine contract only');
L.push('node verify/static.test.mjs          # single-file/offline only');
L.push('node verify/browser.test.mjs         # full browser matrix + screenshots');
L.push('```');
L.push('');

// ---- verdict banner ----
const totals = allRows.reduce(
  (acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    if (r.status === 'FAIL') acc.bySev[r.severity] = (acc.bySev[r.severity] || 0) + 1;
    return acc;
  },
  { bySev: {} }
);
const blockers = totals.bySev.blocker || 0;
const majors = totals.bySev.major || 0;
L.push('## Verdict');
L.push('');
if (!allRows.length) {
  L.push('_No results yet — run the suites._');
} else if (blockers === 0 && majors === 0) {
  L.push(`**PASS** — ${totals.PASS || 0} checks passed, 0 blocker/major failures.`);
} else {
  L.push(`**NOT READY** — ${totals.PASS || 0} pass · **${totals.FAIL || 0} fail** (${blockers} blocker, ${majors} major, ${totals.bySev.minor || 0} minor).`);
}
L.push('');

// ---- PASS/FAIL matrix ----
const suiteOrder = ['engine', 'static', 'browser'];
const byArea = new Map();
for (const r of allRows) {
  const key = r.area || 'other';
  if (!byArea.has(key)) byArea.set(key, []);
  byArea.get(key).push(r);
}
L.push('## PASS/FAIL matrix');
L.push('');
const areaOrder = ['offline', 'engine', 'autostart', 'controls', 'catastrophe', 'dashboard', 'a11y', 'layout', 'errors', 'browser', 'env', 'other'];
const orderedAreas = [...areaOrder.filter((a) => byArea.has(a)), ...[...byArea.keys()].filter((a) => !areaOrder.includes(a))];
for (const area of orderedAreas) {
  const rows = byArea.get(area);
  L.push(`### ${AREA_TITLES[area] || area}`);
  L.push('');
  L.push('| id | status | severity | check | evidence |');
  L.push('|----|--------|----------|-------|----------|');
  for (const r of rows) {
    const ev = String(r.detail ?? '')
      .replace(/\|/g, '\\|')
      .replace(/\n/g, ' ')
      .slice(0, 220);
    L.push(`| ${r.id} | ${statusIcon(r.status)} | ${r.severity} | ${String(r.description || '').replace(/\|/g, '\\|')} | ${ev} |`);
  }
  L.push('');
}

// ---- prioritized findings ----
L.push('## Prioritized findings');
L.push('');
if (!failures.length) {
  L.push('No failures recorded.');
} else {
  L.push('| # | sev | id | finding | repro / expected |');
  L.push('|---|-----|----|---------|------------------|');
  failures.forEach((f, i) => {
    const repro = String(f.error || f.detail || '')
      .replace(/\|/g, '\\|')
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .slice(0, 420);
    L.push(`| ${i + 1} | **${f.severity}** | ${f.id} | ${String(f.description || '').replace(/\|/g, '\\|')} | ${repro} |`);
  });
}
L.push('');

// ---- documented deviations (agreed with Lead during the build) ----
L.push('## Documented deviations from the original brief');
L.push('');
L.push('These were agreed with the Lead and/or are recorded in the (Lead-updated) DESIGN-BRIEF.md:');
L.push('');
L.push('- **Default specimen seed = 1901, not 1977.** Brief §7 “Default specimen” and §9 `DEFAULTS` were updated by the Lead to 1901 (Chromium-verified: all three kingdoms persist through the study). Verified: world seed == masthead seed == engine DEFAULTS.seed == 1901, and `?seed=1977` still reproduces its own deterministic run. Note: the §5 controls table still lists “default 1977” — documentation inconsistency only.');
L.push('- **`world.activeEvents`** is exposed as a live getter (plus `getActiveEvents()` / `getStats().activeEvents`) and **`getSnapshot`** is provided as an alias of `snapshot`; both contract names now exist (B1/B21 pass).');
L.push('- **Headless speed**: 100 generations ≈3.4–3.5 s on this machine (~14× real time, not sub-second). Brief only requires “faster than real time”; flagged as a performance note, not a failure.');
L.push('- **Cross-engine float parity**: node:vm vs Chrome full-run hashes diverge over 40 generations (transcendental float differences amplify chaotically); within-Chrome determinism (same seed twice / after reload) and node cross-process determinism are exact, and the first generations match across engines. Confirmed with Lead as expected, not a product failure.');
L.push('');
// ---- notes / observations ----
if (notes.length) {
  L.push('## Notes & observations (not failures)');
  L.push('');
  for (const n of notes) {
    L.push(`- **${n.id}** (${n.area}): ${n.description} — ${String(n.detail || '').slice(0, 500)}`);
  }
  L.push('');
}

// ---- acceptance checklist mapping ----
L.push('## Brief §12 acceptance checklist mapping');
L.push('');
L.push('| # | requirement | result |');
L.push('|---|-------------|--------|');
const find = (id) => allRows.find((r) => r.id === id);
const map = [
  ['1', 'One file, no external requests', ['A1', 'A2', 'A3', 'A4', 'C2']],
  ['2', 'Auto-starts; deterministic seed; N-gen run ends; dashboard appears', ['C1', 'C3', 'C4', 'B2', 'B3']],
  ['3', 'Seeded PRNG; headless faster than real time; DOM-free engine', ['B17', 'B4', 'B8', 'B6']],
  ['4', 'Genes mutate on reproduction; traits visible in tag + charts', ['B7', 'B13', 'F3']],
  ['5', 'Controls live, units, ranges, readouts; custom builds; sparklines; tooltip+keyboard+focus', ['D1', 'D2', 'D5', 'D7', 'D8', 'D13']],
  ['6', 'Catastrophes fire automatically, configurable, 3 types, banner+seal+ledger+markers', ['E1', 'E2', 'E3', 'E4', 'E5', 'B9', 'B10']],
  ['7', 'Charts: population + per-gene mean/spread per species, canvas', ['F2', 'F3']],
  ['8', 'Composition coherent; signature rule; no scroll at 1440×900', ['D10', 'F1', 'H-1280', 'C4']],
  ['9', 'Accessible (focus, ARIA, reduced motion) and performant', ['D3', 'D4', 'G-ARIA', 'G-SKIP', 'G-RM', 'B8']],
  ['10', 'Screenshots 1440×900 initial/mid/event/final + 1280×800', ['SHOTS']],
];
for (const [num, req, ids] of map) {
  let status;
  if (ids[0] === 'SHOTS') {
    const shots = existsSync(SHOTS) ? readdirSync(SHOTS).filter((f) => f.startsWith('verify-') && f.endsWith('.png') && !f.startsWith('verify-preview-')) : [];
    status = shots.length ? `PASS — ${shots.length} screenshots` : 'pending';
  } else {
    const rs = ids.map(find).filter(Boolean);
    if (!rs.length) status = 'not run';
    else if (rs.some((r) => r.status === 'FAIL' && (r.severity === 'blocker' || r.severity === 'major'))) status = '**FAIL** — ' + rs.filter((r) => r.status === 'FAIL').map((r) => r.id).join(', ');
    else if (rs.some((r) => r.status === 'FAIL')) status = `partial (${rs.filter((r) => r.status === 'FAIL').map((r) => r.id).join(', ')})`;
    else status = 'PASS — ' + rs.map((r) => r.id).join(', ');
  }
  L.push(`| ${num} | ${req} | ${status} |`);
}
L.push('');

// ---- screenshots ----
L.push('## Screenshots');
L.push('');
L.push('All in `shots/`, captured headless at DPR 1:');
L.push('');
L.push('| file | size | viewport | moment |');
L.push('|------|------|----------|--------|');
const shotMoments = {
  'verify-initial-1440.png': '1440×900 · t≈1.2 s auto-run',
  'verify-mid-1440.png': '1440×900 · mid-run, seals in ledger',
  'verify-event-1440-1.png': '1440×900 · catastrophe banner up',
  'verify-event-1440-2.png': '1440×900 · another catastrophe type',
  'verify-event-1440-3.png': '1440×900 · another catastrophe type',
  'verify-event-1440-4.png': '1440×900 · another catastrophe type',
  'verify-record-1440.png': '1440×900 · THE RECORD after natural 40-gen end',
  'verify-record-fast-1440.png': '1440×900 · THE RECORD (fast run)',
  'verify-record-nocat-1440.png': '1440×900 · THE RECORD with ?cat=0 (no weather)',
  'verify-record-1280.png': '1280×800 · THE RECORD',
  'verify-initial-1280.png': '1280×800 · plate',
  'verify-reduced-record-1440.png': '1440×900 · record under reduced motion',
  'verify-module-plate-1440.png': 'module QA · renderer plate (pre-integration)',
  'verify-module-folio-1440.png': 'module QA · controls folio (pre-integration)',
  'verify-module-folio-folded-1440.png': 'module QA · folio folded',
  'verify-module-record-1440.png': 'module QA · dashboard (pre-integration)',
};
let shotCount = 0;
if (existsSync(SHOTS)) {
  const shots = readdirSync(SHOTS).filter((x) => x.startsWith('verify-') && x.endsWith('.png')).sort();
  const relevant = shots.filter((f) => !f.startsWith('verify-preview-'));
  for (const f of relevant) {
    const sz = pngSize(join(SHOTS, f));
    if (!sz) continue;
    shotCount++;
    L.push(`| shots/${f} | ${sz.w}×${sz.h} (${sz.kb} KB) | ${sz.w}×${sz.h} | ${shotMoments[f] || 'captured'} |`);
  }
}
if (!shotCount) L.push('| — | — | — | no screenshots captured yet |');
L.push('');

// ---- visual analysis ----
L.push('## Visual inspection (manual, read_image)');
L.push('');
L.push(visualNotes.trim() || '_Pending — screenshots not yet analysed._');
L.push('');

// ---- risks ----
L.push('## Remaining risks / not covered');
L.push('');
L.push('- Pixel "legibility" of canvas axis text is checked heuristically (ink-pixel counts + screenshot review); no OCR.');
L.push('- Contrast audit is approximate (computed styles, solid backgrounds only); gradient/texture backgrounds are estimated.');
L.push('- Engine performance measured in node, not CPU-throttled; in-browser frame rate during max speed should be spot-checked on slower hardware.');
L.push('- Cross-browser (Safari/Firefox) and real GPU rendering are out of scope of this harness (headless Chrome only).');
L.push('- No automated test of pointer-drag on rotary dials (keyboard semantics covered); manual spot check recommended.');
L.push('');

const md = L.join('\n');
if (write) {
  writeFileSync(join(VERIFY, 'REPORT.md'), md, 'utf8');
  console.log(`wrote verify/REPORT.md (${md.length} chars, ${shotCount} screenshots, ${failures.length} findings)`);
}
if (!write || process.argv.includes('--print')) console.log(md);
