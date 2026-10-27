# VIVARIUM — Design Brief & Build Contract

**Deliverable:** `round 1/index.html` — one self-contained file, inline CSS + JS, no build step,
no external libraries, fonts, images, or network requests. It auto-starts on load, runs a seeded
ecosystem for N generations, then transitions to a results dashboard.

**Default specimen:** seed **1901**, 40 generations (deliberately chosen and verified in Chromium so all three kingdoms persist through the study; any seed reproduces its own run).

**Concept:** *A naturalist's field ledger, left open on the desk, documenting a sealed terrarium
under glass.* The simulation is a living specimen mounted on the page: brass frame, glass glare,
ink-drawn organisms, a wax-seal weather record. The control surface is a collapsible
"instrument folio" bound into the right page — not a form.

**Signature element:** **The Generation Rule** — a brass-edged, engraved timeline rule running
the full width beneath the glass. It carries the generation cursor, playback lever, pop/pause
controls and a small wax seal for every catastrophe. At the end of the run it becomes the
transition into the record.

**Emotional register:** quiet, precise, slightly antique; a scientific instrument that is also a
beautiful object. Restraint over spectacle. The only saturated colour is living ink.

---

## 1. Palette (CSS custom properties, light warm paper)

```
--paper:        #ece3d0   (page)
--paper-hi:     #f4ecda   (raised cards / field notes)
--paper-lo:     #e2d6bf   (sunken canvas ground)
--ink:          #211d16   (primary text, near-black sepia)
--ink-2:        #574f40   (secondary text)
--ink-3:        #8b806c   (tertiary / rules)
--rule:         #c9baa0   (hairlines)
--rule-strong:  #a8977b
--brass:        #a08043
--brass-hi:     #c9ab6d
--brass-lo:     #6f5730
--flora:        #4f6f52   (verdigris green)
--flora-soft:   #8aa286
--fauna:        #ab7a35   (ochre / hare)
--fauna-soft:   #cdb184
--predator:     #93372d   (madder / fox)
--predator-soft:#bd837a
--wax:          #7a2b23   (wax seals, event ink)
--drought:      #a8792f   (ochre wash)
--plague:       #666d4c   (sickly olive wash)
--wildfire:     #8d3a22   (ember wash)
--desk:         #171813   (dark study backdrop behind the page)
```

No pure white, no pure black, no neon. Everything sits on paper; catastrophe moments are
*washes of ink and wax*, not glowing overlays.

## 2. Typography (system stacks only, no network)

- **Display:** `"Bodoni 72", Didot, "Bodoni MT", "Iowan Old Style", "Palatino Linotype", Georgia, serif`
  — masthead title, results titles, figure numbers. Tight tracking, high contrast.
- **UI / labels:** `Optima, "Gill Sans", "Gill Sans MT", "Avenir Next", "Trebuchet MS", sans-serif`
  — small caps (uppercase + letter-spacing .14em–.2em), 9.5–11px for instrument labels.
- **Data:** `"SF Mono", "SFMono-Regular", Menlo, "Roboto Mono", "Courier New", monospace`
  — tabular numerals, readouts, axes, seed. Use `font-variant-numeric: tabular-nums`.
- **Annotations:** display serif italic, 12–13px, for field notes and captions.

Title size: `clamp(52px, 6.4vw, 92px)` (or a masthead lockup that fits 1440×900 without scroll).
No decorative script fonts. No identical letter-spacing everywhere.

## 3. Composition (target viewport 1440×900, must degrade to 1280×800 and 1024px width)

Dark desk backdrop → a single warm paper **sheet** (max-width 1560px) with deckle-soft shadow,
page padding ~34–40px. Two-column spread:

