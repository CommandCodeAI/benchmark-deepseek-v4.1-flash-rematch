#!/usr/bin/env node
/**
 * atelier preview harness.
 * Takes the assembled single-file build (shots/preview-atelier.html) and injects a
 * MOCK boot: census, rule ticks/seals/cursor, ledger, a deterministic ink specimen
 * scene on #sim-canvas, and a rich mock ctx for the controls folio.
 *
 * This file is a design-time preview ONLY. It is never part of the deliverable.
 * Usage: node shots/atelier-preview.mjs [src] [out]
 */
import { readFile, writeFile } from 'node:fs/promises';

const src = process.argv[2] || 'shots/preview-atelier.html';
const out = process.argv[3] || 'shots/atelier-preview.html';

let html = await readFile(src, 'utf8');
const bytes0 = Buffer.byteLength(html);

const mock = String.raw`
<script>
(function () {
  'use strict';
  var q = function (s, r) { return (r || document).querySelector(s); };
  var GEN = 17, GENS = 40, SEED = 1977;
  var qs = new URLSearchParams(location.search);
  var eventMode = qs.has('event');
  var specimenMode = qs.has('specimen');
  var tooltipKey = qs.get('focus');
  var wantFolded = qs.get('folded') === '1';

  function lcg(seed) {
    var s = (seed >>> 0) || 1;
    return function () { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  /* ---------- mock world + spark data (shapes only; engine is real later) --- */
  function curve(n, base, amp, drift, seed) {
    var rnd = lcg(seed), out = [], v = base;
    for (var i = 0; i < n; i++) {
      v += (rnd() - 0.5) * amp + drift * Math.sin(i / 5);
      out.push(Math.max(0, v));
    }
    return out;
  }

  var world = {
    config: { seed: SEED, mutation: 0.06, regrowth: 1, generations: GENS, speed: 2, interval: 8, catastrophes: true, trails: true, width: 160, height: 90 },
    seed: SEED, generation: GEN, tick: GEN * 30 + 14, ticksIntoGen: 14, running: true, finished: false,
    counts: { flora: 421, herbivora: 74, carnivora: 9 },
    history: [],
    events: [
      { gen: 8, type: 'drought', tick: 240 },
      { gen: 16, type: 'plague', tick: 480 }
    ],
    activeEvents: [{ type: 'plague', gensRemaining: 2 }]
  };
  for (var g = 0; g <= GEN; g++) {
    world.history.push({
      gen: g,
      counts: {
        flora: Math.round(340 + 90 * Math.sin(g / 4) + (g % 5) * 7),
        herbivora: Math.round(55 + 28 * Math.sin(g / 6 + 1)),
        carnivora: Math.round(6 + 6 * Math.cos(g / 7))
      },
      mutations: 4 + ((g * 7) % 9),
      event: g === 8 ? 'drought' : (g === 16 ? 'plague' : null),
      diversity: 0.82 - g * 0.006
    });
  }

  var spark = {
    diversity: curve(18, 0.78, 0.06, 0.02, 7).map(function (v) { return Math.min(1, Math.max(0.35, v)); }),
    mutations: [5, 7, 6, 8, 11, 9, 7, 10, 14, 9, 8, 11, 6, 9, 12, 8, 10, 9],
    flora: curve(18, 390, 46, 22, 11),
    eventGens: world.events,
    progress: (GEN / GENS) * 100,
    tickRate: [59.6, 59.8, 60.1, 59.9, 60.0, 60.2, 59.7, 60.0, 59.9, 60.1, 60.0, 59.8, 60.2, 60.0, 59.9, 60.1, 60.0, 59.9]
  };

  var mockCtx = {
    getWorld: function () { return world; },
    getParam: function (k) { return world.config[k]; },
    setParam: function (k, v) { world.config[k] = v; },
    actions: {
      recast: function (seed) { if (typeof seed === 'number') world.config.seed = seed; },
      pause: function () { world.running = false; },
      resume: function () { world.running = true; },
      stepGen: function () {},
      conclude: function () {}
    },
    isRunning: function () { return world.running; },
    getSparkData: function () { return spark; }
  };

  /* ---------- DOM prose: meta, census, rule, ledger ----------------------- */
  function setText(sel, text) { var n = q(sel); if (n) n.textContent = text; }
  function pad3(n) { return ('000' + n).slice(-3); }

  function paintChrome() {
    setText('#meta-seed', String(SEED));
    setText('#meta-gen', ('0' + GEN).slice(-2) + ' / ' + GENS);
    setText('#meta-status-text', 'Observing');
    setText('#plate-cells', '160 × 90');
    setText('#vitrine-clock', 'ticks ' + ('0000' + (GEN * 30 + 14)).slice(-4) + ' · 60/s');
    setText('#tag-seed', 'seed ' + SEED);
    setText('#rule-gen', 'gen ' + ('0' + GEN).slice(-2) + ' / ' + GENS);
    setText('#rule-rate', '2.0× · 60 ticks/s');
    setText('#ledger-seed', String(SEED));

    var census = [
      ['#census-flora', world.counts.flora, '#census-flora-trend', '▲', 'is-up'],
      ['#census-fauna', world.counts.herbivora, '#census-fauna-trend', '▼', 'is-down'],
      ['#census-predator', world.counts.carnivora, '#census-predator-trend', '▲', 'is-up']
    ];
    census.forEach(function (c) {
      setText(c[0], pad3(c[1]));
      var item = q(c[0]).closest('.census__item');
      if (item) item.classList.add('has-trend');
      var t = q(c[2]);
      if (t) { t.textContent = c[3]; t.className = 'census__trend mono ' + c[4]; }
    });

    /* rule ticks */
    var ticks = q('#rule-ticks');
    if (ticks) {
      ticks.replaceChildren();
      for (var i = 0; i <= GENS; i++) {
        var major = i % 5 === 0;
        if (!major && i !== 0) { /* keep every generation, tiny */ }
        var tick = document.createElement('i');
        tick.className = 'rule__tick';
        tick.style.left = ((i / GENS) * 100).toFixed(3) + '%';
        if (major) {
          tick.setAttribute('data-major', '1');
          var num = document.createElement('span');
          num.className = 'rule__tick-num';
          num.textContent = String(i);
          tick.appendChild(num);
        }
        ticks.appendChild(tick);
      }
    }
    var progress = q('#rule-progress');
    if (progress) progress.style.width = ((GEN / GENS) * 100).toFixed(3) + '%';
    var seals = q('#rule-seals');
    if (seals) {
      seals.replaceChildren();
      var names = { drought: ['S', 'SICCITAS'], plague: ['P', 'PESTILENTIA'], wildfire: ['I', 'INCENDIUM'] };
      world.events.forEach(function (e) {
        var s = document.createElement('span');
        s.className = 'rule__seal rule__seal--' + e.type;
        s.style.left = ((e.gen / GENS) * 100).toFixed(3) + '%';
        s.setAttribute('data-kind', e.type);
        s.setAttribute('data-label', names[e.type][1] + ' · GEN ' + ('0' + e.gen).slice(-2));
        s.textContent = names[e.type][0];
        seals.appendChild(s);
      });
    }
    var cursor = q('#rule-cursor');
    if (cursor) cursor.style.left = ((GEN / GENS) * 100).toFixed(3) + '%';
    setText('#rule-cursor-label', 'GEN ' + ('0' + GEN).slice(-2));

    /* ledger */
    var list = q('#ledger-list');
    if (list) {
      list.replaceChildren();
      var entries = [
        ['00', 'The glass is sealed. A world begins from seed 1977.', 'sealed'],
        ['08', 'Siccitas. The moss withdraws; the hares range further.', 'cataclysm'],
        ['16', 'Pestilentia. A season of small fevers among the herbivora.', 'cataclysm'],
        ['17', 'The foxes take nine; the greens return.', 'note']
      ];
      entries.forEach(function (e) {
        var li = document.createElement('li');
        li.className = 'ledger__entry ledger__entry--' + e[2];
        var g = document.createElement('span'); g.className = 'ledger__gen mono'; g.textContent = 'GEN ' + e[0];
        var t = document.createElement('span'); t.className = 'ledger__text'; t.textContent = e[1];
        li.append(g, t); list.appendChild(li);
      });
    }
    setText('#ledger-counter', '04');

    var sheet = q('#sheet');
    if (sheet) {
      sheet.setAttribute('data-running', 'true');
      sheet.setAttribute('data-finished', 'false');
    }
    document.body.setAttribute('data-running', 'true');

    if (eventMode) {
      var banner = q('#event-banner');
      if (banner) {
        banner.hidden = false;
        banner.classList.add('is-visible');
        setText('#banner-seal', 'P');
        setText('#banner-latin', 'Pestilentia');
        setText('#banner-name', 'PLAGUE');
        setText('#banner-note', 'A season of small fevers; the herbivora go thin for three seasons.');
        setText('#banner-gen', 'GEN 16');
      }
      var conds = q('#active-conditions');
      if (conds) {
        conds.innerHTML = '<span class="condition condition--plague">PESTILENTIA · 2 SEASONS REMAIN</span>';
      }
      var wash = q('#wash');
      if (wash) { wash.classList.add('is-active', 'is-plague'); wash.setAttribute('data-kind', 'plague'); }
    }
    if (specimenMode) {
      var card = q('#specimen-card');
      if (card) {
        card.hidden = false;
        card.style.left = '54%';
        card.style.top = '18%';
        card.innerHTML = '<div class="spec__head"><span class="spec__latin">Lepus sepiae</span><span class="spec__taxon">Herbivora</span></div>'
          + '<dl class="spec__data"><dt>Speed</dt><dd class="mono">1.42 px/t</dd>'
          + '<dt>Vision</dt><dd class="mono">2.10 r</dd>'
          + '<dt>Metabolism</dt><dd class="mono">0.86</dd>'
          + '<dt>Threshold</dt><dd class="mono">18.4 e</dd></dl>'
          + '<span class="spec__note">Age 6 · grazing the north moss. Energy</span>'
          + '<div class="spec__bar"><span style="width:64%"></span></div>';
      }
    }
  }

  /* ---------- deterministic ink scene (mock; render.js replaces it) ------- */
  function drawScene() {
    var canvas = q('#sim-canvas');
    if (!canvas) return;
    var r = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var W = Math.max(2, Math.round(r.width)), H = Math.max(2, Math.round(r.height));
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    var g = canvas.getContext('2d');
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);

    var paper = getComputedStyle(document.documentElement).getPropertyValue('--paper-hi').trim() || '#f4ecda';
    g.fillStyle = paper;
    g.fillRect(0, 0, W, H);

    var rnd = lcg(SEED);
    var flora = '#4f6f52', fauna = '#ab7a35', pred = '#93372d';

    /* faint ground wash */
    var grd = g.createRadialGradient(W * 0.5, H * 0.45, 20, W * 0.5, H * 0.45, Math.max(W, H) * 0.7);
    grd.addColorStop(0, 'rgba(255,253,246,.35)');
    grd.addColorStop(1, 'rgba(120,96,58,.05)');
    g.fillStyle = grd;
    g.fillRect(0, 0, W, H);

    function seedling(x, y, s, a) {
      g.save();
      g.translate(x, y);
      g.rotate(rnd() * Math.PI);
      g.strokeStyle = flora;
      g.globalAlpha = a;
      g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(0, -s); g.lineTo(0, s);
      g.moveTo(0, 0); g.lineTo(-s * 0.9, -s * 0.8);
      g.moveTo(0, 0); g.lineTo(s * 0.9, -s * 0.7);
      g.stroke();
      g.restore();
    }
    function hare(x, y, s, a) {
      g.save();
      g.strokeStyle = fauna;
      g.fillStyle = fauna;
      g.globalAlpha = a;
      g.lineWidth = 0.95;
      g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(x, y, s * 0.3, 0, Math.PI * 2); g.fill();
      var ang = rnd() * Math.PI * 2;
      g.beginPath(); g.moveTo(x + Math.cos(ang) * s, y + Math.sin(ang) * s);
      g.lineTo(x + Math.cos(ang) * (s + 2.4), y + Math.sin(ang) * (s + 2.4)); g.stroke();
      g.restore();
    }
    function fox(x, y, s, a) {
      g.save();
      g.translate(x, y);
      g.rotate(rnd() * Math.PI * 2);
      g.strokeStyle = pred;
      g.globalAlpha = a;
      g.lineWidth = 1.05;
      g.beginPath();
      g.moveTo(0, -s); g.lineTo(s * 0.9, s * 0.7); g.lineTo(0, s * 0.2);
      g.stroke();
      g.restore();
    }

    /* moss clusters: clustered flora */
    var clusters = [];
    for (var c = 0; c < 16; c++) clusters.push([rnd() * W, rnd() * H]);
    for (var i = 0; i < 260; i++) {
      var cx = clusters[(rnd() * clusters.length) | 0];
      var x = cx[0] + (rnd() - 0.5) * W * 0.13;
      var y = cx[1] + (rnd() - 0.5) * H * 0.16;
      if (x < 2 || y < 2 || x > W - 2 || y > H - 2) continue;
      seedling(x, y, 1.6 + rnd() * 2.6, 0.42 + rnd() * 0.5);
    }
    /* scattered lone flora */
    for (var j = 0; j < 90; j++) seedling(rnd() * W, rnd() * H, 1.2 + rnd() * 1.8, 0.25 + rnd() * 0.35);

    /* motion trails + herbivora */
    for (var k = 0; k < 62; k++) {
      var hx = 10 + rnd() * (W - 20), hy = 10 + rnd() * (H - 20);
      g.save();
      g.strokeStyle = 'rgba(87,79,64,.22)';
      g.lineWidth = 0.7;
      g.beginPath();
      var px = hx, py = hy;
      g.moveTo(px, py);
      for (var t = 0; t < 5; t++) {
        px += (rnd() - 0.5) * 9; py += (rnd() - 0.5) * 9;
        g.lineTo(px, py);
      }
      g.stroke();
      g.restore();
      hare(hx, hy, 1.5 + rnd() * 1.2, 0.55 + rnd() * 0.35);
    }
    /* carnivora */
    for (var m = 0; m < 9; m++) fox(30 + rnd() * (W - 60), 30 + rnd() * (H - 60), 2.6 + rnd() * 1.6, 0.6 + rnd() * 0.3);

    /* a few specimen halos */
    for (var n = 0; n < 3; n++) {
      g.save();
      g.strokeStyle = 'rgba(168,151,123,.35)';
      g.lineWidth = 0.6;
      g.beginPath();
      g.arc(40 + rnd() * (W - 80), 40 + rnd() * (H - 80), 4 + rnd() * 5, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
  }

  function start() {
    /* if a real boot is live, leave the page alone */
    var meta = q('#meta-gen');
    var realBoot = window.__VIVARIUM__ || (meta && meta.textContent.trim() !== '00 / 40');
    window.__MOCK_RAN__ = !realBoot;
    window.__MOCK_INFO__ = { gens: GENS, gen: GEN, events: world.events.length, viewport: [innerWidth, innerHeight] };
    if (realBoot) return;

    world.history = world.history;
    paintChrome();

    var el = q('#instrument-body');
    if (el && window.VIVARIUM_CONTROLS) {
      window.VIVARIUM_CONTROLS.destroy();
      window.VIVARIUM_CONTROLS.mount(el, mockCtx);
      window.VIVARIUM_CONTROLS.setRunning(true);
      window.VIVARIUM_CONTROLS.setFinished(false);
    }
    if (wantFolded) {
      var toggle = q('#folio-toggle');
      if (toggle) toggle.click();
    }
    if (tooltipKey) {
      var ctl = q('#ctl-' + tooltipKey);
      if (ctl) { try { ctl.focus(); } catch (e) { /* noop */ } }
    }

    requestAnimationFrame(function () {
      drawScene();
      if (window.VIVARIUM_CONTROLS) window.VIVARIUM_CONTROLS.update(world, 16);
      /* gently advance progress so the leaf does not look frozen */
      var t0 = performance.now();
      function tick(now) {
        var dt = now - t0; t0 = now;
        world.tick += dt * 0.06;
        if (window.VIVARIUM_CONTROLS) window.VIVARIUM_CONTROLS.update(world, dt);
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
    window.addEventListener('resize', function () { requestAnimationFrame(drawScene); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
</script>
`;

html = html.replace('</body>', mock + '\n</body>');
await writeFile(out, html, 'utf8');
console.log(`mock preview: ${out} — ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB (from ${(bytes0 / 1024).toFixed(1)} KB)`);
