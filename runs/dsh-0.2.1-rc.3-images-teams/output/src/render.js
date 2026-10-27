/* =========================================================================
   VIVARIUM — vitrine renderer
   Ink-on-paper drawing of the living specimen. Rendering is deliberately
   separate from the engine: it only reads a world and never changes it.
   ========================================================================= */
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const COLORS = {
    flora: '#456b48',
    fauna: '#9a6829',
    predator: '#8c3027',
    ink: '#241f17'
  };

  function hash2(x, y, seed) {
    let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  function makeVisualPRNG(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  function createRenderer(canvas) {
    const frame = canvas.closest('.vitrine__frame') || canvas.parentElement;
    const ctx = canvas.getContext('2d');
    const card = document.getElementById('specimen-card');
    const hint = document.getElementById('plate-hint');
    const wash = document.createElement('canvas');
    const wctx = wash.getContext('2d');
    wash.width = 80; wash.height = 45;

    let dpr = 1;
    let cssW = 0, cssH = 0;
    let paper = null;
    let paperSeed = -1;
    let world = null;
    let hovered = null;
    let pinned = null;
    let lastTickDrawn = -1;
    let lastCardAt = 0;
    let washTick = 0;
    let sprites = null;
    let destroyed = false;
    let lastWashGen = -1;
    const trailCache = new WeakMap();
    let trailCanvas = null;
    let trailCtx = null;

    /* --------------------------------------------------------- sizing */

    function measure() {
      const rect = canvas.getBoundingClientRect();
      return {
        w: Math.max(80, rect.width || frame.clientWidth || 640),
        h: Math.max(45, rect.height || frame.clientHeight || 360)
      };
    }

    function resize() {
      if (destroyed) return;
      const m = measure();
      dpr = Math.min(2, root.devicePixelRatio || 1);
      cssW = Math.round(m.w);
      cssH = Math.round(m.h);
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      if (!trailCanvas) {
        trailCanvas = document.createElement('canvas');
        trailCtx = trailCanvas.getContext('2d');
      }
      trailCanvas.width = canvas.width;
      trailCanvas.height = canvas.height;
      buildPaper();
      buildSprites();
      if (world) draw(world);
    }

    function worldScale() {
      const W = world ? world.width : 160;
      const H = world ? world.height : 90;
      const sx = cssW / W, sy = cssH / H;
      const scale = Math.min(sx, sy);
      return { scale, ox: (cssW - W * scale) / 2, oy: (cssH - H * scale) / 2, W, H };
    }

    function toScreen(x, y) {
      const s = worldScale();
      return { x: s.ox + x * s.scale, y: s.oy + y * s.scale };
    }

    function toWorld(px, py) {
      const s = worldScale();
      if (!world) return { x: 0, y: 0 };
      return {
        x: ((px - s.ox) / s.scale + world.width) % world.width,
        y: ((py - s.oy) / s.scale + world.height) % world.height
      };
    }

    /* ------------------------------------------------------ paper texture */

    function buildPaper() {
      if (!cssW || !cssH) return;
      paper = document.createElement('canvas');
      paper.width = Math.max(1, Math.round(cssW * dpr));
      paper.height = Math.max(1, Math.round(cssH * dpr));
      const p = paper.getContext('2d');
      p.setTransform(dpr, 0, 0, dpr, 0, 0);

      // A warm, uneven sheet: lighter in the middle, tea-stained at the edges.
      const g = p.createRadialGradient(cssW * 0.46, cssH * 0.42, cssW * 0.08, cssW * 0.5, cssH * 0.5, cssW * 0.78);
      g.addColorStop(0, '#f1e7d3');
      g.addColorStop(0.55, '#ece1cc');
      g.addColorStop(1, '#e0d2b7');
      p.fillStyle = g;
      p.fillRect(0, 0, cssW, cssH);

      const rand = makeVisualPRNG((world ? world.seed : 1977) * 17 + 11);
      for (let i = 0; i < 2600; i++) {
        const x = rand() * cssW;
        const y = rand() * cssH;
        const a = 0.012 + rand() * 0.035;
        const r = 0.25 + rand() * 0.85;
        p.fillStyle = rand() < 0.58
          ? 'rgba(92,72,43,' + a.toFixed(3) + ')'
          : 'rgba(255,250,235,' + (a * 0.9).toFixed(3) + ')';
        p.beginPath();
        p.arc(x, y, r, 0, TAU);
        p.fill();
      }
      for (let i = 0; i < 7; i++) {
        const x = rand() * cssW, y = rand() * cssH;
        const r = cssW * (0.03 + rand() * 0.08);
        const bloom = p.createRadialGradient(x, y, 0, x, y, r);
        bloom.addColorStop(0, 'rgba(150,118,66,0.028)');
        bloom.addColorStop(1, 'rgba(150,118,66,0)');
        p.fillStyle = bloom;
        p.fillRect(x - r, y - r, r * 2, r * 2);
      }
      p.strokeStyle = 'rgba(99,81,53,0.028)';
      p.lineWidth = 0.5;
      for (let i = 0; i < 26; i++) {
        const y = rand() * cssH;
        p.beginPath();
        p.moveTo(0, y);
        p.bezierCurveTo(cssW * 0.3, y + rand() * 5 - 2.5, cssW * 0.7, y + rand() * 5 - 2.5, cssW, y + rand() * 3 - 1.5);
        p.stroke();
      }
    }

    /* ------------------------------------------------------ plant sprites */

    function buildSprites() {
      const s = world ? worldScale().scale : Math.min(cssW / 160, cssH / 90);
      const base = clamp(s * 1.3, 4.5, 15);
      sprites = { flora: [], size: base };
      for (let v = 0; v < 7; v++) {
        const size = Math.ceil(base * 1.95) + 2;
        const c = document.createElement('canvas');
        c.width = Math.ceil(size * dpr);
        c.height = Math.ceil(size * dpr);
        const g = c.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        const cx = size / 2, cy = size * 0.72;
        const rand = makeVisualPRNG(1000 + v * 37);
        const strokes = 4 + (v % 2);
        g.lineCap = 'round';
        g.strokeStyle = COLORS.flora;
        for (let i = 0; i < strokes; i++) {
          const u = (i + 1) / (strokes + 1);
          const ang = -Math.PI / 2 + (u - 0.5) * 2.05 + (rand() - 0.5) * 0.2;
          const len = base * (0.6 + rand() * 0.6);
          g.globalAlpha = 0.62 + rand() * 0.38;
          g.lineWidth = 0.7 + rand() * 0.5;
          g.beginPath();
          g.moveTo(cx + Math.cos(ang) * base * 0.1, cy);
          g.quadraticCurveTo(
            cx + Math.cos(ang) * len * 0.5, cy + Math.sin(ang) * len * 0.55,
            cx + Math.cos(ang) * len + (rand() - 0.5) * 1.1, cy + Math.sin(ang) * len
          );
          g.stroke();
        }
        g.globalAlpha = 0.55;
        g.fillStyle = COLORS.flora;
        g.beginPath();
        g.arc(cx, cy, 0.7, 0, TAU);
        g.fill();
        sprites.flora.push(c);
      }
    }

    /* --------------------------------------------------------- ground */

    function updateWash() {
      if (!world) return;
      const drought = world.weather.droughtUntil > world.generation;
      const ash = world.weather.ashUntil > world.generation;
      wctx.clearRect(0, 0, wash.width, wash.height);
      const plants = world.plants;
      const sx = wash.width / world.width, sy = wash.height / world.height;
      for (let i = 0; i < plants.length; i++) {
        const pl = plants[i];
        if (!pl || pl.dead) continue;
        const e = clamp(pl.energy / 1.5, 0.15, 1);
        wctx.globalAlpha = 0.09 + e * 0.11;
        wctx.fillStyle = drought ? '#a8792f' : (ash ? '#7c6a45' : COLORS.flora);
        wctx.beginPath();
        wctx.arc(pl.cx * sx, pl.cy * sy, 1.7 + e * 1.45, 0, TAU);
        wctx.fill();
      }
      wctx.globalAlpha = 1;
      lastWashGen = world.generation;
    }

    /* ---------------------------------------------------------- trails */

    function drawTrails() {
      if (!trailCtx || !world) return;
      trailCtx.setTransform(1, 0, 0, 1, 0, 0);
      trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
      trailCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      trailCtx.globalCompositeOperation = 'source-over';
      trailCtx.lineCap = 'round';

      const drawTrail = (agent, color, alpha, width) => {
        const prev = trailCache.get(agent);
        const now = toScreen(agent.x, agent.y);
        trailCache.set(agent, now);
        if (!prev) return;
        let dx = now.x - prev.x;
        let dy = now.y - prev.y;
        if (Math.abs(dx) > cssW * 0.5) dx = 0;
        if (Math.abs(dy) > cssH * 0.5) dy = 0;
        if (dx * dx + dy * dy > 0.4) {
          trailCtx.globalAlpha = alpha;
          trailCtx.strokeStyle = color;
          trailCtx.lineWidth = width;
          trailCtx.beginPath();
          trailCtx.moveTo(prev.x, prev.y);
          trailCtx.lineTo(now.x, now.y);
          trailCtx.stroke();
        }
      };
      for (let i = 0; i < world.herbivora.length; i++) {
        const a = world.herbivora[i];
        if (a && !a.dead) drawTrail(a, COLORS.fauna, 0.12, 0.9);
      }
      for (let i = 0; i < world.carnivora.length; i++) {
        const a = world.carnivora[i];
        if (a && !a.dead) drawTrail(a, COLORS.predator, 0.15, 1.0);
      }

      trailCtx.setTransform(1, 0, 0, 1, 0, 0);
      trailCtx.globalCompositeOperation = 'destination-out';
      trailCtx.fillStyle = 'rgba(0,0,0,0.05)';
      trailCtx.fillRect(0, 0, trailCanvas.width, trailCanvas.height);
      trailCtx.globalCompositeOperation = 'source-over';
      trailCtx.globalAlpha = 1;

      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 0.9;
      ctx.drawImage(trailCanvas, 0, 0);
      ctx.restore();
      ctx.globalAlpha = 1;
    }

    function clearTrails() {
      if (trailCanvas) {
        trailCtx.setTransform(1, 0, 0, 1, 0, 0);
        trailCtx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
      }
    }

    /* --------------------------------------------------------- drawing */

    function draw(worldIn) {
      if (destroyed || !worldIn) return;
      world = worldIn;
      if (world.seed !== paperSeed) {
        paperSeed = world.seed;
        buildPaper();
        buildSprites();
      }
      if (!paper) return;

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.drawImage(paper, 0, 0, cssW, cssH);

      if (world.tick !== lastTickDrawn) {
        lastTickDrawn = world.tick;
        washTick++;
      }
      if (washTick % 5 === 0 || lastWashGen !== world.generation) updateWash();
      const s = worldScale();
      ctx.save();
      ctx.beginPath();
      ctx.rect(s.ox, s.oy, s.W * s.scale, s.H * s.scale);
      ctx.clip();
      ctx.globalAlpha = 0.68;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(wash, s.ox, s.oy, s.W * s.scale, s.H * s.scale);
      ctx.restore();
      ctx.globalAlpha = 1;

      if (world.config.trails !== false) drawTrails();
      else if (trailCanvas) clearTrails();

      drawPlants();
      drawHerbivora();
      drawCarnivora();
      drawWeatherTint();
      drawSelection();

      const target = pinned || hovered;
      if (target) {
        if (target.dead) {
          hovered = null;
          if (pinned === target) pinned = null;
          hideCard();
        } else if (root.performance && root.performance.now() - lastCardAt > 220) {
          lastCardAt = root.performance.now();
          fillCard(target, pinned === target);
        }
      }
    }

    function drawPlants() {
      if (!sprites) return;
      const s = worldScale();
      const arr = world.plants;
      for (let i = 0; i < arr.length; i++) {
        const p = arr[i];
        if (!p || p.dead) continue;
        const px = s.ox + p.x * s.scale;
        const py = s.oy + p.y * s.scale;
        const v = Math.floor(hash2(p.cx, p.cy, world.seed) * sprites.flora.length);
        const spr = sprites.flora[v];
        const wob = hash2(p.cy, p.cx, world.seed + 9) * 1.2;
        const size = sprites.size * (1.7 + hash2(p.cx, p.cy, world.seed + 3) * 0.7);
        ctx.globalAlpha = 0.6 + clamp(p.energy / 1.6, 0, 0.4);
        ctx.drawImage(spr, px - size / 2 + wob, py - size * 0.72, size, size);
      }
      ctx.globalAlpha = 1;
    }

    function drawHerbivora() {
      const s = worldScale();
      const r = Math.max(2.3, s.scale * 0.61);
      const arr = world.herbivora;
      ctx.lineCap = 'round';
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i];
        if (!a || a.dead) continue;
        const px = s.ox + a.x * s.scale;
        const py = s.oy + a.y * s.scale;
        const len = r * 1.55;
        ctx.strokeStyle = COLORS.fauna;
        ctx.fillStyle = COLORS.fauna;
        ctx.globalAlpha = 0.82;
        ctx.lineWidth = Math.max(0.9, s.scale * 0.17);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.8, r * 0.3), 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 0.62;
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(a.dir) * (r * 0.5), py + Math.sin(a.dir) * (r * 0.5));
        ctx.lineTo(px + Math.cos(a.dir) * len, py + Math.sin(a.dir) * len);
        ctx.stroke();
        // A pair of whiskers gives the ring the look of a small hare.
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.moveTo(px + Math.cos(a.dir + 2.0) * r * 0.8, py + Math.sin(a.dir + 2.0) * r * 0.8);
        ctx.lineTo(px + Math.cos(a.dir + 2.0) * r * 1.5, py + Math.sin(a.dir + 2.0) * r * 1.5);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    function drawCarnivora() {
      const s = worldScale();
      const r = Math.max(2.9, s.scale * 0.76);
      const arr = world.carnivora;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i];
        if (!a || a.dead) continue;
        const px = s.ox + a.x * s.scale;
        const py = s.oy + a.y * s.scale;
        const dir = a.dir;
        const tipX = px + Math.cos(dir) * r * 1.1;
        const tipY = py + Math.sin(dir) * r * 1.1;
        const backX = px - Math.cos(dir) * r * 0.7;
        const backY = py - Math.sin(dir) * r * 0.7;
        const sideX = Math.cos(dir + Math.PI / 2) * r * 0.8;
        const sideY = Math.sin(dir + Math.PI / 2) * r * 0.8;
        ctx.strokeStyle = COLORS.predator;
        ctx.fillStyle = COLORS.predator;
        ctx.globalAlpha = 0.88;
        ctx.lineWidth = Math.max(1.0, s.scale * 0.21);
        ctx.beginPath();
        ctx.moveTo(backX + sideX, backY + sideY);
        ctx.lineTo(tipX, tipY);
        ctx.lineTo(backX - sideX, backY - sideY);
        ctx.stroke();
        ctx.globalAlpha = 0.65;
        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.45, s.scale * 0.08), 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    function drawWeatherTint() {
      const s = worldScale();
      if (world.weather.droughtUntil > world.generation) {
        ctx.fillStyle = 'rgba(168,121,47,0.055)';
        ctx.fillRect(s.ox, s.oy, s.W * s.scale, s.H * s.scale);
      }
      if (world.weather.plagueUntil > world.generation) {
        ctx.fillStyle = 'rgba(102,109,76,0.05)';
        ctx.fillRect(s.ox, s.oy, s.W * s.scale, s.H * s.scale);
      }
      if (world.weather.ashUntil > world.generation) {
        ctx.fillStyle = 'rgba(141,58,34,0.04)';
        ctx.fillRect(s.ox, s.oy, s.W * s.scale, s.H * s.scale);
      }
    }

    function drawSelection() {
      const target = pinned || hovered;
      if (!target || target.dead) return;
      const s = worldScale();
      const px = s.ox + target.x * s.scale;
      const py = s.oy + target.y * s.scale;
      const r = pinned ? 11 : 9;
      ctx.save();
      ctx.strokeStyle = COLORS.ink;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 0.8;
      ctx.setLineDash([2, 2.4]);
      ctx.beginPath();
      ctx.arc(px, py, r, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    /* ------------------------------------------------------ specimen card */

    function nearestAgentAt(px, py) {
      if (!world) return null;
      const wp = toWorld(px, py);
      const s = worldScale();
      const hit = Math.max(9, s.scale * 1.8);
      let best = null, bestD = Infinity;
      const consider = (a) => {
        if (!a || a.dead) return;
        let dx = Math.abs(a.x - wp.x);
        let dy = Math.abs(a.y - wp.y);
        if (dx > world.width / 2) dx = world.width - dx;
        if (dy > world.height / 2) dy = world.height - dy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; best = a; }
      };
      for (let i = 0; i < world.carnivora.length; i++) consider(world.carnivora[i]);
      for (let i = 0; i < world.herbivora.length; i++) consider(world.herbivora[i]);
      return bestD <= (hit / s.scale) * (hit / s.scale) ? best : null;
    }

    function fillCard(a, isPinned) {
      if (!card) return;
      const sp = world.carnivora.indexOf(a) >= 0 ? 'carnivora' : 'herbivora';
      const meta = root.VIVARIUM_ENGINE.SPECIES[sp];
      const genes = root.VIVARIUM_ENGINE.GENE_META[sp];
      const rows = root.VIVARIUM_ENGINE.GENE_KEYS.map((key) => {
        const m = genes[key];
        return '<dt>' + m.label + '</dt><dd class="mono">' + a.genes[key].toFixed(2) +
          ' <small>' + m.unit + '</small></dd>';
      }).join('');
      card.innerHTML =
        '<div class="spec__head"><span class="spec__latin">' + meta.latin + '</span>' +
        '<span class="spec__taxon">' + meta.name + '</span></div>' +
        '<dl class="spec__data">' + rows + '</dl>' +
        '<span class="spec__note">' + (isPinned ? 'Pinned — click the glass to release' : 'Click the glass to pin') +
        ' · energy <span class="mono">' + a.energy.toFixed(2) + '</span></span>';
      const s = worldScale();
      const px = s.ox + a.x * s.scale;
      const py = s.oy + a.y * s.scale;
      const cardW = 182, cardH = 140;
      let left = px + 14;
      let top = py - 18;
      if (left + cardW > cssW - 10) left = px - cardW - 14;
      if (top + cardH > cssH - 10) top = cssH - cardH - 10;
      if (top < 10) top = 10;
      if (left < 10) left = 10;
      card.style.left = left + 'px';
      card.style.top = top + 'px';
      card.hidden = false;
      card.classList.toggle('is-pinned', !!isPinned);
    }

    function hideCard() {
      if (card) {
        card.hidden = true;
        card.classList.remove('is-pinned');
      }
    }

    /* --------------------------------------------------------- pointer */

    function onPointerMove(ev) {
      if (!world) return;
      const rect = canvas.getBoundingClientRect();
      const found = nearestAgentAt(ev.clientX - rect.left, ev.clientY - rect.top);
      if (found !== hovered) hovered = found;
      if (pinned) return;
      if (hovered) {
        fillCard(hovered, false);
        if (hint) hint.textContent = 'A specimen, briefly held.';
      } else {
        hideCard();
        if (hint) hint.textContent = 'Hover a specimen to read its label.';
      }
    }

    function onPointerLeave() {
      hovered = null;
      if (!pinned) {
        hideCard();
        if (hint) hint.textContent = 'Hover a specimen to read its label.';
      }
    }

    function onPointerDown(ev) {
      if (!world) return;
      const rect = canvas.getBoundingClientRect();
      const found = nearestAgentAt(ev.clientX - rect.left, ev.clientY - rect.top);
      if (found) {
        pinned = pinned === found ? null : found;
        if (pinned) fillCard(pinned, true); else hideCard();
        if (hint) hint.textContent = pinned ? 'Specimen pinned to the plate.' : 'Hover a specimen to read its label.';
      } else if (pinned) {
        pinned = null;
        hideCard();
        if (hint) hint.textContent = 'Hover a specimen to read its label.';
      }
    }

    function onKeyDown(ev) {
      if (ev.key === 'Escape' && pinned) {
        pinned = null;
        hideCard();
      }
    }

    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('keydown', onKeyDown);

    function reset() {
      hovered = null;
      pinned = null;
      lastTickDrawn = -1;
      lastWashGen = -1;
      hideCard();
      clearTrails();
      if (hint) hint.textContent = 'Hover a specimen to read its label.';
    }

    function destroy() {
      destroyed = true;
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('keydown', onKeyDown);
    }

    return { resize, draw, reset, clearTrails, destroy, getHovered: () => hovered, getPinned: () => pinned };
  }

  root.VIVARIUM_RENDER = { create: createRenderer };
})(typeof window !== 'undefined' ? window : globalThis);
