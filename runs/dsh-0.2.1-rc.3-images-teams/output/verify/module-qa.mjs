#!/usr/bin/env node
// MODULE QA (pre-integration) — assembles a no-boot preview from current src/,
// then drives renderer / controls / dashboard manually against a real engine
// world inside headless Chrome. Gives early feedback before the Lead assembles
// the final deliverable. Writes shots/verify-module-*.png.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, SHOTS, VERIFY } from './lib/workspace.mjs';
import { launchChrome, sleep } from './lib/cdp.mjs';
import { injectProbe, waitUntil } from './lib/probe.mjs';

const PREVIEW = join(SHOTS, 'verify-preview.html');
const DRIVE = join(SHOTS, 'verify-preview-drive.html');
const results = [];
const ok = (id, msg, detail = '') => {
  results.push({ id, status: 'ok', msg, detail });
  console.log(`[ok  ] ${id} ${msg}${detail ? ' — ' + detail : ''}`);
};
const bad = (id, msg, detail = '') => {
  results.push({ id, status: 'FAIL', msg, detail });
  console.log(`[FAIL] ${id} ${msg}${detail ? ' — ' + detail : ''}`);
};
const note = (id, msg, detail = '') => {
  results.push({ id, status: 'note', msg, detail });
  console.log(`[note] ${id} ${msg}${detail ? ' — ' + detail : ''}`);
};

