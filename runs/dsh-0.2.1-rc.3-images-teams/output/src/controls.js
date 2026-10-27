/* ==========================================================================
   VIVARIUM — controls.js
   The instrument folio: six instruments, two brass rockers, eight sparklines,
   pinned field-note tooltips, fold persistence, full keyboard/ARIA semantics.
   Owner: atelier. No dependencies, no external assets.
   Public API: window.VIVARIUM_CONTROLS = { mount, update, setRunning,
   setFinished, destroy }.
   ========================================================================== */

(function (root) {
  'use strict';

  /* ---------- configuration ------------------------------------------- */

  var STORE_KEY = 'vivarium.folio.folded';
  var TIP_ID = 'tooltip';

  var NOTES = {
    seed: {
      eyebrow: 'provenance',
      body: 'Every mark in the plate descends from this number. The seed is read once, as the glass is sealed; the same seed always returns the same world.',
      range: '1 – 9999 · integer · default 1977',
      hint: 'Type a number, then press Enter. R recasts the plate from the same seed. Buttons step by one; hold Page keys for ten.'
    },
    mutation: {
      eyebrow: 'inheritance',
      body: 'The chance that a single locus is drawn anew at each birth. Small turns of this instrument take generations to show; watch the spread of the plate rather than the census.',
      range: '0 – 0.200 per locus / birth · step 0.005 · default 0.060',
      hint: 'Arrow keys move one step; Page keys move ten. The percentage beneath the dial is the same value read as a chance.'
    },
    regrowth: {
      eyebrow: 'green',
      body: 'A multiplier on flora vigour — how readily the green returns after a season of grazing, or after the weather has passed.',
      range: '0.20× – 2.50× · step 0.05 · default 1.00×',
      hint: 'Below 1.00× the moss thins; above it, the glass crowds. The trace beside this label is the flora census.'
    },
    generations: {
      eyebrow: 'duration',
      body: 'The length of the study, in generations. Shortening the record below the generation now standing concludes the observation where it stands.',
      range: '10 – 120 generations · integer · default 40',
      hint: 'Type a length, then Enter. The generation rule beneath the glass is re-engraved to the new measure.'
    },
    speed: {
      eyebrow: 'tempo',
      body: 'Realised ticks each second. One generation is thirty ticks; at 8× the study runs faster than the eye, at 0.25× you may watch a single creature cross the field.',
      range: '0.25× – 8.0× · logarithmic · default 2.0×',
      hint: 'Drag the knob, or use arrows and page keys. Home and End reach the ends of the scale.'
    },
    interval: {
      eyebrow: 'weather',
      body: 'Generations between catastrophes. A short interval makes a harsh world; the wax seals pinned along the generation rule show where the weather has fallen and will fall.',
      range: '3 – 20 generations · integer · default 8',
      hint: 'One further event is scheduled each time this many generations pass. Arrows move by one; Page keys by three.'
    },
    catastrophes: {
      eyebrow: 'weather',
      body: 'Arms the three weathers: Siccitas, Pestilentia, Incendium. With the instrument disarmed, no seals are pressed and the ledger records only quiet seasons.',
      range: 'armed / calm · default armed',
      hint: 'Space or Enter throws the rocker. The sparkline shows the seals of this run.'
    },
    trails: {
      eyebrow: 'optics',
      body: 'Faint pencil ghosts behind each creature, showing the last few ticks of its path. A reading aid for the eye alone; it touches nothing in the simulation.',
      range: 'on / off · default on',
      hint: 'Space or Enter throws the rocker. The gulls and hares leave the clearest trails.'
    }
  };

  var GLYPH = {
    flora: '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path d="M8 2v12M8 8 3.2 3.4M8 8l4.8-4.6M8 11.4 4.1 14M8 11.4l3.9 2.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    fauna: '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><circle cx="8" cy="8" r="4.4" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="8" cy="8" r="1.1" fill="currentColor"/><path d="M11.6 11.6 14 14" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    predator: '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><path d="M3 12.4 8.1 2.6l4.9 9.8M5.4 9.3l5.2.1" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round"/></svg>',
    wax: '<svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true"><circle cx="8" cy="8" r="5.2" fill="currentColor" opacity=".85"/><circle cx="8" cy="8" r="2.6" fill="none" stroke="#f4ecda" stroke-width="1"/></svg>'
  };

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function numOr(v, fb) {
    var n = typeof v === 'number' ? v : parseFloat(v);
    return isFinite(n) ? n : fb;
  }
  function isTenth(v) { return Math.abs(v * 10 - Math.round(v * 10)) < 1e-9; }
  function fmtSpeed(v) {
    if (v < 1) return v.toFixed(2) + '×';
    return (isTenth(v) ? v.toFixed(1) : v.toFixed(2)) + '×';
  }
  function fmtSpeedPrecise(v) {
    var r = Math.round(v * 100) / 100;
    if (r < 1) return r.toFixed(2) + '×';
    return (isTenth(r) ? r.toFixed(1) : r.toFixed(2)) + '×';
  }
  function speedFromLog(t) { return 0.25 * Math.pow(32, clamp(t, 0, 1)); }

  var SPECS = [
    {
      key: 'seed', no: 'i', title: 'Seed', kind: 'stepper',
      min: 1, max: 9999, step: 1, def: 1977,
      unit: 'seed', spark: 'diversity',
      sparkLabel: 'Genetic diversity across the study',
      fmt: function (v) { return String(Math.round(v)); },
      aria: function (v) { return Math.round(v) + ', seed'; },
      sub: function () { return '1 – 9999'; }
    },
    {
      key: 'mutation', no: 'ii', title: 'Mutation rate', kind: 'slider',
      min: 0, max: 0.2, step: 0.005, def: 0.06,
      unit: 'per locus / birth', scale: ['0', '0.200'], spark: 'mutations',
      sparkLabel: 'Mutations per generation',
      fmt: function (v) { return v.toFixed(3); },
      aria: function (v) { return v.toFixed(3) + ', that is ' + (v * 100).toFixed(1) + ' percent per locus per birth'; },
      sub: function (v, world) {
        var out = (v * 100).toFixed(1) + '%';
        var h = world && world.history;
        if (h && h.length >= 2) {
          var a = h[h.length - 1].mutations, b = h[h.length - 2].mutations;
          if (typeof a === 'number' && typeof b === 'number') {
            var d = a - b;
            out += ' · Δ' + (d > 0 ? '+' : '') + d;
          }
        }
        return out;
      }
    },
    {
      key: 'regrowth', no: 'iii', title: 'Regrowth', kind: 'slider',
      min: 0.2, max: 2.5, step: 0.05, def: 1,
      unit: 'flora vigour', scale: ['0.20×', '2.50×'], spark: 'flora',
      sparkLabel: 'Flora census across the study',
      fmt: function (v) { return v.toFixed(2) + '×'; },
      aria: function (v) { return v.toFixed(2) + ' times baseline flora vigour'; }
    },
    {
      key: 'generations', no: 'iv', title: 'Generations', kind: 'stepper',
      min: 10, max: 120, step: 1, def: 40,
      unit: 'generations', spark: 'progress',
      sparkLabel: 'Progress through the study',
      fmt: function (v) { return String(Math.round(v)); },
      aria: function (v) { return Math.round(v) + ' generations'; },
      sub: function (v, world) {
        return 'gen ' + ((world && typeof world.generation === 'number') ? world.generation : 0);
      }
    },
    {
      key: 'speed', no: 'v', title: 'Tempo', kind: 'dial',
      min: 0.25, max: 8, def: 2, log: true, kbd: 0.05, page: 0.5, precision: 2,
      unit: 'ticks / second', scale: ['0.25×', '8×'], fineLabel: 'logarithmic scale',
      spark: 'tickRate', sparkLabel: 'Realised ticks per second',
      fmt: fmtSpeed,
      aria: function (v) { return fmtSpeedPrecise(v) + ', ticks per second'; },
      sub: function (v, world, data) {
        var arr = data && Array.isArray(data.tickRate) ? data.tickRate : [];
        var last = arr.length ? numOr(arr[arr.length - 1], NaN) : NaN;
        return isFinite(last) ? Math.round(last) + ' t/s realised' : 'log scale';
      }
    },
    {
      key: 'interval', no: 'vi', title: 'Weather rhythm', kind: 'dial',
      min: 3, max: 20, def: 8, kbd: 1, page: 3, precision: 0, integer: true,
      unit: 'gens between events', scale: ['3', '20'], fineLabel: 'weather rhythm',
      spark: 'events', sparkLabel: 'Weather marks along the study',
      fmt: function (v) { return String(Math.round(v)); },
      aria: function (v) { return Math.round(v) + ' generations between catastrophes'; },
      sub: function (v) { return 'seal every ' + Math.round(v) + ' gen'; }
    },
    {
      key: 'catastrophes', no: 'vii', title: 'Catastrophes', kind: 'toggle',
      def: true, unit: 'weather', spark: 'eventsToggle',
      sparkLabel: 'Catastrophe seals pinned across the study',
      fmt: function (v) { return v ? 'ARMED' : 'CALM'; },
      aria: function (v) { return v ? 'armed' : 'disarmed'; },
      sub: function (v, world, data, all) {
        var interval = all && all.interval ? Math.round(all.interval) : 8;
        return v ? 'every ' + interval + ' gen' : 'no seals pressed';
      }
    },
    {
      key: 'trails', no: 'viii', title: 'Ghost trails', kind: 'toggle',
      def: true, unit: 'ghosts', spark: 'trails',
      sparkLabel: 'Pencil ghost trails left by the creatures',
      fmt: function (v) { return v ? 'ON' : 'OFF'; },
      aria: function (v) { return v ? 'ghost trails on' : 'ghost trails off'; },
      sub: function (v) { return v ? 'pencil ghosts' : 'clean plate'; }
    }
  ];

  var BY_KEY = {};
  SPECS.forEach(function (s) { BY_KEY[s.key] = s; });

  /* ---------- tiny DOM helpers ---------------------------------------- */

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function svgEl(markup) {
    var wrap = document.createElement('span');
    wrap.innerHTML = markup; /* static, local markup only */
    return wrap.firstElementChild;
  }

  /* ---------- sparkline drawing --------------------------------------- */

  var SPARK_W = 76;
  var SPARK_H = 22;
  var INK = '#3f382b';
  var INK_SOFT = '#6f6554';
  var RULE = 'rgba(139,128,108,.42)';
  var BRASS = '#9b7a3c';
  var WAX = '#7a2b23';

  function seriesOf(v) {
    if (!Array.isArray(v)) return [];
    var out = [];
    for (var i = 0; i < v.length; i++) {
      var x = v[i];
      var n = typeof x === 'number' ? x
        : (x && typeof x.value === 'number') ? x.value
          : (x && typeof x.count === 'number') ? x.count : NaN;
      if (isFinite(n)) out.push(n);
    }
    return out;
  }

  function eventsOf(data) {
    if (!data) return [];
    var list = Array.isArray(data.eventGens) ? data.eventGens
      : Array.isArray(data.events) ? data.events : [];
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      var gen = typeof e === 'number' ? e : (e && typeof e.gen === 'number' ? e.gen : NaN);
      if (isFinite(gen)) out.push({ gen: gen, type: (e && e.type) || '' });
    }
    return out;
  }

  function lcg(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function fitCanvas(canvas) {
    var W = canvas.clientWidth || SPARK_W;
    var H = canvas.clientHeight || SPARK_H;
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    var pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
    var g = canvas.getContext('2d');
    if (!g) return null;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    return { g: g, W: W, H: H };
  }

  function drawBaseline(g, W, H, dashed) {
    g.save();
    g.strokeStyle = RULE;
    g.lineWidth = 1;
    if (dashed) g.setLineDash([1.5, 2]);
    g.beginPath();
    g.moveTo(1, H - 3.5);
    g.lineTo(W - 1, H - 3.5);
    g.stroke();
    g.restore();
  }

  function drawTrace(g, W, H, values, opts) {
    if (!values.length) return;
    opts = opts || {};
    var lo = opts.min != null ? opts.min : Math.min.apply(null, values);
    var hi = opts.max != null ? opts.max : Math.max.apply(null, values);
    if (!isFinite(lo) || !isFinite(hi)) return;
    if (hi - lo < 1e-9) { lo = lo - 0.5; hi = hi + 0.5; } /* a flat trace sits mid-field */
    var x0 = 1.5, x1 = W - 1.5, yTop = 2.5, yBase = H - 4.5;
    var n = values.length;
    g.save();
    g.strokeStyle = opts.color || INK;
    g.lineWidth = opts.width || 1.3;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    if (opts.dash) g.setLineDash(opts.dash);
    g.beginPath();
    for (var i = 0; i < n; i++) {
      var x = n === 1 ? (x0 + x1) / 2 : x0 + (i / (n - 1)) * (x1 - x0);
      var t = clamp((values[i] - lo) / (hi - lo), 0, 1);
      var y = yBase - t * (yBase - yTop);
      if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
    }
    g.stroke();
    if (opts.end !== false) {
      var et = clamp((values[n - 1] - lo) / (hi - lo), 0, 1);
      var ey = yBase - et * (yBase - yTop);
      g.setLineDash([]);
      g.fillStyle = opts.endColor || BRASS;
      g.beginPath();
      g.arc(x1, ey, 2, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(244,236,218,.8)';
      g.lineWidth = 0.7;
      g.beginPath();
      g.arc(x1, ey, 2, 0, Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }

  function drawProgress(g, W, H, p) {
    var y = H - 10;
    g.save();
    g.strokeStyle = RULE;
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(1, y + 0.5);
    g.lineTo(W - 1, y + 0.5);
    g.stroke();
    g.strokeStyle = INK;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(1, y + 0.5);
    g.lineTo(1 + (W - 2) * clamp(p, 0, 1), y + 0.5);
    g.stroke();
    var x = 1 + (W - 2) * clamp(p, 0, 1);
    g.fillStyle = BRASS;
    g.fillRect(Math.round(x) - 1, y - 4, 2, 9);
    g.restore();
  }

  function drawRhythm(g, W, H, interval, gens, events, currentGen) {
    var y = H - 3.5;
    var n = Math.max(1, Math.round(interval));
    var total = Math.max(1, Math.round(gens));
    g.save();
    for (var gen = n; gen <= total; gen += n) {
      var x = 1 + (gen / total) * (W - 3);
      g.strokeStyle = 'rgba(168,151,123,.95)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y - (gen % (n * 2) === 0 ? 7 : 4));
      g.stroke();
    }
    for (var i = 0; i < events.length; i++) {
      var ex = 1 + (clamp(events[i].gen, 0, total) / total) * (W - 3);
      g.fillStyle = WAX;
      g.beginPath();
      g.arc(ex, y - 6, 1.8, 0, Math.PI * 2);
      g.fill();
    }
    var cx = 1 + (clamp(currentGen, 0, total) / total) * (W - 3);
    g.fillStyle = BRASS;
    g.fillRect(Math.round(cx) - 1, y - 8, 2, 9);
    g.restore();
  }

  function drawEvents(g, W, H, events, gens, on, currentGen) {
    var y = H - 3.5;
    if (!on) {
      drawBaseline(g, W, H, true);
      return;
    }
    for (var i = 0; i < events.length; i++) {
      var x = 1 + (clamp(events[i].gen, 0, gens) / Math.max(1, gens)) * (W - 3);
      g.fillStyle = WAX;
      g.beginPath();
      g.arc(x, y - 3, 2.1, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = 'rgba(122,43,35,.35)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y - 5.4);
      g.stroke();
    }
    var cx = 1 + (clamp(currentGen, 0, gens) / Math.max(1, gens)) * (W - 3);
    g.fillStyle = BRASS;
    g.fillRect(Math.round(cx) - 1, y - 7, 2, 8);
  }

  function drawSeedPrint(g, W, H, seed) {
    var rnd = lcg(seed || 1);
    var vals = [];
    for (var i = 0; i < 18; i++) vals.push(rnd());
    drawTrace(g, W, H, vals, { color: INK_SOFT, dash: [2, 1.5], endColor: BRASS, width: 1.2 });
  }

  function drawTrails(g, W, H, seed, on) {
    var rnd = lcg((seed || 1) ^ 0x9e3779b9);
    var yBase = H - 3.5;
    g.save();
    g.lineWidth = 1;
    for (var pass = 0; pass < 2; pass++) {
      g.strokeStyle = on ? (pass === 0 ? 'rgba(87,79,64,.85)' : 'rgba(139,128,108,.65)') : 'rgba(168,151,123,.7)';
      if (!on) g.setLineDash([1, 2]);
      g.beginPath();
      var y = yBase - 5 + pass * 4;
      for (var x = 1; x <= W - 2; x += 1.5) {
        y += (rnd() - 0.5) * 1.9;
        y = clamp(y, 3, yBase);
        if (x === 1) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = on ? (pass === 0 ? INK : INK_SOFT) : INK_SOFT;
      g.beginPath();
      g.arc(W - 2.5, clamp(y, 3, yBase), 1.4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  /* ---------- instance ------------------------------------------------- */

  function create(rootEl, ctx) {
    var state = {
      rootEl: rootEl,
      ctx: ctx || {},
      values: {},
      views: {},
      world: null,
      sparkData: {},
      sparkPrimed: false,
      running: false,
      finished: false,
      acc: 0,
      listeners: [],
      timers: [],
      tooltip: null,
      tipKey: null,
      tipTrigger: null,
      tipPinned: false,
      fold: { folio: null, toggle: null, panel: null, folded: false },
      drag: null,
      destroyed: false
    };

    function on(target, type, fn, opts) {
      target.addEventListener(type, fn, opts);
      state.listeners.push(function () { target.removeEventListener(type, fn, opts); });
    }
    function later(fn, ms) {
      var id = root.setTimeout(function () {
        state.timers = state.timers.filter(function (t) { return t !== id; });
        if (!state.destroyed) fn();
      }, ms);
      state.timers.push(id);
      return id;
    }

    /* ----- reading ctx safely ----- */
    function ctxWorld() {
      try { return state.ctx.getWorld ? state.ctx.getWorld() : null; } catch (e) { return null; }
    }
    function ctxParam(key) {
      try { return state.ctx.getParam ? state.ctx.getParam(key) : undefined; } catch (e) { return undefined; }
    }
    function ctxSpark() {
      try { return (state.ctx.getSparkData && state.ctx.getSparkData()) || {}; } catch (e) { return {}; }
    }
    function applyParam(key, value) {
      try { if (state.ctx.setParam) state.ctx.setParam(key, value); } catch (e) { /* engine owns the consequence */ }
    }
    function applySeed(value) {
      try {
        if (state.ctx.actions && state.ctx.actions.recast) state.ctx.actions.recast(value);
        else applyParam('seed', value);
      } catch (e) { /* ignore */ }
    }
    function readInitial() {
      var world = ctxWorld();
      var cfg = (world && world.config) || {};
      SPECS.forEach(function (spec) {
        var raw = cfg[spec.key] !== undefined && cfg[spec.key] !== null ? cfg[spec.key] : ctxParam(spec.key);
        if (raw === undefined || raw === null) raw = spec.def;
        if (spec.kind === 'toggle') state.values[spec.key] = !!raw;
        else state.values[spec.key] = numOr(raw, spec.def);
      });
      state.world = world;
    }

    /* ----- value application from instruments ----- */
    function userSet(spec, value) {
      var v;
      if (spec.kind === 'toggle') v = !!value;
      else if (spec.integer) v = Math.round(clamp(numOr(value, state.values[spec.key]), spec.min, spec.max));
      else if (spec.precision != null) {
        var q = Math.pow(10, spec.precision);
        v = clamp(Math.round(numOr(value, state.values[spec.key]) * q) / q, spec.min, spec.max);
      } else v = clamp(numOr(value, state.values[spec.key]), spec.min, spec.max);

      if (state.values[spec.key] === v) { paintValue(spec.key); return; }
      state.values[spec.key] = v;
      paintValue(spec.key);
      if (spec.key === 'seed') applySeed(v);
      else applyParam(spec.key, v);
      flash(spec.key);
      drawSparks();
    }

    function flash(key) {
      var view = state.views[key];
      if (!view) return;
      view.row.classList.add('is-bumped');
      later(function () {
        if (view) view.row.classList.remove('is-bumped');
      }, 420);
    }

    /* ----- UI painting ----- */
    function paintValue(key) {
      var spec = BY_KEY[key];
      var view = state.views[key];
      if (!spec || !view) return;
      var v = state.values[key];
      var valText = spec.fmt(v);
      if (view.readout.val.textContent !== valText) view.readout.val.textContent = valText;
      var subText = spec.sub ? String(spec.sub(v, state.world, state.sparkData, state.values) || '') : '';
      if (subText) {
        if (view.readout.sub.textContent !== subText) view.readout.sub.textContent = subText;
        if (view.readout.sub.hidden) view.readout.sub.hidden = false;
      } else if (!view.readout.sub.hidden) {
        view.readout.sub.hidden = true;
      }
      var unitText = typeof spec.unit === 'function' ? spec.unit(v) : spec.unit;
      if (view.readout.unit.textContent !== unitText) view.readout.unit.textContent = unitText;
      if (view.setUI) view.setUI(v);
    }

    function paintAll() {
      SPECS.forEach(function (spec) { paintValue(spec.key); });
    }

    /* ----- sparklines ----- */
    function drawSparks() {
      var data = ctxSpark();
      state.sparkData = data;
      var world = state.world;
      var gens = Math.max(1, Math.round(state.values.generations || 40));
      var currentGen = world && typeof world.generation === 'number' ? world.generation : 0;
      var events = eventsOf(data);
      var p = numOr(data.progress, NaN);
      var progress;
      if (isFinite(p)) {
        progress = clamp(p > 1 ? p / 100 : (p === 0 ? 0 : p / 100), 0, 1);
      } else {
        progress = clamp(currentGen / gens, 0, 1);
      }

      SPECS.forEach(function (spec) {
        var canvas = state.views[spec.key] && state.views[spec.key].spark;
        if (!canvas || !canvas.isConnected) return;
        var fit = fitCanvas(canvas);
        if (!fit) return;
        var g = fit.g, W = fit.W, H = fit.H;

        switch (spec.spark) {
          case 'diversity': {
            drawBaseline(g, W, H, false);
            var div = seriesOf(data.diversity);
            if (div.length) drawTrace(g, W, H, div, { min: 0, max: 1 });
            else drawSeedPrint(g, W, H, state.values.seed);
            break;
          }
          case 'mutations': {
            drawBaseline(g, W, H, false);
            var muts = seriesOf(data.mutations);
            if (muts.length) drawTrace(g, W, H, muts, { min: 0 });
            break;
          }
          case 'flora': {
            drawBaseline(g, W, H, false);
            var flora = seriesOf(data.flora);
            if (flora.length) drawTrace(g, W, H, flora, { min: 0 });
            break;
          }
          case 'progress': {
            drawProgress(g, W, H, progress);
            break;
          }
          case 'tickRate': {
            drawBaseline(g, W, H, false);
            var rates = seriesOf(data.tickRate);
            if (rates.length) {
              drawTrace(g, W, H, rates, { min: 0 });
            } else {
              var v = state.values.speed;
              var t = Math.log(v / 0.25) / Math.log(32);
              var y = (H - 4.5) - clamp(t, 0, 1) * (H - 7);
              g.save();
              g.strokeStyle = 'rgba(168,151,123,.85)';
              g.setLineDash([2, 2]);
              g.beginPath();
              g.moveTo(1.5, y);
              g.lineTo(W - 1.5, y);
              g.stroke();
              g.setLineDash([]);
              g.fillStyle = BRASS;
              g.beginPath();
              g.arc(W - 1.5, y, 1.5, 0, Math.PI * 2);
              g.fill();
              g.restore();
            }
            break;
          }
          case 'events':
          case 'eventsToggle': {
            if (spec.key === 'interval') {
              drawRhythm(g, W, H, state.values.interval, gens, events, currentGen);
            } else {
              drawBaseline(g, W, H, false);
              drawEvents(g, W, H, events, gens, !!state.values.catastrophes, currentGen);
            }
            break;
          }
          case 'trails': {
            drawBaseline(g, W, H, false);
            drawTrails(g, W, H, state.values.seed, !!state.values.trails);
            break;
          }
          default:
            drawBaseline(g, W, H, false);
        }
      });
    }

    /* ----- builders: stepper ------------------------------------------ */
    function buildStepper(spec) {
      var wrap = el('div', 'stepper');
      var minus = el('button', 'stepper__btn', '−');
      minus.type = 'button';
      minus.setAttribute('aria-label', 'Decrease ' + spec.title.toLowerCase());
      var input = el('input', 'stepper__field');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.id = 'ctl-' + spec.key;
      input.setAttribute('role', 'spinbutton');
      input.setAttribute('aria-valuemin', String(spec.min));
      input.setAttribute('aria-valuemax', String(spec.max));
      input.setAttribute('aria-describedby', TIP_ID);
      input.setAttribute('aria-labelledby', 'lbl-' + spec.key);
      var plus = el('button', 'stepper__btn', '+');
      plus.type = 'button';
      plus.setAttribute('aria-label', 'Increase ' + spec.title.toLowerCase());

      wrap.append(minus, input, plus);

      if (spec.key === 'seed') {
        var recast = el('button', 'stepper__recast');
        recast.type = 'button';
        recast.setAttribute('aria-label', 'Recast the plate from this seed');
        recast.append(svgEl('<svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true"><rect x="1" y="1" width="10" height="10" rx="1" fill="none" stroke="currentColor" stroke-width="1"/><circle cx="4" cy="4" r=".95" fill="currentColor"/><circle cx="8" cy="8" r=".95" fill="currentColor"/><circle cx="8" cy="4" r=".95" fill="currentColor"/><circle cx="4" cy="8" r=".95" fill="currentColor"/></svg>'));
        recast.append(el('span', null, 'Recast'));
        on(recast, 'click', function () { userSet(spec, state.values[spec.key]); applySeed(state.values[spec.key]); flash(spec.key); });
        wrap.append(recast);
      }

      function commit(raw, opts) {
        opts = opts || {};
        var parsed = numOr(raw, state.values[spec.key]);
        var v = clamp(Math.round(parsed), spec.min, spec.max);
        input.removeAttribute('data-invalid');
        if (!isFinite(parsed)) v = state.values[spec.key];
        input.value = String(v);
        if (v !== state.values[spec.key]) {
          state.values[spec.key] = v;
          paintValue(spec.key);
          if (spec.key === 'seed') applySeed(v); else applyParam(spec.key, v);
          flash(spec.key);
          drawSparks();
        } else {
          paintValue(spec.key);
        }
        input.setAttribute('aria-valuenow', String(v));
        input.setAttribute('aria-valuetext', spec.aria(v));
      }

      on(minus, 'click', function () { commit(state.values[spec.key] - spec.step); });
      on(plus, 'click', function () { commit(state.values[spec.key] + spec.step); });
      on(input, 'focus', function () { input.select(); });
      on(input, 'input', function () {
        var digits = input.value.replace(/[^\d]/g, '');
        if (digits !== input.value) input.value = digits;
        var n = numOr(digits, NaN);
        if (!isFinite(n) || n < spec.min || n > spec.max) input.setAttribute('data-invalid', 'true');
        else input.removeAttribute('data-invalid');
      });
      on(input, 'keydown', function (e) {
        if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          commit(state.values[spec.key] + (e.key === 'ArrowUp' ? spec.step : -spec.step));
        } else if (e.key === 'PageUp' || e.key === 'PageDown') {
          e.preventDefault();
          commit(state.values[spec.key] + (e.key === 'PageUp' ? 10 : -10) * spec.step);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          commit(input.value);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          input.value = String(state.values[spec.key]);
          input.removeAttribute('data-invalid');
          input.blur();
        }
      });
      on(input, 'change', function () { commit(input.value); });
      on(input, 'blur', function () { commit(input.value); });

      return {
        el: wrap,
        input: input,
        setUI: function (v) {
          if (document.activeElement !== input && input.value !== String(Math.round(v))) input.value = String(Math.round(v));
          input.setAttribute('aria-valuenow', String(Math.round(v)));
          input.setAttribute('aria-valuetext', spec.aria(v));
        },
        focus: function () { input.focus(); input.select(); }
      };
    }

    /* ----- builders: slider -------------------------------------------- */
    function buildSlider(spec) {
      var wrap = el('div', 'slider');
      var lo = el('span', 'slider__end', spec.scale[0]);
      lo.setAttribute('aria-hidden', 'true');
      var input = el('input', 'slider__input');
      input.type = 'range';
      input.id = 'ctl-' + spec.key;
      input.min = String(spec.min);
      input.max = String(spec.max);
      input.step = String(spec.step);
      input.setAttribute('aria-describedby', TIP_ID);
      input.setAttribute('aria-labelledby', 'lbl-' + spec.key);
      var hi = el('span', 'slider__end', spec.scale[1]);
      hi.setAttribute('aria-hidden', 'true');
      wrap.append(lo, input, hi);

      function fill(v) {
        var pct = ((v - spec.min) / (spec.max - spec.min)) * 100;
        input.style.setProperty('--fill', clamp(pct, 0, 100).toFixed(3) + '%');
      }
      on(input, 'input', function () {
        var v = parseFloat(input.value);
        userSet(spec, v);
      });
      return {
        el: wrap,
        input: input,
        setUI: function (v) {
          var target = String(v);
          if (input.value !== target) input.value = target;
          fill(v);
          input.setAttribute('aria-valuenow', v.toFixed(3).replace(/0+$/, '').replace(/\.$/, ''));
          input.setAttribute('aria-valuetext', spec.aria(v));
        },
        focus: function () { input.focus(); }
      };
    }

    /* ----- builders: rotary dial --------------------------------------- */
    function buildDial(spec) {
      var wrap = el('div', 'dial-wrap');
      var dial = el('div', 'dial');
      dial.id = 'ctl-' + spec.key;
      dial.tabIndex = 0;
      dial.setAttribute('role', 'slider');
      dial.setAttribute('aria-labelledby', 'lbl-' + spec.key);
      dial.setAttribute('aria-describedby', TIP_ID);
      dial.setAttribute('aria-valuemin', String(spec.min));
      dial.setAttribute('aria-valuemax', String(spec.max));
      var ring = el('span', 'dial__ring'); ring.setAttribute('aria-hidden', 'true');
      var bezel = el('span', 'dial__bezel'); bezel.setAttribute('aria-hidden', 'true');
      var needle = el('span', 'dial__needle'); needle.setAttribute('aria-hidden', 'true');
      var index = el('span', 'dial__index'); index.setAttribute('aria-hidden', 'true');
      dial.append(ring, bezel, needle, index);

      var fine = el('div', 'dial-fine');
      var fineLabel = el('span', 'dial-fine__label', spec.fineLabel || '');
      var ticks = el('div', 'dial-fine__ticks');
      ticks.setAttribute('aria-hidden', 'true');
      var cur = el('span', 'dial-fine__cur');
      ticks.append(cur);
      var ends = el('div', 'dial-fine__ends');
      ends.setAttribute('aria-hidden', 'true');
      ends.append(el('span', 'dial-fine__end', spec.scale[0]), el('span', 'dial-fine__end', spec.scale[1]));
      fine.append(fineLabel, ticks, ends);
      wrap.append(dial, fine);

      function toT(v) {
        if (spec.log) return Math.log(v / spec.min) / Math.log(spec.max / spec.min);
        return (v - spec.min) / (spec.max - spec.min);
      }
      function fromT(t) {
        t = clamp(t, 0, 1);
        return spec.log ? spec.min * Math.pow(spec.max / spec.min, t) : spec.min + t * (spec.max - spec.min);
      }
      function angleOf(v) { return -135 + 270 * clamp(toT(v), 0, 1); }

      function setUI(v) {
        var angle = angleOf(v);
        dial.style.setProperty('--angle', angle.toFixed(2) + 'deg');
        cur.style.left = (clamp((angle + 135) / 270, 0, 1) * 100).toFixed(2) + '%';
        var rounded = spec.integer ? Math.round(v) : v;
        dial.setAttribute('aria-valuenow', String(rounded));
        dial.setAttribute('aria-valuetext', spec.aria(v));
      }

      function valueFromAngle(deg) {
        return fromT((clamp(deg, -135, 135) + 135) / 270);
      }
      function angleFromEvent(e) {
        var r = dial.getBoundingClientRect();
        var cx = r.left + r.width / 2;
        var cy = r.top + r.height / 2;
        var dx = e.clientX - cx;
        var dy = e.clientY - cy;
        return Math.atan2(dx, -dy) * 180 / Math.PI; /* top = 0, clockwise positive */
      }

      on(dial, 'pointerdown', function (e) {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        dial.setPointerCapture(e.pointerId);
        state.drag = { key: spec.key, id: e.pointerId, dial: dial };
        userSet(spec, valueFromAngle(angleFromEvent(e)));
      });
      on(dial, 'pointermove', function (e) {
        if (!state.drag || state.drag.id !== e.pointerId || state.drag.key !== spec.key) return;
        e.preventDefault();
        userSet(spec, valueFromAngle(angleFromEvent(e)));
      });
      function endDrag(e) {
        if (state.drag && state.drag.id === e.pointerId) {
          try { dial.releasePointerCapture(e.pointerId); } catch (err) { /* noop */ }
          state.drag = null;
        }
      }
      on(dial, 'pointerup', endDrag);
      on(dial, 'pointercancel', endDrag);

      on(dial, 'keydown', function (e) {
        var v = state.values[spec.key];
        var page = spec.page != null ? spec.page : spec.kbd * 10;
        var handled = true;
        switch (e.key) {
          case 'ArrowRight':
          case 'ArrowUp': userSet(spec, v + spec.kbd); break;
          case 'ArrowLeft':
          case 'ArrowDown': userSet(spec, v - spec.kbd); break;
          case 'PageUp': userSet(spec, v + page); break;
          case 'PageDown': userSet(spec, v - page); break;
          case 'Home': userSet(spec, spec.min); break;
          case 'End': userSet(spec, spec.max); break;
          default: handled = false;
        }
        if (handled) e.preventDefault();
      });

      return {
        el: wrap,
        dial: dial,
        setUI: setUI,
        focus: function () { dial.focus(); }
      };
    }

    /* ----- builders: brass rocker toggle -------------------------------- */
    function buildToggle(spec) {
      var btn = el('button', 'rocker');
      btn.type = 'button';
      btn.id = 'ctl-' + spec.key;
      btn.setAttribute('role', 'switch');
      btn.setAttribute('aria-labelledby', 'lbl-' + spec.key);
      btn.setAttribute('aria-describedby', TIP_ID);
      var track = el('span', 'rocker__track');
      track.setAttribute('aria-hidden', 'true');
      var lever = el('span', 'rocker__lever');
      track.append(lever);
      var caption = el('span', 'rocker__caption');
      caption.setAttribute('aria-hidden', 'true');
      var capKey = el('span', null, spec.key === 'catastrophes' ? 'weather' : 'optics');
      var capState = el('b', null, '');
      caption.append(capKey, capState);
      btn.append(track, caption);

      function setChecked(v) {
        btn.setAttribute('aria-checked', v ? 'true' : 'false');
        capState.textContent = spec.fmt(v);
        btn.setAttribute('aria-valuetext', spec.aria(v));
      }
      on(btn, 'click', function () {
        var next = btn.getAttribute('aria-checked') !== 'true';
        userSet(spec, next);
      });
      on(btn, 'keydown', function (e) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown') {
          e.preventDefault();
          userSet(spec, btn.getAttribute('aria-checked') !== 'true');
        }
      });
      return {
        el: btn,
        button: btn,
        setUI: setChecked,
        focus: function () { btn.focus(); }
      };
    }

    /* ----- row assembly ------------------------------------------------- */
    function makeRow(spec) {
      var row = el('section', 'inst');
      row.setAttribute('data-key', spec.key);
      var no = el('span', 'inst__no', spec.no);
      no.setAttribute('aria-hidden', 'true');
      var head = el('div', 'inst__head');
      var label = el('label', 'inst__label', spec.title);
      label.id = 'lbl-' + spec.key;
      label.setAttribute('for', 'ctl-' + spec.key);
      var help = el('button', 'inst__help', 'i');
      help.type = 'button';
      help.setAttribute('data-help', spec.key);
      help.setAttribute('aria-label', 'Field note on ' + spec.title.toLowerCase());
      help.setAttribute('aria-controls', TIP_ID);
      help.setAttribute('aria-expanded', 'false');
      var spark = el('canvas', 'inst__spark');
      spark.setAttribute('role', 'img');
      spark.setAttribute('aria-label', spec.sparkLabel);
      spark.width = SPARK_W;
      spark.height = SPARK_H;
      head.append(label, help, spark);

      var bodyRow = el('div', 'inst__body');
      var ctlWrap = el('div', 'inst__ctl');
      var readout = el('div', 'inst__readout');
      var val = el('span', 'inst__val');
      var sub = el('span', 'inst__sub');
      sub.hidden = true;
      var unit = el('span', 'inst__unit');
      readout.append(val, sub, unit);
      bodyRow.append(ctlWrap, readout);
      row.append(no, head, bodyRow);

      var control;
      if (spec.kind === 'slider') control = buildSlider(spec);
      else if (spec.kind === 'dial') control = buildDial(spec);
      else if (spec.kind === 'toggle') control = buildToggle(spec);
      else control = buildStepper(spec);
      ctlWrap.append(control.el);

      if (spec.kind === 'dial' || spec.kind === 'toggle') {
        on(label, 'click', function (e) {
          e.preventDefault();
          control.focus();
        });
      }

      var view = {
        row: row,
        label: label,
        help: help,
        head: head,
        spark: spark,
        control: control,
        readout: { val: val, sub: sub, unit: unit },
        setUI: control.setUI,
        focus: control.focus
      };
      state.views[spec.key] = view;

      /* tooltips: hover + focus, pinned by the (i) button */
      on(row, 'pointerenter', function () { if (!state.tipPinned) showTip(spec.key, row, false); });
      on(row, 'pointerleave', function () { if (!state.tipPinned) hideTip(false); });
      on(row, 'focusin', function () {
        if (state.tipKey !== spec.key || !state.tipPinned) showTip(spec.key, row, false);
      });
      on(row, 'focusout', function (e) {
        if (!row.contains(e.relatedTarget) && !state.tipPinned) hideTip(false);
      });
      on(help, 'click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        if (state.tipKey === spec.key && state.tipPinned) hideTip(true);
        else showTip(spec.key, row, true);
      });

      return view;
    }

    /* ----- tooltip ------------------------------------------------------ */
    function tipEl() {
      if (!state.tooltip) state.tooltip = document.getElementById(TIP_ID);
      return state.tooltip;
    }

    function fillTip(key) {
      var tip = tipEl();
      var spec = BY_KEY[key];
      var note = NOTES[key];
      if (!tip || !spec || !note) return false;
      var eyebrow = el('span', 'tooltip__eyebrow', spec.no + ' · field note');
      var title = el('span', 'tooltip__title', spec.title);
      var head = el('div', 'tooltip__head');
      head.append(eyebrow, title);
      var body = el('p', 'tooltip__body', note.body);
      var range = el('p', 'tooltip__range', note.range);
      var hint = el('p', 'tooltip__hint');
      hint.innerHTML = note.hint + ' <kbd>Esc</kbd> dismisses.';
      tip.replaceChildren(head, body, range, hint);
      return true;
    }

    function placeTip(trigger) {
      var tip = tipEl();
      if (!tip || tip.hidden) return;
      var r = trigger.getBoundingClientRect();
      var tw = tip.offsetWidth || 262;
      var th = tip.offsetHeight || 160;
      var gap = 16;
      var vw = root.innerWidth || document.documentElement.clientWidth;
      var vh = root.innerHeight || document.documentElement.clientHeight;
      var x = r.left - tw - gap;
      var y = r.top + r.height / 2 - th / 2;
      if (x < 12) {
        x = clamp(r.left + r.width / 2 - tw / 2, 12, vw - tw - 12);
        y = r.top - th - 10;
        if (y < 12) y = r.bottom + 10;
      }
      x = clamp(x, 12, vw - tw - 12);
      y = clamp(y, 12, vh - th - 12);
      tip.style.left = Math.round(x) + 'px';
      tip.style.top = Math.round(y) + 'px';
    }

    function showTip(key, trigger, pinned) {
      var tip = tipEl();
      if (!tip) return;
      if (state.tipKey === key && state.tipPinned === pinned && !tip.hidden) {
        placeTip(trigger);
        return;
      }
      if (!fillTip(key)) return;
      state.tipKey = key;
      state.tipTrigger = trigger;
      state.tipPinned = !!pinned;
      tip.hidden = false;
      var helpBtn = trigger.querySelector('.inst__help');
      Object.keys(state.views).forEach(function (k) {
        var h = state.views[k].help;
        h.setAttribute('aria-expanded', k === key ? 'true' : 'false');
      });
      if (helpBtn) helpBtn.setAttribute('aria-expanded', 'true');
      placeTip(trigger);
    }

    function hideTip(releasePin) {
      var tip = tipEl();
      if (releasePin) state.tipPinned = false;
      if (!tip || tip.hidden) {
        state.tipKey = null;
        state.tipTrigger = null;
        return;
      }
      tip.hidden = true;
      tip.replaceChildren();
      state.tipKey = null;
      state.tipTrigger = null;
      Object.keys(state.views).forEach(function (k) {
        state.views[k].help.setAttribute('aria-expanded', 'false');
      });
    }

    /* ----- folio fold --------------------------------------------------- */
    function initFold() {
      state.fold.folio = document.getElementById('folio');
      state.fold.toggle = document.getElementById('folio-toggle');
      state.fold.panel = document.getElementById('folio-panel');
      state.fold.spread = document.getElementById('spread');
      if (!state.fold.folio || !state.fold.toggle || !state.fold.panel) return;

      on(state.fold.toggle, 'click', function () {
        applyFold(!state.fold.folded, true, true);
      });

      var initial = false;
      try { initial = root.localStorage && root.localStorage.getItem(STORE_KEY) === '1'; } catch (e) { initial = false; }
      applyFold(initial, false, false);
    }

    function applyFold(folded, persist, animate) {
      var f = state.fold;
      if (!f.folio) return;
      f.folded = !!folded;
      if (!animate) f.folio.style.transition = 'none';
      f.folio.classList.toggle('is-folded', f.folded);
      if (f.spread) f.spread.classList.toggle('is-folio-folded', f.folded);
      f.toggle.setAttribute('aria-expanded', f.folded ? 'false' : 'true');
      f.toggle.setAttribute('aria-label', f.folded ? 'Expand instruments' : 'Collapse instruments');
      var mark = f.toggle.querySelector('.folio__tab-mark');
      if (mark) mark.textContent = f.folded ? '⇤' : '⇥';
      if (f.panel) {
        if (f.folded) {
          /* keep keyboard focus out of a folded page */
          if (f.panel.contains(document.activeElement) && f.toggle) {
            try { f.toggle.focus({ preventScroll: true }); } catch (e) { /* noop */ }
          }
          f.panel.setAttribute('inert', '');
          f.panel.setAttribute('aria-hidden', 'true');
        } else {
          f.panel.removeAttribute('inert');
          f.panel.removeAttribute('aria-hidden');
        }
      }
      if (persist) {
        try { root.localStorage.setItem(STORE_KEY, f.folded ? '1' : '0'); } catch (e) { /* private mode */ }
      }
      if (!animate) {
        root.requestAnimationFrame(function () {
          if (f.folio) f.folio.style.transition = '';
        });
      }
      later(drawSparks, 340);
    }

    /* ----- document-level listeners ------------------------------------ */
    function initGlobal() {
      on(document, 'keydown', function (e) {
        if (e.key === 'Escape') {
          if (state.tipKey) hideTip(true);
          return;
        }
        if ((e.key === 'd' || e.key === 'D') && !e.metaKey && !e.ctrlKey && !e.altKey) {
          var t = e.target;
          var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
          if (tag === 'input' || tag === 'textarea' || tag === 'select' || (t && t.isContentEditable)) return;
          e.preventDefault();
          applyFold(!state.fold.folded, true, true);
        }
      });
      on(document, 'pointerdown', function (e) {
        if (!state.tipPinned) return;
        if (e.target && e.target.closest && e.target.closest('.inst')) return;
        hideTip(true);
      }, true);
      on(root, 'resize', function () {
        if (state.tipKey && state.tipTrigger) placeTip(state.tipTrigger);
        drawSparks();
      });
      on(root, 'scroll', function () {
        if (state.tipKey && state.tipTrigger) placeTip(state.tipTrigger);
      }, true);
    }

    /* ----- legend ------------------------------------------------------- */
    function buildLegend() {
      var legend = el('div', 'folio-legend');
      [['flora', 'Flora'], ['fauna', 'Herbivora'], ['predator', 'Carnivora'], ['wax', 'Weather']].forEach(function (pair) {
        var item = el('span', 'folio-legend__item folio-legend__item--' + pair[0]);
        item.append(svgEl(GLYPH[pair[0]]), document.createTextNode(pair[1]));
        legend.append(item);
      });
      return legend;
    }

    /* ----- public methods ---------------------------------------------- */
    function update(world, dtMs) {
      if (state.destroyed) return;
      state.world = world || state.world;
      var cfg = (state.world && state.world.config) || {};
      var changed = false;
      SPECS.forEach(function (spec) {
        var raw = cfg[spec.key] !== undefined && cfg[spec.key] !== null ? cfg[spec.key] : ctxParam(spec.key);
        if (raw === undefined || raw === null) return;
        var v = spec.kind === 'toggle' ? !!raw : numOr(raw, state.values[spec.key]);
        if (v !== state.values[spec.key]) {
          state.values[spec.key] = v;
          changed = true;
        }
        paintValue(spec.key);
      });

      state.acc += (typeof dtMs === 'number' && dtMs > 0 ? Math.min(dtMs, 120) : 16);
      if (state.acc >= 150 || changed) {
        state.acc = 0;
        drawSparks();
      } else if (!state.sparkPrimed) {
        state.sparkPrimed = true;
        drawSparks();
      }
    }

    function setRunning(bool) {
      state.running = !!bool;
      state.rootEl.setAttribute('data-running', String(!!bool));
    }
    function setFinished(bool) {
      state.finished = !!bool;
      state.rootEl.setAttribute('data-finished', String(!!bool));
    }

    function destroy() {
      state.destroyed = true;
      state.listeners.forEach(function (off) { try { off(); } catch (e) { /* noop */ } });
      state.listeners = [];
      state.timers.forEach(function (t) { root.clearTimeout(t); });
      state.timers = [];
      hideTip(true);
      try { state.rootEl.replaceChildren(); } catch (e) { state.rootEl.textContent = ''; }
      try { state.rootEl.removeAttribute('data-running'); state.rootEl.removeAttribute('data-finished'); } catch (e) { /* noop */ }
    }

    /* ----- mount -------------------------------------------------------- */
    readInitial();
    state.rootEl.replaceChildren();
    SPECS.forEach(function (spec) { state.rootEl.append(makeRow(spec).row); });
    var legend = buildLegend();
    state.rootEl.append(legend);
    initFold();
    initGlobal();
    paintAll();
    drawSparks();
    root.requestAnimationFrame(function () {
      if (!state.destroyed) { paintAll(); drawSparks(); }
    });

    return {
      update: update,
      setRunning: setRunning,
      setFinished: setFinished,
      destroy: destroy,
      drawSparks: drawSparks
    };
  }

  /* ---------- module surface ------------------------------------------ */

  var instance = null;

  var API = {
    mount: function (rootEl, ctx) {
      if (!rootEl) return;
      if (instance) { try { instance.destroy(); } catch (e) { /* noop */ } instance = null; }
      instance = create(rootEl, ctx || {});
    },
    update: function (world, dtMs) {
      if (instance) instance.update(world, dtMs);
    },
    setRunning: function (bool) {
      if (instance) instance.setRunning(bool);
    },
    setFinished: function (bool) {
      if (instance) instance.setFinished(bool);
    },
    destroy: function () {
      if (instance) { try { instance.destroy(); } catch (e) { /* noop */ } instance = null; }
    }
  };

  root.VIVARIUM_CONTROLS = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
