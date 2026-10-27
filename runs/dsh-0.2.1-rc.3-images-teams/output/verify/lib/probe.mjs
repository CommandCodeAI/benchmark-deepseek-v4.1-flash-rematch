// In-page probe helpers. PROBE_SOURCE is evaluated once per page load and
// installs window.__VERIFY — all browser tests then call small expressions.
import { sleep } from './cdp.mjs';

function vivariumProbe() {
  const q = (s, r = document) => r.querySelector(s);
  const qa = (s, r = document) => [...r.querySelectorAll(s)];
  const txt = (s, r = document) => (q(s, r)?.textContent || '').replace(/\s+/g, ' ').trim();
  const num = (s) => {
    const m = String(s ?? '').match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : null;
  };
  const rectOf = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), right: +r.right.toFixed(1), bottom: +r.bottom.toFixed(1) };
  };
  const visible = (el) => {
    if (!el) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01 && r.width > 0.5 && r.height > 0.5;
  };
  const palette = () => {
    const cs = getComputedStyle(document.documentElement);
    const keys = ['paper', 'paper-hi', 'paper-lo', 'ink', 'ink-2', 'ink-3', 'rule', 'brass', 'flora', 'fauna', 'predator', 'wax'];
    const out = {};
    for (const k of keys) out[k] = cs.getPropertyValue('--' + k).trim();
    return out;
  };
  const canvasStats = (sel) => {
    const c = typeof sel === 'string' ? q(sel) : sel;
    if (!c) return { error: 'missing ' + sel };
    if (c.tagName !== 'CANVAS') return { error: 'not a canvas: ' + c.tagName };
    const r = c.getBoundingClientRect();
    if (!c.width || !c.height) return { error: 'zero backing store', cssW: r.width, cssH: r.height };
    let ctx;
    try { ctx = c.getContext('2d'); } catch (e) { return { error: 'no ctx: ' + e.message }; }
    let data;
    try { data = ctx.getImageData(0, 0, c.width, c.height).data; } catch (e) { return { error: 'unreadable (tainted?): ' + e.message }; }
    const W = c.width, H = c.height;
    const mult = Math.max(1, Math.round(Math.sqrt((W * H) / 120000)));
    const step = mult;
    const mode = new Map();
    let counted = 0;
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4;
      const key = data[i] + ',' + data[i + 1] + ',' + data[i + 2];
      mode.set(key, (mode.get(key) || 0) + 1);
      counted++;
    }
    let bg = '236,227,208', bgn = -1;
    for (const [k, n] of mode) if (n > bgn) { bgn = n; bg = k; }
    const [br, bgc, bb] = bg.split(',').map(Number);
    let nonBg = 0, colored = 0, dark = 0;
    const hues = { red: 0, green: 0, ochre: 0, blue: 0, neutral: 0 };
    for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
      const i = (y * W + x) * 4;
      const R = data[i], G = data[i + 1], B = data[i + 2];
      const d = Math.abs(R - br) + Math.abs(G - bgc) + Math.abs(B - bb);
      const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
      if (d > 36) {
        nonBg++;
        if (mx - mn > 26) colored++;
        if (mx < 130) dark++;
        if (mx - mn <= 26) hues.neutral++;
        else if (R >= G && G > B && R - B > 25 && G - B > 15) hues.ochre++;
        else if (G >= R && G > B) hues.green++;
        else if (R > G && R > B) hues.red++;
        else hues.blue++;
      }
    }
    const near = (rr, gg, bb2, tol) => {
      let n = 0;
      for (let i = 0; i < data.length; i += 4 * Math.max(1, mult)) {
        if (Math.abs(data[i] - rr) < tol && Math.abs(data[i + 1] - gg) < tol && Math.abs(data[i + 2] - bb2) < tol) n++;
      }
      return n;
    };
    // regional non-bg counts for matrix cells: rows x cols
    const grid = (rows, cols) => {
      const cells = [];
      const X0 = Math.floor(W * 0.08), X1 = Math.floor(W * 0.985);
      const Y0 = Math.floor(H * 0.04), Y1 = Math.floor(H * 0.93);
      const cw = (X1 - X0) / cols, ch = (Y1 - Y0) / rows;
      for (let ry = 0; ry < rows; ry++) for (let cx = 0; cx < cols; cx++) {
        let nb = 0, tot = 0;
        const xs = Math.floor(X0 + cx * cw), xe = Math.floor(X0 + (cx + 1) * cw);
        const ys = Math.floor(Y0 + ry * ch), ye = Math.floor(Y0 + (ry + 1) * ch);
        for (let y = ys; y < ye; y += 2) for (let x = xs; x < xe; x += 2) {
          const i = (y * W + x) * 4;
          const d = Math.abs(data[i] - br) + Math.abs(data[i + 1] - bgc) + Math.abs(data[i + 2] - bb);
          if (d > 36) nb++;
          tot++;
        }
        cells.push({ row: ry, col: cx, ratio: tot ? nb / tot : 0 });
      }
      return cells;
    };
    return {
      width: W, height: H, cssW: +r.width.toFixed(1), cssH: +r.height.toFixed(1),
      dpr: +(W / Math.max(1, r.width)).toFixed(2),
      bg, counted, nonBg, nonBgRatio: counted ? +(nonBg / counted).toFixed(4) : 0,
      colored, coloredRatio: counted ? +(colored / counted).toFixed(4) : 0,
      dark, hues,
      nearFlora: near(79, 111, 82, 82), nearFauna: near(171, 122, 53, 82), nearPredator: near(147, 55, 45, 82),
      nearWax: near(122, 43, 35, 70), nearWaxStrict: near(122, 43, 35, 20), nearRust: near(141, 58, 34, 80),
      nearInk: near(33, 29, 22, 70),
      blank: nonBg / Math.max(1, counted) < 0.002,
      cells12: grid(3, 4),
    };
  };
  const genState = () => {
    const metaGenText = txt('#meta-gen');
    const metaMatch = metaGenText.match(/(\d+)\s*\/\s*(\d+)/);
    const ruleMatch = txt('#rule-gen').match(/(\d+)\s*\/\s*(\d+)/);
    const cursorMatch = txt('#rule-cursor-label').match(/(\d+)/);
    const status = txt('#meta-status-text') || txt('#colophon-state');
    return {
      metaGenText, ruleGenText: txt('#rule-gen'), cursor: txt('#rule-cursor-label'),
      gen: metaMatch ? +metaMatch[1] : ruleMatch ? +ruleMatch[1] : cursorMatch ? +cursorMatch[1] : null,
      total: metaMatch ? +metaMatch[2] : ruleMatch ? +ruleMatch[2] : null,
      seed: txt('#meta-seed'), status,
      recordHidden: q('#record') ? q('#record').hidden : null,
      recordVisible: q('#record') ? visible(q('#record')) : null,
      finished: /concluded|complete|record/i.test(status) || (q('#record') && !q('#record').hidden),
      counts: { flora: txt('#census-flora'), herbivora: txt('#census-fauna'), carnivora: txt('#census-predator') },
      ticks: txt('#vitrine-clock'),
      rate: txt('#rule-rate'),
      progress: q('#rule-progress') ? getComputedStyle(q('#rule-progress')).width : null,
    };
  };
  const controlList = () => {
    const root = q('#instrument-body') || q('#folio') || document;
    const sels = 'input, button, [role="slider"], [role="switch"], [role="spinbutton"], [role="radio"], select, [tabindex]:not([tabindex="-1"])';
    const els = qa(sels, root).filter((el) => !el.disabled);
    return els.map((el, i) => {
      const r = el.getBoundingClientRect();
      let row = el.closest('[data-instrument], .instrument, .instrument-row, .control-row, .folio__row, .field-row, li, fieldset, .setting');
      if (!row) {
        let p = el.parentElement;
        for (let d = 0; d < 4 && p && p !== root; d++, p = p.parentElement) {
          if (p.textContent && p.textContent.replace(/\s+/g, ' ').trim().length > 25) { row = p; break; }
        }
      }
      const rowText = row ? (row.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 220) : '';
      return {
        i, tag: el.tagName, type: el.type || '', role: el.getAttribute('role') || '',
        id: el.id || '', cls: typeof el.className === 'string' ? el.className.slice(0, 90) : '',
        name: el.getAttribute('name') || '', ariaLabel: el.getAttribute('aria-label') || '',
        value: el.value !== undefined ? el.value : null,
        ariaNow: el.getAttribute('aria-valuenow'), ariaMin: el.getAttribute('aria-valuemin'),
        ariaMax: el.getAttribute('aria-valuemax'), ariaText: el.getAttribute('aria-valuetext') || '',
        ariaChecked: el.getAttribute('aria-checked'), ariaDescribedby: el.getAttribute('aria-describedby') || '',
        disabled: !!el.disabled, tabIndex: el.tabIndex,
        rect: rectOf(el), visible: visible(el), rowText,
        hasSpark: row ? !!row.querySelector('canvas') : false,
        sparkCount: root.querySelectorAll('canvas').length,
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60),
      };
    });
  };
  const keyOf = (c) => {
    const s = ((c.ariaLabel || '') + ' ' + (c.rowText || '') + ' ' + (c.id || '') + ' ' + (c.name || '')).toLowerCase();
    if (/seed|recast/.test(s)) return 'seed';
    if (/mutation|locus/.test(s)) return 'mutation';
    if (/regrowth|vigour|vigor/.test(s)) return 'regrowth';
    if (/generation/.test(s)) return 'generations';
    if (/\bspeed\b|veloc|ticks/.test(s)) return 'speed';
    if (/interval|weather|rhythm|event/.test(s)) return 'interval';
    if (/catastroph|weather.*(on|off)|armed/.test(s)) return 'catastrophes';
    if (/trail|ghost/.test(s)) return 'trails';
    return 'unknown';
  };
  const focusInfo = () => {
    const el = document.activeElement;
    if (!el || el === document.body) return { tag: 'BODY', desc: 'body' };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName, id: el.id || '', cls: typeof el.className === 'string' ? el.className.slice(0, 80) : '',
      role: el.getAttribute('role') || '', ariaLabel: el.getAttribute('aria-label') || '',
      vv: el.getAttribute('data-vv') || '',
      text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50),
      outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset,
      boxShadow: cs.boxShadow === 'none' ? 'none' : cs.boxShadow.slice(0, 120),
      borderColor: cs.borderColor, background: cs.backgroundColor,
      focusVisible: el.matches(':focus-visible'),
      rect: rectOf(el), visible: visible(el),
      classList: [...el.classList].slice(0, 8),
    };
  };
  const tooltipState = () => {
    const t = q('#tooltip');
    if (!t) return { exists: false };
    const r = t.getBoundingClientRect();
    return {
      exists: true, hidden: t.hidden, visible: visible(t), text: (t.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400),
      rect: rectOf(t), role: t.getAttribute('role'), id: t.id,
      inViewport: r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1,
    };
  };
  const bannerState = () => {
    const b = q('#event-banner');
    if (!b) return { exists: false };
    return {
      exists: true, hidden: b.hidden, visible: visible(b), cls: b.className,
      latin: txt('#banner-latin'), name: txt('#banner-name'), note: txt('#banner-note'), gen: txt('#banner-gen'),
      seal: txt('#banner-seal'), rect: rectOf(b), text: (b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240),
      live: (() => {
        const ownRole = b.getAttribute('role');
        const ownLive = b.getAttribute('aria-live');
        const inner = b.querySelector('[aria-live], [role="status"]');
        const global = qa('[aria-live], [role="status"]').map((el) => ({ tag: el.tagName, id: el.id, role: el.getAttribute('role'), live: el.getAttribute('aria-live'), inBanner: b.contains(el) }));
        return { ownRole, ownLive, inner: inner ? { role: inner.getAttribute('role'), live: inner.getAttribute('aria-live') } : null, globalCount: global.length, global: global.slice(0, 8) };
      })(),
    };
  };
  const sealsState = () => {
    const root = q('#rule-seals');
    const kids = root ? qa('*', root).filter((el) => el.children.length === 0 || /seal|mark|dot/i.test(el.className)) : [];
    return {
      rootExists: !!root,
      count: root ? root.children.length : 0,
      titles: (root ? qa('[title], [aria-label], [data-event], [data-gen]', root) : []).slice(0, 12).map((el) => el.getAttribute('title') || el.getAttribute('aria-label') || el.getAttribute('data-event') || ''),
      html: root ? root.innerHTML.slice(0, 800) : '',
      rects: kids.slice(0, 12).map(rectOf),
    };
  };
  const ledgerState = () => {
    const list = q('#ledger-list');
    const entries = list ? qa('li', list).map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim()) : [];
    return {
      exists: !!list, count: entries.length, entries: entries.slice(0, 20),
      counter: txt('#ledger-counter'),
      scrollH: list ? list.scrollHeight : null, clientH: list ? list.clientHeight : null,
    };
  };
  const washState = () => {
    const w = q('#wash');
    if (!w) return { exists: false };
    const cs = getComputedStyle(w);
    return {
      exists: true, cls: w.className, opacity: cs.opacity, background: (cs.backgroundColor || '').slice(0, 80),
      hasEventClass: /drought|plague|wildfire|fire|siccitas|pestilentia|incendium/i.test(w.className), hidden: cs.display === 'none', rect: rectOf(w),
    };
  };
  const conditionsState = () => {
    const c = q('#active-conditions');
    return { exists: !!c, text: (c?.textContent || '').replace(/\s+/g, ' ').trim(), html: (c?.innerHTML || '').slice(0, 400), visible: visible(c) };
  };
  const recordState = () => {
    const rec = q('#record');
    const sheet = q('.record__sheet');
    const summary = q('#record-summary');
    return {
      hidden: rec ? rec.hidden : null,
      visible: visible(rec),
      cls: rec ? rec.className : '',
      title: txt('#record-title'),
      meta: txt('#record-meta'),
      summaryText: (summary?.textContent || '').replace(/\s+/g, ' ').trim(),
      summaryHtmlLen: (summary?.innerHTML || '').length,
      notes: (q('#record-notes')?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400),
      footNote: txt('#record-foot-note'),
      chartPop: canvasStats('#chart-pop'),
      chartTraits: canvasStats('#chart-traits'),
      popRect: rectOf(q('#chart-pop')), traitsRect: rectOf(q('#chart-traits')),
      sheetRect: rectOf(sheet), recRect: rectOf(rec),
      scrollH: document.scrollingElement.scrollHeight, innerH: innerHeight,
      scrollW: document.scrollingElement.scrollWidth, innerW: innerWidth,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
      sheetScroll: sheet ? { scrollH: sheet.scrollHeight, clientH: sheet.clientHeight, scrollW: sheet.scrollWidth, clientW: sheet.clientWidth } : null,
      recScroll: rec ? { scrollH: rec.scrollHeight, clientH: rec.clientHeight } : null,
      actions: ['#btn-replay', '#btn-newseed', '#btn-back'].map((s) => {
        const el = q(s);
        return el ? { sel: s, text: (el.textContent || '').replace(/\s+/g, ' ').trim(), visible: visible(el), rect: rectOf(el), disabled: !!el.disabled } : { sel: s, missing: true };
      }),
    };
  };
  const overflowScan = () => {
    const bad = [];
    const vw = innerWidth, vh = innerHeight;
    for (const el of qa('body *')) {
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.02) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      const tag = el.tagName.toLowerCase();
      const isEffect = /vitrine__(glass|vignette|grid)|wash|desk|sheet|rule__progress|rule__seals/.test(String(el.className));
      if (!isEffect && (r.right > vw + 2 || r.left < -2)) {
        bad.push({ kind: 'x-outside', tag, cls: String(el.className).slice(0, 70), rect: rectOf(el), text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) });
      }
      if (!isEffect && (r.bottom > vh + 2) && !['html', 'body'].includes(tag)) {
        bad.push({ kind: 'below-fold', tag, cls: String(el.className).slice(0, 70), rect: rectOf(el), text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60) });
      }
      const textish = (el.childElementCount === 0 || tag === 'p' || tag === 'span' || tag === 'label' || /button|title|label|readout|mono/.test(String(el.className))) && (el.textContent || '').trim().length > 0;
      const clipsX = cs.overflowX === 'hidden' || cs.overflowX === 'clip';
      const clipsY = cs.overflowY === 'hidden' || cs.overflowY === 'clip';
      if (textish && clipsX && el.scrollWidth > el.clientWidth + 3) {
        bad.push({ kind: 'text-clipped', tag, cls: String(el.className).slice(0, 70), scrollW: el.scrollWidth, clientW: el.clientWidth, text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) });
      }
      if (textish && clipsY && el.scrollHeight > el.clientHeight + 3) {
        bad.push({ kind: 'text-clipped-y', tag, cls: String(el.className).slice(0, 70), scrollH: el.scrollHeight, clientH: el.clientHeight, text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) });
      }
      if (textish && !clipsX && !clipsY && (el.scrollWidth > el.clientWidth + 3 || el.scrollHeight > el.clientHeight + 3)) {
        bad.push({ kind: 'text-overflow-visible', tag, cls: String(el.className).slice(0, 70), scrollW: el.scrollWidth, clientW: el.clientWidth, scrollH: el.scrollHeight, clientH: el.clientHeight, text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 80) });
      }
    }
    // de-dup by kind+cls+rect
    const seen = new Set();
    const uniq = [];
    for (const b of bad) {
      const k = b.kind + '|' + b.cls + '|' + (b.rect ? b.rect.x + ',' + b.rect.y + ',' + b.rect.w : '');
      if (seen.has(k)) continue;
      seen.add(k);
      uniq.push(b);
    }
    return {
      vw, vh, count: uniq.length, items: uniq.slice(0, 40),
      docOverflowX: document.scrollingElement.scrollWidth > vw + 2,
      docOverflowY: document.scrollingElement.scrollHeight > vh + 2,
      docScroll: { w: document.scrollingElement.scrollWidth, h: document.scrollingElement.scrollHeight },
    };
  };
  const ariaAudit = () => {
    const accName = (el) => {
      const lab = el.getAttribute('aria-label');
      if (lab && lab.trim()) return lab.trim();
      const by = el.getAttribute('aria-labelledby');
      if (by) { const t = by.split(/\s+/).map((id) => txt('#' + id)).join(' ').trim(); if (t) return t; }
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) return t;
      const title = el.getAttribute('title');
      if (title) return title;
      return '';
    };
    const emptyButtons = qa('button, [role="button"]').filter((el) => visible(el) && !accName(el)).map((el) => ({ id: el.id, cls: String(el.className).slice(0, 60) }));
    const accNameOf = (el) => {
      const direct = el.getAttribute('aria-label');
      if (direct && direct.trim()) return direct.trim();
      const lb = el.getAttribute('aria-labelledby');
      if (lb) { const t = lb.split(/\s+/).map((id) => (q('#' + id)?.textContent || '')).join(' ').replace(/\s+/g, ' ').trim(); if (t) return t; }
      if (el.labels && el.labels[0]) return el.labels[0].textContent.replace(/\s+/g, ' ').trim();
      return '';
    };
    const sliders = qa('[role="slider"], input[type="range"]').map((el) => ({
      id: el.id, role: el.getAttribute('role') || (el.type === 'range' ? 'range(native)' : ''),
      tag: el.tagName, ariaLabel: accNameOf(el),
      hasMin: el.getAttribute('aria-valuemin') != null || (el.min !== '' && el.min != null), hasMax: el.getAttribute('aria-valuemax') != null || (el.max !== '' && el.max != null),
      hasNow: el.getAttribute('aria-valuenow') != null || el.value !== undefined, now: el.getAttribute('aria-valuenow') != null ? el.getAttribute('aria-valuenow') : el.value,
      text: el.getAttribute('aria-valuetext') || (el.title || ''), describedby: el.getAttribute('aria-describedby'),
      tabIndex: el.tabIndex, visible: visible(el),
    }));
    const switches = qa('[role="switch"], input[type="checkbox"]').map((el) => ({
      id: el.id, ariaLabel: el.getAttribute('aria-label'), checked: el.getAttribute('aria-checked') ?? String(el.checked),
      visible: visible(el), tabIndex: el.tabIndex,
    }));
    const canvases = qa('canvas').map((c) => ({
      id: c.id, role: c.getAttribute('role'), label: (c.getAttribute('aria-label') || '').slice(0, 140),
      w: c.width, h: c.height, visible: visible(c), inFolio: !!c.closest('#folio'), inRecord: !!c.closest('#record'),
    }));
    const liveRegions = qa('[aria-live], [role="status"], [role="alert"]').map((el) => ({ tag: el.tagName, id: el.id, role: el.getAttribute('role'), live: el.getAttribute('aria-live'), visible: visible(el) }));
    return { emptyButtons, sliders, switches, canvases, liveRegions, canvCount: canvases.length, sliderCount: sliders.length, switchCount: switches.length };
  };
  const interactiveInFolio = () => {
    const folio = q('#folio');
    if (!folio) return { error: 'no #folio' };
    const panel = q('#folio-panel');
    const els = qa('input, button, [role="slider"], [role="switch"], [role="spinbutton"], a[href], [tabindex]:not([tabindex="-1"])', folio);
    return {
      folioRect: rectOf(folio), panelRect: rectOf(panel), toggle: (() => { const t = q('#folio-toggle'); return t ? { ariaExpanded: t.getAttribute('aria-expanded'), label: t.getAttribute('aria-label'), rect: rectOf(t), text: (t.textContent || '').trim() } : null; })(),
      panelHidden: panel ? panel.hidden : null, panelAriaHidden: panel ? panel.getAttribute('aria-hidden') : null,
      panelInert: panel ? panel.inert === true || panel.hasAttribute('inert') : null,
      panelDisplay: panel ? getComputedStyle(panel).display : null,
      panelVisibility: panel ? getComputedStyle(panel).visibility : null,
      count: els.length,
      elements: els.map((el) => ({ tag: el.tagName, id: el.id || '', role: el.getAttribute('role') || '', ariaLabel: el.getAttribute('aria-label') || '', visible: visible(el), rect: rectOf(el), tabIndex: el.tabIndex })),
      folioW: rectOf(folio)?.w,
    };
  };
  const rowOf = (el) => {
    let row = el.closest('section.inst, [data-instrument], [data-key], .instrument, .instrument-row, .control-row, .folio__row, .field-row, li, fieldset, .setting');
    if (!row) {
      const root = q('#instrument-body') || document;
      let p = el.parentElement;
      for (let d = 0; d < 5 && p && p !== root; d++, p = p.parentElement) {
        if ((p.textContent || '').replace(/\s+/g, ' ').trim().length > 25 && p.querySelector('label, [id^="lbl-"], .inst__label')) { row = p; break; }
      }
    }
    return row;
  };
  const keyOfEl = (el) => keyOf({
    ariaLabel: el.getAttribute('aria-label') || '',
    rowText: (rowOf(el)?.textContent || '').replace(/\s+/g, ' ').trim(),
    id: el.id, name: el.getAttribute('name') || '',
  });
  const controlPairs = () => {
    const root = q('#instrument-body') || q('#folio') || document;
    const sels = 'input, button, [role="slider"], [role="switch"], [role="spinbutton"], select, [tabindex]:not([tabindex="-1"])';
    return qa(sels, root).filter((el) => !el.disabled).map((el) => ({ el, key: keyOfEl(el) }));
  };
  const pal = palette();
  window.__VERIFY = {
    markControls: () => {
      const labelTextOf = (el) => {
        const lb = el.getAttribute('aria-labelledby');
        let t = '';
        if (lb) t = lb.split(/\s+/).map((id) => (q('#' + id)?.textContent || '')).join(' ');
        return (t + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
      };
      const primaryKey = (el) => {
        const tag = el.tagName, role = el.getAttribute('role') || '', type = (el.type || '').toLowerCase();
        const text = (labelTextOf(el) + ' ' + (rowOf(el)?.textContent || '')).toLowerCase().replace(/\s+/g, ' ');
        const isSwitch = role === 'switch' || type === 'checkbox' || /rocker/i.test(String(el.className));
        const isSlider = role === 'slider' || type === 'range' || /dial/i.test(String(el.className));
        if (isSwitch) return /trail|ghost|optic/.test(text) ? 'trails' : 'catastrophes';
        if (/seed/.test(text) && (type === 'number' || type === 'text' || tag === 'INPUT')) return 'seed';
        if (/generation/.test(text) && (type === 'number' || type === 'text' || tag === 'INPUT')) return 'generations';
        if (/mutation|locus/.test(text)) return 'mutation';
        if (/regrowth|vigour|vigor/.test(text)) return 'regrowth';
        if (/interval|between catastrophes|weather rhythm/.test(text)) return 'interval';
        if (/speed|tempo|ticks/.test(text)) return 'speed';
        if (/catastroph|armed|weather/.test(text)) return 'catastrophes';
        if (/trail|ghost/.test(text)) return 'trails';
        return null;
      };
      const rank = (el, key) => {
        const tag = el.tagName, role = el.getAttribute('role') || '', type = (el.type || '').toLowerCase();
        if (['mutation', 'regrowth', 'speed', 'interval'].includes(key)) {
          if (role === 'slider') return 0;
          if (type === 'range') return 1;
          if (tag === 'INPUT') return 2;
          return 8;
        }
        if (['catastrophes', 'trails'].includes(key)) {
          if (role === 'switch' || type === 'checkbox') return 0;
          return 8;
        }
        if (key === 'seed' || key === 'generations') {
          if (tag === 'INPUT' && (type === 'number' || type === 'text')) return 0;
          if (role === 'spinbutton') return 1;
          return 8;
        }
        return 9;
      };
      const candidates = [];
      qa('input, button, [role="slider"], [role="switch"], [role="spinbutton"], select, [tabindex]:not([tabindex="-1"])', q('#instrument-body') || q('#folio') || document).forEach((el) => {
        if (el.disabled) return;
        const key = primaryKey(el);
        if (!key) return;
        candidates.push({ el, key, rank: rank(el, key) });
      });
      const best = {};
      for (const c of candidates) {
        if (!best[c.key] || c.rank < best[c.key].rank) best[c.key] = c;
      }
      const out = [];
      for (const [key, c] of Object.entries(best)) {
        c.el.setAttribute('data-vv', key);
        out.push({
          vv: key, key, tag: c.el.tagName, type: c.el.type || '', role: c.el.getAttribute('role') || '',
          id: c.el.id || '', ariaLabel: c.el.getAttribute('aria-label') || '', name: c.el.getAttribute('name') || '',
          rect: rectOf(c.el), visible: visible(c.el), value: c.el.value !== undefined ? c.el.value : null,
          ariaNow: c.el.getAttribute('aria-valuenow'), ariaMin: c.el.getAttribute('aria-valuemin'),
          ariaMax: c.el.getAttribute('aria-valuemax'), ariaText: c.el.getAttribute('aria-valuetext') || '',
          ariaChecked: c.el.getAttribute('aria-checked'), tabIndex: c.el.tabIndex,
          rowText: (rowOf(c.el)?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 220),
          rank: c.rank,
        });
      }
      return out;
    },
    focusVV: (vv) => { const el = q('[data-vv="' + vv + '"]'); if (!el) return null; el.focus(); return focusInfo(); },
    clickVV: (vv) => { const el = q('[data-vv="' + vv + '"]'); if (!el) return null; el.click(); return true; },
    valueVV: (vv) => {
      const el = q('[data-vv="' + vv + '"]');
      if (!el) return null;
      return {
        value: el.value !== undefined ? el.value : null, ariaNow: el.getAttribute('aria-valuenow'),
        ariaText: el.getAttribute('aria-valuetext'), ariaChecked: el.getAttribute('aria-checked'),
        rowText: (rowOf(el)?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240),
      };
    },
    rowOfVV: (vv) => { const el = q('[data-vv="' + vv + '"]'); return el ? (rowOf(el)?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240) : null; },
    contrastAudit: () => {
      const parse = (c) => {
        const m = c.match(/rgba?\(([^)]+)\)/);
        if (!m) return null;
        const p = m[1].split(',').map((x) => parseFloat(x));
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
      };
      const lum = ({ r, g, b }) => {
        const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const bgOf = (el) => {
        const er = el.getBoundingClientRect();
        const cx = er.left + Math.min(er.width / 2, 6);
        const cy = er.top + er.height / 2;
        let p = el;
        while (p && p !== document.documentElement) {
          const cs = getComputedStyle(p);
          const c = parse(cs.backgroundColor);
          if (c && c.a > 0.35) {
            const r = p.getBoundingClientRect();
            // skip hairline/pseudo backgrounds whose painted box does not cover the glyphs
            const covers = cx >= r.left - 1 && cx <= r.right + 1 && cy >= r.top - 1 && cy <= r.bottom + 1;
            const bigEnough = r.width >= Math.min(er.width, 12) && r.height >= Math.min(er.height, 8);
            if (covers && bigEnough) return c;
          }
          p = p.parentElement;
        }
        return { r: 236, g: 227, b: 208, a: 1 };
      };
      const out = [];
      const leaves = qa('body *').filter((el) => el.childElementCount === 0 && (el.textContent || '').trim().length > 0 && visible(el));
      for (const el of leaves.slice(0, 400)) {
        const cs = getComputedStyle(el);
        const fg = parse(cs.color);
        if (!fg) continue;
        const bg = bgOf(el);
        const L1 = lum(fg), L2 = lum(bg);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        const fs = parseFloat(cs.fontSize);
        if (fs < 19 && ratio < 4.5 && el.tagName !== 'CANVAS') out.push({ tag: el.tagName, cls: String(el.className).slice(0, 60), text: (el.textContent || '').trim().slice(0, 30), ratio: +ratio.toFixed(2), fs });
      }
      const sorted = out.sort((a, b) => a.ratio - b.ratio);
      return { lowCount: out.length, worst: sorted.slice(0, 15), sampled: leaves.length };
    },

    q, qa, txt, rectOf, visible, canvasStats, genState, controlList, keyOf, focusInfo, tooltipState,
    bannerState, sealsState, ledgerState, washState, conditionsState, recordState, overflowScan,
    ariaAudit, interactiveInFolio, palette: () => pal,
    specimenCard: () => {
      const c = q('#specimen-card');
      return { exists: !!c, hidden: c ? c.hidden : null, visible: visible(c), text: (c?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 400) };
    },
    canvasRect: (sel) => rectOf(q(sel)),
    scrollTest: () => {
      const se = document.scrollingElement;
      const before = { x: window.scrollX, y: window.scrollY, scrollH: se.scrollHeight, scrollW: se.scrollWidth };
      window.scrollTo(0, 99999);
      const maxY = window.scrollY;
      window.scrollTo(99999, 0);
      const maxX = window.scrollX;
      window.scrollTo(before.x, before.y);
      return {
        before, canScrollY: maxY > 0, canScrollX: maxX > 0, maxY, maxX,
        innerH: innerHeight, innerW: innerWidth,
        overflowY: innerHeight < se.scrollHeight, overflowX: innerWidth < se.scrollWidth,
        bodyOverflowY: getComputedStyle(document.body).overflowY,
        htmlOverflowY: getComputedStyle(document.documentElement).overflowY,
      };
    },
    hooks: () => ({
      vivarium: typeof window.__VIVARIUM__ !== 'undefined' ? Object.keys(window.__VIVARIUM__) : null,
      boot: typeof window.VIVARIUM_BOOT !== 'undefined' ? Object.keys(window.VIVARIUM_BOOT) : null,
      engine: typeof window.VIVARIUM_ENGINE !== 'undefined' ? 'present' : null,
      world: (() => { try { const w = window.__VIVARIUM__ && window.__VIVARIUM__.getWorld && window.__VIVARIUM__.getWorld(); return w ? { seed: w.seed, generation: w.generation, history: w.history?.length, events: w.events?.length } : null; } catch (e) { return 'err:' + e.message; } })(),
    }),
    focusTrigger: (idx) => {
      const els = qa('#instrument-body button, #instrument-body [role="button"], [data-tooltip]');
      const el = els[idx];
      if (!el) return null;
      el.focus();
      return focusInfo();
    },
    triggerInfo: (idx) => {
      const els = qa('#instrument-body button, #instrument-body [role="button"], [data-tooltip]');
      const el = els[idx];
      if (!el) return null;
      return { tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 80), label: el.getAttribute('aria-label') || '', describedby: el.getAttribute('aria-describedby') || '', rect: rectOf(el), text: (el.textContent || '').trim().slice(0, 40) };
    },
    tooltipTriggers: () => qa('#instrument-body button, #instrument-body [role="button"], [data-tooltip]').map((el) => ({
      tag: el.tagName, id: el.id, cls: String(el.className).slice(0, 70),
      label: el.getAttribute('aria-label') || '', text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40),
      rect: rectOf(el), visible: visible(el), describedby: el.getAttribute('aria-describedby') || '',
      vv: el.getAttribute('data-vv') || '',
    })).filter((x) => x.visible),
    animations: () => [...document.getAnimations()].map((a) => ({ name: a.animationName || a.effect?.getKeyframes?.()?.length, dur: a.effect?.getComputedTiming?.().duration, state: a.playState })).slice(0, 30),
  };
}

export const PROBE_SOURCE = '(' + vivariumProbe.toString() + ')()';

export async function injectProbe(page) {
  await page.eval(PROBE_SOURCE);
  return true;
}

export async function waitUntil(page, expr, { timeoutMs = 12000, interval = 120, label = 'condition' } = {}) {
  const t0 = Date.now();
  let lastErr = null;
  while (Date.now() - t0 < timeoutMs) {
    try {
      const v = await page.eval(expr);
      if (v) return { value: v, elapsedMs: Date.now() - t0 };
    } catch (e) {
      lastErr = e;
    }
    await sleep(interval);
  }
  throw new Error(
    `timeout waiting for ${label} after ${timeoutMs}ms${lastErr ? ` (last error: ${String(lastErr.message).slice(0, 120)})` : ''}`
  );
}
