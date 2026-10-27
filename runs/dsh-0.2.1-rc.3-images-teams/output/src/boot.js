/* =========================================================================
   VIVARIUM — boot & orchestration
   Creates the world, mounts the instruments, runs the playback clock,
   narrates catastrophes, and opens THE RECORD at the end of the study.
   ========================================================================= */
(function (root) {
  'use strict';

  const ENGINE = root.VIVARIUM_ENGINE;
  const RENDER = root.VIVARIUM_RENDER;
  const CONTROLS = root.VIVARIUM_CONTROLS;
  const DASHBOARD = root.VIVARIUM_DASHBOARD;

  const TICKS_PER_SECOND = 30; // engine ticks per second at ×1 speed
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  const pad3 = (n) => (n < 10 ? '00' : n < 100 ? '0' : '') + n;

  function parseQuery() {
    let p;
    try { p = new URLSearchParams(root.location ? root.location.search : ''); }
    catch (e) { p = new URLSearchParams(''); }
    const num = (key) => {
      if (!p.has(key)) return undefined;
      const v = Number(p.get(key));
      return Number.isFinite(v) ? v : undefined;
    };
    const gens = num('gens') !== undefined ? num('gens') : num('generations');
    const config = {};
    if (num('seed') !== undefined) config.seed = num('seed');
    if (gens !== undefined) config.generations = gens;
    if (num('speed') !== undefined) config.speed = num('speed');
    if (num('interval') !== undefined) config.interval = num('interval');
    if (num('mutation') !== undefined) config.mutation = num('mutation');
    if (num('regrowth') !== undefined) config.regrowth = num('regrowth');
    if (p.has('cat')) config.catastrophes = p.get('cat') !== '0';
    if (p.has('trails')) config.trails = p.get('trails') !== '0';
    const paused = p.has('auto') && p.get('auto') === '0';
    return { config, paused };
  }

  function boot() {
    const query = parseQuery();
    const refs = {
      sheet: document.getElementById('sheet'),
      frame: document.querySelector('.vitrine__frame'),
      canvas: document.getElementById('sim-canvas'),
      metaSeed: document.getElementById('meta-seed'),
      metaGen: document.getElementById('meta-gen'),
      metaObservation: document.getElementById('meta-observation'),
      metaStatusText: document.getElementById('meta-status-text'),
      censusFlora: document.getElementById('census-flora'),
      censusFauna: document.getElementById('census-fauna'),
      censusPredator: document.getElementById('census-predator'),
      trendFlora: document.getElementById('census-flora-trend'),
      trendFauna: document.getElementById('census-fauna-trend'),
      trendPredator: document.getElementById('census-predator-trend'),
      plateCells: document.getElementById('plate-cells'),
      tagSeed: document.getElementById('tag-seed'),
      ledgerList: document.getElementById('ledger-list'),
      ledgerCounter: document.getElementById('ledger-counter'),
      ledgerSeed: document.getElementById('ledger-seed'),
      ruleTicks: document.getElementById('rule-ticks'),
      ruleProgress: document.getElementById('rule-progress'),
      ruleSeals: document.getElementById('rule-seals'),
      ruleCursor: document.getElementById('rule-cursor'),
      ruleCursorLabel: document.getElementById('rule-cursor-label'),
      ruleGen: document.getElementById('rule-gen'),
      ruleRate: document.getElementById('rule-rate'),
      vitrineClock: document.getElementById('vitrine-clock'),
      plateHint: document.getElementById('plate-hint'),
      btnPlay: document.getElementById('btn-play'),
      btnStep: document.getElementById('btn-step'),
      btnConclude: document.getElementById('btn-conclude'),
      folioToggle: document.getElementById('folio-toggle'),
      eventBanner: document.getElementById('event-banner'),
      bannerSeal: document.getElementById('banner-seal'),
      bannerLatin: document.getElementById('banner-latin'),
      bannerName: document.getElementById('banner-name'),
      bannerNote: document.getElementById('banner-note'),
      bannerGen: document.getElementById('banner-gen'),
      conditions: document.getElementById('active-conditions'),
      recastNote: document.getElementById('recast-note'),
      wash: document.getElementById('wash'),
      colophonState: document.getElementById('colophon-state'),
      shortcutNote: document.getElementById('shortcut-note'),
      record: document.getElementById('record'),
      recordMeta: document.getElementById('record-meta'),
      btnReplay: document.getElementById('btn-replay'),
      btnNewseed: document.getElementById('btn-newseed'),
      btnBack: document.getElementById('btn-back'),
      btnRecord: document.getElementById('btn-record'),
      recordFootNote: document.getElementById('record-foot-note'),
      instrumentBody: document.getElementById('instrument-body')
    };

    let world = ENGINE.createWorld(query.config);
    let renderer = null;
    try {
      if (RENDER && refs.canvas) renderer = RENDER.create(refs.canvas);
    } catch (e) { renderer = null; }

    const state = {
      paused: query.paused === true,
      finished: false,
      concluding: false,
      recordOpen: false,
      acc: 0,
      lastRateTs: 0,
      lastRateTick: 0,
      measuredRate: TICKS_PER_SECOND * world.config.speed,
      rateHistory: [],
      seenEvents: world.events.length,
      lastActiveSignature: '',
      lastBannerTimer: 0,
      bannerHideTimer: 0,
      lastWashTimer: 0,
      finishTimer: 0,
      recastTimerA: 0,
      recastTimerB: 0,
      controlsMounted: false,
      lastProgressLabel: '',
      lastRuleRate: ''
    };

    const cache = { status: null };

    /* ----------------------------------------------------------- helpers */

    function fmtCount(n) {
      return n >= 1000 ? String(n) : pad3(n);
    }

    function setText(el, value) {
      if (el && el.textContent !== String(value)) el.textContent = String(value);
    }

    /* ------------------------------------------------------------- ledger */

    function makeLedgerEntry(gen, text, cataclysm) {
      const li = document.createElement('li');
      li.className = 'ledger__entry ledger__entry--sealed' + (cataclysm ? ' ledger__entry--cataclysm' : '');
      const genEl = document.createElement('span');
      genEl.className = 'ledger__gen mono';
      genEl.textContent = 'GEN ' + pad2(gen);
      const textEl = document.createElement('span');
      textEl.className = 'ledger__text';
      textEl.textContent = text;
      li.appendChild(genEl);
      li.appendChild(textEl);
      return li;
    }

    function appendLedger(gen, text, cataclysm) {
      if (!refs.ledgerList) return;
      refs.ledgerList.appendChild(makeLedgerEntry(gen, text, cataclysm));
      while (refs.ledgerList.children.length > 12) refs.ledgerList.removeChild(refs.ledgerList.firstChild);
      if (refs.ledgerCounter) refs.ledgerCounter.textContent = pad2(refs.ledgerList.children.length);
      try { refs.ledgerList.scrollLeft = refs.ledgerList.scrollWidth; } catch (e) { /* no-op */ }
    }

    function resetLedger(seed) {
      if (!refs.ledgerList) return;
      refs.ledgerList.innerHTML = '';
      const li = document.createElement('li');
      li.className = 'ledger__entry ledger__entry--sealed';
      const g = document.createElement('span');
      g.className = 'ledger__gen mono';
      g.textContent = 'GEN 00';
      const t = document.createElement('span');
      t.className = 'ledger__text';
      t.textContent = 'The glass is sealed. A world begins from seed ' + seed + '.';
      li.appendChild(g); li.appendChild(t);
      refs.ledgerList.appendChild(li);
      if (refs.ledgerCounter) refs.ledgerCounter.textContent = '01';
    }

    /* --------------------------------------------------------------- rule */

    function rebuildRuleTicks() {
      if (!refs.ruleTicks) return;
      refs.ruleTicks.innerHTML = '';
      const N = Math.max(1, world.config.generations);
      const majorEvery = N <= 48 ? 5 : 10;
      const frag = document.createDocumentFragment();
      for (let gen = 0; gen <= N; gen++) {
        const tick = document.createElement('i');
        tick.className = 'rule__tick';
        tick.style.left = (gen / N) * 100 + '%';
        if (gen % majorEvery === 0 || gen === N) {
          tick.dataset.major = '1';
          const num = document.createElement('span');
          num.className = 'rule__tick-num';
          num.textContent = gen;
          tick.appendChild(num);
        }
        frag.appendChild(tick);
      }
      refs.ruleTicks.appendChild(frag);
      if (refs.ruleGen) refs.ruleGen.textContent = 'gen ' + pad2(world.generation) + ' / ' + N;
    }

    function rebuildSeals() {
      if (!refs.ruleSeals) return;
      refs.ruleSeals.innerHTML = '';
      const N = Math.max(1, world.config.generations);
      const frag = document.createDocumentFragment();
      world.events.forEach((ev) => {
        const el = document.createElement('span');
        el.className = 'rule__seal rule__seal--' + ev.type;
        el.style.left = Math.max(0.9, Math.min(99.1, (ev.gen / N) * 100)) + '%';
        el.dataset.label = ev.latin.toUpperCase() + ' · GEN ' + pad2(ev.gen);
        el.textContent = ev.initial;
        frag.appendChild(el);
      });
      refs.ruleSeals.appendChild(frag);
    }

    function updateRule() {
      if (!refs.ruleProgress) return;
      const N = Math.max(1, world.config.generations);
      const partial = world.ticksIntoGen / Math.max(1, world.config.ticksPerGeneration);
      const pct = Math.max(0, Math.min(100, ((world.generation + partial) / N) * 100));
      const label = 'GEN ' + pad2(world.generation);
      refs.ruleProgress.style.width = pct + '%';
      refs.ruleCursor.style.left = pct + '%';
      if (state.lastProgressLabel !== label || refs.ruleGen) {
        state.lastProgressLabel = label;
        if (refs.ruleCursorLabel) refs.ruleCursorLabel.textContent = label;
        if (refs.ruleGen) refs.ruleGen.textContent = 'gen ' + pad2(world.generation) + ' / ' + N;
      }
      refs.ruleCursor.classList.toggle('is-end', pct > 92);
      const speed = world.config.speed;
      const held = state.paused && !state.finished;
      const rateText = speed.toFixed(speed < 1 ? 2 : 1) + '× · ' + Math.round(TICKS_PER_SECOND * speed) + ' ticks/s' + (held ? ' · held' : '');
      if (state.lastRuleRate !== rateText) {
        state.lastRuleRate = rateText;
        if (refs.ruleRate) refs.ruleRate.textContent = rateText;
      }
    }

    /* ---------------------------------------------------------- census */

    function updateTrend(el, current, previous) {
      if (!el) return;
      let ch = '·';
      if (current > previous) ch = '▲';
      else if (current < previous) ch = '▼';
      if (el.textContent !== ch) el.textContent = ch;
      el.classList.toggle('is-up', current > previous);
      el.classList.toggle('is-down', current < previous);
    }

    function updateCensus() {
      const c = world.counts;
      setText(refs.censusFlora, fmtCount(c.flora));
      setText(refs.censusFauna, fmtCount(c.herbivora));
      setText(refs.censusPredator, fmtCount(c.carnivora));
      const h = world.history;
      if (h.length >= 2) {
        const a = h[h.length - 1].counts, b = h[h.length - 2].counts;
        updateTrend(refs.trendFlora, a.flora, b.flora);
        updateTrend(refs.trendFauna, a.herbivora, b.herbivora);
        updateTrend(refs.trendPredator, a.carnivora, b.carnivora);
      } else {
        updateTrend(refs.trendFlora, 0, 0);
        updateTrend(refs.trendFauna, 0, 0);
        updateTrend(refs.trendPredator, 0, 0);
      }
    }

    /* -------------------------------------------------------- conditions */

    function updateConditions() {
      if (!refs.conditions) return;
      const list = ENGINE.getActiveEvents(world);
      const sig = list.map((e) => e.type + ':' + e.remaining).join('|');
      if (sig === state.lastActiveSignature) return;
      state.lastActiveSignature = sig;
      refs.conditions.innerHTML = '';
      list.forEach((e) => {
        const span = document.createElement('span');
        const kind = e.type === 'ash' ? 'wildfire' : e.type;
        span.className = 'condition condition--' + kind + (e.type === 'ash' ? ' condition--ash' : '');
        const seasons = e.remaining === 1 ? 'SEASON' : 'SEASONS';
        span.textContent = e.meta.latin.toUpperCase() + ' · ' + e.remaining + ' ' + seasons + ' REMAIN';
        refs.conditions.appendChild(span);
      });
    }

    /* ----------------------------------------------------------- weather */

    function announce(ev) {
      if (!ev) return;
      if (refs.eventBanner) {
        if (refs.bannerSeal) refs.bannerSeal.textContent = ev.initial;
        if (refs.bannerLatin) refs.bannerLatin.textContent = ev.latin;
        if (refs.bannerName) refs.bannerName.textContent = ev.name;
        if (refs.bannerNote) refs.bannerNote.textContent = ev.note;
        if (refs.bannerGen) refs.bannerGen.textContent = 'GEN ' + pad2(ev.gen);
        refs.eventBanner.hidden = false;
        refs.eventBanner.classList.remove('is-visible');
        void refs.eventBanner.offsetWidth;
        refs.eventBanner.classList.add('is-visible');
        clearTimeout(state.lastBannerTimer);
        clearTimeout(state.bannerHideTimer);
        state.lastBannerTimer = setTimeout(() => {
          if (!refs.eventBanner) return;
          refs.eventBanner.classList.remove('is-visible');
          state.bannerHideTimer = setTimeout(() => {
            if (refs.eventBanner) refs.eventBanner.hidden = true;
          }, 260);
        }, 3600);
      }
      if (refs.wash) {
        refs.wash.className = 'wash is-active is-' + ev.type;
        refs.wash.dataset.kind = ev.type;
        clearTimeout(state.lastWashTimer);
        state.lastWashTimer = setTimeout(() => {
          if (!refs.wash) return;
          refs.wash.className = 'wash';
          delete refs.wash.dataset.kind;
        }, 1950);
      }
      appendLedger(ev.gen, ev.latin + ' · ' + ev.name + '. ' + ev.note, true);
    }

    function processNewEvents() {
      if (!world || world.events.length <= state.seenEvents) return;
      const fresh = world.events.slice(state.seenEvents);
      state.seenEvents = world.events.length;
      rebuildSeals();
      fresh.forEach((ev) => {
        if (ev === fresh[fresh.length - 1]) announce(ev);
        else appendLedger(ev.gen, ev.latin + ' · ' + ev.name + '. ' + ev.note, true);
      });
      updateConditions();
    }

    /* ----------------------------------------------------------- playback */

    function syncPlayback() {
      const running = !state.paused && !state.finished;
      if (refs.sheet) {
        refs.sheet.dataset.running = running ? 'true' : 'false';
        refs.sheet.dataset.finished = state.finished ? 'true' : 'false';
      }
      if (document.body) {
        document.body.dataset.running = running ? 'true' : 'false';
        document.body.dataset.finished = state.finished ? 'true' : 'false';
      }
      if (refs.btnPlay) {
        refs.btnPlay.setAttribute('aria-pressed', state.paused ? 'true' : 'false');
        refs.btnPlay.setAttribute('aria-label', state.finished ? 'Study concluded' : state.paused ? 'Resume the study' : 'Pause the study');
        refs.btnPlay.dataset.running = running ? 'true' : 'false';
        refs.btnPlay.classList.toggle('is-paused', state.paused);
      }
      const status = state.finished ? 'Concluded' : state.paused ? 'Held' : 'Observing';
      setText(refs.metaStatusText, status);
      const colophon = state.finished ? 'Study concluded · ' + world.generation + ' generations' : state.paused ? 'Held in observation' : 'Run in progress';
      setText(refs.colophonState, colophon);
      if (state.controlsMounted && CONTROLS) {
        try {
          if (CONTROLS.setRunning) CONTROLS.setRunning(running);
          if (CONTROLS.setFinished) CONTROLS.setFinished(!!state.finished);
        } catch (e) { /* no-op */ }
      }
    }

    function togglePause() {
      if (state.finished) { showRecord(); return; }
      state.paused = !state.paused;
      state.acc = 0;
      syncPlayback();
    }

    function stepGeneration() {
      if (state.finished) return;
      state.paused = true;
      syncPlayback();
      ENGINE.runGeneration(world);
      state.acc = 0;
      processNewEvents();
      updateCensus();
      updateRule();
      updateConditions();
      if (renderer) renderer.draw(world);
      if (world.finished) concludeStudy();
    }

    function conclude() {
      if (state.finished) { showRecord(); return; }
      if (state.concluding) return;
      state.concluding = true;
      state.paused = true;
      syncPlayback();
      setText(refs.metaStatusText, 'Concluding');
      clearTimeout(state.finishTimer);
      state.finishTimer = setTimeout(() => {
        if (!world.finished) ENGINE.runHeadless(world, world.config.generations);
        state.acc = 0;
        state.concluding = false;
        processNewEvents();
        updateCensus();
        updateRule();
        updateConditions();
        if (renderer) renderer.draw(world);
        concludeStudy();
      }, 40);
    }

    /* ------------------------------------------------------------- finish */

    function concludeStudy() {
      if (state.finished) return;
      state.finished = true;
      state.paused = true;
      state.concluding = false;
      if (world && !world.finished) world.finished = true;
      syncPlayback();
      appendLedger(world.generation, 'Study concluded. The glass is closed; the record is drawn.', false);
      updateConditions();
      clearTimeout(state.lastBannerTimer);
      clearTimeout(state.bannerHideTimer);
      if (refs.eventBanner) refs.eventBanner.hidden = true;
      updateCensus();
      updateRule();
      if (refs.btnRecord) refs.btnRecord.hidden = false;
      clearTimeout(state.finishTimer);
      state.finishTimer = setTimeout(showRecord, 1100);
    }

    function showRecord() {
      if (!world || !world.finished) return;
      if (state.recordOpen) return;
      state.recordOpen = true;
      try {
        if (DASHBOARD && DASHBOARD.render) DASHBOARD.render(world, {});
      } catch (e) { /* no-op */ }
      if (DASHBOARD && DASHBOARD.show) DASHBOARD.show();
      if (refs.record) refs.record.hidden = false;
      if (refs.btnRecord) refs.btnRecord.hidden = true;
      if (refs.recordMeta) {
        const evText = world.events.length
          ? world.events.map((e) => 'g' + e.gen + ' ' + e.name.toLowerCase()).join(' · ')
          : 'no catastrophes';
        refs.recordMeta.textContent = 'Seed ' + world.seed + ' · ' + world.config.generations +
          ' generations · ' + evText;
      }
      if (refs.recordFootNote) {
        refs.recordFootNote.textContent = 'All charts are drawn in ink from seed ' + world.seed + '.';
      }
      requestAnimationFrame(() => {
        try { if (DASHBOARD && DASHBOARD.onResize) DASHBOARD.onResize(); } catch (e) { /* no-op */ }
        if (refs.btnReplay) { try { refs.btnReplay.focus({ preventScroll: true }); } catch (e) { /* no-op */ } }
      });
    }

    function hideRecord() {
      if (DASHBOARD && DASHBOARD.hide) DASHBOARD.hide();
      if (refs.record) refs.record.hidden = true;
      state.recordOpen = false;
      if (refs.btnRecord) refs.btnRecord.hidden = !state.finished;
      if (refs.canvas) { try { refs.canvas.focus({ preventScroll: true }); } catch (e) { /* no-op */ } }
    }

    /* ------------------------------------------------------------- recast */

    function recast(seed) {
      clearTimeout(state.finishTimer);
      clearTimeout(state.recastTimerA);
      clearTimeout(state.recastTimerB);
      clearTimeout(state.lastBannerTimer);
      clearTimeout(state.bannerHideTimer);
      if (refs.eventBanner) refs.eventBanner.hidden = true;
      if (refs.wash) { refs.wash.className = 'wash'; delete refs.wash.dataset.kind; }
      hideRecord();
      const config = Object.assign({}, world.config, {
        seed: seed === undefined || seed === null ? world.seed : seed
      });
      world = ENGINE.createWorld(config);
      state.finished = false;
      state.concluding = false;
      state.paused = false;
      state.acc = 0;
      state.lastRateTs = 0;
      state.lastRateTick = 0;
      state.rateHistory = [];
      state.seenEvents = 0;
      state.lastActiveSignature = '';
      state.lastProgressLabel = '';
      state.lastRuleRate = '';
      cache.status = null;
      if (renderer) renderer.reset();
      resetLedger(world.seed);
      rebuildRuleTicks();
      rebuildSeals();
      paintStatic();
      updateCensus();
      updateConditions();
      updateRule();
      syncPlayback();
      if (refs.btnRecord) refs.btnRecord.hidden = true;
      if (refs.record) refs.record.hidden = true;
      if (state.controlsMounted && CONTROLS) {
        try {
          if (CONTROLS.setFinished) CONTROLS.setFinished(false);
          if (CONTROLS.setRunning) CONTROLS.setRunning(true);
          if (CONTROLS.update) CONTROLS.update(world, 0);
        } catch (e) { /* no-op */ }
      }
      if (refs.frame) {
        refs.frame.classList.add('is-recasting');
        state.recastTimerA = setTimeout(() => {
          if (refs.frame) refs.frame.classList.remove('is-recasting');
        }, 340);
      }
      if (refs.recastNote) {
        refs.recastNote.hidden = false;
        refs.recastNote.classList.add('is-visible');
        state.recastTimerB = setTimeout(() => {
          if (!refs.recastNote) return;
          refs.recastNote.classList.remove('is-visible');
          refs.recastNote.hidden = true;
        }, 1250);
      }
      requestAnimationFrame(() => { if (renderer) renderer.resize(); });
    }

    function newSeed() {
      let seed = world.seed;
      for (let i = 0; i < 12; i++) {
        const candidate = 1 + Math.floor(Math.random() * 9999);
        if (candidate !== world.seed) { seed = candidate; break; }
      }
      recast(seed);
    }

    /* ----------------------------------------------------------- controls */

    function getSparkData() {
      const h = world ? world.history : [];
      const tail = h.slice(-24);
      return {
        diversity: tail.map((e) => e.diversity),
        mutations: tail.map((e) => e.mutations),
        flora: tail.map((e) => e.counts.flora),
        herbivora: tail.map((e) => e.counts.herbivora),
        carnivora: tail.map((e) => e.counts.carnivora),
        eventGens: world ? world.events.map((e) => ({ gen: e.gen, type: e.type })) : [],
        progress: world ? Math.min(100, (world.generation / Math.max(1, world.config.generations)) * 100) : 0,
        tickRate: state.rateHistory.length ? state.rateHistory.slice(-24) : [TICKS_PER_SECOND * world.config.speed]
      };
    }

    function applyParam(key, value) {
      if (!world) return;
      if (key === 'seed') { recast(value); return; }
      if (key === 'catastrophes' || key === 'trails') {
        ENGINE.setParam(world, key, !!value);
        updateConditions();
        return;
      }
      ENGINE.setParam(world, key, value);
      if (key === 'generations') {
        rebuildRuleTicks();
        rebuildSeals();
        updateCensus();
        updateRule();
        if (world.finished) concludeStudy();
      } else if (key === 'interval') {
        rebuildSeals();
      }
      updateRule();
    }

    function mountControls() {
      if (!CONTROLS || typeof CONTROLS.mount !== 'function' || !refs.instrumentBody) return;
      const ctx = {
        getWorld: () => world,
        getParam: (key) => (key === 'seed' ? world.seed : world.config[key]),
        setParam: applyParam,
        actions: {
          recast: (seed) => recast(seed),
          pause: () => { if (!state.paused) { state.paused = true; syncPlayback(); } },
          resume: () => { if (state.paused) { state.paused = false; syncPlayback(); } },
          stepGen: stepGeneration,
          conclude
        },
        isRunning: () => !state.paused && !state.finished,
        getSparkData,
        catastrophes: ENGINE.CATASTROPHES,
        engine: ENGINE
      };
      try {
        CONTROLS.mount(refs.instrumentBody, ctx);
        state.controlsMounted = true;
        if (CONTROLS.update) CONTROLS.update(world, 0);
      } catch (e) {
        state.controlsMounted = false;
      }
    }

    /* --------------------------------------------------------------- paint */

    function paintStatic() {
      setText(refs.metaSeed, world.seed);
      setText(refs.tagSeed, 'seed ' + world.seed);
      setText(refs.plateCells, world.width + ' × ' + world.height);
      setText(refs.ledgerSeed, world.seed);
      if (refs.metaObservation) refs.metaObservation.textContent = 'No. 0047';
      if (refs.recordMeta && !state.recordOpen) {
        refs.recordMeta.textContent = 'Seed ' + world.seed + ' · ' + world.config.generations + ' generations';
      }
    }

    function updateUI() {
      if (!world) return;
      const N = Math.max(1, world.config.generations);
      setText(refs.metaGen, pad2(world.generation) + ' / ' + N);
      setText(refs.metaSeed, world.seed);
      updateCensus();
      updateRule();
      updateConditions();
      if (refs.vitrineClock) {
        const rate = state.paused ? 0 : state.measuredRate;
        refs.vitrineClock.textContent = 'ticks ' + String(world.tick).padStart(4, '0') + ' · ' + Math.round(rate) + '/s';
      }
      if (refs.metaStatusText) {
        const status = state.finished ? 'Concluded' : state.paused ? 'Held' : 'Observing';
        if (cache.status !== status) { cache.status = status; refs.metaStatusText.textContent = status; }
      }
      if (state.controlsMounted && CONTROLS && CONTROLS.update) {
        try { CONTROLS.update(world, 16); } catch (e) { /* no-op */ }
      }
    }

    /* ---------------------------------------------------------------- loop */

    let lastAnimation = 0;
    function frame(ts) {
      const now = typeof ts === 'number' ? ts : (root.performance ? root.performance.now() : 0);
      if (!lastAnimation) lastAnimation = now;
      const dt = Math.min(90, Math.max(0, now - lastAnimation));
      lastAnimation = now;

      if (!state.finished && !state.paused && world) {
        state.acc += (dt / 1000) * TICKS_PER_SECOND * Math.max(0.0001, world.config.speed);
        let steps = 0;
        while (state.acc >= 1 && steps < 16 && !world.finished) {
          ENGINE.runTick(world);
          state.acc -= 1;
          steps++;
        }
        if (state.acc > 10) state.acc = 10;
        if (world.finished) concludeStudy();
      }

      if (!state.lastRateTs) {
        state.lastRateTs = now;
        state.lastRateTick = world.tick;
      } else if (now - state.lastRateTs > 500) {
        const rate = (world.tick - state.lastRateTick) / ((now - state.lastRateTs) / 1000);
        state.measuredRate = Number.isFinite(rate) ? rate : 0;
        state.rateHistory.push(Math.round(state.measuredRate * 10) / 10);
        if (state.rateHistory.length > 24) state.rateHistory.shift();
        state.lastRateTs = now;
        state.lastRateTick = world.tick;
      }

      processNewEvents();
      if (renderer) renderer.draw(world);
      updateUI();

      root.requestAnimationFrame(frame);
    }

    /* --------------------------------------------------------------- wiring */

    if (refs.btnPlay) refs.btnPlay.addEventListener('click', togglePause);
    if (refs.btnStep) refs.btnStep.addEventListener('click', stepGeneration);
    if (refs.btnConclude) refs.btnConclude.addEventListener('click', conclude);
    if (refs.btnReplay) refs.btnReplay.addEventListener('click', () => { hideRecord(); recast(world.seed); });
    if (refs.btnNewseed) refs.btnNewseed.addEventListener('click', () => { hideRecord(); newSeed(); });
    if (refs.btnBack) refs.btnBack.addEventListener('click', hideRecord);
    if (refs.btnRecord) refs.btnRecord.addEventListener('click', showRecord);

    root.addEventListener('keydown', (ev) => {
      const target = ev.target;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || (target && target.isContentEditable);
      const interactive = target && target.closest && target.closest(
        'button, input, textarea, select, [contenteditable="true"], [role="slider"], [role="switch"], [role="tooltip"]'
      );
      if (ev.key === 'Escape') {
        if (refs.shortcutNote) refs.shortcutNote.hidden = true;
        return;
      }
      if (state.recordOpen) return;
      if (interactive) return;
      if (typing) return;
      if (ev.code === 'Space') {
        ev.preventDefault();
        togglePause();
      } else if (ev.key === 'g' || ev.key === 'G') {
        ev.preventDefault();
        stepGeneration();
      } else if (ev.key === 'r' || ev.key === 'R') {
        ev.preventDefault();
        recast(world.seed);
      } else if (ev.key === '?') {
        if (refs.shortcutNote) refs.shortcutNote.hidden = !refs.shortcutNote.hidden;
      }
    });

    if (refs.shortcutNote) {
      refs.shortcutNote.addEventListener('click', () => { if (refs.shortcutNote) refs.shortcutNote.hidden = true; });
    }

    let resizeTimer = 0;
    if (root.ResizeObserver && refs.frame) {
      const ro = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (renderer) renderer.resize();
          if (state.recordOpen && DASHBOARD && DASHBOARD.onResize) {
            try { DASHBOARD.onResize(); } catch (e) { /* no-op */ }
          }
        }, 90);
      });
      ro.observe(refs.frame);
    } else {
      root.addEventListener('resize', () => {
        if (renderer) renderer.resize();
        if (state.recordOpen && DASHBOARD && DASHBOARD.onResize) DASHBOARD.onResize();
      });
    }

    // Programmatic surface used by the QA harness and curious visitors.
    root.__VIVARIUM__ = {
      version: '1.0.0',
      engine: ENGINE,
      renderer,
      getWorld: () => world,
      getParam: (key) => (key === 'seed' ? world.seed : world.config[key]),
      setParam: applyParam,
      isRunning: () => !state.paused && !state.finished,
      isPaused: () => state.paused,
      isFinished: () => state.finished,
      actions: {
        recast,
        pause: () => { state.paused = true; syncPlayback(); },
        resume: () => { state.paused = false; syncPlayback(); },
        stepGen: stepGeneration,
        conclude,
        showRecord,
        hideRecord
      },
      snapshot: () => ENGINE.snapshot(world),
      hash: () => ENGINE.hashWorld(world),
      getSparkData,
      forceResize: () => { if (renderer) renderer.resize(); if (DASHBOARD && DASHBOARD.onResize) DASHBOARD.onResize(); }
    };

    paintStatic();
    resetLedger(world.seed);
    rebuildRuleTicks();
    rebuildSeals();
    mountControls();
    updateCensus();
    updateConditions();
    updateRule();
    syncPlayback();
    updateUI();
    requestAnimationFrame(() => { if (renderer) renderer.resize(); });
    root.requestAnimationFrame(frame);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})(typeof window !== 'undefined' ? window : globalThis);