```
┌──────────────────────────────────────────────────────────────┐
│ masthead: kicker · VIVARIUM · subtitle · seed/meta            │
│ ════════════════════════════════════════════════════════════ │
│  FIG.1 THE CLOSED TERRARIUM           [ live census tags ]   │
│  ┌───────────────────────────────────┐  ┌────────────────┐  │
│  │                                   │  │ INSTRUMENTS    │  │
│  │        glass vitrine canvas       │  │  (folio)       │  │
│  │                                   │  │  6 instruments │  │
│  │                                   │  │  2 toggles     │  │
│  └───────────────────────────────────┘  │  key legend    │  │
│  ══ THE GENERATION RULE ══════════════  └────────────────┘  │
│  FIELD NOTES ledger (event log line)                         │
│ colophon: observation no. · seed · keyboard hints · folio    │
└──────────────────────────────────────────────────────────────┘
```

- The vitrine is the hero: ~2/3 width, canvas aspect **16:9**. It should fit in the first
  viewport with the rule and ledger visible. Avoid page scrolling on a 1440×900 screen.
- The folio is ~330–360px, a folded page/tab docked right. A narrow vertical tab sits at its
  outer edge; clicking it collapses the folio to a 30px spine (canvas does NOT resize
  jarringly; page reflows smoothly). Animate 320ms ease.
- Paper texture must be **procedural** (repeating radial/linear gradients, canvas noise,
  feTurbulence-free is preferable for perf). Avoid images.
- The page is a composition, not cards floating on a gradient. Use rules, margins and tiny
  engraved labels to group. No rounded-corner card soup; radii mostly 0–2px, brass details
  selectively rounded.
- The masthead title lockup should feel typeset: a large "Vivarium" with a small italic
  sub-line and a vertical rule into metadata (seed, generation, season). Use `FIG.`, `PL.`,
  `No.` labels.

## 4. The vitrine & species glyph language

- **Frame:** brass edge (multi-stop gradients to fake bevel), 4 tiny slotted screws at corners,
  glass glare (a broad diagonal 2–3% white streak + inner vignette). Canvas paper ground has a
  very faint 1-cell reference grid, like ruled field graph paper.
- **Flora** — verdigris. Glyph: a three-stroke seedling / asterisk (`✳`-like), 3–5px, drawn in
  ink with slight per-organism jitter. Sessile; clusters read as mossy texture. Color `--flora`.
- **Herbivora** — ochre. Glyph: open ring with a centre dot (`◎`-like) and a tiny direction
  tick; 3–4px. Color `--fauna`.
- **Carnivora** — madder. Glyph: an open chevron/arrowhead (`‹`-like rotated to heading), 4–5px.
  Color `--predator`.
- **Catastrophe** — wax seal circle with an embossed initial (S / P / I for *Siccitas*,
  *Pestilentia*, *Incendium*). Wax `--wax`.
- Tiny hand-drawn motion trails are welcome, faint (like pencil ghosts). Keep legibility.
- Click/hover a creature: a "specimen tag" card pinned inside the glass shows its taxon,
  glyph, live gene values with units, energy as a tiny ink bar, and age. It should feel like a
  pinned label, not a web tooltip.
- Live census tags sit in the plate head or upper-right of the frame: glyph + count + trend
  caret in species color, tabular numerals, animating smoothly (not jumping).

## 5. The instrument folio (control surface)

A folded ledger page with a header ("INSTRUMENTS" / "Custodian's settings"), a hairline ruler,
then custom controls. Every control row: small-caps label + *(i)* field-note button + a
**sparkline of its effect**; below, the instrument, a mono readout with unit, and an engraved
min/max scale where useful.

Required controls (IDs and ranges are part of the contract; defaults in brackets):

| key | instrument | range / step | default | live readout | sparkline shows |
|---|---|---|---|---|---|
| `seed` | engraved stepper + dice "recast" button | 1–9999 / 1 | 1901 | `1901` · seed | genetic diversity trace |
| `mutation` | custom slider | 0–0.20 / 0.005 | 0.06 | `0.060` · per locus / birth (also Δ% per gen) | mutations per generation |
| `regrowth` | custom slider | 0.20–2.50 / 0.05 | 1.00 | `1.00×` · flora vigour | flora census trace |
| `generations` | stepper | 10–120 / 1 | 40 | `40` · generations | progress to end (ink rail) |
| `speed` | rotary dial (brass knob) | 0.25–8× (log) | 2.0 | `2.0×` · ticks per second | realised ticks/s |
| `interval` | rotary dial | 3–20 / 1 | 8 | `8` · gens between events | weather rhythm marks |
| `catastrophes` | brass rocker toggle | on/off | on | `WEATHER: ARMED` | — |
| `trails` | brass rocker toggle | on/off | on | `GHOSTS: ON` | — |

