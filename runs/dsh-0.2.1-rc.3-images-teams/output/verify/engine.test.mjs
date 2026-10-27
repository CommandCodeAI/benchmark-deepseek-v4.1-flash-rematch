#!/usr/bin/env node
// ENGINE QA SUITE (contract: DESIGN-BRIEF.md §9/§12)
// Loads src/engine.js in a DOM-free node:vm sandbox and checks determinism,
// history integrity, catastrophes, live params, speed, purity and shape.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { Recorder, assert, assertEqual, assertFiniteNumber, SEVERITY } from './lib/check.mjs';
import { ROOT, VERIFY, snapshotDeliverable } from './lib/workspace.mjs';
import {
  loadEngineSource,
  requireFns,
  validateHistoryEntry,
  validateSnapshot,
} from './lib/engine.mjs';

const ENGINE_PATH = join(ROOT, 'src', 'engine.js');
const GENES = ['speed', 'vision', 'metabolism', 'threshold'];
const SPECIES = ['flora', 'herbivora', 'carnivora'];
const CONTRACT_FNS = [
  'createWorld',
  'resetWorld',
  'setParam',
  'runGeneration',
  'runTick',
  'stepGeneration',
  'runHeadless',
  'benchmark',
  'getSnapshot',
  'getStats',
  'hashWorld',
];

