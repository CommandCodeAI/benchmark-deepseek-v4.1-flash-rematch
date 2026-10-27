# VIVARIUM — Independent Verification Report

Generated: 2026-10-27T19:03:43.603Z

**Deliverable:** `round 1/index.html` — 313.7 KB — sha256 `f820f20a872901d92c5b…`

**Verifier:** node:vm engine harness + headless Chrome CDP (no npm deps). Reproduce with:

```bash
node verify/run-all.mjs              # engine + static + browser + report
node verify/engine.test.mjs          # engine contract only
node verify/static.test.mjs          # single-file/offline only
node verify/browser.test.mjs         # full browser matrix + screenshots
```

## Verdict

**PASS** — 69 checks passed, 0 blocker/major failures.

## PASS/FAIL matrix

### A. Single-file / offline

| id | status | severity | check | evidence |
|----|--------|----------|-------|----------|
| A1 | PASS | blocker | deliverable is one file: `round 1/index.html` is the only file in round 1/ | index.html, 313.7 KB, sha256 f820f20a872901d9 |
| A2 | PASS | blocker | no external <script src> / <link href> / @import / src= images / fonts | no external script/link/img/import/font refs |
| A3 | PASS | blocker | no network APIs in code: fetch/XHR/importScripts/WebSocket/sendBeacon/Worker/import() | none of fetch/XHR/WS/Worker/etc present |
| A4 | PASS | major | remote URL literals: only benign xmlns/comment/prose URLs, never loadable refs | {"total":0,"benign":0,"samples":[],"suspicious":[]} |
| A5 | PASS | blocker | single inline <style> + single inline <script>; no leftover @@PLACEHOLDER@@ markers | 1 style, 1 script, no placeholders |
| A6 | PASS | major | required module globals present in the file: VIVARIUM_ENGINE / _RENDER / _CONTROLS / _DASHBOARD | {"engine":true,"render":true,"controls":true,"dashboard":true} |
| A7 | PASS | info | no obvious placeholder/stub markers left in deliverable (in preparation / pending / TODO / stub) | {"occurrences":[],"note":"clean"} |
| A8 | PASS | minor | reference: file parses (no unbalanced placeholder artifacts) & reasonable size | 313.7 KB / 9049 lines |
| C2 | PASS | blocker | offline: only the local document is requested (network + resource entries) | {"requests":1,"urls":1,"perfEntries":0} |

### B. Engine contract & determinism

