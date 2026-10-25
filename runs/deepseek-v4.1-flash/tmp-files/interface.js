
(function () {
  "use strict";

  const V = window.Vivarium;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const clamp = (value, min, max) => value < min ? min : value > max ? max : value;
  const MONO = '"SFMono-Regular", "Cascadia Mono", "Roboto Mono", Menlo, Consolas, monospace';
  const SERIF = '"Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif';
  const COLORS = {
    ink: "#07110d",
    paper: "#e9e2d0",
    paperDim: "#c5beab",
    muted: "#84968a",
    faint: "#64766b",
    flora: "#a8e7bf",
    grazer: "#f0bc6d",
    hunter: "#ee7566",
    brass: "#b99b68",
    teal: "#74cbc6",
    violet: "#b6a0d9",
    drought: "#d9a441"
  };
  const SPECIES_INFO = {
    prey: { label: "Glass grazer", short: "Grazer", color: COLORS.grazer, unit: "alive" },
    predator: { label: "Umbra eel", short: "Hunter", color: COLORS.hunter, unit: "alive" }
  };
  const EVENT_ORDER = ["drought", "plague", "surge"];

  function hexToRgba(hex, alpha) {
    const clean = hex.replace("#", "");
    const value = parseInt(clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean, 16);
    return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
  }

  function lerpAngle(current, target, amount) {
    let delta = (target - current) % (Math.PI * 2);
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    return current + delta * amount;
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();
  }

  function fitCanvas(canvas) {
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    const dpr = Math.min(2.5, window.devicePixelRatio || 1);
    const pixelWidth = Math.max(1, Math.round(rect.width * dpr));
    const pixelHeight = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: rect.width, h: rect.height, dpr };
  }

  function formatCount(value) {
    if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`;
    return String(Math.round(value));
  }

  function niceMax(value, divisions = 4) {
    const candidates = [5, 10, 20, 25, 50, 100, 150, 200, 250, 500, 750, 1000, 1500, 2000];
    const safeValue = Math.max(10, value);
    let best = null;
    for (const candidate of candidates) {
      const max = Math.ceil(safeValue / candidate) * candidate;
      const count = max / candidate;
      if (count < 3) continue;
      const score = max / safeValue + Math.abs(count - divisions) * 0.045;
      if (!best || score < best.score) best = { max, step: candidate, score };
    }
    return best || { max: Math.ceil(safeValue / 100) * 100, step: 100 };
  }

  function formatGene(key, value) {
    if (value == null || Number.isNaN(value)) return "—";
    if (key === "threshold") return value.toFixed(0);
    if (key === "vision") return value.toFixed(1);
    return value.toFixed(2);
  }

  function formatSigned(value, digits = 2) {
    if (value == null || Number.isNaN(value)) return "—";
    return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(digits)}`;
  }

  function padGen(value) {
    return String(Math.max(0, Math.round(value))).padStart(3, "0");
  }

  function castNextSeed(seed, cast = 0) {
    const h = V.hashSeed(`${seed}:${cast}:nocturne`);
    return 1000 + (h % 8999);
  }

  /* ------------------------------------------------------------------ */
  /* sparklines                                                          */
  /* ------------------------------------------------------------------ */

  function drawSpark(canvas, kind, value, context = {}) {
    if (!canvas) return;
    const fit = fitCanvas(canvas);
    if (!fit) return;
    const { ctx, w, h } = fit;
    ctx.clearRect(0, 0, w, h);

    const accentMap = {
      tempo: COLORS.brass,
      mutation: COLORS.flora,
      regrowth: COLORS.flora,
      seed: COLORS.brass,
      generations: COLORS.paperDim,
      drought: COLORS.drought,
      plague: COLORS.violet,
      surge: COLORS.teal
    };
    const accent = accentMap[kind] || COLORS.brass;
    const pad = 2.5;
    const bottom = h - 2.5;
    const mid = h * 0.52;
    const target = context.target || 240;
    const seed = Number(context.seed || 1884);
    const points = [];
    const count = 38;

    const localRng = new V.SeededRandom(`${seed}-${kind}-${Math.round(value * 100)}-spark`);

    if (kind === "tempo") {
      const cycles = 0.8 + (value / 32) * 2.3;
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        points.push(mid - Math.sin(t * Math.PI * 2 * cycles + 0.3) * h * 0.26 - Math.sin(t * Math.PI * 5) * h * 0.05);
      }
    } else if (kind === "mutation") {
      const amp = h * (0.035 + (value / 24) * 0.34);
      const walk = [];
      let v = 0;
      for (let i = 0; i < count; i++) {
        v += localRng.range(-1, 1) * 0.7;
        v *= 0.82;
        walk.push(v);
      }
      for (let i = 0; i < count; i++) points.push(mid + walk[i] * amp * 1.55);
    } else if (kind === "regrowth") {
      const level = value / 0.12;
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const phase = (t * 3.15 + 0.12) % 1;
        const ramp = Math.min(1, Math.pow(phase, 0.55));
        const reset = Math.max(0, 1 - ramp);
        points.push(bottom - (0.18 + ramp * 0.56 * level + reset * 0.04) * h);
      }
    } else if (kind === "seed") {
      let v = 0;
      for (let i = 0; i < count; i++) {
        v += localRng.range(-1.2, 1.2);
        v *= 0.58;
        points.push(mid + v * h * 0.25);
      }
    } else if (kind === "generations") {
      const progress = context.progress == null ? value / target : context.progress;
      for (let i = 0; i < count; i++) {
        const t = i / (count - 1);
        const stair = Math.floor(t * 6) / 5;
        const usable = clamp(progress, 0.03, 1);
        const level = clamp(t / usable, 0, 1);
        points.push(bottom - (0.12 + (stair * 0.38 + level * 0.42)) * h * 0.88);
      }
    } else if (EVENT_ORDER.includes(kind)) {
      const interval = value;
      if (interval <= 0) {
        for (let i = 0; i < count; i++) points.push(bottom - h * 0.23);
      } else {
        const spacing = Math.max(11, (w - pad * 2) * interval / Math.max(1, target));
        const peaks = [];
        for (let x = 6; x < w - 2; x += spacing) peaks.push(x);
        for (let i = 0; i < count; i++) {
          const x = pad + (i / (count - 1)) * (w - pad * 2);
          let lift = 0;
          for (const peak of peaks) {
            const d = Math.abs(x - peak);
            if (d < 3.2) lift = Math.max(lift, (1 - d / 3.2) * 0.77);
            else if (x > peak && d < 7.5) lift = Math.max(lift, (1 - (d - 3.2) / 4.3) * 0.25);
          }
          points.push(bottom - (0.16 + lift) * h);
        }
      }
    } else {
      for (let i = 0; i < count; i++) points.push(mid);
    }

    ctx.beginPath();
    ctx.moveTo(pad, points[0]);
    for (let i = 1; i < points.length; i++) {
      const x = pad + (i / (points.length - 1)) * (w - pad * 2);
      ctx.lineTo(x, points[i]);
    }
    const gradient = ctx.createLinearGradient(0, pad, 0, h - pad);
    gradient.addColorStop(0, hexToRgba(accent, kind === "mutation" ? 0.12 : 0.16));
    gradient.addColorStop(1, hexToRgba(accent, 0));
    ctx.lineTo(w - pad, bottom + 1);
    ctx.lineTo(pad, bottom + 1);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const x = pad + (i / (points.length - 1)) * (w - pad * 2);
      if (i === 0) ctx.moveTo(x, points[i]);
      else ctx.lineTo(x, points[i]);
    }
    ctx.strokeStyle = hexToRgba(accent, 0.72);
    ctx.lineWidth = 0.8;
    ctx.lineJoin = "round";
    ctx.stroke();

    const lastX = w - pad;
    const lastY = points[points.length - 1];
    ctx.beginPath();
    ctx.arc(lastX, lastY, 1.4, 0, Math.PI * 2);
    ctx.fillStyle = accent;
    ctx.fill();
  }

  /* ------------------------------------------------------------------ */
  /* canvas specimen renderer                                            */
  /* ------------------------------------------------------------------ */

  class VivariumRenderer {
    constructor(canvas, sim) {
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.plantCanvas = document.createElement("canvas");
      this.plantCanvas.width = V.GRID_W;
      this.plantCanvas.height = V.GRID_H;
      this.plantCtx = this.plantCanvas.getContext("2d");
      this.plantImage = this.plantCtx.createImageData(V.GRID_W, V.GRID_H);
      this.sprites = {
        prey: this._buildCreatureSprite("prey"),
        predator: this._buildCreatureSprite("predator")
      };
      this.track = new Map();
      this.trails = true;
      this.grid = true;
      this.pointer = null;
      this.lastGeneration = -1;
      this.lastTime = 0;
      this.frame = 0;
      this.w = 1;
      this.h = 1;
      this.dpr = 1;
      this.sim = null;
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(canvas);
      this.resize();
      this.setSimulation(sim);
    }

    setSimulation(sim) {
      this.sim = sim;
      this.track.clear();
      this.lastGeneration = -1;
      this.visualRng = new V.SeededRandom(`${sim.seed || "1884"}::visual-field`);
      this.particles = Array.from({ length: 112 }, () => ({
        x: this.visualRng.next(),
        y: this.visualRng.next(),
        phase: this.visualRng.range(0, Math.PI * 2),
        speed: this.visualRng.range(0.12, 0.65),
        size: this.visualRng.range(0.3, 1.55),
        kind: this.visualRng.next() > 0.81 ? "cross" : "dot"
      }));
      this.contourOffsets = Array.from({ length: 7 }, () => this.visualRng.range(0, Math.PI * 2));
      this._updatePlantTexture(true);
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      this.w = rect.width;
      this.h = rect.height;
      this.dpr = Math.min(2.5, window.devicePixelRatio || 1);
      this.canvas.width = Math.max(1, Math.round(this.w * this.dpr));
      this.canvas.height = Math.max(1, Math.round(this.h * this.dpr));
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this._updatePlantTexture(true);
    }

    _field() {
      const insetX = Math.max(7, Math.min(12, this.w * 0.014));
      const insetY = Math.max(7, Math.min(12, this.h * 0.016));
      return {
        x: insetX,
        y: insetY,
        w: Math.max(1, this.w - insetX * 2),
        h: Math.max(1, this.h - insetY * 2)
      };
    }

    cellToPixel(x, y, field) {
      return {
        x: field.x + ((x + 0.5) / V.GRID_W) * field.w,
        y: field.y + ((y + 0.5) / V.GRID_H) * field.h
      };
    }

    _buildCreatureSprite(type) {
      const size = 76;
      const sprite = document.createElement("canvas");
      sprite.width = size;
      sprite.height = size;
      const ctx = sprite.getContext("2d");
      const center = size / 2;
      const color = type === "prey" ? COLORS.grazer : COLORS.hunter;

      const glow = ctx.createRadialGradient(center, center, 1, center, center, 35);
      glow.addColorStop(0, hexToRgba(color, 0.3));
      glow.addColorStop(0.32, hexToRgba(color, 0.11));
      glow.addColorStop(1, hexToRgba(color, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, size, size);

      ctx.translate(center, center);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (type === "prey") {
        ctx.beginPath();
        ctx.moveTo(21, 0);
        ctx.bezierCurveTo(13, -12, -7, -15, -18, -5);
        ctx.lineTo(-27, -11);
        ctx.lineTo(-23, 0);
        ctx.lineTo(-27, 11);
        ctx.lineTo(-18, 5);
        ctx.bezierCurveTo(-7, 15, 13, 12, 21, 0);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(color, 0.13);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(color, 0.94);
        ctx.lineWidth = 1.05;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(16, -5);
        ctx.quadraticCurveTo(24, -14, 27, -18);
        ctx.moveTo(16, 2);
        ctx.quadraticCurveTo(26, 9, 28, 14);
        ctx.strokeStyle = hexToRgba(color, 0.58);
        ctx.lineWidth = 0.7;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-7, -8);
        ctx.quadraticCurveTo(0, 0, -8, 8);
        ctx.strokeStyle = hexToRgba(color, 0.36);
        ctx.lineWidth = 0.6;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(11, -2.5, 1.4, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(255, 248, 225, 0.92)";
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(27, -1);
        ctx.bezierCurveTo(20, -16, -4, -22, -24, -9);
        ctx.bezierCurveTo(-16, -5, -10, 3, -12, 12);
        ctx.bezierCurveTo(2, 17, 18, 13, 27, -1);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(color, 0.11);
        ctx.fill();
        ctx.strokeStyle = hexToRgba(color, 0.9);
        ctx.lineWidth = 1.15;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(-18, -9);
        ctx.lineTo(-32, -17);
        ctx.moveTo(-23, -2);
        ctx.lineTo(-36, -1);
        ctx.moveTo(-18, 8);
        ctx.lineTo(-31, 16);
        ctx.strokeStyle = hexToRgba(color, 0.6);
        ctx.lineWidth = 0.8;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(15, -4);
        ctx.bezierCurveTo(9, -10, 1, -10, -3, -4);
        ctx.strokeStyle = hexToRgba(color, 0.45);
        ctx.lineWidth = 0.7;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(10, -2.5, 2.1, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(246, 238, 216, 0.9)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(10.8, -2.5, 0.9, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(7, 17, 13, 0.86)";
        ctx.fill();
      }

      return sprite;
    }

    _updatePlantTexture(force = false) {
      if (!this.sim) return;
      if (!force && this.lastGeneration === this.sim.generation) return;
      const data = this.plantImage.data;
      const plants = this.sim.plants;
      for (let i = 0; i < V.CELL_COUNT; i++) {
        const value = plants[i];
        const di = i * 4;
        if (value < 0.008) {
          data[di + 3] = 0;
          continue;
        }
        const energy = Math.min(1, value * 1.16);
        const pulse = 0.86 + 0.14 * Math.sin(i * 12.9898 + this.sim.generation * 0.07);
        const hue = 0.88 + 0.12 * Math.sin(i * 0.371 + V.hashSeed(this.sim.seed) * 0.0001);
        data[di] = Math.round((25 + 30 * energy + 8 * hue) * pulse);
        data[di + 1] = Math.round((70 + 86 * energy) * pulse);
        data[di + 2] = Math.round((54 + 65 * energy + 8 * hue) * pulse);
        data[di + 3] = Math.round(Math.min(214, 28 + 178 * Math.pow(energy, 0.76)));
      }
      this.plantCtx.putImageData(this.plantImage, 0, 0);
      this.lastGeneration = this.sim.generation;
    }

    _syncAgent(agent, dt) {
      let entry = this.track.get(agent.id);
      if (!entry) {
        entry = {
          x: agent.x,
          y: agent.y,
          heading: agent.heading,
          energy: agent.energy,
          seen: this.frame
        };
        this.track.set(agent.id, entry);
      } else {
        const jump = Math.abs(agent.x - entry.x) + Math.abs(agent.y - entry.y);
        if (jump > 22) {
          entry.x = agent.x;
          entry.y = agent.y;
          entry.heading = agent.heading;
        } else {
          const ease = Math.min(0.42, 1 - Math.exp(-dt / 55));
          entry.x += (agent.x - entry.x) * ease;
          entry.y += (agent.y - entry.y) * ease;
          entry.heading = lerpAngle(entry.heading, agent.heading, Math.min(0.45, ease * 1.7));
        }
        entry.energy += (agent.energy - entry.energy) * 0.25;
        entry.seen = this.frame;
      }
      return entry;
    }

    draw(now, state = {}) {
      if (!this.sim) return;
      const dt = Math.min(110, now - this.lastTime || 16);
      this.lastTime = now;
      this.frame++;
      this.ctx.clearRect(0, 0, this.w, this.h);
      this._updatePlantTexture();

      const ctx = this.ctx;
      const field = this._field();

      const base = ctx.createLinearGradient(0, 0, this.w, this.h);
      base.addColorStop(0, "#07130e");
      base.addColorStop(0.5, "#06110d");
      base.addColorStop(1, "#07140f");
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, this.w, this.h);

      const bloom = ctx.createRadialGradient(this.w * 0.45, this.h * 0.43, 10, this.w * 0.45, this.h * 0.43, Math.max(this.w, this.h) * 0.75);
      bloom.addColorStop(0, "rgba(64, 123, 92, 0.18)");
      bloom.addColorStop(0.45, "rgba(27, 71, 53, 0.08)");
      bloom.addColorStop(1, "rgba(2, 8, 6, 0)");
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, this.w, this.h);

      const floor = ctx.createLinearGradient(0, this.h * 0.7, 0, this.h);
      floor.addColorStop(0, "rgba(1, 6, 4, 0)");
      floor.addColorStop(1, "rgba(1, 5, 4, 0.52)");
      ctx.fillStyle = floor;
      ctx.fillRect(0, 0, this.w, this.h);

      this._drawLightShafts(ctx, now);
      this._drawContours(ctx, now);

      ctx.save();
      ctx.beginPath();
      roundedRect(ctx, field.x, field.y, field.w, field.h, 5);
      ctx.clip();

      ctx.globalCompositeOperation = "screen";
      ctx.globalAlpha = 0.12;
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(this.plantCanvas, field.x - field.w * 0.018, field.y - field.h * 0.02, field.w * 1.036, field.h * 1.04);
      ctx.globalAlpha = 0.8;
      ctx.drawImage(this.plantCanvas, field.x, field.y, field.w, field.h);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";

      this._drawPlantGlyphs(ctx, field, now);
      this._drawFloraBlooms(ctx, field, now);
      if (this.grid) this._drawLattice(ctx, field);
      this._drawParticles(ctx, field, now);
      this._drawAgents(ctx, field, dt, state);
      ctx.restore();

      this._drawFrameMarks(ctx, field);
      this._drawPointer(ctx, field, state);
    }

    _drawLightShafts(ctx, now) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const drift = Math.sin(now * 0.00004) * 12;
      for (let i = 0; i < 3; i++) {
        const x = this.w * (0.24 + i * 0.25) + drift * (i - 1) * 0.6;
        const width = this.w * (0.06 + i * 0.018);
        const gradient = ctx.createLinearGradient(x, 0, x + this.w * 0.09, this.h);
        gradient.addColorStop(0, i === 1 ? "rgba(162, 220, 184, 0.055)" : "rgba(139, 197, 172, 0.03)");
        gradient.addColorStop(0.55, "rgba(137, 197, 166, 0.018)");
        gradient.addColorStop(1, "rgba(137, 197, 166, 0)");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.moveTo(x - width * 0.4, 0);
        ctx.lineTo(x + width * 0.65, 0);
        ctx.lineTo(x + width * 2.8, this.h);
        ctx.lineTo(x + width * 0.65, this.h);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    _drawContours(ctx, now) {
      ctx.save();
      ctx.beginPath();
      const field = this._field();
      roundedRect(ctx, field.x, field.y, field.w, field.h, 5);
      ctx.clip();
      for (let i = 0; i < 7; i++) {
        const baseY = field.y + field.h * (0.13 + i * 0.125);
        const offset = this.contourOffsets[i] + now * 0.000006 * (i % 2 === 0 ? 1 : -1);
        ctx.beginPath();
        for (let x = field.x - 20; x <= field.x + field.w + 20; x += 12) {
          const t = (x - field.x) / field.w;
          const y = baseY
            + Math.sin(t * Math.PI * 3.1 + offset + i * 1.1) * (5 + i * 0.7)
            + Math.sin(t * Math.PI * 7.3 + offset * 1.3) * 1.7;
          if (x <= field.x - 8) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = i === 3 ? "rgba(166, 210, 179, 0.065)" : "rgba(154, 199, 167, 0.035)";
        ctx.lineWidth = i === 3 ? 0.7 : 0.55;
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawPlantGlyphs(ctx, field) {
      const plants = this.sim.plants;
      const seedOffset = V.hashSeed(this.sim.seed) % 23;
      let drawn = 0;
      ctx.save();
      for (let i = seedOffset; i < V.CELL_COUNT && drawn < 185; i += 23) {
        const value = plants[i];
        if (value < 0.46) continue;
        const x = i % V.GRID_W;
        const y = Math.floor(i / V.GRID_W);
        const p = this.cellToPixel(x, y, field);
        const size = 1.8 + Math.min(1, value) * 2.4;
        const rotation = (i * 2.399) % (Math.PI * 2);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(rotation);
        ctx.globalAlpha = 0.16 + Math.min(0.4, value * 0.4);
        ctx.strokeStyle = COLORS.flora;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -size);
        ctx.moveTo(-size * 0.52, -size * 0.24);
        ctx.quadraticCurveTo(-size * 0.6, -size * 0.78, 0, -size * 0.84);
        ctx.moveTo(size * 0.52, -size * 0.24);
        ctx.quadraticCurveTo(size * 0.6, -size * 0.78, 0, -size * 0.84);
        ctx.moveTo(-size * 0.4, -size * 0.7);
        ctx.lineTo(size * 0.4, -size * 0.7);
        ctx.stroke();
        ctx.globalAlpha *= 0.85;
        ctx.fillStyle = COLORS.flora;
        ctx.beginPath();
        ctx.arc(0, -size * 0.8, 0.65, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        drawn++;
      }
      ctx.restore();
    }

    _drawFloraBlooms(ctx, field, now) {
      const plants = this.sim.plants;
      const seedOffset = V.hashSeed(`${this.sim.seed}::blooms`) % 139;
      ctx.save();
      let count = 0;
      for (let i = seedOffset; i < V.CELL_COUNT && count < 28; i += 139) {
        const value = plants[i];
        if (value < 0.66) continue;
        const x = i % V.GRID_W;
        const y = Math.floor(i / V.GRID_W);
        const p = this.cellToPixel(x, y, field);
        const jitter = Math.sin(i * 7.17 + now * 0.00003) * 1.3;
        const size = 3.6 + value * 2.9;
        const rotation = (i * 1.618 + 0.4) % (Math.PI * 2);
        ctx.save();
        ctx.translate(p.x + jitter, p.y - Math.cos(i * 2.3) * 1.2);
        ctx.rotate(rotation);
        ctx.globalAlpha = 0.26 + value * 0.24;
        ctx.strokeStyle = COLORS.flora;
        ctx.fillStyle = COLORS.flora;
        ctx.lineWidth = 0.62;
        for (let petal = 0; petal < 5; petal++) {
          const angle = petal * Math.PI * 2 / 5;
          const px = Math.cos(angle) * size;
          const py = Math.sin(angle) * size;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.quadraticCurveTo(px * 0.52 + py * 0.22, py * 0.52 - px * 0.22, px, py);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(px, py, 0.62, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha *= 0.8;
        ctx.beginPath();
        ctx.arc(0, 0, 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        count++;
      }
      ctx.restore();
    }

    _drawLattice(ctx, field) {
      ctx.save();
      ctx.strokeStyle = "rgba(197, 219, 200, 0.052)";
      ctx.lineWidth = 0.5;
      const columns = 8;
      const rows = 6;
      for (let c = 1; c < columns; c++) {
        const x = field.x + (c / columns) * field.w;
        ctx.beginPath();
        ctx.moveTo(x, field.y);
        ctx.lineTo(x, field.y + field.h);
        ctx.stroke();
      }
      for (let r = 1; r < rows; r++) {
        const y = field.y + (r / rows) * field.h;
        ctx.beginPath();
        ctx.moveTo(field.x, y);
        ctx.lineTo(field.x + field.w, y);
        ctx.stroke();
      }

      ctx.strokeStyle = "rgba(218, 230, 213, 0.18)";
      for (let c = 0; c <= columns; c++) {
        const x = field.x + (c / columns) * field.w;
        ctx.beginPath();
        ctx.moveTo(x, field.y);
        ctx.lineTo(x, field.y + (c % 2 === 0 ? 5 : 3));
        ctx.moveTo(x, field.y + field.h - (c % 2 === 0 ? 5 : 3));
        ctx.lineTo(x, field.y + field.h);
        ctx.stroke();
      }
      for (let r = 0; r <= rows; r++) {
        const y = field.y + (r / rows) * field.h;
        ctx.beginPath();
        ctx.moveTo(field.x, y);
        ctx.lineTo(field.x + (r % 2 === 0 ? 5 : 3), y);
        ctx.moveTo(field.x + field.w - (r % 2 === 0 ? 5 : 3), y);
        ctx.lineTo(field.x + field.w, y);
        ctx.stroke();
      }

      for (let r = 1; r < rows; r++) {
        for (let c = 1; c < columns; c++) {
          const x = field.x + (c / columns) * field.w;
          const y = field.y + (r / rows) * field.h;
          ctx.fillStyle = "rgba(214, 228, 213, 0.16)";
          ctx.fillRect(x - 1.5, y, 3, 0.5);
          ctx.fillRect(x, y - 1.5, 0.5, 3);
        }
      }
      ctx.restore();
    }

    _drawParticles(ctx, field, now) {
      ctx.save();
      ctx.beginPath();
      roundedRect(ctx, field.x, field.y, field.w, field.h, 5);
      ctx.clip();
      const time = now * 0.001;
      for (const particle of this.particles) {
        const drift = (particle.x + time * 0.0018 * particle.speed) % 1;
        const px = field.x + drift * field.w + Math.sin(time * 0.06 + particle.phase) * 3;
        const py = field.y + particle.y * field.h + Math.sin(time * 0.09 + particle.phase * 2.1) * 2.2;
        const flicker = 0.38 + 0.32 * Math.sin(time * 0.35 + particle.phase);
        ctx.globalAlpha = clamp(flicker, 0.08, 0.52);
        ctx.strokeStyle = "rgba(198, 225, 204, 0.42)";
        ctx.fillStyle = "rgba(198, 225, 204, 0.36)";
        if (particle.kind === "cross") {
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(px - particle.size * 1.6, py);
          ctx.lineTo(px + particle.size * 1.6, py);
          ctx.moveTo(px, py - particle.size * 1.6);
          ctx.lineTo(px, py + particle.size * 1.6);
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(px, py, particle.size * 0.55, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    _drawAgents(ctx, field, dt, state) {
      const seen = new Set();
      const drawOne = (agent, entry) => {
        seen.add(agent.id);
        const p = this.cellToPixel(entry.x, entry.y, field);
        const energyRatio = clamp(agent.energy / Math.max(8, agent.genes.threshold), 0.2, 1.3);
        const baseSize = agent.species === "prey" ? 23.5 : 35;
        const scale = clamp(Math.min(field.w / 740, field.h / 530), 0.62, 1.28);
        const size = baseSize * scale * (0.88 + energyRatio * 0.16);
        const sprite = this.sprites[agent.species];

        if (this.trails) {
          for (let t = 2; t >= 1; t--) {
            const offset = t * 3.8 * scale;
            const tx = p.x - Math.cos(entry.heading) * offset;
            const ty = p.y - Math.sin(entry.heading) * offset;
            ctx.save();
            ctx.globalAlpha = t === 1 ? 0.13 : 0.06;
            ctx.translate(tx, ty);
            ctx.rotate(entry.heading);
            ctx.drawImage(sprite, -size * 0.5, -size * 0.5, size, size);
            ctx.restore();
          }
        }

        ctx.save();
        ctx.globalAlpha = state.finished ? 0.86 : 0.95;
        ctx.translate(p.x, p.y);
        ctx.rotate(entry.heading);
        ctx.drawImage(sprite, -size * 0.5, -size * 0.5, size, size);
        ctx.restore();
      };

      for (const agent of this.sim.prey) drawOne(agent, this._syncAgent(agent, dt));
      for (const agent of this.sim.predators) drawOne(agent, this._syncAgent(agent, dt));
      for (const [id, entry] of this.track) {
        if (!seen.has(id) && this.frame - entry.seen > 3) this.track.delete(id);
      }
    }

    _drawFrameMarks(ctx) {
      ctx.save();
      const w = this.w;
      const h = this.h;
      ctx.fillStyle = "rgba(209, 223, 206, 0.24)";
      ctx.font = `500 5.8px ${MONO}`;
      ctx.textAlign = "left";
      ctx.fillText("N", 16, 23);
      ctx.fillText("W", 10, h - 14);
      ctx.textAlign = "right";
      ctx.fillText("E", w - 16, h - 14);
      ctx.textAlign = "center";
      ctx.fillText("S", w / 2, h - 10);
      ctx.strokeStyle = "rgba(208, 224, 207, 0.14)";
      ctx.lineWidth = 0.5;
      for (let i = 1; i <= 4; i++) {
        const x = 10 + i * 10;
        ctx.beginPath();
        ctx.moveTo(x, h - 22);
        ctx.lineTo(x, h - (i % 2 === 0 ? 18 : 20));
        ctx.stroke();
      }
      ctx.restore();
    }

    _drawPointer(ctx, field) {
      if (!this.pointer) return;
      const { x, y } = this.pointer;
      if (x < field.x || y < field.y || x > field.x + field.w || y > field.y + field.h) return;
      const gx = Math.floor(((x - field.x) / field.w) * V.GRID_W);
      const gy = Math.floor(((y - field.y) / field.h) * V.GRID_H);
      ctx.save();
      ctx.strokeStyle = "rgba(235, 227, 206, 0.34)";
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.arc(x, y, 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(235, 227, 206, 0.17)";
      ctx.beginPath();
      ctx.arc(x, y, 23, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x - 30, y);
      ctx.lineTo(x - 18, y);
      ctx.moveTo(x + 18, y);
      ctx.lineTo(x + 30, y);
      ctx.moveTo(x, y - 30);
      ctx.lineTo(x, y - 18);
      ctx.moveTo(x, y + 18);
      ctx.lineTo(x, y + 30);
      ctx.stroke();
      ctx.fillStyle = "rgba(235, 227, 206, 0.55)";
      ctx.font = `500 5.8px ${MONO}`;
      const label = `X ${String(gx).padStart(3, "0")}  ·  Y ${String(gy).padStart(3, "0")}`;
      const labelX = clamp(x + 30, field.x + 4, field.x + field.w - 88);
      const labelY = clamp(y - 20, field.y + 10, field.y + field.h - 8);
      ctx.fillText(label, labelX, labelY);
      ctx.restore();
    }
  }

  /* ------------------------------------------------------------------ */
  /* dashboard charts                                                    */
  /* ------------------------------------------------------------------ */

  const chartState = {
    sim: null,
    hoverGen: null,
    geom: null
  };

  function drawEventRules(ctx, events, xFor, top, bottom, detail = true) {
    if (!events || !events.length) return;
    ctx.save();
    for (const event of events) {
      const meta = V.EVENT_META[event.type];
      if (!meta) continue;
      const x = xFor(event.generation);
      if (x == null) continue;
      ctx.save();
      ctx.strokeStyle = meta.color;
      ctx.globalAlpha = 0.26;
      ctx.lineWidth = 0.7;
      ctx.setLineDash([2, 4]);
      ctx.beginPath();
      ctx.moveTo(x, top + 3);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = meta.color;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(x, top - 4);
      ctx.lineTo(x + 2.7, top - 1.3);
      ctx.lineTo(x, top + 1.4);
      ctx.lineTo(x - 2.7, top - 1.3);
      ctx.closePath();
      ctx.fill();
      if (detail) {
        ctx.font = `500 8px ${SERIF}`;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.globalAlpha = 0.78;
        ctx.fillText(meta.glyph, x, top + 4);
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawPopulationChart() {
    const canvas = $("#populationChart");
    if (!canvas || !chartState.sim) return;
    const fit = fitCanvas(canvas);
    if (!fit) return;
    const { ctx, w, h } = fit;
    const sim = chartState.sim;
    const history = sim.history;
    if (!history || history.length < 2) return;
    const endGeneration = history[history.length - 1].generation;
    const n = Math.max(1, endGeneration);
    ctx.clearRect(0, 0, w, h);

    const pad = {
      left: 33,
      right: 38,
      top: 27,
      bottom: 25
    };
    const plotW = Math.max(10, w - pad.left - pad.right);
    const plotH = Math.max(10, h - pad.top - pad.bottom);
    const baseY = pad.top + plotH;

    let maxAnimals = 10;
    for (const entry of history) {
      maxAnimals = Math.max(maxAnimals, entry.prey, entry.predators);
    }
    const scale = niceMax(maxAnimals, 4);
    const yMax = scale.max;
    const step = scale.step;
    const xFor = generation => pad.left + (generation / n) * plotW;
    const yCount = count => pad.top + plotH - (count / yMax) * plotH;
    const yFlora = coverage => pad.top + plotH - (coverage / 100) * plotH;

    chartState.geom = { pad, plotW, plotH, n, yMax, xFor };

    ctx.save();
    ctx.font = `500 7.8px ${MONO}`;
    ctx.fillStyle = "rgba(197, 190, 171, 0.52)";
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillText("SPECIMENS", 2, 10);
    ctx.textAlign = "right";
    ctx.fillText("FLORA", w - 3, 10);

    for (let value = 0; value <= yMax; value += step) {
      const y = yCount(value);
      ctx.strokeStyle = value === 0 ? "rgba(196, 216, 198, 0.16)" : "rgba(196, 216, 198, 0.065)";
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillStyle = "rgba(164, 177, 162, 0.62)";
      ctx.textAlign = "right";
      ctx.fillText(String(value), pad.left - 7, y);
    }

    for (const coverage of [0, 50, 100]) {
      const y = yFlora(coverage);
      if (Math.abs(y - yCount(0)) < 2) continue;
      ctx.fillStyle = "rgba(166, 188, 169, 0.45)";
      ctx.textAlign = "left";
      ctx.fillText(`${coverage}%`, w - pad.right + 6, y);
    }

    const xTicks = 4;
    for (let i = 0; i <= xTicks; i++) {
      const generation = Math.round((endGeneration / xTicks) * i);
      const x = xFor(generation);
      ctx.strokeStyle = "rgba(196, 216, 198, 0.045)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x, pad.top);
      ctx.lineTo(x, baseY);
      ctx.stroke();
      ctx.fillStyle = "rgba(164, 177, 162, 0.55)";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(String(generation).padStart(3, "0"), x, baseY + 7);
    }

    ctx.fillStyle = "rgba(151, 166, 154, 0.38)";
    ctx.textAlign = "right";
    ctx.fillText("GENERATION", w - pad.right, h - 7);

    drawEventRules(ctx, sim.eventLog, xFor, pad.top, baseY);

    const floraGradient = ctx.createLinearGradient(0, pad.top, 0, baseY);
    floraGradient.addColorStop(0, "rgba(168, 231, 191, 0.16)");
    floraGradient.addColorStop(1, "rgba(168, 231, 191, 0.012)");
    ctx.beginPath();
    ctx.moveTo(xFor(history[0].generation), baseY);
    for (const entry of history) {
      ctx.lineTo(xFor(entry.generation), yFlora(entry.plants));
    }
    ctx.lineTo(xFor(history[history.length - 1].generation), baseY);
    ctx.closePath();
    ctx.fillStyle = floraGradient;
    ctx.fill();

    ctx.beginPath();
    for (let i = 0; i < history.length; i++) {
      const entry = history[i];
      const x = xFor(entry.generation);
      const y = yFlora(entry.plants);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(168, 231, 191, 0.58)";
    ctx.lineWidth = 0.85;
    ctx.stroke();

    const drawSeries = (key, color, lineWidth) => {
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const entry = history[i];
        const x = xFor(entry.generation);
        const y = yCount(entry[key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = hexToRgba(color, 0.12);
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.beginPath();
      for (let i = 0; i < history.length; i++) {
        const entry = history[i];
        const x = xFor(entry.generation);
        const y = yCount(entry[key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.strokeStyle = hexToRgba(color, 0.92);
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = "round";
      ctx.stroke();

      const last = history[history.length - 1];
      ctx.beginPath();
      ctx.arc(xFor(last.generation), yCount(last[key]), 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    };

    drawSeries("prey", COLORS.grazer, 1.25);
    drawSeries("predators", COLORS.hunter, 1.15);

    if (chartState.hoverGen != null) {
      const hover = history.reduce((closest, entry) =>
        Math.abs(entry.generation - chartState.hoverGen) < Math.abs(closest.generation - chartState.hoverGen) ? entry : closest
      , history[0]);
      const hx = xFor(hover.generation);
      ctx.save();
      ctx.strokeStyle = "rgba(233, 226, 208, 0.38)";
      ctx.lineWidth = 0.7;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(hx, pad.top);
      ctx.lineTo(hx, baseY);
      ctx.stroke();
      ctx.setLineDash([]);

      const dots = [
        { y: yCount(hover.prey), color: COLORS.grazer },
        { y: yCount(hover.predators), color: COLORS.hunter },
        { y: yFlora(hover.plants), color: COLORS.flora }
      ];
      for (const dot of dots) {
        ctx.beginPath();
        ctx.arc(hx, dot.y, 2.1, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.ink;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = dot.color;
        ctx.stroke();
      }

      const tooltipW = 168;
      const tooltipH = 50;
      let boxX = hx + 10;
      if (boxX + tooltipW > w - 4) boxX = hx - tooltipW - 10;
      let boxY = pad.top + 7;
      ctx.fillStyle = "rgba(5, 13, 10, 0.92)";
      ctx.strokeStyle = "rgba(204, 219, 202, 0.16)";
      ctx.lineWidth = 0.7;
      roundedRect(ctx, boxX, boxY, tooltipW, tooltipH, 3);
      ctx.fill();
      ctx.stroke();

      ctx.font = `500 7px ${MONO}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = COLORS.paperDim;
      ctx.fillText(`GEN ${String(hover.generation).padStart(3, "0")}`, boxX + 9, boxY + 7);
      ctx.fillStyle = COLORS.flora;
      ctx.fillText(`FLORA ${hover.plants.toFixed(1)}%`, boxX + 9, boxY + 19);
      ctx.fillStyle = COLORS.grazer;
      ctx.fillText(`GRAZER ${hover.prey}`, boxX + 9, boxY + 31);
      ctx.fillStyle = COLORS.hunter;
      ctx.textAlign = "right";
      ctx.fillText(`HUNTER ${hover.predators}`, boxX + tooltipW - 9, boxY + 31);
      ctx.restore();
    }

    ctx.restore();
  }

  function makeTraitCards() {
    const grid = $("#traitGrid");
    if (!grid) return;
    grid.innerHTML = "";
    for (const species of ["prey", "predator"]) {
      const info = SPECIES_INFO[species];
      for (const key of V.GENE_KEYS) {
        const card = document.createElement("div");
        card.className = "trait-card";
        card.style.setProperty("--species", info.color);
        card.dataset.species = species;
        card.dataset.gene = key;
        card.innerHTML = `
          <div class="trait-card-head">
            <div class="trait-card-title"><b>${info.short}</b>${V.GENE_LABELS[key]} <span class="trait-unit">${V.GENE_UNITS[key]}</span></div>
            <div class="trait-card-value"><b data-role="value">—</b><span data-role="spread">σ —</span></div>
          </div>
          <canvas role="img" aria-label="${info.short} ${V.GENE_LABELS[key]} mean and spread over the run"></canvas>
          <div class="trait-card-foot"><span data-role="initial">initial —</span><span data-role="delta">—</span></div>
        `;
        grid.appendChild(card);
      }
    }
  }

  function drawTraitCard(card) {
    const sim = chartState.sim;
    if (!sim) return;
    const species = card.dataset.species;
    const key = card.dataset.gene;
    const info = SPECIES_INFO[species];
    const canvas = $("canvas", card);
    const fit = fitCanvas(canvas);
    if (!fit) return;
    const { ctx, w, h } = fit;
    ctx.clearRect(0, 0, w, h);

    const records = sim.history.map(entry => ({
      generation: entry.generation,
      stat: entry.traits[species][key]
    }));
    const endGeneration = records[records.length - 1].generation;
    const n = Math.max(1, endGeneration);
    const theoretical = V.GENE_RANGES[species][key];
    const theoreticalSpan = theoretical[1] - theoretical[0];
    let lo = Infinity;
    let hi = -Infinity;
    for (const record of records) {
      if (record.stat.mean == null) continue;
      const spread = record.stat.sd || 0;
      lo = Math.min(lo, record.stat.mean - spread);
      hi = Math.max(hi, record.stat.mean + spread);
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      ctx.fillStyle = COLORS.faint;
      ctx.font = `italic 9px ${SERIF}`;
      ctx.textAlign = "center";
      ctx.fillText("No living lineage at close.", w / 2, h / 2);
      $("[data-role='value']", card).textContent = "—";
      $("[data-role='spread']", card).textContent = "extinct";
      return;
    }

    const padY = Math.max(theoreticalSpan * 0.08, theoreticalSpan * 0.03);
    let yMin = Math.max(theoretical[0], lo - padY);
    let yMax = Math.min(theoretical[1], hi + padY);
    if (yMax - yMin < theoreticalSpan * 0.07) {
      const middle = (yMin + yMax) / 2;
      yMin = Math.max(theoretical[0], middle - theoreticalSpan * 0.045);
      yMax = Math.min(theoretical[1], middle + theoreticalSpan * 0.045);
    }

    const pad = { left: 23, right: 4, top: 7, bottom: 10 };
    const plotW = Math.max(4, w - pad.left - pad.right);
    const plotH = Math.max(6, h - pad.top - pad.bottom);
    const baseY = pad.top + plotH;
    const xFor = generation => pad.left + (generation / n) * plotW;
    const yFor = value => pad.top + plotH - ((value - yMin) / (yMax - yMin)) * plotH;

    ctx.save();
    ctx.font = `500 5.4px ${MONO}`;
    ctx.fillStyle = "rgba(143, 161, 148, 0.55)";
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillText(formatGene(key, yMax), pad.left - 5, pad.top + 1);
    ctx.fillText(formatGene(key, yMin), pad.left - 5, baseY - 1);

    for (const fraction of [0, 0.5, 1]) {
      const y = pad.top + plotH * fraction;
      ctx.strokeStyle = "rgba(198, 216, 199, 0.07)";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(pad.left, y + 0.5);
      ctx.lineTo(w - pad.right, y + 0.5);
      ctx.stroke();
    }

    drawEventRules(ctx, sim.eventLog, xFor, pad.top, baseY, false);

    const valid = records.filter(record => record.stat.mean != null);
    const segments = [];
    let current = [];
    for (const record of records) {
      if (record.stat.mean == null) {
        if (current.length) segments.push(current);
        current = [];
      } else {
        current.push(record);
      }
    }
    if (current.length) segments.push(current);

    ctx.fillStyle = hexToRgba(info.color, 0.14);
    for (const segment of segments) {
      if (segment.length === 1) {
        const record = segment[0];
        const x = xFor(record.generation);
        const spread = record.stat.sd || 0;
        ctx.fillRect(x - 1, yFor(record.stat.mean + spread), 2, Math.max(1, yFor(record.stat.mean - spread) - yFor(record.stat.mean + spread)));
        continue;
      }
      ctx.beginPath();
      for (let i = 0; i < segment.length; i++) {
        const record = segment[i];
        const x = xFor(record.generation);
        const y = yFor(record.stat.mean + (record.stat.sd || 0));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      for (let i = segment.length - 1; i >= 0; i--) {
        const record = segment[i];
        ctx.lineTo(xFor(record.generation), yFor(record.stat.mean - (record.stat.sd || 0)));
      }
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = hexToRgba(info.color, 0.92);
    ctx.lineWidth = 1.05;
    ctx.lineJoin = "round";
    for (const segment of segments) {
      ctx.beginPath();
      segment.forEach((record, i) => {
        const x = xFor(record.generation);
        const y = yFor(record.stat.mean);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }

    if (valid.length) {
      const last = valid[valid.length - 1];
      ctx.beginPath();
      ctx.arc(xFor(last.generation), yFor(last.stat.mean), 1.8, 0, Math.PI * 2);
      ctx.fillStyle = info.color;
      ctx.fill();

      const first = valid[0];
      const initialValue = first.stat.mean;
      const finalValue = last.stat.mean;
      const delta = finalValue - initialValue;
      const spread = last.stat.sd;
      $("[data-role='value']", card).textContent = formatGene(key, finalValue);
      $("[data-role='spread']", card).textContent = `σ ${formatGene(key, spread || 0)}`;
      $("[data-role='initial']", card).textContent = `init ${formatGene(key, initialValue)}`;
      $("[data-role='delta']", card).textContent = `${formatSigned(delta, key === "threshold" ? 0 : 2)} ${last.generation < endGeneration ? "· extinct" : ""}`;
      ctx.fillStyle = "rgba(151, 166, 154, 0.46)";
      ctx.font = `500 5px ${MONO}`;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText("0", pad.left, h - 1);
      ctx.textAlign = "right";
      ctx.fillText(String(endGeneration), w - pad.right, h - 1);
      canvas.setAttribute("aria-label", `${info.short} ${V.GENE_LABELS[key]}: mean ${formatGene(key, finalValue)}, spread ${formatGene(key, spread || 0)}, from ${formatGene(key, initialValue)} to ${formatGene(key, finalValue)} over ${endGeneration} generations.`);
    }

    ctx.restore();
  }

  function drawAllTraitCards() {
    $$(".trait-card").forEach(drawTraitCard);
  }

  function drawLiveTrace() {
    if (!chartState.sim) return;
    const canvas = $("#liveTrace");
    const fit = fitCanvas(canvas);
    if (!fit) return;
    const { ctx, w, h } = fit;
    const history = chartState.sim.history;
    ctx.clearRect(0, 0, w, h);
    if (history.length < 2) return;
    const n = Math.max(1, history[history.length - 1].generation);
    let maxCount = 10;
    for (const entry of history) maxCount = Math.max(maxCount, entry.prey, entry.predators);
    const pad = { left: 2, right: 2, top: 5, bottom: 9 };
    const plotW = w - pad.left - pad.right;
    const plotH = h - pad.top - pad.bottom;
    const baseY = pad.top + plotH;
    const xFor = generation => pad.left + (generation / n) * plotW;
    const yCount = count => pad.top + plotH - (count / maxCount) * plotH;
    const yFlora = value => pad.top + plotH - (value / 100) * plotH;

    ctx.strokeStyle = "rgba(198, 216, 199, 0.06)";
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 3; i++) {
      const y = pad.top + (plotH / 2) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.moveTo(pad.left, baseY);
    for (const entry of history) ctx.lineTo(xFor(entry.generation), yFlora(entry.plants));
    ctx.lineTo(xFor(history[history.length - 1].generation), baseY);
    ctx.closePath();
    const gradient = ctx.createLinearGradient(0, pad.top, 0, baseY);
    gradient.addColorStop(0, "rgba(168, 231, 191, 0.12)");
    gradient.addColorStop(1, "rgba(168, 231, 191, 0.005)");
    ctx.fillStyle = gradient;
    ctx.fill();

    drawEventRules(ctx, chartState.sim.eventLog, xFor, pad.top, baseY, false);

    const series = [
      { key: "prey", color: COLORS.grazer },
      { key: "predators", color: COLORS.hunter }
    ];
    for (const item of series) {
      ctx.beginPath();
      history.forEach((entry, i) => {
        const x = xFor(entry.generation);
        const y = yCount(entry[item.key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = hexToRgba(item.color, 0.8);
      ctx.lineWidth = 0.9;
      ctx.lineJoin = "round";
      ctx.stroke();
      const last = history[history.length - 1];
      ctx.beginPath();
      ctx.arc(xFor(last.generation), yCount(last[item.key]), 1.4, 0, Math.PI * 2);
      ctx.fillStyle = item.color;
      ctx.fill();
    }

    ctx.fillStyle = "rgba(151, 166, 154, 0.4)";
    ctx.font = `500 5px ${MONO}`;
    ctx.textAlign = "left";
    ctx.fillText("0", pad.left, h - 1);
    ctx.textAlign = "right";
    ctx.fillText(`${n} G`, w - pad.right, h - 1);
  }

  function buildDossier(sim) {
    const eventLedger = $("#eventLedger");
    eventLedger.innerHTML = "";
    if (!sim.eventLog.length) {
      eventLedger.innerHTML = `<p class="empty-note">No disturbances were recorded.</p>`;
    } else {
      for (const event of sim.eventLog) {
        const meta = V.EVENT_META[event.type];
        const row = document.createElement("div");
        row.className = "event-ledger-row";
        row.style.setProperty("--event", meta.color);
        row.innerHTML = `
          <span class="event-ledger-icon">${meta.glyph}</span>
          <div class="event-ledger-copy"><b>${meta.title}</b><span>${meta.ephemeral} · ${event.detail || "recorded"}</span></div>
          <span class="event-ledger-gen">G.${padGen(event.generation)}</span>
        `;
        eventLedger.appendChild(row);
      }
    }

    const shifts = [];
    for (const species of ["prey", "predator"]) {
      for (const key of V.GENE_KEYS) {
        const values = sim.history
          .map(entry => entry.traits[species][key].mean)
          .filter(value => value != null);
        if (values.length < 2) continue;
        const initial = values[0];
        const final = values[values.length - 1];
        const span = V.GENE_RANGES[species][key][1] - V.GENE_RANGES[species][key][0];
        shifts.push({
          species,
          key,
          initial,
          final,
          delta: final - initial,
          normalized: (final - initial) / span * 100
        });
      }
    }
    shifts.sort((a, b) => Math.abs(b.normalized) - Math.abs(a.normalized));
    const traitShifts = $("#traitShifts");
    traitShifts.innerHTML = "";
    if (!shifts.length) {
      traitShifts.innerHTML = `<p class="empty-note">No inherited lineage survived long enough to measure.</p>`;
    }
    for (const shift of shifts.slice(0, 5)) {
      const info = SPECIES_INFO[shift.species];
      const row = document.createElement("div");
      row.className = "shift-row";
      row.style.setProperty("--shift", info.color);
      row.style.setProperty("--shift-mag", `${clamp(Math.abs(shift.normalized) * 4.5, 3, 100)}%`);
      row.title = `${V.GENE_LABELS[shift.key]}: ${formatSigned(shift.delta, shift.key === "threshold" ? 0 : 2)} ${V.GENE_UNITS[shift.key]}`;
      row.innerHTML = `
        <div>
          <div class="shift-copy"><span>${info.short} · ${V.GENE_LABELS[shift.key]}</span><span>${formatSigned(shift.normalized, 1)}% range</span></div>
          <div class="shift-bar"><i></i></div>
        </div>
      `;
      traitShifts.appendChild(row);
    }
    return shifts;
  }

  function makeVerdict(sim, shifts) {
    const history = sim.history;
    const last = history[history.length - 1];
    const firstPreyGone = history.find(entry => entry.prey === 0);
    const firstPredGone = history.find(entry => entry.predators === 0);
    const top = shifts[0];
    const count = sim.eventLog.length;
    const disturbances = `${count} ${count === 1 ? "disturbance" : "disturbances"}`;
    const drift = top
      ? `${SPECIES_INFO[top.species].short.toLowerCase()} ${V.GENE_LABELS[top.key].toLowerCase()} moved ${formatSigned(top.normalized, 1)}% of its viable range`
      : "the inherited traits barely moved";

    if (last.prey === 0 && last.predators === 0) {
      return `The chamber emptied. ${firstPreyGone ? `The last grazer was recorded at generation ${firstPreyGone.generation}.` : ""} What remained was a meadow restored in the absence of appetite, and a record of ${disturbances}.`;
    }
    if (last.predators === 0) {
      return `The hunters disappeared${firstPredGone ? ` at generation ${firstPredGone.generation}` : ""}; the meadow and its grazers continued without them. Measured across the whole run, ${drift}, through ${disturbances}.`;
    }
    if (last.prey === 0) {
      return `The grazers disappeared${firstPreyGone ? ` at generation ${firstPreyGone.generation}` : ""}. The hunters held on briefly, then followed the food chain down. ${disturbances} attended the unravelling.`;
    }
    return `Both appetites held to the close. ${drift.charAt(0).toUpperCase() + drift.slice(1)}, while the chamber absorbed ${disturbances} and closed with ${last.plants.toFixed(1)}% flora cover.`;
  }

  function renderDashboard(sim) {
    chartState.sim = sim;
    const history = sim.history;
    const last = history[history.length - 1];
    const seed = sim.seed;
    const dash = $("#dashboard");
    dash.dataset.seed = seed;
    $("#dashRun").textContent = `NV–${String(seed).padStart(4, "0")}`;
    $("#dashSeed").textContent = seed;
    $("#dashHorizon").textContent = `${last.generation} gen`;
    $("#dashMutation").textContent = `${(sim.mutation * 100).toFixed(1)}%`;
    $("#dashRegrowth").textContent = sim.plantRegrowth.toFixed(3);
    $("#dashGens").textContent = last.generation;
    $("#dashFinalPrey").textContent = formatCount(last.prey);
    $("#dashFinalPred").textContent = formatCount(last.predators);
    $("#dashEventCount").textContent = sim.eventLog.length;
    $("#dashBirths").textContent = formatCount(sim.totals.births);
    $("#dashSub").innerHTML = `A closed-system study of appetite, inheritance, and weather under seed <span class="accent">${seed}</span>. The chamber was left to choose its own survivors.`;
    const recorded = new Date();
    $("#dashRecorded").textContent = recorded.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
    $("#dashFootnote").textContent = `No organism was introduced after generation zero. ${formatCount(sim.totals.births)} births and ${formatCount(sim.totals.predated)} kills were recorded without intervention. Re-enter seed ${seed} with the same instruments to return to this exact edition.`;

    const shifts = buildDossier(sim);
    $("#dashVerdict").textContent = makeVerdict(sim, shifts);
    $("#populationChart").setAttribute("aria-label", `Population dynamics across ${last.generation} generations: final flora coverage ${last.plants.toFixed(1)} percent, ${last.prey} grazers and ${last.predators} hunters. Coloured markers show ${sim.eventLog.length} disturbances.`);
    $("#popReadout").textContent = `GEN ${padGen(last.generation)} · flora ${last.plants.toFixed(1)}% · ${last.prey} grazers · ${last.predators} hunters`;

    makeTraitCards();
    requestAnimationFrame(() => {
      drawPopulationChart();
      drawAllTraitCards();
    });
  }

  function bindChartHover() {
    const canvas = $("#populationChart");
    if (!canvas) return;
    const toGeneration = event => {
      if (!chartState.geom || !chartState.sim) return null;
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const geom = chartState.geom;
      const ratio = (x - geom.pad.left) / geom.plotW;
      if (ratio < -0.02 || ratio > 1.02) return null;
      return Math.round(clamp(ratio, 0, 1) * chartState.geom.n);
    };

    const update = event => {
      if (!$("#dashboard").classList.contains("is-open")) return;
      const generation = toGeneration(event);
      if (generation == null) {
        canvas.style.cursor = "default";
        return;
      }
      canvas.style.cursor = "crosshair";
      chartState.hoverGen = generation;
      drawPopulationChart();
      const entry = chartState.sim.history[generation] || chartState.sim.history[chartState.sim.history.length - 1];
      $("#popReadout").textContent = `GEN ${padGen(entry.generation)} · flora ${entry.plants.toFixed(1)}% · ${entry.prey} grazers · ${entry.predators} hunters`;
    };

    canvas.addEventListener("pointermove", update);
    canvas.addEventListener("pointerleave", () => {
      chartState.hoverGen = null;
      drawPopulationChart();
      if (chartState.sim) {
        const last = chartState.sim.history[chartState.sim.history.length - 1];
        $("#popReadout").textContent = `GEN ${padGen(last.generation)} · flora ${last.plants.toFixed(1)}% · ${last.prey} grazers · ${last.predators} hunters`;
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* interface                                                           */
  /* ------------------------------------------------------------------ */

  const els = {
    shell: $("#shell"),
    tableau: $(".tableau"),
    instruments: $("#instruments"),
    instrumentsToggle: $("#instrumentsToggle"),
    instrumentScroll: $("#instrumentScroll"),
    scrollCue: $("#scrollCue"),
    drawerClose: $("#drawerClose"),
    mobileScrim: $("#mobileScrim"),
    world: $("#world"),
    vitrine: $("#vitrine"),
    eventBanner: $("#eventBanner"),
    eventIcon: $("#eventIcon"),
    eventKicker: $("#eventKicker"),
    eventTitle: $("#eventTitle"),
    eventMeta: $("#eventMeta"),
    eventTint: $("#eventTint"),
    aureole: $("#aureole"),
    topPause: $("#topPause"),
    pauseGlyph: $("#pauseGlyph"),
    pauseLabel: $("#pauseLabel"),
    headerStateWrap: $("#headerStateWrap"),
    headerState: $("#headerState"),
    headerGen: $("#headerGen"),
    headerTarget: $("#headerTarget"),
    headerSeed: $("#headerSeed"),
    runCode: $("#runCode"),
    footerSeed: $("#footerSeed"),
    footerStatus: $("#footerStatus"),
    footerChip: $("#footerChip"),
    liveTag: $("#liveTag"),
    liveTagText: $("#liveTagText"),
    stageLive: $("#stageLive"),
    stageStatus: $("#stageStatus"),
    stageSignal: $("#stageSignal"),
    progressLabel: $("#progressLabel"),
    timelineFill: $("#timelineFill"),
    timelineHead: $("#timelineHead"),
    timelinePins: $("#timelinePins"),
    legendFlora: $("#legendFlora"),
    legendGrazer: $("#legendGrazer"),
    legendHunter: $("#legendHunter"),
    censusFlora: $("#censusFlora"),
    censusGrazer: $("#censusGrazer"),
    censusHunter: $("#censusHunter"),
    censusFloraBar: $("#censusFloraBar"),
    censusGrazerBar: $("#censusGrazerBar"),
    censusHunterBar: $("#censusHunterBar"),
    chronicleList: $("#chronicleList"),
    chronicleCount: $("#chronicleCount"),
    traceWindow: $("#traceWindow"),
    viewReportBtn: $("#viewReportBtn"),
    dial: $("#tempoDial"),
    dialArc: $("#dialArc"),
    dialNeedle: $("#dialNeedle"),
    dialTicks: $("#dialTicks"),
    tempoReadout: $("#tempoReadout"),
    tempoRate: $("#tempoRate"),
    mutationInput: $("#mutationInput"),
    mutationValue: $("#mutationValue"),
    regrowthInput: $("#regrowthInput"),
    regrowthValue: $("#regrowthValue"),
    seedInput: $("#seedInput"),
    seedReroll: $("#seedReroll"),
    generationsInput: $("#generationsInput"),
    droughtInput: $("#droughtInput"),
    droughtValue: $("#droughtValue"),
    droughtNext: $("#droughtNext"),
    plagueInput: $("#plagueInput"),
    plagueValue: $("#plagueValue"),
    plagueNext: $("#plagueNext"),
    surgeInput: $("#surgeInput"),
    surgeValue: $("#surgeValue"),
    surgeNext: $("#surgeNext"),
    trailsToggle: $("#trailsToggle"),
    gridToggle: $("#gridToggle"),
    restartBtn: $("#restartBtn"),
    newSeedBtn: $("#newSeedBtn"),
    schedDrought: $("#schedDrought"),
    schedPlague: $("#schedPlague"),
    schedSurge: $("#schedSurge"),
    dashboard: $("#dashboard"),
    dashClose: $("#dashClose"),
    dashReplay: $("#dashReplay"),
    dashNewSeed: $("#dashNewSeed"),
    dashInspect: $("#dashInspect"),
    dashPrint: $("#dashPrint"),
    dashTitle: $("#dashTitle"),
    tooltip: $("#tooltip")
  };

  const app = {
    sim: null,
    renderer: null,
    speed: 8,
    paused: false,
    finished: false,
    dashboardOpen: false,
    accumulator: 0,
    lastFrame: 0,
    lastUi: 0,
    lastSparks: 0,
    lastChronicleCount: -1,
    lastTimelineSignature: "",
    eventQueue: [],
    eventShowing: false,
    eventTimer: null,
    finishTimer: null,
    flashTimer: null,
    flashUntil: 0,
    eventEpoch: 0,
    seedCasts: 0,
    dialDragging: false,
    mobileQuery: window.matchMedia("(max-width: 880px)")
  };

  const PAUSE_ICON = `<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect x="2.4" y="1.6" width="2.4" height="8.8" rx=".5"/><rect x="7.2" y="1.6" width="2.4" height="8.8" rx=".5"/></svg>`;
  const PLAY_ICON = `<svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M3.4 1.8 10 6 3.4 10.2Z"/></svg>`;
  const REPORT_ICON = `<svg viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2 2.5h8M2 6h8M2 9.5h5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/></svg>`;

  function getConfigFromControls(seedOverride) {
    const currentSeed = app.sim ? app.sim.seed : els.seedInput.value;
    const seed = seedOverride != null ? String(seedOverride) : String(clamp(Math.round(Number(els.seedInput.value) || 0), 0, 999999));
    if (seedOverride == null) els.seedInput.value = seed;
    const mutationValue = Number.parseFloat(els.mutationInput.value);
    const regrowthValue = Number.parseFloat(els.regrowthInput.value);
    return {
      seed: seed || currentSeed || "1884",
      mutation: clamp(Number.isFinite(mutationValue) ? mutationValue / 100 : 0.08, 0, 0.24),
      plantRegrowth: clamp(Number.isFinite(regrowthValue) ? regrowthValue : 0.045, 0.001, 0.2),
      generations: clamp(Math.round(Number(els.generationsInput.value) || 240), 40, 800),
      intervals: {
        drought: clamp(Math.round(Number(els.droughtInput.value) || 0), 0, 240),
        plague: clamp(Math.round(Number(els.plagueInput.value) || 0), 0, 240),
        surge: clamp(Math.round(Number(els.surgeInput.value) || 0), 0, 240)
      }
    };
  }

  function setRangeVisual(input) {
    const min = Number(input.min);
    const max = Number(input.max);
    const value = Number(input.value);
    const ratio = max > min ? clamp((value - min) / (max - min), 0, 1) : 0;
    const shell = input.closest(".range-shell");
    if (shell) {
      shell.style.setProperty("--fill", `${(ratio * 100).toFixed(3)}%`);
      shell.style.setProperty("--value", String(value));
    }
  }

  function syncAllRanges() {
    $$(".range-input").forEach(setRangeVisual);
  }

  function updateInstrumentScrollCue() {
    if (!els.instrumentScroll) return;
    const overflow = els.instrumentScroll.scrollHeight - els.instrumentScroll.clientHeight > 2;
    const atBottom = els.instrumentScroll.scrollTop + els.instrumentScroll.clientHeight >= els.instrumentScroll.scrollHeight - 3;
    els.instruments.classList.toggle("is-scrollable", overflow && !atBottom);
  }

  function updateMutationOutput() {
    const value = parseFloat(els.mutationInput.value) || 0;
    els.mutationValue.innerHTML = `${value.toFixed(1)}<small>%</small>`;
    els.mutationInput.setAttribute("aria-valuetext", `${value.toFixed(1)} percent`);
    setRangeVisual(els.mutationInput);
  }

  function updateRegrowthOutput() {
    const value = parseFloat(els.regrowthInput.value) || 0;
    els.regrowthValue.innerHTML = `${value.toFixed(3)}<small>/cell</small>`;
    els.regrowthInput.setAttribute("aria-valuetext", `${value.toFixed(3)} biomass per cell per generation`);
    setRangeVisual(els.regrowthInput);
  }

  function updateIntervalOutputs() {
    const map = [
      { type: "drought", input: els.droughtInput, output: els.droughtValue },
      { type: "plague", input: els.plagueInput, output: els.plagueValue },
      { type: "surge", input: els.surgeInput, output: els.surgeValue }
    ];
    for (const item of map) {
      const value = Number(item.input.value) || 0;
      item.output.innerHTML = value > 0 ? `${value}<small>g</small>` : `off<small>g</small>`;
      item.input.setAttribute("aria-valuetext", value > 0 ? `Every ${value} generations` : "Dormant");
      setRangeVisual(item.input);
    }
  }

  function initDialTicks() {
    if (!els.dialTicks) return;
    const center = 59;
    for (let i = 0; i <= 24; i++) {
      const ratio = i / 24;
      const angle = (-135 + ratio * 270) * Math.PI / 180;
      const major = i % 4 === 0;
      const r1 = major ? 42 : 44.6;
      const r2 = 47.1;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", String(center + Math.sin(angle) * r1));
      line.setAttribute("y1", String(center - Math.cos(angle) * r1));
      line.setAttribute("x2", String(center + Math.sin(angle) * r2));
      line.setAttribute("y2", String(center - Math.cos(angle) * r2));
      line.setAttribute("stroke", major ? "rgba(232,224,205,.48)" : "rgba(221,213,192,.21)");
      line.setAttribute("stroke-width", major ? ".85" : ".5");
      els.dialTicks.appendChild(line);
    }
  }

  function syncDialUI() {
    const min = 1;
    const max = 32;
    const ratio = (app.speed - min) / (max - min);
    const arc = els.dialArc;
    if (arc) arc.setAttribute("stroke-dasharray", `${(75 * ratio).toFixed(2)} 100`);
    if (els.dialNeedle) {
      const angle = -135 + ratio * 270;
      els.dialNeedle.setAttribute("transform", `rotate(${angle.toFixed(2)} 59 59)`);
    }
    if (els.tempoReadout) els.tempoReadout.textContent = String(app.speed).padStart(2, "0");
    if (els.tempoRate) els.tempoRate.textContent = (app.speed * 1.45).toFixed(1);
    if (els.dial) {
      els.dial.setAttribute("aria-valuenow", String(app.speed));
      els.dial.setAttribute("aria-valuetext", `${app.speed} times, ${(app.speed * 1.45).toFixed(1)} generations per second`);
    }
  }

  function setSpeed(next, announce = false) {
    app.speed = clamp(Math.round(next), 1, 32);
    syncDialUI();
    drawAllSparks();
    if (announce) flashStatus(`Tempo ${app.speed}× · ${(app.speed * 1.45).toFixed(1)} generations / second`);
  }

  function speedFromPointer(event) {
    const rect = els.dial.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = event.clientX - cx;
    const dy = event.clientY - cy;
    let deg = Math.atan2(dy, dx) * 180 / Math.PI;
    deg = (deg + 360) % 360;
    let ratio;
    if (deg >= 135) ratio = (deg - 135) / 270;
    else if (deg <= 45) ratio = (deg + 360 - 135) / 270;
    else ratio = deg < 90 ? 1 : 0;
    return 1 + clamp(ratio, 0, 1) * 31;
  }

  function bindDial() {
    if (!els.dial) return;
    const updateFromEvent = event => {
      setSpeed(speedFromPointer(event));
    };
    els.dial.addEventListener("pointerdown", event => {
      event.preventDefault();
      app.dialDragging = true;
      els.dial.setPointerCapture(event.pointerId);
      updateFromEvent(event);
    });
    els.dial.addEventListener("pointermove", event => {
      if (!app.dialDragging) return;
      updateFromEvent(event);
    });
    const release = event => {
      if (!app.dialDragging) return;
      app.dialDragging = false;
      if (els.dial.hasPointerCapture(event.pointerId)) els.dial.releasePointerCapture(event.pointerId);
      flashStatus(`Tempo ${app.speed}× · ${(app.speed * 1.45).toFixed(1)} generations / second`);
    };
    els.dial.addEventListener("pointerup", release);
    els.dial.addEventListener("pointercancel", release);
    els.dial.addEventListener("wheel", event => {
      event.preventDefault();
      setSpeed(app.speed + (event.deltaY > 0 ? -1 : 1), true);
    }, { passive: false });
    els.dial.addEventListener("keydown", event => {
      const key = event.key;
      let next = app.speed;
      if (key === "ArrowUp" || key === "ArrowRight") next += 1;
      else if (key === "ArrowDown" || key === "ArrowLeft") next -= 1;
      else if (key === "PageUp") next += 4;
      else if (key === "PageDown") next -= 4;
      else if (key === "Home") next = 1;
      else if (key === "End") next = 32;
      else return;
      event.preventDefault();
      setSpeed(next, true);
    });
  }

  function drawAllSparks() {
    if (!app.sim) return;
    const progress = clamp(app.sim.generation / Math.max(1, app.sim.target), 0, 1);
    $$(".spark").forEach(canvas => {
      const kind = canvas.dataset.spark;
      let value = 0;
      if (kind === "tempo") value = app.speed;
      else if (kind === "mutation") value = parseFloat(els.mutationInput.value) || 0;
      else if (kind === "regrowth") value = parseFloat(els.regrowthInput.value) || 0;
      else if (kind === "seed") value = Number(els.seedInput.value) || 0;
      else if (kind === "generations") value = Number(els.generationsInput.value) || 240;
      else if (kind === "drought") value = Number(els.droughtInput.value) || 0;
      else if (kind === "plague") value = Number(els.plagueInput.value) || 0;
      else if (kind === "surge") value = Number(els.surgeInput.value) || 0;
      drawSpark(canvas, kind, value, {
        seed: Number(app.sim.seed) || 1884,
        target: Number(els.generationsInput.value) || app.sim.target,
        progress
      });
    });
  }

  function flashStatus(message, milliseconds = 1900) {
    if (!els.footerStatus) return;
    els.footerStatus.textContent = message;
    app.flashUntil = Date.now() + milliseconds;
    clearTimeout(app.flashTimer);
    app.flashTimer = setTimeout(() => {
      app.flashUntil = 0;
      updateRunChrome();
      updateLiveUI();
    }, milliseconds);
  }

  function setEventVariables(meta) {
    els.vitrine.style.setProperty("--event-color", meta.color);
    els.vitrine.style.setProperty("--event-wash", meta.wash);
  }

  function hideBannerImmediately() {
    clearTimeout(app.eventTimer);
    app.eventTimer = null;
    app.eventShowing = false;
    els.eventBanner.classList.remove("is-visible");
    els.eventBanner.setAttribute("aria-hidden", "true");
    els.vitrine.classList.remove("is-event");
  }

  function showNextEvent() {
    if (app.finished || app.dashboardOpen) return;
    if (!app.eventQueue.length) {
      app.eventShowing = false;
      return;
    }
    const meta = V.EVENT_META[app.eventQueue[0].type] || V.EVENT_META.drought;
    const event = app.eventQueue.shift();
    app.eventShowing = true;
    const epoch = app.eventEpoch;
    setEventVariables(meta);
    els.eventIcon.textContent = meta.glyph;
    els.eventKicker.textContent = `${meta.kicker} · g.${padGen(event.generation)}`;
    els.eventTitle.textContent = meta.title;
    const recovery = event.type === "drought" ? "regrowth muted 09g" : event.type === "plague" ? "spores active" : "sediment settled";
    els.eventMeta.innerHTML = `${event.detail}<br>${recovery}`;
    els.vitrine.classList.remove("is-event");
    // force the aureole animation to restart for sequential disturbances
    void els.vitrine.offsetWidth;
    els.vitrine.classList.add("is-event");
    els.eventBanner.setAttribute("aria-hidden", "false");
    els.eventBanner.classList.add("is-visible");

    clearTimeout(app.eventTimer);
    app.eventTimer = setTimeout(() => {
      if (epoch !== app.eventEpoch) return;
      els.eventBanner.classList.remove("is-visible");
      els.eventBanner.setAttribute("aria-hidden", "true");
      app.eventTimer = setTimeout(() => {
        if (epoch !== app.eventEpoch) return;
        els.vitrine.classList.remove("is-event");
        app.eventTimer = setTimeout(() => {
          if (epoch !== app.eventEpoch) return;
          app.eventShowing = false;
          showNextEvent();
        }, 220);
      }, 420);
    }, 2450);
  }

  function queueEvents(events) {
    if (!events || !events.length || app.dashboardOpen) return;
    app.eventQueue.push(...events);
    if (!app.eventShowing) showNextEvent();
    app.lastTimelineSignature = "";
    app.lastChronicleCount = -1;
    updateLiveUI(true);
  }

  function showCompletionBanner() {
    clearTimeout(app.eventTimer);
    app.eventQueue = [];
    app.eventShowing = false;
    const meta = {
      color: COLORS.brass,
      wash: "radial-gradient(ellipse at center, rgba(185,155,104,.18), transparent 66%)"
    };
    setEventVariables(meta);
    const last = app.sim.latest;
    els.eventIcon.textContent = "◌";
    els.eventKicker.textContent = `Observation complete · ${app.sim.generation} generations`;
    els.eventTitle.textContent = "The chamber is sealed.";
    els.eventMeta.innerHTML = `flora <b>${last.plants.toFixed(1)}%</b><br>${last.prey} grazers · ${last.predators} hunters`;
    els.vitrine.classList.remove("is-event");
    void els.vitrine.offsetWidth;
    els.vitrine.classList.add("is-event");
    els.eventBanner.setAttribute("aria-hidden", "false");
    els.eventBanner.classList.add("is-visible");
    const epoch = app.eventEpoch;
    app.eventTimer = setTimeout(() => {
      if (epoch !== app.eventEpoch) return;
      els.eventBanner.classList.remove("is-visible");
      els.eventBanner.setAttribute("aria-hidden", "true");
      setTimeout(() => {
        if (epoch === app.eventEpoch) els.vitrine.classList.remove("is-event");
      }, 500);
    }, 2200);
  }

  function updatePauseChrome() {
    if (app.finished) {
      els.pauseGlyph.innerHTML = REPORT_ICON;
      els.pauseLabel.textContent = "Report";
      els.topPause.setAttribute("aria-label", "Open run report");
      els.topPause.title = "Open run report";
      els.topPause.classList.add("is-finished");
    } else if (app.paused) {
      els.pauseGlyph.innerHTML = PLAY_ICON;
      els.pauseLabel.textContent = "Resume";
      els.topPause.setAttribute("aria-label", "Resume observation");
      els.topPause.title = "Resume observation";
      els.topPause.classList.remove("is-finished");
    } else {
      els.pauseGlyph.innerHTML = PAUSE_ICON;
      els.pauseLabel.textContent = "Pause";
      els.topPause.setAttribute("aria-label", "Pause observation");
      els.topPause.title = "Pause observation";
      els.topPause.classList.remove("is-finished");
    }
  }

  function updateRunChrome() {
    if (!app.sim) return;
    updatePauseChrome();
    const running = !app.finished && !app.paused;
    const stateLabel = app.finished ? "Observation closed" : app.paused ? "Observation held" : "Under observation";
    els.headerState.textContent = stateLabel;
    els.headerStateWrap.classList.toggle("is-paused", app.paused || app.finished);
    els.stageStatus.textContent = app.finished ? "Observation closed" : app.paused ? "Held in amber" : "Live culture";
    els.stageSignal.classList.toggle("is-paused", app.paused || app.finished);
    els.stageLive.classList.toggle("is-finished", app.finished);
    if (els.liveTag) {
      els.liveTag.classList.toggle("is-held", app.paused || app.finished);
      els.liveTagText.textContent = app.finished ? "Ended" : app.paused ? "Held" : "Rec.";
    }
    els.footerChip.textContent = app.finished ? "Closed" : app.paused ? "Held" : "Auto-run";
    if (Date.now() >= app.flashUntil) {
      els.footerStatus.textContent = app.finished
        ? "Observation closed · monograph ready"
        : app.paused
          ? `Held at generation ${app.sim.generation}`
          : "Generations accruing · deterministic";
    }
    els.viewReportBtn.classList.toggle("is-visible", app.finished);
    els.traceWindow.textContent = `${app.sim.target} g window`;
  }

  function updateCensus() {
    const latest = app.sim.latest;
    if (!latest) return;
    const flora = Math.round(latest.plants);
    els.legendFlora.textContent = `${flora}%`;
    els.legendGrazer.textContent = formatCount(latest.prey);
    els.legendHunter.textContent = formatCount(latest.predators);
    els.censusFlora.textContent = String(flora);
    els.censusGrazer.textContent = formatCount(latest.prey);
    els.censusHunter.textContent = formatCount(latest.predators);
    els.censusFloraBar.style.width = `${clamp(latest.plants, 0, 100)}%`;
    els.censusGrazerBar.style.width = `${clamp(latest.prey / V.MAX_PREY * 100, 0, 100)}%`;
    els.censusHunterBar.style.width = `${clamp(latest.predators / V.MAX_PREDATORS * 100, 0, 100)}%`;
  }

  function updateScheduleUI() {
    if (!app.sim) return;
    const gen = app.sim.generation;
    const target = app.sim.target;
    const map = [
      { type: "drought", row: els.droughtNext, sched: els.schedDrought },
      { type: "plague", row: els.plagueNext, sched: els.schedPlague },
      { type: "surge", row: els.surgeNext, sched: els.schedSurge }
    ];
    for (const item of map) {
      const interval = app.sim.intervals[item.type];
      const next = app.sim.nextEvent[item.type];
      if (interval <= 0 || !Number.isFinite(next)) {
        item.row.innerHTML = `<b>off</b> dormant`;
        item.sched.innerHTML = `<b>—</b> dormant`;
      } else {
        const remaining = Math.max(0, Math.ceil(next - gen));
        const beyond = next > target;
        item.row.innerHTML = `next <b>${remaining}</b>g`;
        item.sched.innerHTML = beyond ? `<b>after</b> horizon` : `<b>${remaining}</b> remaining`;
      }
    }
  }

  function updateTimelineMarkers() {
    if (!app.sim) return;
    const sim = app.sim;
    const target = Math.max(1, sim.target);
    const markers = [];
    const seen = new Set();
    for (const event of sim.eventLog) {
      const key = `${event.type}-${event.generation}`;
      if (seen.has(key)) continue;
      seen.add(key);
      markers.push({ type: event.type, generation: event.generation, past: true });
    }
    for (const type of EVENT_ORDER) {
      const interval = sim.intervals[type];
      let next = sim.nextEvent[type];
      if (!interval || !Number.isFinite(next)) continue;
      let guard = 0;
      while (next <= target && guard < 4) {
        const key = `${type}-${next}`;
        if (!seen.has(key)) {
          seen.add(key);
          markers.push({ type, generation: next, past: next <= sim.generation });
        }
        next += interval;
        guard++;
      }
    }
    markers.sort((a, b) => a.generation - b.generation);
    const signature = markers.map(marker => `${marker.type}${marker.generation}${marker.past}`).join("|") + `@${target}`;
    if (signature !== app.lastTimelineSignature) {
      app.lastTimelineSignature = signature;
      els.timelinePins.innerHTML = "";
      for (const marker of markers) {
        const meta = V.EVENT_META[marker.type];
        const pin = document.createElement("span");
        pin.className = `timeline-pin ${marker.past ? "past" : "upcoming"}`;
        pin.style.left = `${clamp(marker.generation / target * 100, 0, 100)}%`;
        pin.style.setProperty("--pin-color", meta.color);
        pin.title = `${meta.label} · generation ${marker.generation}`;
        els.timelinePins.appendChild(pin);
      }
    }
  }

  function updateChronicle(force = false) {
    if (!app.sim) return;
    if (!force && app.sim.eventLog.length === app.lastChronicleCount) return;
    app.lastChronicleCount = app.sim.eventLog.length;
    els.chronicleCount.textContent = `${String(app.sim.eventLog.length).padStart(2, "0")} events`;
    if (!app.sim.eventLog.length) {
      els.chronicleList.innerHTML = `<p class="empty-note">The chamber is quiet.</p>`;
      return;
    }
    els.chronicleList.innerHTML = "";
    const events = app.sim.eventLog.slice().reverse().slice(0, 8);
    for (const event of events) {
      const meta = V.EVENT_META[event.type];
      const entry = document.createElement("div");
      entry.className = "chronicle-entry";
      entry.style.setProperty("--event", meta.color);
      entry.innerHTML = `
        <span class="entry-mark"></span>
        <span class="entry-text"><b>${meta.label}</b> · ${meta.ephemeral}</span>
        <span class="entry-gen">g.${padGen(event.generation)}</span>
      `;
      els.chronicleList.appendChild(entry);
    }
  }

  function updateLiveUI(force = false) {
    if (!app.sim) return;
    const sim = app.sim;
    const latest = sim.latest;
    if (!latest) return;
    els.headerGen.textContent = padGen(sim.generation);
    els.headerTarget.textContent = String(sim.target);
    els.progressLabel.textContent = `GEN ${padGen(sim.generation)} / ${sim.target}`;
    const progress = clamp(sim.generation / Math.max(1, sim.target), 0, 1) * 100;
    els.timelineFill.style.width = `${progress}%`;
    els.timelineHead.style.left = `${progress}%`;
    updateCensus();
    updateScheduleUI();
    updateTimelineMarkers();
    updateChronicle(force);
    if (force || Date.now() - app.lastUi > 180) {
      drawLiveTrace();
    }
    updateRunChrome();
    els.world.setAttribute("aria-label", `Live vivarium at generation ${sim.generation}: ${latest.plants.toFixed(0)} percent flora cover, ${latest.prey} grazers, ${latest.predators} hunters.`);
  }

  function handleControlStatus() {
    if (app.paused) return;
    app.lastSparks = 0;
  }

  function setTargetFromInput(announce = false) {
    if (!app.sim) return;
    let value = Math.round(Number(els.generationsInput.value) || 240);
    value = clamp(value, 40, 800);
    els.generationsInput.value = String(value);
    app.sim.updateConfig({ generations: value });
    if (!app.finished && app.sim.generation >= value) {
      finishRun();
    } else if (app.finished && value > app.sim.generation) {
      app.finished = false;
      app.paused = false;
      app.lastFrame = performance.now();
      app.accumulator = 0;
      els.viewReportBtn.classList.remove("is-visible");
      hideBannerImmediately();
    }
    if (announce) flashStatus(`Horizon set to ${value} generations`);
    updateLiveUI(true);
    drawAllSparks();
  }

  function finishRun() {
    if (!app.sim || app.finished) return;
    app.finished = true;
    app.paused = false;
    updatePauseChrome();
    updateRunChrome();
    updateLiveUI(true);
    app.lastTimelineSignature = "";
    showCompletionBanner();
    clearTimeout(app.finishTimer);
    app.finishTimer = setTimeout(() => {
      if (app.finished && !app.dashboardOpen) openDashboard();
    }, 1550);
  }

  function togglePause() {
    if (!app.sim) return;
    if (app.finished) {
      openDashboard();
      return;
    }
    app.paused = !app.paused;
    app.accumulator = 0;
    app.lastFrame = performance.now();
    updateRunChrome();
    updateLiveUI(true);
    flashStatus(app.paused ? `Observation held at generation ${app.sim.generation}` : "Observation resumed", 1400);
  }

  function openDashboard() {
    if (!app.sim || !app.finished || app.dashboardOpen) return;
    if (app.mobileQuery.matches) closeMobileDrawer();
    clearTimeout(app.finishTimer);
    app.dashboardOpen = true;
    chartState.hoverGen = null;
    renderDashboard(app.sim);
    els.dashboard.inert = false;
    els.dashboard.scrollTop = 0;
    els.dashboard.classList.add("is-open");
    els.dashboard.setAttribute("aria-hidden", "false");
    els.shell.inert = true;
    hideBannerImmediately();
    const focusReport = () => {
      if (!app.dashboardOpen) return;
      els.dashClose.focus({ preventScroll: true });
      if (!els.dashboard.contains(document.activeElement)) {
        els.dashboard.setAttribute("tabindex", "-1");
        els.dashboard.focus({ preventScroll: true });
      }
    };
    setTimeout(() => {
      focusReport();
      drawPopulationChart();
      drawAllTraitCards();
    }, 120);
    setTimeout(() => {
      focusReport();
      drawPopulationChart();
      drawAllTraitCards();
    }, 760);
  }

  function closeDashboard(restoreFocus = true) {
    if (!app.dashboardOpen) return;
    app.dashboardOpen = false;
    els.dashboard.classList.remove("is-open");
    els.dashboard.setAttribute("aria-hidden", "true");
    els.dashboard.inert = true;
    els.shell.inert = false;
    chartState.hoverGen = null;
    app.lastUi = 0;
    app.lastSparks = 0;
    if (restoreFocus) {
      const target = app.finished && els.viewReportBtn.classList.contains("is-visible") ? els.viewReportBtn : els.topPause;
      setTimeout(() => target.focus({ preventScroll: true }), 60);
    }
  }

  function resetRun(options = {}) {
    app.eventEpoch++;
    clearTimeout(app.eventTimer);
    clearTimeout(app.finishTimer);
    if (app.dashboardOpen) closeDashboard(false);
    hideBannerImmediately();
    app.eventQueue = [];
    app.eventShowing = false;
    app.eventEpoch++;

    if (options.seed != null) {
      els.seedInput.value = String(options.seed);
    }
    const config = getConfigFromControls(options.seed);
    app.sim = new V.Simulation({
      seed: config.seed,
      mutation: config.mutation,
      plantRegrowth: config.plantRegrowth,
      generations: config.generations,
      intervals: config.intervals
    });
    chartState.sim = app.sim;
    chartState.hoverGen = null;
    if (!app.renderer) {
      app.renderer = new VivariumRenderer(els.world, app.sim);
    } else {
      app.renderer.setSimulation(app.sim);
    }
    app.renderer.trails = els.trailsToggle.checked;
    app.renderer.grid = els.gridToggle.checked;
    app.paused = false;
    app.finished = false;
    app.accumulator = 0;
    app.lastFrame = performance.now();
    app.lastUi = 0;
    app.lastSparks = 0;
    app.lastChronicleCount = -1;
    app.lastTimelineSignature = "";
    els.headerSeed.textContent = config.seed;
    els.footerSeed.textContent = config.seed;
    els.runCode.textContent = `NV–${String(config.seed).padStart(4, "0")}`;
    els.dashboard.setAttribute("aria-hidden", "true");
    updateRunChrome();
    updateAllOutputs();
    updateLiveUI(true);
    drawAllSparks();
    drawLiveTrace();
    if (options.announce) flashStatus(options.announce, 1800);
    requestAnimationFrame(() => {
      drawPopulationChart();
      if (app.dashboardOpen) drawAllTraitCards();
    });
  }

  function updateAllOutputs() {
    updateMutationOutput();
    updateRegrowthOutput();
    updateIntervalOutputs();
    syncAllRanges();
  }

  function newSpecimen() {
    const current = app.sim ? app.sim.seed : els.seedInput.value;
    app.seedCasts = (app.seedCasts + 1) % 100000;
    let next = castNextSeed(current, app.seedCasts);
    if (String(next) === String(current)) next = next === 9999 ? 1000 : next + 1;
    resetRun({ seed: next, announce: `New specimen cast · seed ${next}` });
  }

  function restartCurrent() {
    if (!app.sim) return;
    const seed = app.sim.seed;
    flashStatus(`Restarting seed ${seed}`, 1100);
    resetRun({ seed });
    app.seedCasts = 0;
  }

  function closeMobileDrawer() {
    const hadFocus = els.instruments.contains(document.activeElement);
    els.instruments.classList.remove("is-open");
    els.mobileScrim.classList.remove("is-open");
    els.instrumentsToggle.setAttribute("aria-expanded", "false");
    els.instruments.inert = true;
    if (hadFocus && !app.dashboardOpen) {
      setTimeout(() => els.instrumentsToggle.focus({ preventScroll: true }), 30);
    }
  }

  function openMobileDrawer() {
    els.instruments.classList.add("is-open");
    els.mobileScrim.classList.add("is-open");
    els.instrumentsToggle.setAttribute("aria-expanded", "true");
    els.instruments.inert = false;
    drawAllSparks();
    requestAnimationFrame(updateInstrumentScrollCue);
  }

  function toggleInstruments() {
    if (app.mobileQuery.matches) {
      if (els.instruments.classList.contains("is-open")) closeMobileDrawer();
      else openMobileDrawer();
      return;
    }
    const collapsed = els.tableau.classList.toggle("instruments-collapsed");
    els.instruments.inert = collapsed;
    els.instrumentsToggle.setAttribute("aria-expanded", collapsed ? "false" : "true");
    if (!collapsed) {
      drawAllSparks();
      requestAnimationFrame(updateInstrumentScrollCue);
    } else {
      els.instrumentsToggle.focus({ preventScroll: true });
    }
  }

  function handleBreakpointChange() {
    if (app.mobileQuery.matches) {
      els.tableau.classList.remove("instruments-collapsed");
      els.instruments.inert = !els.instruments.classList.contains("is-open");
      els.instrumentsToggle.setAttribute("aria-expanded", els.instruments.classList.contains("is-open") ? "true" : "false");
    } else {
      els.instruments.classList.remove("is-open");
      els.mobileScrim.classList.remove("is-open");
      els.instruments.inert = els.tableau.classList.contains("instruments-collapsed");
      els.instrumentsToggle.setAttribute("aria-expanded", els.tableau.classList.contains("instruments-collapsed") ? "false" : "true");
      drawAllSparks();
    }
  }

  function initTooltips() {
    let active = null;
    const show = target => {
      const text = target.dataset.tip;
      if (!text) return;
      active = target;
      els.tooltip.textContent = text;
      els.tooltip.classList.add("is-visible");
      els.tooltip.setAttribute("aria-hidden", "false");
      const rect = target.getBoundingClientRect();
      const tooltipRect = els.tooltip.getBoundingClientRect();
      const left = clamp(rect.left + rect.width / 2 - tooltipRect.width / 2, 10, window.innerWidth - tooltipRect.width - 10);
      let top = rect.bottom + 9;
      if (top + tooltipRect.height > window.innerHeight - 10) top = rect.top - tooltipRect.height - 9;
      els.tooltip.style.left = `${left}px`;
      els.tooltip.style.top = `${top}px`;
    };
    const hide = () => {
      active = null;
      els.tooltip.classList.remove("is-visible");
      els.tooltip.setAttribute("aria-hidden", "true");
    };
    $$("[data-tip]").forEach(trigger => {
      trigger.addEventListener("pointerenter", () => show(trigger));
      trigger.addEventListener("pointerleave", () => {
        if (document.activeElement !== trigger) hide();
      });
      trigger.addEventListener("focus", () => show(trigger));
      trigger.addEventListener("blur", hide);
      trigger.addEventListener("click", event => {
        if (trigger.classList.contains("hint-dot")) event.preventDefault();
        if (trigger.dataset.tip) show(trigger);
      });
    });
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    document.addEventListener("keydown", event => {
      if (event.key === "Escape" && active) hide();
    });
  }

  function bindControls() {
    els.mutationInput.addEventListener("input", () => {
      const value = parseFloat(els.mutationInput.value) || 0;
      updateMutationOutput();
      app.sim.updateConfig({ mutation: value / 100 });
      drawAllSparks();
      flashStatus(`Mutation ${value.toFixed(1)}% · applied to the next birth`);
    });
    els.regrowthInput.addEventListener("input", () => {
      const value = parseFloat(els.regrowthInput.value) || 0;
      updateRegrowthOutput();
      app.sim.updateConfig({ plantRegrowth: value });
      drawAllSparks();
      flashStatus(`Regrowth ${value.toFixed(3)} biomass / cell / generation`);
    });

    const intervalMap = [
      ["drought", els.droughtInput],
      ["plague", els.plagueInput],
      ["surge", els.surgeInput]
    ];
    for (const [type, input] of intervalMap) {
      input.addEventListener("input", () => {
        const value = Number(input.value) || 0;
        app.sim.updateConfig({ intervals: { [type]: value } });
        updateIntervalOutputs();
        updateScheduleUI();
        app.lastTimelineSignature = "";
        updateTimelineMarkers();
        drawAllSparks();
        flashStatus(value > 0 ? `${type[0].toUpperCase() + type.slice(1)} interval · every ${value} generations` : `${type[0].toUpperCase() + type.slice(1)} dormant`);
      });
    }

    $$(".range-input").forEach(input => {
      input.addEventListener("focus", () => input.closest(".range-shell")?.classList.add("is-focused"));
      input.addEventListener("blur", () => input.closest(".range-shell")?.classList.remove("is-focused"));
    });

    els.generationsInput.addEventListener("input", () => {
      const value = Number(els.generationsInput.value);
      if (!Number.isFinite(value) || value < 40 || value > 800) return;
      setTargetFromInput(false);
      updateRunChrome();
    });
    els.generationsInput.addEventListener("change", () => {
      setTargetFromInput(true);
    });
    els.generationsInput.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        els.generationsInput.blur();
      }
    });
    $$("[data-step-target]").forEach(button => {
      button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.stepTarget);
        if (!input) return;
        const step = Number(button.dataset.step || 0);
        const min = Number(input.min);
        const max = Number(input.max);
        input.value = String(clamp((Number(input.value) || 0) + step, min, max));
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        drawAllSparks();
      });
    });

    els.seedInput.addEventListener("input", () => {
      drawAllSparks();
      if (app.sim && String(Number(els.seedInput.value)) !== String(app.sim.seed)) {
        flashStatus("New seed pending · press Enter to reseed", 1600);
      }
    });
    els.seedInput.addEventListener("change", () => {
      const previous = app.sim ? app.sim.seed : null;
      const value = clamp(Math.round(Number(els.seedInput.value) || 0), 0, 999999);
      els.seedInput.value = String(value);
      if (previous != null && String(previous) === String(value)) {
        flashStatus(`Seed ${value} already in the chamber`);
        return;
      }
      app.seedCasts = 0;
      resetRun({ seed: value, announce: `Seed ${value} · habitat re-seeded` });
    });
    els.seedInput.addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        els.seedInput.blur();
      }
    });
    els.seedReroll.addEventListener("click", () => {
      app.seedCasts = (app.seedCasts + 1) % 100000;
      let current = app.sim ? app.sim.seed : els.seedInput.value;
      let next = castNextSeed(current, app.seedCasts);
      if (String(next) === String(current)) next = next === 9999 ? 1000 : next + 1;
      els.seedInput.value = String(next);
      resetRun({ seed: next, announce: `Seed cast · ${next}` });
    });

    els.trailsToggle.addEventListener("change", () => {
      app.renderer.trails = els.trailsToggle.checked;
      flashStatus(els.trailsToggle.checked ? "Ghost trails visible" : "Ghost trails withheld", 1200);
    });
    els.gridToggle.addEventListener("change", () => {
      app.renderer.grid = els.gridToggle.checked;
      flashStatus(els.gridToggle.checked ? "Field lattice visible" : "Field lattice withheld", 1200);
    });

    els.topPause.addEventListener("click", togglePause);
    els.restartBtn.addEventListener("click", restartCurrent);
    els.newSeedBtn.addEventListener("click", newSpecimen);
    els.viewReportBtn.addEventListener("click", openDashboard);
    els.instrumentsToggle.addEventListener("click", toggleInstruments);
    els.instrumentScroll.addEventListener("scroll", updateInstrumentScrollCue, { passive: true });
    els.drawerClose.addEventListener("click", closeMobileDrawer);
    els.mobileScrim.addEventListener("click", closeMobileDrawer);

    els.dashClose.addEventListener("click", () => closeDashboard(true));
    els.dashInspect.addEventListener("click", () => closeDashboard(true));
    els.dashReplay.addEventListener("click", () => {
      const seed = app.sim.seed;
      closeDashboard(false);
      resetRun({ seed, announce: `Replaying seed ${seed}` });
      requestAnimationFrame(() => els.topPause.focus({ preventScroll: true }));
    });
    els.dashNewSeed.addEventListener("click", () => {
      closeDashboard(false);
      newSpecimen();
      requestAnimationFrame(() => els.topPause.focus({ preventScroll: true }));
    });
    els.dashPrint.addEventListener("click", () => window.print());

    els.world.addEventListener("pointermove", event => {
      const rect = els.world.getBoundingClientRect();
      app.renderer.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    });
    els.world.addEventListener("pointerleave", () => {
      app.renderer.pointer = null;
    });

    document.addEventListener("keydown", event => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        if (app.dashboardOpen) {
          closeDashboard(true);
          return;
        }
        if (app.mobileQuery.matches && els.instruments.classList.contains("is-open")) {
          closeMobileDrawer();
          return;
        }
      }
      const target = event.target;
      const isTyping = target.closest("input, textarea, select, button, a, [contenteditable='true'], [role='slider']");
      if (isTyping || app.dashboardOpen) return;
      if (event.code === "Space") {
        event.preventDefault();
        togglePause();
      } else if (event.key.toLowerCase() === "r" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        restartCurrent();
      }
    });

    app.mobileQuery.addEventListener("change", handleBreakpointChange);
    window.addEventListener("resize", () => {
      clearTimeout(app.resizeTimer);
      app.resizeTimer = setTimeout(() => {
        drawAllSparks();
        drawLiveTrace();
        updateInstrumentScrollCue();
        if (app.dashboardOpen) {
          drawPopulationChart();
          drawAllTraitCards();
        }
      }, 120);
    });
  }

  function frame(now) {
    if (!app.lastFrame) app.lastFrame = now;
    const delta = Math.min(110, now - app.lastFrame);
    app.lastFrame = now;

    if (app.sim && !app.paused && !app.finished) {
      const stepDuration = 1000 / (1.45 * app.speed);
      app.accumulator += delta;
      let steps = 0;
      while (app.accumulator >= stepDuration && steps < 7 && !app.finished) {
        const events = app.sim.step();
        app.accumulator -= stepDuration;
        steps++;
        if (events.length) queueEvents(events);
        if (app.sim.generation >= app.sim.target) {
          finishRun();
          break;
        }
      }
      if (steps === 7) app.accumulator = Math.min(app.accumulator, stepDuration);
    } else {
      app.accumulator = 0;
    }

    if (!app.dashboardOpen) {
      if (app.renderer) {
        app.renderer.draw(now, {
          running: !app.paused && !app.finished,
          paused: app.paused,
          finished: app.finished
        });
      }
      if (now - app.lastUi > 115) {
        updateLiveUI();
        app.lastUi = now;
      }
      if (now - app.lastSparks > 520) {
        drawAllSparks();
        app.lastSparks = now;
      }
    }
    requestAnimationFrame(frame);
  }

  function init() {
    els.dashboard.inert = true;
    initDialTicks();
    bindDial();
    bindControls();
    initTooltips();
    syncDialUI();
    bindChartHover();
    updateAllOutputs();
    if (app.mobileQuery.matches) {
      els.instruments.inert = true;
      els.instrumentsToggle.setAttribute("aria-expanded", "false");
    }
    const initialSeed = clamp(Math.round(Number(els.seedInput.value) || 1884), 0, 999999);
    resetRun({ seed: initialSeed });
    requestAnimationFrame(() => {
      updateInstrumentScrollCue();
      requestAnimationFrame(frame);
    });
  }

  // Expose a small developer surface for deterministic visual runs and inspection.
  window.VivariumUI = {
    get simulation() { return app.sim; },
    get speed() { return app.speed; },
    setSpeed: value => setSpeed(value),
    play: () => { if (app.paused) togglePause(); },
    pause: () => { if (!app.paused) togglePause(); },
    restart: restartCurrent,
    newSpecimen,
    openReport: openDashboard,
    redrawCharts: () => { drawPopulationChart(); drawAllTraitCards(); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