function assembleNoBoot() {
  const r = spawnSync(process.execPath, ['assemble.mjs', '--out', PREVIEW, '--quiet'], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('assemble failed: ' + r.stderr);
  const html = readFileSync(PREVIEW, 'utf8');
  const boot = readFileSync(join(ROOT, 'src', 'boot.js'), 'utf8');
  const noBoot = html.includes(boot) ? html.split(boot).join('/* boot intentionally omitted for module QA */') : html;
  writeFileSync(DRIVE, noBoot);
  return { previewBytes: Buffer.byteLength(html), driveBytes: Buffer.byteLength(noBoot), bootStripped: html.includes(boot) };
}

const MODULE_INIT = `(() => {
  const E = window.VIVARIUM_ENGINE;
  const w = E.createWorld({ seed: 1977, generations: 40 });
  E.runHeadless(w, 12);
  window.__QA_WORLD = w;
  const spark = {
    diversity: w.history.map(h => h.diversity || 0),
    mutations: w.history.map(h => h.mutations || 0),
    flora: w.history.map(h => h.counts ? h.counts.flora : 0),
    events: w.events.map(e => ({ gen: e.gen, type: e.type })),
    progress: w.generation / Math.max(1, w.config.generations),
    tickRate: [w.generation],
  };
  window.__QA_CTX = {
    getWorld: () => window.__QA_WORLD,
    getParam: (k) => window.__QA_WORLD.config[k],
    setParam: (k, v) => E.setParam(window.__QA_WORLD, k, v),
    actions: {
      recast: (seed) => { window.__QA_RECASTS = (window.__QA_RECASTS || []); window.__QA_RECASTS.push(seed == null ? 'same' : seed); },
      pause: () => { window.__QA_PAUSES = (window.__QA_PAUSES || 0) + 1; },
      resume: () => { window.__QA_RESUMES = (window.__QA_RESUMES || 0) + 1; },
      stepGen: () => E.runGeneration(window.__QA_WORLD),
      conclude: () => { window.__QA_CONCLUDED = (window.__QA_CONCLUDED || 0) + 1; },
    },
    isRunning: () => false,
    getSparkData: () => spark,
  };
  let out = {};
  // renderer
  try {
    const canvas = document.getElementById('sim-canvas');
    const R = window.VIVARIUM_RENDER.create(canvas);
    R.resize();
    R.draw(w);
    out.renderer = 'ok';
  } catch (e) { out.renderer = 'ERR ' + e.message; }
  // controls
  try {
    if (window.VIVARIUM_CONTROLS.destroy) window.VIVARIUM_CONTROLS.destroy();
    window.VIVARIUM_CONTROLS.mount(document.getElementById('instrument-body'), window.__QA_CTX);
    window.VIVARIUM_CONTROLS.update(window.__QA_WORLD, 16);
    window.VIVARIUM_CONTROLS.setRunning(false);
    out.controls = 'ok';
  } catch (e) { out.controls = 'ERR ' + e.message + ' | ' + (e.stack || '').split('\\n')[1]; }
  // dashboard is driven later (phase B), after page-level control tests
  out.dashboard = 'pending';
  return out;
})()`;

async function main() {
  const asm = assembleNoBoot();
  console.log('preview:', JSON.stringify(asm));
  const url = 'file://' + DRIVE;
  const browser = await launchChrome({ width: 1440, height: 900 });
  try {
    const page = await browser.newPage();
    await page.navigate(url);
    await injectProbe(page);
    await sleep(500);
    const init = await page.eval(MODULE_INIT);
    console.log('module init:', JSON.stringify(init));
    await sleep(1200);

    if (init.renderer === 'ok') {
      await page.eval(`(() => { const R = window.VIVARIUM_RENDER.create(document.getElementById('sim-canvas')); R.resize(); R.draw(window.__QA_WORLD); })()`);
      await sleep(500);
      const cs = await page.eval('__VERIFY.canvasStats("#sim-canvas")');
      if (cs.blank) bad('M-RENDER', 'vitrine canvas blank after renderer draw');
      else if (cs.nearFlora < 20 && cs.nearFauna < 20 && cs.nearPredator < 20)
        bad('M-RENDER', 'vitrine canvas has no species ink', JSON.stringify({ flora: cs.nearFlora, fauna: cs.nearFauna, predator: cs.nearPredator, nonBg: cs.nonBgRatio }));
      else ok('M-RENDER', 'vitrine renders species ink', JSON.stringify({ nonBg: cs.nonBgRatio, flora: cs.nearFlora, fauna: cs.nearFauna, predator: cs.nearPredator, dark: cs.dark }));
      await page.screenshot(join(SHOTS, 'verify-module-plate-1440.png'));
    } else bad('M-RENDER', 'renderer failed', init.renderer);

    if (init.controls === 'ok') {
      const marks = await page.eval('__VERIFY.markControls()');
      const keys = [...new Set(marks.map((m) => m.key))];
      const required = ['seed', 'mutation', 'regrowth', 'generations', 'speed', 'interval', 'catastrophes', 'trails'];
      const missing = required.filter((k) => !keys.includes(k));
      if (missing.length) bad('M-CTRL-INV', 'missing instruments', missing.join(',') + ' found=' + keys.join(','));
      else ok('M-CTRL-INV', 'all 8 instruments mounted', marks.map((m) => m.vv + ':' + m.tag).join(' '));
      const sparks = await page.eval(`document.querySelectorAll('#folio canvas').length`);
      if (sparks < 8) bad('M-CTRL-SPARK', `only ${sparks} sparkline canvases in folio`);
      else ok('M-CTRL-SPARK', `${sparks} sparkline canvases`);
      // tab trail
      const trail = [];
      await page.eval('document.activeElement && document.activeElement.blur ? document.activeElement.blur() : null');
      for (let i = 0; i < 60; i++) {
        await page.pressTab();
        const fi = await page.eval('__VERIFY.focusInfo()');
        if (!fi) break;
        trail.push(fi);
        if (i > 2 && fi.vv && trail[0]?.vv && fi.vv === trail[0].vv) break;
      }
      const reached = required.filter((k) => trail.some((t) => t.vv === k || (t.vv || '').startsWith(k + '-')));
      if (reached.length < required.length) bad('M-CTRL-TAB', 'instruments unreachable by Tab', required.filter((k) => !reached.includes(k)).join(','));
      else ok('M-CTRL-TAB', `all 8 instruments in tab trail (${trail.length} stops)`);
      const noFocus = trail.filter((t) => t.tag !== 'BODY' && !(t.outlineStyle !== 'none' && parseFloat(t.outlineWidth) >= 1) && (!t.boxShadow || t.boxShadow === 'none') && !t.focusVisible);
      if (noFocus.length) bad('M-CTRL-FOCUS', `${noFocus.length} stops without visible focus`, JSON.stringify(noFocus.slice(0, 3)));
      else ok('M-CTRL-FOCUS', 'visible focus on all tab stops');
      // arrows on continuous controls
      const arrowReport = {};
      for (const key of ['mutation', 'regrowth', 'speed', 'interval']) {
        const m = marks.find((x) => x.key === key);
        if (!m) continue;
        await page.eval(`__VERIFY.focusVV(${JSON.stringify(m.vv)})`);
        const before = await page.eval(`__VERIFY.valueVV(${JSON.stringify(m.vv)})`);
        await page.key('ArrowRight');
        await sleep(90);
        const after = await page.eval(`__VERIFY.valueVV(${JSON.stringify(m.vv)})`);
        arrowReport[key] = JSON.stringify(before) !== JSON.stringify(after);
      }
      const arrowFails = Object.entries(arrowReport).filter(([, v]) => !v).map(([k]) => k);
      if (arrowFails.length) bad('M-CTRL-ARROW', 'ArrowRight did not change: ' + arrowFails.join(','));
      else ok('M-CTRL-ARROW', 'arrow keys adjust all continuous controls');
      // toggles
      for (const key of ['catastrophes', 'trails']) {
        const m = marks.find((x) => x.key === key);
        if (!m) continue;
        await page.eval(`__VERIFY.focusVV(${JSON.stringify(m.vv)})`);
        const before = await page.eval(`__VERIFY.valueVV(${JSON.stringify(m.vv)})`);
        await page.key(' ');
        await sleep(140);
        const after = await page.eval(`__VERIFY.valueVV(${JSON.stringify(m.vv)})`);
        if (before.ariaChecked === after.ariaChecked) bad('M-CTRL-TOGGLE', key + ' Space did not flip aria-checked', `${before.ariaChecked} -> ${after.ariaChecked}`);
        else ok('M-CTRL-TOGGLE', key + ' toggles via Space');
      }
      // tooltip
      const trig = await page.eval('__VERIFY.tooltipTriggers()');
      if (!trig.length) bad('M-CTRL-TIP', 'no tooltip triggers found');
      else {
        await page.mouseMove(trig[0].rect.x + trig[0].rect.w / 2, trig[0].rect.y + trig[0].rect.h / 2);
        await sleep(250);
        const tip = await page.eval('__VERIFY.tooltipState()');
        if (!tip.visible) bad('M-CTRL-TIP', 'tooltip does not appear on hover', JSON.stringify(trig[0]));
        else {
          ok('M-CTRL-TIP', 'tooltip on hover', (tip.text || '').slice(0, 100));
          await page.key('Escape');
          await sleep(200);
          const tip2 = await page.eval('__VERIFY.tooltipState()');
          if (tip2.visible) bad('M-CTRL-TIP-ESC', 'Escape does not dismiss tooltip');
          else ok('M-CTRL-TIP-ESC', 'Escape dismisses tooltip');
        }
      }
      // folio fold (real pointer click, like a user)
      const foldRect = await page.eval(`(() => { const r = document.getElementById('folio-toggle').getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 }; })()`);
      await page.click(foldRect.x, foldRect.y);
      await sleep(650);
      const folded = await page.eval('__VERIFY.interactiveInFolio()');
      if (folded.folioW > 140) bad('M-CTRL-FOLD', 'folio did not collapse', `width=${folded.folioW}`);
      else ok('M-CTRL-FOLD', 'folio collapses', `width=${folded.folioW}, panelHidden=${folded.panelHidden}, inert=${folded.panelInert}`);
      await page.screenshot(join(SHOTS, 'verify-module-folio-folded-1440.png'));
      await page.click(foldRect.x, foldRect.y);
      await sleep(650);
      await page.screenshot(join(SHOTS, 'verify-module-folio-1440.png'));
    } else bad('M-CTRL', 'controls failed to mount', init.controls);

    const plateScroll = await page.eval('__VERIFY.scrollTest()');
    if (plateScroll.canScrollY || plateScroll.canScrollX) note('M-PLATE-SCROLL', 'plate page is scrollable at 1440x900', JSON.stringify(plateScroll));
    else ok('M-PLATE-SCROLL', 'plate page not scrollable at 1440x900', JSON.stringify({ overflowY: plateScroll.overflowY, bodyOverflowY: plateScroll.bodyOverflowY }));

    // phase B: drive THE RECORD after the plate-level control tests are done
    init.dashboard = await page.eval(`(() => {
      try { window.VIVARIUM_DASHBOARD.render(window.__QA_WORLD, {}); window.VIVARIUM_DASHBOARD.show(); return 'ok'; }
      catch (e) { return 'ERR ' + e.message; }
    })()`);
    await sleep(1100);
    if (init.dashboard === 'ok') {
      const rs = await page.eval('__VERIFY.recordState()');
      if (!rs.visible) {
        const raw = await page.eval(`(() => { const rec=document.getElementById('record'); const cs=getComputedStyle(rec); const r=rec.getBoundingClientRect(); return {hidden:rec.hidden, cls:rec.className, display:cs.display, opacity:cs.opacity, visibility:cs.visibility, rect:{w:r.width,h:r.height,x:r.x,y:r.y}, scrollY:window.scrollY, docHidden:document.hidden, visState:document.visibilityState}; })()`);
        bad('M-DASH', 'record not visible after dashboard.show()', JSON.stringify(raw));
      }
      else {
        const pop = rs.chartPop, traits = rs.chartTraits;
        const emptyCells = (traits.cells12 || []).filter((c) => c.ratio < 0.001);
        if (pop.blank) bad('M-DASH-POP', 'population chart blank');
        else ok('M-DASH-POP', 'population chart drawn', JSON.stringify({ nonBg: pop.nonBgRatio, dark: pop.dark, wax: pop.nearWax, species: [pop.nearFlora, pop.nearFauna, pop.nearPredator] }));
        if (traits.blank) bad('M-DASH-TRAITS', 'trait chart blank');
        else if (emptyCells.length) bad('M-DASH-TRAITS', `${emptyCells.length}/12 matrix cells empty`, JSON.stringify(emptyCells));
        else ok('M-DASH-TRAITS', 'all 12 matrix cells drawn', JSON.stringify({ nonBg: traits.nonBgRatio, dpr: traits.dpr, cells: traits.cells12.map((c) => +c.ratio.toFixed(3)) }));
        if ((rs.summaryText || '').length < 60) bad('M-DASH-SUM', 'summary too short', rs.summaryText);
        else ok('M-DASH-SUM', 'summary populated', (rs.summaryText || '').slice(0, 100));
        const sheetFits = rs.sheetRect && rs.sheetRect.bottom <= rs.innerH + 2 && rs.sheetRect.y >= -2;
        const innerFits = !rs.sheetScroll || rs.sheetScroll.scrollH <= rs.sheetScroll.clientH + 2;
        if (!sheetFits || !innerFits) bad('M-DASH-FIT', 'record sheet does not fit 1440x900', JSON.stringify({ sheet: rs.sheetRect, innerH: rs.innerH, sheetScroll: rs.sheetScroll }));
        else ok('M-DASH-FIT', 'record sheet fits 1440x900 without internal scroll', JSON.stringify(rs.sheetScroll));
        const scan = await page.eval('__VERIFY.overflowScan()');
        const hard = scan.items.filter((i) => i.kind === 'text-clipped' || i.kind === 'text-clipped-y' || i.kind === 'x-outside');
        if (hard.length) bad('M-DASH-CLIP', `${hard.length} clipped/outside elements`, JSON.stringify(hard.slice(0, 6)));
        else if (scan.count) note('M-DASH-OVERFLOW', `${scan.count} overflow candidates`, JSON.stringify(scan.items.slice(0, 6)));
        const geo = { sheet: rs.sheetRect, scrollH: rs.scrollH, innerH: rs.innerH, pop: rs.popRect, traits: rs.traitsRect };
        note('M-DASH-GEO', 'record geometry', JSON.stringify(geo));
        await page.screenshot(join(SHOTS, 'verify-module-record-1440.png'));
      }
    } else bad('M-DASH', 'dashboard failed', init.dashboard);

    const errs = { consoleErrors: page.consoleErrors.length, exceptions: page.exceptions.length, logErrors: page.logErrors.length };
    if (errs.consoleErrors + errs.exceptions + errs.logErrors) bad('M-ERR', 'console/page errors', JSON.stringify({ e: page.consoleErrors.slice(0, 3), x: page.exceptions.slice(0, 3) }));
    else ok('M-ERR', 'no console/page errors in module run');
  } finally {
    await browser.close();
  }
  const fails = results.filter((r) => r.status === 'FAIL').length;
  console.log(`\nMODULE QA: ${results.filter((r) => r.status === 'ok').length} ok, ${fails} fail, ${results.filter((r) => r.status === 'note').length} note`);
  writeFileSync(join(VERIFY, 'results-modules.json'), JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  process.exitCode = fails ? 1 : 0;
}

main().catch((e) => {
  console.error('module QA crashed:', e);
  process.exitCode = 1;
});