| id | status | severity | check | evidence |
|----|--------|----------|-------|----------|
| B1 | PASS | blocker | API surface: all 11 contract functions + GENE_KEYS/SPECIES/CATACLYSMS/DEFAULTS shape | functions ok (aliases: {"snapshotInsteadOfGetSnapshot":true,"getActiveEventsInsteadOfWorldActiveEvents":true}), 3 species |
| B21 | PASS | major | world shape contract: config/seed/generation/tick/ticksIntoGen/finished/counts/history/events/activeEvents | {"missing":[],"deviations":[]} |
| B20 | PASS | minor | PARAMS ranges match the brief (seed/mutation/regrowth/generations/speed/interval) | {"seed":"1..9999/1","mutation":"0..0.2/0.005","regrowth":"0.2..2.5/0.05","generations":"10..120/1","speed":"0.25..8/0.05","interval":"3..20/1"} |
| B2 | PASS | blocker | seed 1977: two worlds, same 40 gens => identical non-stub hash; history complete | hash=e5583cc8, history=41 |
| B3 | PASS | blocker | different seed => different hash (1977 vs 1978/42/9999) | {"42":"74354917","1978":"06b473bc","9999":"73e202c6"} |
| B4 | PASS | blocker | deterministic across two separate node processes (same seed => same hash; different seed differs) | p1=5c39c7a2 p2=5c39c7a2 |
| B5 | PASS | major | hash stable when intervening reads (getStats/snapshot) happen; reads are pure | hash=151e752b |
| B6 | PASS | blocker | history integrity: >=100 gens of counts/traits/events shape, monotonic gens | history=101, events=24, diversity=0.370 |
| B7 | PASS | blocker | all 3 taxa x 4 genes present in every history gen with finite mean/sd (min/max sane) | 41 gens x 3 taxa x 4 genes validated |
| B8-note | note | info | headless speed measured | 100 gens in 3490ms (~14x realtime); benchmark {"ms":3485,"ticksPerSec":861} |
| B8 | PASS | major | headless speed: 100 gens much faster than real time; benchmark ticksPerSec > realtime | 100 gens in 3489.5ms; benchmark={"ms":3485,"ticksPerSec":861} |
| B9 | PASS | major | catastrophe interval control changes frequency (interval 3 vs 12 over 60 gens) | n3=19, n12=4, gaps=[3,3,3,3,3,3,3,3] |
| B10 | PASS | blocker | all three catastrophe types occur over a long run; events well-formed | types={"drought":13,"plague":13,"wildfire":13}, total=39 |
| B11 | PASS | major | catastrophe effects measurable: event active/expires + catastrophes alter run outcome | first=drought@gen3 remaining=2; on!=off; expires |
| B12-short | note | info | setParam(generations) below current generation | finished=true (UI/boot may enforce end-of-run; flag if neither) |
| B12 | PASS | blocker | live setParam: mutation/regrowth/interval/catastrophes read back and take effect | live params ok; events after interval change=7; shortenedFinished=true |
| B13 | PASS | major | extreme params + extinction handled without crash/NaN/negative counts | ran 9 extreme worlds; 6 showed a zero-count species (no crash) |
| B14 | PASS | major | runTick contract: generation = 30 ticks; ticksIntoGen wraps; tick counts | 30 ticks/gen, tick accounting ok |
| B15 | PASS | major | resetWorld: reseeds to gen 0, keeps params, accepts overrides, clears events | reset ok, params retained, initial history entries=1 |
| B16 | PASS | minor | plain serialisable state snapshot incl config/seed/generation/counts/activeEvents | snapshot keys=seed,generation,tick,finished,counts,config,events,activeEvents,historyLength,lastHistory |
| B17 | PASS | blocker | DIRT: engine source contains no Math.random / Date / network / DOM access | no Math.random/Date/DOM/network in engine source |
| B18 | PASS | minor | assembled deliverable inlines engine verbatim (extractable for parity test) | {"snapshot":"f820f20a872901d9","bytes":321258,"engineInlinedVerbatim":true,"note":"engine byte-identical inside deliverable; browser parity check follows in browser suite"} |
| C9 | PASS | blocker | simulation purity: live world (after renderer/controls/playback) equals fresh headless reference | {"hash":"f295d84d","gen":40,"historyGens":41,"counts":{"flora":534,"herbivora":144,"carnivora":41}} |
| B19-note | note | info | cross-engine full-run parity | 40-gen hash differs across JS engines (node=7896c3bc browser=f295d84d); early 3 gens and within-browser determinism agree (expected FP amplification) |
| B19 | PASS | blocker | browser engine: same seed twice => identical hash; reload => same hash; early gens match node | {"seed":1901,"seedDefault":1901,"engineVersion":"1.0.0","browserHash":"f295d84d","nodeEarly":"a880a900","earlyMatch":true,"fullMatch":false} |

### C. Auto-start, completion, errors

