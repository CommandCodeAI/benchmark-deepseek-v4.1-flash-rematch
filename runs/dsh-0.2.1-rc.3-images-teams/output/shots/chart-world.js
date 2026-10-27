/* chart-world.js — throwaway world factory for dashboard development.
   Uses the REAL engine (window.VIVARIUM_ENGINE) and applies edge-case mutations
   to exercise the chart renderer. Not part of the deliverable. */
(function (root) {
  'use strict';

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function num(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
  function opt(params, key, def) {
    var v = params && params[key];
    if (v == null || v === '') return def;
    var n = Number(v);
    return isFinite(n) ? n : def;
  }

  var NULL_TRAIT = { mean: null, sd: null, min: null, max: null, n: 0 };

  function makeChartWorld(params) {
    var E = root.VIVARIUM_ENGINE;
    if (!E) throw new Error('engine missing');
    var p = params || {};
    var seed = opt(p, 'seed', 1977);
    var gens = opt(p, 'gens', 40);
    var interval = opt(p, 'interval', 8);
    var mode = p.mode || 'normal';
    if (mode === 'dense') { gens = 120; interval = 3; }
    if (mode === 'short') gens = 6;
    if (mode === 'onegen') gens = 0;
    if (mode === 'empty') gens = 0;

    var config = {
      seed: seed,
      generations: clamp(gens, 10, 120),
      interval: clamp(interval, 3, 20),
      catastrophes: p.cat !== '0',
      mutation: opt(p, 'mutation', 0.06),
      regrowth: opt(p, 'regrowth', 1.0)
    };
    var world = E.createWorld(config);
    E.runHeadless(world, gens);
    /* emulating a conclude at a chosen generation */
    if (gens < world.config.generations) {
      world.config.generations = Math.max(1, gens);
      world.finished = true;
      world.ticksIntoGen = 0;
    }
    world.generation = gens;
    world.history = world.history.filter(function (h) { return h.gen <= gens; });
    world.events = world.events.filter(function (e) { return e.gen <= gens; });
    world.counts = world.history.length ? Object.assign({}, world.history[world.history.length - 1].counts) : { flora: 0, herbivora: 0, carnivora: 0 };
    world.tick = gens * 30;

    applyMode(world, mode);
    return world;
  }

  function applyMode(world, mode) {
    if (!world || mode === 'normal') return world;
    var history = world.history;
    if (mode === 'extinct') {
      killFrom(world, 'carnivora', 18);
      killFrom(world, 'herbivora', 30);
    } else if (mode === 'barren') {
      killFrom(world, 'flora', 20);
      killFrom(world, 'herbivora', 20);
      killFrom(world, 'carnivora', 20);
      recomputeDiversity(world);
    } else if (mode === 'gaps') {
      history.forEach(function (h, i) {
        if (i % 3 === 1) h.traits.flora.threshold = Object.assign({}, NULL_TRAIT);
        if (i % 5 === 2) h.traits.carnivora.vision = Object.assign({}, NULL_TRAIT);
      });
    } else if (mode === 'flat') {
      world.events = [];
      history.forEach(function (h) {
        h.counts = { flora: 400, herbivora: 100, carnivora: 10 };
        ['flora', 'herbivora', 'carnivora'].forEach(function (sp) {
          ['speed', 'vision', 'metabolism', 'threshold'].forEach(function (g) {
            var t = h.traits[sp][g];
            t.sd = 0; t.min = t.mean; t.max = t.mean; t.n = 10;
          });
        });
        h.diversity = 0.5;
        h.event = null;
      });
      world.counts = { flora: 400, herbivora: 100, carnivora: 10 };
    } else if (mode === 'noweather') {
      world.events = [];
      history.forEach(function (h) { h.event = null; h.activeEvents = []; });
    } else if (mode === 'onegen') {
      world.history = history.slice(0, 1);
      world.generation = 0;
      world.events = [];
      world.counts = Object.assign({}, world.history[0].counts);
      world.tick = 0;
    } else if (mode === 'empty') {
      world.history = [];
      world.generation = 0;
      world.events = [];
      world.counts = { flora: 0, herbivora: 0, carnivora: 0 };
      world.tick = 0;
    } else if (mode === 'gapsOnly') {
      world.history = history.filter(function (h) { return h.gen !== 5 && h.gen !== 6; });
    }
    return world;
  }

  function killFrom(world, sp, gen) {
    var history = world.history;
    var last = { flora: 0, herbivora: 0, carnivora: 0 };
    history.forEach(function (h) {
      if (h.gen < gen) { last = h.counts; return; }
      h.counts[sp] = 0;
      ['speed', 'vision', 'metabolism', 'threshold'].forEach(function (g) {
        h.traits[sp][g] = Object.assign({}, NULL_TRAIT);
      });
    });
    if (history.length) world.counts = Object.assign({}, history[history.length - 1].counts);
  }

  function recomputeDiversity(world) {
    world.history.forEach(function (h) {
      var vals = [], total = 0;
      ['flora', 'herbivora', 'carnivora'].forEach(function (sp) { if (h.counts[sp] > 0) { vals.push(h.counts[sp]); total += h.counts[sp]; } });
      var div = 0;
      if (total > 0) vals.forEach(function (v) { var pr = v / total; div -= pr * Math.log(pr); });
      h.diversity = total > 0 ? div / Math.log(3) : 0;
    });
  }

  root.makeChartWorld = makeChartWorld;
})(typeof window !== 'undefined' ? window : globalThis);
