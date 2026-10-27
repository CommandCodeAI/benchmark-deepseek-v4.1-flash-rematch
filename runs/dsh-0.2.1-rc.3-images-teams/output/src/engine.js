/* =========================================================================
   VIVARIUM — simulation engine
   A seeded, DOM-free ecosystem of flora, herbivora and carnivora.
   All randomness flows through one small deterministic PRNG, so the same
   seed and configuration always reproduce the same run.
   ========================================================================= */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- PRNG */

  function makePRNG(seed) {
    // sfc32, seeded through splitmix32. Fast, small, good enough for life.
    let a = 0x9e3779b9, b = 0x243f6a88, c = 0xb7e15162, d = (seed >>> 0) || 1;
    function splitmix(x) {
      x = (x + 0x9e3779b9) | 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
      return (z ^ (z >>> 15)) >>> 0;
    }
    a = splitmix(d);
    b = splitmix(a);
    c = splitmix(b);
    d = splitmix(c + 0x9e3779b9);

    function next() {
      let t = (a + b) | 0;
      a = b ^ (b >>> 9);
      b = (c + (c << 3)) | 0;
      c = (c << 21) | (c >>> 11);
      d = (d + 1) | 0;
      t = (t + d) | 0;
      c = (c + t) | 0;
      return (t >>> 0) / 4294967296;
    }

    let gaussSpare = null;
    const api = {
      next,
      int(n) { return Math.floor(next() * n); },
      range(lo, hi) { return lo + next() * (hi - lo); },
      chance(p) { return next() < p; },
      pick(arr) { return arr[Math.floor(next() * arr.length)]; },
      gauss() {
        if (gaussSpare !== null) {
          const v = gaussSpare; gaussSpare = null; return v;
        }
        let u = next();
        if (u < 1e-12) u = 1e-12;
        const v = next();
        const mag = Math.sqrt(-2 * Math.log(u));
        gaussSpare = mag * Math.sin(2 * Math.PI * v);
        return mag * Math.cos(2 * Math.PI * v);
      },
      shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(next() * (i + 1));
          const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
        }
        return arr;
      },
      getState() { return [a >>> 0, b >>> 0, c >>> 0, d >>> 0, gaussSpare]; },
      setState(s) {
        a = s[0] | 0; b = s[1] | 0; c = s[2] | 0; d = s[3] | 0;
        gaussSpare = s[4] === undefined ? null : s[4];
      }
    };
    return api;
  }

  /* ------------------------------------------------------------- constants */

  const TAU = Math.PI * 2;
  const GENE_KEYS = ['speed', 'vision', 'metabolism', 'threshold'];
  const SPECIES_KEYS = ['flora', 'herbivora', 'carnivora'];

  const DEFAULTS = {
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
    ticksPerGeneration: 30
  };

  const PARAMS = {
    seed:        { min: 1,    max: 9999, step: 1,    unit: 'seed',        label: 'Seed' },
    mutation:    { min: 0,    max: 0.20, step: 0.005, unit: 'per locus',  label: 'Mutation' },
    regrowth:    { min: 0.20, max: 2.50, step: 0.05, unit: '×',           label: 'Food regrowth' },
    generations: { min: 10,   max: 120,  step: 1,    unit: 'generations', label: 'Generations' },
    speed:       { min: 0.25, max: 8,    step: 0.05, unit: '×',           label: 'Speed' },
    interval:    { min: 3,    max: 20,   step: 1,    unit: 'generations', label: 'Catastrophe interval' }
  };

  const SPECIES = {
    flora: {
      id: 'flora', name: 'Flora', latin: 'Virens pratensis', glyph: 'flora',
      color: '#4f6f52', soft: '#8aa286', order: 0,
      blurb: 'Sessile, photosynthetic, clonal. The field itself.'
    },
    herbivora: {
      id: 'herbivora', name: 'Herbivora', latin: 'Lepus agrestis', glyph: 'fauna',
      color: '#ab7a35', soft: '#cdb184', order: 1,
      blurb: 'Grazers. Quick, wary, forever between two hungers.'
    },
    carnivora: {
      id: 'carnivora', name: 'Carnivora', latin: 'Vulpes ferox', glyph: 'predator',
      color: '#93372d', soft: '#bd837a', order: 2,
      blurb: 'Hunters. Few, efficient, dependent on the many.'
    }
  };

  const GENE_META = {
    flora: {
      speed:      { key: 'speed',      label: 'Growth',     expression: 'growth rate',      min: 0.35, max: 1.75, unit: '×' },
      vision:     { key: 'vision',     label: 'Dispersal',  expression: 'seed dispersal',   min: 0.80, max: 4.50, unit: 'cells' },
      metabolism: { key: 'metabolism', label: 'Conversion', expression: 'light conversion', min: 0.55, max: 1.55, unit: 'index' },
      threshold:  { key: 'threshold',  label: 'Threshold',  expression: 'seeding biomass',  min: 0.45, max: 1.25, unit: 'energy' }
    },
    herbivora: {
      speed:      { key: 'speed',      label: 'Speed',      expression: 'locomotion',        min: 0.35, max: 1.85, unit: 'cells/tick' },
      vision:     { key: 'vision',     label: 'Vision',     expression: 'perception',        min: 1.50, max: 9.50, unit: 'cells' },
      metabolism: { key: 'metabolism', label: 'Metabolism', expression: 'energy conversion', min: 0.55, max: 1.60, unit: 'index' },
      threshold:  { key: 'threshold',  label: 'Threshold',  expression: 'breeding energy',   min: 0.55, max: 1.45, unit: 'energy' }
    },
    carnivora: {
      speed:      { key: 'speed',      label: 'Speed',      expression: 'pursuit',           min: 0.35, max: 1.85, unit: 'cells/tick' },
      vision:     { key: 'vision',     label: 'Vision',     expression: 'perception',        min: 1.50, max: 9.50, unit: 'cells' },
      metabolism: { key: 'metabolism', label: 'Metabolism', expression: 'energy conversion', min: 0.55, max: 1.60, unit: 'index' },
      threshold:  { key: 'threshold',  label: 'Threshold',  expression: 'breeding energy',   min: 0.55, max: 1.45, unit: 'energy' }
    }
  };

  const CATASTROPHES = {
    drought: {
      id: 'drought', latin: 'Siccitas', name: 'Drought', initial: 'S', duration: 3,
      tint: '#a8792f',
      note: 'Flora growth falls to a quarter; the soil cracks and opens.',
      brief: 'Growth quartered · 3 seasons', kind: 'drought'
    },
    plague: {
      id: 'plague', latin: 'Pestilentia', name: 'Plague', initial: 'P', duration: 2,
      tint: '#666d4c',
      note: 'A pestilence moves through the fauna; the weak are taken first.',
      brief: 'Fauna mortality · 2 seasons', kind: 'plague'
    },
    wildfire: {
      id: 'wildfire', latin: 'Incendium', name: 'Wildfire', initial: 'I', duration: 1,
      tint: '#8d3a22',
      note: 'Fire crosses the field. Ash feeds whatever follows.',
      brief: 'Burns the field · ash enriches soil', kind: 'wildfire'
    }
  };

  // Balance constants live in one place so ecology can be tuned deliberately.
  const K = {
    ticksPerGen: 30,
    initialFlora: 900,
    initialHerbivora: 84,
    initialCarnivora: 20,
    maxFlora: 1650,
    maxHerbivora: 620,
    maxCarnivora: 150,
    floraCapacity: 1.55,
    floraGrowthBase: 0.0058,
    floraGrowthMetabolism: 0.0062,
    floraSeedChance: 0.0035,
    floraSeedCost: 0.17,
    floraSprout: 2.4,
    floraSenescence: 0.00038,
    floraMaxAge: 4200,
    herbBaseCost: 0.0032,
    carnBaseCost: 0.0042,
    speedCost: 0.0024,
    visionCost: 0.00028,
    metabolismCost: 0.0010,
    moveCost: 0.0008,
    herbBite: 0.18,
    herbBiteMeta: 0.06,
    herbDigest: 0.62,
    herbDigestMeta: 0.12,
    carnMeal: 0.20,
    carnMealEnergy: 0.45,
    carnKillRange: 0.80,
    herbFleeRange: 0.90,
    herbSenseRange: 9.5,
    herbReproShare: 0.47,
    carnReproShare: 0.46,
    reproCooldown: 45,
    herbCooldown: 45,
    carnCooldown: 75,
    herbSoftCap: 270,
    carnSoftCap: 55,
    herbBirthChance: 0.052,
    carnBirthChance: 0.03,
    herbEnergyCap: 2.2,
    carnEnergyCap: 3.4,
    carnTorpor: 0.62,
    herbEatCooldown: 3,
    carnKillCooldown: 16,
    carnNibble: 0.052,
    carnNibbleMeta: 0.02,
    carnNibbleCooldown: 7,
    baselines: {
      flora:     { speed: 1.00, vision: 1.80, metabolism: 1.00, threshold: 0.72 },
      herbivora: { speed: 1.12, vision: 4.80, metabolism: 1.00, threshold: 1.10 },
      carnivora: { speed: 1.38, vision: 6.20, metabolism: 1.06, threshold: 1.25 }
    },
    herbMortality: 0.00035,
    carnMortality: 0.00042,
    herbAgeMortality: 0.0016,
    carnAgeMortality: 0.0022,
    herbLifespan: 2400,
    carnLifespan: 1800,
    plagueCull: 0.09,
    plagueTick: 0.0026,
    droughtPlantTick: 0.0009,
    ashGrowth: 1.35,
    ashSprout: 1.75,
    mutationSpread: 0.16
  };

  /* --------------------------------------------------------------- helpers */

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const wrap = (v, n) => ((v % n) + n) % n;
  const nowMs = (typeof performance !== 'undefined' && performance.now)
    ? () => performance.now()
    : () => 0;

  function wrapDelta(d, n) {
    d = ((d % n) + n) % n;
    if (d > n / 2) d -= n;
    return d;
  }

  function dist2Torus(x1, y1, x2, y2, w, h) {
    const dx = wrapDelta(x2 - x1, w);
    const dy = wrapDelta(y2 - y1, h);
    return dx * dx + dy * dy;
  }

  function normalizeSeed(seed) {
    let s = Math.round(Number(seed));
    if (!Number.isFinite(s)) s = DEFAULTS.seed;
    s = s % 10000;
    if (s <= 0) s += 9999;
    return clamp(s, 1, 9999);
  }

  function normalizeConfig(partial) {
    const config = Object.assign({}, DEFAULTS);
    if (partial) {
      for (const key of Object.keys(DEFAULTS)) {
        if (partial[key] !== undefined && partial[key] !== null) config[key] = partial[key];
      }
    }
    config.seed = normalizeSeed(config.seed);
    config.mutation = clamp(Number(config.mutation) || 0, PARAMS.mutation.min, PARAMS.mutation.max);
    config.regrowth = clamp(Number(config.regrowth) || 0.2, PARAMS.regrowth.min, PARAMS.regrowth.max);
    config.generations = clamp(Math.round(config.generations), PARAMS.generations.min, PARAMS.generations.max);
    config.speed = clamp(Number(config.speed) || 1, PARAMS.speed.min, PARAMS.speed.max);
    config.interval = clamp(Math.round(config.interval), PARAMS.interval.min, PARAMS.interval.max);
    config.catastrophes = !!config.catastrophes;
    config.trails = config.trails !== false;
    config.width = clamp(Math.round(config.width) || 160, 40, 260);
    config.height = clamp(Math.round(config.height) || 90, 30, 160);
    config.ticksPerGeneration = clamp(Math.round(config.ticksPerGeneration) || 30, 10, 90);
    return config;
  }

  function makeGenome(prng, species, spread) {
    const base = K.baselines[species];
    const genes = {};
    const s = spread === undefined ? 1 : spread;
    for (const key of GENE_KEYS) {
      const meta = GENE_META[species][key];
      const v = base[key] + prng.gauss() * (meta.max - meta.min) * 0.10 * s;
      genes[key] = clamp(v, meta.min, meta.max);
    }
    return genes;
  }

  function mutateGenome(world, species, parentGenes) {
    const prng = world.prng;
    const genes = {};
    let mutations = 0;
    const rate = world.config.mutation;
    for (const key of GENE_KEYS) {
      const meta = GENE_META[species][key];
      let v = parentGenes[key];
      if (prng.chance(rate)) {
        const span = meta.max - meta.min;
        v += prng.gauss() * span * K.mutationSpread;
        mutations++;
      }
      genes[key] = clamp(v, meta.min, meta.max);
    }
    world.genStats.mutations += mutations;
    return genes;
  }

  /* --------------------------------------------------------- world creation */

  function createWorld(partialConfig) {
    const config = normalizeConfig(partialConfig);
    const world = {
      config,
      seed: config.seed,
      width: config.width,
      height: config.height,
      prng: makePRNG(config.seed),
      generation: 0,
      tick: 0,
      ticksIntoGen: 0,
      finished: false,
      started: true,
      events: [],
      history: [],
      counts: { flora: 0, herbivora: 0, carnivora: 0 },
      plants: [],
      herbivora: [],
      carnivora: [],
      plantGrid: new Int32Array(config.width * config.height).fill(-1),
      sproutAcc: 0,
      weather: { droughtUntil: 0, plagueUntil: 0, ashUntil: 0 },
      nextEventGen: config.catastrophes ? config.interval : Infinity,
      eventBag: [],
      eventCounter: 0,
      lastEvent: null,
      genStats: {
        mutations: 0, births: { flora: 0, herbivora: 0, carnivora: 0 },
        deaths: { flora: 0, herbivora: 0, carnivora: 0 }, eaten: 0, kills: 0
      },
      totals: { mutations: 0, deaths: 0, births: 0 },
      schema: 1
    };

    Object.defineProperty(world, 'activeEvents', {
      enumerable: true,
      configurable: true,
      get() { return activeEventList(world); }
    });
    seedInitialWorld(world);
    recordHistory(world, null);
    return world;
  }

  function seedInitialWorld(world) {
    const prng = world.prng;
    const W = world.width, H = world.height;

    // Meadows: flora prefers clustered stands; the field is not uniform.
    const meadows = [];
    const meadowCount = 15;
    for (let i = 0; i < meadowCount; i++) {
      meadows.push({ x: prng.range(0, W), y: prng.range(0, H), r: prng.range(8, 19) });
    }
    let made = 0, guard = 0;
    while (made < K.initialFlora && guard++ < 20000) {
      let x, y;
      if (prng.chance(0.72)) {
        const m = prng.pick(meadows);
        x = wrap(m.x + prng.gauss() * m.r, W);
        y = wrap(m.y + prng.gauss() * m.r, H);
      } else {
        x = prng.range(0, W);
        y = prng.range(0, H);
      }
      const cx = Math.floor(wrap(x, W));
      const cy = Math.floor(wrap(y, H));
      if (!spawnPlant(world, cx, cy, makeGenome(prng, 'flora', 1.15), prng.range(0.25, 1.15))) continue;
      made++;
    }

    for (let i = 0; i < K.initialHerbivora; i++) {
      const m = prng.pick(meadows);
      world.herbivora.push({
        x: wrap(m.x + prng.gauss() * m.r * 1.3, W),
        y: wrap(m.y + prng.gauss() * m.r * 1.3, H),
        genes: makeGenome(prng, 'herbivora', 1.0),
        energy: prng.range(0.52, 0.78),
        age: 0, dir: prng.range(0, TAU), cooldown: 0, eatCd: 0, killCd: 0, dead: false
      });
    }

    for (let i = 0; i < K.initialCarnivora; i++) {
      world.carnivora.push({
        x: prng.range(0, W),
        y: prng.range(0, H),
        genes: makeGenome(prng, 'carnivora', 1.0),
        energy: prng.range(1.05, 1.45),
        age: 0, dir: prng.range(0, TAU), cooldown: 0, eatCd: 0, killCd: 0, dead: false
      });
    }

    world.counts.flora = world.plants.length;
    world.counts.herbivora = world.herbivora.length;
    world.counts.carnivora = world.carnivora.length;
    world.nextEventGen = world.config.catastrophes ? world.config.interval : Infinity;
  }

  /* ------------------------------------------------------------- flora */

  function spawnPlant(world, cx, cy, genes, energy) {
    const W = world.width;
    const cell = cy * W + cx;
    if (world.plantGrid[cell] !== -1) return false;
    if (world.plants.length >= K.maxFlora) return false;
    const plant = {
      x: cx + 0.5, y: cy + 0.5, cx, cy, cell,
      genes,
      energy: energy === undefined ? 0.30 : energy,
      age: 0,
      dead: false
    };
    world.plantGrid[cell] = world.plants.length;
    world.plants.push(plant);
    return true;
  }

  function killPlant(world, plant) {
    if (plant.dead) return;
    plant.dead = true;
    if (world.plantGrid[plant.cell] >= 0) world.plantGrid[plant.cell] = -1;
    world.genStats.deaths.flora++;
  }

  function plantCellAt(world, x, y) {
    const cx = Math.floor(wrap(x, world.width));
    const cy = Math.floor(wrap(y, world.height));
    return world.plantGrid[cy * world.width + cx];
  }

  function nearestPlant(world, agent, maxRange) {
    const W = world.width, H = world.height;
    const range = Math.min(Math.ceil(Math.min(agent.genes.vision, maxRange || 9.5)), 11);
    const ax = Math.floor(agent.x), ay = Math.floor(agent.y);
    let best = null, bestD = Infinity;
    for (let oy = -range; oy <= range; oy++) {
      const cy = wrap(ay + oy, H);
      const rowBase = cy * W;
      for (let ox = -range; ox <= range; ox++) {
        const cx = wrap(ax + ox, W);
        const idx = world.plantGrid[rowBase + cx];
        if (idx < 0) continue;
        const p = world.plants[idx];
        if (!p || p.dead) continue;
        const d2 = dist2Torus(agent.x, agent.y, p.x, p.y, W, H);
        if (d2 < bestD) { bestD = d2; best = p; }
      }
    }
    return best ? { plant: best, dist: Math.sqrt(bestD) } : null;
  }

  function seedFromPlant(world, plant) {
    if (world.plants.length >= K.maxFlora) return false;
    const prng = world.prng;
    const angle = prng.range(0, TAU);
    const d = prng.range(0.4, Math.max(0.5, plant.genes.vision));
    const cx = Math.floor(wrap(plant.x + Math.cos(angle) * d, world.width));
    const cy = Math.floor(wrap(plant.y + Math.sin(angle) * d, world.height));
    if (world.plantGrid[cy * world.width + cx] !== -1) return false;
    const genes = mutateGenome(world, 'flora', plant.genes);
    const ash = world.generation < world.weather.ashUntil;
    const ok = spawnPlant(world, cx, cy, genes, 0.16 + (ash ? 0.03 : 0));
    if (ok) {
      plant.energy = Math.max(0.08, plant.energy - K.floraSeedCost);
      world.genStats.births.flora++;
    }
    return ok;
  }

  function updateFlora(world) {
    const prng = world.prng;
    const config = world.config;
    const drought = world.generation < world.weather.droughtUntil;
    const ash = world.generation < world.weather.ashUntil;
    const growthFactor = drought ? 0.24 : 1;
    const ashFactor = ash ? K.ashGrowth : 1;

    // Spore rain: the field never stays bare for long, and bare ground
    // invites the seed bank back quickly.
    const scarcity = 1 + 2.2 * clamp(1 - world.counts.flora / 1200, 0, 1);
    world.sproutAcc += config.regrowth * (drought ? 0.10 : 1) * (ash ? K.ashSprout : 1) * K.floraSprout * scarcity;
    let guard = 0;
    while (world.sproutAcc >= 1 && guard++ < 24) {
      world.sproutAcc -= 1;
      if (world.counts.flora >= K.maxFlora) continue;
      for (let attempt = 0; attempt < 4; attempt++) {
        const cx = prng.int(world.width);
        const cy = prng.int(world.height);
        if (world.plantGrid[cy * world.width + cx] !== -1) continue;
        let genes;
        if (world.plants.length > 0) {
          const parent = world.plants[prng.int(world.plants.length)];
          genes = parent && !parent.dead
            ? mutateGenome(world, 'flora', parent.genes)
            : makeGenome(prng, 'flora', 0.8);
        } else {
          genes = makeGenome(prng, 'flora', 0.8);
        }
        if (spawnPlant(world, cx, cy, genes, prng.range(0.12, 0.24))) {
          world.genStats.births.flora++;
          break;
        }
      }
    }

    const plants = world.plants;
    const n = plants.length;
    for (let i = 0; i < n; i++) {
      const p = plants[i];
      if (!p || p.dead) continue;
      p.age++;
      const capacity = K.floraCapacity;
      const growth = (K.floraGrowthBase + K.floraGrowthMetabolism * p.genes.metabolism) *
        p.genes.speed * growthFactor * ashFactor * (1 - p.energy / capacity);
      p.energy = Math.min(capacity + 0.1, p.energy + Math.max(0, growth));

      if (drought && prng.chance(K.droughtPlantTick)) p.energy -= 0.025;

      if (p.energy > p.genes.threshold * 1.20 && prng.chance(K.floraSeedChance * p.genes.speed * ashFactor)) {
        seedFromPlant(world, p);
      }

      const senescence = K.floraSenescence * (drought ? 2.4 : 1);
      if (p.age > K.floraMaxAge || prng.chance(senescence) || p.energy <= 0.025) {
        killPlant(world, p);
      }
    }

    compactPlants(world);
  }

  function compactPlants(world) {
    const arr = world.plants;
    const grid = world.plantGrid;
    grid.fill(-1);
    let w = 0;
    for (let i = 0; i < arr.length; i++) {
      const p = arr[i];
      if (!p || p.dead) continue;
      arr[w] = p;
      p.cell = p.cy * world.width + p.cx;
      grid[p.cell] = w;
      w++;
    }
    arr.length = w;
  }

  /* ------------------------------------------------------------- fauna */

  function countAlive(arr) {
    let n = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i] && !arr[i].dead) n++;
    return n;
  }

  function nearestFauna(world, agent, species, maxRange) {
    const arr = world[species];
    const W = world.width, H = world.height;
    let best = null, bestD = Infinity;
    const limit = Math.min(agent.genes.vision, maxRange || agent.genes.vision);
    const lim2 = limit * limit;
    for (let i = 0; i < arr.length; i++) {
      const other = arr[i];
      if (!other || other.dead) continue;
      const d2 = dist2Torus(agent.x, agent.y, other.x, other.y, W, H);
      if (d2 < bestD && d2 <= lim2) { bestD = d2; best = other; }
    }
    return best ? { agent: best, dist: Math.sqrt(bestD) } : null;
  }

  function moveAgent(world, agent, angle, distance, jitter) {
    const prng = world.prng;
    agent.dir = angle + prng.gauss() * (jitter === undefined ? 0.07 : jitter);
    agent.x = wrap(agent.x + Math.cos(agent.dir) * distance, world.width);
    agent.y = wrap(agent.y + Math.sin(agent.dir) * distance, world.height);
  }

  function faunaCost(agent, type, moved) {
    const base = type === 'carnivora' ? K.carnBaseCost : K.herbBaseCost;
    return base + agent.genes.speed * K.speedCost +
      agent.genes.vision * K.visionCost +
      agent.genes.metabolism * K.metabolismCost +
      moved * K.moveCost;
  }

  function tryReproduce(world, type, agent, aliveCount) {
    const cap = type === 'carnivora' ? K.maxCarnivora : K.maxHerbivora;
    if (aliveCount >= cap) return;
    if (agent.cooldown > 0) return;
    if (agent.energy < agent.genes.threshold) return;
    const prng = world.prng;
    const softCap = type === 'carnivora' ? K.carnSoftCap : K.herbSoftCap;
    const crowd = clamp(1 - aliveCount / softCap, 0.05, 1);
    const chance = (type === 'carnivora' ? K.carnBirthChance : K.herbBirthChance) * crowd;
    if (!prng.chance(chance)) return;
    const share = type === 'carnivora' ? K.carnReproShare : K.herbReproShare;
    const energy = agent.energy;
    agent.energy = energy * share;
    agent.cooldown = type === 'carnivora' ? K.carnCooldown : K.herbCooldown;
    agent.age = 0;
    const angle = prng.range(0, TAU);
    world[type].push({
      x: wrap(agent.x + Math.cos(angle) * prng.range(0.5, 1.4), world.width),
      y: wrap(agent.y + Math.sin(angle) * prng.range(0.5, 1.4), world.height),
      genes: mutateGenome(world, type, agent.genes),
      energy: energy * (type === 'carnivora' ? 0.43 : 0.44),
      age: 0, dir: angle, cooldown: type === 'carnivora' ? K.carnCooldown : K.herbCooldown, eatCd: 0, killCd: 0, dead: false
    });
    world.genStats.births[type]++;
  }

  function updateHerbivora(world) {
    const prng = world.prng;
    const W = world.width, H = world.height;
    const arr = world.herbivora;
    const n0 = arr.length;
    const plague = world.generation < world.weather.plagueUntil;
    for (let i = 0; i < n0; i++) {
      const a = arr[i];
      if (!a || a.dead) continue;
      a.age++;
      if (plague && prng.chance(K.plagueTick)) {
        a.dead = true; world.genStats.deaths.herbivora++; continue;
      }

      // Fear first: the nearest predator inside perception.
      const threat = nearestFauna(world, a, 'carnivora', K.herbSenseRange);
      let moved = 0;
      if (threat && threat.dist < a.genes.vision * K.herbFleeRange) {
        const angle = Math.atan2(wrapDelta(a.y - threat.agent.y, H), wrapDelta(a.x - threat.agent.x, W));
        moved = a.genes.speed * 1.12;
        moveAgent(world, a, angle, moved, 0.10);
      } else {
        const near = nearestPlant(world, a, a.genes.vision);
        if (near && near.dist <= a.genes.vision) {
          const angle = Math.atan2(wrapDelta(near.plant.y - a.y, H), wrapDelta(near.plant.x - a.x, W));
          moved = a.genes.speed;
          moveAgent(world, a, angle, moved, 0.05);
        } else {
          moved = a.genes.speed * 0.62;
          moveAgent(world, a, a.dir, moved, 0.55);
        }
      }

      // Graze: the current cell first, then a plant underfoot nearby.
      let plant = null;
      const cellIdx = plantCellAt(world, a.x, a.y);
      if (cellIdx >= 0) plant = world.plants[cellIdx];
      if (!plant || plant.dead) {
        const near = nearestPlant(world, a, 1.6);
        if (near && near.dist < 0.95) plant = near.plant;
      }
      if (a.eatCd > 0) a.eatCd--;
      if (plant && !plant.dead && a.eatCd <= 0 && dist2Torus(a.x, a.y, plant.x, plant.y, W, H) < 1.05 * 1.05) {
        const bite = Math.min(plant.energy, K.herbBite + K.herbBiteMeta * a.genes.metabolism);
        if (bite > 0) {
          const gain = bite * (K.herbDigest + K.herbDigestMeta * a.genes.metabolism);
          a.energy = Math.min(K.herbEnergyCap, a.energy + gain);
          plant.energy -= bite;
          a.eatCd = K.herbEatCooldown;
          world.genStats.eaten++;
          if (plant.energy <= 0.02) killPlant(world, plant);
        }
      }

      a.energy -= faunaCost(a, 'herbivora', moved);
      if (a.energy <= 0) {
        a.dead = true; world.genStats.deaths.herbivora++; continue;
      }
      if (a.cooldown > 0) a.cooldown--;
      const agePressure = a.age > K.herbLifespan ? K.herbAgeMortality : 0;
      if (prng.chance(K.herbMortality + agePressure)) {
        a.dead = true; world.genStats.deaths.herbivora++; continue;
      }
      tryReproduce(world, 'herbivora', a, world.counts.herbivora);
    }
  }

  function updateCarnivora(world) {
    const prng = world.prng;
    const W = world.width, H = world.height;
    const arr = world.carnivora;
    const n0 = arr.length;
    const plague = world.generation < world.weather.plagueUntil;
    for (let i = 0; i < n0; i++) {
      const a = arr[i];
      if (!a || a.dead) continue;
      a.age++;
      if (plague && prng.chance(K.plagueTick)) {
        a.dead = true; world.genStats.deaths.carnivora++; continue;
      }

      const prey = nearestFauna(world, a, 'herbivora');
      let moved = 0;
      if (prey) {
        const angle = Math.atan2(wrapDelta(prey.agent.y - a.y, H), wrapDelta(prey.agent.x - a.x, W));
        moved = a.genes.speed;
        moveAgent(world, a, angle, moved, 0.04);
      } else {
        moved = a.genes.speed * 0.6;
        moveAgent(world, a, a.dir, moved, 0.6);
      }

      // Hunt: any herbivore within a short radius, unless still handling a kill.
      if (a.killCd > 0) a.killCd--;
      let best = null, bestD = Infinity;
      const hArr = world.herbivora;
      if (a.killCd <= 0) {
        for (let j = 0; j < hArr.length; j++) {
          const other = hArr[j];
          if (!other || other.dead) continue;
          const d2 = dist2Torus(a.x, a.y, other.x, other.y, W, H);
          if (d2 < bestD && d2 <= K.carnKillRange * K.carnKillRange) { bestD = d2; best = other; }
        }
      }
      if (best) {
        a.killCd = K.carnKillCooldown;
        best.dead = true;
        world.genStats.deaths.herbivora++;
        world.genStats.kills++;
        const meal = K.carnMeal + best.energy * K.carnMealEnergy;
        a.energy = Math.min(K.carnEnergyCap, a.energy + meal);
      } else if (a.energy < 1.15 && a.eatCd <= 0) {
        // Foxes are opportunists: a little green matter keeps a lean hunt alive.
        const idx = plantCellAt(world, a.x, a.y);
        const pl = idx >= 0 ? world.plants[idx] : null;
        if (pl && !pl.dead) {
          const nibble = Math.min(pl.energy, K.carnNibble + K.carnNibbleMeta * a.genes.metabolism);
          if (nibble > 0) {
            a.energy = Math.min(K.carnEnergyCap, a.energy + nibble * 0.65);
            pl.energy -= nibble;
            a.eatCd = K.carnNibbleCooldown;
            if (pl.energy <= 0.02) killPlant(world, pl);
          }
        }
      }
      if (a.eatCd > 0) a.eatCd--;

      a.energy -= faunaCost(a, 'carnivora', moved) * (prey ? 1 : K.carnTorpor);
      if (a.energy <= 0) {
        a.dead = true; world.genStats.deaths.carnivora++; continue;
      }
      if (a.cooldown > 0) a.cooldown--;
      const agePressure = a.age > K.carnLifespan ? K.carnAgeMortality : 0;
      if (prng.chance(K.carnMortality + agePressure)) {
        a.dead = true; world.genStats.deaths.carnivora++; continue;
      }
      tryReproduce(world, 'carnivora', a, world.counts.carnivora);
    }
  }

  function compactFauna(arr) {
    let w = 0;
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (!a || a.dead) continue;
      arr[w++] = a;
    }
    arr.length = w;
  }

  /* --------------------------------------------------------- catastrophe */

  function activeEventList(world) {
    const out = [];
    const g = world.generation;
    for (const key of ['drought', 'plague']) {
      const until = world.weather[key + 'Until'];
      if (until > g) out.push({ type: key, remaining: until - g, meta: CATASTROPHES[key] });
    }
    if (world.weather.ashUntil > g) {
      out.push({ type: 'ash', remaining: world.weather.ashUntil - g, meta: {
        id: 'ash', latin: 'Cineres', name: 'Ash fall', initial: 'A', tint: '#8d3a22',
        note: 'Ash enriches the soil; growth is quickened.', brief: 'Enriched soil'
      } });
    }
    return out;
  }

  function chooseCatastrophe(world) {
    if (!world.eventBag || world.eventBag.length === 0) {
      world.eventBag = world.prng.shuffle(['drought', 'plague', 'wildfire']);
    }
    return world.eventBag.pop();
  }

  function fireCatastrophe(world, type) {
    const meta = CATASTROPHES[type];
    const prng = world.prng;
    const W = world.width, H = world.height;
    const gen = world.generation;
    const event = {
      id: ++world.eventCounter,
      gen, tick: world.tick,
      type, latin: meta.latin, name: meta.name, initial: meta.initial,
      note: meta.note, brief: meta.brief, duration: meta.duration, tint: meta.tint,
      affected: { flora: 0, herbivora: 0, carnivora: 0 }
    };

    if (type === 'drought') {
      world.weather.droughtUntil = Math.max(world.weather.droughtUntil, gen + meta.duration);
    } else if (type === 'plague') {
      world.weather.plagueUntil = Math.max(world.weather.plagueUntil, gen + meta.duration);
      for (const species of ['herbivora', 'carnivora']) {
        const arr = world[species];
        for (let i = 0; i < arr.length; i++) {
          const a = arr[i];
          if (!a || a.dead) continue;
          if (prng.chance(K.plagueCull)) {
            a.dead = true;
            world.genStats.deaths[species]++;
            event.affected[species]++;
          }
        }
        compactFauna(arr);
      }
    } else if (type === 'wildfire') {
      world.weather.ashUntil = Math.max(world.weather.ashUntil, gen + meta.duration + 4);
      const blobs = 2 + prng.int(2);
      const burned = new Uint8Array(W * H);
      let cellsBurned = 0;
      for (let b = 0; b < blobs; b++) {
        const bx = prng.range(0, W), by = prng.range(0, H);
        const radius = prng.range(4.5, 10.5);
        const r2 = radius * radius;
        const reach = Math.ceil(radius);
        for (let oy = -reach; oy <= reach; oy++) {
          const cy = wrap(Math.floor(by) + oy, H);
          for (let ox = -reach; ox <= reach; ox++) {
            const cx = wrap(Math.floor(bx) + ox, W);
            const px = cx + 0.5, py = cy + 0.5;
            if (dist2Torus(bx, by, px, py, W, H) > r2) continue;
            const cell = cy * W + cx;
            if (burned[cell]) continue;
            burned[cell] = 1;
            cellsBurned++;
            const idx = world.plantGrid[cell];
            if (idx >= 0) {
              const p = world.plants[idx];
              if (p && !p.dead) {
                killPlant(world, p);
                event.affected.flora++;
              }
            }
          }
        }
      }
      for (const species of ['herbivora', 'carnivora']) {
        const arr = world[species];
        for (let i = 0; i < arr.length; i++) {
          const a = arr[i];
          if (!a || a.dead) continue;
          const cx = Math.floor(a.x), cy = Math.floor(a.y);
          if (burned[cy * W + cx] && prng.chance(0.74)) {
            a.dead = true;
            world.genStats.deaths[species]++;
            event.affected[species]++;
          }
        }
        compactFauna(arr);
      }
      compactPlants(world);
      event.burnedCells = cellsBurned;
    }

    world.events.push(event);
    world.lastEvent = event;
    return event;
  }

  function maybeFire(world) {
    if (!world.config.catastrophes) return null;
    if (world.generation <= 0) return null;
    if (world.generation !== world.nextEventGen) return null;
    if (world.generation >= world.config.generations) return null;
    const type = chooseCatastrophe(world);
    const event = fireCatastrophe(world, type);
    world.nextEventGen = world.generation + world.config.interval;
    return event;
  }

  /* --------------------------------------------------------------- stats */

  function computeTraitStats(world, species) {
    const arr = species === 'flora' ? world.plants : world[species];
    const out = {};
    for (const gene of GENE_KEYS) out[gene] = { mean: null, sd: null, min: null, max: null, n: 0 };
    let n = 0;
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (!a || a.dead) continue;
      n++;
      for (const gene of GENE_KEYS) {
        const v = a.genes[gene];
        const st = out[gene];
        if (st.min === null || v < st.min) st.min = v;
        if (st.max === null || v > st.max) st.max = v;
      }
    }
    if (n > 0) {
      for (const gene of GENE_KEYS) {
        const st = out[gene];
        let sum = 0;
        for (let i = 0; i < arr.length; i++) {
          const a = arr[i];
          if (!a || a.dead) continue;
          sum += a.genes[gene];
        }
        const mean = sum / n;
        let sq = 0;
        for (let i = 0; i < arr.length; i++) {
          const a = arr[i];
          if (!a || a.dead) continue;
          const d = a.genes[gene] - mean;
          sq += d * d;
        }
        st.mean = mean;
        st.sd = n > 1 ? Math.sqrt(sq / n) : 0;
        st.n = n;
      }
    }
    return out;
  }

  function computeDiversity(traits) {
    let total = 0, count = 0;
    for (const species of SPECIES_KEYS) {
      for (const gene of GENE_KEYS) {
        const st = traits[species][gene];
        if (!st || st.n < 2 || st.sd === null) continue;
        const meta = GENE_META[species][gene];
        const span = meta.max - meta.min;
        total += clamp(st.sd / (span * 0.25), 0, 1);
        count++;
      }
    }
    return count ? total / count : 0;
  }

  function recordHistory(world, eventType) {
    const traits = {
      flora: computeTraitStats(world, 'flora'),
      herbivora: computeTraitStats(world, 'herbivora'),
      carnivora: computeTraitStats(world, 'carnivora')
    };
    const counts = {
      flora: countAlive(world.plants),
      herbivora: countAlive(world.herbivora),
      carnivora: countAlive(world.carnivora)
    };
    world.counts = counts;
    const diversity = computeDiversity(traits);
    world.history.push({
      gen: world.generation,
      counts,
      traits,
      mutations: world.genStats.mutations,
      births: Object.assign({}, world.genStats.births),
      deaths: Object.assign({}, world.genStats.deaths),
      eaten: world.genStats.eaten,
      kills: world.genStats.kills,
      diversity,
      event: eventType || null,
      activeEvents: activeEventList(world).map((e) => ({ type: e.type, remaining: e.remaining }))
    });
    world.genStats = {
      mutations: 0,
      births: { flora: 0, herbivora: 0, carnivora: 0 },
      deaths: { flora: 0, herbivora: 0, carnivora: 0 },
      eaten: 0, kills: 0
    };
    return world.history[world.history.length - 1];
  }

  function updateCounts(world) {
    world.counts = {
      flora: countAlive(world.plants),
      herbivora: countAlive(world.herbivora),
      carnivora: countAlive(world.carnivora)
    };
  }

  /* ---------------------------------------------------------------- ticks */

  function runTick(world) {
    if (!world || world.finished) return world;
    world.tick++;
    updateFlora(world);
    updateHerbivora(world);
    updateCarnivora(world);
    compactFauna(world.herbivora);
    compactFauna(world.carnivora);
    compactPlants(world);
    updateCounts(world);
    world.ticksIntoGen++;
    if (world.ticksIntoGen >= world.config.ticksPerGeneration) endGeneration(world);
    return world;
  }

  function endGeneration(world) {
    world.ticksIntoGen = 0;
    world.generation++;
    const event = maybeFire(world);
    recordHistory(world, event ? event.type : null);
    if (world.generation >= world.config.generations) {
      world.finished = true;
      world.ticksIntoGen = 0;
    }
  }

  function runGeneration(world) {
    if (!world || world.finished) return world;
    const target = world.generation + 1;
    let guard = 0;
    while (!world.finished && world.generation < target && guard++ < 10000) runTick(world);
    return world;
  }

  function runHeadless(world, generations) {
    if (!world) return world;
    const gens = generations === undefined ? world.config.generations : generations;
    const target = Math.min(world.config.generations, gens);
    let guard = 0;
    while (!world.finished && world.generation < target && guard++ < 100000) {
      const remaining = world.config.ticksPerGeneration - world.ticksIntoGen;
      for (let i = 0; i < remaining && !world.finished; i++) runTick(world);
    }
    return world;
  }

  /* --------------------------------------------------------------- params */

  function setParam(world, key, value) {
    if (!world) return world;
    if (key === 'catastrophes' || key === 'trails') {
      world.config[key] = !!value;
      if (key === 'catastrophes') {
        world.nextEventGen = world.config.catastrophes
          ? (world.generation + world.config.interval)
          : Infinity;
      }
      return world;
    }
    if (key === 'seed') return world; // seed is applied by recasting the world
    const meta = PARAMS[key];
    if (!meta) return world;
    let v = Number(value);
    if (!Number.isFinite(v)) return world;
    if (key === 'mutation' || key === 'regrowth' || key === 'speed') {
      v = clamp(v, meta.min, meta.max);
    } else {
      v = clamp(Math.round(v), meta.min, meta.max);
    }
    world.config[key] = v;
    if (key === 'generations') {
      if (world.generation >= v) {
        world.finished = true;
        world.ticksIntoGen = 0;
      }
    }
    if (key === 'interval') {
      world.nextEventGen = world.config.catastrophes
        ? (world.generation + v)
        : Infinity;
    }
    return world;
  }

  /* --------------------------------------------------------------- hashes */

  function hashWorld(world) {
    let h = 2166136261 >>> 0;
    const mix = (n) => { h ^= (n | 0); h = Math.imul(h, 16777619); };
    const mixNum = (n) => {
      if (!Number.isFinite(n)) n = 0;
      mix(Math.round(n * 1000) | 0);
    };
    mix(world.seed);
    mix(world.generation);
    mix(world.tick);
    mix(world.finished ? 1 : 0);
    mix(world.counts.flora); mix(world.counts.herbivora); mix(world.counts.carnivora);
    mixNum(world.sproutAcc);
    mix(world.weather.droughtUntil); mix(world.weather.plagueUntil); mix(world.weather.ashUntil);
    mix(world.nextEventGen === Infinity ? 99999 : world.nextEventGen);
    mix(world.eventCounter);
    for (const species of SPECIES_KEYS) {
      const arr = species === 'flora' ? world.plants : world[species];
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i];
        if (!a || a.dead) continue;
        mixNum(a.x); mixNum(a.y); mixNum(a.energy); mixNum(a.age);
        for (const gene of GENE_KEYS) mixNum(a.genes[gene]);
        if (a.dir !== undefined) mixNum(a.dir);
      }
      mix(arr.length);
    }
    const state = world.prng.getState();
    for (let i = 0; i < state.length; i++) {
      const v = state[i];
      mix(typeof v === 'number' ? (Math.round(v * 1000) | 0) : 0);
    }
    return (h >>> 0).toString(16).padStart(8, '0');
  }

  function snapshot(world) {
    const last = world.history.length ? world.history[world.history.length - 1] : null;
    return {
      seed: world.seed,
      generation: world.generation,
      tick: world.tick,
      finished: world.finished,
      counts: Object.assign({}, world.counts),
      config: Object.assign({}, world.config),
      events: world.events.map((e) => ({ gen: e.gen, type: e.type, name: e.name, affected: e.affected })),
      activeEvents: activeEventList(world).map((e) => ({ type: e.type, remaining: e.remaining })),
      historyLength: world.history.length,
      lastHistory: last ? { gen: last.gen, counts: last.counts, diversity: last.diversity } : null
    };
  }

  function getStats(world) {
    const traits = {
      flora: computeTraitStats(world, 'flora'),
      herbivora: computeTraitStats(world, 'herbivora'),
      carnivora: computeTraitStats(world, 'carnivora')
    };
    return {
      generation: world.generation,
      finished: world.finished,
      counts: Object.assign({}, world.counts),
      traits,
      diversity: computeDiversity(traits),
      mutations: world.genStats.mutations,
      ticksIntoGen: world.ticksIntoGen,
      activeEvents: activeEventList(world)
    };
  }

  function benchmark(seed, gens) {
    const t0 = nowMs();
    const n = Math.max(10, gens || 100);
    const world = createWorld({ seed: seed || DEFAULTS.seed, generations: n });
    runHeadless(world, n);
    const t1 = nowMs();
    const ms = t1 - t0;
    return {
      ms,
      generations: world.generation,
      ticks: world.tick,
      ticksPerSec: ms > 0 ? (world.tick / ms) * 1000 : 0,
      hash: hashWorld(world),
      counts: Object.assign({}, world.counts)
    };
  }

  function resetWorld(world, overrides) {
    const config = Object.assign({}, world ? world.config : {}, overrides || {});
    return createWorld(config);
  }

  /* ---------------------------------------------------------------- API */

  root.VIVARIUM_ENGINE = {
    VERSION: '1.0.0',
    GENE_KEYS: GENE_KEYS.slice(),
    SPECIES_KEYS: SPECIES_KEYS.slice(),
    SPECIES,
    GENE_META,
    CATASTROPHES,
    DEFAULTS: Object.assign({}, DEFAULTS),
    PARAMS,
    TUNING: K,
    createWorld,
    resetWorld,
    setParam,
    runTick,
    runGeneration,
    stepGeneration: runGeneration,
    runHeadless,
    benchmark,
    hashWorld,
    snapshot,
    getSnapshot: snapshot,
    getStats,
    getActiveEvents: activeEventList,
    normalizeSeed,
    makePRNG,
    fireCatastrophe
  };
})(typeof window !== 'undefined' ? window : globalThis);
