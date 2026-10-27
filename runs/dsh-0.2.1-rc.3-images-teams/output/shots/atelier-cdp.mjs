#!/usr/bin/env node
/**
 * atelier CDP QA harness (design-time only).
 * Boots headless Chrome, loads a page, captures console/runtime errors, measures
 * layout + page scroll, and exercises the instrument folio (tooltips, fold,
 * keyboard dials/steppers/toggles, tab order).
 *
 * Usage:
 *   node shots/atelier-cdp.mjs <url> [--width 1440] [--height 900]
 *        [--shot out.png] [--crop x,y,w,h] [--dpr 2] [--audit-only]
 */
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const args = process.argv.slice(2);
const url = args[0];
if (!url) { console.error('usage: node shots/atelier-cdp.mjs <url> [options]'); process.exit(2); }
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes('--' + name);
const W = parseInt(opt('width', '1440'), 10);
const H = parseInt(opt('height', '900'), 10);
const DPR = parseFloat(opt('dpr', '1'));
const shot = opt('shot', null);
const crop = opt('crop', null);
const auditOnly = flag('audit-only');

const port = 19300 + Math.floor(Math.random() * 300);
const profile = await mkdtemp(join(tmpdir(), 'chrome-atelier-cdp-'));

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
  '--force-device-scale-factor=' + DPR,
  '--window-size=' + W + ',' + H,
  '--remote-debugging-port=' + port,
  '--user-data-dir=' + profile,
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitForTarget() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch('http://127.0.0.1:' + port + '/json/list');
      if (res.ok) {
        const list = await res.json();
        const page = list.find((t) => t.type === 'page');
        if (page && page.webSocketDebuggerUrl) return page;
      }
    } catch (e) { /* not up yet */ }
    await sleep(120);
  }
  throw new Error('chrome target did not appear');
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    this.errors = [];
    this.console = [];
    this.logs = [];
    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message + ' ' + JSON.stringify(msg.error.data || '')));
        else resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails || {};
        this.errors.push({ kind: 'exception', text: d.text, desc: d.exception ? d.exception.description : '' });
      }
      if (msg.method === 'Runtime.consoleAPICalled') {
        const t = msg.params.type;
        const text = (msg.params.args || []).map((a) => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ');
        if (t === 'error' || t === 'warning' || t === 'assert') {
          this.errors.push({ kind: 'console.' + t, text });
        }
        this.console.push({ type: t, text });
      }
      if (msg.method === 'Log.entryAdded') {
        const e = msg.params.entry;
        this.logs.push({ level: e.level, text: e.text, url: e.url });
        if (e.level === 'error') this.errors.push({ kind: 'log.error', text: e.text });
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error('CDP timeout: ' + method));
        }
      }, 20000);
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', {
      expression, returnByValue: true, awaitPromise: true,
      userGesture: true, allowUnsafeEvalBlockedByCSP: true
    });
    if (r.exceptionDetails) {
      throw new Error('eval failed: ' + (r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text));
    }
    return r.result ? r.result.value : undefined;
  }
  async key(key, code, vk, modifiers = 0) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers });
  }
}

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log((ok ? '  PASS ' : '  FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : ''));
}

try {
  const target = await waitForTarget();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  await cdp.send('Runtime.enable');
  await cdp.send('Log.enable');
  await cdp.send('Page.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
  await cdp.send('Page.bringToFront');
  await cdp.send('Page.navigate', { url });
  await sleep(1800);
  await cdp.send('Page.bringToFront');
  await sleep(150);
  const waitExtra = parseInt(opt('wait', '0'), 10);
  if (waitExtra > 0) await sleep(waitExtra);
  const evalArg = opt('eval', null);
  if (evalArg) {
    const val = await cdp.eval(evalArg);
    console.log('--- eval ---');
    console.log(JSON.stringify(val, null, 1));
    if (auditOnly) { console.log('AUDIT-ONLY'); }
  }

  const audit = await cdp.eval(`(() => {
    const q = (s) => document.querySelector(s);
    const qa = (s) => Array.from(document.querySelectorAll(s));
    const rect = (s) => { const n = q(s); if (!n) return null; const r = n.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +(r.x + r.width).toFixed(1), bottom: +(r.y + r.height).toFixed(1) }; };
    const cs = (s, p) => { const n = q(s); return n ? getComputedStyle(n)[p] : null; };
    const visible = (n) => { const r = n.getBoundingClientRect(); const st = getComputedStyle(n); return r.width > 0 && r.height > 0 && st.visibility !== 'hidden' && st.display !== 'none'; };
    const overflow = [];
    qa('body *').forEach((n) => {
      if (!visible(n)) return;
      const r = n.getBoundingClientRect();
      if (r.right > innerWidth + 1.5 || r.left < -1.5 || r.bottom > innerHeight + 1.5) {
        overflow.push({ tag: n.tagName, cls: (n.className && typeof n.className === 'string') ? n.className.slice(0, 60) : '', id: n.id, right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) });
      }
    });
    const rows = qa('.inst');
    const spark = q('.inst__spark');
    const tabbables = qa('a[href],button,input,[tabindex]').filter((n) => visible(n) && !n.disabled && n.getAttribute('aria-hidden') !== 'true');
    return {
      viewport: { w: innerWidth, h: innerHeight },
      doc: { scrollH: document.documentElement.scrollHeight, bodyH: document.body.scrollHeight, scrollW: document.documentElement.scrollWidth },
      scrollable: document.documentElement.scrollHeight > innerHeight + 1 || document.documentElement.scrollWidth > innerWidth + 1,
      sheet: rect('.sheet'), masthead: rect('.masthead'), plate: rect('.plate'), mount: rect('.vitrine__mount'),
      frame: rect('.vitrine__frame'), canvas: rect('#sim-canvas'), rule: rect('.generation-rule'),
      ledger: rect('.ledger'), folio: rect('.folio'), panel: rect('.folio__panel'), colophon: rect('.colophon'),
      folioFoot: rect('.folio__foot'), folioSig: rect('.folio__sig'), folioLegend: rect('.folio-legend'),
      panelClip: (() => { const pn = q('.folio__panel'); const sig = q('.folio__sig'); if (!pn || !sig) return null; const a = pn.getBoundingClientRect(), b = sig.getBoundingClientRect(); return { sigInside: b.bottom <= a.bottom + 0.5, sigBottom: +b.bottom.toFixed(1), panelBottom: +a.bottom.toFixed(1) }; })(),
      rows: rows.length, rowRects: rows.map((r) => { const b = r.getBoundingClientRect(); return { key: r.getAttribute('data-key'), y: +b.y.toFixed(1), h: +b.height.toFixed(1) }; }),
      spark: spark ? { cssW: +spark.getBoundingClientRect().width.toFixed(1), cssH: +spark.getBoundingClientRect().height.toFixed(1), bufW: spark.width, bufH: spark.height } : null,
      sparkCount: qa('canvas.inst__spark').length,
      controls: ['seed','mutation','regrowth','generations','speed','interval','catastrophes','trails'].map((k) => ({ k, exists: !!q('#ctl-' + k), role: q('#ctl-' + k) ? (q('#ctl-' + k).getAttribute('role') || q('#ctl-' + k).tagName.toLowerCase()) : null })),
      readouts: qa('.inst__val').map((n) => n.textContent),
      legend: !!q('.folio-legend'),
      tooltipHidden: q('#tooltip') ? q('#tooltip').hidden : null,
      folioFolded: q('#folio') ? q('#folio').classList.contains('is-folded') : null,
      tabbables: tabbables.length,
      overflow: overflow.slice(0, 25),
      overflowCount: overflow.length,
      focusOutline: cs('#ctl-mutation', 'outlineStyle'),
      rules: { progressWidth: q('#rule-progress') ? q('#rule-progress').style.width : null, cursorLeft: q('#rule-cursor') ? q('#rule-cursor').style.left : null, ticks: qa('#rule-ticks > *').length, seals: qa('#rule-seals > *').length },
      mockRan: !!window.__MOCK_RAN__,
      mockInfo: window.__MOCK_INFO__ || null,
      tooltipProbe: (() => {
        const c = q('#ctl-mutation'); if (!c) return null; c.focus();
        const t = q('#tooltip');
        const out = { hidden: t ? t.hidden : 'missing', key: t ? t.textContent.slice(0, 40) : '', active: document.activeElement && document.activeElement.id };
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); /* keep screenshots clean */
        return out;
      })()
    };
  })()`);

  console.log('--- layout ---');
  console.log(JSON.stringify(audit, null, 1));

  check('no page scroll at ' + W + 'x' + H, !audit.scrollable, audit.doc);
  check('8 instrument rows', audit.rows === 8, audit.rows);
  check('8 sparklines 76x22 CSS', audit.sparkCount === 8 && audit.spark && Math.abs(audit.spark.cssW - 76) < 1.1 && Math.abs(audit.spark.cssH - 22) < 1.1, audit.spark);
  check('all 8 controls exist', audit.controls.every((c) => c.exists), audit.controls);
  check('sparkline buffer is DPR-aware', audit.spark && audit.spark.bufW === Math.round(audit.spark.cssW * DPR), audit.spark);
  check('legend present', audit.legend);
  check('rule ticks rendered', audit.rules.ticks > 10, audit.rules);
  check('no horizontal overflow', audit.overflowCount === 0, audit.overflow);

  if (!auditOnly) {
    console.log('--- interaction ---');

    // tooltip on focus
    const tip1 = await cdp.eval(`(() => {
      const canvas = document.getElementById('sim-canvas');
      if (canvas) canvas.focus();
      const c = document.getElementById('ctl-mutation');
      c.focus();
      const t = document.getElementById('tooltip');
      return { hidden: t.hidden, text: t.textContent.slice(0, 80), described: c.getAttribute('aria-describedby'), focus: document.activeElement && document.activeElement.id };
    })()`);
    check('tooltip opens on focus', tip1.hidden === false && /Mutation rate/i.test(tip1.text), tip1);
    check('control describedby tooltip', tip1.described === 'tooltip');
    await cdp.eval(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await sleep(150);
    const tip2 = await cdp.eval(`(() => { const t = document.getElementById('tooltip'); const h = document.querySelector('.inst[data-key=mutation] .inst__help'); return { hidden: t.hidden, expanded: h.getAttribute('aria-expanded') }; })()`);
    check('Escape dismisses tooltip', tip2.hidden === true && tip2.expanded === 'false', tip2);

    // dial keyboard
    const dial0 = await cdp.eval(`(() => { const d = document.getElementById('ctl-speed'); d.focus(); return { now: d.getAttribute('aria-valuenow'), text: d.getAttribute('aria-valuetext'), angle: getComputedStyle(d).getPropertyValue('--angle') }; })()`);
    await cdp.key('ArrowUp', 'ArrowUp', 38);
    await sleep(120);
    const dial1 = await cdp.eval(`(() => { const d = document.getElementById('ctl-speed'); return { now: d.getAttribute('aria-valuenow'), text: d.getAttribute('aria-valuetext'), readout: document.querySelector('.inst[data-key=speed] .inst__val').textContent, angle: d.style.getPropertyValue('--angle') }; })()`);
    check('dial ArrowUp changes value', parseFloat(dial1.now) > parseFloat(dial0.now), { before: dial0, after: dial1 });
    await cdp.key('End', 'End', 35);
    await sleep(120);
    const dialEnd = await cdp.eval(`(() => { const d = document.getElementById('ctl-speed'); return { now: d.getAttribute('aria-valuenow'), angle: d.style.getPropertyValue('--angle') }; })()`);
    check('dial End reaches max', Math.abs(parseFloat(dialEnd.now) - 8) < 0.001, dialEnd);
    await cdp.key('Home', 'Home', 36);
    await sleep(120);
    const dialHome = await cdp.eval(`(() => document.getElementById('ctl-speed').getAttribute('aria-valuenow'))()`);
    check('dial Home reaches min', Math.abs(parseFloat(dialHome) - 0.25) < 0.001, dialHome);

    // range keyboard + aria
    const rangeState = await cdp.eval(`(() => {
      const r = document.getElementById('ctl-mutation');
      r.focus();
      const before = r.value;
      r.stepUp(2);
      r.dispatchEvent(new Event('input', { bubbles: true }));
      return { before, after: r.value, valuetext: r.getAttribute('aria-valuetext'), labels: r.getAttribute('aria-labelledby') };
    })()`);
    check('range applies steps and aria-valuetext', rangeState.before !== rangeState.after && /per locus/i.test(rangeState.valuetext || ''), rangeState);

    // toggle keyboard (Space)
    const tog0 = await cdp.eval(`(() => { const b = document.getElementById('ctl-catastrophes'); b.focus(); return { checked: b.getAttribute('aria-checked'), role: b.getAttribute('role') }; })()`);
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', text: ' ', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
    await sleep(200);
    let tog1 = await cdp.eval(`(() => { const b = document.getElementById('ctl-catastrophes'); return { checked: b.getAttribute('aria-checked'), readout: document.querySelector('.inst[data-key=catastrophes] .inst__val').textContent, role: b.getAttribute('role') }; })()`);
    if (tog0.checked === tog1.checked) {
      await cdp.eval(`document.getElementById('ctl-catastrophes').focus()`);
      await cdp.key('ArrowRight', 'ArrowRight', 39);
      await sleep(200);
      tog1 = await cdp.eval(`(() => { const b = document.getElementById('ctl-catastrophes'); return { checked: b.getAttribute('aria-checked'), readout: document.querySelector('.inst[data-key=catastrophes] .inst__val').textContent, role: b.getAttribute('role') }; })()`);
    }
    check('rocker Space/Arrow toggles + updates readout', tog0.checked !== tog1.checked && tog1.readout, { before: tog0, after: tog1 });

    // catastrophe integration: tighten the interval, step until weather fires
    const eventState = await cdp.eval(`(async () => {
      const V = window.__VIVARIUM__;
      if (!V) return { skipped: true };
      V.actions.pause();
      V.setParam('catastrophes', true);
      V.setParam('interval', 3);
      for (let i = 0; i < 6; i++) {
        V.actions.stepGen();
        if (V.getWorld().events.length) break;
      }
      await new Promise(r => setTimeout(r, 250));
      const w = V.getWorld();
      return {
        events: w.events.length,
        gen: w.generation,
        seals: document.querySelectorAll('#rule-seals > *').length,
        bannerHidden: document.getElementById('event-banner').hidden,
        bannerLatin: document.getElementById('banner-latin').textContent,
        conditions: document.getElementById('active-conditions').textContent.trim(),
        wash: document.getElementById('wash').className,
        ledgerEntries: document.querySelectorAll('#ledger-list > li').length
      };
    })()`);
    check('catastrophe fires: seal + banner + condition + ledger', eventState.skipped || (eventState.events >= 1 && eventState.seals >= 1 && eventState.bannerHidden === false && eventState.conditions.length > 0 && /is-active/.test(eventState.wash || '') && eventState.ledgerEntries > 1), eventState);

    // stepper typing commit (a length longer than the run so the study is not concluded)
    await cdp.eval(`(() => { const i = document.getElementById('ctl-generations'); i.focus(); i.select(); })()`);
    await cdp.send('Input.insertText', { text: '39' });
    await cdp.key('Enter', 'Enter', 13);
    await sleep(160);
    const stepAfter = await cdp.eval(`(() => { const i = document.getElementById('ctl-generations'); return { value: i.value, now: i.getAttribute('aria-valuenow'), readout: document.querySelector('.inst[data-key=generations] .inst__val').textContent, recordHidden: document.getElementById('record').hidden }; })()`);
    check('stepper typed value commits', stepAfter.value === '39' && stepAfter.now === '39' && stepAfter.recordHidden === true, stepAfter);

    // fold / unfold
    await cdp.send('Page.bringToFront');
    const fold = await cdp.eval(`(async () => {
      const f = document.getElementById('folio');
      const p = document.getElementById('folio-panel');
      const t = document.getElementById('folio-toggle');
      t.click();
      const samples = [];
      for (let i = 0; i < 9; i++) { await new Promise(r => setTimeout(r, 100)); samples.push({ at: i * 100, w: +f.getBoundingClientRect().width.toFixed(1), folded: f.classList.contains('is-folded'), exp: t.getAttribute('aria-expanded') }); }
      const inside = p.querySelector('#ctl-seed');
      inside.focus();
      const focusInside = p.contains(document.activeElement);
      return {
        folded: f.classList.contains('is-folded'), hidden: p.getAttribute('aria-hidden'), inert: p.inert === true || p.hasAttribute('inert'),
        expanded: t.getAttribute('aria-expanded'), label: t.getAttribute('aria-label'), width: f.getBoundingClientRect().width,
        focusInside, active: document.activeElement && document.activeElement.id, samples
      };
    })()`);
    check('fold hides/inerts panel and inverts aria-expanded', fold.folded && fold.hidden === 'true' && fold.inert && fold.expanded === 'false' && fold.width < 45, fold);
    check('folded controls leave tab order', fold.focusInside === false, fold);
    await cdp.eval(`document.getElementById('folio-toggle').click()`);
    await sleep(750);
    const unfold = await cdp.eval(`(() => {
      const f = document.getElementById('folio');
      const p = document.getElementById('folio-panel');
      const t = document.getElementById('folio-toggle');
      return { folded: f.classList.contains('is-folded'), hidden: p.getAttribute('aria-hidden'), inert: p.inert === true || p.hasAttribute('inert'), expanded: t.getAttribute('aria-expanded'), width: f.getBoundingClientRect().width };
    })()`);
    check('unfold restores panel and tab order', !unfold.folded && unfold.hidden === null && !unfold.inert && unfold.expanded === 'true' && unfold.width > 250, unfold);

    // keyboard traversal: seed input -> plus -> speed dial, check focus-visible ring + tooltip
    await cdp.eval(`(() => { const g = document.getElementById('ctl-generations'); g.focus(); })()`);
    let kbFocus = null;
    const kbTrace = [];
    for (let i = 0; i < 5; i++) {
      await cdp.key('Tab', 'Tab', 9);
      await sleep(120);
      kbFocus = await cdp.eval(`(() => {
        const a = document.activeElement;
        const cs = getComputedStyle(a);
        const t = document.getElementById('tooltip');
        return { id: a && a.id, cls: a && a.className, role: a && a.getAttribute('role'), fv: !!(a && a.matches && a.matches(':focus-visible')), outline: cs.outlineStyle + ' ' + cs.outlineWidth, tooltipOpen: t ? !t.hidden : null };
      })()`);
      kbTrace.push(kbFocus);
      if (kbFocus.id === 'ctl-speed') break;
    }
    console.log('  INFO tab trace:', JSON.stringify(kbTrace.map((x) => x.id + '/' + x.cls)));
    check('keyboard focus lands on custom dial with visible ink ring', kbFocus.id === 'ctl-speed' && kbFocus.fv === true && kbFocus.outline === 'solid 2px' && kbFocus.tooltipOpen === true, kbFocus);

    // localStorage persistence
    const persisted = await cdp.eval(`(() => { try { return localStorage.getItem('vivarium.folio.folded'); } catch (e) { return 'unavailable'; } })()`);
    console.log('  INFO folded-state storage:', persisted);
  }

  if (shot) {
    if (DPR !== 1) await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: DPR, mobile: false });
    const params = { format: 'png' };
    if (crop) {
      const [x, y, w, h] = crop.split(',').map(Number);
      params.clip = { x, y, width: w, height: h, scale: 1 };
      params.captureBeyondViewport = true;
    }
    const img = await cdp.send('Page.captureScreenshot', params);
    await writeFile(shot, Buffer.from(img.data, 'base64'));
    console.log('  shot ->', shot);
  }

  console.log('--- console errors ---');
  if (cdp.errors.length) console.log(JSON.stringify(cdp.errors, null, 1));
  else console.log('  none');
  const warnings = cdp.logs.filter((l) => l.level === 'warning');
  if (warnings.length) console.log('warnings:', JSON.stringify(warnings, null, 1));

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : '\n' + failures + ' CHECK(S) FAILED');
  if (cdp.errors.length) failures++;

  ws.close();
  process.exitCode = failures ? 1 : 0;
} catch (err) {
  console.error('HARNESS ERROR:', err && err.stack || err);
  process.exitCode = 2;
} finally {
  try { chrome.kill('SIGKILL'); } catch (e) { /* noop */ }
  await sleep(150);
  try { await rm(profile, { recursive: true, force: true }); } catch (e) { /* noop */ }
}
