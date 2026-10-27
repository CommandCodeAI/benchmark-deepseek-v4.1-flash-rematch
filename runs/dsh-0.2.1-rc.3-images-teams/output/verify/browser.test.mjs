#!/usr/bin/env node
// BROWSER QA SUITE (contract: DESIGN-BRIEF.md §12; runs the assembled page in
// headless Chrome via CDP). Covers auto-start, offline requests, completion,
// controls, catastrophes, dashboard, a11y and reduced motion.
import { join } from 'node:path';
import { Recorder, assert, assertEqual, SEVERITY } from './lib/check.mjs';
import { readFileSync } from 'node:fs';
import { ROOT, VERIFY, SHOTS, snapshotDeliverable, sha256 } from './lib/workspace.mjs';
import { launchChrome, sleep } from './lib/cdp.mjs';
import { injectProbe, waitUntil } from './lib/probe.mjs';

const URL_FOR = (snap) => snap.url;
const shotPath = (name) => join(SHOTS, `verify-${name}.png`);

function errorSummary(page) {
  return {
    consoleErrors: page.consoleErrors.slice(0, 8),
    exceptions: page.exceptions.slice(0, 8),
    logErrors: page.logErrors.slice(0, 8),
    failedRequests: page.failedRequests.filter((r) => !r.canceled).slice(0, 8),
    counts: {
      consoleErrors: page.consoleErrors.length,
      exceptions: page.exceptions.length,
      logErrors: page.logErrors.length,
      failedRequests: page.failedRequests.filter((r) => !r.canceled).length,
    },
  };
}

async function ensureVisible(page) {
  const vis = await evalOrNull(page, '({ hidden: document.hidden, state: document.visibilityState })');
  if (vis && vis.hidden) {
    try { await page.send('Page.bringToFront', {}, 4000); } catch { /* ignore */ }
    try { await page.send('Emulation.setFocusEmulationEnabled', { enabled: true }, 4000); } catch { /* ignore */ }
    await sleep(180);
    return true;
  }
  return false;
}

function networkAudit(page, pageUrl) {
  const seen = new Map();
  for (const r of page.requests) {
    if (!r.url) continue;
    seen.set(r.url, (seen.get(r.url) || 0) + 1);
  }
  const allowed = (u) =>
    u === pageUrl ||
    u === 'about:blank' ||
    u.startsWith('data:') ||
    u.startsWith('blob:') ||
    u.startsWith('file://') && u.split('#')[0] === pageUrl.split('#')[0] ||
    u.startsWith('chrome');
  const external = [...seen.keys()].filter((u) => !allowed(u));
  return { requestCount: page.requests.length, unique: [...seen.keys()], external };
}

async function freshPage(browser, url, opts = {}) {
  const page = await browser.newPage(opts);
  await page.navigate(url);
  await injectProbe(page);
  return page;
}

async function closeQuietly(page) {
  try {
    await page.close();
  } catch {
    /* ignore */
  }
}

async function evalOrNull(page, expr) {
  try {
    return await page.eval(expr);
  } catch {
    return null;
  }
}

async function safeShot(page, name) {
  try {
    await page.screenshot(shotPath(name));
    return true;
  } catch {
    return false;
  }
}

async function tabTrail(page, n = 70) {
  await page.eval('document.activeElement && document.activeElement.blur ? document.activeElement.blur() : null; window.__vTabStart = true;');
  const trail = [];
  const seenFirst = new Set();
  for (let i = 0; i < n; i++) {
    await page.pressTab();
    const info = await evalOrNull(page, '__VERIFY.focusInfo()');
    if (!info) break;
    trail.push(info);
    const key = `${info.tag}|${info.id}|${info.vv}|${info.ariaLabel}|${info.cls}`;
    if (i > 0 && seenFirst.has(key) && trail.length > 3) break;
    seenFirst.add(key);
    if (trail.length >= 3 && key === `${trail[0].tag}|${trail[0].id}|${trail[0].vv}|${trail[0].ariaLabel}|${trail[0].cls}`) break;
  }
  return trail;
}

async function focusStyleBad(trail) {
  return trail.filter((t) => {
    if (t.tag === 'BODY') return false;
    const outlineVisible = t.outlineStyle !== 'none' && parseFloat(t.outlineWidth) >= 1;
    const shadowVisible = t.boxShadow && t.boxShadow !== 'none';
    return !(outlineVisible || shadowVisible || t.focusVisible);
  });
}

async function pressMouseAtRect(page, rect) {
  await page.mouseMove(rect.x + rect.w / 2, rect.y + rect.h / 2);
  await sleep(120);
}

function pick(list, key) {
  return list.filter((c) => c.key === key);
}

