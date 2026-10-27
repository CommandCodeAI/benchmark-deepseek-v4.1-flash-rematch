/* =========================================================================
   VIVARIUM — THE RECORD
   Canvas plates for the closed study: Fig. 2 (census) and Fig. 3–14 (drift).
   Ink-on-paper, hand-ruled, deterministic from the run seed.
   No libraries, no external assets, no network. Canvas 2D only.
   ========================================================================= */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------- constants */

  var TAU = Math.PI * 2;
  var TAXA = ['flora', 'herbivora', 'carnivora'];
  var GENE_KEYS = ['speed', 'vision', 'metabolism', 'threshold'];
  var ROMAN = ['I', 'II', 'III', 'IV'];

  var SERIF = '"Bodoni 72", Didot, "Bodoni MT", "Iowan Old Style", "Palatino Linotype", Georgia, serif';
  var SANS = 'Optima, "Gill Sans", "Gill Sans MT", "Avenir Next", "Trebuchet MS", sans-serif';
  var MONO = '"SF Mono", SFMono-Regular, Menlo, "Roboto Mono", "Courier New", monospace';

  var FALLBACK = {
    paper: '#f4ecda', paperLo: '#e2d6bf', ink: '#211d16', ink2: '#574f40', ink3: '#8b806c',
    rule: '#c9baa0', ruleStrong: '#a8977b', brass: '#a08043', brassHi: '#c9ab6d', brassLo: '#6f5730',
    wax: '#7a2b23', flora: '#4f6f52', floraSoft: '#8aa286', fauna: '#ab7a35', faunaSoft: '#cdb184',
    predator: '#93372d', predatorSoft: '#bd837a'
  };

  var TAXON_FALLBACK = {
    flora: { name: 'Flora', latin: 'Flora', color: FALLBACK.flora, soft: FALLBACK.floraSoft, glyph: 'flora' },
    herbivora: { name: 'Herbivora', latin: 'Herbivora', color: FALLBACK.fauna, soft: FALLBACK.faunaSoft, glyph: 'fauna' },
    carnivora: { name: 'Carnivora', latin: 'Carnivora', color: FALLBACK.predator, soft: FALLBACK.predatorSoft, glyph: 'predator' }
  };

  /* Expression notes / labels used only when the engine metadata is absent. */
  var GENE_FALLBACK = {
    flora: {
      speed: { label: 'Growth', expression: 'growth rate', min: 0.35, max: 1.75, unit: '×' },
      vision: { label: 'Dispersal', expression: 'seed dispersal', min: 0.8, max: 4.5, unit: 'cells' },
      metabolism: { label: 'Conversion', expression: 'light conversion', min: 0.55, max: 1.55, unit: 'index' },
      threshold: { label: 'Threshold', expression: 'seeding biomass', min: 0.45, max: 1.25, unit: 'energy' }
    },
    herbivora: {
      speed: { label: 'Speed', expression: 'locomotion', min: 0.35, max: 1.85, unit: 'cells/tick' },
      vision: { label: 'Vision', expression: 'perception', min: 1.5, max: 9.5, unit: 'cells' },
      metabolism: { label: 'Metabolism', expression: 'energy conversion', min: 0.55, max: 1.6, unit: 'index' },
      threshold: { label: 'Threshold', expression: 'breeding energy', min: 0.55, max: 1.45, unit: 'energy' }
    },
    carnivora: {
      speed: { label: 'Speed', expression: 'pursuit', min: 0.35, max: 1.85, unit: 'cells/tick' },
      vision: { label: 'Vision', expression: 'perception', min: 1.5, max: 9.5, unit: 'cells' },
      metabolism: { label: 'Metabolism', expression: 'energy conversion', min: 0.55, max: 1.6, unit: 'index' },
      threshold: { label: 'Threshold', expression: 'breeding energy', min: 0.55, max: 1.45, unit: 'energy' }
    }
  };

  var CAT_FALLBACK = {
    drought: { latin: 'Siccitas', name: 'Drought', initial: 'S', duration: 3 },
    plague: { latin: 'Pestilentia', name: 'Plague', initial: 'P', duration: 3 },
    wildfire: { latin: 'Incendium', name: 'Wildfire', initial: 'I', duration: 2 }
  };

  /* ------------------------------------------------------------------ state */

  var state = {
    world: null,
    model: null,
    theme: null,
    hoverGen: null,
    censusGeom: null,
    raf: 0,
    hiddenTimer: 0,
    observersReady: false,
    lastWidth: 0,
    lastHeight: 0
  };

  /* ---------------------------------------------------------------- helpers */

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function strHash(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function mulberry32(a) {
    a |= 0;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hash01(seed, a, b) {
    var h = (seed | 0) ^ Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77);
    h = Math.imul(h ^ (h >>> 16), 0x7feb352d);
    h = Math.imul(h ^ (h >>> 15), 0x846ca68b);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }

  function fmtInt(n) {
    var v = Math.round(n);
    return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  function fmtDec(n, d) {
    if (!isFinite(n)) return '—';
    return n.toFixed(d == null ? 2 : d);
  }
  function fmtPct(n) {
    if (!isFinite(n)) return '—';
    var r = Math.round(n);
    return (r > 0 ? '+' : r < 0 ? '−' : '±') + Math.abs(r) + '%';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function withAlpha(hex, a) {
    var key = hex + '|' + a;
    if (withAlpha.cache[key]) return withAlpha.cache[key];
    var h = String(hex || '#000').replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    var out = isFinite(n)
      ? 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'
      : 'rgba(33,29,22,' + a + ')';
    withAlpha.cache[key] = out;
    return out;
  }
  withAlpha.cache = {};

  function fontMono(px, weight) { return (weight || 400) + ' ' + px + 'px ' + MONO; }
  function fontSans(px, weight) { return (weight || 400) + ' ' + px + 'px ' + SANS; }
  function fontSerif(px, style) { return (style ? style + ' ' : '') + px + 'px ' + SERIF; }

  function getTheme() {
    if (state.theme) return state.theme;
    var t = {
      paper: FALLBACK.paper, paperLo: FALLBACK.paperLo, ink: FALLBACK.ink, ink2: FALLBACK.ink2,
      ink3: FALLBACK.ink3, rule: FALLBACK.rule, ruleStrong: FALLBACK.ruleStrong,
      brass: FALLBACK.brass, brassHi: FALLBACK.brassHi, brassLo: FALLBACK.brassLo, wax: FALLBACK.wax
    };
    try {
      if (typeof document !== 'undefined' && document.documentElement) {
        var cs = getComputedStyle(document.documentElement);
        var map = {
          paper: '--paper', paperLo: '--paper-lo', ink: '--ink', ink2: '--ink-2', ink3: '--ink-3',
          rule: '--rule', ruleStrong: '--rule-strong', brass: '--brass', brassHi: '--brass-hi',
          brassLo: '--brass-lo', wax: '--wax'
        };
        for (var k in map) {
          var v = cs.getPropertyValue(map[k]).trim();
          if (v) t[k] = v;
        }
      }
    } catch (e) { /* paper defaults */ }
    state.theme = t;
    return t;
  }

  /* --------------------------------------------------------------- text */

  function trackWidth(ctx, str, font, tracking) {
    ctx.font = font;
    var chars = Array.from(String(str));
    var w = 0;
    for (var i = 0; i < chars.length; i++) w += ctx.measureText(chars[i]).width;
    return w + tracking * Math.max(0, chars.length - 1);
  }

  /* Draws small-caps-style tracked text. Optional paper halo keeps ink
     annotations legible where they cross a curve. */
  function drawTracked(ctx, str, x, y, o) {
    o = o || {};
    var font = o.font || fontSans(8.5);
    var tracking = o.tracking == null ? 1.1 : o.tracking;
    var color = o.color || '#211d16';
    var chars = Array.from(String(str));
    if (!chars.length) return 0;
    ctx.font = font;
    ctx.textAlign = 'left';
    var widths = chars.map(function (c) { return ctx.measureText(c).width; });
    var total = widths.reduce(function (a, b) { return a + b; }, 0) + tracking * (chars.length - 1);
    var start = o.align === 'center' ? x - total / 2 : o.align === 'right' ? x - total : x;
    var prevBaseline = ctx.textBaseline;
    ctx.textBaseline = o.baseline || 'alphabetic';
    var i, cx = start;
    if (o.halo) {
      ctx.strokeStyle = o.halo;
      ctx.lineWidth = o.haloWidth == null ? 2.6 : o.haloWidth;
      ctx.lineJoin = 'round';
      cx = start;
      for (i = 0; i < chars.length; i++) { ctx.strokeText(chars[i], cx, y); cx += widths[i] + tracking; }
    }
    ctx.fillStyle = color;
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    cx = start;
    for (i = 0; i < chars.length; i++) { ctx.fillText(chars[i], cx, y); cx += widths[i] + tracking; }
    ctx.globalAlpha = 1;
    ctx.textBaseline = prevBaseline;
    return total;
  }

  /* ------------------------------------------------------------- ink paths */

  function catmullPoint(p0, p1, p2, p3, t) {
    var t2 = t * t, t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3)
    };
  }

  function sampleCurve(pts, step) {
    if (!pts.length) return [];
    if (pts.length === 1) return [{ x: pts[0].x, y: pts[0].y }];
    var out = [];
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      var seg = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      var steps = Math.max(2, Math.min(48, Math.ceil(seg / (step || 3))));
      for (var s = 0; s < steps; s++) out.push(catmullPoint(p0, p1, p2, p3, s / steps));
    }
    out.push({ x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });
    return out;
  }

  function inkPath(pts, amp, seed, key) {
    var path = new Path2D();
    if (!pts.length) return path;
    if (pts.length === 1) { path.moveTo(pts[0].x, pts[0].y); path.lineTo(pts[0].x + 0.01, pts[0].y); return path; }
    var samples = sampleCurve(pts, 3);
    var phase = hash01(seed, strHash(key || 'ink'), 7) * TAU;
    var kHash = strHash(key || 'ink');
    var jitter = [];
    for (var i = 0; i < samples.length; i++) {
      var p = samples[i];
      var prev = samples[Math.max(0, i - 1)], next = samples[Math.min(samples.length - 1, i + 1)];
      var dx = next.x - prev.x, dy = next.y - prev.y;
      var len = Math.hypot(dx, dy) || 1;
      var nx = -dy / len, ny = dx / len;
      var w = amp * (0.55 * Math.sin(i * 0.86 + phase) + 0.45 * (hash01(seed, kHash, i) * 2 - 1));
      jitter.push({ x: p.x + nx * w, y: p.y + ny * w });
    }
    path.moveTo(jitter[0].x, jitter[0].y);
    for (var j = 1; j < jitter.length; j++) path.lineTo(jitter[j].x, jitter[j].y);
    return path;
  }

  /* Strokes a curve twice: a firm ink line and a fainter offset ghost, so the
     line reads as hand-ruled rather than vector-perfect. */
  function strokeInk(ctx, pts, o) {
    o = o || {};
    if (!pts.length) return;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, Math.max(1.4, (o.width || 1.2) * 1.2), 0, TAU);
      ctx.fillStyle = o.color;
      ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
      ctx.fill();
      ctx.restore();
      return;
    }
    var path = inkPath(pts, o.amp == null ? 0.5 : o.amp, o.seed || 1, o.key || 'ink');
    if (o.dash) ctx.setLineDash(o.dash);
    ctx.strokeStyle = o.color;
    ctx.lineWidth = o.width || 1.2;
    ctx.globalAlpha = o.alpha == null ? 1 : o.alpha;
    ctx.stroke(path);
    if (o.ghost !== false) {
      ctx.globalAlpha = (o.alpha == null ? 1 : o.alpha) * 0.26;
      ctx.lineWidth = Math.max(0.5, (o.width || 1.2) * 0.62);
      ctx.translate(0.7, -0.45);
      ctx.strokeStyle = o.ghostColor || o.color;
      ctx.stroke(inkPath(pts, (o.amp == null ? 0.5 : o.amp) * 1.7, (o.seed || 1) + 31, (o.key || 'ink') + 'g'));
    }
    ctx.restore();
  }

  function roughLine(ctx, x1, y1, x2, y2, o) {
    o = o || {};
    strokeInk(ctx, [{ x: x1, y: y1 }, { x: x2, y: y2 }], {
      color: o.color || '#8b806c', width: o.width || 0.8, amp: o.amp == null ? 0.35 : o.amp,
      seed: o.seed || 1, key: o.key || ('rl' + x1 + y1 + x2 + y2), alpha: o.alpha == null ? 1 : o.alpha,
      ghost: false, dash: o.dash
    });
  }

  /* --------------------------------------------------------------- glyphs */

  /* The glyph language is shared with the plate: a seedling, a ringed grazer,
     a chevron hunter. Drawn by hand for canvas, mirrored as SVG for HTML. */
  function glyphPath(ctx, kind, cx, cy, size, seed, jitter) {
    var s = size / 16;
    var j = jitter == null ? 0.35 : jitter;
    function px(x) { return cx + (x - 8) * s; }
    function py(y) { return cy + (y - 8) * s; }
    function jx(k) { return (hash01(seed || 1, strHash(kind), strHash(kind + k)) * 2 - 1) * j; }
    ctx.beginPath();
    if (kind === 'flora') {
      ctx.moveTo(px(8) + jx('a'), py(2.4));
      ctx.lineTo(px(8) + jx('b'), py(13.8));
      ctx.moveTo(px(8), py(8) + jx('c'));
      ctx.lineTo(px(3.3), py(3.5));
      ctx.moveTo(px(8), py(8) + jx('d'));
      ctx.lineTo(px(12.7), py(3.5));
      ctx.moveTo(px(8), py(11.4) + jx('e'));
      ctx.lineTo(px(4.2), py(13.9));
      ctx.moveTo(px(8), py(11.4));
      ctx.lineTo(px(11.8), py(13.9));
    } else if (kind === 'fauna') {
      ctx.arc(px(8), py(8), 4.3 * s, 0, TAU);
      ctx.moveTo(px(8) + 1.05, py(8));
      ctx.arc(px(8), py(8), 1.05, 0, TAU);
      ctx.moveTo(px(11.6), py(11.6));
      ctx.lineTo(px(14), py(14));
    } else {
      ctx.moveTo(px(3), py(12.4));
      ctx.lineTo(px(8.1), py(2.6));
      ctx.lineTo(px(13), py(12.4));
      ctx.moveTo(px(5.4), py(9.3));
      ctx.lineTo(px(10.6), py(9.4));
    }
  }

  function drawGlyph(ctx, kind, cx, cy, size, color, seed, lw) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw == null ? 1.1 : lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    glyphPath(ctx, kind, cx, cy, size, seed, 0.3);
    ctx.stroke();
    if (kind === 'fauna') {
      ctx.beginPath();
      ctx.arc(cx, cy, size * 0.068, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function glyphSvg(kind, size, color) {
    var body;
    if (kind === 'flora') {
      body = '<path d="M8 2v12M8 8 3.2 3.4M8 8l4.8-4.6M8 11.4 4.1 14M8 11.4l3.9 2.6" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>';
    } else if (kind === 'fauna') {
      body = '<circle cx="8" cy="8" r="4.4" fill="none" stroke="currentColor" stroke-width="1.2"/><circle cx="8" cy="8" r="1.1" fill="currentColor"/><path d="M11.6 11.6 14 14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>';
    } else {
      body = '<path d="M3 12.4 8.1 2.6l4.9 9.8M5.4 9.3l5.2.1" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" stroke-linecap="round"/>';
    }
    return '<svg viewBox="0 0 16 16" width="' + size + '" height="' + size + '" aria-hidden="true" focusable="false" style="color:' + esc(color) + '">' + body + '</svg>';
  }

  /* --------------------------------------------------------------- paper */

  function drawPlate(ctx, W, H, seed, theme) {
    ctx.save();
    ctx.fillStyle = withAlpha(theme.paper, 0.55);
    ctx.fillRect(0, 0, W, H);

    /* speckled laid-paper tooth, deterministic for the run seed */
    var rnd = mulberry32((seed * 2654435761) ^ (W * 31 + H * 17));
    var dots = Math.round((W * H) / 1500);
    for (var i = 0; i < dots; i++) {
      var x = rnd() * W, y = rnd() * H;
      var r = rnd() < 0.86 ? 0.55 : 0.85;
      ctx.fillStyle = withAlpha(theme.ink, 0.018 + rnd() * 0.028);
      ctx.fillRect(x, y, r, r);
    }
    for (var f = 0; f < 14; f++) {
      var fx = rnd() * W, fy = rnd() * H, fl = 3 + rnd() * 7, fa = rnd() * TAU;
      ctx.strokeStyle = withAlpha(theme.ink, 0.015 + rnd() * 0.02);
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(fx + Math.cos(fa) * fl, fy + Math.sin(fa) * fl);
      ctx.stroke();
    }

    /* engraved plate frame + corner ticks */
    ctx.strokeStyle = withAlpha(theme.ruleStrong, 0.5);
    ctx.lineWidth = 0.8;
    ctx.strokeRect(0.6, 0.6, W - 1.2, H - 1.2);
    ctx.strokeStyle = withAlpha(theme.ruleStrong, 0.16);
    ctx.lineWidth = 0.6;
    ctx.strokeRect(3.6, 3.6, W - 7.2, H - 7.2);
    ctx.strokeStyle = withAlpha(theme.ruleStrong, 0.55);
    ctx.lineWidth = 0.7;
    var inset = 7, arm = 9;
    [[0, 0, 1, 1], [W, 0, -1, 1], [0, H, 1, -1], [W, H, -1, -1]].forEach(function (c) {
      ctx.beginPath();
      ctx.moveTo(c[0] + c[2] * inset, c[1] + c[3] * (inset + arm));
      ctx.lineTo(c[0] + c[2] * inset, c[1] + c[3] * inset);
      ctx.lineTo(c[0] + c[2] * (inset + arm), c[1] + c[3] * inset);
      ctx.stroke();
    });
    ctx.restore();
  }

  function drawPin(ctx, x, y, r, theme) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r + 0.8, 0, TAU);
    ctx.fillStyle = withAlpha(theme.wax, 0.22);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    ctx.fillStyle = theme.wax;
    ctx.globalAlpha = 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(x - r * 0.28, y - r * 0.3, r * 0.34, 0, TAU);
    ctx.fillStyle = withAlpha('#ffffff', 0.32);
    ctx.fill();
    ctx.restore();
  }

  /* --------------------------------------------------------------- reading */

  function seedOf(world) {
    var s = world && (world.seed != null ? world.seed : (world.config && world.config.seed));
    s = Number(s);
    return isFinite(s) && s > 0 ? Math.round(s) : 1977;
  }

  function normalizeGlyph(g, sp) {
    if (g === 'flora') return 'flora';
    if (g === 'fauna') return 'fauna';
    if (g === 'predator') return 'predator';
    return sp === 'flora' ? 'flora' : sp === 'herbivora' ? 'fauna' : 'predator';
  }

  function readSpecies(engine) {
    var out = {};
    TAXA.forEach(function (sp) {
      var e = engine && engine.SPECIES && engine.SPECIES[sp];
      var f = TAXON_FALLBACK[sp];
      out[sp] = {
        id: sp,
        name: (e && e.name) || f.name,
        latin: (e && e.latin) || f.latin,
        color: (e && e.color) || f.color,
        soft: (e && e.soft) || f.soft,
        glyph: normalizeGlyph(e && e.glyph, sp)
      };
    });
    return out;
  }

  function readHistory(world) {
    var raw = world && Array.isArray(world.history) ? world.history : [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var h = raw[i];
      if (!h || typeof h !== 'object') continue;
      var gen = num(h.gen);
      if (gen == null) gen = i;
      var counts = {};
      TAXA.forEach(function (sp) {
        var c = h.counts && num(h.counts[sp]);
        counts[sp] = c == null ? 0 : Math.max(0, c);
      });
      out.push({
        gen: gen,
        counts: counts,
        traits: h.traits || {},
        mutations: num(h.mutations) == null ? 0 : Math.max(0, num(h.mutations)),
        diversity: num(h.diversity),
        event: h.event || null
      });
    }
    out.sort(function (a, b) { return a.gen - b.gen; });
    return out;
  }

  function readEvents(world, history, engine) {
    var list = [];
    var seen = {};
    function add(e, fallbackGen) {
      if (!e) return;
      var gen = num(e.gen);
      if (gen == null) gen = fallbackGen;
      if (gen == null) return;
      var type = e.type || e.kind || (typeof e === 'string' ? e : null);
      if (!type) return;
      var key = type + '@' + gen;
      if (seen[key]) return;
      seen[key] = 1;
      var cat = (engine && engine.CATASTROPHES && engine.CATASTROPHES[type]) || CAT_FALLBACK[type] || {};
      list.push({
        gen: gen,
        type: type,
        latin: e.latin || cat.latin || type,
        name: e.name || cat.name || type,
        initial: e.initial || cat.initial || (String(type).charAt(0).toUpperCase()),
        tint: e.tint || cat.tint || FALLBACK.wax,
        duration: num(e.duration) != null ? num(e.duration) : cat.duration
      });
    }
    if (world && Array.isArray(world.events)) world.events.forEach(function (e) { add(e, null); });
    if (!list.length && history.length) history.forEach(function (h) { if (h.event) add({ type: h.event, gen: h.gen }, h.gen); });
    list.sort(function (a, b) { return a.gen - b.gen; });
    return list;
  }

  function speciesFate(history, sp) {
    var aliveAny = false, lastAlive = null, extinctAt = null;
    for (var i = 0; i < history.length; i++) {
      var c = history[i].counts[sp];
      if (c > 0) { aliveAny = true; lastAlive = history[i].gen; }
      else if (aliveAny && extinctAt == null) extinctAt = history[i].gen;
    }
    var last = history.length ? history[history.length - 1] : null;
    var finalCount = last ? last.counts[sp] : 0;
    return {
      aliveAtEnd: finalCount > 0,
      aliveAny: aliveAny,
      lastAlive: lastAlive,
      extinctAt: extinctAt,
      finalCount: finalCount,
      neverEstablished: !aliveAny
    };
  }

  function largestDrop(history, sp) {
    var best = null;
    for (var i = 1; i < history.length; i++) {
      var prev = history[i - 1].counts[sp], cur = history[i].counts[sp];
      if (prev <= 0) continue;
      var delta = cur - prev;
      if (!best || delta < best.delta) best = { delta: delta, gen: history[i].gen, prev: prev, pct: (delta / prev) * 100 };
    }
    return best;
  }

  function traitSeries(history, sp, gene) {
    var pts = [];
    for (var i = 0; i < history.length; i++) {
      var tr = history[i].traits && history[i].traits[sp] && history[i].traits[sp][gene];
      if (!tr) continue;
      var n = num(tr.n);
      if (n === 0) continue;
      var mean = num(tr.mean);
      if (mean == null) continue;
      var sd = num(tr.sd);
      pts.push({ gen: history[i].gen, mean: mean, sd: sd == null ? 0 : Math.max(0, sd) });
    }
    var segments = [];
    var cur = [];
    for (var j = 0; j < pts.length; j++) {
      if (cur.length && pts[j].gen - cur[cur.length - 1].gen > 1) { segments.push(cur); cur = []; }
      cur.push(pts[j]);
    }
    if (cur.length) segments.push(cur);
    return {
      points: pts,
      segments: segments,
      last: pts.length ? pts[pts.length - 1] : null,
      firstGen: pts.length ? pts[0].gen : null
    };
  }

  function geneMetaFor(engine, sp, gene, history) {
    var m = engine && engine.GENE_META && engine.GENE_META[sp] && engine.GENE_META[sp][gene];
    if (m && num(m.min) != null && num(m.max) != null && m.max > m.min) {
      return { min: m.min, max: m.max, unit: m.unit || '', label: m.label || gene, expression: m.expression || '' };
    }
    var f = GENE_FALLBACK[sp] && GENE_FALLBACK[sp][gene];
    if (f) return { min: f.min, max: f.max, unit: f.unit, label: f.label, expression: f.expression };
    /* last resort: derive a padded domain from the record itself */
    var lo = Infinity, hi = -Infinity;
    TAXA.forEach(function (s) {
      var tr = traitSeries(history, s, gene);
      tr.points.forEach(function (p) {
        lo = Math.min(lo, p.mean - p.sd);
        hi = Math.max(hi, p.mean + p.sd);
      });
    });
    if (!isFinite(lo) || !isFinite(hi)) { lo = 0; hi = 1; }
    if (hi - lo < 1e-6) { lo -= 0.05; hi += 0.05; }
    var pad = (hi - lo) * 0.12;
    return { min: lo - pad, max: hi + pad, unit: '', label: gene, expression: '' };
  }

  function buildModel(world) {
    var engine = root.VIVARIUM_ENGINE || null;
    var history = readHistory(world);
    var lastGen = 0;
    if (history.length) lastGen = history[history.length - 1].gen;
    var wGen = num(world && world.generation);
    if (wGen != null) lastGen = Math.max(lastGen, wGen);
    lastGen = Math.max(0, Math.round(lastGen));
    var seed = seedOf(world);
    var events = readEvents(world, history, engine);
    if (events.length) events = events.filter(function (e) { return e.gen >= 0 && e.gen <= Math.max(lastGen, 1); });
    var species = readSpecies(engine);
    var genes = (engine && Array.isArray(engine.GENE_KEYS) && engine.GENE_KEYS.length) ? engine.GENE_KEYS.slice(0, 4) : GENE_KEYS.slice();
    if (genes.length !== 4) genes = GENE_KEYS.slice();

    var fates = {}, drops = {}, series = {}, trait = {}, geneMeta = {};
    var countMax = 1;
    TAXA.forEach(function (sp) {
      fates[sp] = speciesFate(history, sp);
      drops[sp] = largestDrop(history, sp);
      series[sp] = [];
      trait[sp] = {};
      geneMeta[sp] = {};
      history.forEach(function (h) { series[sp].push({ gen: h.gen, v: h.counts[sp] }); });
      genes.forEach(function (gene) {
        trait[sp][gene] = traitSeries(history, sp, gene);
        geneMeta[sp][gene] = geneMetaFor(engine, sp, gene, history);
      });
    });
    history.forEach(function (h) { TAXA.forEach(function (sp) { countMax = Math.max(countMax, h.counts[sp]); }); });

    var mutationsTotal = 0, diversityFinals = [], diversityFirsts = [];
    history.forEach(function (h) {
      mutationsTotal += h.mutations;
      if (h.diversity != null) diversityFinals.push(h.diversity);
    });
    var meanMutations = history.length ? mutationsTotal / history.length : 0;
    var finalCounts = { flora: 0, herbivora: 0, carnivora: 0 };
    var firstCounts = { flora: 0, herbivora: 0, carnivora: 0 };
    if (history.length) {
      finalCounts = Object.assign({}, history[history.length - 1].counts);
      firstCounts = Object.assign({}, history[0].counts);
    } else if (world && world.counts) {
      TAXA.forEach(function (sp) { finalCounts[sp] = num(world.counts[sp]) != null ? Math.max(0, world.counts[sp]) : 0; });
    }
    var diversityFinal = diversityFinals.length ? diversityFinals[diversityFinals.length - 1] : fallbackDiversity(finalCounts);
    var diversityFirst = diversityFinals.length ? diversityFinals[0] : fallbackDiversity(firstCounts);
    var ticks = num(world && world.tick) != null ? Math.max(0, num(world.tick)) : lastGen * 30;

    return {
      world: world,
      engine: engine,
      seed: seed,
      history: history,
      lastGen: lastGen,
      events: events,
      species: species,
      genes: genes,
      fates: fates,
      drops: drops,
      series: series,
      trait: trait,
      geneMeta: geneMeta,
      countMax: countMax,
      finalCounts: finalCounts,
      firstCounts: firstCounts,
      meanMutations: meanMutations,
      mutationsTotal: mutationsTotal,
      diversityFinal: diversityFinal,
      diversityFirst: diversityFirst,
      ticks: ticks
    };
  }

  function fallbackDiversity(counts) {
    var total = 0, vals = [];
    TAXA.forEach(function (sp) { if (counts[sp] > 0) { vals.push(counts[sp]); total += counts[sp]; } });
    if (!vals.length || total <= 0) return 0;
    var h = 0;
    vals.forEach(function (v) { var p = v / total; h -= p * Math.log(p); });
    return clamp(h / Math.log(3), 0, 1);
  }

  /* ------------------------------------------------------------- geometry */

  function niceStep(range, target) {
    if (!isFinite(range) || range <= 0) return 1;
    var raw = range / Math.max(1, target);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step;
    if (norm <= 1) step = 1;
    else if (norm <= 2) step = 2;
    else if (norm <= 2.5) step = 2.5;
    else if (norm <= 5) step = 5;
    else step = 10;
    return step * mag;
  }

  function countAxis(maxCount) {
    var max = Math.max(1, maxCount);
    var step = niceStep(max, 4);
    if (step < 1) step = 1;
    var top = Math.ceil(max / step) * step;
    if (top <= 0) top = step;
    var ticks = [];
    for (var v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v));
    return { max: top, step: step, ticks: ticks };
  }

  function decForSpan(span) {
    if (span >= 6) return 1;
    if (span >= 1.2) return 2;
    return 2;
  }

  function genLabel(gen) { return 'G' + pad2(Math.round(gen)); }

  /* Sizes the backing store from the wrapper's layout box (clientWidth /
     clientHeight), never from getBoundingClientRect(): an ancestor transform
     during the record's entrance would otherwise bake a scaled size in. The
     canvas gets an integer CSS size so the backing store maps 1:1 at DPR 1. */
  function fitCanvas(canvas) {
    var wrap = canvas.parentElement;
    if (!wrap) return null;
    var W = Math.round(wrap.clientWidth);
    var H = Math.round(wrap.clientHeight);
    if (W < 40 || H < 30) return null;
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    var bw = Math.round(W * dpr), bh = Math.round(H * dpr);
    if (canvas.width !== bw) canvas.width = bw;
    if (canvas.height !== bh) canvas.height = bh;
    var cssW = W + 'px', cssH = H + 'px';
    if (canvas.style.width !== cssW) canvas.style.width = cssW;
    if (canvas.style.height !== cssH) canvas.style.height = cssH;
    var ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    return { ctx: ctx, W: W, H: H, dpr: dpr };
  }

  /* ==================================================================== */
  /*  FIG. 2 — CENSUS OF THE THREE KINGDOMS                               */
  /* ==================================================================== */

  function drawCensus(canvas, model, hoverGen) {
    var fit = fitCanvas(canvas);
    if (!fit) return;
    var ctx = fit.ctx, W = fit.W, H = fit.H;
    var theme = getTheme();
    var narrow = W < 720;
    var fs = narrow ? 0.92 : 1;

    drawPlate(ctx, W, H, model.seed, theme);

    var margin = {
      left: Math.round((narrow ? 46 : 54)),
      right: Math.round((narrow ? 88 : 100)),
      top: Math.round(narrow ? 28 : 33),
      bottom: Math.round(narrow ? 27 : 30)
    };
    var x0 = margin.left, y0 = margin.top;
    var plotW = Math.max(20, W - margin.left - margin.right);
    var plotH = Math.max(20, H - margin.top - margin.bottom);
    var y1 = y0 + plotH;
    var genMax = Math.max(1, model.lastGen);

    var axis = countAxis(model.countMax);
    var yOf = function (v) { return y1 - clamp(v / axis.max, 0, 1) * plotH; };
    var xOf = function (gen) { return x0 + (clamp(gen, 0, genMax) / genMax) * plotW; };

    /* ---- axes ---- */
    roughLine(ctx, x0, y0, x0, y1, { color: theme.ink3, width: 0.85, seed: model.seed, key: 'c-y', alpha: 0.85 });
    roughLine(ctx, x0, y1, x0 + plotW, y1, { color: theme.ink3, width: 0.85, seed: model.seed, key: 'c-x', alpha: 0.85 });

    /* y ticks */
    var tickFont = fontMono(9.3 * fs);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    axis.ticks.forEach(function (v) {
      var ty = yOf(v);
      roughLine(ctx, x0 - 4, ty, x0, ty, { color: theme.ink3, width: 0.75, seed: model.seed, key: 'cyt' + v, alpha: 0.8 });
      ctx.font = tickFont;
      ctx.fillStyle = withAlpha(theme.ink2, 0.95);
      ctx.fillText(fmtInt(v), x0 - 8, ty + 0.5);
    });

    /* x ticks */
    var xStep = Math.max(1, Math.round(niceStep(genMax, narrow ? 6 : 8)));
    var xTicks = [];
    for (var g = 0; g <= genMax + 1e-9; g += xStep) xTicks.push(g);
    if (model.lastGen > 0 && xTicks[xTicks.length - 1] !== model.lastGen) xTicks.push(model.lastGen);
    xTicks = xTicks.filter(function (gv) { return gv <= genMax; });
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    xTicks.forEach(function (gv) {
      var tx = xOf(gv);
      roughLine(ctx, tx, y1, tx, y1 + 3.5, { color: theme.ink3, width: 0.7, seed: model.seed, key: 'cxt' + gv, alpha: 0.75 });
      ctx.font = fontMono(9.3 * fs);
      ctx.fillStyle = withAlpha(theme.ink2, 0.9);
      ctx.fillText(String(Math.round(gv)), tx, y1 + 15);
    });

    /* axis titles */
    drawTracked(ctx, 'GENERATION', x0 + plotW / 2, y1 + 26, {
      font: fontSans(7.9 * fs), tracking: 1.55, color: withAlpha(theme.ink3, 0.95), align: 'center'
    });
    ctx.save();
    ctx.translate(11.5, y0 + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    drawTracked(ctx, 'INDIVIDUALS', 0, 0, {
      font: fontSans(7.9 * fs), tracking: 1.55, color: withAlpha(theme.ink3, 0.95), align: 'center'
    });
    ctx.restore();

    /* ---- catastrophe rules ---- */
    var ruleAlpha = model.events.length > 18 ? 0.42 : 0.5;
    model.events.forEach(function (ev, i) {
      var ex = clamp(xOf(ev.gen), x0 + 2, x0 + plotW - 2);
      ctx.save();
      ctx.setLineDash([2, 3.2]);
      ctx.strokeStyle = withAlpha(theme.wax, ruleAlpha);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(ex, y0 + 3);
      ctx.lineTo(ex, y1);
      ctx.stroke();
      ctx.restore();
    });

    /* ---- curves ---- */
    var seriesGeom = {};
    TAXA.forEach(function (sp) {
      var spMeta = model.species[sp];
      var all = model.series[sp];
      if (!all || !all.length) return;
      var byGen = {};
      all.forEach(function (p) { byGen[p.gen] = p.v; });
      var pts = [];
      var gens = all.map(function (p) { return p.gen; }).sort(function (a, b) { return a - b; });
      var contiguous = [];
      gens.forEach(function (gv, i) {
        if (i === 0 || gv - gens[i - 1] <= 1) contiguous.push(gv);
        else contiguous = [gv];
      });
      /* keep the whole record (extinction flatlines are honest data) */
      all.forEach(function (p) { pts.push({ x: xOf(p.gen), y: yOf(p.v) }); });
      seriesGeom[sp] = { pts: pts, values: all, byGen: byGen };
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, 2, 0, TAU);
        ctx.fillStyle = spMeta.color;
        ctx.fill();
      } else {
        strokeInk(ctx, pts, {
          color: spMeta.color, width: 1.45, amp: 0.55, seed: model.seed,
          key: 'census-' + sp, alpha: 0.96
        });
      }
    });

    /* ---- no record at all: say so quietly on the plate ---- */
    if (!model.history.length) {
      ctx.save();
      ctx.font = fontSerif(11.5 * fs, 'italic');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = withAlpha(theme.ink3, 0.9);
      ctx.fillText('No census was recorded; the ledger is blank.', x0 + plotW / 2, y0 + plotH / 2);
      ctx.restore();
      state.censusGeom = { x0: x0, plotW: plotW, y0: y0, y1: y1, genMax: genMax, gens: [] };
      return;
    }

    /* ---- end-state labels ---- */
    var labels = [];
    TAXA.forEach(function (sp) {
      var spMeta = model.species[sp];
      var geom = seriesGeom[sp];
      if (!geom || !geom.values.length) return;
      var last = geom.values[geom.values.length - 1];
      var fate = model.fates[sp];
      var label = {
        sp: sp, color: spMeta.color, glyph: spMeta.glyph, name: spMeta.name,
        y: yOf(last.v), x: xOf(last.gen)
      };
      if (fate.neverEstablished) {
        label.kind = 'none';
        label.y = y1 - 4;
      } else if (!fate.aliveAtEnd) {
        label.kind = 'extinct';
        label.status = 'EXTINCT';
        label.sub = genLabel(fate.extinctAt == null ? last.gen : fate.extinctAt);
        label.extinctX = xOf(fate.extinctAt == null ? last.gen : fate.extinctAt);
        label.y = y1 - 4;
      } else {
        label.kind = 'count';
        label.value = fate.finalCount;
      }
      labels.push(label);
    });

    /* deconflict vertically; extinct rows are one line taller */
    labels.sort(function (a, b) { return a.y - b.y; });
    var cursor = y0 + 7;
    labels.forEach(function (l) {
      var h = l.kind === 'count' ? 14 : 22;
      l.labelY = Math.max(cursor, Math.min(l.y, y1 - h + 2));
      cursor = l.labelY + h + 2;
    });
    var overflow = labels.length ? labels[labels.length - 1].labelY + (labels[labels.length - 1].kind === 'count' ? 14 : 22) - (y1 + 4) : 0;
    if (overflow > 0) labels.forEach(function (l) { l.labelY -= overflow; });

    var singleReading = model.history.length <= 1;
    if (singleReading) {
      TAXA.forEach(function (sp) {
        var geom = seriesGeom[sp];
        if (!geom || !geom.values.length) return;
        var last = geom.values[geom.values.length - 1];
        var spMeta = model.species[sp];
        var fate = model.fates[sp];
        var dx = xOf(last.gen), dy = yOf(last.v);
        ctx.font = fontMono(10.8 * fs);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = theme.ink;
        var valTxt = fmtInt(last.v);
        ctx.fillText(valTxt, dx + 13, dy - 1.5);
        var valW = ctx.measureText(valTxt).width;
        drawTracked(ctx, spMeta.name.toUpperCase(), dx + 13 + valW + 5, dy - 1.5, {
          font: fontSans(6.9 * fs), tracking: 1.15, color: withAlpha(theme.ink3, 0.95)
        });
        drawGlyph(ctx, spMeta.glyph, dx + 6.5, dy - 3, 9, spMeta.color, model.seed, 0.9);
        if (!fate.aliveAtEnd) {
          drawTracked(ctx, 'EXTINCT', dx + 13, dy + 10, {
            font: fontSans(6.8 * fs), tracking: 1.1, color: theme.wax
          });
        }
      });
    } else {
    labels.forEach(function (l) {
      var lx = x0 + plotW + 9;
      if (l.labelY < y0 + 4) l.labelY = y0 + 4;
      if (Math.abs(l.labelY - l.y) > 1.2) {
        roughLine(ctx, l.x + 3, l.y, lx - 3, l.labelY - 2, {
          color: withAlpha(l.color, 0.55), width: 0.6, amp: 0.25, seed: model.seed,
          key: 'lead' + l.sp, alpha: 0.7
        });
      }
      /* end dot, with a paper ring so it sits on the plate */
      ctx.save();
      ctx.beginPath();
      ctx.arc(l.x, l.y, 2.1, 0, TAU);
      ctx.fillStyle = l.color;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(l.x, l.y, 3.4, 0, TAU);
      ctx.strokeStyle = withAlpha(theme.paper, 0.85);
      ctx.lineWidth = 1.2;
      ctx.stroke();
      if (l.kind === 'extinct') {
        ctx.beginPath();
        ctx.arc(l.extinctX, y1, 2.2, 0, TAU);
        ctx.strokeStyle = withAlpha(theme.wax, 0.8);
        ctx.lineWidth = 0.9;
        ctx.stroke();
      }
      ctx.restore();

      drawGlyph(ctx, l.glyph, lx + 3.5, l.labelY - 3, 9.5, l.color, model.seed, 0.9);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      if (l.kind === 'count') {
        drawTracked(ctx, l.name.toUpperCase(), lx + 11, l.labelY - 2.4, {
          font: fontSans(6.8 * fs), tracking: 1.15, color: withAlpha(theme.ink3, 0.95)
        });
        ctx.font = fontMono(10.6 * fs);
        ctx.textAlign = 'right';
        ctx.fillStyle = theme.ink;
        ctx.fillText(fmtInt(l.value), W - 9, l.labelY - 2.4);
      } else {
        drawTracked(ctx, l.name.toUpperCase(), lx + 11, l.labelY - 2.4, {
          font: fontSans(6.8 * fs), tracking: 1.15, color: withAlpha(theme.ink3, 0.95)
        });
        if (l.kind === 'none') {
          drawTracked(ctx, 'NOT ESTABLISHED', lx + 11, l.labelY + 8.4, {
            font: fontSans(6.8 * fs), tracking: 1.15, color: withAlpha(theme.ink3, 0.95)
          });
        } else {
          var extTxt = 'EXTINCT';
          drawTracked(ctx, extTxt, lx + 11, l.labelY + 8.4, {
            font: fontSans(6.8 * fs), tracking: 1.15, color: theme.wax
          });
          ctx.font = fontMono(8.2 * fs);
          ctx.textAlign = 'right';
          ctx.fillStyle = withAlpha(theme.ink3, 0.95);
          ctx.fillText(l.sub, W - 9, l.labelY + 8.4);
        }
      }
    });
    }

    /* ---- legend (top margin) ---- */
    var legendX = x0 + 1;
    var legendY = Math.round(y0 * 0.36) + 5;
    TAXA.forEach(function (sp) {
      var spMeta = model.species[sp];
      drawGlyph(ctx, spMeta.glyph, legendX + 4.5, legendY - 3.2, 10.5, spMeta.color, model.seed, 0.95);
      var w = drawTracked(ctx, spMeta.name.toUpperCase(), legendX + 12.5, legendY, {
        font: fontSans(7.7 * fs), tracking: 1.3, color: withAlpha(theme.ink2, 0.95)
      });
      legendX += 12.5 + w + 16;
    });
    var weatherText = model.events.length
      ? model.events.length + (model.events.length === 1 ? ' WEATHER' : ' WEATHERS')
      : 'NO WEATHER';
    drawTracked(ctx, weatherText, W - 11, legendY, {
      font: fontSans(7.2 * fs), tracking: 1.3, color: withAlpha(theme.ink3, 0.95), align: 'right'
    });

    /* ---- event pins + rotated labels ---- */
    var labelEvery = model.events.length > 12 ? Math.ceil(model.events.length / 10) : 1;
    var lastLabelX = -1e9;
    model.events.forEach(function (ev, i) {
      var ex = clamp(xOf(ev.gen), x0 + 2, x0 + plotW - 2);
      drawPin(ctx, ex, y0 + 2.5, 2.6, theme);
      var showLabel = i % labelEvery === 0 || i === model.events.length - 1;
      if (!showLabel) return;
      if (ex - lastLabelX < 11) return;
      lastLabelX = ex;
      ctx.save();
      ctx.translate(ex + 4, y0 + 11);
      ctx.rotate(-Math.PI / 2);
      drawTracked(ctx, String(ev.latin).toUpperCase() + ' · ' + genLabel(ev.gen), 0, 0, {
        font: fontSans(7.6 * fs), tracking: 1.2, color: withAlpha(theme.wax, 0.94),
        align: 'right', halo: withAlpha(theme.paper, 0.85), haloWidth: 2.6
      });
      ctx.restore();
    });

    /* ---- hover readout ---- */
    var hover = null;
    if (hoverGen != null && seriesGeom && model.history.length) {
      var nearest = null;
      for (var hgi = 0; hgi < model.history.length; hgi++) {
        var hg = model.history[hgi].gen;
        if (nearest == null || Math.abs(hg - hoverGen) < Math.abs(nearest - hoverGen)) nearest = hg;
      }
      if (nearest != null) hover = { gen: nearest, point: model.history.filter(function (h) { return h.gen === nearest; })[0] };
    }
    if (hover && hover.point) {
      var hx = xOf(hover.gen);
      ctx.save();
      ctx.setLineDash([2.4, 2.6]);
      ctx.strokeStyle = withAlpha(theme.ink2, 0.42);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(hx, y0);
      ctx.lineTo(hx, y1);
      ctx.stroke();
      ctx.restore();
      TAXA.forEach(function (sp) {
        var v = hover.point.counts[sp];
        var hy = yOf(v);
        ctx.beginPath();
        ctx.arc(hx, hy, 2.3, 0, TAU);
        ctx.fillStyle = model.species[sp].color;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(hx, hy, 3.6, 0, TAU);
        ctx.strokeStyle = withAlpha(theme.paper, 0.85);
        ctx.lineWidth = 1.1;
        ctx.stroke();
      });
      var cardW = narrow ? 92 : 104, cardH = 56;
      var cardX = hx > x0 + plotW / 2 ? x0 + 7 : x0 + plotW - cardW - 7;
      var cardY = y0 + 7;
      ctx.save();
      ctx.fillStyle = withAlpha(theme.paper, 0.94);
      ctx.fillRect(cardX, cardY, cardW, cardH);
      ctx.strokeStyle = withAlpha(theme.ruleStrong, 0.65);
      ctx.lineWidth = 0.7;
      ctx.strokeRect(cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1);
      drawTracked(ctx, 'GEN ' + pad2(hover.gen), cardX + 7, cardY + 11.5, {
        font: fontSans(7.6 * fs), tracking: 1.45, color: withAlpha(theme.ink2, 0.95)
      });
      TAXA.forEach(function (sp, i) {
        var rowY = cardY + 23.5 + i * 12;
        drawGlyph(ctx, model.species[sp].glyph, cardX + 10.5, rowY - 3, 8.5, model.species[sp].color, model.seed, 0.85);
        ctx.font = fontMono(9.4 * fs);
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = theme.ink;
        ctx.fillText(fmtInt(hover.point.counts[sp]), cardX + cardW - 7, rowY - 0.5);
      });
      ctx.restore();
    }

    state.censusGeom = {
      x0: x0, plotW: plotW, y0: y0, y1: y1, genMax: genMax,
      gens: model.history.map(function (h) { return h.gen; })
    };
  }

  /* ==================================================================== */
  /*  FIG. 3–14 — DRIFT AT THE FOUR LOCI                                  */
  /* ==================================================================== */

  function drawTraits(canvas, model) {
    var fit = fitCanvas(canvas);
    if (!fit) return;
    var ctx = fit.ctx, W = fit.W, H = fit.H;
    var theme = getTheme();

    drawPlate(ctx, W, H, model.seed + 7, theme);

    var narrow = W < 900;
    var fs = narrow ? 0.93 : 1;
    var left = Math.round(clamp(W * 0.088, narrow ? 92 : 106, 136));
    var right = 14;
    var top = Math.round(narrow ? 30 : 33);
    var bottom = Math.round(narrow ? 23 : 26);
    var gapX = Math.round(clamp(W * 0.011, 9, 17));
    var gapY = Math.round(clamp(H * 0.043, 10, 16));
    var matrixW = Math.max(80, W - left - right);
    var matrixH = Math.max(60, H - top - bottom);
    var cw = (matrixW - gapX * 3) / 4;
    var ch = (matrixH - gapY * 2) / 3;
    var genMax = Math.max(1, model.lastGen);
    var noteH = Math.round(14 * fs);

    var cellX = function (c) { return left + c * (cw + gapX); };
    var cellY = function (r) { return top + r * (ch + gapY); };

    /* column rules + headers */
    var geneShort = function (gene) {
      var lbl = gene;
      return String(lbl).toUpperCase();
    };
    for (var c = 0; c < 4; c++) {
      var cx = cellX(c);
      var romanFont = fontSerif(10.7 * fs, 'italic');
      var geneFont = fontSans(9.4 * fs);
      var romanW = trackWidth(ctx, ROMAN[c], romanFont, 0.4);
      var geneW = trackWidth(ctx, geneShort(model.genes[c]), geneFont, 1.3);
      var dotW = trackWidth(ctx, '·', fontSans(8 * fs), 0.4);
      var tx = cx + cw / 2 - (romanW + dotW + geneW + 10) / 2;
      drawTracked(ctx, ROMAN[c], tx, top - 16, {
        font: romanFont, tracking: 0.4, color: withAlpha(theme.brass, 0.95)
      });
      drawTracked(ctx, '·', tx + romanW + 4, top - 16, {
        font: fontSans(8 * fs), tracking: 0.4, color: withAlpha(theme.ink3, 0.8)
      });
      drawTracked(ctx, geneShort(model.genes[c]), tx + romanW + 4 + dotW + 4, top - 16, {
        font: geneFont, tracking: 1.3, color: withAlpha(theme.ink, 0.94)
      });
      roughLine(ctx, cx, top - 9, cx + cw, top - 9, {
        color: theme.rule, width: 0.7, seed: model.seed, key: 'th' + c, alpha: 0.75
      });
    }

    /* faint column separators in the gutters */
    for (var cs = 1; cs < 4; cs++) {
      var sepX = cellX(cs) - gapX / 2;
      roughLine(ctx, sepX, top, sepX, top + matrixH, {
        color: theme.rule, width: 0.6, seed: model.seed, key: 'tsep' + cs, alpha: 0.45
      });
    }

    /* row labels */
    TAXA.forEach(function (sp, r) {
      var meta = model.species[sp];
      var fate = model.fates[sp];
      var ry = cellY(r) + ch / 2;
      drawGlyph(ctx, meta.glyph, 16, ry - 9, 12, meta.color, model.seed, 1.05);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.font = fontSerif(12.8 * fs, 'italic');
      ctx.fillStyle = withAlpha(theme.ink, 0.95);
      ctx.fillText(meta.latin, 28, ry - 1);
      drawTracked(ctx, meta.name.toUpperCase(), 28, ry + 9, {
        font: fontSans(7.4 * fs), tracking: 1.35, color: withAlpha(theme.ink2, 0.92)
      });
      if (fate.neverEstablished) {
        ctx.font = fontSerif(8 * fs, 'italic');
        ctx.fillStyle = withAlpha(theme.ink3, 0.9);
        ctx.fillText('never established', 28, ry + 19);
      } else if (!fate.aliveAtEnd && fate.extinctAt != null) {
        ctx.font = fontSerif(8 * fs, 'italic');
        ctx.fillStyle = withAlpha(theme.wax, 0.9);
        ctx.fillText('lost ' + genLabel(fate.extinctAt), 28, ry + 19);
      }
    });

    /* cells */
    for (var row = 0; row < 3; row++) {
      var sp = TAXA[row];
      for (var col = 0; col < 4; col++) {
        drawTraitCell(ctx, {
          sp: sp, gene: model.genes[col], model: model, theme: theme,
          x0: cellX(col), y0: cellY(row), cw: cw, ch: ch,
          noteH: noteH, fs: fs, genMax: genMax, narrow: narrow
        });
      }
    }

    /* shared generation axis under the deepest row */
    var bottomY = cellY(2) + ch;
    var axisY = bottomY + 11;
    var aStep = Math.max(1, Math.round(niceStep(genMax, 4)));
    var aTicks = [];
    for (var ag = 0; ag <= genMax + 1e-9; ag += aStep) aTicks.push(ag);
    if (aTicks[aTicks.length - 1] !== genMax) aTicks.push(genMax);
    for (var ac = 0; ac < 4; ac++) {
      var ax0 = cellX(ac) + 30;
      var aw = cw - 30 - 3;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      aTicks.forEach(function (gv) {
        var tx2 = ax0 + (clamp(gv, 0, genMax) / genMax) * aw;
        ctx.font = fontMono(8.2 * fs);
        ctx.fillStyle = withAlpha(theme.ink2, 0.85);
        ctx.fillText(String(Math.round(gv)), tx2, axisY);
      });
    }
    drawTracked(ctx, 'GENERATION →', 14, axisY, {
      font: fontSans(7.7 * fs), tracking: 1.3, color: withAlpha(theme.ink2, 0.9)
    });

    state.traitsGeom = { W: W, H: H, left: left, right: right, top: top, bottom: bottom, gapX: gapX, gapY: gapY, matrixW: matrixW, matrixH: matrixH, cw: cw, ch: ch, cells: [cellX(0), cellX(1), cellX(2), cellX(3)] };
  }

  function drawTraitCell(ctx, o) {
    var sp = o.sp, gene = o.gene, model = o.model, theme = o.theme;
    var meta = model.geneMeta[sp][gene];
    var spMeta = model.species[sp];
    var series = model.trait[sp][gene];
    var fs = o.fs;
    var gutter = 30;
    var x0 = o.x0, y0 = o.y0;
    var px0 = x0 + gutter;
    var py0 = y0 + o.noteH + 1;
    var pw = Math.max(20, o.cw - gutter - 3);
    var ph = Math.max(16, o.ch - o.noteH - 3);
    var py1 = py0 + ph;
    var dmin = meta.min, dmax = meta.max, span = dmax - dmin;
    var dec = decForSpan(span);
    var yOf = function (v) { return py1 - clamp((v - dmin) / span, 0, 1) * ph; };
    var xOf = function (gen) { return px0 + (clamp(gen, 0, o.genMax) / o.genMax) * pw; };

    /* expression note + unit (clipped inside the cell) */
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 + 1, y0 + 1, o.cw - 2, o.noteH + 1);
    ctx.clip();
    var noteX = x0 + 2;
    var noteY = y0 + 9;
    var expr = meta.expression || meta.label || '';
    var exprW = 0;
    if (expr) {
      ctx.font = fontSerif(8.5 * fs, 'italic');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = withAlpha(theme.ink3, 0.95);
      ctx.fillText(expr, noteX, noteY);
      exprW = ctx.measureText(expr).width;
    }
    if (meta.unit) {
      drawTracked(ctx, '· ' + meta.unit, noteX + exprW + 3, noteY, {
        font: fontMono(6.9 * fs), tracking: 0.2, color: withAlpha(theme.ink3, 0.8)
      });
    }
    ctx.restore();

    /* last value / sundered note, top-right */
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 + o.cw - 62, y0 + 1, 61, o.noteH + 1);
    ctx.clip();
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    if (series.last) {
      if (series.last.gen >= model.lastGen - 0.5) {
        ctx.font = fontMono(9 * fs);
        ctx.fillStyle = withAlpha(spMeta.color, 0.95);
        ctx.fillText(fmtDec(series.last.mean, dec), x0 + o.cw - 2, noteY);
      } else {
        ctx.font = fontSerif(7.8 * fs, 'italic');
        ctx.fillStyle = withAlpha(theme.ink3, 0.95);
        ctx.fillText('last ' + genLabel(series.last.gen), x0 + o.cw - 2, noteY);
      }
    } else {
      ctx.font = fontSerif(7.4 * fs, 'italic');
      ctx.fillStyle = withAlpha(theme.ink3, 0.75);
      ctx.fillText('—', x0 + o.cw - 2, noteY);
    }
    ctx.restore();

    /* cell axes */
    roughLine(ctx, px0, py0, px0, py1, { color: withAlpha(theme.ink3, 0.8), width: 0.7, seed: model.seed, key: 'ty' + sp + gene, alpha: 0.8 });
    roughLine(ctx, px0, py1, px0 + pw, py1, { color: withAlpha(theme.ink3, 0.8), width: 0.7, seed: model.seed, key: 'tx' + sp + gene, alpha: 0.8 });

    /* y ticks: top and bottom of the gene's sensible range */
    var yTickVals = ph >= 88 ? [dmin, dmin + span / 2, dmax] : [dmin, dmax];
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    yTickVals.forEach(function (v) {
      var ty = yOf(v);
      roughLine(ctx, px0 - 3, ty, px0, ty, { color: withAlpha(theme.ink3, 0.8), width: 0.65, seed: model.seed, key: 'tt' + sp + gene + v, alpha: 0.75 });
      ctx.font = fontMono(8.2 * fs);
      ctx.fillStyle = withAlpha(theme.ink2, 0.95);
      ctx.fillText(fmtDec(v, dec), px0 - 5, ty + 0.5);
    });

    /* catastrophe rules, faint, behind everything */
    ctx.save();
    ctx.beginPath();
    ctx.rect(px0, py0, pw, ph);
    ctx.clip();
    model.events.forEach(function (ev) {
      var ex = xOf(ev.gen);
      ctx.save();
      ctx.setLineDash([1.4, 2.8]);
      ctx.strokeStyle = withAlpha(theme.wax, 0.2);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(ex, py0);
      ctx.lineTo(ex, py1);
      ctx.stroke();
      ctx.restore();
    });
    ctx.restore();

    if (!series.points.length) {
      ctx.font = fontSerif(8.5 * fs, 'italic');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = withAlpha(theme.ink3, 0.65);
      ctx.fillText(series.last ? 'no further record' : 'no record', px0 + pw / 2, py0 + ph / 2);
      return;
    }

    /* spread band: a translucent wash with fine hatching, one per segment */
    series.segments.forEach(function (seg) {
      if (seg.length < 2) return;
      var hasSpread = seg.some(function (p) { return p.sd > 0.0001; });
      if (!hasSpread) return;
      ctx.save();
      ctx.beginPath();
      ctx.rect(px0, py0, pw, ph);
      ctx.clip();
      var band = new Path2D();
      seg.forEach(function (p, i) {
        var bx = xOf(p.gen), by = yOf(clamp(p.mean + p.sd, dmin, dmax));
        if (i === 0) band.moveTo(bx, by); else band.lineTo(bx, by);
      });
      for (var i = seg.length - 1; i >= 0; i--) {
        var p = seg[i];
        band.lineTo(xOf(p.gen), yOf(clamp(p.mean - p.sd, dmin, dmax)));
      }
      band.closePath();
      ctx.fillStyle = withAlpha(spMeta.color, 0.085);
      ctx.fill(band);
      ctx.save();
      ctx.clip(band);
      ctx.strokeStyle = withAlpha(spMeta.soft, 0.48);
      ctx.lineWidth = 0.6;
      for (var d = -ph; d < pw + ph; d += 6.4) {
        ctx.beginPath();
        ctx.moveTo(px0 + d, py0);
        ctx.lineTo(px0 + d + ph, py1);
        ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle = withAlpha(spMeta.color, 0.18);
      ctx.lineWidth = 0.6;
      ctx.stroke(band);
      ctx.restore();
    });

    /* mean line (clipped, broken at gaps) */
    ctx.save();
    ctx.beginPath();
    ctx.rect(px0, py0, pw, ph);
    ctx.clip();
    series.segments.forEach(function (seg, si) {
      var pts = seg.map(function (p) { return { x: xOf(p.gen), y: yOf(clamp(p.mean, dmin, dmax)) }; });
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, 1.7, 0, TAU);
        ctx.fillStyle = spMeta.color;
        ctx.fill();
      } else {
        strokeInk(ctx, pts, {
          color: spMeta.color, width: 1.15, amp: 0.38, seed: model.seed + si,
          key: 'trait-' + sp + gene, alpha: 0.95
        });
      }
    });
    /* end-of-record dot */
    var lastP = series.points[series.points.length - 1];
    ctx.beginPath();
    ctx.arc(xOf(lastP.gen), yOf(clamp(lastP.mean, dmin, dmax)), 1.7, 0, TAU);
    ctx.fillStyle = spMeta.color;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(xOf(lastP.gen), yOf(clamp(lastP.mean, dmin, dmax)), 3, 0, TAU);
    ctx.strokeStyle = withAlpha(theme.paper, 0.8);
    ctx.lineWidth = 0.9;
    ctx.stroke();
    ctx.restore();
  }

  /* ==================================================================== */
  /*  SUMMARY / NOTES / META                                              */
  /* ==================================================================== */

  function speciesGlyphSvg(model, sp, size) {
    return glyphSvg(model.species[sp].glyph, size || 12, model.species[sp].color);
  }

  function standingNote(model) {
    var lastGen = model.lastGen;
    if (!model.history.length) return 'No study was kept.';
    if (model.history.length <= 1) return 'The study closed at the seed, before drift could be read.';
    var survived = [], lost = [], never = [];
    TAXA.forEach(function (sp) {
      var f = model.fates[sp];
      if (f.neverEstablished) never.push(sp);
      else if (f.aliveAtEnd) survived.push(sp);
      else lost.push(sp);
    });
    var name = function (sp) { return model.species[sp].name; };
    var parts = [];
    if (!survived.length) {
      var lastLoss = 0;
      TAXA.forEach(function (sp) { if (model.fates[sp].extinctAt != null) lastLoss = Math.max(lastLoss, model.fates[sp].extinctAt); });
      parts.push('The plate fell silent at ' + genLabel(lastLoss) + '; nothing was left to record.');
    } else if (survived.length === 3) {
      parts.push('All three kingdoms persisted to ' + genLabel(lastGen) + '.');
    } else {
      var names = survived.map(name);
      parts.push((names.length === 2 ? names[0] + ' and ' + names[1] : names[0]) + ' persisted to ' + genLabel(lastGen) + '.');
    }
    if (lost.length) {
      var lostTxt = lost.map(function (sp) {
        return name(sp) + ' lost at ' + genLabel(model.fates[sp].extinctAt == null ? lastGen : model.fates[sp].extinctAt);
      });
      parts.push(lostTxt.join('; ') + '.');
    }
    if (never.length) {
      parts.push(never.map(name).join(' and ') + ' never established.');
    }
    return parts.join(' ');
  }

  function weatherRoster(model, limit) {
    var evs = model.events;
    if (!evs.length) return '';
    var shown = evs.slice(0, limit == null ? 6 : limit);
    var out = shown.map(function (ev) {
      return { initial: ev.initial, latin: ev.latin, gen: ev.gen, type: ev.type };
    });
    return { items: out, more: evs.length - shown.length };
  }

  function buildSummaryHTML(model) {
    var h3 = '<h3 class="record__aside-title">Summary of the Study</h3>';
    if (!model.history.length) {
      return h3 + '<p class="rec-empty">The record awaits a concluded study. No generations were written to the ledger.</p>';
    }
    var spName = function (sp) { return model.species[sp].name; };
    var rows = TAXA.map(function (sp) {
      var f = model.fates[sp];
      var count = f.finalCount;
      var peak = 0;
      model.history.forEach(function (h) { peak = Math.max(peak, h.counts[sp]); });
      var metaTxt;
      if (f.neverEstablished) metaTxt = 'never established';
      else if (!f.aliveAtEnd) metaTxt = 'lost ' + genLabel(f.extinctAt == null ? model.lastGen : f.extinctAt);
      else {
        var start = model.firstCounts[sp];
        var pct = start > 0 ? ((count - start) / start) * 100 : 0;
        metaTxt = 'peak ' + fmtInt(peak) + ' · ' + fmtPct(pct);
      }
      return '<li class="rec-census__row rec-census__row--' + sp + '">' +
        '<span class="rec-glyph">' + speciesGlyphSvg(model, sp, 12) + '</span>' +
        '<span class="rec-census__name">' + esc(spName(sp)) + '</span>' +
        '<span class="rec-census__val mono' + (f.aliveAtEnd ? '' : ' is-lost') + '">' + (f.aliveAtEnd ? fmtInt(count) : '0') + '</span>' +
        '<span class="rec-census__meta">' + esc(metaTxt) + '</span>' +
        '</li>';
    }).join('');

    var weather = weatherRoster(model, 6);
    var weatherHTML;
    if (!weather) {
      weatherHTML = '<p class="rec-weather__none">No weather fell; the glass was never troubled.</p>';
    } else {
      weatherHTML = '<ul class="rec-weather">' + weather.items.map(function (ev) {
        return '<li class="rec-weather__item rec-weather__item--' + esc(ev.type) + '">' +
          '<span class="rec-wax" aria-hidden="true">' + esc(ev.initial) + '</span>' +
          '<span class="rec-weather__name">' + esc(ev.latin) + '</span>' +
          '<span class="rec-weather__gen mono">' + genLabel(ev.gen) + '</span></li>';
      }).join('') + '</ul>' +
        '<p class="rec-weather__meta">' + (weather.more ? '+' + weather.more + ' more · ' : '') +
        model.events.length + (model.events.length === 1 ? ' visit' : ' visits') +
        ' · first ' + genLabel(model.events[0].gen) + ' · last ' + genLabel(model.events[model.events.length - 1].gen) + '</p>';
    }

    var dropRows = TAXA.map(function (sp) {
      var d = model.drops[sp];
      var txt = d && d.delta < 0 ? '−' + fmtInt(Math.abs(d.delta)) + ' · ' + genLabel(d.gen) : '—';
      return '<li class="rec-drop" title="' + esc(spName(sp)) + '">' +
        '<span class="rec-glyph">' + speciesGlyphSvg(model, sp, 9) + '</span>' +
        '<span class="rec-drop__val mono">' + esc(txt) + '</span></li>';
    }).join('');

    var divDelta = model.diversityFinal - model.diversityFirst;
    var divArrow = Math.abs(divDelta) < 0.005 ? '±' : (divDelta > 0 ? '▲' : '▼');
    var mutTxt = fmtDec(model.meanMutations, 1) + ' <span class="rec-stat__unit">per gen</span>';
    var divTxt = fmtDec(model.diversityFinal, 2) + ' <span class="rec-stat__unit">of 1.00</span>';

    return h3 +
      '<p class="rec-sub mono">seed ' + model.seed + ' · ' + model.lastGen + ' gen · ' + model.events.length + (model.events.length === 1 ? ' weather' : ' weathers') + '</p>' +
      '<dl class="rec">' +
      '<div class="rec-block rec-block--census"><dt class="rec-label">Final census</dt><dd><ul class="rec-census">' + rows + '</ul></dd></div>' +
      '<div class="rec-block rec-block--weather"><dt class="rec-label">Weather</dt><dd>' + weatherHTML + '</dd></div>' +
      '<div class="rec-block rec-block--drop"><dt class="rec-label">Largest single-generation fall</dt><dd><ul class="rec-drops">' + dropRows + '</ul></dd></div>' +
      '<div class="rec-block rec-block--stats"><dt class="rec-label">Mutation &amp; diversity</dt><dd>' +
      '<div class="rec-stat"><span class="rec-stat__k">Mutations</span><span class="rec-stat__v mono">' + mutTxt + '</span><span class="rec-stat__n">' + fmtInt(model.mutationsTotal) + ' in all</span></div>' +
      '<div class="rec-stat"><span class="rec-stat__k">Diversity</span><span class="rec-stat__v mono">' + divTxt + '</span>' +
      '<span class="rec-meter" aria-hidden="true"><i style="width:' + clamp(model.diversityFinal, 0, 1) * 100 + '%"></i></span>' +
      '<span class="rec-stat__n">' + divArrow + ' ' + fmtDec(Math.abs(divDelta), 2) + '</span></div>' +
      '</dd></div>' +
      '<div class="rec-block rec-block--verdict"><dt class="rec-label">Standing</dt><dd class="rec-verdict">' + esc(standingNote(model)) + '</dd></div>' +
      '</dl>';
  }

  function buildNotesHTML(model) {
    var roster = model.events.length
      ? model.events.slice(0, 8).map(function (ev) { return esc(ev.latin) + ' ' + genLabel(ev.gen); }).join(' · ') + (model.events.length > 8 ? ' · +' + (model.events.length - 8) : '')
      : 'None fell.';
    var margin;
    if (!model.history.length) margin = 'No study was kept.';
    else if (model.history.length <= 1) margin = 'The study closed at the seed; no drift could be read.';
    else if (!model.events.length) margin = 'The glass was never troubled; the study closed in calm.';
    else {
      var allLost = TAXA.every(function (sp) { return !model.fates[sp].aliveAtEnd; });
      var lastEv = model.events[model.events.length - 1].gen;
      if (allLost) {
        var lastLoss = 0;
        TAXA.forEach(function (sp) { if (model.fates[sp].extinctAt != null) lastLoss = Math.max(lastLoss, model.fates[sp].extinctAt); });
        margin = 'The plate fell silent at ' + genLabel(lastLoss) + '; the record is what remains.';
      } else if (model.lastGen - lastEv <= 1) {
        margin = 'The last weather closed the study at ' + genLabel(lastEv) + '.';
      } else {
        margin = (model.lastGen - lastEv) + ' generations of calm followed the last weather at ' + genLabel(lastEv) + '.';
      }
    }
    return '' +
      '<div class="rec-note rec-note--weather">' +
      '<span class="rec-note__label">Weather roster</span>' +
      '<p class="rec-note__text rec-note__text--mono">' + roster + '</p>' +
      '</div>' +
      '<div class="rec-note rec-note--margin">' +
      '<span class="rec-note__label">Margin note</span>' +
      '<p class="rec-note__text rec-note__text--italic">' + esc(margin) + '</p>' +
      '</div>' +
      '<div class="rec-note rec-note--drawn">' +
      '<span class="rec-note__label">Drawn from</span>' +
      '<p class="rec-note__text rec-note__text--mono">Seed ' + model.seed + ' · ' + fmtInt(model.ticks) + ' ticks</p>' +
      '</div>';
  }

  function decorateMeta() {
    if (!state.model) return;
    var model = state.model;
    var meta = document.getElementById('record-meta');
    if (meta) {
      var text = 'Seed ' + model.seed + ' · ' + model.lastGen + ' generations · ' +
        fmtInt(model.ticks) + ' ticks · ' +
        (model.events.length ? model.events.length + (model.events.length === 1 ? ' catastrophe' : ' catastrophes') : 'no catastrophes');
      if (meta.textContent !== text) meta.textContent = text;
    }
    var foot = document.getElementById('record-foot-note');
    if (foot) {
      var ft = 'Drawn from seed ' + model.seed + ' · every wobble is reproducible.';
      if (foot.textContent !== ft) foot.textContent = ft;
    }
  }

  function fitSummary() {
    var el = document.getElementById('record-summary');
    if (!el || !el.clientHeight) return;
    el.classList.remove('is-tight');
    if (el.scrollHeight > el.clientHeight + 1) el.classList.add('is-tight');
  }

  function fillSummary(model) {
    var el = document.getElementById('record-summary');
    if (el) el.innerHTML = buildSummaryHTML(model);
    var notes = document.getElementById('record-notes');
    if (notes) notes.innerHTML = buildNotesHTML(model);
    var meta = document.getElementById('record-meta');
    if (meta) {
      meta.textContent = 'Seed ' + model.seed + ' · ' + model.lastGen + ' generations · ' +
        fmtInt(model.ticks) + ' ticks · ' +
        (model.events.length ? model.events.length + (model.events.length === 1 ? ' catastrophe' : ' catastrophes') : 'no catastrophes');
    }
    var foot = document.getElementById('record-foot-note');
    if (foot) foot.textContent = 'Drawn from seed ' + model.seed + ' · every wobble is reproducible.';
    var pop = document.getElementById('chart-pop');
    if (pop) {
      var finalTxt = TAXA.map(function (sp) { return model.species[sp].name + ' ' + fmtInt(model.finalCounts[sp]); }).join(', ');
      pop.setAttribute('aria-label', 'Population census across ' + model.lastGen + ' generations. Final counts: ' + finalTxt + '. ' +
        model.events.length + ' catastrophes marked as vertical rules with wax pins.');
    }
    var traits = document.getElementById('chart-traits');
    if (traits) {
      traits.setAttribute('aria-label', 'Trait drift matrix: mean and one standard deviation for the four loci speed, vision, metabolism and threshold, for each of flora, herbivora and carnivora, across ' + model.lastGen + ' generations.');
    }
  }

  /* ==================================================================== */
  /*  DRAW / SHOW / HIDE / RESIZE                                         */
  /* ==================================================================== */

  function drawAll() {
    state.raf = 0;
    if (!state.model) return;
    decorateMeta();
    fitSummary();
    var census = document.getElementById('chart-pop');
    var traits = document.getElementById('chart-traits');
    if (census) {
      try { drawCensus(census, state.model, state.hoverGen); }
      catch (e) { if (root.console) console.warn('VIVARIUM: census plate failed', e); }
    }
    if (traits) {
      try { drawTraits(traits, state.model); }
      catch (e) { if (root.console) console.warn('VIVARIUM: drift plate failed', e); }
    }
  }

  function scheduleDraw() {
    if (state.raf) return;
    state.raf = (root.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); })(drawAll);
  }

  function onCensusPointer(ev) {
    var geom = state.censusGeom;
    var canvas = document.getElementById('chart-pop');
    if (!geom || !canvas) return;
    var rect = canvas.getBoundingClientRect();
    var x = ev.clientX - rect.left;
    if (x < geom.x0 - 6 || x > geom.x0 + geom.plotW + 6) {
      if (state.hoverGen != null) { state.hoverGen = null; scheduleDraw(); }
      return;
    }
    var ratio = clamp((x - geom.x0) / geom.plotW, 0, 1);
    var target = Math.round(ratio * geom.genMax);
    var best = geom.gens[0];
    for (var i = 0; i < geom.gens.length; i++) {
      if (Math.abs(geom.gens[i] - target) < Math.abs(best - target)) best = geom.gens[i];
    }
    if (best !== state.hoverGen) { state.hoverGen = best; scheduleDraw(); }
  }

  function clearCensusPointer() {
    if (state.hoverGen != null) { state.hoverGen = null; scheduleDraw(); }
  }

  function ensureObservers() {
    if (state.observersReady) { scheduleDraw(); return; }
    state.observersReady = true;
    var canvas = document.getElementById('chart-pop');
    if (canvas) {
      canvas.addEventListener('pointermove', onCensusPointer);
      canvas.addEventListener('pointerleave', clearCensusPointer);
      canvas.addEventListener('pointercancel', clearCensusPointer);
    }
    if (typeof root.ResizeObserver === 'function') {
      var ro = new root.ResizeObserver(function () { scheduleDraw(); });
      ['chart-pop', 'chart-traits'].forEach(function (id) {
        var c = document.getElementById(id);
        if (c && c.parentElement) ro.observe(c.parentElement);
      });
      state.resizeObserver = ro;
    }
    root.addEventListener('resize', function () { scheduleDraw(); });
    var rec = document.getElementById('record');
    if (rec) {
      rec.addEventListener('transitionend', function (ev) {
        if (ev && ev.target && ev.target.classList && ev.target.classList.contains('record__sheet')) scheduleDraw();
      });
    }
    scheduleDraw();
  }

  function render(world) {
    state.hoverGen = null;
    state.world = world || null;
    state.model = buildModel(world || {});
    fillSummary(state.model);
    ensureObservers();
    scheduleDraw();
  }

  function show() {
    var rec = document.getElementById('record');
    if (!rec) return;
    if (state.hiddenTimer) { clearTimeout(state.hiddenTimer); state.hiddenTimer = 0; }
    rec.hidden = false;
    /* force a layout read so the overlay's first frame is styled before opening */
    void rec.offsetHeight;
    rec.classList.add('is-open');
    /* Draw once the sheet has laid out, then again as the entrance/layout
       settles. Rect-based canvases must never keep a stale size. */
    scheduleDraw();
    if (root.requestAnimationFrame) {
      root.requestAnimationFrame(function () { root.requestAnimationFrame(scheduleDraw); });
    } else {
      setTimeout(scheduleDraw, 40);
    }
    clearTimeout(state.settleTimerA);
    clearTimeout(state.settleTimerB);
    state.settleTimerA = setTimeout(scheduleDraw, 220);
    state.settleTimerB = setTimeout(scheduleDraw, 620);
  }

  function hide() {
    var rec = document.getElementById('record');
    if (!rec) return;
    if (state.hiddenTimer) { clearTimeout(state.hiddenTimer); state.hiddenTimer = 0; }
    clearTimeout(state.settleTimerA);
    clearTimeout(state.settleTimerB);
    rec.classList.remove('is-open');
    var reduce = false;
    try { reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { reduce = false; }
    if (reduce) { rec.hidden = true; return; }
    state.hiddenTimer = setTimeout(function () {
      state.hiddenTimer = 0;
      if (!rec.classList.contains('is-open')) rec.hidden = true;
    }, 520);
  }

  function onResize() {
    scheduleDraw();
  }

  root.VIVARIUM_DASHBOARD = {
    render: render,
    show: show,
    hide: hide,
    onResize: onResize
  };
})(typeof window !== 'undefined' ? window : globalThis);