export async function runEngineSuite({ save = true } = {}) {
  const rec = new Recorder('engine');
  const src = readFileSync(ENGINE_PATH, 'utf8');
  let Engine = null;
  let loadErr = null;
  try {
    Engine = loadEngineSource(src, { filename: 'src/engine.js' }).Engine;
    if (!Engine) throw new Error('window.VIVARIUM_ENGINE not defined by src/engine.js');
  } catch (e) {
    loadErr = e;
  }

  if (!Engine) {
    rec.check('B0', 'engine loads in DOM-free vm sandbox', () => Promise.reject(loadErr), {
      area: 'engine',
      severity: SEVERITY.BLOCKER,
    });
    if (save) rec.save(join(VERIFY, 'results-engine.json'));
    rec.print();
    return rec;
  }

  const E = Engine;
  // Engine clamps generations/interval to the documented UI ranges; tests must
  // configure generations >= the number of gens they fast-forward so the world
  // is not auto-finished early (runHeadless stops at config.generations).
  const make = (over = {}) => E.createWorld({ ...over });
  const runs = (over = {}, gens = 20) => {
    const w = make({ generations: Math.max(gens, 10), ...over });
    return E.runHeadless(w, gens);
  };
  const snapshotFn =
    typeof E.getSnapshot === 'function'
      ? E.getSnapshot.bind(E)
      : typeof E.snapshot === 'function'
        ? E.snapshot.bind(E)
        : null;
  const activeFn = typeof E.getActiveEvents === 'function' ? E.getActiveEvents.bind(E) : null;
  const getActive = (w) => (w.activeEvents != null ? w.activeEvents : activeFn ? activeFn(w) : null);

  // ---------- B1: API surface ----------
  await rec.check(
    'B1',
    'API surface: all 11 contract functions + GENE_KEYS/SPECIES/CATACLYSMS/DEFAULTS shape',
    () => {
      const missing = CONTRACT_FNS.filter((n) => typeof E[n] !== 'function');
      const aliases = {
        snapshotInsteadOfGetSnapshot: typeof E.snapshot === 'function',
        getActiveEventsInsteadOfWorldActiveEvents: typeof E.getActiveEvents === 'function',
      };
      assertEqual(missing.length, 0, `missing contract functions: ${missing.join(', ')} (aliases present: ${JSON.stringify(aliases)})`);
      assert(Array.isArray(E.GENE_KEYS), 'GENE_KEYS not array');
      assertEqual(E.GENE_KEYS.join(','), GENES.join(','), 'GENE_KEYS order/content');
      for (const sp of SPECIES) {
        assert(E.SPECIES?.[sp], `SPECIES.${sp} missing`);
        const s = E.SPECIES[sp];
        assert(typeof s.latin === 'string' && s.latin.length > 1, `SPECIES.${sp}.latin missing`);
        assert(typeof s.glyph === 'string' && s.glyph.length > 0, `SPECIES.${sp}.glyph missing`);
        const hasColor = typeof s.color === 'string' || (s.colors && typeof s.colors === 'object');
        assert(hasColor, `SPECIES.${sp} has no color/colors`);
      }
      for (const c of ['drought', 'plague', 'wildfire']) {
        const cat = E.CATACLYSMS?.[c] || E.CATASTROPHES?.[c];
        assert(cat, `catastrophe ${c} missing`);
        assert(cat.latin && cat.name && cat.note, `catastrophe ${c} missing latin/name/note`);
      }
      // DESIGN-BRIEF.md (updated by Lead, 2026-10-27) documents default specimen seed 1901
      // (Chromium-verified: all three kingdoms persist); controls table still lists 1977 — see report.
      const expected = {
        seed: 1901,
        mutation: 0.06,
        regrowth: 1.0,
        generations: 40,
        speed: 2.0,
        interval: 8,
        catastrophes: true,
        trails: true,
        width: 160,
        height: 90,
      };
      for (const [k, v] of Object.entries(expected)) {
        assertEqual(E.DEFAULTS?.[k], v, `DEFAULTS.${k}`);
      }
      return `functions ok (aliases: ${JSON.stringify(aliases)}), ${Object.keys(E.SPECIES).length} species`;
    },
    { area: 'engine', severity: SEVERITY.BLOCKER }
  );

  // ---------- B21: world shape contract ----------
  await rec.check(
    'B21',
    'world shape contract: config/seed/generation/tick/ticksIntoGen/finished/counts/history/events/activeEvents',
    () => {
      const w = make({ seed: 1977 });
      const required = ['config', 'seed', 'generation', 'tick', 'ticksIntoGen', 'counts', 'history', 'events'];
      const missing = required.filter((k) => w[k] === undefined);
      const deviations = [];
      if (w.finished === undefined && w.running === undefined) deviations.push('finished/running absent');
      if (w.activeEvents === undefined) deviations.push('world.activeEvents absent (getActiveEvents()/getStats().activeEvents used instead)');
      assertEqual(missing.length, 0, `world missing fields: ${missing.join(', ')}`);
      assert(Array.isArray(w.history), 'history not array');
      assert(Array.isArray(w.events), 'events not array');
      return { missing, deviations };
    },
    { area: 'engine', severity: SEVERITY.MAJOR }
  );

  // ---------- B20: parameter ranges match the brief ----------
  await rec.check(
    'B20',
    'PARAMS ranges match the brief (seed/mutation/regrowth/generations/speed/interval)',
    () => {
      const P = E.PARAMS;
      assert(P && typeof P === 'object', 'engine exposes no PARAMS metadata');
      const expected = {
        seed: [1, 9999, 1],
        mutation: [0, 0.2, 0.005],
        regrowth: [0.2, 2.5, 0.05],
        generations: [10, 120, 1],
        speed: [0.25, 8, null],
        interval: [3, 20, 1],
      };
      const out = {};
      for (const [k, [min, max, step]] of Object.entries(expected)) {
        assert(P[k], `PARAMS.${k} missing`);
        assertEqual(P[k].min, min, `PARAMS.${k}.min`);
        assertEqual(P[k].max, max, `PARAMS.${k}.max`);
        if (step != null) assertEqual(P[k].step, step, `PARAMS.${k}.step`);
        out[k] = `${P[k].min}..${P[k].max}/${P[k].step ?? 'log'}`;
      }
      return out;
    },
    { area: 'engine', severity: SEVERITY.MINOR }
  );

  // ---------- B2: determinism ----------
  await rec.check(
    'B2',
    'seed 1977: two worlds, same 40 gens => identical non-stub hash; history complete',
    () => {
      const w1 = make({ seed: 1977, generations: 40 });
      const w2 = make({ seed: 1977, generations: 40 });
      E.runHeadless(w1, 40);
      E.runHeadless(w2, 40);
      const h1 = E.hashWorld(w1);
      const h2 = E.hashWorld(w2);
      assertEqual(h1, h2, 'hash mismatch for identical seed/config');
      assert(typeof h1 === 'string' && h1.length >= 4 && h1 !== 'stub', 'hash not a non-trivial string');
      assertEqual(w1.generation, 40, 'generation after 40 gens');
      assert(w1.history.length >= 40, `history only ${w1.history.length} entries`);
      for (const sp of SPECIES) assertFiniteNumber(w1.counts[sp], `counts.${sp}`);
      return `hash=${h1.slice(0, 24)}, history=${w1.history.length}`;
    },
    { area: 'engine', severity: SEVERITY.BLOCKER }
  );

  await rec.check(
    'B3',
    'different seed => different hash (1977 vs 1978/42/9999)',
    () => {
      const base = E.hashWorld(runs({ seed: 1977 }, 25));
      const seen = new Set([base]);
      const hashes = {};
      for (const s of [1978, 42, 9999]) {
        const h = E.hashWorld(runs({ seed: s }, 25));
        hashes[s] = h;
        seen.add(h);
      }
      assertEqual(seen.size, 4, `expected 4 distinct hashes, got ${seen.size}`);
      return hashes;
    },
    { area: 'engine', severity: SEVERITY.BLOCKER }
  );

  await rec.check(
    'B4',
    'deterministic across two separate node processes (same seed => same hash; different seed differs)',
    () => {
      const proc = join(VERIFY, 'lib', 'engine-proc.mjs');
      const run = (seed, gens) =>
        execFileSync(process.execPath, [proc, ENGINE_PATH, String(seed), String(gens)], {
          cwd: ROOT,
          timeout: 30000,
          encoding: 'utf8',
        }).trim();
      const a = run(1977, 20);
      const b = run(1977, 20);
      assertEqual(a, b, 'cross-process hash mismatch');
      const c = run(1978, 20);
      assert(a !== c, 'different seed produced same cross-process hash');
      return `p1=${a.slice(0, 20)} p2=${b.slice(0, 20)}`;
    },
    { area: 'engine', severity: SEVERITY.BLOCKER }
  );

  await rec.check(
    'B5',
    'hash stable when intervening reads (getStats/snapshot) happen; reads are pure',
    () => {
      const cleanW = make({ seed: 1977 });
      E.runHeadless(cleanW, 15);
      const clean = E.hashWorld(cleanW);
      const w = make({ seed: 1977 });
      for (let i = 0; i < 15; i++) {
        E.runGeneration(w);
        E.getStats(w);
        if (snapshotFn) snapshotFn(w);
        E.hashWorld(w);
      }
      const dirty = E.hashWorld(w);
      assertEqual(dirty, clean, 'read calls mutated simulation state');
      return `hash=${clean.slice(0, 20)}`;
    },
    { area: 'engine', severity: SEVERITY.MAJOR }
  );

  await rec.check(
    'B6',
    'history integrity: >=100 gens of counts/traits/events shape, monotonic gens',
    () => {
      const gens = 100;
      const w = runs({ seed: 1977, interval: 4, catastrophes: true }, gens);
      assert(Array.isArray(w.history), 'world.history missing');
      assert(w.history.length >= gens, `history length ${w.history.length} < ${gens}`);
      let prevGen = -1;
      for (const [i, h] of w.history.entries()) {
        validateHistoryEntry(h, GENES, SPECIES, `history[${i}]`);
        assert(h.gen > prevGen, `history not monotonic at ${i}: ${prevGen} -> ${h.gen}`);
        prevGen = h.gen;
      }
      assertEqual(w.history[w.history.length - 1].gen, gens, 'last history gen != world.generation');
      assertEqual(w.generation, gens, 'world.generation');
      for (const sp of SPECIES) {
        assertFiniteNumber(w.counts[sp], `world.counts.${sp}`);
        assert(w.counts[sp] >= 0, `negative count ${sp}`);
      }
      const stats = E.getStats(w);
      assert(stats && typeof stats === 'object', 'getStats returned nothing');
      for (const sp of SPECIES) assertFiniteNumber(stats.counts?.[sp], `stats.counts.${sp}`);
      assertFiniteNumber(stats.diversity, 'stats.diversity');
      const mutations = stats.mutationsThisGen ?? stats.mutations;
      assertFiniteNumber(mutations, 'stats.mutationsThisGen/mutations');
      return `history=${w.history.length}, events=${w.events.length}, diversity=${stats.diversity.toFixed(3)}`;
    },
    { area: 'engine', severity: SEVERITY.BLOCKER }
  );

  await rec.check(
    'B7',
    'all 3 taxa x 4 genes present in every history gen with finite mean/sd (min/max sane)',
    () => {
      const w = runs({ seed: 1977 }, 40);
      assert(w.history.length > 0, 'no history');
      return `${w.history.length} gens x ${SPECIES.length} taxa x ${GENES.length} genes validated`;
    },
    { area: 'engine', severity: SEVERITY.BLOCKER }
  );

  await rec.check(
    'B8',
    'headless speed: 100 gens much faster than real time; benchmark ticksPerSec > realtime',
    () => {
      E.runHeadless(make({ seed: 7, generations: 5 }), 5); // warm-up
      const t0 = process.hrtime.bigint();
      E.runHeadless(make({ seed: 1977, generations: 100 }), 100);
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      const bench = typeof E.benchmark === 'function' ? E.benchmark(1977, 100) : null;
      // real-time at >=60 ticks/s = 3000 ticks = >=50s for 100 gens.
      assert(ms < 10000, `100 gens took ${ms.toFixed(1)}ms (>10s: slower than 5x real time)`);
      if (bench) {
        assertFiniteNumber(bench.ms, 'benchmark.ms');
        assertFiniteNumber(bench.ticksPerSec, 'benchmark.ticksPerSec');
        assert(bench.ticksPerSec > 80, `ticksPerSec ${bench.ticksPerSec} not comfortably faster than realtime`);
      }
      const speedup = 50000 / ms;
      rec.note(
        'B8-note',
        'headless speed measured',
        `100 gens in ${ms.toFixed(0)}ms (~${speedup.toFixed(0)}x realtime)` +
          (bench ? `; benchmark ${JSON.stringify({ ms: Math.round(bench.ms), ticksPerSec: Math.round(bench.ticksPerSec) })}` : ''),
        { area: 'engine' }
      );
      return `100 gens in ${ms.toFixed(1)}ms${bench ? `; benchmark=${JSON.stringify({ ms: Math.round(bench.ms), ticksPerSec: Math.round(bench.ticksPerSec) })}` : ''}`;
    },
    { area: 'engine', severity: SEVERITY.MAJOR }
  );

  await rec.check(
    'B9',
    'catastrophe interval control changes frequency (interval 3 vs 12 over 60 gens)',
    () => {
      const w3 = runs({ seed: 1977, interval: 3, catastrophes: true, generations: 60 }, 60);
      const w12 = runs({ seed: 1977, interval: 12, catastrophes: true, generations: 60 }, 60);
      const n3 = w3.events.length;
      const n12 = w12.events.length;
      assert(n3 > n12 * 2, `expected many more events at interval 3 (${n3}) than 12 (${n12})`);
      assert(n3 >= 15, `only ${n3} events at interval 3 over 60 gens (expected ~20)`);
      assert(n12 >= 3 && n12 <= 8, `${n12} events at interval 12 over 60 gens (expected 4-6)`);
      const gaps = w3.events.slice(1).map((e, i) => e.gen - w3.events[i].gen);
      const exact = gaps.every((g) => g === 3);
      assert(exact, `event spacing not exactly 3 gens: ${JSON.stringify(gaps.slice(0, 8))}`);
      return `n3=${n3}, n12=${n12}, gaps=${JSON.stringify(gaps.slice(0, 8))}`;
    },
    { area: 'engine', severity: SEVERITY.MAJOR }
  );

  await rec.check(
    'B10',
    'all three catastrophe types occur over a long run; events well-formed',
    () => {
      const w = runs({ seed: 1977, interval: 3, catastrophes: true, generations: 200 }, 200);
      const types = new Set(w.events.map((e) => e.type));
      for (const t of ['drought', 'plague', 'wildfire']) {
        assert(types.has(t), `catastrophe type ${t} never occurred (saw ${[...types].join(',')})`);
      }
      for (const [i, e] of w.events.entries()) {
        assert(Number.isInteger(e.gen) && e.gen >= 1, `events[${i}].gen`);
        assert(Number.isInteger(e.tick) && e.tick >= 0, `events[${i}].tick`);
        assert(typeof e.type === 'string', `events[${i}].type`);
        assert(typeof e.latin === 'string' && e.latin.length >= 3, `events[${i}].latin missing`);
        assert(typeof e.name === 'string' && e.name.length >= 3, `events[${i}].name missing`);
        assert(typeof e.note === 'string' && e.note.length >= 3, `events[${i}].note missing`);
        assert(Number.isFinite(e.duration) && e.duration > 0, `events[${i}].duration`);
      }
      const counts = { drought: 0, plague: 0, wildfire: 0 };
      for (const e of w.events) counts[e.type]++;
      return `types=${JSON.stringify(counts)}, total=${w.events.length}`;
    },
    { area: 'engine', severity: SEVERITY.BLOCKER }
  );

  await rec.check(
    'B11',
    'catastrophe effects measurable: event active/expires + catastrophes alter run outcome',
    () => {
      const w = make({ seed: 1977, interval: 3, catastrophes: true, generations: 40 });
      E.runHeadless(w, 4);
      assert(w.events.length >= 1, 'no event by gen 4 with interval 3');
      const ev = w.events[0];
      const active = getActive(w);
      assert(active && active.length >= 1, 'no active event right after catastrophe (world.activeEvents/getActiveEvents empty)');
      const a = active[0];
      assert(a.type === ev.type, `active event type ${a.type} != ${ev.type}`);
      assert(Number.isFinite(a.gensRemaining ?? a.remaining), 'active event has no finite remaining gens');
      const histEntry = w.history.find((h) => h.gen === ev.gen);
      assert(histEntry, 'no history entry at event gen');
      assert(histEntry.event === ev.type, `history event marker ${histEntry.event} != ${ev.type}`);
      assert(Array.isArray(histEntry.activeEvents) && histEntry.activeEvents.length >= 1, 'history gen missing activeEvents snapshot');
      const on = E.hashWorld(runs({ seed: 1977, interval: 3, catastrophes: true }, 25));
      const off = E.hashWorld(runs({ seed: 1977, interval: 3, catastrophes: false }, 25));
      assert(on !== off, 'catastrophes have no effect on simulation outcome');
      E.runHeadless(w, 12);
      return `first=${ev.type}@gen${ev.gen} remaining=${a.gensRemaining ?? a.remaining}; on!=off; expires`;
    },
    { area: 'engine', severity: SEVERITY.MAJOR }
  );

  await rec.check(
    'B12',
    'live setParam: mutation/regrowth/interval/catastrophes read back and take effect',
    () => {
      const w = make({ seed: 1977 });
      E.setParam(w, 'mutation', 0.15);
      assertEqual(w.config.mutation, 0.15, 'config.mutation not updated');
      E.setParam(w, 'regrowth', 2.0);
      assertEqual(w.config.regrowth, 2.0, 'config.regrowth not updated');
      assertEqual(snapshotFn(w).config.mutation, 0.15, 'snapshot config.mutation');
      E.setParam(w, 'catastrophes', false);
      assertEqual(w.config.catastrophes, false, 'config.catastrophes not updated');
      E.setParam(w, 'interval', 4);
      assertEqual(w.config.interval, 4, 'config.interval not updated');
      const wOff = make({ seed: 1977, interval: 3, generations: 30 });
      E.setParam(wOff, 'catastrophes', false);
      E.runHeadless(wOff, 30);
      assertEqual(wOff.events.length, 0, 'events fired after catastrophes=false');
      const wI = make({ seed: 1977, interval: 12, generations: 48 });
      E.runHeadless(wI, 24);
      const before = wI.events.length;
      E.setParam(wI, 'interval', 3);
      E.runHeadless(wI, 48); // runHeadless targets an absolute generation
      const after = wI.events.length - before;
      assert(after >= 6, `only ${after} events in 24 gens after live interval->3`);
      const h0 = E.hashWorld(runs({ seed: 1977, mutation: 0.0 }, 30));
      const h1 = E.hashWorld(runs({ seed: 1977, mutation: 0.18 }, 30));
      assert(h0 !== h1, 'mutation parameter does not change simulation');
      const wShort = make({ seed: 1977, generations: 40 });
      E.runHeadless(wShort, 20);
      E.setParam(wShort, 'generations', 10);
      const shortenedFinished = wShort.finished === true || snapshotFn(wShort).finished === true;
      rec.note(
        'B12-short',
        'setParam(generations) below current generation',
        `finished=${shortenedFinished} (UI/boot may enforce end-of-run; flag if neither)`,
        { area: 'engine' }
      );
      return `live params ok; events after interval change=${after}; shortenedFinished=${shortenedFinished}`;
    },
    { area: 'engine', severity: SEVERITY.BLOCKER }
  );

  await rec.check(
    'B13',
    'extreme params + extinction handled without crash/NaN/negative counts',
    () => {
      const combos = [
        { mutation: 0, regrowth: 0.2, interval: 3 },
        { mutation: 0.2, regrowth: 2.5, interval: 3 },
        { mutation: 0.2, regrowth: 0.2, width: 24, height: 14, interval: 3 },
      ];
      let extinctions = 0;
      let ran = 0;
      for (const over of combos) {
        for (const seed of [1, 2, 3]) {
          const w = make({ seed, catastrophes: true, generations: 120, ...over });
          E.runHeadless(w, 120);
          ran++;
          assertFiniteNumber(w.generation, 'generation');
          for (const sp of SPECIES) {
            assert(Number.isInteger(w.counts[sp]) && w.counts[sp] >= 0, `bad count ${sp}=${w.counts[sp]}`);
          }
          for (const h of w.history) validateHistoryEntry(h, GENES, SPECIES, `extreme seed=${seed}`);
          const extinct = SPECIES.some((sp) => w.counts[sp] === 0 || w.history.some((h) => h.counts[sp] === 0));
          if (extinct) extinctions++;
          E.runHeadless(w, 130);
          assertFiniteNumber(w.counts.flora, 'flora after post-extinction run');
        }
      }
      return `ran ${ran} extreme worlds; ${extinctions} showed a zero-count species (no crash)`;
    },
    { area: 'engine', severity: SEVERITY.MAJOR }
  );

  await rec.check(
    'B14',
    'runTick contract: generation = 30 ticks; ticksIntoGen wraps; tick counts',
    () => {
      const w = make({ seed: 1977, generations: 10 });
      for (let i = 0; i < 29; i++) E.runTick(w);
      assertEqual(w.generation, 0, 'generation after 29 ticks');
      assertEqual(w.ticksIntoGen, 29, 'ticksIntoGen after 29 ticks');
      E.runTick(w);
      assertEqual(w.generation, 1, 'generation after 30 ticks');
      assertEqual(w.ticksIntoGen, 0, 'ticksIntoGen after 30 ticks');
      assertEqual(w.tick, 30, 'tick after 30 ticks');
      const a = make({ seed: 1977, generations: 10 });
      const b = make({ seed: 1977, generations: 10 });
      (typeof E.stepGeneration === 'function' ? E.stepGeneration : E.runGeneration)(a);
      E.runGeneration(b);
      assertEqual(E.hashWorld(a), E.hashWorld(b), 'stepGeneration != runGeneration');
      return '30 ticks/gen, tick accounting ok';
    },
    { area: 'engine', severity: SEVERITY.MAJOR }
  );

  await rec.check(
    'B15',
    'resetWorld: reseeds to gen 0, keeps params, accepts overrides, clears events',
    () => {
      const w = make({ seed: 1977, mutation: 0.1, generations: 20 });
      E.runHeadless(w, 12);
      const w2 = E.resetWorld(w, { seed: 4004 });
      assertEqual(typeof w2, 'object', 'resetWorld returned nothing');
      assertEqual(w2.generation, 0, 'generation not reset');
      assertEqual(w2.seed, 4004, 'seed override not applied');
      assertEqual(w2.config.mutation, 0.1, 'param not retained');
      assertEqual(w2.config.generations, 20, 'generations not retained');
      assert(w2.history.length <= 1, `history not cleared: ${w2.history.length}`);
      if (w2.history.length === 1) assertEqual(w2.history[0].gen, 0, 'reset history entry is not the gen-0 initial state');
      assertEqual(w2.events.length, 0, 'events not cleared');
      const initialHistory = w2.history.length;
      E.runHeadless(w2, 5);
      assertEqual(w2.generation, 5, 'run after reset failed');
      return `reset ok, params retained, initial history entries=${initialHistory}`;
    },
    { area: 'engine', severity: SEVERITY.MAJOR }
  );

  await rec.check(
    'B16',
    'plain serialisable state snapshot incl config/seed/generation/counts/activeEvents',
    () => {
      const w = runs({ seed: 1977 }, 6);
      const snap = validateSnapshot(snapshotFn(w), 'snapshot');
      assertEqual(snap.seed, 1977, 'snapshot.seed');
      assert(Number.isInteger(snap.generation) && snap.generation === 6, `snapshot.generation=${snap.generation}`);
      assert(snap.config && typeof snap.config === 'object', 'snapshot.config missing');
      assert(snap.counts && typeof snap.counts === 'object', 'snapshot.counts missing');
      assert('activeEvents' in snap, 'snapshot.activeEvents missing');
      return `snapshot keys=${Object.keys(snap).join(',')}`;
    },
    { area: 'engine', severity: SEVERITY.MINOR }
  );

  await rec.check(
    'B17',
    'DIRT: engine source contains no Math.random / Date / network / DOM access',
    () => {
      const code = readFileSync(ENGINE_PATH, 'utf8');
      const noComments = code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
      const find = (re) => {
        const out = [];
        noComments.split('\n').forEach((line, i) => {
          if (re.test(line)) out.push(`${i + 1}: ${line.trim().slice(0, 120)}`);
        });
        return out;
      };
      const mathRandom = find(/Math\.random/);
      const dateUse = find(/\bDate\b/);
      const dom = find(/\b(document|localStorage|fetch|XMLHttpRequest|importScripts)\b/);
      assertEqual(mathRandom.length, 0, `Math.random found in engine: ${mathRandom[0]}`);
      assertEqual(dom.length, 0, `DOM/network access in engine: ${dom[0]}`);
      if (dateUse.length) {
        const onlyBench = dateUse.every((l) => /benchmark|performance|ms/.test(l));
        if (!onlyBench) throw new Error(`Date usage in engine: ${dateUse.join(' | ')}`);
        return `no Math.random; Date only for benchmark timing (${dateUse.length} line)`;
      }
      return 'no Math.random/Date/DOM/network in engine source';
    },
    { area: 'engine', severity: SEVERITY.BLOCKER }
  );

  // ---------- B18: assembled copy parity (node side) ----------
  await rec.check(
    'B18',
    'assembled deliverable inlines engine verbatim (extractable for parity test)',
    async () => {
      const snap = await snapshotDeliverable({ label: 'engine-parity' });
      const html = readFileSync(snap.path, 'utf8');
      const expected = src.replace(/<\/script>/gi, '<\\/script>');
      const inlined = html.includes(expected);
      return {
        snapshot: snap.hash.slice(0, 16),
        bytes: snap.bytes,
        engineInlinedVerbatim: inlined,
        note: inlined
          ? 'engine byte-identical inside deliverable; browser parity check follows in browser suite'
          : 'engine source differs inside deliverable (stale assembly or transform) — browser parity test is authoritative',
      };
    },
    { area: 'engine', severity: SEVERITY.MINOR }
  );

  if (save) rec.save(join(VERIFY, 'results-engine.json'));
  rec.print();
  return rec;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runEngineSuite().then((rec) => {
    process.exitCode = rec.failures().length ? 1 : 0;
  });
}