- Sliders/dials/steppers/toggles must all be present and visually distinct custom builds.
- Live update: changing a value applies immediately (seed recasts the plate; generations
  shortening below the current generation ends the study). Changes must not cause a jarring
  reset except seed/recast, which gets a 300ms wipe and a small paper note.
- Keyboard: sliders/dials = arrows, PageUp/PageDown, Home/End; steppers type/arrow keys;
  toggles Space/Enter; all reachable by Tab; every control has a visible focus state
  (2px ink outline offset 3px + a brass tick). Escape dismisses tooltips.
- Tooltips: a pinned field-note card (paper, hairline brass border, small caps title,
  description, range + unit, hint). Show on hover *and* focus; exposed via `aria-describedby`;
  toggled by the (i) button; dismiss on Escape/outside click. No `title=` alone.
- Sparklines: canvas 76×22 (CSS), ink stroke, brass end-dot, faint baseline. Deterministic,
  redrawn on generation change. Label effect in tiny italic on hover? At minimum the card has
  an accessible label. No chart junk or filled neon areas.
- A subtle engraved knob/dial highlight and haptic-looking motion; dials should rotate with a
  brass pointer and engraved tick ring. Use pointer drag (vertical or angular) + keyboard.
- The folio must collapse via a vertical tab labelled `INSTRUMENTS ⇤/⇥`; collapse state
  persists for the session. Focus states remain clear. When collapsed, all controls are
  removed from tab order (inert/hidden or aria-hidden + disabled inert wrapper).
- Keyboard shortcuts (documented in colophon, active when not typing): `Space` pause/resume,
  `G` advance one generation, `R` recast same seed, `?` shortcut note. Do not hijack typing
  in the seed/generations inputs.

## 6. The Generation Rule (signature)

A horizontal brass/paper rule below the vitrine:
- engraved major ticks per 5 gens, minor ticks, numerals 0..N; a cursor with a brass rider and
  a small inverted-paper label `GEN 17`.
- left end: a play/pause lever (▷/❚❚), a "step season" button, and a **fast-conclude** button
  (`⏭`) that headlessly finishes the study and opens the record.
- event seals: small wax circles pinned on the rule at their generation, with a lowercase
  label on hover (`SICCITAS · GEN 16`). On firing, drop-in with a 260ms press animation and a
  brief paper rumble (1px translate). Restrained.
- The rule doubles as the timeline; on run end the cursor reaches the end and the rule seals
  line up with the record's chart markers.

## 7. Catastrophe moments (restrained, on-theme)

Drought (`SICCITAS`), plague (`PESTILENTIA`), wildfire (`INCENDIUM`). At fire time:
1. A **watercolour wash** sweeps the page edges (fixed overlay, multiply, 6–8% opacity in the
   event hue, 1.8s ease) — no screen flash.
2. A **paper banner** slides into the top of the glass: wax seal + `SICCITAS · DROUGHT` +
   `GEN 16` + one-line consequence in italic (`Flora growth halved for three seasons.`),
   auto-dismiss ~3.4s, announced via `role="status" aria-live="polite"`.
3. Persistent condition note while active: small typewritten line pinned in the lower-left of
   the glass (`SICCITAS · 2 SEASONS REMAIN`).
4. A **wax seal** pinned on the Generation Rule; a marker on dashboard charts; a line appended
   to the FIELD NOTES ledger below the plate. No confetti, no toast library, no glow.
Event palette tints: drought ochre, plague olive, wildfire ember. Text remains ink.

## 8. Results — "THE RECORD" (end of run)

