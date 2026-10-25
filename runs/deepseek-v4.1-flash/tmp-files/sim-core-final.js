
(function () {
  "use strict";

  const GRID_W = 112;
  const GRID_H = 84;
  const CELL_COUNT = GRID_W * GRID_H;
  const MAX_PREY = 500;
  const MAX_PREDATORS = 96;

  const GENE_KEYS = ["speed", "vision", "metabolism", "threshold"];
  const GENE_RANGES = {
    prey: {
      speed: [0.6, 3.2],
      vision: [1.5, 13],
      metabolism: [0.35, 2.2],
      threshold: [13, 46]
    },
    predator: {
      speed: [0.75, 4.0],
      vision: [2, 16],
      metabolism: [0.35, 2.2],
      threshold: [32, 100]
    }
  };
  const GENE_LABELS = {
    speed: "Speed",
    vision: "Vision",
    metabolism: "Metabolism",
    threshold: "Repro. threshold"
  };
  const GENE_UNITS = {
    speed: "cells / gen",
    vision: "cells",
    metabolism: "O₂ / gen",
    threshold: "energy"
  };
  const EVENT_META = {
    drought: {
      label: "Drought",
      title: "Solstice deficit",
      kicker: "Disturbance · prolonged dry season",
      glyph: "☼",
      color: "#d9a441",
      wash: "radial-gradient(ellipse at 50% 40%, rgba(217,164,65,.22), transparent 66%)",
      ephemeral: "canopy withdrawal"
    },
    plague: {
      label: "Plague",
      title: "Crimson spore",
      kicker: "Disturbance · pathogenic bloom",
      glyph: "✳",
      color: "#b6a0d9",
      wash: "radial-gradient(ellipse at 55% 45%, rgba(182,160,217,.2), transparent 66%)",
      ephemeral: "grazer die-off"
    },
    surge: {
      label: "Surge",
      title: "Hadal wash",
      kicker: "Disturbance · sediment pulse",
      glyph: "≋",
      color: "#74cbc6",
      wash: "linear-gradient(162deg, rgba(116,203,198,.18), transparent 55%), radial-gradient(ellipse at 70% 65%, rgba(87,142,160,.14), transparent 62%)",
      ephemeral: "mixed mortality"
    }
  };
  const DEFAULT_CONFIG = {
    mutation: 0.08,
    plantRegrowth: 0.045,
    generations: 240,
    intervals: { drought: 130, plague: 190, surge: 90 }
  };

  const clamp = (value, min, max) => value < min ? min : value > max ? max : value;
  const lerp = (a, b, t) => a + (b - a) * t;

  function hashSeed(seed) {
    const input = String(seed);
    let h = 2166136261 >>> 0;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    h ^= h >>> 16;
    h = Math.imul(h, 2246822507);
    h ^= h >>> 13;
    h = Math.imul(h, 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  }

  class SeededRandom {
    constructor(seed) {
      this.seed = String(seed);
      this.state = hashSeed(this.seed) || 0x1a2b3c4d;
    }
    next() {
      let t = this.state += 0x6d2b79f5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    range(min, max) { return min + (max - min) * this.next(); }
    int(maxExclusive) { return Math.floor(this.next() * maxExclusive); }
    chance(probability) { return this.next() < probability; }
    pick(list) { return list[this.int(list.length)]; }
    gauss() {
      let u = 0;
      let v = 0;
      while (u === 0) u = this.next();
      while (v === 0) v = this.next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
    shuffle(list) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = this.int(i + 1);
        const tmp = list[i];
        list[i] = list[j];
        list[j] = tmp;
      }
      return list;
    }
  }

  const geneRange = (species, key) => GENE_RANGES[species][key];

  function mutateGene(value, mutation, range, rng) {
    if (mutation <= 0) return value;
    const span = range[1] - range[0];
    const next = value + rng.gauss() * mutation * span * 0.34;
    return clamp(next, range[0], range[1]);
  }

  function average(values) {
    if (!values.length) return null;
    let total = 0;
    for (let i = 0; i < values.length; i++) total += values[i];
    return total / values.length;
  }

  function deviation(values, mean) {
    if (values.length < 2 || mean == null) return null;
    let total = 0;
    for (let i = 0; i < values.length; i++) {
      const d = values[i] - mean;
      total += d * d;
    }
    return Math.sqrt(total / (values.length - 1));
  }

  function summarizeTraits(agents, species) {
    const output = {};
    for (const key of GENE_KEYS) {
      const values = new Array(agents.length);
      for (let i = 0; i < agents.length; i++) values[i] = agents[i].genes[key];
      const mean = average(values);
      output[key] = { mean, sd: deviation(values, mean) };
    }
    return output;
  }

  class VivariumSim {
    constructor(options = {}) {
      const intervals = Object.assign({}, DEFAULT_CONFIG.intervals, options.intervals || {});
      this.seed = String(options.seed == null ? "1884" : options.seed);
      this.target = Math.max(1, Math.round(Number(options.generations ?? DEFAULT_CONFIG.generations) || DEFAULT_CONFIG.generations));
      this.mutation = clamp(Number(options.mutation ?? DEFAULT_CONFIG.mutation), 0, 0.24);
      this.plantRegrowth = clamp(Number(options.plantRegrowth ?? DEFAULT_CONFIG.plantRegrowth), 0.001, 0.2);
      this.intervals = {
        drought: clamp(Math.round(Number(intervals.drought) || 0), 0, 480),
        plague: clamp(Math.round(Number(intervals.plague) || 0), 0, 480),
        surge: clamp(Math.round(Number(intervals.surge) || 0), 0, 480)
      };
      this.rng = new SeededRandom(this.seed);
      this.generation = 0;
      this.plants = new Float32Array(CELL_COUNT);
      this.prey = [];
      this.predators = [];
      this.nextId = 1;
      this.nextEvent = { drought: Infinity, plague: Infinity, surge: Infinity };
      this.active = { drought: 0, plague: 0, surge: 0 };
      this.history = [];
      this.eventLog = [];
      this.totals = {
        births: 0,
        deaths: 0,
        starved: 0,
        aged: 0,
        predated: 0,
        plantBites: 0,
        eventLosses: 0
      };
      this._lastPlantScan = null;
      this._initializeSchedule();
      this._seedHabitat();
      this._record([]);
    }

    _initializeSchedule() {
      for (const type of Object.keys(this.intervals)) {
        this.nextEvent[type] = this.intervals[type] > 0 ? this.intervals[type] : Infinity;
      }
    }

    _seedHabitat() {
      const rng = this.rng;
      const plants = this.plants;

      const clumpCount = 90;
      for (let c = 0; c < clumpCount; c++) {
        const cx = rng.range(3, GRID_W - 4);
        const cy = rng.range(3, GRID_H - 4);
        const radius = rng.range(1.4, 6.2);
        const strength = rng.range(0.35, 1);
        const y0 = Math.max(0, Math.floor(cy - radius));
        const y1 = Math.min(GRID_H - 1, Math.ceil(cy + radius));
        const x0 = Math.max(0, Math.floor(cx - radius));
        const x1 = Math.min(GRID_W - 1, Math.ceil(cx + radius));
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            const dx = x - cx;
            const dy = y - cy;
            const d = Math.sqrt(dx * dx + dy * dy) / radius;
            if (d <= 1) {
              const falloff = 1 - d * d;
              const i = y * GRID_W + x;
              const value = clamp(strength * falloff * rng.range(0.65, 1.15), 0, 1);
              if (value > plants[i]) plants[i] = value;
            }
          }
        }
      }

      for (let i = 0; i < 360; i++) {
        const index = rng.int(CELL_COUNT);
        if (plants[index] < 0.1) plants[index] = rng.range(0.12, 0.55);
      }

      const preyCount = 104;
      for (let i = 0; i < preyCount; i++) {
        const genes = {
          speed: clamp(1.28 + rng.gauss() * 0.22, 0.6, 3.2),
          vision: clamp(6.4 + rng.gauss() * 1.05, 1.5, 13),
          metabolism: clamp(0.92 + rng.gauss() * 0.12, 0.35, 2.2),
          threshold: clamp(29 + rng.gauss() * 2.8, 13, 46)
        };
        this.prey.push(this._createAgent("prey", rng.int(GRID_W), rng.int(GRID_H), genes, rng.range(17, 25)));
      }

      const predatorCount = 26;
      for (let i = 0; i < predatorCount; i++) {
        const genes = {
          speed: clamp(1.92 + rng.gauss() * 0.22, 0.75, 4.0),
          vision: clamp(8.1 + rng.gauss() * 1.1, 2, 16),
          metabolism: clamp(0.92 + rng.gauss() * 0.12, 0.35, 2.2),
          threshold: clamp(73 + rng.gauss() * 4.2, 32, 100)
        };
        this.predators.push(this._createAgent("predator", rng.int(GRID_W), rng.int(GRID_H), genes, rng.range(43, 56)));
      }
    }

    _createAgent(species, x, y, genes, energy) {
      const prey = species === "prey";
      return {
        id: this.nextId++,
        species,
        x: clamp(x, 0, GRID_W - 1),
        y: clamp(y, 0, GRID_H - 1),
        genes: {
          speed: genes.speed,
          vision: genes.vision,
          metabolism: genes.metabolism,
          threshold: genes.threshold
        },
        energy,
        age: 0,
        lifespan: prey ? 150 + this.rng.range(0, 60) : 190 + this.rng.range(0, 80),
        cooldown: prey ? this.rng.range(0, 7) : this.rng.range(4, 14),
        heading: this.rng.range(0, Math.PI * 2),
        dead: false,
        kills: 0
      };
    }

    updateConfig(patch = {}) {
      if (patch.mutation != null) this.mutation = clamp(Number(patch.mutation), 0, 0.24);
      if (patch.plantRegrowth != null) this.plantRegrowth = clamp(Number(patch.plantRegrowth), 0.001, 0.2);
      if (patch.generations != null) {
        this.target = Math.max(1, Math.round(Number(patch.generations) || this.target));
      }
      if (patch.intervals) {
        for (const type of Object.keys(this.intervals)) {
          if (patch.intervals[type] == null) continue;
          const nextInterval = clamp(Math.round(Number(patch.intervals[type]) || 0), 0, 480);
          if (nextInterval === this.intervals[type]) continue;
          this.intervals[type] = nextInterval;
          this.nextEvent[type] = nextInterval > 0 ? this.generation + nextInterval : Infinity;
        }
      }
    }

    step() {
      if (this.generation >= this.target) return [];
      this.generation++;
      for (const type of Object.keys(this.active)) {
        if (this.active[type] > 0) this.active[type]--;
      }

      this._growPlants();
      this._updatePrey();
      this._updatePredators();
      const events = this._fireDisturbances();
      this._filterDead();
      this._record(events);
      return events;
    }

    _growPlants() {
      const growth = this.plantRegrowth * (this.active.drought > 0 ? 0.16 : 1);
      const plants = this.plants;
      let coverage = 0;
      let biomass = 0;

      for (let y = 0; y < GRID_H; y++) {
        for (let x = 0; x < GRID_W; x++) {
          const i = y * GRID_W + x;
          const value = plants[i];
          if (value > 0) {
            const next = Math.min(1, value + growth * (0.36 + 0.64 * (1 - value)));
            plants[i] = next;
            biomass += next;
            if (next > 0.1) coverage++;
          } else {
            let neighbor = 0;
            if (x > 0) neighbor = Math.max(neighbor, plants[i - 1]);
            if (x < GRID_W - 1) neighbor = Math.max(neighbor, plants[i + 1]);
            if (y > 0) neighbor = Math.max(neighbor, plants[i - GRID_W]);
            if (y < GRID_H - 1) neighbor = Math.max(neighbor, plants[i + GRID_W]);
            if (neighbor > 0.42 && this.rng.chance(growth * 0.9)) {
              const sprout = Math.min(neighbor * 0.48, growth * 8 + 0.04);
              plants[i] = sprout;
              biomass += sprout;
              coverage++;
            }
          }
        }
      }

      this._lastPlantScan = {
        coverage: coverage / CELL_COUNT * 100,
        biomass: biomass / CELL_COUNT * 100
      };
    }

    _movementSteps(agent) {
      const speed = agent.genes.speed;
      const whole = Math.floor(speed);
      const frac = speed - whole;
      return Math.max(1, whole + (this.rng.next() < frac ? 1 : 0));
    }

    _findPlant(agent) {
      const radius = Math.ceil(agent.genes.vision);
      const cx = agent.x;
      const cy = agent.y;
      const visionSq = agent.genes.vision * agent.genes.vision;
      let best = null;
      let bestScore = -Infinity;

      for (let dy = -radius; dy <= radius; dy++) {
        const y = cy + dy;
        if (y < 0 || y >= GRID_H) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const x = cx + dx;
          if (x < 0 || x >= GRID_W) continue;
          const distSq = dx * dx + dy * dy;
          if (distSq > visionSq) continue;
          const i = y * GRID_W + x;
          const plant = this.plants[i];
          if (plant < 0.06) continue;
          const dist = Math.sqrt(distSq);
          const score = plant / (0.8 + dist * 0.72);
          if (score > bestScore) {
            bestScore = score;
            best = { x, y, index: i, plant, dist };
          }
        }
      }
      return best;
    }

    _findThreat(agent) {
      let nearest = null;
      let nearestSq = agent.genes.vision * agent.genes.vision;
      for (const predator of this.predators) {
        if (predator.dead) continue;
        const dx = predator.x - agent.x;
        const dy = predator.y - agent.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < nearestSq) {
          nearestSq = dSq;
          nearest = predator;
        }
      }
      return nearest ? { predator: nearest, distance: Math.sqrt(nearestSq) } : null;
    }

    _findPreyTarget(agent) {
      let nearest = null;
      let bestScore = -Infinity;
      const visionSq = agent.genes.vision * agent.genes.vision;
      for (const prey of this.prey) {
        if (prey.dead) continue;
        const dx = prey.x - agent.x;
        const dy = prey.y - agent.y;
        const dSq = dx * dx + dy * dy;
        if (dSq > visionSq) continue;
        const dist = Math.sqrt(dSq);
        const body = 0.55 + Math.min(1, prey.energy / Math.max(1, prey.genes.threshold)) * 0.45;
        const score = body / (1 + dist * 0.85);
        if (score > bestScore) {
          bestScore = score;
          nearest = prey;
        }
      }
      return nearest;
    }

    _stepToward(agent, targetX, targetY, maxSteps, stopAtTarget, onArrive) {
      let steps = 0;
      for (let s = 0; s < maxSteps; s++) {
        if (agent.x === targetX && agent.y === targetY) break;
        let candidates = [];
        let bestDist = Infinity;

        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = agent.x + dx;
            const ny = agent.y + dy;
            if (nx < 0 || nx >= GRID_W || ny < 0 || ny >= GRID_H) continue;
            const ddx = targetX - nx;
            const ddy = targetY - ny;
            const dSq = ddx * ddx + ddy * ddy;
            if (dSq + 0.0001 < bestDist) {
              bestDist = dSq;
              candidates = [{ x: nx, y: ny }];
            } else if (Math.abs(dSq - bestDist) < 0.0001) {
              candidates.push({ x: nx, y: ny });
            }
          }
        }

        if (candidates.length) {
          const choice = candidates.length === 1 ? candidates[0] : candidates[this.rng.int(candidates.length)];
          agent.x = choice.x;
          agent.y = choice.y;
        } else {
          const angle = agent.heading + this.rng.range(-0.7, 0.7);
          agent.x = clamp(agent.x + Math.round(Math.cos(angle)), 0, GRID_W - 1);
          agent.y = clamp(agent.y + Math.round(Math.sin(angle)), 0, GRID_H - 1);
        }

        const dx = targetX - agent.x;
        const dy = targetY - agent.y;
        agent.heading = Math.atan2(dy, dx);
        steps++;
        if (stopAtTarget && agent.x === targetX && agent.y === targetY) {
          if (onArrive) onArrive();
          break;
        }
      }
      return steps;
    }

    _wander(agent, maxSteps) {
      let steps = 0;
      for (let s = 0; s < maxSteps; s++) {
        agent.heading += this.rng.range(-0.9, 0.9);
        const nx = clamp(agent.x + Math.round(Math.cos(agent.heading)), 0, GRID_W - 1);
        const ny = clamp(agent.y + Math.round(Math.sin(agent.heading)), 0, GRID_H - 1);
        if (nx === agent.x && ny === agent.y) {
          agent.heading += Math.PI * 0.7;
        } else {
          agent.x = nx;
          agent.y = ny;
          steps++;
        }
      }
      return steps;
    }

    _consumePlant(agent) {
      const index = agent.y * GRID_W + agent.x;
      const available = this.plants[index];
      if (available > 0.025) {
        const bite = Math.min(available, 0.54);
        this.plants[index] = Math.max(0, available - bite);
        const gain = bite * (5.8 + agent.genes.metabolism * 0.55);
        agent.energy += gain;
        this.totals.plantBites += 1;
        return bite;
      }
      return 0;
    }

    _updatePrey() {
      const rng = this.rng;
      const births = [];
      rng.shuffle(this.prey);

      for (const agent of this.prey) {
        if (agent.dead) continue;
        agent.age++;
        if (agent.cooldown > 0) agent.cooldown--;

        const threat = this._findThreat(agent);
        const target = threat ? null : this._findPlant(agent);
        const maxSteps = this._movementSteps(agent);
        let moved = 0;

        if (threat) {
          const dx = agent.x - threat.predator.x;
          const dy = agent.y - threat.predator.y;
          const len = Math.sqrt(dx * dx + dy * dy) || 1;
          const fleeX = clamp(Math.round(agent.x + (dx / len) * 7 + rng.range(-1.4, 1.4)), 0, GRID_W - 1);
          const fleeY = clamp(Math.round(agent.y + (dy / len) * 7 + rng.range(-1.4, 1.4)), 0, GRID_H - 1);
          moved = this._stepToward(agent, fleeX, fleeY, maxSteps + 1, false);
        } else if (target && (target.x !== agent.x || target.y !== agent.y)) {
          moved = this._stepToward(agent, target.x, target.y, maxSteps, true);
        } else if (!target) {
          moved = this._wander(agent, maxSteps);
        } else {
          agent.heading = rng.range(0, Math.PI * 2);
        }

        this._consumePlant(agent);

        const cost = 0.64 + agent.genes.metabolism * 0.78 + agent.genes.vision * 0.018
          + agent.genes.speed * 0.08 + moved * (0.105 + agent.genes.metabolism * 0.03);
        agent.energy -= cost;

        if (agent.energy >= agent.genes.threshold && agent.cooldown <= 0 && this.prey.length + births.length < MAX_PREY) {
          const child = this._reproduce(agent, "prey");
          if (child) {
            births.push(child);
            this.totals.births++;
          }
        }

        if (agent.energy <= 0) {
          agent.dead = true;
          this.totals.starved++;
          this._compost(agent, 0.13);
        } else if (agent.age > agent.lifespan) {
          agent.dead = true;
          this.totals.aged++;
          this._compost(agent, 0.2);
        }
      }

      this.prey = this.prey.filter(agent => !agent.dead);
      this.prey.push(...births);
    }

    _reproduce(parent, species) {
      const births = species === "prey" ? MAX_PREY : MAX_PREDATORS;
      const currentPopulation = species === "prey" ? this.prey.length : this.predators.length;
      if (currentPopulation >= births) return null;

      const mutation = this.mutation;
      const rng = this.rng;
      const genes = {};
      for (const key of GENE_KEYS) {
        genes[key] = mutateGene(parent.genes[key], mutation, geneRange(species, key), rng);
      }

      let px = parent.x;
      let py = parent.y;
      for (let i = 0; i < 10; i++) {
        const nx = clamp(parent.x + rng.int(3) - 1, 0, GRID_W - 1);
        const ny = clamp(parent.y + rng.int(3) - 1, 0, GRID_H - 1);
        if (nx !== parent.x || ny !== parent.y) {
          px = nx;
          py = ny;
          break;
        }
      }

      const childEnergy = parent.energy * (species === "prey" ? 0.41 : 0.43);
      parent.energy *= species === "prey" ? 0.55 : 0.56;
      parent.cooldown = species === "prey" ? 11 : 18;

      const child = this._createAgent(species, px, py, genes, childEnergy);
      child.cooldown = species === "prey" ? rng.range(3, 6) : rng.range(7, 12);
      child.heading = parent.heading + rng.range(-0.6, 0.6);
      return child;
    }

    _updatePredators() {
      const rng = this.rng;
      const births = [];
      rng.shuffle(this.predators);

      for (const agent of this.predators) {
        if (agent.dead) continue;
        agent.age++;
        if (agent.cooldown > 0) agent.cooldown--;

        const target = this._findPreyTarget(agent);
        const maxSteps = this._movementSteps(agent);
        let moved = 0;
        let caught = false;

        if (target) {
          for (let s = 0; s <= maxSteps; s++) {
            if (target.dead) break;
            const dx = target.x - agent.x;
            const dy = target.y - agent.y;
            const inReach = Math.abs(dx) <= 1 && Math.abs(dy) <= 1;
            if (inReach) {
              const catchChance = clamp(0.5 + (agent.genes.speed - target.genes.speed) * 0.22 + (agent.genes.vision - target.genes.vision) * 0.008, 0.22, 0.94);
              if (rng.chance(catchChance)) {
                const preyEnergy = target.energy;
                target.dead = true;
                this.totals.predated++;
                agent.kills++;
                agent.energy += 12 + preyEnergy * 0.6 + target.genes.speed * 0.55;
                target.energy = 0;
                this._compost(target, 0.05);
                caught = true;
                break;
              }
              target.energy -= 0.55;
              target.heading += Math.PI * 0.75;
              agent.energy -= 0.2;
              const escapeX = clamp(target.x + rng.int(3) - 1, 0, GRID_W - 1);
              const escapeY = clamp(target.y + rng.int(3) - 1, 0, GRID_H - 1);
              target.x = escapeX;
              target.y = escapeY;
              moved++;
              break;
            }
            if (s === maxSteps) break;
            const beforeX = agent.x;
            const beforeY = agent.y;
            const nextX = clamp(agent.x + Math.sign(dx), 0, GRID_W - 1);
            const nextY = clamp(agent.y + Math.sign(dy), 0, GRID_H - 1);
            if (nextX !== beforeX || nextY !== beforeY) {
              agent.x = nextX;
              agent.y = nextY;
              moved++;
            } else {
              break;
            }
            agent.heading = Math.atan2(dy, dx);
          }
        } else {
          moved = this._wander(agent, maxSteps);
        }

        const cost = 0.64 + agent.genes.metabolism * 0.62 + agent.genes.vision * 0.021
          + agent.genes.speed * 0.09 + moved * (0.115 + agent.genes.metabolism * 0.03);
        agent.energy -= cost;

        if (!caught && agent.energy >= agent.genes.threshold && agent.cooldown <= 0 && this.predators.length + births.length < MAX_PREDATORS) {
          const child = this._reproduce(agent, "predator");
          if (child) {
            births.push(child);
            this.totals.births++;
          }
        }

        if (agent.energy <= 0) {
          agent.dead = true;
          this.totals.starved++;
          this._compost(agent, 0.24);
        } else if (agent.age > agent.lifespan) {
          agent.dead = true;
          this.totals.aged++;
          this._compost(agent, 0.3);
        }
      }

      this.predators = this.predators.filter(agent => !agent.dead);
      this.predators.push(...births);
    }

    _compost(agent, amount) {
      const index = agent.y * GRID_W + agent.x;
      this.plants[index] = Math.min(1, this.plants[index] + amount);
    }

    _fireDisturbances() {
      const events = [];
      for (const type of ["drought", "plague", "surge"]) {
        const interval = this.intervals[type];
        if (interval <= 0) {
          this.nextEvent[type] = Infinity;
          continue;
        }
        if (this.generation < this.nextEvent[type]) continue;

        const meta = EVENT_META[type];
        const before = {
          prey: this.prey.length,
          predators: this.predators.length,
          plants: this._plantMass()
        };
        let loss = "";
        let lossPct = 0;

        if (type === "drought") {
          let lost = 0;
          let total = 0;
          for (let i = 0; i < CELL_COUNT; i++) {
            const value = this.plants[i];
            if (value <= 0) continue;
            total += value;
            if (this.rng.chance(0.68)) {
              this.plants[i] = value * this.rng.range(0.04, 0.28);
            } else {
              this.plants[i] = value * this.rng.range(0.48, 0.85);
            }
            lost += value - this.plants[i];
          }
          this.active.drought = 9;
          lossPct = total > 0 ? Math.round(lost / total * 100) : 0;
          loss = `flora −${lossPct}%`;
        } else if (type === "plague") {
          let killed = 0;
          for (const prey of this.prey) {
            if (!prey.dead && this.rng.chance(0.34)) {
              prey.dead = true;
              killed++;
              this.plants[prey.y * GRID_W + prey.x] = Math.min(1, this.plants[prey.y * GRID_W + prey.x] + 0.08);
            }
          }
          this.active.plague = 5;
          lossPct = before.prey > 0 ? Math.round(killed / before.prey * 100) : 0;
          loss = `grazers −${lossPct}%`;
          this.totals.eventLosses += killed;
          this._filterDead();
        } else {
          let preyKilled = 0;
          let predatorKilled = 0;
          for (const prey of this.prey) {
            if (!prey.dead && this.rng.chance(0.13)) {
              prey.dead = true;
              preyKilled++;
            }
          }
          for (const predator of this.predators) {
            if (!predator.dead && this.rng.chance(0.1)) {
              predator.dead = true;
              predatorKilled++;
            }
          }
          let lost = 0;
          let total = 0;
          for (let i = 0; i < CELL_COUNT; i++) {
            const value = this.plants[i];
            if (value <= 0) continue;
            total += value;
            this.plants[i] = value * this.rng.range(0.5, 0.9);
            lost += value - this.plants[i];
          }
          this.active.surge = 4;
          lossPct = total > 0 ? Math.round(lost / total * 100) : 0;
          loss = `mixed −${Math.round(Math.max(preyKilled / Math.max(1, before.prey), predatorKilled / Math.max(1, before.predators)) * 100)}% · flora −${lossPct}%`;
          this.totals.eventLosses += preyKilled + predatorKilled;
          this._filterDead();
        }

        const event = {
          id: `${type}-${this.generation}`,
          type,
          generation: this.generation,
          label: meta.label,
          title: meta.title,
          kicker: meta.kicker,
          glyph: meta.glyph,
          color: meta.color,
          detail: loss,
          lossPct
        };
        this.eventLog.push(event);
        events.push(event);
        this.nextEvent[type] += interval;
        if (this.nextEvent[type] <= this.generation) this.nextEvent[type] = this.generation + interval;
      }
      return events;
    }

    _filterDead() {
      const before = this.prey.length + this.predators.length;
      this.prey = this.prey.filter(agent => !agent.dead);
      this.predators = this.predators.filter(agent => !agent.dead);
      this.totals.deaths += Math.max(0, before - this.prey.length - this.predators.length);
    }

    _plantMass() {
      let mass = 0;
      for (let i = 0; i < CELL_COUNT; i++) mass += this.plants[i];
      return mass / CELL_COUNT * 100;
    }

    _record(events) {
      let coverage = 0;
      let biomass = 0;
      for (let i = 0; i < CELL_COUNT; i++) {
        const value = this.plants[i];
        biomass += value;
        if (value > 0.1) coverage++;
      }

      const entry = {
        generation: this.generation,
        events: events.map(event => event.type),
        plants: coverage / CELL_COUNT * 100,
        biomass: biomass / CELL_COUNT * 100,
        prey: this.prey.length,
        predators: this.predators.length,
        traits: {
          prey: summarizeTraits(this.prey, "prey"),
          predator: summarizeTraits(this.predators, "predator")
        }
      };
      this.totals.deaths = this.totals.starved + this.totals.aged + this.totals.predated + this.totals.eventLosses;
      this.history.push(entry);
      this.latest = entry;
      return entry;
    }

    getSnapshot() {
      const latest = this.latest || this.history[this.history.length - 1];
      return {
        generation: this.generation,
        target: this.target,
        latest,
        eventLog: this.eventLog.slice(),
        nextEvent: Object.assign({}, this.nextEvent),
        totals: Object.assign({}, this.totals),
        config: {
          mutation: this.mutation,
          plantRegrowth: this.plantRegrowth,
          intervals: Object.assign({}, this.intervals)
        }
      };
    }

    exportResult() {
      return {
        seed: this.seed,
        generations: this.generation,
        target: this.target,
        history: this.history,
        events: this.eventLog.slice(),
        totals: Object.assign({}, this.totals),
        config: {
          mutation: this.mutation,
          plantRegrowth: this.plantRegrowth,
          intervals: Object.assign({}, this.intervals)
        },
        final: {
          prey: this.prey.length,
          predators: this.predators.length,
          plants: this.latest ? this.latest.plants : 0,
          biomass: this.latest ? this.latest.biomass : 0
        }
      };
    }

    static runHeadless(options = {}) {
      const sim = new VivariumSim(options);
      sim.target = Math.max(1, Math.round(Number(options.generations ?? sim.target)));
      const limit = Number(options.maxGenerations ?? sim.target);
      while (sim.generation < Math.min(sim.target, limit)) sim.step();
      return sim.exportResult();
    }

    static compareSeeds(seed, generations = 240, options = {}) {
      const a = VivariumSim.runHeadless(Object.assign({}, options, { seed, generations }));
      const b = VivariumSim.runHeadless(Object.assign({}, options, { seed, generations }));
      return {
        identical: JSON.stringify(a) === JSON.stringify(b),
        a,
        b
      };
    }
  }

  const api = {
    Simulation: VivariumSim,
    SeededRandom,
    hashSeed,
    GENE_KEYS,
    GENE_LABELS,
    GENE_UNITS,
    GENE_RANGES,
    GRID_W,
    GRID_H,
    CELL_COUNT,
    MAX_PREY,
    MAX_PREDATORS,
    EVENT_META,
    DEFAULT_CONFIG,
    // Headless: window.Vivarium.runHeadless({ seed: 1884, generations: 240 })
    // runs entirely without DOM or animation frames and returns the full history.
    runHeadless: options => VivariumSim.runHeadless(options),
    compareSeeds: (seed, generations, options) => VivariumSim.compareSeeds(seed, generations, options),
    create: options => new VivariumSim(options)
  };

  if (typeof window !== "undefined") window.Vivarium = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})();