| id | status | severity | check | evidence |
|----|--------|----------|-------|----------|
| C1 | PASS | blocker | default URL auto-starts without params: generation advances from 0 | {"startedAfterMs":0,"total":40,"rule":"gen 01 / 40"} |
| C3 | PASS | blocker | auto-transition to THE RECORD at run end (default N=40) | {"autoEndedAfterMs":19791,"meta":"Seed 1901 · 40 generations · 1,200 ticks · 4 catastrophes","title":"A Closed Ecology"} |
| C4 | PASS | blocker | run end reaches configured generation; cursor/status concluded; charts non-blank | {"gen":40,"pop":0.061,"traits":0.1574,"vitrine":0.4308,"rule":{"tickChildren":41,"numerals":["0","5","10","15","20","25","30","35","40"],"numeralCount":9,"cursor":1,"cursorLabel":"GEN 40","progress":"642.938px"}} |
| P6 | PASS | major | URL params: ?gens=12&speed=8 completes fast; ?cat=0 means no events/seals/markers | {"elapsedMs":2806,"meta":"Seed 1901 · 12 generations · 360 ticks · no catastrophes","seals":0,"waxPins":0} |
| C8 | PASS | major | default study seed is the documented 1901; masthead matches world; ?seed=1977 still deterministic | {"default":{"seed":1901,"metaSeed":"1901","worldSeed":1901,"defaults":1901},"seed1977":{"hash":"2255f1de","gen":40}} |

### D. Instrument folio & keyboard