A polished dashboard that feels like the next page of the same ledger, not a different app.
Full-sheet overlay sliding/fading in over the page (page-turn feel, 500ms; masthead can remain
or be replaced by a record masthead). Must be readable without scrolling at 1440×900.

Layout:
- Header: `THE RECORD — study concluded`; big serif title; meta (seed, generations, elapsed
  ticks, catastrophes); buttons **Replay this seed**, **New study**, **Return to the plate**
  (styled as ink/brass ledger actions).
- **FIG. 2 — Census of the three kingdoms**: one large canvas, 3 population curves in species
  colors with light hand-drawn wobble; x = generation, y = count; catastrophe markers as
  vertical rust dashed rules with tiny wax pins and rotated labels; legend with species glyphs;
  end-state counts labelled in mono.
- **FIG. 3–14 — Drift at the four loci**: one canvas matrix, 3 rows (taxa) × 4 columns
  (genes: speed, vision, metabolism, threshold), each cell showing the **mean line** and a
  **±1 SD spread band** per generation, with catastrophe markers faint behind. Y axes are
  per-gene sensible ranges with units; x axis shared, generations. Colors = species; the
  spread band is a translucent hatch/wash. Include a tiny glyph + taxon name at each row's
  left, a tiny gene title + expression note per column:
  - Flora expressions: SPEED = growth rate; VISION = seed dispersal; METABOLISM = light
    conversion; THRESHOLD = seeding biomass.
  - Herbivora: locomotion, perception, energy conversion, breeding energy.
  - Carnivora: pursuit, perception, energy conversion, breeding energy.
- Side column: a small "study summary" hand-written card (final populations, largest drop,
  catastrophe roster with generations, mean mutation rate, survival note), plus a diversity
  index or extinction note. Nothing blinking.
- Everything drawn on canvas in the same ink/paper language; axis labels in mono; hand-drawn
  jitter derived deterministically from the run seed (same seed = same chart texture).
- Charts must be DPR-aware and re-render on resize.
- No chart library. All canvas 2D.

## 9. Simulation contracts (engine module, built by Lead)

```js
// src/engine.js — attaches to window (and globalThis for node tests)
window.VIVARIUM_ENGINE = {
  GENE_KEYS: ['speed','vision','metabolism','threshold'],
  SPECIES: { flora: {...}, herbivora: {...}, carnivora: {...} }, // id, latin, glyph, colors
  CATACLYSMS: { drought: {...}, plague: {...}, wildfire: {...} },
  DEFAULTS: { seed: 1901, mutation: 0.06, regrowth: 1.0, generations: 40, speed: 2.0, interval: 8, catastrophes: true, trails: true, width: 160, height: 90 },
  createWorld(config) -> world,
  resetWorld(world, overrides) -> world,       // reseed, keep params
  setParam(world, key, value),                 // live params incl. catastrophe interval
  runGeneration(world),                        // advances one full generation; records history
  runTick(world),                              // advances one tick (generation = 30 ticks)
  stepGeneration(world),                       // same as runGeneration for tests
  runHeadless(world, gens) -> world,           // no DOM, no render; fast-forward
  benchmark(seed, gens) -> { ms, ticksPerSec },
  getSnapshot(world) -> plain state summary,
  getStats(world) -> { counts, traits, diversity, mutationsThisGen, tickRate? },
  hashWorld(world) -> string                    // determinism check
};
```

World/history contract for charts & controls:
```js
world = {
  config: {...}, seed, generation (0..N), tick, ticksIntoGen, running, finished,
  counts: { flora, herbivora, carnivora },
  history: [{
    gen, counts: {flora,herbivora,carnivora},
    traits: { flora: { speed:{mean,sd,min,max}, ... }, ... }, // all 3 taxa × 4 genes
    mutations, event: null|'drought'|'plague'|'wildfire', diversity
  }],
  events: [{ gen, tick, type, id, latin, name, note, duration }],
  activeEvents: [{ type, gensRemaining }],
  ...
}
```
Engine is DOM-free; no Math.random / Date in simulation. The renderer, charts and controls
must not alter simulation state. Determinism: same config + seed + same generation boundaries
= identical hashes.

