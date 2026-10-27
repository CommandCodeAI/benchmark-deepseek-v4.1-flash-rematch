### 1. Plate / first viewport — 1440×900

`shots/verify-initial-1440.png` (final build sha `f820f20a…`).

- Composition reads immediately as a naturalist's ledger: masthead lockup → FIG. 1 plate →
  generation rule → field-notes ledger → colophon, folio docked right. No collisions at 1440;
  all three census tags, the clock and the caption sit inside the glass frame.
- Vitrine drawing is alive: flora reads as moss texture, herbivora rings and carnivora chevrons are
  legible at 1×; glass glare/vignette present but restrained. Paper grain visible, no banding.
- Folio: all 8 instruments visible in the first viewport, labels/units/readouts legible at 1440
  (small caps ~9–11px). Sparklines render ink strokes; dial needles point correctly.
- Generation rule: transport, cursor label `GEN 01`, minor ticks + numerals 0…40 and
  `2.0× · 60 ticks/s` all present; numerals are 8–9px (faint but readable on this display).
- The folio's vertical spine tab sits flush to the sheet edge (x≈1378–1402); brass rivets and rotated
  `INSTRUMENTS` are deliberate and don't collide.
- No page scroll at 1440×900 (`scrollY` stays 0); sheet bottom ≈ 886px.

### 2. Catastrophe moment — 1440×900

`shots/verify-event-1440-1..4.png`.

- Banner drops into the top-left of the glass with seal initial + latin + name + GEN + italic
  consequence; persistent condition line (`CINERES · 5 SEASONS REMAIN` / `PESTILENTIA · n SEASONS
  REMAIN`) sits bottom-left; page-edge wash tints toward the event hue without flashing; a wax seal
  is pinned on the rule; ledger line appended and counter advances. All four elements co-occur.
- **Screenshot caveat:** captures taken the moment `#event-banner` becomes visible catch the banner
  mid fade-in, so its text looks washed out in the PNG. This is a capture-timing artefact, not a
  legibility defect: with a ~300ms settle it is ink-on-paper. Final run captures after settle.
- At 1440 the rule seals are 10px; the embossed initial is only hinted. Acceptable per "small wax
  seals" but worth a 1px-larger radius if a free improvement (minor).

### 3. THE RECORD — 1440×900

`shots/verify-record-1440.png`.

- Strong "next page of the same ledger" feel; same paper/ink/brass language as the plate.
- FIG. 2: 3 population curves, species glyph legend, y-axis `INDIVIDUALS`, x-axis `GENERATION`,
  catastrophe markers as dashed rust rules with rotated wax-pin labels, end-state counts at right,
  `n WEATHERS` note. No clipping; labels legible.
- FIG. 3–14: full 3×4 drift matrix; every cell has mean line + ±1 SD hatched band, per-gene y axis
  and unit, expression note top-left, last-value top-right, shared `GENERATION →` axis. Row glyphs
  and latin names align with the cells. All 12 cells verified non-blank by pixel sampling and by eye.
- Summary card: final census with peak/delta, weather roster with gens, largest single-generation
  fall, mutation rate + diversity, survival note. Dense but readable; no blinking.
- Layout fits 1440×900: record sheet 13.5→886.5px, no internal scroll; header actions
  (`Replay this seed`, `New study`, `Return to the plate`) clear; keyboard focus ring visible on
  Replay when the record opens.
- Minor: the drift matrix cells are ~85px tall; readable at 1440 but tight. At 1280 they shrink
  further (still legible in `verify-record-1280.png`). If whitespace allows, +12–16px of matrix
  height would improve the SD band readability (nice-to-have, not a blocker).

### 4. 1280×800 and 1024px sanity

`shots/verify-initial-1280.png`, `shots/verify-record-1280.png`, `shots/verify-initial-1024.png`.

- Record overlay fits 1280×800 cleanly (sheet 12→788px, charts redrawn, no internal scroll).
- Plate now fits 1280×800 as well: colophon visible at ~750px, no vertical scroll
  (`canScrollY=false`), canvas stays 16:9 (~732×412), controls remain legible; masthead subtitle
  wraps to two lines gracefully. The earlier +64–90px overflow is fixed in the final build.
- At 1024×768 the spread stacks (folio below the plate) and the page scrolls vertically, which is
  acceptable at that width; horizontal scroll is gone in the final build (`canScrollX=false`), and
  the vitrine remains readable at ~955px wide.

### 5. Reduced motion

`shots/verify-reduced-record-1440.png`. With `prefers-reduced-motion: reduce` emulated the study
still auto-runs, the record opens without entrance animation and the charts draw correctly; no
console errors. No layout difference of note.

### 6. Text/label legibility notes

- Final-build contrast audit flags 25 of 169 sampled text nodes under 4.5:1; the flagged set is
  dominated by the 6.5px embossed initials inside the wax seals (decorative, not labels) and
  a few 8–9px tertiary captions. Rule numerals resolve to ~6.4:1 once the audit accounts for
  hairline ancestor backgrounds. No illegible body text or button labels observed in screenshots.
- Catastrophe banner in the final build is legible after its ~320ms drop-in: wax seal + latin +
  name + consequence + `GEN nn`, with a persistent condition line in the glass.

### 7. Final-build verification notes

- All screenshots in this report are from the final assembled file
  (`round 1/index.html`, sha256 `f820f20a…`, 313.7 KB).
- Final matrix: engine 20/20, static 8/8, browser 41/41 checks pass, 0 blocker/major/minor
  failures; remaining 6 notes are informational only (headless speed, cross-engine float parity,
  contrast sample, environment, tab-order trail).
- Fixed between interim and final runs: `#event-banner` is now `role="status" aria-live="polite"
  aria-atomic="true"`; 1280×800 plate no longer scrolls; 1024px horizontal clip added; banner hide
  timer hardened against rapid consecutive catastrophes; FIG. 1 `aria-labelledby` corrected.
