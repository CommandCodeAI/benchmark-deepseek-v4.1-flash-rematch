
(function () {
  'use strict';

  /* ======================================================================
     THE SIMULATION
     Pure logic. No DOM, no rendering, no wall clock. Every random draw is
     made from the seed, so an identical seed + settings replays exactly.
     ====================================================================== */

  const GRID_W = 128;
  const GRID_H = 72;
  const CELLS = GRID_W * GRID_H;
  const TICKS_PER_GEN = 300;
  const TAU = Math.PI * 2;
  const GENE_KEYS = ['speed', 'vision', 'metabolism', 'repro'];
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gaussian(rng) {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }

  const GENE_BASE = {
    prey: { speed: 0.42, vision: 0.5, metabolism: 0.45, repro: 0.51 },
    pred: { speed: 0.66, vision: 0.68, metabolism: 0.5, repro: 0.54 }
  };

  const GENES = [
    { key: 'speed', label: 'Speed', code: 'SPD' },
    { key: 'vision', label: 'Vision', code: 'VIS' },
    { key: 'metabolism', label: 'Metabolism', code: 'MET' },
    { key: 'repro', label: 'Repro. threshold', code: 'REP' }
  ];

  const SIM_DEFAULTS = {
    seed: 0x7a3f09c1,
    mutation: 0.06,
    regrowth: 4,
    eventInterval: 9,
    targetGenerations: 40,
    preyInit: 160,
    predInit: 14,
    enabled: { drought: true, plague: true, frost: true }
  };

  function makeGenome(rng, species, spread = 0.085) {
    const base = GENE_BASE[species];
    const genes = {};
    for (const key of GENE_KEYS) {
      genes[key] = clamp(base[key] + gaussian(rng) * spread, 0.04, 0.96);
    }
    return genes;
  }

  class Simulation {
    constructor(options = {}) {
      const opts = Object.assign({}, SIM_DEFAULTS, options);
      this.seed = opts.seed >>> 0;
      this.mutation = opts.mutation;
      this.regrowth = opts.regrowth;
      this.eventInterval = opts.eventInterval;
      this.targetGenerations = opts.targetGenerations;
      this.enabled = Object.assign({}, opts.enabled);
      this.preyInit = opts.preyInit;
      this.predInit = opts.predInit;

      this.rng = mulberry32(this.seed);
      this.gen = 0;
      this.tick = 0;
      this.finished = false;
      this.droughtTicks = 0;
      this.eventCycle = 0;
      this.events = [];
      this.rescues = [];
      this.history = [];
      this.preyAlive = 0;
      this.predAlive = 0;

      this.plants = new Float32Array(CELLS);
      this.refuge = new Uint8Array(CELLS);
      this.prey = [];
      this.pred = [];

      this.buildRefuges();
      this.buildFlora();
      for (let i = 0; i < this.preyInit; i++) this.prey.push(this.makeAgent('prey'));
      for (let i = 0; i < this.predInit; i++) this.pred.push(this.makeAgent('pred'));
      this.preyAlive = this.prey.length;
      this.predAlive = this.pred.length;
      this.sample();
    }

    buildRefuges() {
      const rng = this.rng;
      this.refuge.fill(0);
      for (let c = 0; c < 7; c++) {
        const cx = rng() * GRID_W;
        const cy = rng() * GRID_H;
        const radius = 4 + rng() * 6;
        const r2 = radius * radius;
        for (let y = 0; y < GRID_H; y++) {
          let dy = y - cy;
          if (dy > GRID_H / 2) dy -= GRID_H;
          if (dy < -GRID_H / 2) dy += GRID_H;
          for (let x = 0; x < GRID_W; x++) {
            let dx = x - cx;
            if (dx > GRID_W / 2) dx -= GRID_W;
            if (dx < -GRID_W / 2) dx += GRID_W;
            if (dx * dx + dy * dy < r2) this.refuge[y * GRID_W + x] = 1;
          }
        }
      }
    }

    buildFlora() {
      const rng = this.rng;
      this.plants.fill(0);
      for (let c = 0; c < 56; c++) {
        const cx = rng() * GRID_W;
        const cy = rng() * GRID_H;
        const radius = 6 + rng() * 15;
        const amp = 0.45 + rng() * 0.55;
        for (let y = 0; y < GRID_H; y++) {
          let dy = y - cy;
          if (dy > GRID_H / 2) dy -= GRID_H;
          if (dy < -GRID_H / 2) dy += GRID_H;
          if (Math.abs(dy) > radius) continue;
          for (let x = 0; x < GRID_W; x++) {
            let dx = x - cx;
            if (dx > GRID_W / 2) dx -= GRID_W;
            if (dx < -GRID_W / 2) dx += GRID_W;
            const d = Math.hypot(dx, dy);
            if (d < radius) {
              const value = amp * Math.pow(1 - d / radius, 1.4);
              const i = y * GRID_W + x;
              if (value > this.plants[i]) this.plants[i] = value;
            }
          }
        }
      }
      for (let i = 0; i < CELLS; i++) {
        if (this.plants[i] < 0.03 && rng() < 0.23) this.plants[i] = 0.06 + rng() * 0.24;
        if (this.refuge[i] && this.plants[i] > 0.55) this.plants[i] *= 0.72;
      }
    }

    makeAgent(species, x, y, genes) {
      const rng = this.rng;
      return {
        species,
        x: x === undefined ? rng() * GRID_W : x,
        y: y === undefined ? rng() * GRID_H : y,
        heading: rng() * TAU,
        genes: genes || makeGenome(rng, species),
        energy: species === 'prey' ? 0.62 + rng() * 0.2 : 1.5 + rng() * 0.3,
        age: 0,
        cooldown: rng() * 90,
        biteCd: (rng() * 4) | 0,
        killCd: (rng() * 40) | 0,
        scan: 0,
        target: null,
        fleeing: false,
        lastMeal: 0,
        meals: 0,
        alive: true
      };
    }

    cellIndex(x, y) {
      const ix = (((x | 0) % GRID_W) + GRID_W) % GRID_W;
      const iy = (((y | 0) % GRID_H) + GRID_H) % GRID_H;
      return iy * GRID_W + ix;
    }

    plantAt(x, y) {
      return this.plants[this.cellIndex(x, y)];
    }

    buildHash(list, cell = 12) {
      const hx = Math.ceil(GRID_W / cell);
      const hy = Math.ceil(GRID_H / cell);
      const buckets = new Array(hx * hy);
      for (let i = 0; i < buckets.length; i++) buckets[i] = [];
      for (const agent of list) {
        if (!agent.alive) continue;
        const bx = ((agent.x / cell) | 0) % hx;
        const by = ((agent.y / cell) | 0) % hy;
        buckets[by * hx + bx].push(agent);
      }
      return { buckets, hx, hy, cell };
    }

    nearestFromHash(hash, x, y, radius) {
      const { buckets, hx, hy, cell } = hash;
      const r = Math.ceil(radius / cell);
      const cx = (x / cell) | 0;
      const cy = (y / cell) | 0;
      let best = null;
      let bestD = radius * radius;
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          const bx = (((cx + ox) % hx) + hx) % hx;
          const by = (((cy + oy) % hy) + hy) % hy;
          for (const agent of buckets[by * hx + bx]) {
            if (!agent.alive) continue;
            let dx = agent.x - x;
            let dy = agent.y - y;
            if (dx > GRID_W / 2) dx -= GRID_W;
            if (dx < -GRID_W / 2) dx += GRID_W;
            if (dy > GRID_H / 2) dy -= GRID_H;
            if (dy < -GRID_H / 2) dy += GRID_H;
            const d = dx * dx + dy * dy;
            if (d < bestD) {
              bestD = d;
              best = agent;
            }
          }
        }
      }
      return best ? { agent: best, dist: Math.sqrt(bestD) } : null;
    }

    step() {
      if (this.finished) return;
      const rng = this.rng;
      this.tick++;

      const growthRate = this.droughtTicks > 0 ? this.regrowth * 0.25 : this.regrowth;
      const growthEvents = Math.round(growthRate * 34);
      for (let k = 0; k < growthEvents; k++) {
        const i = (rng() * CELLS) | 0;
        const p = this.plants[i];
        const boost = this.refuge[i] ? 2 : 1;
        if (p < 1) {
          this.plants[i] = Math.min(1, p + boost * (0.03 + 0.022 * rng()) * (1 - p) * (0.3 + 0.7 * p));
        }
      }
      for (let k = 0; k < Math.round(growthEvents * 0.16); k++) {
        const i = (rng() * CELLS) | 0;
        if (!this.refuge[i]) continue;
        const p = this.plants[i];
        this.plants[i] = Math.min(1, p + (0.05 + 0.03 * rng()) * (1 - p));
      }
      if (this.droughtTicks > 0) this.droughtTicks--;

      const preyHash = this.buildHash(this.prey);
      const predHash = this.buildHash(this.pred);

      /* grazers */
      for (const a of this.prey) {
        if (!a.alive) continue;
        a.age++;
        a.cooldown--;
        a.biteCd--;
        a.scan--;
        const g = a.genes;
        const speedMax = 0.30 + g.speed * 1.02;
        const vision = 3.2 + g.vision * 13;
        let desired = a.heading;
        let fleeing = false;

        const threat = this.nearestFromHash(predHash, a.x, a.y, vision * 0.7);
        if (threat) {
          desired = Math.atan2(a.y - threat.agent.y, a.x - threat.agent.x) + (rng() - 0.5) * 0.5;
          fleeing = true;
          a.target = null;
          let refugeTarget = null;
          let refugeDist = Infinity;
          for (let s = 0; s < 6; s++) {
            const angle = rng() * TAU;
            const radius = Math.sqrt(rng()) * vision;
            const tx = (a.x + Math.cos(angle) * radius + GRID_W) % GRID_W;
            const ty = (a.y + Math.sin(angle) * radius + GRID_H) % GRID_H;
            if (this.refuge[this.cellIndex(tx, ty)] && radius < refugeDist) {
              refugeDist = radius;
              refugeTarget = { x: tx, y: ty };
            }
          }
          if (refugeTarget) {
            let dx = refugeTarget.x - a.x;
            let dy = refugeTarget.y - a.y;
            if (dx > GRID_W / 2) dx -= GRID_W;
            if (dx < -GRID_W / 2) dx += GRID_W;
            if (dy > GRID_H / 2) dy -= GRID_H;
            if (dy < -GRID_H / 2) dy += GRID_H;
            desired = Math.atan2(dy, dx);
          }
        } else if (a.scan <= 0) {
          a.scan = 8 + ((rng() * 8) | 0);
          let bestX = 0;
          let bestY = 0;
          let best = this.plantAt(a.x, a.y) * 1.2;
          for (let s = 0; s < 7; s++) {
            const angle = rng() * TAU;
            const radius = Math.sqrt(rng()) * vision;
            const tx = a.x + Math.cos(angle) * radius;
            const ty = a.y + Math.sin(angle) * radius;
            const value = this.plantAt(tx, ty);
            if (value > best) {
              best = value;
              bestX = tx;
              bestY = ty;
            }
          }
          a.target = best > 0.04 ? { x: bestX, y: bestY } : null;
        }

        if (!threat && a.target) {
          let dx = a.target.x - a.x;
          let dy = a.target.y - a.y;
          if (dx > GRID_W / 2) dx -= GRID_W;
          if (dx < -GRID_W / 2) dx += GRID_W;
          if (dy > GRID_H / 2) dy -= GRID_H;
          if (dy < -GRID_H / 2) dy += GRID_H;
          if (Math.hypot(dx, dy) < 1.4) {
            a.scan = 0;
            a.target = null;
          } else {
            desired = Math.atan2(dy, dx);
          }
        } else if (!threat) {
          desired = a.heading + (rng() - 0.5) * 0.55;
        }

        a.fleeing = fleeing;
        let diff = ((desired - a.heading + Math.PI * 3) % TAU) - Math.PI;
        a.heading += clamp(diff, -0.36, 0.36);
        const speed = speedMax * (fleeing ? 1.22 : 1) * (a.energy < 0.25 ? 0.6 : 1);
        a.x = (a.x + Math.cos(a.heading) * speed + GRID_W) % GRID_W;
        a.y = (a.y + Math.sin(a.heading) * speed + GRID_H) % GRID_H;

        if (a.biteCd <= 0) {
          const i = this.cellIndex(a.x, a.y);
          const available = this.plants[i];
          if (available > 0.02) {
            const bite = Math.min(available, 0.03);
            this.plants[i] = available - bite;
            a.energy = Math.min(2.0, a.energy + bite * 2.8);
            a.lastMeal = this.gen;
            a.biteCd = 7;
          }
        }

        a.energy -= 0.0018 + 0.0032 * g.metabolism + 0.0022 * g.speed + 0.0010 * g.vision + (fleeing ? 0.0018 : 0);

        if (a.energy > 1.5 + g.repro * 0.75 && a.cooldown <= 0 && this.preyAlive < 800) {
          const childEnergy = a.energy * 0.34;
          a.energy *= 0.55;
          a.cooldown = 500 + ((rng() * 80) | 0);
          const child = this.makeAgent(
            'prey',
            a.x + (rng() - 0.5) * 2,
            a.y + (rng() - 0.5) * 2,
            this.mutate(g)
          );
          child.energy = childEnergy;
          child.cooldown = 100;
          this.prey.push(child);
          this.preyAlive++;
        }

        if (a.energy <= 0) {
          a.alive = false;
          this.preyAlive--;
        } else if (a.age > 900) {
          a.alive = false;
          this.preyAlive--;
        }
      }

      /* hunters */
      for (const a of this.pred) {
        if (!a.alive) continue;
        a.age++;
        a.cooldown--;
        a.killCd--;
        const g = a.genes;
        const speedMax = 0.32 + g.speed * 0.98;
        const vision = 4 + g.vision * 16;

        a.scan--;
        if (a.scan <= 0 || !a.target || !a.target.agent.alive) {
          const found = this.nearestFromHash(preyHash, a.x, a.y, vision);
          a.target = found ? { agent: found.agent } : null;
          a.scan = 2 + ((rng() * 2) | 0);
        }

        let nearDist = Infinity;
        let desired = a.heading;
        if (a.target) {
          let dx = a.target.agent.x - a.x;
          let dy = a.target.agent.y - a.y;
          if (dx > GRID_W / 2) dx -= GRID_W;
          if (dx < -GRID_W / 2) dx += GRID_W;
          if (dy > GRID_H / 2) dy -= GRID_H;
          if (dy < -GRID_H / 2) dy += GRID_H;
          nearDist = Math.hypot(dx, dy);
          desired = Math.atan2(dy, dx);
        } else {
          desired = a.heading + (rng() - 0.5) * 0.3;
        }

        let diff = ((desired - a.heading + Math.PI * 3) % TAU) - Math.PI;
        a.heading += clamp(diff, -0.3, 0.3);
        const speed = speedMax * (nearDist < 5 ? 1.24 : 1) * (a.energy < 0.25 ? 0.6 : 1);
        a.x = (a.x + Math.cos(a.heading) * speed + GRID_W) % GRID_W;
        a.y = (a.y + Math.sin(a.heading) * speed + GRID_H) % GRID_H;

        if (nearDist < 1.1 && a.killCd <= 0 && a.target && a.target.agent.alive) {
          const victim = a.target.agent;
          const cover = this.plantAt(victim.x, victim.y);
          const inRefuge = this.refuge[this.cellIndex(victim.x, victim.y)] === 1;
          if (rng() < (inRefuge ? 0.72 : 0.06 + 0.55 * cover)) {
            a.killCd = 18;
          } else {
            victim.alive = false;
            this.preyAlive--;
            a.meals++;
            a.lastMeal = this.gen;
            a.energy = Math.min(4, a.energy + 0.8 + victim.energy * 0.25);
            a.killCd = 105 + ((rng() * 45) | 0);
          }
        }

        a.energy -= 0.0012 + 0.0020 * g.metabolism + 0.0018 * g.speed + 0.0008 * g.vision;

        const mealQuota = 4 + g.repro * 5;
        if (a.meals >= mealQuota && a.cooldown <= 0 && a.energy > 0.7 && this.predAlive < 100) {
          const childEnergy = Math.min(1, a.energy * 0.32);
          a.meals = 0;
          a.energy *= 0.62;
          a.cooldown = 900 + ((rng() * 140) | 0);
          const child = this.makeAgent(
            'pred',
            a.x + (rng() - 0.5) * 2.4,
            a.y + (rng() - 0.5) * 2.4,
            this.mutate(g)
          );
          child.energy = childEnergy;
          child.cooldown = 400;
          this.pred.push(child);
          this.predAlive++;
        }

        if (a.energy <= 0) {
          a.alive = false;
          this.predAlive--;
        } else if (a.age > 3000) {
          a.alive = false;
          this.predAlive--;
        }
      }

      if ((this.tick & 63) === 0) {
        this.prey = this.prey.filter(a => a.alive);
        this.pred = this.pred.filter(a => a.alive);
      }

      if (this.tick % TICKS_PER_GEN === 0) {
        this.gen++;
        this.prey = this.prey.filter(a => a.alive);
        this.pred = this.pred.filter(a => a.alive);
        this.preyAlive = this.prey.length;
        this.predAlive = this.pred.length;
        this.applyRescue();
        this.maybeEvent();
        this.sample();
        if (this.gen >= this.targetGenerations) this.finished = true;
      }
    }

    applyRescue() {
      const beforePrey = this.prey.length;
      const beforePred = this.pred.length;
      if (this.prey.length > 0 && this.prey.length < 22) {
        for (let i = 0; i < 7; i++) {
          const src = this.prey[(this.rng() * this.prey.length) | 0];
          const child = this.makeAgent(
            'prey',
            src.x + (this.rng() - 0.5) * 6,
            src.y + (this.rng() - 0.5) * 6,
            this.mutate(src.genes)
          );
          child.cooldown = 150;
          this.prey.push(child);
          this.preyAlive++;
        }
      } else if (this.prey.length === 0) {
        for (let i = 0; i < 8; i++) {
          this.prey.push(this.makeAgent('prey'));
          this.preyAlive++;
        }
      }
      if (this.pred.length > 0 && this.pred.length < 3) {
        for (let i = 0; i < 2; i++) {
          const src = this.pred[(this.rng() * this.pred.length) | 0];
          const child = this.makeAgent(
            'pred',
            src.x + (this.rng() - 0.5) * 6,
            src.y + (this.rng() - 0.5) * 6,
            this.mutate(src.genes)
          );
          child.cooldown = 250;
          this.pred.push(child);
          this.predAlive++;
        }
      } else if (this.pred.length === 0 && this.prey.length > 40) {
        for (let i = 0; i < 2; i++) {
          this.pred.push(this.makeAgent('pred'));
          this.predAlive++;
        }
      }
      const addedPrey = this.prey.length - beforePrey;
      const addedPred = this.pred.length - beforePred;
      if (addedPrey > 0 || addedPred > 0) {
        this.rescues.push({ gen: this.gen, prey: addedPrey, pred: addedPred });
      }
    }

    mutate(genes) {
      const out = {};
      for (const key of GENE_KEYS) {
        out[key] = clamp(genes[key] + gaussian(this.rng) * this.mutation * 0.38, 0.03, 0.97);
      }
      return out;
    }

    maybeEvent() {
      if (this.gen <= 0 || !this.eventInterval || this.gen % this.eventInterval !== 0) return;
      const order = ['drought', 'plague', 'frost'];
      let type = null;
      for (let k = 0; k < 3; k++) {
        const candidate = order[(this.eventCycle + k) % 3];
        if (this.enabled[candidate]) {
          type = candidate;
          this.eventCycle = (this.eventCycle + k + 1) % 3;
          break;
        }
      }
      if (!type) return;

      const beforePrey = this.preyAlive;
      const beforePred = this.predAlive;
      let plantBefore = 0;
      for (let i = 0; i < CELLS; i++) plantBefore += this.plants[i];
      const losses = { prey: 0, pred: 0, plants: 0 };

      if (type === 'drought') {
        for (let i = 0; i < CELLS; i++) this.plants[i] *= 0.66;
        this.droughtTicks = Math.round(TICKS_PER_GEN * 1.5);
        let after = 0;
        for (let i = 0; i < CELLS; i++) after += this.plants[i];
        losses.plants = plantBefore > 0 ? (plantBefore - after) / plantBefore : 0;
      } else if (type === 'plague') {
        let killed = 0;
        for (const a of this.prey) {
          if (a.alive && this.rng() < 0.34) {
            a.alive = false;
            killed++;
          }
        }
        this.prey = this.prey.filter(a => a.alive);
        this.preyAlive = this.prey.length;
        losses.prey = beforePrey > 0 ? killed / beforePrey : 0;
      } else {
        let preyKilled = 0;
        let predKilled = 0;
        for (const a of this.prey) {
          if (a.alive && this.rng() < 0.2) {
            a.alive = false;
            preyKilled++;
          }
        }
        for (const a of this.pred) {
          if (a.alive && this.rng() < 0.15) {
            a.alive = false;
            predKilled++;
          }
        }
        for (let i = 0; i < CELLS; i++) this.plants[i] *= 0.88;
        this.prey = this.prey.filter(a => a.alive);
        this.pred = this.pred.filter(a => a.alive);
        this.preyAlive = this.prey.length;
        this.predAlive = this.pred.length;
        losses.prey = beforePrey > 0 ? preyKilled / beforePrey : 0;
        losses.pred = beforePred > 0 ? predKilled / beforePred : 0;
        losses.plants = 0.12;
      }

      this.events.push({ gen: this.gen, type, losses });
    }

    nextEventGen() {
      if (!this.eventInterval) return null;
      const next = (Math.floor(this.gen / this.eventInterval) + 1) * this.eventInterval;
      if (next > this.targetGenerations) return null;
      return next;
    }

    sample() {
      let plantTotal = 0;
      for (let i = 0; i < CELLS; i++) plantTotal += this.plants[i];
      const genes = {};
      for (const species of ['prey', 'pred']) {
        const list = (species === 'prey' ? this.prey : this.pred).filter(a => a.alive);
        genes[species] = {};
        for (const key of GENE_KEYS) {
          let mean = 0;
          for (const a of list) mean += a.genes[key];
          mean /= Math.max(1, list.length);
          let variance = 0;
          for (const a of list) variance += (a.genes[key] - mean) ** 2;
          variance /= Math.max(1, list.length);
          genes[species][key] = {
            mean: list.length ? mean : 0,
            sd: list.length ? Math.sqrt(variance) : 0
          };
        }
      }
      this.history.push({
        gen: this.gen,
        plants: plantTotal / CELLS,
        prey: this.preyAlive,
        pred: this.predAlive,
        genes
      });
    }

    livePlantCover() {
      let total = 0;
      for (let i = 0; i < CELLS; i++) total += this.plants[i];
      return total / CELLS;
    }

    checksum() {
      let h = 2166136261 >>> 0;
      h = Math.imul(h ^ this.gen, 16777619) >>> 0;
      h = Math.imul(h ^ this.tick, 16777619) >>> 0;
      for (let i = 0; i < CELLS; i += 5) {
        h = Math.imul(h ^ Math.round(this.plants[i] * 255), 16777619) >>> 0;
      }
      for (const a of this.prey) {
        if (!a.alive) continue;
        h = Math.imul(h ^ ((a.x * 73856093) ^ (a.y * 19349663) ^ Math.round(a.energy * 1000)), 16777619) >>> 0;
        for (const key of GENE_KEYS) {
          h = Math.imul(h ^ Math.round(a.genes[key] * 1000), 16777619) >>> 0;
        }
      }
      for (const a of this.pred) {
        if (!a.alive) continue;
        h = Math.imul(h ^ ((a.x * 73856093) ^ (a.y * 19349663) ^ Math.round(a.energy * 1000)), 16777619) >>> 0;
        for (const key of GENE_KEYS) {
          h = Math.imul(h ^ Math.round(a.genes[key] * 1000), 16777619) >>> 0;
        }
      }
      return h >>> 0;
    }
  }

  /* ======================================================================
     PALETTE AND SMALL UTILITIES
     ====================================================================== */

  const COLOR = {
    ink: '#07100e',
    ink2: '#0b1613',
    bone: '#ece6d6',
    bone2: '#c6c2b2',
    bone3: '#929a8d',
    bone4: '#6c7468',
    brass: '#c3a56f',
    brassHi: '#e2c997',
    brassDim: '#7b6644',
    line: 'rgba(195,165,111,0.18)',
    lineFaint: 'rgba(195,165,111,0.07)',
    lichen: '#c1d98b',
    moth: '#a5dacb',
    beetle: '#e18b69',
    drought: '#d7a04c',
    plague: '#c0a2d6',
    frost: '#9fcbdd'
  };

  const SPECIES = {
    plants: { name: 'Virella repens', short: 'Virella', role: 'Lichen crust', color: COLOR.lichen, tag: 'PLANT' },
    prey: { name: 'Tinea vagans', short: 'Tinea', role: 'Grazer moth', color: COLOR.moth, tag: 'GRAZER' },
    pred: { name: 'Carabus vorax', short: 'Carabus', role: 'Hunting beetle', color: COLOR.beetle, tag: 'HUNTER' }
  };

  const EVENT_META = {
    drought: {
      name: 'Drought',
      color: COLOR.drought,
      glyph: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="10.4" r="4.1" stroke="currentColor" stroke-width="1.1"/><path d="M12 2.4v2.6M12 15.8v2.6M3.9 10.4h2.6M17.5 10.4h2.6M6.2 4.6l1.9 1.9M15.9 14.3l1.9 1.9M17.8 4.6l-1.9 1.9M8.1 14.3l-1.9 1.9" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><path d="M7.7 21.6h8.6" stroke="currentColor" stroke-width="1" opacity=".45"/></svg>'
    },
    plague: {
      name: 'Plague',
      color: COLOR.plague,
      glyph: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="7.6" cy="7.8" r="2.5" stroke="currentColor" stroke-width="1.1"/><circle cx="16.8" cy="9.6" r="1.7" stroke="currentColor" stroke-width="1.1"/><circle cx="11" cy="17.4" r="2.1" stroke="currentColor" stroke-width="1.1"/><circle cx="18.9" cy="17.7" r="1.1" fill="currentColor"/><path d="M9.6 9.6l1.4 5.4M15.4 11l-2.2 4.6M17.9 11.2l.6 4.1" stroke="currentColor" stroke-width="1" opacity=".48"/></svg>'
    },
    frost: {
      name: 'Frost',
      color: COLOR.frost,
      glyph: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2.7v18.6M3.9 7.4l16.2 9.2M20.1 7.4 3.9 16.6" stroke="currentColor" stroke-width="1.1" stroke-linecap="round"/><path d="M12 6.3 9.4 4.2M12 6.3l2.6-2.1M12 17.7l-2.6 2.1M12 17.7l2.6 2.1M6.4 9.3 3.3 8.7M6.4 14.7l-3.1.6M17.6 9.3l3.1-.6M17.6 14.7l3.1.6" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity=".58"/></svg>'
    }
  };

  const $ = (id) => document.getElementById(id);
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
  const pad2 = (n) => String(n).padStart(2, '0');
  const pad3 = (n) => String(n).padStart(3, '0').replace(/^0+(?=\d{3})/, '');
  const seedHex = (seed) => (seed >>> 0).toString(16).toUpperCase().padStart(8, '0');
  const seedGroups = (seed) => {
    const h = seedHex(seed);
    return h.slice(0, 4) + ' ' + h.slice(4);
  };
  const roman = (num) => {
    const map = [
      [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
      [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']
    ];
    let n = num;
    let out = '';
    for (const [value, glyph] of map) {
      while (n >= value) { out += glyph; n -= value; }
    }
    return out;
  };
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ======================================================================
     WORLD RENDERER
     Reads the simulation, owns no ecology. Can draw to any canvas, which is
     how the final specimen thumbnail is made.
     ====================================================================== */

  class WorldRenderer {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.snapshot = !!options.snapshot;
      this.w = 0;
      this.h = 0;
      this.dpr = 1;
      this.scale = 1;
      this.offX = 0;
      this.offY = 0;
      this.terrain = null;
      this.sim = null;
      this.pointer = { x: 0, y: 0, active: false };
      this.hover = null;
      this.trace = true;
      this.time = 0;
      this.plantLayer = document.createElement('canvas');
      this.plantLayerCtx = this.plantLayer.getContext('2d');
      this.plantLayerDirty = true;
      this.plantLayerStamp = 0;
      this.cellNoise = new Uint8Array(CELLS);
      for (let i = 0; i < CELLS; i++) {
        const x = i % GRID_W;
        const y = (i / GRID_W) | 0;
        this.cellNoise[i] = ((x * 374761393 + y * 668265263) ^ (x * y * 1274126177)) & 255;
      }
      this.lastLens = null;
    }

    setSim(sim) {
      this.sim = sim;
      this.resize();
      this.buildTerrain();
    }

    resize() {
      const rect = this.canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = Math.round(rect.width * dpr);
      const H = Math.round(rect.height * dpr);
      if (this.canvas.width !== W || this.canvas.height !== H) {
        this.canvas.width = W;
        this.canvas.height = H;
      }
      this.dpr = dpr;
      this.w = rect.width;
      this.h = rect.height;
      this.scale = Math.min(this.w / GRID_W, this.h / GRID_H);
      this.offX = (this.w - GRID_W * this.scale) / 2;
      this.offY = (this.h - GRID_H * this.scale) / 2;
      const lw = Math.round(this.w * dpr);
      const lh = Math.round(this.h * dpr);
      if (this.plantLayer.width !== lw || this.plantLayer.height !== lh) {
        this.plantLayer.width = lw;
        this.plantLayer.height = lh;
      }
      this.plantLayerDirty = true;
      if (this.sim) this.buildTerrain();
    }

    buildTerrain() {
      if (!this.w || !this.h) return;
      const dpr = this.dpr;
      const tc = document.createElement('canvas');
      tc.width = Math.round(this.w * dpr);
      tc.height = Math.round(this.h * dpr);
      const c = tc.getContext('2d');
      c.scale(dpr, dpr);
      const s = this.scale;
      const ox = this.offX;
      const oy = this.offY;

      // engraved survey lattice
      c.strokeStyle = 'rgba(195,165,111,0.045)';
      c.lineWidth = 0.6;
      for (let gx = 0; gx <= GRID_W; gx += 8) {
        const x = ox + gx * s;
        c.beginPath();
        c.moveTo(x, oy);
        c.lineTo(x, oy + GRID_H * s);
        c.stroke();
      }
      for (let gy = 0; gy <= GRID_H; gy += 8) {
        const y = oy + gy * s;
        c.beginPath();
        c.moveTo(ox, y);
        c.lineTo(ox + GRID_W * s, y);
        c.stroke();
      }
      c.fillStyle = 'rgba(195,165,111,0.09)';
      for (let gx = 0; gx <= GRID_W; gx += 16) {
        for (let gy = 0; gy <= GRID_H; gy += 16) {
          c.fillRect(ox + gx * s - 0.5, oy + gy * s - 0.5, 1.2, 1.2);
        }
      }

      // basalt outcrops, softened through a low-resolution mask
      const sim = this.sim;
      if (sim) {
        const mask = document.createElement('canvas');
        mask.width = GRID_W;
        mask.height = GRID_H;
        const mctx = mask.getContext('2d');
        const img = mctx.createImageData(GRID_W, GRID_H);
        for (let y = 0; y < GRID_H; y++) {
          for (let x = 0; x < GRID_W; x++) {
            const i = y * GRID_W + x;
            if (!sim.refuge[i]) continue;
            const n = ((x * 92821) ^ (y * 68917)) & 255;
            const o = i * 4;
            img.data[o] = 37 + (n & 8);
            img.data[o + 1] = 41 + (n % 8);
            img.data[o + 2] = 34 + (n % 6);
            img.data[o + 3] = 170 + (n % 26);
          }
        }
        mctx.putImageData(img, 0, 0);
        c.imageSmoothingEnabled = true;
        c.shadowColor = 'rgba(0,0,0,0.35)';
        c.shadowBlur = 7;
        c.shadowOffsetY = 2;
        c.drawImage(mask, 0, 0, GRID_W, GRID_H, ox, oy, GRID_W * s, GRID_H * s);
        c.shadowColor = 'transparent';
        c.shadowBlur = 0;
        c.shadowOffsetY = 0;

        // stone grain
        c.fillStyle = 'rgba(180,172,136,0.095)';
        for (let y = 0; y < GRID_H; y++) {
          for (let x = 0; x < GRID_W; x++) {
            const i = y * GRID_W + x;
            if (!sim.refuge[i]) continue;
            const n = ((x * 37 + y * 71) ^ (x * y)) & 31;
            if (n > 2) continue;
            c.fillRect(ox + x * s + s * (0.2 + (n % 4) * 0.16), oy + y * s + s * (0.25 + (n % 3) * 0.18), 0.8, 0.8);
          }
        }

        // a dotted survey rim, not a hard cell outline
        c.fillStyle = 'rgba(195,165,111,0.34)';
        c.beginPath();
        for (let y = 0; y < GRID_H; y++) {
          for (let x = 0; x < GRID_W; x++) {
            const i = y * GRID_W + x;
            if (!sim.refuge[i]) continue;
            const edge = (y === 0 || !sim.refuge[i - GRID_W]) || (y === GRID_H - 1 || !sim.refuge[i + GRID_W]) ||
              (x === 0 || !sim.refuge[i - 1]) || (x === GRID_W - 1 || !sim.refuge[i + 1]);
            if (!edge) continue;
            if (((x + y) & 1) !== 0) continue;
            c.rect(ox + x * s + s * 0.4, oy + y * s + s * 0.4, 1.1, 1.1);
          }
        }
        c.fill();

        // mineral hatch
        c.strokeStyle = 'rgba(195,182,145,0.065)';
        c.lineWidth = 0.45;
        c.beginPath();
        for (let y = 0; y < GRID_H; y++) {
          for (let x = 0; x < GRID_W; x++) {
            const i = y * GRID_W + x;
            if (!sim.refuge[i]) continue;
            if (((x * 5 + y * 3) & 7) !== 0) continue;
            const px = ox + x * s;
            const py = oy + y * s;
            c.moveTo(px + s * 0.18, py + s * 0.68);
            c.lineTo(px + s * 0.82, py + s * 0.16);
          }
        }
        c.stroke();

        c.strokeStyle = 'rgba(215,198,154,0.13)';
        c.lineWidth = 0.7;
        c.beginPath();
        for (let y = 0; y < GRID_H; y++) {
          for (let x = 0; x < GRID_W; x++) {
            const i = y * GRID_W + x;
            if (!sim.refuge[i]) continue;
            if (y === 0 || !sim.refuge[i - GRID_W]) {
              c.moveTo(ox + x * s, oy + y * s + 0.5);
              c.lineTo(ox + (x + 1) * s, oy + y * s + 0.5);
            }
          }
        }
        c.stroke();
      }

      this.terrain = tc;
    }

    paintPlantLayer(sim) {
      const c = this.plantLayerCtx;
      const dpr = this.dpr;
      const w = this.w;
      const h = this.h;
      const s = this.scale;
      const ox = this.offX;
      const oy = this.offY;
      const noise = this.cellNoise;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);

      // dim ground wash to bind the spores into patches
      if (!this.washCanvas) {
        this.washCanvas = document.createElement('canvas');
        this.washCanvas.width = GRID_W;
        this.washCanvas.height = GRID_H;
        this.washImage = this.washCanvas.getContext('2d').createImageData(GRID_W, GRID_H);
      }
      const wc = this.washCanvas.getContext('2d');
      const wd = this.washImage.data;
      for (let i = 0; i < CELLS; i++) {
        const p = sim.plants[i];
        const o = i * 4;
        if (p < 0.02) {
          wd[o + 3] = 0;
          continue;
        }
        wd[o] = 76;
        wd[o + 1] = 100;
        wd[o + 2] = 60;
        wd[o + 3] = Math.min(255, (p * 0.27 * 255) | 0);
      }
      wc.putImageData(this.washImage, 0, 0);
      c.imageSmoothingEnabled = true;
      c.globalAlpha = 0.95;
      c.drawImage(this.washCanvas, 0, 0, GRID_W, GRID_H, ox, oy, GRID_W * s, GRID_H * s);
      c.globalAlpha = 1;

      const bands = [
        { min: 0.015, max: 0.24, color: 'rgba(115,137,80,0.36)', dots: 2, size: 1.15 },
        { min: 0.24, max: 0.5, color: 'rgba(151,181,102,0.46)', dots: 3, size: 1.4 },
        { min: 0.5, max: 2, color: 'rgba(198,225,149,0.58)', dots: 4, size: 1.65 }
      ];

      for (const band of bands) {
        c.fillStyle = band.color;
        c.beginPath();
        for (let y = 0; y < GRID_H; y++) {
          for (let x = 0; x < GRID_W; x++) {
            const i = y * GRID_W + x;
            const p = sim.plants[i];
            if (p < band.min || p >= band.max) continue;
            const n = noise[i];
            const extra = p > 0.78 ? 1 : 0;
            const count = band.dots + extra;
            for (let d = 0; d < count; d++) {
              const bits = (n >> (d * 2)) & 3;
              const offX = (bits / 3 - 0.5) * s * 0.78;
              const offY = (((n >> (d * 2 + 1)) & 3) / 3 - 0.5) * s * 0.78;
              c.rect(ox + x * s + s * 0.5 + offX, oy + y * s + s * 0.5 + offY, band.size, band.size);
            }
          }
        }
        c.fill();
      }

      // botanical sprigs at the densest points
      c.strokeStyle = 'rgba(210,232,160,0.34)';
      c.lineWidth = 0.55;
      c.beginPath();
      let sprigs = 0;
      for (let y = 2; y < GRID_H - 2 && sprigs < 260; y++) {
        for (let x = 2; x < GRID_W - 2 && sprigs < 260; x++) {
          const i = y * GRID_W + x;
          if (sim.plants[i] < 0.4) continue;
          const hash = (x * 73856093) ^ (y * 19349663);
          if ((hash & 511) > 5) continue;
          const px = ox + x * s;
          const py = oy + y * s;
          c.moveTo(px, py + Math.max(1.1, s * 0.18));
          c.lineTo(px, py - Math.max(1.1, s * 0.18));
          c.moveTo(px, py);
          c.lineTo(px - Math.max(1, s * 0.17), py - Math.max(0.9, s * 0.15));
          c.moveTo(px + 0.2, py - s * 0.05);
          c.lineTo(px + Math.max(1.1, s * 0.17), py - Math.max(1.2, s * 0.19));
          sprigs++;
        }
      }
      c.stroke();

      this.plantLayerDirty = false;
    }

    draw(sim, options = {}) {
      if (!this.w) this.resize();
      if (!this.w) return;
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      const s = this.scale;
      const ox = this.offX;
      const oy = this.offY;
      const dpr = this.dpr;

      if (!this.snapshot) this.trace = options.trace !== false;
      this.hover = options.hover || null;
      this.time = (this.time + 1) % 100000;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, '#091712');
      bg.addColorStop(0.45, '#06110e');
      bg.addColorStop(1, '#050c0a');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      const glow = ctx.createRadialGradient(w * 0.34, h * 0.06, 0, w * 0.34, h * 0.06, w * 0.8);
      glow.addColorStop(0, 'rgba(64,101,77,0.09)');
      glow.addColorStop(0.45, 'rgba(35,58,46,0.03)');
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);

      const stamp = performance.now();
      if (this.plantLayerDirty || stamp - this.plantLayerStamp > 90) {
        this.paintPlantLayer(sim);
        this.plantLayerStamp = stamp;
      }
      if (this.plantLayer.width) {
        ctx.drawImage(this.plantLayer, 0, 0, this.plantLayer.width, this.plantLayer.height, 0, 0, w, h);
      }

      if (this.terrain) {
        ctx.drawImage(this.terrain, 0, 0, this.terrain.width, this.terrain.height, 0, 0, w, h);
      }

      if (!this.snapshot && w > 430) this.drawScaleBar();

      const alivePrey = [];
      for (const a of sim.prey) if (a.alive) alivePrey.push(a);
      const alivePred = [];
      for (const a of sim.pred) if (a.alive) alivePred.push(a);

      if (this.trace) this.drawTraces(alivePrey, alivePred);
      this.drawPrey(alivePrey);
      this.drawPredators(alivePred);

      if (this.hover && this.hover.alive) this.drawHoverRing(this.hover);
      if (!this.snapshot && this.pointer.active) this.drawLoupe(options);
    }

    drawScaleBar() {
      const ctx = this.ctx;
      const len = this.scale * 10;
      const x = 16;
      const y = 17;
      ctx.save();
      ctx.strokeStyle = 'rgba(226,201,151,0.35)';
      ctx.fillStyle = 'rgba(226,201,151,0.5)';
      ctx.shadowColor = 'rgba(0,0,0,0.65)';
      ctx.shadowBlur = 3;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len, y);
      ctx.moveTo(x, y - 2.5);
      ctx.lineTo(x, y + 2.5);
      ctx.moveTo(x + len, y - 2.5);
      ctx.lineTo(x + len, y + 2.5);
      ctx.stroke();
      ctx.font = '500 6px "JetBrains Mono", monospace';
      ctx.letterSpacing = '1px';
      ctx.fillText('10 CELLS', x, y + 10);
      ctx.restore();
    }

    drawTraces(prey, pred) {
      const ctx = this.ctx;
      const s = this.scale;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(165,218,203,0.11)';
      ctx.lineWidth = 0.55;
      ctx.beginPath();
      for (const a of prey) {
        const x = this.offX + a.x * s;
        const y = this.offY + a.y * s;
        const len = (1.4 + a.genes.speed * 4.2);
        ctx.moveTo(x - Math.cos(a.heading) * len, y - Math.sin(a.heading) * len);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(225,139,105,0.16)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (const a of pred) {
        const x = this.offX + a.x * s;
        const y = this.offY + a.y * s;
        const len = (3 + a.genes.speed * 6);
        ctx.moveTo(x - Math.cos(a.heading) * len, y - Math.sin(a.heading) * len);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    }

    drawPrey(list) {
      if (!list.length) return;
      const ctx = this.ctx;
      const s = this.scale;
      const ox = this.offX;
      const oy = this.offY;
      const base = Math.max(1.25, Math.min(2.45, s * 0.24));
      ctx.save();
      ctx.lineWidth = base < 1.7 ? 0.65 : 0.78;
      ctx.strokeStyle = 'rgba(126,224,201,0.84)';
      ctx.beginPath();
      for (const a of list) {
        const r = base * (0.84 + Math.min(0.42, a.energy * 0.18));
        const x = ox + a.x * s;
        const y = oy + a.y * s;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
      ctx.stroke();

      if (s > 4.2) {
        ctx.strokeStyle = 'rgba(146,218,200,0.28)';
        ctx.lineWidth = 0.45;
        ctx.beginPath();
        for (const a of list) {
          const r = base * (0.84 + Math.min(0.42, a.energy * 0.18));
          const x = ox + a.x * s;
          const y = oy + a.y * s;
          const hx = Math.cos(a.heading);
          const hy = Math.sin(a.heading);
          for (const side of [-0.55, 0.55]) {
            const c = Math.cos(a.heading + side);
            const si = Math.sin(a.heading + side);
            ctx.moveTo(x + hx * r * 0.9, y + hy * r * 0.9);
            ctx.lineTo(x + c * r * 2.1, y + si * r * 2.1);
          }
        }
        ctx.stroke();
      }

      ctx.strokeStyle = 'rgba(196,242,227,0.42)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (const a of list) {
        const x = ox + a.x * s;
        const y = oy + a.y * s;
        const hx = Math.cos(a.heading);
        const hy = Math.sin(a.heading);
        const r = base * 0.62;
        ctx.moveTo(x - hx * r, y - hy * r);
        ctx.lineTo(x + hx * r, y + hy * r);
      }
      ctx.stroke();

      ctx.fillStyle = 'rgba(205,243,230,0.46)';
      ctx.beginPath();
      for (const a of list) {
        const r = Math.max(0.45, base * 0.17);
        const x = ox + a.x * s;
        const y = oy + a.y * s;
        ctx.moveTo(x + r, y);
        ctx.arc(x, y, r, 0, TAU);
      }
      ctx.fill();
      ctx.restore();
    }

    drawPredators(list) {
      if (!list.length) return;
      const ctx = this.ctx;
      const s = this.scale;
      const ox = this.offX;
      const oy = this.offY;
      const len = Math.max(5.0, Math.min(9.6, s * 1.08));
      ctx.save();
      ctx.fillStyle = 'rgba(232,143,110,0.11)';
      ctx.beginPath();
      for (const a of list) {
        const x = ox + a.x * s;
        const y = oy + a.y * s;
        ctx.moveTo(x + len * 0.55, y);
        ctx.arc(x, y, len * 0.55, 0, TAU);
      }
      ctx.fill();
      ctx.fillStyle = 'rgba(232,143,110,0.97)';
      ctx.strokeStyle = 'rgba(7,16,14,0.8)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      for (const a of list) {
        const x = ox + a.x * s;
        const y = oy + a.y * s;
        const fx = Math.cos(a.heading);
        const fy = Math.sin(a.heading);
        const rx = -fy;
        const ry = fx;
        const half = len * 0.34;
        const tipX = x + fx * len * 0.66;
        const tipY = y + fy * len * 0.66;
        const backX = x - fx * len * 0.46;
        const backY = y - fy * len * 0.46;
        const notchX = x - fx * len * 0.12;
        const notchY = y - fy * len * 0.12;
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(backX + rx * half, backY + ry * half);
        ctx.lineTo(notchX, notchY);
        ctx.lineTo(backX - rx * half, backY - ry * half);
        ctx.closePath();
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,218,190,0.8)';
      ctx.beginPath();
      for (const a of list) {
        const x = ox + a.x * s;
        const y = oy + a.y * s;
        const fx = Math.cos(a.heading);
        const fy = Math.sin(a.heading);
        const hr = Math.max(0.6, len * 0.08);
        ctx.moveTo(x + fx * len * 0.36 + hr, y + fy * len * 0.36);
        ctx.arc(x + fx * len * 0.36, y + fy * len * 0.36, hr, 0, TAU);
      }
      ctx.fill();
      ctx.restore();
    }

    drawHoverRing(agent) {
      const ctx = this.ctx;
      const s = this.scale;
      const x = this.offX + agent.x * s;
      const y = this.offY + agent.y * s;
      const isPred = agent.species === 'pred';
      const r = isPred ? 10 : 8;
      ctx.save();
      ctx.strokeStyle = 'rgba(226,201,151,0.88)';
      ctx.lineWidth = 0.85;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(226,201,151,0.38)';
      ctx.lineWidth = 0.6;
      ctx.setLineDash([1.4, 2.4]);
      ctx.beginPath();
      ctx.arc(x, y, r + 3.5, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      for (const ang of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
        ctx.moveTo(x + Math.cos(ang) * (r - 2.2), y + Math.sin(ang) * (r - 2.2));
        ctx.lineTo(x + Math.cos(ang) * (r + 1.6), y + Math.sin(ang) * (r + 1.6));
      }
      ctx.stroke();
      ctx.restore();
    }

    drawLoupe(options) {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      const r = Math.max(40, Math.min(62, w * 0.074));
      const cx = clamp(this.pointer.x, r + 6, w - r - 6);
      const cy = clamp(this.pointer.y, r + 6, h - r - 6);
      const zoom = 1.82;
      const dpr = this.dpr;
      this.lastLens = { x: cx, y: cy, r };

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, TAU);
      ctx.clip();
      ctx.filter = 'brightness(1.12) contrast(1.04) saturate(1.06)';
      const sw = ((r * 2) / zoom) * dpr;
      ctx.drawImage(
        this.canvas,
        cx * dpr - sw / 2,
        cy * dpr - sw / 2,
        sw,
        sw,
        cx - r,
        cy - r,
        r * 2,
        r * 2
      );
      ctx.filter = 'none';
      const shade = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
      shade.addColorStop(0, 'rgba(255,255,255,0.035)');
      shade.addColorStop(0.6, 'rgba(0,0,0,0)');
      shade.addColorStop(1, 'rgba(0,0,0,0.36)');
      ctx.fillStyle = shade;
      ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = 'rgba(0,0,0,0.62)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 1.2, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(226,201,151,0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, r + 1.2, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(226,201,151,0.25)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 2.4, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      for (let k = 0; k < 12; k++) {
        const ang = (k / 12) * TAU;
        const inner = r + (k % 3 === 0 ? 3 : 4.6);
        const outer = r + 6.5;
        ctx.moveTo(cx + Math.cos(ang) * inner, cy + Math.sin(ang) * inner);
        ctx.lineTo(cx + Math.cos(ang) * outer, cy + Math.sin(ang) * outer);
      }
      ctx.strokeStyle = 'rgba(226,201,151,0.48)';
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,248,228,0.24)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(cx, cy, r - 1.4, Math.PI * 1.08, Math.PI * 1.55);
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ======================================================================
     ARCHIVE CHARTS
     Canvas only, same ink and brass language as the chamber.
     ====================================================================== */

  const MONO_FONT = '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, monospace';
  const SERIF_FONT = '"Bitstream Charter", "Iowan Old Style", Palatino, Georgia, serif';
  const monoFont = (size, weight = 500) => `${weight} ${size}px ${MONO_FONT}`;
  const serifFont = (size, style = '400') => `${style} ${size}px ${SERIF_FONT}`;

  function rgba(hex, alpha) {
    const h = hex.replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    const r = (n >> 16) & 255;
    const g = (n >> 8) & 255;
    const b = n & 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }

  function fitCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(rect.width * dpr);
    const H = Math.round(rect.height * dpr);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    return { ctx, w: rect.width, h: rect.height, dpr };
  }

  function niceMax(value) {
    if (value <= 0) return 10;
    const power = Math.pow(10, Math.floor(Math.log10(value)));
    const n = value / power;
    let m;
    if (n <= 1) m = 1;
    else if (n <= 2) m = 2;
    else if (n <= 2.5) m = 2.5;
    else if (n <= 5) m = 5;
    else m = 10;
    return m * power;
  }

  function drawSpeciesGlyph(ctx, species, x, y, size, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 0.9;
    const cx = x + size * 0.5;
    const cy = y + size * 0.5;
    if (species === 'prey') {
      ctx.beginPath();
      ctx.arc(cx, cy + size * 0.06, size * 0.25, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.12, cy - size * 0.15);
      ctx.lineTo(cx - size * 0.32, cy - size * 0.44);
      ctx.moveTo(cx + size * 0.12, cy - size * 0.15);
      ctx.lineTo(cx + size * 0.32, cy - size * 0.44);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx - size * 0.32, cy - size * 0.44, size * 0.06, 0, TAU);
      ctx.arc(cx + size * 0.32, cy - size * 0.44, size * 0.06, 0, TAU);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.moveTo(cx, cy - size * 0.42);
      ctx.lineTo(cx + size * 0.3, cy + size * 0.38);
      ctx.lineTo(cx, cy + size * 0.15);
      ctx.lineTo(cx - size * 0.3, cy + size * 0.38);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - size * 0.28, cy + size * 0.16);
      ctx.lineTo(cx - size * 0.44, cy + size * 0.3);
      ctx.moveTo(cx + size * 0.28, cy + size * 0.16);
      ctx.lineTo(cx + size * 0.44, cy + size * 0.3);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCensusChart(canvas, sim) {
    const fit = fitCanvas(canvas);
    if (!fit) return;
    const { ctx, w, h } = fit;
    const hist = sim.history;
    if (!hist.length) return;
    const target = Math.max(1, hist[hist.length - 1].gen);
    const compact = w < 560;
    const left = compact ? 31 : 42;
    const right = compact ? 33 : 45;
    const top = compact ? 22 : 26;
    const bottom = compact ? 22 : 26;
    const pw = w - left - right;
    const ph = h - top - bottom;
    if (pw <= 10 || ph <= 10) return;
    const maxCount = niceMax(Math.max(10, ...hist.map(d => Math.max(d.prey, d.pred))));
    const countY = (v) => top + ph - (v / maxCount) * ph;
    const coverY = (v) => top + ph - clamp01(v) * ph;
    const genX = (g) => left + (g / target) * pw;

    ctx.save();
    ctx.font = monoFont(compact ? 7 : 7.5, 500);
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 1;

    // horizontal grid and axis labels
    const rows = 4;
    for (let i = 0; i <= rows; i++) {
      const y = top + (ph * i) / rows;
      ctx.strokeStyle = 'rgba(195,165,111,0.078)';
      ctx.beginPath();
      ctx.moveTo(left, y + 0.5);
      ctx.lineTo(left + pw, y + 0.5);
      ctx.stroke();
      const countValue = Math.round(maxCount * (1 - i / rows));
      ctx.fillStyle = 'rgba(198,194,178,0.62)';
      ctx.textAlign = 'right';
      ctx.fillText(String(countValue), left - 7, y);
      ctx.fillStyle = 'rgba(193,217,139,0.74)';
      ctx.textAlign = 'left';
      ctx.fillText(`${Math.round(100 * (1 - i / rows))}%`, left + pw + 7, y);
    }

    // x ticks
    const xStep = Math.max(1, Math.ceil(target / (compact ? 4 : 6)));
    const gens = [];
    for (let g = 0; g <= target; g += xStep) gens.push(g);
    if (gens[gens.length - 1] !== target) gens.push(target);
    ctx.textAlign = 'center';
    for (const g of gens) {
      const x = genX(g);
      ctx.strokeStyle = 'rgba(195,165,111,0.22)';
      ctx.beginPath();
      ctx.moveTo(x + 0.5, top + ph);
      ctx.lineTo(x + 0.5, top + ph + 4);
      ctx.stroke();
      ctx.fillStyle = 'rgba(198,194,178,0.58)';
      ctx.fillText(String(g), x, top + ph + 12);
    }
    // lichen cover
    ctx.beginPath();
    ctx.moveTo(left, top + ph);
    hist.forEach((d, i) => {
      const x = genX(d.gen);
      const y = coverY(d.plants);
      if (i === 0) ctx.lineTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.lineTo(genX(hist[hist.length - 1].gen), top + ph);
    ctx.closePath();
    ctx.fillStyle = 'rgba(193,217,139,0.09)';
    ctx.fill();
    ctx.beginPath();
    hist.forEach((d, i) => {
      const x = genX(d.gen);
      const y = coverY(d.plants);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.strokeStyle = 'rgba(193,217,139,0.5)';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // disturbance markers behind the animal lines
    sim.events.forEach((ev, index) => {
      const x = genX(ev.gen);
      const meta = EVENT_META[ev.type];
      ctx.strokeStyle = rgba(meta.color, 0.28);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, top);
      ctx.lineTo(x + 0.5, top + ph);
      ctx.stroke();
      ctx.save();
      ctx.translate(x, top - 4);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = rgba(meta.color, 0.9);
      ctx.fillRect(-2.5, -2.5, 5, 5);
      ctx.restore();
      ctx.fillStyle = rgba(meta.color, 0.9);
      ctx.font = monoFont(compact ? 6.5 : 7, 500);
      ctx.textAlign = 'center';
      ctx.fillText(roman(index + 1), x, top - 12);
      ctx.font = monoFont(compact ? 7 : 7.5, 500);
    });

    // population lines
    const series = [
      { key: 'prey', color: COLOR.moth, glow: 'rgba(165,218,203,0.35)' },
      { key: 'pred', color: COLOR.beetle, glow: 'rgba(225,139,105,0.35)' }
    ];
    for (const line of series) {
      ctx.save();
      ctx.beginPath();
      hist.forEach((d, i) => {
        const x = genX(d.gen);
        const y = countY(d[line.key]);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = line.color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.shadowColor = line.glow;
      ctx.shadowBlur = 7;
      ctx.stroke();
      ctx.restore();

      const last = hist[hist.length - 1];
      const lx = genX(last.gen);
      const ly = countY(last[line.key]);
      ctx.beginPath();
      ctx.fillStyle = line.color;
      ctx.arc(lx, ly, 1.8, 0, TAU);
      ctx.fill();
    }

    // baseline
    ctx.strokeStyle = 'rgba(195,165,111,0.26)';
    ctx.beginPath();
    ctx.moveTo(left, top + ph + 0.5);
    ctx.lineTo(left + pw, top + ph + 0.5);
    ctx.stroke();
    ctx.restore();
  }

  function driftLayout(w) {
    const compact = w < 660;
    return compact
      ? { cols: 1, headerH: 26, gapX: 0, gapY: 8, cellH: 78, groupGap: 16, padX: 5 }
      : { cols: 2, headerH: 30, gapX: 16, gapY: 10, cellH: 0, groupGap: 0, padX: 4 };
  }

  function drawDriftChart(canvas, sim) {
    const wrap = canvas.parentElement;
    const widthNow = wrap.clientWidth;
    if (widthNow < 660) wrap.style.height = '810px';
    else wrap.style.height = '600px';
    const fit = fitCanvas(canvas);
    if (!fit) return;
    const { ctx, w, h } = fit;
    const hist = sim.history;
    if (!hist.length) return;
    const target = Math.max(1, hist[hist.length - 1].gen);
    const layout = driftLayout(w);
    const compact = layout.cols === 1;
    const speciesOrder = ['prey', 'pred'];

    ctx.save();
    ctx.textBaseline = 'middle';

    const drawHeader = (species, x, y, width) => {
      drawSpeciesGlyph(ctx, species, x, y - 5, 13, SPECIES[species].color);
      ctx.textAlign = 'left';
      ctx.font = serifFont(compact ? 12 : 13, 'italic');
      ctx.fillStyle = COLOR.bone;
      ctx.fillText(SPECIES[species].name, x + 19, y);
      ctx.font = monoFont(6.5, 500);
      ctx.fillStyle = SPECIES[species].color;
      ctx.fillText(`${SPECIES[species].tag} · MEAN ±1σ`, x + 19, y + 9);
      ctx.strokeStyle = 'rgba(195,165,111,0.12)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y + 16);
      ctx.lineTo(x + width, y + 16);
      ctx.stroke();
    };

    const drawCell = (species, gene, x, y, cw, ch, showAxis) => {
      const color = SPECIES[species].color;
      const plotX = x + 2;
      const plotY = y + 16;
      const rightLabel = 32;
      const plotW = cw - rightLabel - 4;
      const plotH = ch - 27;
      if (plotW < 20 || plotH < 15) return;
      const gx = (g) => plotX + (g / target) * plotW;
      const gy = (v) => plotY + plotH - clamp01(v) * plotH;

      // cell head
      ctx.font = monoFont(compact ? 6.8 : 7.2, 500);
      ctx.fillStyle = 'rgba(198,194,178,0.6)';
      ctx.textAlign = 'left';
      ctx.fillText(gene.label.toUpperCase(), x + 2, y + 7);

      const last = hist[hist.length - 1];
      const alive = species === 'prey' ? last.prey : last.pred;
      const finalValue = last.genes[species][gene.key].mean;
      const firstValue = hist[0].genes[species][gene.key].mean;
      const delta = finalValue - firstValue;
      ctx.textAlign = 'right';
      if (alive > 0) {
        ctx.fillStyle = color;
        ctx.font = monoFont(8.5, 500);
        ctx.fillText(finalValue.toFixed(2), x + cw - 2, y + 7);
      } else {
        ctx.fillStyle = COLOR.bone4;
        ctx.font = monoFont(7, 500);
        ctx.fillText('LOST', x + cw - 2, y + 7);
      }

      // plot background and grid
      ctx.fillStyle = 'rgba(255,255,255,0.008)';
      ctx.fillRect(plotX, plotY, plotW, plotH);
      ctx.strokeStyle = 'rgba(195,165,111,0.065)';
      ctx.lineWidth = 1;
      for (const f of [0, 0.5, 1]) {
        const yy = plotY + plotH * (1 - f);
        ctx.beginPath();
        ctx.moveTo(plotX, yy + 0.5);
        ctx.lineTo(plotX + plotW, yy + 0.5);
        ctx.stroke();
      }
      if (showAxis) {
        ctx.font = monoFont(6.2, 500);
        ctx.fillStyle = 'rgba(198,194,178,0.48)';
        ctx.textAlign = 'right';
        ctx.fillText('1', plotX - 2, plotY + 1);
        ctx.fillText('0', plotX - 2, plotY + plotH - 1);
      }

      // spread band
      const upper = [];
      const lower = [];
      hist.forEach((d) => {
        const geneData = d.genes[species][gene.key];
        upper.push({ x: gx(d.gen), y: gy(geneData.mean + geneData.sd) });
        lower.push({ x: gx(d.gen), y: gy(geneData.mean - geneData.sd) });
      });
      ctx.beginPath();
      upper.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      for (let i = lower.length - 1; i >= 0; i--) ctx.lineTo(lower[i].x, lower[i].y);
      ctx.closePath();
      ctx.fillStyle = rgba(color, 0.12);
      ctx.fill();

      // catastrophe hairlines
      sim.events.forEach((ev) => {
        const xx = gx(ev.gen);
        ctx.strokeStyle = rgba(EVENT_META[ev.type].color, 0.24);
        ctx.beginPath();
        ctx.moveTo(xx + 0.5, plotY);
        ctx.lineTo(xx + 0.5, plotY + plotH);
        ctx.stroke();
      });

      // starting mean as a dotted reference
      const refY = gy(firstValue);
      ctx.save();
      ctx.setLineDash([1.5, 3.5]);
      ctx.strokeStyle = rgba(color, 0.42);
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(plotX, refY + 0.5);
      ctx.lineTo(plotX + plotW, refY + 0.5);
      ctx.stroke();
      ctx.restore();

      // mean line
      ctx.beginPath();
      hist.forEach((d, i) => {
        const geneData = d.genes[species][gene.key];
        const xx = gx(d.gen);
        const yy = gy(geneData.mean);
        if (i === 0) ctx.moveTo(xx, yy);
        else ctx.lineTo(xx, yy);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.shadowColor = rgba(color, 0.35);
      ctx.shadowBlur = 5;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // final marker
      const px = gx(target);
      const py = gy(finalValue);
      if (alive > 0) {
        ctx.beginPath();
        ctx.fillStyle = color;
        ctx.arc(px, py, 1.7, 0, TAU);
        ctx.fill();
      }

      // value and delta
      ctx.textAlign = 'right';
      ctx.font = monoFont(6.4, 500);
      ctx.fillStyle = alive > 0 ? rgba(color, 0.72) : COLOR.bone4;
      const arrow = delta > 0.006 ? '↑' : delta < -0.006 ? '↓' : '→';
      ctx.fillText(alive > 0 ? `${arrow} ${Math.abs(delta).toFixed(2)}` : '—', x + cw - 2, y + ch - 7);
    };

    if (compact) {
      let y = 4;
      const width = w - layout.padX * 2;
      for (const species of speciesOrder) {
        drawHeader(species, layout.padX, y + 7, width);
        y += layout.headerH;
        for (let i = 0; i < GENES.length; i++) {
          if (i > 0) {
            ctx.strokeStyle = 'rgba(195,165,111,0.05)';
            ctx.beginPath();
            ctx.moveTo(layout.padX, y - 2);
            ctx.lineTo(layout.padX + width, y - 2);
            ctx.stroke();
          }
          drawCell(species, GENES[i], layout.padX, y, width, layout.cellH, i === 0);
          y += layout.cellH + layout.gapY;
        }
        y += layout.groupGap - layout.gapY;
      }
      ctx.fillStyle = 'rgba(198,194,178,0.5)';
      ctx.font = monoFont(6.5, 500);
      ctx.textAlign = 'left';
      ctx.fillText('GEN 0', layout.padX, y + 4);
      ctx.textAlign = 'right';
      ctx.fillText(`GEN ${target}`, w - layout.padX, y + 4);
    } else {
      const usable = w - layout.padX * 2 - layout.gapX;
      const colW = usable / 2;
      const top = 4;
      speciesOrder.forEach((species, si) => {
        drawHeader(species, layout.padX + si * (colW + layout.gapX), top + 7, colW);
      });
      const rowsTop = top + layout.headerH;
      const gapTotal = layout.gapY * (GENES.length - 1);
      const rowH = (h - rowsTop - 18 - gapTotal) / GENES.length;
      GENES.forEach((gene, gi) => {
        speciesOrder.forEach((species, si) => {
          const x = layout.padX + si * (colW + layout.gapX);
          const y = rowsTop + gi * (rowH + layout.gapY);
          if (gi > 0) {
            ctx.strokeStyle = 'rgba(195,165,111,0.05)';
            ctx.beginPath();
            ctx.moveTo(x, y - 3);
            ctx.lineTo(x + colW, y - 3);
            ctx.stroke();
          }
          drawCell(species, gene, x, y, colW, rowH, si === 0);
        });
      });
      const bottomY = rowsTop + 4 * rowH + 3 * layout.gapY + 10;
      ctx.fillStyle = 'rgba(198,194,178,0.5)';
      ctx.font = monoFont(6.5, 500);
      ctx.textAlign = 'left';
      ctx.fillText('GEN 0', layout.padX, bottomY);
      ctx.textAlign = 'right';
      ctx.fillText(`GEN ${target}`, w - layout.padX, bottomY);
    }

    ctx.restore();
  }

  /* ======================================================================
     APP + UI
     ====================================================================== */

  const DEFAULT_SEED = 0x7a3f09c1;
  const BASE_TICKS_PER_SECOND = 60;

  const app = {
    sim: null,
    renderer: null,
    miniRenderer: null,
    running: true,
    renderOn: true,
    traceOn: true,
    tempo: 6,
    target: 40,
    enabled: { drought: true, plague: true, frost: true },
    lastFrame: 0,
    acc: 0,
    lastHud: 0,
    rateTicks: 0,
    rateStart: 0,
    measuredRate: BASE_TICKS_PER_SECOND * 6,
    tempoHistory: [],
    coverHistory: [],
    seenEvents: 0,
    seenRescues: 0,
    hover: null,
    pointerActive: false,
    cardDirty: false,
    eventTimer: null,
    finishTimer: null,
    touchTimer: null,
    archiveOpen: false,
    archiveHideTimer: null,
    finishedNotified: false,
    lastSparkSeed: null,
    archiveFocusReturn: null
  };

  const els = {};

  function cacheElements() {
    const ids = [
      'apparatus', 'glass', 'world', 'legendPlant', 'legendPrey', 'legendPred',
      'clockGen', 'clockTarget', 'clockTick', 'clockTempo', 'runState', 'runStateBox',
      'eventBanner', 'eventGlyph', 'eventKicker', 'eventTitle', 'eventNote', 'glassNote',
      'specCard', 'specName', 'specRole', 'specGenes', 'specAge', 'specEnergy',
      'headlessPanel', 'headlessCount',
      'timeline', 'timelineFill', 'timelineHead', 'timelineTicks', 'timelineEnd', 'timelineScale',
      'eventMarkers', 'nextMarker', 'nextEvent', 'nextEventSub',
      'console', 'consoleBody', 'consoleToggle', 'pauseBtn',
      'seedDisplay', 'seedValue', 'seedDown', 'seedUp', 'reseedBtn',
      'horizonValue', 'horizonTrackValue', 'horizonFill', 'genDown', 'genUp',
      'mutation', 'mutationOut', 'regrowth', 'regrowthOut', 'interval', 'intervalOut',
      'tempo', 'dial', 'dialTicks', 'dialArc', 'dialArcBg', 'dialNeedle', 'dialValue', 'actualTicks',
      'sparkSeed', 'sparkMutation', 'sparkRegrowth', 'sparkInterval', 'sparkTempo',
      'traceToggle', 'renderToggle',
      'archive', 'archiveClose', 'archiveTitle', 'archiveDek', 'metaSeed', 'metaHorizon',
      'metaEvents', 'metaChecksum', 'archiveState', 'repeatBtn', 'newBtn', 'copySeed',
      'censusChart', 'driftChart', 'archiveWorld', 'snapshotTag', 'verdictLine', 'verdictBody',
      'eventLog', 'rescueNote', 'censusSummary', 'driftSummary', 'archiveFootSeed',
      'driftWrap', 'archiveBtn', 'liveRegion', 'masthead'
    ];
    for (const id of ids) els[id] = document.getElementById(id);
    els.countPlants = document.querySelector('[data-count="plants"]');
    els.countPrey = document.querySelector('[data-count="prey"]');
    els.countPred = document.querySelector('[data-count="pred"]');
    els.clock = document.querySelector('.clock');
    els.masthead = document.querySelector('.masthead');
    els.chamberFoot = document.querySelector('.chamber-foot');
    els.dists = Array.from(document.querySelectorAll('.dist'));
  }

  /* ---------------------------------------------------------------- helpers */

  function announce(text) {
    if (!els.liveRegion) return;
    els.liveRegion.textContent = '';
    window.setTimeout(() => {
      els.liveRegion.textContent = text;
    }, 30);
  }

  function numberWord(n) {
    const small = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = { 20: 'Twenty', 30: 'Thirty', 40: 'Forty', 50: 'Fifty', 60: 'Sixty', 70: 'Seventy', 80: 'Eighty', 90: 'Ninety' };
    if (n < 20) return small[n];
    if (n < 100) {
      const t = Math.floor(n / 10) * 10;
      const r = n % 10;
      return tens[t] + (r ? '-' + small[r].toLowerCase() : '');
    }
    return String(n);
  }

  function lossShort(ev) {
    if (ev.type === 'drought') return `−${Math.round(ev.losses.plants * 100)}% cover`;
    if (ev.type === 'plague') return `−${Math.round(ev.losses.prey * 100)}% grazers`;
    const parts = [];
    if (ev.losses.prey > 0.004) parts.push(`−${Math.round(ev.losses.prey * 100)}% grazers`);
    if (ev.losses.pred > 0.004) parts.push(`−${Math.round(ev.losses.pred * 100)}% hunters`);
    return parts.length ? parts.join(' · ') : 'no measurable loss';
  }

  function lossLong(ev) {
    if (ev.type === 'drought') return `Ground cover down ${Math.round(ev.losses.plants * 100)} percent.`;
    if (ev.type === 'plague') return `Grazers down ${Math.round(ev.losses.prey * 100)} percent.`;
    const parts = [];
    if (ev.losses.prey > 0.004) parts.push(`grazers down ${Math.round(ev.losses.prey * 100)} percent`);
    if (ev.losses.pred > 0.004) parts.push(`hunters down ${Math.round(ev.losses.pred * 100)} percent`);
    return parts.length ? parts.join(', ') + '.' : 'No measurable loss.';
  }

  function sparkLine(svg, values, options = {}) {
    if (!svg) return;
    const W = 100;
    const H = 30;
    const baseY = 27;
    const parts = [`<path class="base" d="M2 ${baseY}H98"/>`];

    if (options.mode === 'progress') {
      const p = clamp01(options.progress || 0);
      const x = 3 + p * 94;
      parts.push(`<path class="base" d="M3 16H97"/>`);
      if (p > 0.005) parts.push(`<path class="line" d="M3 16H${x.toFixed(2)}"/>`);
      parts.push(`<circle class="dot" cx="${x.toFixed(2)}" cy="16" r="1.35"/>`);
      svg.innerHTML = parts.join('');
      return;
    }

    if (options.mode === 'cadence') {
      const interval = Math.max(1, options.interval || 1);
      const target = Math.max(1, options.target || 1);
      const gen = options.gen || 0;
      for (let g = interval; g <= target; g += interval) {
        const x = 3 + (g / target) * 94;
        parts.push(`<path class="tick${g <= gen ? ' on' : ''}" d="M${x.toFixed(2)} 7V23"/>`);
      }
      if (gen > 0) {
        const nowX = 3 + clamp01(gen / target) * 94;
        parts.push(`<circle class="dot" cx="${nowX.toFixed(2)}" cy="6" r="1.15"/>`);
      }
      svg.innerHTML = parts.join('');
      return;
    }

    const data = (values || []).filter(v => Number.isFinite(v));
    if (!data.length) {
      parts.push(`<path class="line" d="M3 15H97" opacity=".3"/>`);
      svg.innerHTML = parts.join('');
      return;
    }
    let min = Math.min(...data);
    let max = Math.max(...data);
    if (max - min < 1e-9) {
      min -= 0.5;
      max += 0.5;
    }
    const n = data.length;
    const pts = data.map((v, i) => {
      const x = n === 1 ? 97 : 3 + (i / (n - 1)) * 94;
      const y = 24 - ((v - min) / (max - min)) * 18;
      return [x, y];
    });
    if (options.area && n > 1) {
      const area = `M${pts[0][0].toFixed(2)} ${baseY} ` +
        pts.map(p => `L${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ') +
        ` L${pts[n - 1][0].toFixed(2)} ${baseY} Z`;
      parts.push(`<path class="area" d="${area}"/>`);
    }
    const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ');
    parts.push(`<path class="line" d="${line}"/>`);
    const last = pts[pts.length - 1];
    parts.push(`<circle class="dot" cx="${last[0].toFixed(2)}" cy="${last[1].toFixed(2)}" r="1.5"/>`);
    svg.innerHTML = parts.join('');
  }

  /* ---------------------------------------------------------------- dial */

  function polar(cx, cy, radius, degrees) {
    const rad = (degrees * Math.PI) / 180;
    return [cx + radius * Math.sin(rad), cy - radius * Math.cos(rad)];
  }

  function arcPath(radius, startDeg, endDeg) {
    if (endDeg - startDeg <= 0.01) return '';
    const [sx, sy] = polar(60, 60, radius, startDeg);
    const [ex, ey] = polar(60, 60, radius, endDeg);
    const large = endDeg - startDeg > 180 ? 1 : 0;
    return `M${sx.toFixed(2)} ${sy.toFixed(2)} A${radius} ${radius} 0 ${large} 1 ${ex.toFixed(2)} ${ey.toFixed(2)}`;
  }

  function buildDial() {
    const ns = 'http://www.w3.org/2000/svg';
    els.dialTicks.innerHTML = '';
    for (let v = 1; v <= 32; v++) {
      const angle = -135 + ((v - 1) / 31) * 270;
      const major = v === 1 || v === 32 || v % 8 === 0;
      const inner = major ? 40 : 42.5;
      const outer = 46;
      const [x1, y1] = polar(60, 60, inner, angle);
      const [x2, y2] = polar(60, 60, outer, angle);
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', x1.toFixed(2));
      line.setAttribute('y1', y1.toFixed(2));
      line.setAttribute('x2', x2.toFixed(2));
      line.setAttribute('y2', y2.toFixed(2));
      line.setAttribute('class', major ? 'tick major' : 'tick');
      els.dialTicks.appendChild(line);
    }
    els.dialArcBg.setAttribute('d', arcPath(38.5, -135, 135));
    updateDial(Number(els.tempo.value));
  }

  function updateDial(value) {
    const v = clamp(Number(value), 1, 32);
    const t = (v - 1) / 31;
    const angle = -135 + t * 270;
    els.dialValue.textContent = String(v);
    els.dialArc.setAttribute('d', arcPath(38.5, -135, angle));
    const [nx, ny] = polar(60, 60, 30, angle);
    els.dialNeedle.setAttribute('x2', nx.toFixed(2));
    els.dialNeedle.setAttribute('y2', ny.toFixed(2));
    const readout = `×${v} · ${v * BASE_TICKS_PER_SECOND} ticks/sec requested`;
    els.clockTempo.textContent = `×${v}`;
    els.tempo.setAttribute('aria-valuetext', `${v} times, ${v * BASE_TICKS_PER_SECOND} ticks per second`);
    els.dial.title = readout;
  }

  function dialFromPointer(event) {
    const rect = els.dial.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    let angle = Math.atan2(dx, -dy) * (180 / Math.PI);
    if (angle < -135) angle = -135;
    if (angle > 135) angle = 135;
    let value = Math.round(1 + ((angle + 135) / 270) * 31);
    value = clamp(value, 1, 32);
    if (Number(els.tempo.value) !== value) {
      els.tempo.value = String(value);
      els.tempo.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }

  /* ---------------------------------------------------------------- startup */

  function init() {
    cacheElements();
    els.archiveWorld.setAttribute('role', 'img');
    app.renderer = new WorldRenderer(els.world);
    app.miniRenderer = new WorldRenderer(els.archiveWorld, { snapshot: true });
    app.miniRenderer.trace = false;

    buildDial();
    bindControls();
    updateOutputs();
    startWithSeed(DEFAULT_SEED, { running: true, announce: false });
    setRunningUI();
    updateSparklines();
    if (window.matchMedia('(max-width: 760px)').matches) {
      els.console.classList.add('is-collapsed');
      els.consoleToggle.setAttribute('aria-expanded', 'false');
    }
    requestAnimationFrame(loop);

    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => {
        if (!app.sim) return;
        app.renderer.resize();
        if (!app.archiveOpen && app.renderOn) {
          app.renderer.draw(app.sim, { hover: app.hover, trace: app.traceOn });
        }
      });
      observer.observe(els.glass);
    }

    window.addEventListener('resize', debounce(() => {
      if (!app.sim) return;
      if (app.archiveOpen) {
        drawArchiveCharts();
        drawSnapshot();
      } else {
        app.renderer.resize();
        if (app.renderOn) app.renderer.draw(app.sim, { hover: app.hover, trace: app.traceOn });
        updateSpecCardPosition();
      }
    }, 120));

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => {
        if (app.archiveOpen) {
          drawArchiveCharts();
          drawSnapshot();
        }
      });
    }

    window.__vitrine = {
      app,
      Simulation,
      finish() {
        const sim = app.sim;
        let guard = 0;
        while (!sim.finished && guard++ < 40000) sim.step();
      }
    };
  }

  function debounce(fn, delay) {
    let timer = null;
    return function () {
      window.clearTimeout(timer);
      timer = window.setTimeout(fn, delay);
    };
  }

  function startWithSeed(seed, options = {}) {
    if (app.finishTimer) {
      window.clearTimeout(app.finishTimer);
      app.finishTimer = null;
    }
    window.clearTimeout(app.eventTimer);
    window.clearTimeout(app.touchTimer);
    closeArchive({ instant: true, focus: false });
    els.archiveBtn.hidden = true;
    els.pauseBtn.disabled = false;
    els.consoleBody.inert = false;
    els.chamberFoot.inert = false;
    els.apparatus.classList.remove('is-complete');

    const sim = new Simulation({
      seed,
      mutation: Number(els.mutation.value) / 100,
      regrowth: Number(els.regrowth.value),
      eventInterval: Number(els.interval.value),
      targetGenerations: app.target,
      enabled: Object.assign({}, app.enabled)
    });
    app.sim = sim;
    app.seenEvents = 0;
    app.seenRescues = 0;
    app.acc = 0;
    app.lastFrame = performance.now();
    app.rateTicks = 0;
    app.rateStart = performance.now();
    app.measuredRate = BASE_TICKS_PER_SECOND * app.tempo;
    app.tempoHistory = [];
    app.coverHistory = [];
    app.hover = null;
    app.pointerActive = false;
    app.cardDirty = false;
    app.finishedNotified = false;
    app.running = options.running === undefined ? true : options.running;
    app.renderer.pointer.active = false;
    els.glass.classList.remove('inspecting');
    els.specCard.hidden = true;
    els.glassNote.hidden = true;
    els.eventBanner.classList.remove('is-visible');
    els.glass.classList.remove('is-live');
    els.headlessPanel.hidden = app.renderOn;
    els.renderToggle.setAttribute('aria-checked', String(app.renderOn));

    app.renderer.setSim(sim);
    setSeedUI(seed);
    updateOutputs();
    refreshTimeline();
    setRunningUI();
    updateHud(true);
    updateSparklines();
    app.renderer.draw(sim, { hover: null, trace: app.traceOn });

    if (options.announce) {
      announce(`New observation. Seed ${seedHex(seed)}, horizon ${app.target} generations.`);
    }
  }

  function setSeedUI(seed) {
    els.seedValue.textContent = seedGroups(seed);
    els.seedDisplay.title = `0x${seedHex(seed)}`;
    if (app.lastSparkSeed !== seed) {
      app.lastSparkSeed = seed;
      const rng = mulberry32((seed ^ 0x9e3779b9) >>> 0);
      const values = [];
      for (let i = 0; i < 26; i++) values.push(rng());
      sparkLine(els.sparkSeed, values, { area: false });
    }
  }

  function changeSeed(seed, options = {}) {
    startWithSeed(seed >>> 0, {
      running: options.running === undefined ? app.running : options.running,
      announce: true
    });
  }

  /* ---------------------------------------------------------------- bindings */

  function bindControls() {
    els.mutation.addEventListener('input', () => {
      const value = Number(els.mutation.value);
      if (app.sim) app.sim.mutation = value / 100;
      els.mutationOut.innerHTML = `${value.toFixed(1)}<span class="unit">%/birth</span>`;
      els.mutation.setAttribute('aria-valuetext', `${value.toFixed(1)} percent per birth`);
      updateSparklines();
    });

    els.regrowth.addEventListener('input', () => {
      const value = Number(els.regrowth.value);
      if (app.sim) app.sim.regrowth = value;
      els.regrowthOut.innerHTML = `${value.toFixed(1)}<span class="unit">/gen</span>`;
      els.regrowth.setAttribute('aria-valuetext', `${value.toFixed(1)} units per generation`);
      updateSparklines();
    });

    els.interval.addEventListener('input', () => {
      const value = Number(els.interval.value);
      if (app.sim) app.sim.eventInterval = value;
      els.intervalOut.innerHTML = `${value}<span class="unit">gen</span>`;
      els.interval.setAttribute('aria-valuetext', `every ${value} generations`);
      updateNextEvent();
      updateSparklines();
    });

    els.tempo.addEventListener('input', () => {
      app.tempo = clamp(Number(els.tempo.value), 1, 32);
      updateDial(app.tempo);
      app.acc = 0;
      app.rateStart = performance.now();
      app.rateTicks = 0;
    });

    const dialPointer = (event) => {
      event.preventDefault();
      els.tempo.focus({ preventScroll: true });
      if (els.dial.setPointerCapture) {
        try { els.dial.setPointerCapture(event.pointerId); } catch (e) { /* noop */ }
      }
      dialFromPointer(event);
      els.dial.dataset.dragging = 'true';
    };
    els.dial.addEventListener('pointerdown', dialPointer);
    els.dial.addEventListener('pointermove', (event) => {
      if (els.dial.dataset.dragging === 'true') dialFromPointer(event);
    });
    const endDialDrag = () => { els.dial.dataset.dragging = 'false'; };
    els.dial.addEventListener('pointerup', endDialDrag);
    els.dial.addEventListener('pointercancel', endDialDrag);

    els.seedDown.addEventListener('click', () => changeSeed((app.sim.seed - 1) >>> 0));
    els.seedUp.addEventListener('click', () => changeSeed((app.sim.seed + 1) >>> 0));
    els.reseedBtn.addEventListener('click', () => {
      let seed;
      if (window.crypto && window.crypto.getRandomValues) {
        const arr = new Uint32Array(1);
        window.crypto.getRandomValues(arr);
        seed = arr[0] >>> 0;
      } else {
        seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
      }
      if (seed === app.sim.seed) seed = (seed + 1) >>> 0;
      changeSeed(seed);
    });

    els.genDown.addEventListener('click', () => setHorizon(app.target - 5));
    els.genUp.addEventListener('click', () => setHorizon(app.target + 5));

    els.pauseBtn.addEventListener('click', togglePause);
    els.traceToggle.addEventListener('click', toggleTrace);
    els.renderToggle.addEventListener('click', toggleRender);

    els.consoleToggle.addEventListener('click', () => {
      const collapsed = els.console.classList.toggle('is-collapsed');
      els.consoleToggle.setAttribute('aria-expanded', String(!collapsed));
    });

    els.dists.forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.event;
        const next = btn.getAttribute('aria-checked') !== 'true';
        btn.setAttribute('aria-checked', String(next));
        app.enabled[type] = next;
        if (app.sim) app.sim.enabled = Object.assign({}, app.enabled);
        updateNextEvent();
        updateSparklines();
        announce(`${EVENT_META[type].name} ${next ? 'armed' : 'disarmed'}.`);
      });
    });

    els.archiveBtn.addEventListener('click', openArchive);
    els.archiveClose.addEventListener('click', () => closeArchive());
    els.repeatBtn.addEventListener('click', () => {
      const seed = app.sim.seed;
      closeArchive({ instant: true, focus: false });
      startWithSeed(seed, { running: true, announce: true });
      els.pauseBtn.focus({ preventScroll: true });
    });
    els.newBtn.addEventListener('click', () => {
      let seed;
      if (window.crypto && window.crypto.getRandomValues) {
        const arr = new Uint32Array(1);
        window.crypto.getRandomValues(arr);
        seed = arr[0] >>> 0;
      } else {
        seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
      }
      if (seed === app.sim.seed) seed = (seed + 1) >>> 0;
      closeArchive({ instant: true, focus: false });
      startWithSeed(seed, { running: true, announce: true });
      els.pauseBtn.focus({ preventScroll: true });
    });
    els.copySeed.addEventListener('click', copySeedValue);

    els.archive.addEventListener('keydown', onArchiveKeydown);
    document.addEventListener('keydown', onGlobalKeydown);

    els.glass.addEventListener('pointermove', onGlassPointerMove);
    els.glass.addEventListener('pointerdown', onGlassPointerDown);
    els.glass.addEventListener('pointerup', onGlassPointerUp);
    els.glass.addEventListener('pointerleave', onGlassPointerLeave);
    els.glass.addEventListener('pointercancel', onGlassPointerLeave);
    els.glass.addEventListener('focus', () => {
      els.glass.setAttribute('aria-label', glassAriaLabel());
    });
  }

  function updateOutputs() {
    const mutation = Number(els.mutation.value);
    const regrowth = Number(els.regrowth.value);
    const interval = Number(els.interval.value);
    els.mutationOut.innerHTML = `${mutation.toFixed(1)}<span class="unit">%/birth</span>`;
    els.regrowthOut.innerHTML = `${regrowth.toFixed(1)}<span class="unit">/gen</span>`;
    els.intervalOut.innerHTML = `${interval}<span class="unit">gen</span>`;
    els.mutation.setAttribute('aria-valuetext', `${mutation.toFixed(1)} percent per birth`);
    els.regrowth.setAttribute('aria-valuetext', `${regrowth.toFixed(1)} units per generation`);
    els.interval.setAttribute('aria-valuetext', `every ${interval} generations`);
    els.horizonValue.textContent = String(app.target);
    els.horizonTrackValue.textContent = String(app.target);
    els.dialValue.textContent = String(app.tempo);
    updateDial(app.tempo);
  }

  function setHorizon(value) {
    if (!app.sim) return;
    const next = clamp(Math.round(value), 10, 200);
    if (next === app.target) return;
    app.target = next;
    updateOutputs();
    if (app.sim.gen >= next) {
      app.sim.targetGenerations = Math.max(10, app.sim.gen);
      app.target = app.sim.targetGenerations;
      updateOutputs();
      finishRun();
    } else {
      app.sim.targetGenerations = next;
      refreshTimeline();
      updateHud(true);
    }
    announce(`Horizon set to ${app.sim.targetGenerations} generations.`);
  }

  function togglePause() {
    if (!app.sim || app.sim.finished) return;
    app.running = !app.running;
    app.acc = 0;
    app.rateStart = performance.now();
    app.rateTicks = 0;
    setRunningUI();
    announce(app.running ? 'Observation resumed.' : 'Observation paused.');
  }

  function toggleTrace() {
    app.traceOn = !app.traceOn;
    els.traceToggle.setAttribute('aria-checked', String(app.traceOn));
    if (app.sim && !app.archiveOpen && app.renderOn) {
      app.renderer.draw(app.sim, { hover: app.hover, trace: app.traceOn });
    }
  }

  function toggleRender() {
    app.renderOn = !app.renderOn;
    els.renderToggle.setAttribute('aria-checked', String(app.renderOn));
    els.headlessPanel.hidden = app.renderOn;
    if (!app.renderOn) {
      clearPointer();
      els.headlessCount.textContent = `${app.sim.preyAlive} grazers · ${app.sim.predAlive} hunters`;
      announce('Field rendering suspended. The instrument is recording only.');
    } else {
      app.renderer.resize();
      if (app.sim && !app.archiveOpen) {
        app.renderer.draw(app.sim, { hover: app.hover, trace: app.traceOn });
      }
      announce('Field rendering resumed.');
    }
  }

  /* ---------------------------------------------------------------- simulation loop */

  function loop(now) {
    requestAnimationFrame(loop);
    if (!app.sim) return;
    if (!app.lastFrame) app.lastFrame = now;
    const dt = Math.min(120, now - app.lastFrame);
    app.lastFrame = now;

    if (app.running && !app.sim.finished && !app.archiveOpen) {
      app.acc += (dt / 1000) * BASE_TICKS_PER_SECOND * app.tempo;
      let steps = 0;
      const maxSteps = app.renderOn ? 640 : 5200;
      while (app.acc >= 1 && steps < maxSteps && !app.sim.finished) {
        app.sim.step();
        app.acc -= 1;
        steps++;
      }
      if (app.acc > 3) app.acc = 0;
      app.rateTicks += steps;
      if (steps) consumeSimulationNews();
    }

    if (app.sim.finished && !app.finishedNotified && !app.archiveOpen) finishRun();

    if (app.renderOn && !app.archiveOpen) {
      app.renderer.draw(app.sim, { hover: app.hover, trace: app.traceOn });
      if (app.cardDirty && app.pointerActive) {
        updateSpecCardPosition();
        app.cardDirty = false;
      }
    }

    if (now - app.lastHud > 180) {
      updateHud();
      updateSparklines();
      app.lastHud = now;
    }
    updateMeasuredRate(now);
  }

  function updateMeasuredRate(now) {
    if (!app.rateStart) app.rateStart = now;
    const elapsed = now - app.rateStart;
    if (elapsed < 620) return;
    const active = app.running && !app.sim.finished && !app.archiveOpen;
    const instantaneous = active ? (app.rateTicks * 1000) / elapsed : 0;
    app.measuredRate = app.measuredRate * 0.34 + instantaneous * 0.66;
    app.tempoHistory.push(app.measuredRate);
    if (app.tempoHistory.length > 30) app.tempoHistory.shift();
    app.rateTicks = 0;
    app.rateStart = now;
    const display = Math.round(app.measuredRate / 10) * 10;
    els.actualTicks.textContent = fmtInt(display);
    if (app.sim.finished) els.actualTicks.textContent = '0';
  }

  function consumeSimulationNews() {
    const sim = app.sim;
    if (sim.events.length !== app.seenEvents) {
      const fresh = sim.events.slice(app.seenEvents);
      app.seenEvents = sim.events.length;
      refreshTimeline();
      if (fresh.length) showEvent(fresh[fresh.length - 1], sim.events.length - fresh.length);
      for (const ev of fresh) {
        announce(`Disturbance at generation ${ev.gen}: ${EVENT_META[ev.type].name}. ${lossLong(ev)}`);
      }
    }
    if (sim.rescues.length !== app.seenRescues) {
      app.seenRescues = sim.rescues.length;
      refreshTimeline();
    }
  }

  /* ---------------------------------------------------------------- HUD */

  function glassAriaLabel() {
    if (!app.sim) return 'Live ecosystem chamber.';
    const cover = Math.round(app.sim.livePlantCover() * 100);
    return `Live ecosystem. ${cover} percent lichen cover, ${app.sim.preyAlive} grazers and ${app.sim.predAlive} hunters at generation ${app.sim.gen} of ${app.sim.targetGenerations}.`;
  }

  function updateHud(force = false) {
    if (!app.sim) return;
    const sim = app.sim;
    const cover = sim.livePlantCover();
    const coverPct = Math.round(cover * 100);
    app.coverHistory.push(cover);
    if (app.coverHistory.length > 40) app.coverHistory.shift();

    els.countPlants.textContent = `${coverPct}%`;
    els.countPrey.textContent = String(sim.preyAlive);
    els.countPred.textContent = String(sim.predAlive);
    els.legendPlant.classList.toggle('is-lost', coverPct <= 0);
    els.legendPrey.classList.toggle('is-lost', sim.preyAlive === 0);
    els.legendPred.classList.toggle('is-lost', sim.predAlive === 0);

    els.clockGen.textContent = String(sim.gen).padStart(2, '0');
    els.clockTarget.textContent = String(sim.targetGenerations);
    els.clockTick.textContent = `TICK ${fmtInt(sim.tick)}`;
    els.clockTempo.textContent = `×${app.tempo}`;
    els.glass.setAttribute('aria-label', glassAriaLabel());
    els.headlessCount.textContent = `${sim.preyAlive} grazers · ${sim.predAlive} hunters`;

    const target = Math.max(1, sim.targetGenerations);
    const progress = clamp01(sim.gen / target);
    els.timelineFill.style.width = `${(progress * 100).toFixed(2)}%`;
    els.timelineHead.style.left = `${(progress * 100).toFixed(2)}%`;
    els.timelineEnd.textContent = `Generation ${sim.gen} of ${target}`;
    els.horizonFill.style.width = `${(progress * 100).toFixed(2)}%`;
    els.horizonValue.textContent = String(app.target);
    els.horizonTrackValue.textContent = String(app.target);
    els.horizonFill.style.width = `${(clamp01(sim.gen / Math.max(1, app.target)) * 100).toFixed(2)}%`;

    updateNextEvent();
    updateGlassNote();

    if (app.hover && app.hover.alive && !els.specCard.hidden) {
      els.specAge.textContent = String(app.hover.age);
      els.specEnergy.textContent = app.hover.energy.toFixed(2);
    } else if (app.hover && !app.hover.alive) {
      clearPointer();
    }
  }

  function updateNextEvent() {
    if (!app.sim) return;
    const sim = app.sim;
    const armed = Object.values(app.enabled).some(Boolean);
    if (sim.finished) {
      els.nextEvent.textContent = 'CLOSED';
      els.nextEventSub.textContent = 'PLATE SEALED';
      els.nextMarker.style.display = 'none';
      return;
    }
    if (!armed) {
      els.nextEvent.textContent = 'NONE';
      els.nextEventSub.textContent = 'DISARMED';
      els.nextMarker.style.display = 'none';
      return;
    }
    const next = sim.nextEventGen();
    if (next === null) {
      els.nextEvent.textContent = '—';
      els.nextEventSub.textContent = 'NONE AHEAD';
      els.nextMarker.style.display = 'none';
      return;
    }
    els.nextEvent.textContent = `GEN ${String(next).padStart(2, '0')}`;
    els.nextEventSub.textContent = `IN ${Math.max(0, next - sim.gen)} GEN`;
    const target = Math.max(1, sim.targetGenerations);
    els.nextMarker.style.display = 'block';
    els.nextMarker.style.left = `${((next / target) * 100).toFixed(2)}%`;
  }

  function updateGlassNote() {
    const sim = app.sim;
    if (!sim) return;
    let text = '';
    if (sim.finished) text = 'The plate is sealed.';
    else if (sim.preyAlive === 0 && sim.predAlive === 0) text = 'The chamber is quiet.';
    else if (sim.preyAlive === 0) text = 'The grazer line is lost.';
    else if (sim.predAlive === 0) text = 'The hunter line is lost.';
    if (text) {
      els.glassNote.textContent = text;
      els.glassNote.hidden = false;
    } else {
      els.glassNote.hidden = true;
    }
  }

  function updateSparklines() {
    if (!app.sim) return;
    const sim = app.sim;
    const history = sim.history;
    const recent = history.slice(-26);
    const spread = recent.map((h) => {
      let sum = 0;
      let count = 0;
      for (const sp of ['prey', 'pred']) {
        for (const key of GENE_KEYS) {
          sum += h.genes[sp][key].sd;
          count++;
        }
      }
      return sum / count;
    });
    sparkLine(els.sparkMutation, spread, { area: true });
    sparkLine(els.sparkRegrowth, app.coverHistory.slice(-26), { area: true });
    sparkLine(els.sparkInterval, [], {
      mode: 'cadence',
      interval: Math.max(1, sim.eventInterval),
      target: Math.max(1, sim.targetGenerations),
      gen: sim.gen
    });
    sparkLine(els.sparkTempo, app.tempoHistory.slice(-26), { area: false });
    sparkLine(els.sparkHorizon, [], {
      mode: 'progress',
      progress: sim.gen / Math.max(1, sim.targetGenerations)
    });
  }

  function setRunningUI() {
    if (!app.sim) return;
    const finished = app.sim.finished;
    els.clock.classList.toggle('is-paused', !app.running && !finished);
    els.clock.classList.toggle('is-complete', finished);
    els.runState.textContent = finished ? 'Complete' : app.running ? 'Observing' : 'Paused';
    els.pauseBtn.classList.toggle('is-paused', !app.running || finished);
    els.pauseBtn.setAttribute('aria-pressed', String(!app.running));
    els.pauseBtn.setAttribute('aria-label', app.running ? 'Pause observation' : 'Resume observation');
    els.pauseBtn.disabled = finished;
    els.archiveBtn.hidden = !finished;
    els.apparatus.classList.toggle('is-complete', finished);
    if (finished) {
      els.consoleBody.inert = true;
      els.chamberFoot.inert = true;
      if (els.console.classList.contains('is-collapsed')) {
        els.console.classList.remove('is-collapsed');
        els.consoleToggle.setAttribute('aria-expanded', 'true');
      }
    } else {
      els.consoleBody.inert = false;
      els.chamberFoot.inert = false;
    }
    if (!finished) els.actualTicks.textContent = fmtInt(Math.round(app.measuredRate / 10) * 10);
  }

  /* ---------------------------------------------------------------- timeline */

  function refreshTimeline() {
    if (!app.sim) return;
    const sim = app.sim;
    const target = Math.max(1, sim.targetGenerations);
    els.timelineTicks.innerHTML = '';
    const step = target <= 50 ? 1 : target <= 100 ? 2 : target <= 160 ? 4 : 5;
    for (let g = 0; g <= target; g += step) {
      const tick = document.createElement('i');
      tick.style.left = `${((g / target) * 100).toFixed(3)}%`;
      if (g % (step * 5) === 0) tick.className = 'major';
      els.timelineTicks.appendChild(tick);
    }
    els.timeline.setAttribute('aria-label', `Generation record, generation ${sim.gen} of ${target}. Disturbance markers are focusable.`);
    els.timelineEnd.textContent = `Generation ${sim.gen} of ${target}`;
    els.timelineScale.innerHTML = '';
    for (let i = 0; i < 5; i++) {
      const label = document.createElement('span');
      label.textContent = String(Math.round((target * i) / 4));
      els.timelineScale.appendChild(label);
    }

    els.eventMarkers.innerHTML = '';
    els.eventMarkers.setAttribute('role', 'group');
    els.eventMarkers.setAttribute('aria-label', 'Disturbance markers');
    sim.events.forEach((ev, index) => {
      const meta = EVENT_META[ev.type];
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'event-marker';
      btn.style.left = `${((ev.gen / target) * 100).toFixed(3)}%`;
      btn.style.setProperty('--ev', meta.color);
      btn.dataset.num = roman(index + 1);
      btn.setAttribute('aria-label', `${meta.name} disturbance at generation ${ev.gen}. ${lossLong(ev)}`);
      btn.innerHTML = `<span class="stem"></span><span class="marker-tip"><b>${meta.name} · gen ${ev.gen}</b>${lossShort(ev)}</span>`;
      els.eventMarkers.appendChild(btn);
    });

    for (const old of els.timeline.querySelectorAll('.rescue-marker')) old.remove();
    sim.rescues.forEach((rescue) => {
      const dot = document.createElement('span');
      dot.className = 'rescue-marker';
      dot.style.left = `${((rescue.gen / target) * 100).toFixed(3)}%`;
      dot.title = `Refugium flush at gen ${rescue.gen}: +${rescue.prey} grazers${rescue.pred ? `, +${rescue.pred} hunters` : ''}`;
      dot.setAttribute('aria-hidden', 'true');
      els.timeline.appendChild(dot);
    });

    const progress = clamp01(sim.gen / target);
    els.timelineFill.style.width = `${(progress * 100).toFixed(2)}%`;
    els.timelineHead.style.left = `${(progress * 100).toFixed(2)}%`;
    updateNextEvent();
  }

  /* ---------------------------------------------------------------- events */

  function showEvent(ev, index) {
    const meta = EVENT_META[ev.type];
    els.glass.style.setProperty('--ev', meta.color);
    els.eventBanner.style.setProperty('--ev', meta.color);
    els.eventGlyph.innerHTML = meta.glyph;
    els.eventKicker.textContent = `Disturbance ${roman(index + 1)} · generation ${ev.gen}`;
    els.eventTitle.textContent = meta.name;
    const notes = {
      drought: 'The crust withdraws into the crevices.',
      plague: 'A spore bloom crosses the moth line.',
      frost: 'A cold front crosses the glass.'
    };
    els.eventNote.innerHTML = `${notes[ev.type]} <span class="ev-loss">${lossShort(ev)}</span>`;
    els.eventBanner.classList.remove('is-visible');
    els.glass.classList.remove('is-live');
    void els.eventBanner.offsetWidth;
    els.eventBanner.classList.add('is-visible');
    els.glass.classList.add('is-live');
    els.eventBanner.setAttribute('aria-hidden', 'true');
    if (app.eventTimer) window.clearTimeout(app.eventTimer);
    app.eventTimer = window.setTimeout(() => {
      els.eventBanner.classList.remove('is-visible');
      els.glass.classList.remove('is-live');
    }, 5200);
  }

  /* ---------------------------------------------------------------- loupe */

  function onGlassPointerMove(event) {
    if (!app.sim || !app.renderOn || app.archiveOpen) return;
    const rect = els.glass.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    setPointer(x, y, event.pointerType === 'touch' ? 26 : 12);
    if (event.pointerType === 'touch' && app.touchTimer) {
      window.clearTimeout(app.touchTimer);
      app.touchTimer = null;
    }
  }

  function onGlassPointerDown(event) {
    if (!app.sim || !app.renderOn || app.archiveOpen) return;
    const rect = els.glass.getBoundingClientRect();
    setPointer(event.clientX - rect.left, event.clientY - rect.top, event.pointerType === 'touch' ? 27 : 12);
  }

  function onGlassPointerUp(event) {
    if (event.pointerType !== 'touch') return;
    if (app.touchTimer) window.clearTimeout(app.touchTimer);
    app.touchTimer = window.setTimeout(() => {
      clearPointer();
    }, 3200);
  }

  function onGlassPointerLeave(event) {
    if (event.pointerType === 'touch') return;
    clearPointer();
  }

  function setPointer(x, y, threshold) {
    app.pointerActive = true;
    app.renderer.pointer.x = x;
    app.renderer.pointer.y = y;
    app.renderer.pointer.active = true;
    els.glass.classList.add('inspecting');
    const agent = nearestAgent(x, y, threshold);
    if (agent !== app.hover) {
      app.hover = agent;
      if (agent) renderSpecCard(agent);
      else els.specCard.hidden = true;
    } else if (!agent) {
      els.specCard.hidden = true;
    }
    app.cardDirty = true;
  }

  function clearPointer() {
    app.pointerActive = false;
    app.hover = null;
    if (app.renderer) app.renderer.pointer.active = false;
    els.specCard.hidden = true;
    els.glass.classList.remove('inspecting');
    app.cardDirty = false;
  }

  function nearestAgent(px, py, threshold) {
    if (!app.sim) return null;
    const s = app.renderer.scale;
    const ox = app.renderer.offX;
    const oy = app.renderer.offY;
    let best = null;
    let bestD = threshold * threshold;
    for (const list of [app.sim.prey, app.sim.pred]) {
      for (const a of list) {
        if (!a.alive) continue;
        const dx = ox + a.x * s - px;
        const dy = oy + a.y * s - py;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = a;
        }
      }
    }
    return best;
  }

  function renderSpecCard(agent) {
    const meta = SPECIES[agent.species];
    els.specCard.style.setProperty('--sp', meta.color);
    els.specName.textContent = meta.name;
    els.specRole.textContent = meta.tag;
    els.specAge.textContent = String(agent.age);
    els.specEnergy.textContent = agent.energy.toFixed(2);
    els.specGenes.innerHTML = GENES.map((gene) => {
      const value = agent.genes[gene.key];
      return `<div class="spec-gene"><dt>${gene.code}</dt><dd>${value.toFixed(2)}</dd><span class="spec-bar"><i style="width:${(value * 100).toFixed(1)}%"></i></span></div>`;
    }).join('');
    els.specCard.hidden = false;
  }

  function updateSpecCardPosition() {
    if (!app.hover || !app.pointerActive) return;
    const lens = app.renderer.lastLens || {
      x: app.renderer.pointer.x,
      y: app.renderer.pointer.y,
      r: 54
    };
    const w = els.glass.clientWidth;
    const h = els.glass.clientHeight;
    const cardW = els.specCard.offsetWidth || 214;
    const cardH = els.specCard.offsetHeight || 104;
    let left;
    let top;
    if (w < 560) {
      left = 8;
      top = 8;
    } else {
      const gap = 12;
      left = lens.x + lens.r + gap;
      if (left + cardW > w - 8) left = lens.x - lens.r - gap - cardW;
      if (left < 8) left = 8;
      top = clamp(lens.y - cardH / 2, 8, h - cardH - 8);
    }
    els.specCard.style.left = `${Math.round(left)}px`;
    els.specCard.style.top = `${Math.round(top)}px`;
  }

  /* ---------------------------------------------------------------- completion + archive */

  function finishRun() {
    if (!app.sim || app.finishedNotified) return;
    app.finishedNotified = true;
    app.running = false;
    app.sim.finished = true;
    if (app.sim.history.length) {
      app.sim.targetGenerations = app.sim.history[app.sim.history.length - 1].gen;
      app.target = app.sim.targetGenerations;
    }
    updateGlassNote();
    setRunningUI();
    refreshTimeline();
    updateHud(true);
    updateSparklines();
    announce(`Observation complete at generation ${app.sim.gen}. The archive is being prepared.`);
    const delay = reducedMotion() ? 180 : 1000;
    app.finishTimer = window.setTimeout(openArchive, delay);
  }

  function buildArchive() {
    const sim = app.sim;
    const history = sim.history;
    if (!history.length) return;
    const last = history[history.length - 1];
    const first = history[0];
    const lastGen = last.gen;
    const genLabel = numberWord(lastGen);
    els.archiveTitle.innerHTML = `${genLabel} generations, <em>sealed.</em>`;
    els.metaSeed.textContent = seedGroups(sim.seed);
    els.metaHorizon.textContent = `${lastGen} GEN`;
    els.metaEvents.textContent = String(sim.events.length).padStart(2, '0');
    const checksum = sim.checksum().toString(16).toUpperCase().padStart(8, '0');
    els.metaChecksum.textContent = `${checksum.slice(0, 4)} ${checksum.slice(4)}`;
    els.archiveState.textContent = `Archived at generation ${lastGen}`;
    els.archiveFootSeed.textContent = `Seed ${seedGroups(sim.seed)} · deterministic replay`;
    els.snapshotTag.textContent = `Final state · gen ${lastGen}`;

    const drift = driftSentence(sim);
    const minPrey = Math.min(...history.map(h => h.prey));
    const maxPrey = Math.max(...history.map(h => h.prey));
    const minPred = Math.min(...history.map(h => h.pred));
    const maxPred = Math.max(...history.map(h => h.pred));
    const ends = `The chamber closes with ${last.prey} grazers, ${last.pred} hunters and ${Math.round(last.plants * 100)}% lichen cover.`;
    const disturbances = sim.events.length
      ? `${numberWord(sim.events.length)} disturbance${sim.events.length === 1 ? '' : 's'} crossed the plate; the grazer line bottomed at ${minPrey}${sim.rescues.length ? `, and the refugia returned stock ${sim.rescues.length} time${sim.rescues.length === 1 ? '' : 's'}` : ''}.`
      : 'No disturbance crossed the plate.';
    els.archiveDek.innerHTML = `${ends}<br>${drift} ${disturbances}`;

    let verdictLine;
    let verdictBody;
    if (last.prey > 0 && last.pred > 0) {
      verdictLine = 'Both lines persist.';
      verdictBody = `The grazer line moved between ${minPrey} and ${maxPrey}; the hunter line between ${minPred} and ${maxPred}. ${sim.rescues.length ? `The crevices returned stock ${sim.rescues.length} time${sim.rescues.length === 1 ? '' : 's'} to keep the succession going.` : 'No refugium flush was required.'}`;
    } else if (last.prey === 0 && last.pred === 0) {
      verdictLine = 'The chamber is quiet.';
      verdictBody = 'Neither animal line reaches the archive. The lichen sole remains.';
    } else if (last.prey === 0) {
      verdictLine = 'The grazer line is lost.';
      verdictBody = `The final census records ${last.pred} hunters under ${Math.round(last.plants * 100)}% lichen cover. The grazers do not reach the archive.`;
    } else {
      verdictLine = 'The hunter line is lost.';
      verdictBody = `The final census records ${last.prey} grazers under ${Math.round(last.plants * 100)}% lichen cover. The hunters do not reach the archive.`;
    }
    els.verdictLine.textContent = verdictLine;
    els.verdictBody.textContent = verdictBody;

    els.eventLog.innerHTML = '';
    if (!sim.events.length) {
      const li = document.createElement('li');
      li.className = 'log-empty';
      li.textContent = 'No disturbance crossed this plate.';
      els.eventLog.appendChild(li);
    } else {
      sim.events.forEach((ev, index) => {
        const meta = EVENT_META[ev.type];
        const li = document.createElement('li');
        li.style.setProperty('--ev', meta.color);
        li.innerHTML = `<span class="log-glyph">${meta.glyph}</span><span class="log-main"><b>${roman(index + 1)} · ${meta.name}</b>${lossShort(ev)}</span><span class="log-gen">GEN ${String(ev.gen).padStart(2, '0')}</span>`;
        els.eventLog.appendChild(li);
      });
    }

    if (sim.rescues.length) {
      const totalPrey = sim.rescues.reduce((sum, r) => sum + r.prey, 0);
      const totalPred = sim.rescues.reduce((sum, r) => sum + r.pred, 0);
      const gens = sim.rescues.slice(0, 8).map(r => r.gen).join(', ');
      els.rescueNote.innerHTML = `<b>Refugium flush.</b> The crevices returned ${totalPrey} grazers${totalPred ? ` and ${totalPred} hunters` : ''} across generations ${gens}${sim.rescues.length > 8 ? ', and later' : ''}.`;
    } else {
      els.rescueNote.innerHTML = '<b>No refugium flush.</b> The crevices were not needed.';
    }

    const preyPeak = history.reduce((best, h) => (h.prey > best.prey ? h : best), first);
    const predPeak = history.reduce((best, h) => (h.pred > best.pred ? h : best), first);
    els.censusSummary.textContent = `Population census. Grazers peak at ${maxPrey} around generation ${preyPeak.gen}; hunters peak at ${maxPred} around generation ${predPeak.gen}; lichen cover moves between ${Math.round(Math.min(...history.map(h => h.plants)) * 100)} and ${Math.round(Math.max(...history.map(h => h.plants)) * 100)} percent. Disturbances occur at generations ${sim.events.map(e => e.gen).join(', ') || 'none'}.`;

    const driftParts = [];
    for (const sp of ['prey', 'pred']) {
      const aliveSamples = history.filter(h => (sp === 'prey' ? h.prey : h.pred) > 0);
      if (!aliveSamples.length) { driftParts.push(`${sp === 'prey' ? 'grazers' : 'hunters'} absent`); continue; }
      const start = aliveSamples[0];
      const end = aliveSamples[aliveSamples.length - 1];
      for (const gene of GENES) {
        const a = start.genes[sp][gene.key];
        const b = end.genes[sp][gene.key];
        driftParts.push(`${sp === 'prey' ? 'grazer' : 'hunter'} ${gene.label.toLowerCase()} mean ${a.mean.toFixed(2)} to ${b.mean.toFixed(2)}, spread ${a.sd.toFixed(2)} to ${b.sd.toFixed(2)}`);
      }
    }
    els.driftSummary.textContent = `Trait drift. ${driftParts.join('; ')}.`;
    els.copySeed.textContent = 'Copy seed';
  }

  function driftSentence(sim) {
    const history = sim.history;
    if (history.length < 2) return 'The record is too short to resolve a drift.';
    const parts = [];
    for (const sp of ['prey', 'pred']) {
      const alive = history.filter(h => (sp === 'prey' ? h.prey : h.pred) > 0);
      if (alive.length < 2) continue;
      const first = alive[0];
      const last = alive[alive.length - 1];
      let best = null;
      for (const gene of GENES) {
        const delta = last.genes[sp][gene.key].mean - first.genes[sp][gene.key].mean;
        if (!best || Math.abs(delta) > Math.abs(best.delta)) best = { gene, delta };
      }
      if (!best || Math.abs(best.delta) < 0.015) continue;
      const name = sp === 'prey' ? 'grazer' : 'hunter';
      const direction = best.delta > 0 ? 'rose' : 'fell';
      parts.push(`${name} ${best.gene.label.toLowerCase()} ${direction} from ${first.genes[sp][best.gene.key].mean.toFixed(2)} to ${last.genes[sp][best.gene.key].mean.toFixed(2)}`);
    }
    if (!parts.length) return 'Trait means moved less than a hundredth across the archive.';
    const sentence = `${parts.join('; ')}.`;
    return sentence.charAt(0).toUpperCase() + sentence.slice(1);
  }

  function drawArchiveCharts() {
    if (!app.sim || !app.archiveOpen) return;
    drawCensusChart(els.censusChart, app.sim);
    drawDriftChart(els.driftChart, app.sim);
  }

  function drawSnapshot() {
    if (!app.sim || !app.archiveOpen) return;
    app.miniRenderer.trace = false;
    app.miniRenderer.setSim(app.sim);
    app.miniRenderer.draw(app.sim, { trace: false, hover: null });
  }

  function openArchive() {
    if (app.archiveOpen || !app.sim) return;
    if (app.finishTimer) {
      window.clearTimeout(app.finishTimer);
      app.finishTimer = null;
    }
    clearPointer();
    app.archiveOpen = true;
    app.archiveFocusReturn = document.activeElement;
    buildArchive();
    window.clearTimeout(app.archiveHideTimer);
    els.archive.hidden = false;
    els.archive.scrollTop = 0;
    document.body.style.overflow = 'hidden';
    els.masthead.inert = true;
    els.apparatus.inert = true;
    els.archiveClose.focus({ preventScroll: true });
    requestAnimationFrame(() => {
      els.archive.classList.add('is-open');
      requestAnimationFrame(() => {
        drawArchiveCharts();
        drawSnapshot();
      });
    });
    announce('Observation complete. The archive is open.');
  }

  function closeArchive(options = {}) {
    if (!app.archiveOpen) {
      if (els.archive && !els.archive.hidden && options.instant) {
        els.archive.hidden = true;
        els.archive.classList.remove('is-open');
        document.body.style.overflow = '';
        els.masthead.inert = false;
        els.apparatus.inert = false;
      }
      return;
    }
    app.archiveOpen = false;
    window.clearTimeout(app.archiveHideTimer);
    els.archive.classList.remove('is-open');
    document.body.style.overflow = '';
    els.masthead.inert = false;
    els.apparatus.inert = false;
    const finishFocus = () => {
      const target = els.archiveBtn.hidden ? els.pauseBtn : els.archiveBtn;
      if (!target.disabled) target.focus({ preventScroll: true });
    };
    if (options.focus !== false) window.setTimeout(finishFocus, options.instant ? 0 : 120);
    if (options.instant || reducedMotion()) {
      els.archive.hidden = true;
    } else {
      app.archiveHideTimer = window.setTimeout(() => {
        els.archive.hidden = true;
      }, 430);
    }
    if (app.sim && app.renderOn) {
      requestAnimationFrame(() => {
        app.renderer.resize();
        app.renderer.draw(app.sim, { hover: null, trace: app.traceOn });
      });
    }
  }

  function onArchiveKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeArchive();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(els.archive.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )).filter(el => el.offsetParent !== null || el === document.activeElement);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey) {
      if (document.activeElement === first || !els.archive.contains(document.activeElement)) {
        event.preventDefault();
        last.focus();
      }
    } else if (document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  async function copySeedValue() {
    const text = `0x${seedHex(app.sim.seed)}`;
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch (error) {
      ok = false;
    }
    if (!ok) {
      try {
        const field = document.createElement('textarea');
        field.value = text;
        field.setAttribute('readonly', '');
        field.style.position = 'fixed';
        field.style.opacity = '0';
        document.body.appendChild(field);
        field.select();
        document.execCommand('copy');
        document.body.removeChild(field);
        ok = true;
      } catch (error) {
        ok = false;
      }
    }
    els.copySeed.textContent = ok ? 'Copied' : text;
    window.setTimeout(() => {
      els.copySeed.textContent = 'Copy seed';
    }, 1600);
  }

  /* ---------------------------------------------------------------- keyboard */

  function onGlobalKeydown(event) {
    if (app.archiveOpen) return;
    const target = event.target;
    const formish = target && (
      target.tagName === 'INPUT' ||
      target.tagName === 'BUTTON' ||
      target.tagName === 'TEXTAREA' ||
      target.tagName === 'SELECT' ||
      target.isContentEditable
    );
    if (formish) return;
    if (event.code === 'Space') {
      event.preventDefault();
      togglePause();
    } else if (event.key === 'r' || event.key === 'R') {
      event.preventDefault();
      let seed;
      if (window.crypto && window.crypto.getRandomValues) {
        const arr = new Uint32Array(1);
        window.crypto.getRandomValues(arr);
        seed = arr[0] >>> 0;
      } else {
        seed = Math.floor(Math.random() * 0xffffffff) >>> 0;
      }
      if (seed === app.sim.seed) seed = (seed + 1) >>> 0;
      changeSeed(seed);
    } else if (event.key === 'h' || event.key === 'H') {
      event.preventDefault();
      toggleRender();
    }
  }

  init();
})();