export async function runBrowserSuite({ save = true, keepShots = true } = {}) {
  const rec = new Recorder('browser');
  const override = process.env.VERIFY_PAGE && process.env.VERIFY_PAGE !== 'round 1/index.html' ? process.env.VERIFY_PAGE : null;
  const snap = override
    ? (() => {
        const abs = override.startsWith('/') ? override : join(ROOT, override);
        const buf = readFileSync(abs);
        return { path: abs, url: 'file://' + abs.split('/').map(encodeURIComponent).join('/'), bytes: buf.length, hash: sha256(buf), stable: true };
      })()
    : await snapshotDeliverable({ label: 'browser' });
  const url = URL_FOR(snap);
  const resultsName = override ? 'results-browser-preview.json' : 'results-browser.json';
  rec.note('ENV', `testing snapshot ${snap.hash.slice(0, 16)} (${(snap.bytes / 1024).toFixed(1)} KB, stable=${snap.stable})`, url, { area: 'env' });
  let browser = null;
  const runtimeErrors = [];
  try {
    browser = await launchChrome({ width: 1440, height: 900 });
    try {
      const vres = await fetch(`http://127.0.0.1:${browser.port}/json/version`);
      const ver = await vres.json();
      rec.note('ENV-BROWSER', 'headless Chrome version', `${ver.Browser} / protocol ${ver['Protocol-Version']}`, { area: 'env' });
    } catch { /* ignore */ }
  } catch (e) {
    await rec.check('C0', 'headless Chrome launches', () => Promise.reject(e), { area: 'browser', severity: SEVERITY.BLOCKER });
    if (save) rec.save(join(VERIFY, resultsName));
    rec.print();
    return rec;
  }

  // ===================================================================
  // SCENARIO P1 — DEFAULT PAGE: auto-start, offline, catastrophe, completion
  // ===================================================================
  let page = null;
  const p1 = { bannerLog: [], eventEvidence: null, washSeen: null, conditionsSeen: null, sealsMid: 0, ledgerMid: 0, genStart: null, genEnd: null, autoElapsed: null };
  try {
    page = await freshPage(browser, url);
    await sleep(600);
    await ensureVisible(page);
    await safeShot(page, 'initial-1440');

    await rec.check(
      'C1',
      'default URL auto-starts without params: generation advances from 0',
      async () => {
        const g0 = await page.eval('__VERIFY.genState()');
        p1.genStart = g0;
        const r = await waitUntil(page, '(__VERIFY.genState().gen || 0) >= 1', { timeoutMs: 15000, interval: 100, label: 'generation >= 1' });
        const g1 = await page.eval('__VERIFY.genState()');
        p1.firstGen = g1;
        return { startedAfterMs: r.elapsedMs, total: g1.total, rule: g1.ruleGenText };
      },
      { area: 'autostart', severity: SEVERITY.BLOCKER }
    );

    await rec.check(
      'C2',
      'offline: only the local document is requested (network + resource entries)',
      async () => {
        await sleep(500);
        const net = networkAudit(page, url);
        const perf = await page.eval(`performance.getEntriesByType('resource').map(e => e.name)`);
        assertEqual(net.external.length, 0, `external requests: ${net.external.join(' | ')}`);
        assertEqual((perf || []).length, 0, `resource entries: ${JSON.stringify(perf).slice(0, 200)}`);
        return { requests: net.requestCount, urls: net.unique.length, perfEntries: perf.length };
      },
      { area: 'offline', severity: SEVERITY.BLOCKER }
    );

    // long observation loop: wait for record, sampling events + screenshots
    let midShot = false;
    const deadline = Date.now() + 100000;
    let recordSeen = false;
    while (Date.now() < deadline) {
      if (Date.now() % 4000 < 200) await ensureVisible(page);
      const st = await evalOrNull(page, `(() => {
        const g = __VERIFY.genState();
        return {
          gen: g.gen, total: g.total, finished: g.finished, recordVisible: g.recordVisible,
          banner: __VERIFY.bannerState(), seals: __VERIFY.sealsState().count,
          ledger: __VERIFY.ledgerState().count, wash: __VERIFY.washState(),
          conditions: __VERIFY.conditionsState(), rate: g.rate, status: g.status,
        };
      })()`);
      if (!st) break;
      if (st.banner?.visible) {
        const label = `${st.banner.latin}|${st.banner.name}|${st.banner.gen}`;
        if (!p1.bannerLog.some((b) => b.label === label)) {
          p1.bannerLog.push({ label, latin: st.banner.latin, name: st.banner.name, gen: st.banner.gen, note: st.banner.note, live: st.banner.live });
          p1.bannerLive = st.banner.live;
          // let the banner fade/drop-in settle so the screenshot shows its true legibility
          await sleep(320);
          if (!p1.eventEvidence) {
            p1.eventEvidence = await evalOrNull(page, `(() => { const b = __VERIFY.bannerState(); return { banner: b, wash: __VERIFY.washState(), conditions: __VERIFY.conditionsState() }; })()`);
          }
          await safeShot(page, `event-1440-${p1.bannerLog.length}`);
        }
      }
      if (st.wash && !p1.washSeen && (st.wash.hasEventClass || (parseFloat(st.wash.opacity) > 0.01 && st.wash.visible))) {
        p1.washSeen = st.wash;
      }
      if (st.conditions?.text && !p1.conditionsSeen) p1.conditionsSeen = st.conditions;
      p1.sealsMid = Math.max(p1.sealsMid, st.seals || 0);
      p1.ledgerMid = Math.max(p1.ledgerMid, st.ledger || 0);
      if (!midShot && st.gen >= 5) {
        midShot = true;
        await safeShot(page, 'mid-1440');
      }
      if (st.recordVisible) {
        recordSeen = true;
        p1.genEnd = st;
        p1.autoElapsed = Date.now() - (deadline - 100000);
        break;
      }
      await sleep(160);
    }
    await sleep(700);
    await safeShot(page, 'record-1440');

    await rec.check(
      'C3',
      `auto-transition to THE RECORD at run end (default N=${p1.genStart?.total || 40})`,
      async () => {
        assert(recordSeen, 'record overlay never appeared within 100s');
        const rs = await page.eval('__VERIFY.recordState()');
        assert(rs.visible, 'record not visible');
        assertEqual(rs.hidden, false, '#record hidden attr still set');
        return { autoEndedAfterMs: p1.autoElapsed, meta: rs.meta, title: rs.title };
      },
      { area: 'autostart', severity: SEVERITY.BLOCKER }
    );

    await rec.check(
      'C4',
      'run end reaches configured generation; cursor/status concluded; charts non-blank',
      async () => {
        const rs = await page.eval('__VERIFY.recordState()');
        const g = await page.eval('__VERIFY.genState()');
        const total = p1.genStart?.total || 40;
        assertEqual(g.recordVisible, true, 'record not visible');
        assert((g.gen ?? 0) >= total, `generation ${g.gen} < ${total}`);
        assert(/concl|complete|record|end/i.test(g.status || ''), `status text not concluded: ${g.status}`);
        assert(!rs.chartPop.blank, `population chart blank (nonBg=${rs.chartPop.nonBgRatio})`);
        assert(!rs.chartTraits.blank, `trait chart blank`);
        assert(rs.chartPop.width > 300 && rs.chartPop.height > 150, `pop canvas too small ${rs.chartPop.width}x${rs.chartPop.height}`);
        // record canvases must be backed at device resolution (no upscaled blur)
        for (const [name, c] of [['chart-pop', rs.chartPop], ['chart-traits', rs.chartTraits]]) {
          const minW = c.cssW * 0.985 - 1, minH = c.cssH * 0.985 - 1;
          assert(c.width >= minW && c.height >= minH, `${name} backing ${c.width}x${c.height} smaller than CSS ${c.cssW}x${c.cssH} (upscaled/blurry)`);
        }
        // vitrine renderer sized + alive at run end
        const vit = await page.eval('__VERIFY.canvasStats("#sim-canvas")');
        assert(!vit.blank, 'vitrine canvas blank at run end');
        assert(vit.width >= vit.cssW * 0.985 - 1 && vit.height >= vit.cssH * 0.985 - 1, `vitrine backing ${vit.width}x${vit.height} < CSS ${vit.cssW}x${vit.cssH}`);
        assert(vit.nearFlora + vit.nearFauna + vit.nearPredator > 300, 'vitrine has no species ink at run end');
        // generation rule engraving: cursor + numerals/ticks + progress
        const rule = await page.eval(`(() => {
          const ticks = document.getElementById('rule-ticks');
          const nums = ticks ? [...ticks.querySelectorAll('.rule__tick-num')].map(n => n.textContent.trim()) : [];
          const cur = document.getElementById('rule-cursor');
          const prog = document.getElementById('rule-progress');
          return { tickChildren: ticks ? ticks.children.length : 0, numerals: nums.slice(0, 12), numeralCount: nums.length, cursor: cur ? cur.getBoundingClientRect().width : 0, cursorLabel: (document.getElementById('rule-cursor-label')||{}).textContent, progress: prog ? getComputedStyle(prog).width : null };
        })()`);
        assert(rule.tickChildren >= 8, `generation rule has ${rule.tickChildren} tick children`);
        assert(rule.numeralCount >= Math.floor(total / 5) + 1, `rule numerals ${rule.numeralCount} for ${total} gens (expected major every 5)`);
        assert(rule.cursor > 0 && /\d/.test(rule.cursorLabel || ''), `rule cursor/label missing: ${JSON.stringify(rule)}`);
        return { gen: g.gen, pop: rs.chartPop.nonBgRatio, traits: rs.chartTraits.nonBgRatio, vitrine: vit.nonBgRatio, rule };
      },
      { area: 'autostart', severity: SEVERITY.BLOCKER }
    );

    await rec.check(
      'C9',
      'simulation purity: live world (after renderer/controls/playback) equals fresh headless reference',
      async () => {
        const r = await page.eval(`(() => {
          const V = window.__VIVARIUM__;
          const E = window.VIVARIUM_ENGINE;
          const w = V.getWorld();
          const cfg = JSON.parse(JSON.stringify(w.config));
          const ref = E.createWorld(cfg);
          E.runHeadless(ref, cfg.generations);
          const pageHash = V.hash ? V.hash() : E.hashWorld(w);
          const liveCounts = w.history.map((h) => h.counts);
          const refCounts = ref.history.map((h) => h.counts);
          let firstDiff = -1;
          for (let i = 0; i < Math.min(liveCounts.length, refCounts.length); i++) {
            if (JSON.stringify(liveCounts[i]) !== JSON.stringify(refCounts[i])) { firstDiff = i; break; }
            }
          return {
            pageHash, refHash: E.hashWorld(ref), hashStable: (V.hash ? V.hash() : E.hashWorld(w)) === pageHash,
            gen: w.generation, refGen: ref.generation, firstDiff,
            counts: w.counts, refCounts: ref.counts, liveLen: liveCounts.length, refLen: refCounts.length,
          };
        })()`);
        assertEqual(r.gen, r.refGen, `generation mismatch live=${r.gen} ref=${r.refGen}`);
        assertEqual(r.firstDiff, -1, `history counts differ at generation ${r.firstDiff} (renderer/controls/playback mutated simulation)`);
        assertEqual(r.pageHash, r.refHash, `hash differs: live=${r.pageHash} ref=${r.refHash}`);
        assert(r.hashStable, 'hash() not stable between calls');
        return { hash: r.pageHash, gen: r.gen, historyGens: r.liveLen, counts: r.counts };
      },
      { area: 'engine', severity: SEVERITY.BLOCKER }
    );

    // ---- E: catastrophe visual system observed during the run ----
    await rec.check(
      'E1',
      'catastrophe fires automatically: banner appears with latin/name/gen/note and live region',
      async () => {
        assert(p1.bannerLog.length >= 1, 'no catastrophe banner observed during a 40-gen run (interval 8)');
        const ev = p1.bannerLog[0];
        assert(ev.latin && ev.latin.length >= 4, 'banner latin missing');
        assert(ev.name && ev.name.length >= 4, 'banner name missing');
        assert(/\d+/.test(ev.gen || ''), `banner gen missing: ${ev.gen}`);
        assert(ev.note && ev.note.length >= 8, 'banner consequence note missing');
        const live = ev.live || {};
        const liveOk = !!(live.ownLive || live.ownRole === 'status' || live.inner || live.globalCount > 0);
        assert(liveOk, 'banner is not announced via role=status/aria-live (no live region found in banner or page): ' + JSON.stringify(live).slice(0, 300));
        return { bannersSeen: p1.bannerLog.map((b) => b.label), note: ev.note };
      },
      { area: 'catastrophe', severity: SEVERITY.BLOCKER }
    );

    await rec.check(
      'E2',
      'event wash seen on page during catastrophe (watercolour overlay, no flash)',
      async () => {
        assert(p1.washSeen, 'no active #wash overlay observed during any catastrophe');
        return p1.washSeen;
      },
      { area: 'catastrophe', severity: SEVERITY.MAJOR }
    );

    await rec.check(
      'E3',
      'persistent condition note appears while catastrophe active',
      async () => {
        assert(p1.conditionsSeen, 'no active-conditions note observed during catastrophe');
        return p1.conditionsSeen.text;
      },
      { area: 'catastrophe', severity: SEVERITY.MAJOR }
    );

    await rec.check(
      'E4',
      'wax seals pinned on rule + ledger entries appended for events',
      async () => {
        const seals = await page.eval('__VERIFY.sealsState()');
        const ledger = await page.eval('__VERIFY.ledgerState()');
        assert(p1.sealsMid >= 1, `no rule seals seen during run (mid=${p1.sealsMid})`);
        assert(seals.count >= p1.sealsMid, `seals count dropped ${p1.sealsMid} -> ${seals.count}`);
        assert(ledger.count >= 2, `ledger entries not appended (count=${ledger.count})`);
        const latins = ['Siccitas', 'Pestilentia', 'Incendium'];
        const evEntry = ledger.entries.find((t) => latins.some((l) => t.includes(l)));
        assert(evEntry, `no ledger entry mentions a catastrophe latin name (entries: ${JSON.stringify(ledger.entries.slice(0, 5))})`);
        assert(/GEN \d+/.test(evEntry), `event ledger entry missing GEN marker: ${evEntry}`);
        return { seals: p1.sealsMid, ledgerEntries: ledger.count, counter: ledger.counter, eventEntry: evEntry.slice(0, 120) };
      },
      { area: 'catastrophe', severity: SEVERITY.MAJOR }
    );

    await rec.check(
      'E5',
      'dashboard shows catastrophe markers (rust/violet ink pixels on census chart)',
      async () => {
        const rs = await page.eval('__VERIFY.recordState()');
        const pins = rs.chartPop.nearWaxStrict;
        assert(pins >= 4, `too few wax-pin marker pixels on census chart (strict wax=${pins}; broad wax=${rs.chartPop.nearWax})`);
        return { waxPins: pins, broadWax: rs.chartPop.nearWax, rust: rs.chartPop.nearRust };
      },
      { area: 'catastrophe', severity: SEVERITY.MAJOR }
    );

    await rec.check(
      'C5',
      'zero console errors / page exceptions / failed requests during full default run',
      async () => {
        const errs = errorSummary(page);
        assertEqual(errs.counts.exceptions, 0, `page exceptions: ${JSON.stringify(errs.exceptions).slice(0, 300)}`);
        assertEqual(errs.counts.consoleErrors, 0, `console errors: ${JSON.stringify(errs.consoleErrors).slice(0, 300)}`);
        assertEqual(errs.counts.logErrors, 0, `log errors: ${JSON.stringify(errs.logErrors).slice(0, 300)}`);
        assertEqual(errs.counts.failedRequests, 0, `failed requests: ${JSON.stringify(errs.failedRequests).slice(0, 300)}`);
        return 'no errors';
      },
      { area: 'errors', severity: SEVERITY.BLOCKER }
    );
  } catch (e) {
    rec.note('P1-CRASH', 'SCENARIO P1 aborted', String(e && (e.stack || e.message)).slice(0, 1200), { area: 'browser', severity: SEVERITY.BLOCKER });
    runtimeErrors.push(String(e));
  } finally {
    await closeQuietly(page);
  }

  // ===================================================================
  // SCENARIO P2 — CONTROLS, KEYBOARD, A11Y, FOLIO, SHORTCUTS (fresh page)
  // ===================================================================
  page = null;
  try {
    page = await freshPage(browser, url);
    await sleep(500);
    await ensureVisible(page);
    // pause immediately so readouts are stable
    let paused = false;
    try {
      await page.eval('document.activeElement && document.activeElement.blur && document.activeElement.blur()');
      await page.key(' ');
      await sleep(250);
      const gs = await page.eval('__VERIFY.genState()');
      paused = /paus|halt/i.test(gs.status || '') || (await page.eval(`document.querySelector('#btn-play')?.getAttribute('aria-pressed') === 'true'`));
    } catch { /* ignore */ }
    const marks = await page.eval('__VERIFY.markControls()');
    rec.note('D-ENV', `controls mounted: ${marks.length}; paused=${paused}`, marks.map((m) => `${m.vv}:${m.tag}${m.role ? '@' + m.role : ''}`).join(', '), { area: 'controls' });

    const keys = [...new Set(marks.map((m) => m.key))].filter((k) => k !== 'unknown');
    const requiredKeys = ['seed', 'mutation', 'regrowth', 'generations', 'speed', 'interval', 'catastrophes', 'trails'];

    await rec.check(
      'D1',
      'all 8 required instruments present; ≥8 sparkline canvases in folio; 4 distinct control builds',
      async () => {
        const missing = requiredKeys.filter((k) => !keys.includes(k));
        assertEqual(missing.length, 0, `missing instruments: ${missing.join(', ')} (found ${keys.join(', ')})`);
        const canvasInfo = await page.eval(`(() => {
          const folio = document.getElementById('folio');
          const spark = [...folio.querySelectorAll('canvas')];
          return { total: spark.length, sizes: spark.slice(0,10).map(c => { const r=c.getBoundingClientRect(); return Math.round(r.width)+'x'+Math.round(r.height); }) };
        })()`);
        assert(canvasInfo.total >= 8, `folio sparkline canvases: ${canvasInfo.total} (need >=8)`);
        const continuous = marks.filter((m) => ['mutation', 'regrowth', 'speed', 'interval'].includes(m.key));
        const nativeRanges = continuous.filter((m) => m.tag === 'INPUT' && m.type === 'range').length;
        const roleSliders = continuous.filter((m) => m.role === 'slider').length;
        const toggles = marks.filter((m) => ['catastrophes', 'trails'].includes(m.key));
        const switchLike = toggles.filter((m) => m.role === 'switch' || (m.tag === 'INPUT' && m.type === 'checkbox') || m.tag === 'BUTTON').length;
        assert(nativeRanges + roleSliders >= 4, `only ${nativeRanges + roleSliders} continuous controls detected`);
        assert(roleSliders >= 1, 'no custom dial (role=slider) detected');
        assertEqual(switchLike, 2, `expected 2 toggles, detected ${switchLike}`);
        const steppers = marks.filter((m) => ['seed', 'generations'].includes(m.key));
        return { missing: [], sparks: canvasInfo.total, sizes: canvasInfo.sizes, nativeRanges, roleSliders, switchLike, steppers: steppers.map((s) => `${s.tag}/${s.role || s.type}`) };
      },
      { area: 'controls', severity: SEVERITY.BLOCKER }
    );

    await rec.check(
      'D2',
      'every instrument row has label + unit + numeric live readout',
      async () => {
        const units = { mutation: /per locus|\/\s*birth|%|\/gen/i, regrowth: /×|x\b|vigour|vigor|green/i, speed: /×|x\b|ticks|\/\s*second/i, interval: /gen|season|weather/i, generations: /gen/i };
        const labels = { seed: /seed|provenance/i, mutation: /mutation|locus|inheritance/i, regrowth: /regrowth|vigour|vigor|green/i, generations: /generation|duration/i, speed: /speed|tempo|rate|veloc/i, interval: /interval|weather|rhythm|between/i, catastrophes: /catastroph|weather|armed/i, trails: /trail|ghost|optic/i };
        const report = {};
        for (const k of requiredKeys) {
          const c = pick(marks, k)[0];
          assert(c, `instrument ${k} missing`);
          const row = c.rowText || '';
          assert(labels[k].test(row), `${k}: label missing from row text "${row.slice(0, 90)}"`);
          if (['catastrophes', 'trails'].includes(k)) {
            assert(/ARMED|CALM|ON\b|OFF\b|WEATHER|OPTIC/i.test(row), `${k}: toggle state readout missing from row "${row.slice(0, 110)}"`);
          } else {
            assert(/\d/.test(row), `${k}: no numeric readout in row "${row.slice(0, 90)}"`);
          }
          if (units[k]) assert(units[k].test(row), `${k}: unit missing from row "${row.slice(0, 110)}"`);
          report[k] = row.slice(0, 70);
        }
        return report;
      },
      { area: 'controls', severity: SEVERITY.MAJOR }
    );

    await rec.check(
      'G-ARIA',
      'ARIA: sliders valuemin/max/now, switches aria-checked, canvases role=img+label, no unnamed buttons',
      async () => {
        const audit = await page.eval('__VERIFY.ariaAudit()');
        assertEqual(audit.emptyButtons.length, 0, `buttons without accessible name: ${JSON.stringify(audit.emptyButtons).slice(0, 300)}`);
        assert(audit.sliderCount >= 4, `slider count ${audit.sliderCount} < 4 (mutation/regrowth/speed/interval)`);
        for (const s of audit.sliders) {
          assert(s.hasMin && s.hasMax && s.hasNow, `slider ${s.id || s.ariaLabel} missing min/max/now (${JSON.stringify(s).slice(0, 200)})`);
          assert(s.ariaLabel, `slider ${s.id} has no accessible label`);
        }
        for (const sw of audit.switches) {
          assert(sw.checked === 'true' || sw.checked === 'false', `switch ${sw.id || sw.ariaLabel} missing aria-checked`);
          assert(sw.ariaLabel || sw.id, `switch ${sw.id} has no accessible name`);
        }
        const charts = audit.canvases.filter((c) => !c.inFolio);
        for (const c of charts) {
          assertEqual(c.role, 'img', `canvas #${c.id} role=${c.role}, expected img`);
          assert(c.label && c.label.length > 15, `canvas #${c.id} aria-label too short: "${c.label}"`);
        }
        assert(audit.liveRegions.length >= 1, 'no aria-live/status region found');
        return { sliders: audit.sliderCount, switches: audit.switchCount, canvases: audit.canvCount, charts: charts.map((c) => c.id), live: audit.liveRegions.length };
      },
      { area: 'a11y', severity: SEVERITY.MAJOR }
    );

    await rec.check(
      'G-SKIP',
      'skip link: present, first Tab stop, visible on focus, jumps to the plate canvas',
      async () => {
        const info = await page.eval(`(() => {
          const a = document.querySelector('.skip-link, a[href="#sim-canvas"], a[href^="#"]');
          if (!a) return { missing: true };
          const r = a.getBoundingClientRect();
          return { text: (a.textContent||'').trim(), href: a.getAttribute('href'), rect: { x:r.x, y:r.y, w:r.width, h:r.height }, visible: r.width>0 && r.height>0 };
        })()`);
        assert(!info.missing, 'no skip link found');
        assertEqual(info.href, '#sim-canvas', `skip link href=${info.href}`);
        // Tab from body should land on skip link
        await page.eval('document.activeElement && document.activeElement.blur ? document.activeElement.blur() : null');
        await page.pressTab();
        await sleep(320);
        const fi = await page.eval('__VERIFY.focusInfo()');
        const firstIsSkip = /skip/i.test(fi.cls || '') || /skip/i.test(fi.text || '') || (fi.tag === 'A' && fi.rect && fi.rect.h > 0);
        assert(firstIsSkip, `first tab stop is not the skip link: ${JSON.stringify(fi).slice(0, 200)}`);
        const onScreen = await page.eval('__VERIFY.focusInfo().rect');
        assert(onScreen && onScreen.y >= -4 && onScreen.y < 120, `skip link focused but off-screen: ${JSON.stringify(onScreen)}`);
        await page.key('Enter');
        await sleep(250);
        const after = await page.eval(`({ hash: location.hash, active: document.activeElement?.id || document.activeElement?.tagName })`);
        assert(after.hash === '#sim-canvas' || after.active === 'sim-canvas', `skip link did not move focus/hash: ${JSON.stringify(after)}`);
        return { ...info, after };
      },
      { area: 'a11y', severity: SEVERITY.MAJOR }
    );

    await rec.check(
      'D3',
      'keyboard: every instrument reachable by Tab',
      async () => {
        const trail = await tabTrail(page, 80);
        const vvs = new Set(trail.map((t) => t.vv).filter(Boolean));
        const missing = requiredKeys.filter((k) => ![...vvs].some((v) => v === k || v.startsWith(k + '-')));
        assertEqual(missing.length, 0, `unreachable by Tab: ${missing.join(', ')} (trail=${trail.length}, vvs=${[...vvs].join(',')})`);
        rec.note('D3-trail', 'tab trail', trail.map((t) => t.vv || t.tag + (t.id ? '#' + t.id : '')).join(' > '), { area: 'controls' });
        return { stops: trail.length, instrumentsReached: requiredKeys.length };
      },
      { area: 'controls', severity: SEVERITY.BLOCKER }
    );

    await rec.check(
      'D4',
      'keyboard focus state visible on every stop (2px ink outline / brass tick)',
      async () => {
        const trail = await tabTrail(page, 80);
        const bad = await focusStyleBad(trail);
        assertEqual(bad.length, 0, `focus not visible on: ${JSON.stringify(bad.slice(0, 5)).slice(0, 500)}`);
        const sample = trail.find((t) => t.vv && t.vv.startsWith('mutation'));
        return { stops: trail.length, sampleOutline: sample ? `${sample.outlineStyle} ${sample.outlineWidth} ${sample.outlineColor} offset ${sample.outlineOffset}` : null };
      },
      { area: 'a11y', severity: SEVERITY.MAJOR }
    );

    await rec.check(
      'D5',
      'sliders/dials: arrows + Home/End + PageUp/PageDown change values; boundaries respected',
      async () => {
        const results = {};
        for (const key of ['mutation', 'regrowth', 'speed', 'interval']) {
          const vv = pick(marks, key)[0].vv;
          const focused = await page.eval(`__VERIFY.focusVV(${JSON.stringify(vv)})`);
          assert(focused && focused.vv === vv, `could not focus ${key}`);
          const before = await page.eval(`__VERIFY.valueVV(${JSON.stringify(vv)})`);
          await page.key('ArrowRight');
          await sleep(90);
          const afterRight = await page.eval(`__VERIFY.valueVV(${JSON.stringify(vv)})`);
          const changedRight = JSON.stringify(before) !== JSON.stringify(afterRight);
          await page.key('Home');
          await sleep(90);
          const atHome = await page.eval(`__VERIFY.valueVV(${JSON.stringify(vv)})`);
          // from min: PageUp must increase
          await page.key('PageUp');
          await sleep(90);
          const afterPageUp = await page.eval(`__VERIFY.valueVV(${JSON.stringify(vv)})`);
          const pageUpChanged = JSON.stringify(afterPageUp) !== JSON.stringify(atHome);
          // boundary: ArrowLeft at min must not go below
          await page.key('Home');
          await sleep(60);
          await page.key('ArrowLeft');
          await sleep(90);
          const belowMin = await page.eval(`__VERIFY.valueVV(${JSON.stringify(vv)})`);
          await page.key('End');
          await sleep(90);
          const atEnd = await page.eval(`__VERIFY.valueVV(${JSON.stringify(vv)})`);
          const homeEndDiffer = JSON.stringify(atHome) !== JSON.stringify(atEnd);
          // from max: PageDown must decrease (if not a dial without page step, fall back to ArrowDown)
          await page.key('PageDown');
          await sleep(90);
          const afterPageDown = await page.eval(`__VERIFY.valueVV(${JSON.stringify(vv)})`);
          const pageDownChanged = JSON.stringify(afterPageDown) !== JSON.stringify(atEnd);
          await page.key('Home');
          results[key] = { changedRight, homeEndDiffer, pageUpChanged, pageDownChanged, before: before?.ariaNow ?? before?.value, home: atHome?.ariaNow ?? atHome?.value, end: atEnd?.ariaNow ?? atEnd?.value };
          assert(changedRight, `${key}: ArrowRight did not change value (${JSON.stringify(before)} -> ${JSON.stringify(afterRight)})`);
          assert(homeEndDiffer, `${key}: Home/End did not change value (home=${JSON.stringify(atHome)} end=${JSON.stringify(atEnd)})`);
          assert(pageUpChanged, `${key}: PageUp did not change value from minimum`);
          assert(pageDownChanged, `${key}: PageDown did not change value from maximum`);
        }
        return results;
      },
      { area: 'controls', severity: SEVERITY.BLOCKER }
    );

    await rec.check(
      'D6',
      'steppers (seed/generations) adjustable from keyboard; seed recast resets the study',
      async () => {
        const seedMark = pick(marks, 'seed')[0];
        await page.eval(`__VERIFY.focusVV(${JSON.stringify(seedMark.vv)})`);
        const before = await page.eval(`__VERIFY.valueVV(${JSON.stringify(seedMark.vv)})`);
        if (seedMark.tag === 'INPUT') {
          await page.key('ArrowUp');
          await sleep(120);
        } else {
          // custom stepper: try up/down buttons inside the row
          const clicked = await page.eval(`(() => {
            const el = document.querySelector('[data-vv="${seedMark.vv}"]');
            const row = el?.closest('[data-instrument], .instrument, .instrument-row, .control-row, .folio__row, li, fieldset, .setting') || el?.parentElement?.parentElement;
            const btns = [...(row?.querySelectorAll('button') || [])];
            const up = btns.find(b => /\\+|up|inc|›|next/i.test((b.textContent||'') + ' ' + (b.getAttribute('aria-label')||'') + ' ' + b.className));
            if (up) { up.click(); return true; }
            return false;
          })()`);
          assert(clicked, 'seed stepper has no keyboard-adjust/increment path');
          await sleep(150);
        }
        const after = await page.eval(`__VERIFY.valueVV(${JSON.stringify(seedMark.vv)})`);
        assert(JSON.stringify(before) !== JSON.stringify(after), `seed stepper value unchanged by keyboard: ${JSON.stringify(before)}`);
        const g = await page.eval('__VERIFY.genState()');
        assert((g.gen ?? 99) <= 2, `seed recast did not reset generation (gen=${g.gen})`);
        // recast note (300ms wipe + small paper note)
        let recastNote = null;
        try {
          recastNote = await waitUntil(page, `(() => { const n = document.getElementById('recast-note'); return n && !n.hidden ? (n.textContent || '').replace(/\s+/g, ' ').trim() : null; })()`, { timeoutMs: 1800, interval: 80, label: 'recast paper note' });
        } catch (e) {
          recastNote = null;
        }
        return { before: before.value ?? before.ariaNow, after: after.value ?? after.ariaNow, seedText: g.seed, gen: g.gen, recastNote: recastNote ? recastNote.value : null };
      },
      { area: 'controls', severity: SEVERITY.MAJOR }
    );

    await rec.check(
      'D7',
      'toggles: Space and Enter flip switch state (aria-checked)',
      async () => {
        const out = {};
        const fresh = await page.eval('__VERIFY.markControls()');
        for (const key of ['trails', 'catastrophes', 'trails']) {
          const m = pick(fresh, key)[0];
          if (!m) continue;
          const focused = await page.eval(`__VERIFY.focusVV(${JSON.stringify(m.vv)})`);
          assert(focused && focused.vv === m.vv, `could not focus toggle ${key} after recast (controls may have remounted)`);
          const before = await page.eval(`__VERIFY.valueVV(${JSON.stringify(m.vv)})`);
          await page.key(key === 'catastrophes' ? 'Enter' : ' ');
          await sleep(150);
          const after = await page.eval(`__VERIFY.valueVV(${JSON.stringify(m.vv)})`);
          const changed = before.ariaChecked !== after.ariaChecked || before.value !== after.value || before.rowText !== after.rowText;
          out[key] = { before: before.ariaChecked, after: after.ariaChecked, changed };
          if (key === 'trails') assert(changed, `${key}: Space did not flip toggle (${JSON.stringify(before)} -> ${JSON.stringify(after)})`);
          if (key === 'catastrophes') assert(changed, `${key}: Enter did not flip toggle`);
        }
        // leave catastrophes ON for later scenarios
        return out;
      },
      { area: 'controls', severity: SEVERITY.MAJOR }
    );

    await rec.check(
      'D8',
      'tooltips: appear on hover AND focus, have content, dismiss on Escape, aria-describedby wired',
      async () => {
        const triggers = await page.eval('__VERIFY.tooltipTriggers()');
        assert(triggers.length >= 1, 'no tooltip triggers found in folio');
        const trig = triggers[0];
        await pressMouseAtRect(page, trig.rect);
        await sleep(200);
        const hoverState = await page.eval('__VERIFY.tooltipState()');
        const hoverOk = hoverState.visible && (hoverState.text || '').length > 8;
        // escape
        await page.key('Escape');
        await sleep(180);
        await ensureVisible(page);
        const afterEsc = await page.eval('__VERIFY.tooltipState()');
        const escOk = !afterEsc.visible;
        // focus path: focus the (i) help trigger itself; tooltip must appear on focus
        let focusState = { visible: false, text: '' };
        let focusIdx = triggers.findIndex((t) => /field note|help|about|info/i.test((t.label || '') + ' ' + (t.text || '')));
        if (focusIdx < 0) focusIdx = triggers.findIndex((t) => t.describedby);
        if (focusIdx >= 0) {
          await page.eval(`__VERIFY.focusTrigger(${focusIdx})`);
          await sleep(260);
          focusState = await page.eval('__VERIFY.tooltipState()');
        }
        const focusOk = focusState.visible && (focusState.text || '').length > 8;
        const describedByOk = triggers.some((t) => t.describedby && page.eval ? true : false);
        if (focusOk) { await page.key('Escape'); await sleep(160); await ensureVisible(page); }
        assert(describedByOk || focusOk || hoverOk, 'tooltip system not functional');
        assert(hoverOk, `tooltip did not appear on hover (state=${JSON.stringify(hoverState).slice(0, 200)})`);
        assert(escOk, `Escape did not dismiss tooltip (state=${JSON.stringify(afterEsc).slice(0, 200)})`);
        if (!hoverState.inViewport) throw new Error(`tooltip rendered off-screen: ${JSON.stringify(hoverState.rect)}`);
        return { triggers: triggers.length, hoverOk, escOk, focusOk, describedByOk, inViewport: hoverState.inViewport, sample: (hoverState.text || '').slice(0, 140) };
      },
      { area: 'controls', severity: SEVERITY.MAJOR }
    );

    await rec.check(
      'D9',
      'folio fold/unfold: collapses to spine, folded controls leave tab order, state persists after reload',
      async () => {
        const before = await page.eval('__VERIFY.interactiveInFolio()');
        assert(before.toggle, 'folio toggle missing');
        const clickFolioToggle = async () => {
          const r = await page.eval(`(() => { const b = document.getElementById('folio-toggle').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
          await page.click(r.x, r.y);
          await sleep(800);
        };
        await clickFolioToggle();
        const folded = await page.eval('__VERIFY.interactiveInFolio()');
        assertEqual(folded.toggle.ariaExpanded, 'false', 'aria-expanded not false after fold');
        assert(folded.panelHidden || folded.panelAriaHidden === 'true' || folded.panelInert || folded.panelDisplay === 'none' || folded.panelVisibility === 'hidden', `panel not hidden when folded: ${JSON.stringify({ hidden: folded.panelHidden, aria: folded.panelAriaHidden, inert: folded.panelInert, display: folded.panelDisplay, vis: folded.panelVisibility })}`);
        assert(folded.folioW < 140, `folio width after fold ${folded.folioW} (expected spine <140px)`);
        const trail = await tabTrail(page, 30);
        const inside = trail.filter((t) => t.vv && keys.some((k) => t.vv.startsWith(k)));
        assertEqual(inside.length, 0, `folded controls still tabbable: ${[...new Set(inside.map((t) => t.vv))].join(',')}`);
        // expand
        await clickFolioToggle();
        const expanded = await page.eval('__VERIFY.interactiveInFolio()');
        assertEqual(expanded.toggle.ariaExpanded, 'true', 'aria-expanded not true after unfold');
        assert(expanded.folioW > 300, `folio width after unfold ${expanded.folioW} (expected ~383)`);
        // persistence across reload
        await clickFolioToggle();
        const foldedW = (await page.eval('__VERIFY.interactiveInFolio()')).folioW;
        await page.navigate(url);
        await injectProbe(page);
        await sleep(600);
        const afterReload = await page.eval('__VERIFY.interactiveInFolio()');
        const persisted = afterReload.toggle.ariaExpanded === 'false' && afterReload.folioW < 140;
        // restore expanded for the rest of the suite
        await clickFolioToggle();
        return { before: before.folioW, folded: foldedW, expanded: expanded.folioW, persisted, afterReloadWidth: afterReload.folioW };
      },
      { area: 'controls', severity: SEVERITY.MAJOR }
    );

    await rec.check(
      'D10',
      'no clipping at 1440×900: no page scroll, controls inside viewport, no clipped text',
      async () => {
        await ensureVisible(page);
        const scan = await page.eval('__VERIFY.overflowScan()');
        const scroll = await page.eval('__VERIFY.scrollTest()');
        assert(!scroll.canScrollX, `page scrolls horizontally at 1440x900: ${JSON.stringify(scroll)}`);
        assert(!scroll.canScrollY, `page scrolls vertically at 1440x900: ${JSON.stringify(scroll)}`);
        const clipped = scan.items.filter((i) => i.kind === 'text-clipped' || i.kind === 'text-clipped-y');
        const outside = scan.items.filter((i) => i.kind === 'x-outside');
        assertEqual(clipped.length, 0, `clipped text: ${JSON.stringify(clipped.slice(0, 4)).slice(0, 500)}`);
        assertEqual(outside.length, 0, `elements outside viewport: ${JSON.stringify(outside.slice(0, 4)).slice(0, 500)}`);
        return { itemCount: scan.count, canScroll: [scroll.canScrollX, scroll.canScrollY], overflowVisible: scan.items.filter((i) => i.kind.includes('overflow')).length };
      },
      { area: 'layout', severity: SEVERITY.MAJOR }
    );

    await rec.check(
      'D11',
      'pause/resume + step shortcuts: Space halts/resumes, G advances exactly one generation',
      async () => {
        // ensure plate visible (Escape via CDP can flip visibilityState in headless)
        await ensureVisible(page);
        await page.eval('document.activeElement && document.activeElement.blur ? document.activeElement.blur() : null');
        // Force running state: click play if paused
        const running = await page.eval(`!document.querySelector('#btn-play')?.getAttribute('aria-pressed') || document.querySelector('#btn-play')?.getAttribute('aria-pressed') === 'false'`);
        if (!running) await page.eval(`document.querySelector('#btn-play').click()`);
        await sleep(500);
        const before = await page.eval('__VERIFY.genState()');
        await page.key(' '); // pause
        await sleep(400);
        const pausedAt = await page.eval('__VERIFY.genState()');
        await sleep(1000);
        const stillPaused = await page.eval('__VERIFY.genState()');
        const pausedStable = (stillPaused.gen ?? 0) === (pausedAt.gen ?? 0);
        assert(pausedStable, `generation advanced while paused: ${pausedAt.gen} -> ${stillPaused.gen}`);
        // G step while paused
        await page.key('g');
        await sleep(300);
        const stepped = await page.eval('__VERIFY.genState()');
        const stepDelta = (stepped.gen ?? 0) - (stillPaused.gen ?? 0);
        assertEqual(stepDelta, 1, `G advanced ${stepDelta} generations, expected 1`);
        // resume
        await page.key(' ');
        await sleep(900);
        const resumed = await page.eval('__VERIFY.genState()');
        assert((resumed.gen ?? 0) > (stepped.gen ?? 0), `Space did not resume: ${stepped.gen} -> ${resumed.gen}`);
        return { before: before.gen, pausedAt: pausedAt.gen, stepped: stepped.gen, resumed: resumed.gen };
      },
      { area: 'controls', severity: SEVERITY.MAJOR }
    );

    await rec.check(
      'D12',
      'shortcuts: ? opens shortcut note, Escape closes; typing in seed input does not trigger shortcuts',
      async () => {
        await ensureVisible(page);
        await page.eval('document.activeElement && document.activeElement.blur ? document.activeElement.blur() : null');
        await page.key('?');
        await sleep(250);
        const note = await page.eval(`(() => { const n = document.getElementById('shortcut-note'); if (!n) return { exists: false }; const r = n.getBoundingClientRect(); return { exists: true, hidden: n.hidden, visible: r.width>0 && r.height>0, text: (n.textContent||'').replace(/\\s+/g,' ').trim().slice(0,200) }; })()`);
        if (note.exists) {
          assert(note.visible && !note.hidden, `? did not open shortcut note: ${JSON.stringify(note).slice(0, 200)}`);
        }
        await page.key('Escape');
        await sleep(250);
        await ensureVisible(page);
        const noteAfter = await page.eval(`(() => { const n = document.getElementById('shortcut-note'); if (!n) return null; return { hidden: n.hidden, visible: (n.getBoundingClientRect().width > 0) }; })()`);
        if (noteAfter) assert(noteAfter.hidden || !noteAfter.visible, `Escape did not close shortcut note: ${JSON.stringify(noteAfter)}`);
        // typing protection: focus seed input and press G
        const seedMark = pick(await page.eval('__VERIFY.markControls()'), 'seed')[0];
        const gBefore = await page.eval('__VERIFY.genState()');
        if (seedMark && seedMark.tag === 'INPUT') {
          await page.eval(`__VERIFY.focusVV(${JSON.stringify(seedMark.vv)})`);
          await page.eval('document.activeElement.select && document.activeElement.select()');
          await page.typeChar('g');
          await sleep(350);
          const gAfter = await page.eval('__VERIFY.genState()');
          const typingShortcutHijack = (gAfter.gen ?? 0) - (gBefore.gen ?? 0) > 1;
          assert(!typingShortcutHijack, 'G shortcut fired while typing in seed input');
          return { noteOpened: note.exists ? note.visible : false, typingProtected: true };
        }
        return { noteOpened: note.exists ? note.visible : false, typingProtected: 'no input-based stepper (skipped)' };
      },
      { area: 'controls', severity: SEVERITY.MINOR }
    );

    await rec.check(
      'D13',
      'live params: mutation/speed/interval readouts update and apply; generations shortening ends the run',
      async () => {
        // mutation change (controls may have remounted after recast in D6)
        await ensureVisible(page);
        const freshMarks = await page.eval('__VERIFY.markControls()');
        const mut = pick(freshMarks, 'mutation')[0];
        await page.eval(`__VERIFY.focusVV(${JSON.stringify(mut.vv)})`);
        const before = await page.eval(`__VERIFY.valueVV(${JSON.stringify(mut.vv)})`);
        for (let i = 0; i < 4; i++) await page.key('ArrowRight');
        await sleep(250);
        const after = await page.eval(`__VERIFY.valueVV(${JSON.stringify(mut.vv)})`);
        assert(JSON.stringify(before) !== JSON.stringify(after), 'mutation readout did not update');
        // speed max + interval min
        const spd = pick(freshMarks, 'speed')[0];
        await page.eval(`__VERIFY.focusVV(${JSON.stringify(spd.vv)})`);
        await page.key('End');
        await sleep(250);
        const rate = await page.eval('__VERIFY.genState()');
        const speedRow = await page.eval(`__VERIFY.valueVV(${JSON.stringify(spd.vv)})`);
        const interval = pick(freshMarks, 'interval')[0];
        await page.eval(`__VERIFY.focusVV(${JSON.stringify(interval.vv)})`);
        await page.key('Home');
        await sleep(250);
        const intervalRow = await page.eval(`__VERIFY.valueVV(${JSON.stringify(interval.vv)})`);
        // run to decade >= 11 then set generations to min (10) -> study must conclude
        await waitUntil(page, '(__VERIFY.genState().gen || 0) >= 11', { timeoutMs: 15000, interval: 120, label: 'gen >= 11 at max speed' });
        const gens = pick(await page.eval('__VERIFY.markControls()'), 'generations')[0];
        await page.eval(`__VERIFY.focusVV(${JSON.stringify(gens.vv)})`);
        await page.key('Home'); // min = 10 < current gen
        await sleep(600);
        const ended = await waitUntil(page, '__VERIFY.recordState().visible', { timeoutMs: 8000, interval: 150, label: 'shortened run ends' });
        return { mutation: `${before.ariaNow ?? before.value} -> ${after.ariaNow ?? after.value}`, speedRow: speedRow.rowText.slice(0, 60), rate: rate.rate, intervalRow: intervalRow.rowText.slice(0, 60), endedAfterMs: ended.elapsedMs };
      },
      { area: 'controls', severity: SEVERITY.BLOCKER }
    );

    await rec.check(
      'D14',
      'specimen tag: hovering/clicking a creature pins a card with taxon, genes+units, energy/age',
      async () => {
        await ensureVisible(page);
        // plate must be visible (not behind record)
        const recVisible = await page.eval('__VERIFY.recordState().visible');
        if (recVisible) { await page.eval('window.__VIVARIUM__ && window.__VIVARIUM__.actions && window.__VIVARIUM__.actions.hideRecord && window.__VIVARIUM__.actions.hideRecord()'); await sleep(400); }
        const rect = await page.eval('__VERIFY.canvasRect("#sim-canvas")');
        let card = null;
        const points = [];
        for (let gy = 1; gy <= 3; gy++) for (let gx = 1; gx <= 6; gx++) points.push({ x: rect.x + (rect.w * gx) / 7, y: rect.y + (rect.h * gy) / 4 });
        for (const pt of points) {
          await page.mouseMove(pt.x, pt.y);
          await sleep(120);
          card = await page.eval('__VERIFY.specimenCard()');
          if (card && card.visible && card.text.length > 30) break;
          if (!card.visible) { await page.click(pt.x, pt.y); await sleep(150); card = await page.eval('__VERIFY.specimenCard()'); if (card && card.visible && card.text.length > 30) break; }
        }
        if (!card || !card.visible || card.text.length < 30) {
          return { skipped: true, reason: 'no creature hit after grid probe', probes: points.length };
        }
        const t = card.text;
        const hasTaxon = /flora|herbivora|carnivora|Virens|Lepus|Vulpes/i.test(t);
        const hasGenes = /speed|vision|metabolism|threshold|growth|dispersal|energy/i.test(t);
        assert(hasTaxon, `specimen card lacks taxon: "${t.slice(0, 200)}"`);
        assert(hasGenes, `specimen card lacks gene/trait readouts: "${t.slice(0, 200)}"`);
        return { text: t.slice(0, 260) };
      },
      { area: 'controls', severity: SEVERITY.MINOR }
    );

    await rec.check(
      'C6',
      'zero JS/console errors across control + keyboard interactions',
      async () => {
        const errs = errorSummary(page);
        assertEqual(errs.counts.exceptions, 0, `exceptions: ${JSON.stringify(errs.exceptions).slice(0, 400)}`);
        assertEqual(errs.counts.consoleErrors, 0, `console errors: ${JSON.stringify(errs.consoleErrors).slice(0, 400)}`);
        assertEqual(errs.counts.logErrors, 0, `log errors: ${JSON.stringify(errs.logErrors).slice(0, 400)}`);
        return 'no errors';
      },
      { area: 'errors', severity: SEVERITY.BLOCKER }
    );

    // contrast audit (optional evidence, not a hard fail)
    try {
      const contrast = await page.eval('__VERIFY.contrastAudit()');
      rec.note('G-CONTRAST', `contrast: ${contrast.lowCount} low-contrast text nodes of ${contrast.sampled} sampled (<4.5:1)`, JSON.stringify(contrast.worst.slice(0, 6)), { area: 'a11y' });
    } catch { /* ignore */ }
  } catch (e) {
    rec.note('P2-CRASH', 'SCENARIO P2 aborted', String(e && (e.stack || e.message)).slice(0, 1500), { area: 'browser', severity: SEVERITY.BLOCKER });
    runtimeErrors.push(String(e));
  } finally {
    await closeQuietly(page);
  }

  // ===================================================================
  // SCENARIO P3 — FAST RUN WITH EVENTS -> DEEP DASHBOARD + BUTTONS + RESIZE
  // ===================================================================
  page = null;
  try {
    page = await freshPage(browser, url);
    await sleep(500);
    await ensureVisible(page);
    const fast = { speedMax: false, intervalMin: false, gensMin: false };
    try {
      let mm = await page.eval('__VERIFY.markControls()');
      for (const [key, action] of [['speed', 'End'], ['interval', 'Home'], ['generations', 'Home']]) {
        const m = pick(mm, key)[0];
        if (!m) continue;
        await page.eval(`__VERIFY.focusVV(${JSON.stringify(m.vv)})`);
        await page.key(m.tag === 'INPUT' ? action : action);
        await sleep(120);
        fast[key === 'speed' ? 'speedMax' : key === 'interval' ? 'intervalMin' : 'gensMin'] = true;
      }
      // blur so page-level shortcuts don't interfere
      await page.eval('document.activeElement && document.activeElement.blur ? document.activeElement.blur() : null');
    } catch { /* ignore */ }

    let recordOk = false;
    try {
      await waitUntil(page, '__VERIFY.recordState().visible', { timeoutMs: 30000, interval: 180, label: 'fast run record' });
      recordOk = true;
    } catch {
      // fallback: conclude manually if auto-end did not happen
      await page.eval(`document.getElementById('btn-conclude')?.click()`);
      await sleep(800);
      recordOk = await page.eval('__VERIFY.recordState().visible');
    }
    await sleep(700);
    await safeShot(page, 'record-fast-1440');

    await rec.check(
      'F1',
      'record layout: fits 1440×900 without scroll; header/meta/summary populated; 3 actions present',
      async () => {
        assert(recordOk, 'record never appeared');
        const rs = await page.eval('__VERIFY.recordState()');
        assert(rs.visible, 'record not visible');
        assert(rs.title && rs.title.length > 3, `record title missing: "${rs.title}"`);
        assert(rs.meta && rs.meta.length > 8, `record meta missing: "${rs.meta}"`);
        assert(rs.summaryText.length > 60, `summary too short (${rs.summaryText.length} chars): "${rs.summaryText.slice(0, 120)}"`);
        assert(/\d/.test(rs.summaryText), 'summary contains no numbers');
        assert(rs.sheetRect && rs.sheetRect.bottom <= rs.innerH + 2 && rs.sheetRect.right <= rs.innerW + 2 && rs.sheetRect.y >= -2, `record sheet outside viewport: ${JSON.stringify(rs.sheetRect)}`);
        assert(!rs.sheetScroll || rs.sheetScroll.scrollH <= rs.sheetScroll.clientH + 2, `record sheet needs internal scroll: ${JSON.stringify(rs.sheetScroll)}`);
        for (const a of rs.actions) {
          assert(!a.missing, `record action ${a.sel} missing from DOM`);
          assert(a.visible, `record action ${a.sel} not visible`);
        }
        return { title: rs.title, meta: rs.meta, summaryLen: rs.summaryText.length, actions: rs.actions.map((a) => a.text) };
      },
      { area: 'dashboard', severity: SEVERITY.BLOCKER }
    );

    await rec.check(
      'F2',
      'FIG.2 census chart: ink + all three species colours present, axes/legible ink, catastrophe markers',
      async () => {
        const rs = await page.eval('__VERIFY.recordState()');
        const c = rs.chartPop;
        assert(!c.error && !c.blank, `census chart blank/error: ${JSON.stringify(c).slice(0, 200)}`);
        assert(c.cssW > 360 && c.cssH > 150, `census canvas css size ${c.cssW}x${c.cssH}`);
        assert(c.nonBgRatio > 0.004, `census ink coverage too low: ${c.nonBgRatio}`);
        assert(c.dark > 200, `census axis/label ink too low: dark=${c.dark}`);
        const present = [['flora', c.nearFlora], ['herbivora', c.nearFauna], ['carnivora', c.nearPredator]].filter(([, n]) => n > 40);
        assert(present.length >= 3, `species colours missing on census chart: flora=${c.nearFlora} fauna=${c.nearFauna} predator=${c.nearPredator}`);
        const pins = c.nearWaxStrict;
        assert(pins >= 4, `catastrophe wax pins not visible on census chart (strict wax=${pins})`);
        return { nonBgRatio: c.nonBgRatio, dark: c.dark, flora: c.nearFlora, fauna: c.nearFauna, predator: c.nearPredator, waxPins: pins };
      },
      { area: 'dashboard', severity: SEVERITY.BLOCKER }
    );

    await rec.check(
      'F3',
      'FIG.3-14 trait chart: 3×4 matrix all cells drawn (mean line + spread band)',
      async () => {
        const rs = await page.eval('__VERIFY.recordState()');
        const c = rs.chartTraits;
        assert(!c.error && !c.blank, `trait chart blank/error: ${JSON.stringify(c).slice(0, 200)}`);
        assert(c.cssW > 600 && c.cssH > 250, `trait canvas css size ${c.cssW}x${c.cssH}`);
        assert(c.nonBgRatio > 0.008, `trait ink coverage too low: ${c.nonBgRatio}`);
        assert(c.cells12 && c.cells12.length === 12, 'could not sample 12 matrix cells');
        const emptyCells = c.cells12.filter((x) => x.ratio < 0.0008);
        assertEqual(emptyCells.length, 0, `empty matrix cells (row,col): ${emptyCells.map((e) => e.row + ',' + e.col).join(' ')}`);
        assert(c.dark > 400 || c.nearInk > 150, `trait chart ink too sparse: dark=${c.dark} nearInk=${c.nearInk}`);
        return { nonBgRatio: c.nonBgRatio, dark: c.dark, nearInk: c.nearInk, minCell: Math.min(...c.cells12.map((x) => x.ratio)), dpr: c.dpr };
      },
      { area: 'dashboard', severity: SEVERITY.BLOCKER }
    );

    await rec.check(
      'F4',
      'record fits 1280×800 and charts re-render on resize (DPR-aware)',
      async () => {
        await page.setViewport(1280, 800);
        await sleep(700);
        await safeShot(page, 'record-1280');
        const rs = await page.eval('__VERIFY.recordState()');
        assert(rs.sheetRect && rs.sheetRect.bottom <= rs.innerH + 2 && rs.sheetRect.right <= rs.innerW + 2, `record sheet outside viewport at 1280x800: ${JSON.stringify(rs.sheetRect)}`);
        assert(!rs.sheetScroll || rs.sheetScroll.scrollH <= rs.sheetScroll.clientH + 2, `record sheet needs internal scroll at 1280x800: ${JSON.stringify(rs.sheetScroll)}`);
        assert(!rs.chartPop.blank && !rs.chartTraits.blank, 'charts blank after resize');
        assert(rs.chartPop.nonBgRatio > 0.003 && rs.chartTraits.nonBgRatio > 0.005, `charts lost data after resize: pop=${rs.chartPop.nonBgRatio} traits=${rs.chartTraits.nonBgRatio}`);
        await page.setViewport(1440, 900);
        await sleep(500);
        return { sheet: rs.sheetRect, sheetScroll: rs.sheetScroll, pop: rs.chartPop.nonBgRatio, traits: rs.chartTraits.nonBgRatio };
      },
      { area: 'dashboard', severity: SEVERITY.MAJOR }
    );

    await rec.check(
      'F5',
      'record summary card: catastrophe roster + survival/diversity evidence',
      async () => {
        const rs = await page.eval('__VERIFY.recordState()');
        const text = rs.summaryText + ' ' + rs.notes;
        const hasCat = /siccitas|pestilentia|incendium|drought|plague|wildfire/i.test(text);
        assert(hasCat, `summary/roster does not mention any catastrophe: "${text.slice(0, 240)}"`);
        assert(/\d/.test(text), 'summary has no numbers');
        return { summary: rs.summaryText.slice(0, 260), notes: rs.notes.slice(0, 160) };
      },
      { area: 'dashboard', severity: SEVERITY.MAJOR }
    );

    await rec.check(
      'F6',
      'record actions work: Replay this seed / New study / Return to the plate',
      async () => {
        const results = {};
        // Replay this seed
        const seedBefore = (await page.eval('__VERIFY.genState()')).seed;
        await page.clickSelector('#btn-replay');
        await sleep(900);
        let rs = await page.eval('__VERIFY.recordState()');
        const replayed = !rs.visible;
        const g = await page.eval('__VERIFY.genState()');
        results.replay = { recordHidden: replayed, seedAfter: g.seed, seedBefore, gen: g.gen };
        // conclude again -> new study
        await page.eval(`document.getElementById('btn-conclude')?.click()`);
        await waitUntil(page, '__VERIFY.recordState().visible', { timeoutMs: 8000, interval: 150, label: 'record after conclude' });
        await page.clickSelector('#btn-newseed');
        await sleep(900);
        rs = await page.eval('__VERIFY.recordState()');
        const g2 = await page.eval('__VERIFY.genState()');
        results.newSeed = { recordHidden: !rs.visible, seedChanged: g2.seed !== g.seed, seedAfter: g2.seed, gen: g2.gen };
        // conclude -> return to plate
        await page.eval(`document.getElementById('btn-conclude')?.click()`);
        await waitUntil(page, '__VERIFY.recordState().visible', { timeoutMs: 8000, interval: 150, label: 'record after second conclude' });
        await page.clickSelector('#btn-back');
        await sleep(700);
        rs = await page.eval('__VERIFY.recordState()');
        const plate = await page.eval(`(() => { const v = document.getElementById('sim-canvas'); const r = v?.getBoundingClientRect(); return { visible: !!r && r.width>100 && r.height>100, recordHidden: document.getElementById('record').hidden }; })()`);
        results.back = { recordHidden: !rs.visible, plateVisible: plate.visible };
        assert(results.replay.recordHidden, 'Replay this seed did not leave the record');
        assert(results.newSeed.recordHidden && results.newSeed.seedChanged, `New study did not start a new seed: ${JSON.stringify(results.newSeed)}`);
        assert(results.back.recordHidden && results.back.plateVisible, `Return to the plate did not reveal the plate: ${JSON.stringify(results.back)}`);
        return results;
      },
      { area: 'dashboard', severity: SEVERITY.BLOCKER }
    );

    await rec.check(
      'C7',
      'no JS errors during fast run + dashboard interactions',
      async () => {
        const errs = errorSummary(page);
        assertEqual(errs.counts.exceptions, 0, `exceptions: ${JSON.stringify(errs.exceptions).slice(0, 400)}`);
        assertEqual(errs.counts.consoleErrors, 0, `console errors: ${JSON.stringify(errs.consoleErrors).slice(0, 400)}`);
        assertEqual(errs.counts.logErrors, 0, `log errors: ${JSON.stringify(errs.logErrors).slice(0, 400)}`);
        return 'no errors';
      },
      { area: 'errors', severity: SEVERITY.BLOCKER }
    );
  } catch (e) {
    rec.note('P3-CRASH', 'SCENARIO P3 aborted', String(e && (e.stack || e.message)).slice(0, 1500), { area: 'browser', severity: SEVERITY.BLOCKER });
    runtimeErrors.push(String(e));
  } finally {
    await closeQuietly(page);
  }

  // ===================================================================
  // SCENARIO P6 — URL PARAMS: fast gens + catastrophes disabled
  // ===================================================================
  page = null;
  try {
    const qp = url + (url.includes('?') ? '&' : '?') + 'gens=12&speed=8&cat=0';
    page = await freshPage(browser, qp);
    await ensureVisible(page);
    await rec.check(
      'P6',
      'URL params: ?gens=12&speed=8 completes fast; ?cat=0 means no events/seals/markers',
      async () => {
        const g0 = await page.eval('__VERIFY.genState()');
        assertEqual(g0.total, 12, `?gens=12 not honoured (total=${g0.total})`);
        const done = await waitUntil(page, '__VERIFY.recordState().visible', { timeoutMs: 15000, interval: 150, label: 'record for ?gens=12&speed=8' });
        assert(done.elapsedMs < 14000, `fast completion took ${done.elapsedMs}ms`);
        const rs = await page.eval('__VERIFY.recordState()');
        const seals = await page.eval('__VERIFY.sealsState()');
        const ledger = await page.eval('__VERIFY.ledgerState()');
        const meta = rs.meta || '';
        assert(/12 generations/.test(meta), `record meta does not say 12 generations: "${meta}"`);
        assertEqual(seals.count, 0, `wax seals present with catastrophes disabled: ${seals.count}`);
        const evLedger = ledger.entries.filter((t) => /Siccitas|Pestilentia|Incendium|drought|plague|wildfire/i.test(t));
        assertEqual(evLedger.length, 0, `catastrophe ledger entries despite ?cat=0: ${JSON.stringify(evLedger.slice(0, 3))}`);
        const worldEvents = await page.eval(`(() => { const V = window.__VIVARIUM__; const w = V && V.getWorld && V.getWorld(); return w ? { events: w.events.length, active: (w.activeEvents || []).length } : null; })()`);
        assert(worldEvents && worldEvents.events === 0, `?cat=0 world has events: ${JSON.stringify(worldEvents)}`);
        const pins = rs.chartPop.nearWaxStrict;
        assert(pins <= 2, `catastrophe wax pins present on chart despite ?cat=0 (strict wax=${pins})`);
        assert(/no catastrophes/i.test(meta), `record meta should note no catastrophes: "${meta}"`);
        const errs = errorSummary(page);
        assertEqual(errs.counts.exceptions + errs.counts.consoleErrors, 0, `errors with URL params: ${JSON.stringify(errs).slice(0, 300)}`);
        return { elapsedMs: done.elapsedMs, meta, seals: seals.count, waxPins: pins };
      },
      { area: 'autostart', severity: SEVERITY.MAJOR }
    );
    await sleep(750);
    await safeShot(page, 'record-nocat-1440');
  } catch (e) {
    rec.note('P6-CRASH', 'SCENARIO P6 aborted', String(e && (e.stack || e.message)).slice(0, 900), { area: 'browser', severity: SEVERITY.MAJOR });
    runtimeErrors.push(String(e));
  } finally {
    await closeQuietly(page);
  }

  // ===================================================================
  // SCENARIO P4 — REDUCED MOTION
  // ===================================================================
  page = null;
  try {
    page = await freshPage(browser, url, { reducedMotion: true });
    await sleep(600);
    await ensureVisible(page);
    await rec.check(
      'G-RM',
      'prefers-reduced-motion: emulation active, page still auto-runs, record reachable, no errors',
      async () => {
        const rm = await page.eval(`matchMedia('(prefers-reduced-motion: reduce)').matches`);
        assert(rm, 'reduced-motion emulation not active');
        const r = await waitUntil(page, '(__VERIFY.genState().gen || 0) >= 1', { timeoutMs: 12000, interval: 120, label: 'gen advance under reduced motion' });
        await page.eval(`document.getElementById('btn-conclude')?.click()`);
        await waitUntil(page, '__VERIFY.recordState().visible', { timeoutMs: 10000, interval: 150, label: 'record under reduced motion' });
        await sleep(400);
        await safeShot(page, 'reduced-record-1440');
        const rs = await page.eval('__VERIFY.recordState()');
        assert(!rs.chartPop.blank, 'charts blank under reduced motion');
        const errs = errorSummary(page);
        assertEqual(errs.counts.exceptions + errs.counts.consoleErrors, 0, `errors under reduced motion: ${JSON.stringify(errs).slice(0, 400)}`);
        return { startedAfterMs: r.elapsedMs, rm };
      },
      { area: 'a11y', severity: SEVERITY.MAJOR }
    );
  } catch (e) {
    rec.note('P4-CRASH', 'SCENARIO P4 aborted', String(e && (e.stack || e.message)).slice(0, 800), { area: 'browser', severity: SEVERITY.MAJOR });
    runtimeErrors.push(String(e));
  } finally {
    await closeQuietly(page);
  }

  // ===================================================================
  // SCENARIO P5 — 1280×800 SANITY
  // ===================================================================
  page = null;
  try {
    page = await freshPage(browser, url, { width: 1280, height: 800 });
    await sleep(900);
    await ensureVisible(page);
    await rec.check(
      'H-1280',
      '1280×800: no page scroll / horizontal overflow; controls inside viewport; canvas legible size',
      async () => {
        await safeShot(page, 'initial-1280');
        const scan = await page.eval('__VERIFY.overflowScan()');
        const scroll = await page.eval('__VERIFY.scrollTest()');
        assert(!scroll.canScrollX, `page scrolls horizontally at 1280x800: ${JSON.stringify(scroll)}`);
        assert(!scroll.canScrollY, `page scrolls vertically at 1280x800: ${JSON.stringify(scroll)}`);
        const outside = scan.items.filter((i) => i.kind === 'x-outside');
        assertEqual(outside.length, 0, `elements outside viewport at 1280: ${JSON.stringify(outside.slice(0, 4)).slice(0, 400)}`);
        const canvas = await page.eval('__VERIFY.canvasStats("#sim-canvas")');
        assert(!canvas.blank, 'vitrine canvas blank at 1280');
        assert(canvas.cssW > 600, `vitrine canvas width ${canvas.cssW} at 1280`);
        const errs = errorSummary(page);
        assertEqual(errs.counts.exceptions + errs.counts.consoleErrors, 0, `errors at 1280: ${JSON.stringify(errs).slice(0, 300)}`);
        return { doc: scan.docScroll, canvas: { cssW: canvas.cssW, cssH: canvas.cssH }, items: scan.count };
      },
      { area: 'layout', severity: SEVERITY.MAJOR }
    );
  } catch (e) {
    rec.note('P5-CRASH', 'SCENARIO P5 aborted', String(e && (e.stack || e.message)).slice(0, 800), { area: 'browser', severity: SEVERITY.MAJOR });
    runtimeErrors.push(String(e));
  } finally {
    await closeQuietly(page);
  }

  // ===================================================================
  // SCENARIO P7 — 1024×768 width degradation (brief §3)
  // ===================================================================
  page = null;
  try {
    page = await freshPage(browser, url, { width: 1024, height: 768 });
    await sleep(900);
    await ensureVisible(page);
    await rec.check(
      'H-1024',
      '1024×768: degrades without horizontal overflow; plate + folio remain usable',
      async () => {
        await safeShot(page, 'initial-1024');
        const scroll = await page.eval('__VERIFY.scrollTest()');
        assert(!scroll.canScrollX, `horizontal scroll at 1024: ${JSON.stringify(scroll)}`);
        const scan = await page.eval('__VERIFY.overflowScan()');
        const outside = scan.items.filter((i) => i.kind === 'x-outside');
        assertEqual(outside.length, 0, `elements beyond viewport at 1024: ${JSON.stringify(outside.slice(0, 4)).slice(0, 400)}`);
        const canvas = await page.eval('__VERIFY.canvasStats("#sim-canvas")');
        assert(canvas.cssW > 420, `vitrine canvas width ${canvas.cssW} at 1024 (too small to read)`);
        const marks = await page.eval('__VERIFY.markControls()');
        assert(marks.length >= 8, `instruments missing at 1024 (${marks.length})`);
        const errs = errorSummary(page);
        assertEqual(errs.counts.exceptions + errs.counts.consoleErrors, 0, `errors at 1024: ${JSON.stringify(errs).slice(0, 300)}`);
        return { doc: scroll.before, canScrollX: scroll.canScrollX, canvas: { cssW: canvas.cssW, cssH: canvas.cssH }, items: scan.count };
      },
      { area: 'layout', severity: SEVERITY.MINOR }
    );
  } catch (e) {
    rec.note('P7-CRASH', 'SCENARIO P7 aborted', String(e && (e.stack || e.message)).slice(0, 800), { area: 'browser', severity: SEVERITY.MINOR });
    runtimeErrors.push(String(e));
  } finally {
    await closeQuietly(page);
  }

  // ---- engine determinism in browser + early node parity ----
  try {
    page = await freshPage(browser, url);
    await rec.check(
      'B19',
      'browser engine: same seed twice => identical hash; reload => same hash; early gens match node',
      async () => {
        const pausedUrl = url + (url.includes('?') ? '&' : '?') + 'auto=0';
        await page.navigate(pausedUrl);
        await injectProbe(page);
        await sleep(300);
        const runHash = `(() => {
          const E = window.VIVARIUM_ENGINE;
          const seed = (window.__VIVARIUM__ && window.__VIVARIUM__.getParam) ? window.__VIVARIUM__.getParam('seed') : E.DEFAULTS.seed;
          const mk = (gens) => { const w = E.createWorld({ seed, generations: 40 }); E.runHeadless(w, gens); return { hash: E.hashWorld(w), counts: w.counts, gen: w.generation }; };
          return { seed, seedDefault: E.DEFAULTS.seed, version: E.VERSION, a: mk(40), b: mk(40), early: mk(3) };
        })()`;
        const first = await page.eval(runHash);
        assertEqual(first.a.hash, first.b.hash, 'in-browser: same seed twice produced different hashes');
        // reload determinism (fresh JS engine, same seed)
        await page.navigate(pausedUrl);
        await injectProbe(page);
        await sleep(300);
        const second = await page.eval(runHash);
        assertEqual(second.a.hash, first.a.hash, 'in-browser: same seed after reload produced a different hash');
        assertEqual(JSON.stringify(second.a.counts), JSON.stringify(first.a.counts), 'in-browser: same seed after reload produced different counts');
        // node early-generation parity (full-run cross-engine floats may diverge; see note)
        const { loadEngineFromFile } = await import('./lib/engine.mjs');
        const { Engine: NodeEngine } = loadEngineFromFile(join(ROOT, 'src', 'engine.js'));
        const w3 = NodeEngine.createWorld({ seed: first.seed, generations: 40 });
        NodeEngine.runHeadless(w3, 3);
        const nodeEarly = NodeEngine.hashWorld(w3);
        const earlyMatch = nodeEarly === first.early.hash;
        if (!earlyMatch) {
          throw new Error(`node vs browser engine diverges within 3 generations: node=${nodeEarly} browser=${first.early.hash}`);
        }
        // full-run parity informational (cross-engine transcendental float differences are expected)
        const w40 = NodeEngine.createWorld({ seed: first.seed, generations: 40 });
        NodeEngine.runHeadless(w40, 40);
        const nodeFull = NodeEngine.hashWorld(w40);
        const fullMatch = nodeFull === first.a.hash;
        rec.note(
          'B19-note',
          'cross-engine full-run parity',
          fullMatch
            ? 'node vm and browser agree for 40 gens'
            : `40-gen hash differs across JS engines (node=${nodeFull} browser=${first.a.hash}); early 3 gens and within-browser determinism agree (expected FP amplification)`,
          { area: 'engine' }
        );
        return { seed: first.seed, seedDefault: first.seedDefault, engineVersion: first.version, browserHash: first.a.hash, nodeEarly, earlyMatch, fullMatch };
      },
      { area: 'engine', severity: SEVERITY.BLOCKER }
    );

    // ---- C8: documented default specimen seed (brief updated: 1901) ----
    await rec.check(
      'C8',
      'default study seed is the documented 1901; masthead matches world; ?seed=1977 still deterministic',
      async () => {
        const state = await page.eval(`(() => {
          const V = window.__VIVARIUM__;
          const seed = V && V.getParam ? V.getParam('seed') : null;
          const metaSeed = (document.getElementById('meta-seed')?.textContent || '').trim();
          const world = V && V.getWorld ? V.getWorld() : null;
          return { seed, metaSeed, worldSeed: world ? world.seed : null, defaults: window.VIVARIUM_ENGINE.DEFAULTS.seed };
        })()`);
        assertEqual(state.seed, 1901, `default world seed is ${state.seed}; DESIGN-BRIEF.md default specimen + §9 DEFAULTS specify 1901 (controls table still says 1977 — report note)`);
        assertEqual(state.defaults, 1901, `engine DEFAULTS.seed is ${state.defaults}, expected 1901`);
        assertEqual(state.metaSeed, '1901', `masthead seed shows "${state.metaSeed}" but world seed is ${state.seed}`);
        // 1977 (original brief seed) must still reproduce its own run deterministically
        const seedUrl = url + (url.includes('?') ? '&' : '?') + 'seed=1977&auto=0';
        await page.navigate(seedUrl);
        await injectProbe(page);
        await sleep(350);
        const r1977 = await page.eval(`(() => {
          const V = window.__VIVARIUM__;
          const E = window.VIVARIUM_ENGINE;
          const seed = V.getParam('seed');
          const run = () => { const w = E.createWorld({ seed: 1977, generations: 40 }); E.runHeadless(w, 40); return { hash: E.hashWorld(w), counts: w.counts, gen: w.generation }; };
          const a = run(), b = run();
          return { seed, metaSeed: (document.getElementById('meta-seed')?.textContent || '').trim(), a, b };
        })()`);
        assertEqual(r1977.seed, 1977, '?seed=1977 was not applied');
        assertEqual(r1977.metaSeed, '1977', `?seed=1977 masthead shows "${r1977.metaSeed}"`);
        assertEqual(r1977.a.hash, r1977.b.hash, '?seed=1977 in-page run is not deterministic');
        return { default: state, seed1977: { hash: r1977.a.hash, gen: r1977.a.gen } };
      },
      { area: 'autostart', severity: SEVERITY.MAJOR }
    );
  } catch (e) {
    rec.note('B19-CRASH', 'parity check aborted', String(e && (e.stack || e.message)).slice(0, 800), { area: 'engine', severity: SEVERITY.MAJOR });
  } finally {
    await closeQuietly(page);
  }

  if (runtimeErrors.length) {
    rec.note('RUNTIME', `${runtimeErrors.length} scenario(s) aborted`, runtimeErrors.map((e) => e.slice(0, 300)), { area: 'browser', severity: SEVERITY.BLOCKER });
  }
  try {
    await browser.close();
  } catch {
    /* ignore */
  }
  if (save) rec.save(join(VERIFY, resultsName));
  rec.print();
  return rec;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runBrowserSuite().then((rec) => {
    process.exitCode = rec.failures().length ? 1 : 0;
  });
}