| id | status | severity | check | evidence |
|----|--------|----------|-------|----------|
| D-ENV | note | info | controls mounted: 8; paused=true | seed:INPUT@spinbutton, mutation:INPUT, regrowth:INPUT, generations:INPUT@spinbutton, speed:DIV@slider, interval:DIV@slider, catastrophes:BUTTON@switch, trails:BUTTON@switch |
| D1 | PASS | blocker | all 8 required instruments present; ≥8 sparkline canvases in folio; 4 distinct control builds | {"missing":[],"sparks":8,"sizes":["76x22","76x22","76x22","76x22","76x22","76x22","76x22","76x22"],"nativeRanges":2,"roleSliders":2,"switchLike":2,"steppers":["INPUT/spinbutton","INPUT/spinbutton"]} |
| D2 | PASS | major | every instrument row has label + unit + numeric live readout | {"seed":"iSeedi−+Recast19011 – 9999seed","mutation":"iiMutation ratei00.2000.0606.0% · Δ+39per locus / birth","regrowth":"iiiRegrowthi0.20×2.50×1.00×flora vigour","generations":"ivGenerationsi−+40gen 1generations","speed |
| D3-trail | note | info | tab trail | BUTTON#btn-play > BUTTON#btn-step > BUTTON#btn-conclude > BUTTON#folio-toggle > BUTTON > BUTTON > seed > BUTTON > BUTTON > BUTTON > mutation > BUTTON > regrowth > BUTTON > BUTTON > generations > BUTTON > BUTTON > speed > |
| D3 | PASS | blocker | keyboard: every instrument reachable by Tab | {"stops":29,"instrumentsReached":8} |
| D5 | PASS | blocker | sliders/dials: arrows + Home/End + PageUp/PageDown change values; boundaries respected | {"mutation":{"changedRight":true,"homeEndDiffer":true,"pageUpChanged":true,"pageDownChanged":true,"before":"0.06","home":"0","end":"0.2"},"regrowth":{"changedRight":true,"homeEndDiffer":true,"pageUpChanged":true,"pageDow |
| D6 | PASS | major | steppers (seed/generations) adjustable from keyboard; seed recast resets the study | {"before":"1901","after":"1902","seedText":"1902","gen":0,"recastNote":"The plate i  reca t."} |
| D7 | PASS | major | toggles: Space and Enter flip switch state (aria-checked) | {"trails":{"before":"false","after":"true","changed":true},"catastrophes":{"before":"true","after":"false","changed":true}} |
| D8 | PASS | major | tooltips: appear on hover AND focus, have content, dismiss on Escape, aria-describedby wired | {"triggers":19,"hoverOk":true,"escOk":true,"focusOk":true,"describedByOk":true,"inViewport":true,"sample":"viii · field noteGhost trailsFaint pencil ghosts behind each creature, showing the last few ticks of its path. A  |
| D9 | PASS | major | folio fold/unfold: collapses to spine, folded controls leave tab order, state persists after reload | {"before":383,"folded":34,"expanded":383,"persisted":true,"afterReloadWidth":34} |
| D11 | PASS | major | pause/resume + step shortcuts: Space halts/resumes, G advances exactly one generation | {"before":2,"pausedAt":2,"stepped":3,"resumed":4} |
| D12 | PASS | minor | shortcuts: ? opens shortcut note, Escape closes; typing in seed input does not trigger shortcuts | {"noteOpened":true,"typingProtected":true} |
| D13 | PASS | blocker | live params: mutation/speed/interval readouts update and apply; generations shortening ends the run | {"mutation":"0.06 -> 0.08","speedRow":"vTempoilogarithmic scale0.25×8×8.0×60 t/s realisedticks / se","rate":"8.0× · 240 ticks/s","intervalRow":"viWeather rhythmiweather rhythm3203seal every 3 gengens betw","endedAfterMs" |
| D14 | PASS | minor | specimen tag: hovering/clicking a creature pins a card with taxon, genes+units, energy/age | {"text":"Lepus agrestisHerbivoraSpeed1.52 cells/tickVision7.79 cellsMetabolism1.11 indexThreshold0.97 energyClick the glass to pin · energy 0.25"} |

### E. Catastrophes

| id | status | severity | check | evidence |
|----|--------|----------|-------|----------|
| E1 | PASS | blocker | catastrophe fires automatically: banner appears with latin/name/gen/note and live region | {"bannersSeen":["Pestilentia\|Plague\|GEN 08","Incendium\|Wildfire\|GEN 16","Siccitas\|Drought\|GEN 24","Pestilentia\|Plague\|GEN 32"],"note":"A pestilence moves through the fauna; the weak are taken first."} |
| E2 | PASS | major | event wash seen on page during catastrophe (watercolour overlay, no flash) | {"exists":true,"cls":"wash is-active is-plague","opacity":"0","background":"rgba(0, 0, 0, 0)","hasEventClass":true,"hidden":false,"rect":{"x":0,"y":0,"w":1440,"h":900,"right":1440,"bottom":900}} |
| E3 | PASS | major | persistent condition note appears while catastrophe active | PESTILENTIA · 2 SEASONS REMAIN |
| E4 | PASS | major | wax seals pinned on rule + ledger entries appended for events | {"seals":4,"ledgerEntries":6,"counter":"06","eventEntry":"GEN 08Pestilentia · Plague. A pestilence moves through the fauna; the weak are taken first."} |
| E5 | PASS | major | dashboard shows catastrophe markers (rust/violet ink pixels on census chart) | {"waxPins":53,"broadWax":1792,"rust":3960} |

### F. THE RECORD dashboard

| id | status | severity | check | evidence |
|----|--------|----------|-------|----------|
| F1 | PASS | blocker | record layout: fits 1440×900 without scroll; header/meta/summary populated; 3 actions present | {"title":"A Closed Ecology","meta":"Seed 1901 · 40 generations · 1,200 ticks · 12 catastrophes","summaryLen":451,"actions":["↺ Replay this seed","✳ New study","← Return to the plate"]} |
| F2 | PASS | blocker | FIG.2 census chart: ink + all three species colours present, axes/legible ink, catastrophe markers | {"nonBgRatio":0.0728,"dark":1534,"flora":3594,"fauna":6051,"predator":4904,"waxPins":153} |
| F3 | PASS | blocker | FIG.3-14 trait chart: 3×4 matrix all cells drawn (mean line + spread band) | {"nonBgRatio":0.1622,"dark":627,"nearInk":281,"minCell":0.14477987421383648,"dpr":1} |
| F4 | PASS | major | record fits 1280×800 and charts re-render on resize (DPR-aware) | {"sheet":{"x":23,"y":12,"w":1233.9,"h":776,"right":1257,"bottom":788},"sheetScroll":{"scrollH":774,"clientH":774,"scrollW":1232,"clientW":1232},"pop":0.0905,"traits":0.1619} |
| F5 | PASS | major | record summary card: catastrophe roster + survival/diversity evidence | {"summary":"Summary of the Studyseed 1901 · 40 gen · 12 weathersFinal censusFlora16peak 1,085 · −98%Herbivora229peak 232 · +173%Carnivora27peak 50 · +35%WeatherPPestilentiaG05IIncendiumG08SSiccitasG11IIncendiumG14SSiccit |
| F6 | PASS | blocker | record actions work: Replay this seed / New study / Return to the plate | {"replay":{"recordHidden":true,"seedAfter":"1901","seedBefore":"1901","gen":7},"newSeed":{"recordHidden":true,"seedChanged":true,"seedAfter":"5526","gen":7},"back":{"recordHidden":true,"plateVisible":true}} |

### G. Accessibility & motion

| id | status | severity | check | evidence |
|----|--------|----------|-------|----------|
| G-ARIA | PASS | major | ARIA: sliders valuemin/max/now, switches aria-checked, canvases role=img+label, no unnamed buttons | {"sliders":4,"switches":2,"canvases":11,"charts":["sim-canvas","chart-pop","chart-traits"],"live":3} |
| G-SKIP | PASS | major | skip link: present, first Tab stop, visible on focus, jumps to the plate canvas | {"text":"Skip to the specimen under glass","href":"#sim-canvas","rect":{"x":16,"y":-60,"w":263.984375,"h":33.9375},"visible":true,"after":{"hash":"#sim-canvas","active":"sim-canvas"}} |
| D4 | PASS | major | keyboard focus state visible on every stop (2px ink outline / brass tick) | {"stops":28,"sampleOutline":"solid 2px rgb(33, 29, 22) offset 3px"} |
| G-CONTRAST | note | info | contrast: 25 low-contrast text nodes of 169 sampled (<4.5:1) | [{"tag":"SPAN","cls":"rule__seal rule__seal--plague","text":"P","ratio":1.13,"fs":6.5},{"tag":"SPAN","cls":"rule__seal rule__seal--drought","text":"S","ratio":1.13,"fs":6.5},{"tag":"SPAN","cls":"rule__seal rule__seal--wi |
| G-RM | PASS | major | prefers-reduced-motion: emulation active, page still auto-runs, record reachable, no errors | {"startedAfterMs":1,"rm":true} |

### H. Layout / responsive / screenshots

| id | status | severity | check | evidence |
|----|--------|----------|-------|----------|
| D10 | PASS | major | no clipping at 1440×900: no page scroll, controls inside viewport, no clipped text | {"itemCount":2,"canScroll":[false,false],"overflowVisible":2} |
| H-1280 | PASS | major | 1280×800: no page scroll / horizontal overflow; controls inside viewport; canvas legible size | {"doc":{"w":1280,"h":800},"canvas":{"cssW":732.4,"cssH":412},"items":2} |
| H-1024 | PASS | minor | 1024×768: degrades without horizontal overflow; plate + folio remain usable | {"doc":{"x":0,"y":0,"scrollH":1314,"scrollW":1024},"canScrollX":false,"canvas":{"cssW":942,"cssH":529.9},"items":221} |

### I. Runtime errors

| id | status | severity | check | evidence |
|----|--------|----------|-------|----------|
| C5 | PASS | blocker | zero console errors / page exceptions / failed requests during full default run | no errors |
| C6 | PASS | blocker | zero JS/console errors across control + keyboard interactions | no errors |
| C7 | PASS | blocker | no JS errors during fast run + dashboard interactions | no errors |

### Environment

| id | status | severity | check | evidence |
|----|--------|----------|-------|----------|
| ENV | note | info | testing snapshot f820f20a872901d9 (313.7 KB, stable=true) | file:///work/bench3/naz-dsh/work/verify/snapshots/browser-2026-10-27T18-57-03-862Z.html |
| ENV-BROWSER | note | info | headless Chrome version | Chrome/156.0.8078.48 / protocol 1.3 |

## Prioritized findings

No failures recorded.

## Documented deviations from the original brief

These were agreed with the Lead and/or are recorded in the (Lead-updated) DESIGN-BRIEF.md:

- **Default specimen seed = 1901, not 1977.** Brief §7 “Default specimen” and §9 `DEFAULTS` were updated by the Lead to 1901 (Chromium-verified: all three kingdoms persist through the study). Verified: world seed == masthead seed == engine DEFAULTS.seed == 1901, and `?seed=1977` still reproduces its own deterministic run. Note: the §5 controls table still lists “default 1977” — documentation inconsistency only.
- **`world.activeEvents`** is exposed as a live getter (plus `getActiveEvents()` / `getStats().activeEvents`) and **`getSnapshot`** is provided as an alias of `snapshot`; both contract names now exist (B1/B21 pass).
- **Headless speed**: 100 generations ≈3.4–3.5 s on this machine (~14× real time, not sub-second). Brief only requires “faster than real time”; flagged as a performance note, not a failure.
- **Cross-engine float parity**: node:vm vs Chrome full-run hashes diverge over 40 generations (transcendental float differences amplify chaotically); within-Chrome determinism (same seed twice / after reload) and node cross-process determinism are exact, and the first generations match across engines. Confirmed with Lead as expected, not a product failure.

## Notes & observations (not failures)

- **B8-note** (engine): headless speed measured — 100 gens in 3490ms (~14x realtime); benchmark {"ms":3485,"ticksPerSec":861}
- **B12-short** (engine): setParam(generations) below current generation — finished=true (UI/boot may enforce end-of-run; flag if neither)
- **ENV** (env): testing snapshot f820f20a872901d9 (313.7 KB, stable=true) — file:///work/bench3/naz-dsh/work/verify/snapshots/browser-2026-10-27T18-57-03-862Z.html
- **ENV-BROWSER** (env): headless Chrome version — Chrome/156.0.8078.48 / protocol 1.3
- **D-ENV** (controls): controls mounted: 8; paused=true — seed:INPUT@spinbutton, mutation:INPUT, regrowth:INPUT, generations:INPUT@spinbutton, speed:DIV@slider, interval:DIV@slider, catastrophes:BUTTON@switch, trails:BUTTON@switch
- **D3-trail** (controls): tab trail — BUTTON#btn-play > BUTTON#btn-step > BUTTON#btn-conclude > BUTTON#folio-toggle > BUTTON > BUTTON > seed > BUTTON > BUTTON > BUTTON > mutation > BUTTON > regrowth > BUTTON > BUTTON > generations > BUTTON > BUTTON > speed > BUTTON > interval > BUTTON > catastrophes > BUTTON > trails > BODY > A > CANVAS#sim-canvas > BUTTON#btn-play
- **G-CONTRAST** (a11y): contrast: 25 low-contrast text nodes of 169 sampled (<4.5:1) — [{"tag":"SPAN","cls":"rule__seal rule__seal--plague","text":"P","ratio":1.13,"fs":6.5},{"tag":"SPAN","cls":"rule__seal rule__seal--drought","text":"S","ratio":1.13,"fs":6.5},{"tag":"SPAN","cls":"rule__seal rule__seal--wildfire","text":"I","ratio":1.13,"fs":6.5},{"tag":"SPAN","cls":"rule__seal rule__seal--wildfire","text":"I","ratio":1.13,"fs":6.5},{"tag":"SPAN","cls":"rule__seal rule__seal--drought","text":"S","ratio":1.13,"fs":6.5},{"tag":"SPAN","cls":"rule__seal rule__seal--plague","text":"P",
- **B19-note** (engine): cross-engine full-run parity — 40-gen hash differs across JS engines (node=7896c3bc browser=f295d84d); early 3 gens and within-browser determinism agree (expected FP amplification)

## Brief §12 acceptance checklist mapping

| # | requirement | result |
|---|-------------|--------|
| 1 | One file, no external requests | PASS — A1, A2, A3, A4, C2 |
| 2 | Auto-starts; deterministic seed; N-gen run ends; dashboard appears | PASS — C1, C3, C4, B2, B3 |
| 3 | Seeded PRNG; headless faster than real time; DOM-free engine | PASS — B17, B4, B8, B6 |
| 4 | Genes mutate on reproduction; traits visible in tag + charts | PASS — B7, B13, F3 |
| 5 | Controls live, units, ranges, readouts; custom builds; sparklines; tooltip+keyboard+focus | PASS — D1, D2, D5, D7, D8, D13 |
| 6 | Catastrophes fire automatically, configurable, 3 types, banner+seal+ledger+markers | PASS — E1, E2, E3, E4, E5, B9, B10 |
| 7 | Charts: population + per-gene mean/spread per species, canvas | PASS — F2, F3 |
| 8 | Composition coherent; signature rule; no scroll at 1440×900 | PASS — D10, F1, H-1280, C4 |
| 9 | Accessible (focus, ARIA, reduced motion) and performant | PASS — D3, D4, G-ARIA, G-SKIP, G-RM, B8 |
| 10 | Screenshots 1440×900 initial/mid/event/final + 1280×800 | PASS — 17 screenshots |

## Screenshots

All in `shots/`, captured headless at DPR 1:

| file | size | viewport | moment |
|------|------|----------|--------|
| shots/verify-event-1440-1.png | 1440×900 (1155 KB) | 1440×900 | 1440×900 · catastrophe banner up |
| shots/verify-event-1440-2.png | 1440×900 (1168 KB) | 1440×900 | 1440×900 · another catastrophe type |
| shots/verify-event-1440-3.png | 1440×900 (1172 KB) | 1440×900 | 1440×900 · another catastrophe type |
| shots/verify-event-1440-4.png | 1440×900 (1133 KB) | 1440×900 | 1440×900 · another catastrophe type |
| shots/verify-initial-1024.png | 1024×768 (830 KB) | 1024×768 | captured |
| shots/verify-initial-1280.png | 1280×800 (857 KB) | 1280×800 | 1280×800 · plate |
| shots/verify-initial-1440.png | 1440×900 (1086 KB) | 1440×900 | 1440×900 · t≈1.2 s auto-run |
| shots/verify-mid-1440.png | 1440×900 (1066 KB) | 1440×900 | 1440×900 · mid-run, seals in ledger |
| shots/verify-module-folio-1440.png | 1440×900 (1062 KB) | 1440×900 | module QA · controls folio (pre-integration) |
| shots/verify-module-folio-folded-1440.png | 1440×900 (944 KB) | 1440×900 | module QA · folio folded |
| shots/verify-module-plate-1440.png | 1440×900 (1062 KB) | 1440×900 | module QA · renderer plate (pre-integration) |
| shots/verify-module-record-1440.png | 1440×900 (903 KB) | 1440×900 | module QA · dashboard (pre-integration) |
| shots/verify-record-1280.png | 1280×800 (801 KB) | 1280×800 | 1280×800 · THE RECORD |
| shots/verify-record-1440.png | 1440×900 (907 KB) | 1440×900 | 1440×900 · THE RECORD after natural 40-gen end |
| shots/verify-record-fast-1440.png | 1440×900 (1080 KB) | 1440×900 | 1440×900 · THE RECORD (fast run) |
| shots/verify-record-nocat-1440.png | 1440×900 (866 KB) | 1440×900 | 1440×900 · THE RECORD with ?cat=0 (no weather) |
| shots/verify-reduced-record-1440.png | 1440×900 (1072 KB) | 1440×900 | 1440×900 · record under reduced motion |

## Visual inspection (manual, read_image)

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

## Remaining risks / not covered

- Pixel "legibility" of canvas axis text is checked heuristically (ink-pixel counts + screenshot review); no OCR.
- Contrast audit is approximate (computed styles, solid backgrounds only); gradient/texture backgrounds are estimated.
- Engine performance measured in node, not CPU-throttled; in-browser frame rate during max speed should be spot-checked on slower hardware.
- Cross-browser (Safari/Firefox) and real GPU rendering are out of scope of this harness (headless Chrome only).
- No automated test of pointer-drag on rotary dials (keyboard semantics covered); manual spot check recommended.