## 10. Module files & ownership (one file per owner; no cross-writes)

- `src/shell.html` — Lead's HTML shell with placeholders `/* @@...@@ */`. **Lead only.**
- `src/engine.js` — Lead only.
- `src/render.js` — Lead only (vitrine renderer + specimen tag logic + timeline cursor updates + event seals).
- `src/boot.js` — Lead only (orchestration, playback loop, ledger, banner, result transition hooks).
- `src/design.css` — **designer only** (all page + vitrine + folio + rule + ledger + tooltip + responsive).
- `src/controls.js` — **designer only** (instrument components + sparklines + tooltips + a11y).
- `src/dashboard.js` — **chartwright only** (record rendering, canvases, summary card, chart markers).
- `src/dashboard.css` — **chartwright only** (record layout/styling, appended after design.css).
- `verify/**` — **verifier only** (node + headless Chrome QA scripts, reports). Never edits deliverable files.
- `assemble.mjs` — Lead only (inlines modules into `round 1/index.html`).

Integration hooks (Lead will call):
```js
window.VIVARIUM_CONTROLS = {
  mount(rootEl, ctx),        // rootEl = #instrument-body
  update(world, dtMs),       // readouts, sparklines, running state
  setRunning(bool),
  setFinished(bool),
  destroy()
};
// ctx = {
//   getWorld(), getParam(key), setParam(key, value),          // seed => recast
//   actions: { recast(seed?), pause(), resume(), stepGen(), conclude() },
//   isRunning(), getSparkData() // {diversity, mutations, flora, events, progress, tickRate}
// }

window.VIVARIUM_DASHBOARD = {
  render(world, opts),       // draws #chart-pop + #chart-traits, fills summary
  show(), hide(),            // record overlay visibility (CSS class + hidden attr)
  onResize()
};
// boot calls render(world) when run finishes / is concluded; Replay/New/Return buttons
// are wired by boot (elements exist in shell).
```

## 11. Motion & accessibility

- Motion budget: 320ms fold, 500ms record entrance, 260ms seal press, 1.8s wash, 300ms value
  changes. Respect `prefers-reduced-motion: reduce` (reduce to opacity/instant).
- Visible focus everywhere; real buttons; ARIA on sliders (`role="slider"`, aria-valuemin/max/now/text,
  aria-describedby tooltip), switches (`role="switch"`, aria-checked), live regions for events
  and generation transition. `canvas` gets `role="img"` + `aria-label` describing the run.
- Contrast: ink on paper high; labels 4.5:1 minimum; species colors used with labels/glyphs,
  not colour alone. Focus ring not suppressed anywhere.
- Skip link to plate. No keyboard traps. `Escape` closes tooltip; `?` opens shortcut note.
- Canvas text must remain legible at 1280 width.
- Prefer native `<input type="range">` (fully styled) where possible; custom dials implement
  full ARIA slider keyboard semantics.

## 12. Acceptance checklist (build against this)

1. One file, no external requests (fonts/images/libs/XHR/fetch).
2. Auto-starts; deterministic seed; N-generation run ends automatically; dashboard appears.
3. Seeded PRNG for all simulation randomness; headless runs faster than real time; engine
   usable without DOM.
4. Genes mutate on reproduction; traits visible in specimen tag and charts.
5. Controls: seed, mutation, regrowth, generations, speed, catastrophe interval — all live,
   with units, ranges, readouts; custom slider/dial/stepper/toggle; sparkline per control;
   tooltip + keyboard + visible focus.
6. Catastrophe system fires automatically, configurable interval, 3 types, restrained visual
   announcement + rule seal + ledger + chart markers.
7. Charts: population curves + per-gene mean/spread per species, canvas, same visual language.
8. Composition: controls part of the page; signature generation rule; coherent palette/type/
   glyphs; no generic dashboard look; no scroll at 1440×900.
9. Accessible (focus, ARIA, reduced motion) and performant (60fps-ish on 160×90).
10. Screenshots at 1440×900: initial, mid-run/event, final record; 1280×800 sanity.
