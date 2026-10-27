// Minimal dependency-free Chrome DevTools Protocol driver for Node 24.
// Uses the built-in global WebSocket + fetch; launches headless Chrome with a
// unique profile/port per process. No npm packages required.
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import net from 'node:net';

export const CHROME =
  process.env.CHROME_BIN ||
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let launchCount = 0;

export async function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

const KEY_DEFS = {
  Tab: { code: 'Tab', vk: 9 },
  Enter: { code: 'Enter', vk: 13, text: '\r' },
  Escape: { code: 'Escape', vk: 27 },
  ' ': { code: 'Space', vk: 32, text: ' ' },
  ArrowLeft: { code: 'ArrowLeft', vk: 37 },
  ArrowUp: { code: 'ArrowUp', vk: 38 },
  ArrowRight: { code: 'ArrowRight', vk: 39 },
  ArrowDown: { code: 'ArrowDown', vk: 40 },
  Home: { code: 'Home', vk: 36 },
  End: { code: 'End', vk: 35 },
  PageUp: { code: 'PageUp', vk: 33 },
  PageDown: { code: 'PageDown', vk: 34 },
  g: { code: 'KeyG', vk: 71, text: 'g' },
  r: { code: 'KeyR', vk: 82, text: 'r' },
  d: { code: 'KeyD', vk: 68, text: 'd' },
  s: { code: 'KeyS', vk: 83, text: 's' },
  '?': { code: 'Slash', vk: 191, text: '?', modifiers: 8 },
  '0': { code: 'Digit0', vk: 48, text: '0' },
  '1': { code: 'Digit1', vk: 49, text: '1' },
  '2': { code: 'Digit2', vk: 50, text: '2' },
  '3': { code: 'Digit3', vk: 51, text: '3' },
  '4': { code: 'Digit4', vk: 52, text: '4' },
  '5': { code: 'Digit5', vk: 53, text: '5' },
  '6': { code: 'Digit6', vk: 54, text: '6' },
  '7': { code: 'Digit7', vk: 55, text: '7' },
  '8': { code: 'Digit8', vk: 56, text: '8' },
  '9': { code: 'Digit9', vk: 57, text: '9' },
};

export class PageSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.listeners = new Map(); // method -> [fn]
    this.events = []; // recent events for debugging
    this.consoleErrors = [];
    this.consoleWarnings = [];
    this.exceptions = [];
    this.logErrors = [];
    this.requests = [];
    this.failedRequests = [];
    this.ws = null;
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('WS connect timeout')), 15000);
      this.ws.addEventListener('open', () => {
        clearTimeout(t);
        resolve();
      });
      this.ws.addEventListener('error', (ev) => {
        clearTimeout(t);
        reject(new Error('WS error: ' + (ev?.message || 'unknown')));
      });
    });
    this.ws.addEventListener('message', (ev) => this._onMessage(ev.data));
    this.ws.addEventListener('close', () => {
      for (const [, p] of this.pending) p.reject(new Error('WS closed'));
      this.pending.clear();
    });
    return this;
  }

  _onMessage(raw) {
    let msg;
    try {
      msg = JSON.parse(typeof raw === 'string' ? raw : raw.toString());
    } catch {
      return;
    }
    if (msg.id != null) {
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else p.resolve(msg.result);
      }
      return;
    }
    if (!msg.method) return;
    this.events.push(msg);
    if (this.events.length > 4000) this.events.splice(0, 1000);
    this._absorb(msg);
    const ls = this.listeners.get(msg.method);
    if (ls) for (const fn of [...ls]) fn(msg.params, msg);
  }

  _absorb(msg) {
    const p = msg.params || {};
    switch (msg.method) {
      case 'Runtime.consoleAPICalled': {
        const text = (p.args || [])
          .map((a) =>
            a.value !== undefined ? String(a.value) : a.description || a.type || ''
          )
          .join(' ');
        const rec = { type: p.type, text, ts: Date.now() };
        if (p.type === 'error') this.consoleErrors.push(rec);
        else if (p.type === 'warning') this.consoleWarnings.push(rec);
        break;
      }
      case 'Runtime.exceptionThrown': {
        const d = p.exceptionDetails || {};
        this.exceptions.push({
          text: d.text || '',
          description: d.exception?.description || '',
          url: d.url,
          line: d.lineNumber,
          ts: Date.now(),
        });
        break;
      }
      case 'Log.entryAdded': {
        if (p.entry?.level === 'error') this.logErrors.push({ text: p.entry.text, source: p.entry.source, url: p.entry.url });
        break;
      }
      case 'Network.requestWillBeSent': {
        this.requests.push({ url: p.request?.url, type: p.type, method: p.request?.method });
        break;
      }
      case 'Network.loadingFailed': {
        this.failedRequests.push({ url: p.url, type: p.type, errorText: p.errorText, canceled: p.canceled });
        break;
      }
      default:
        break;
    }
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, []);
    this.listeners.get(method).push(fn);
    return () => {
      const arr = this.listeners.get(method) || [];
      const i = arr.indexOf(fn);
      if (i >= 0) arr.splice(i, 1);
    };
  }

  send(method, params = {}, timeoutMs = 20000) {
    if (!this.ws || this.ws.readyState !== 1) {
      return Promise.reject(new Error(`CDP socket not open for ${method}`));
    }
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout ${method} (${timeoutMs}ms)`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      try {
        this.ws.send(JSON.stringify({ id, method, params }));
      } catch (e) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(e);
      }
    });
  }

  waitEvent(method, timeoutMs = 20000, predicate = null) {
    return new Promise((resolve, reject) => {
      let off = null;
      const timer = setTimeout(() => {
        if (off) off();
        reject(new Error(`Timeout waiting for ${method}`));
      }, timeoutMs);
      off = this.on(method, (params) => {
        if (predicate && !predicate(params)) return;
        clearTimeout(timer);
        off();
        resolve(params);
      });
    });
  }

  async enable() {
    await this.send('Page.enable');
    await this.send('Runtime.enable');
    await this.send('Network.enable');
    await this.send('Log.enable');
    await this.send('Performance.enable').catch(() => {});
  }

  async navigate(url, { timeoutMs = 30000 } = {}) {
    const loaded = this.waitEvent('Page.loadEventFired', timeoutMs);
    const res = await this.send('Page.navigate', { url });
    if (res.errorText) throw new Error(`Navigation failed: ${res.errorText} -> ${url}`);
    await loaded;
    return res;
  }

  async eval(expression, { awaitPromise = true, returnByValue = true, timeoutMs = 20000 } = {}) {
    const res = await this.send(
      'Runtime.evaluate',
      {
        expression,
        awaitPromise,
        returnByValue,
        userGesture: true,
        includeCommandLineAPI: false,
        replMode: false,
      },
      timeoutMs
    );
    if (res.exceptionDetails) {
      const d = res.exceptionDetails;
      throw new Error(
        `page eval threw: ${d.exception?.description || d.text || 'unknown'}\n expr: ${expression.slice(0, 240)}`
      );
    }
    return res.result?.value;
  }

  async setViewport(width, height, dsf = 1) {
    await this.send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: dsf,
      mobile: false,
    });
  }

  async setReducedMotion() {
    await this.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    });
  }

  async key(k, { modifiers = null, type = null } = {}) {
    const d = KEY_DEFS[k];
    if (!d) throw new Error(`unknown key ${k}`);
    const mods = modifiers == null ? (d.modifiers || 0) : modifiers;
    if (type === 'char' || (d.text !== undefined && !type)) {
      await this.send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: k,
        code: d.code,
        text: d.text,
        windowsVirtualKeyCode: d.vk,
        nativeVirtualKeyCode: d.vk,
        modifiers: mods,
      });
    } else {
      await this.send('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        key: k,
        code: d.code,
        windowsVirtualKeyCode: d.vk,
        nativeVirtualKeyCode: d.vk,
        modifiers: mods,
      });
    }
    await this.send('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: k,
      code: d.code,
      windowsVirtualKeyCode: d.vk,
      nativeVirtualKeyCode: d.vk,
      modifiers: mods,
    });
  }

  async typeChar(ch) {
    await this.send('Input.dispatchKeyEvent', { type: 'keyDown', text: ch, key: ch });
    await this.send('Input.dispatchKeyEvent', { type: 'keyUp', key: ch });
  }

  async insertText(text) {
    await this.send('Input.insertText', { text });
  }

  async pressTab() {
    await this.key('Tab');
    await sleep(60);
  }

  async mouseMove(x, y) {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
  }

  async click(x, y, { button = 'left', clickCount = 1 } = {}) {
    await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount });
    await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount });
  }

  async clickSelector(selector) {
    const r = await this.eval(`(() => {
      const el = document.querySelector(${JSON.stringify(selector)});
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height };
    })()`);
    if (!r) throw new Error(`selector not found: ${selector}`);
    await this.click(r.x, r.y);
    return r;
  }

  async screenshot(path) {
    const { data } = await this.send(
      'Page.captureScreenshot',
      { format: 'png', fromSurface: true, captureBeyondViewport: false },
      30000
    );
    writeFileSync(path, Buffer.from(data, 'base64'));
    return path;
  }

  async closeTarget() {
    try {
      await this.send('Page.close', {}, 3000);
    } catch {
      /* ignore */
    }
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }

  async close() {
    await this.closeTarget();
  }
}

export class ChromeBrowser {
  constructor(proc, port, profile, width, height, initialTarget = null) {
    this.proc = proc;
    this.port = port;
    this.profile = profile;
    this.width = width;
    this.height = height;
    this.pages = [];
    this.initialTarget = initialTarget;
    this.initialTargetUsed = false;
  }

  async newPage({ width = this.width, height = this.height, reducedMotion = false } = {}) {
    let wsUrl;
    if (this.initialTarget && !this.initialTargetUsed) {
      this.initialTargetUsed = true;
      wsUrl = this.initialTarget.webSocketDebuggerUrl;
    } else {
      const res = await fetch(`http://127.0.0.1:${this.port}/json/new?about:blank`, { method: 'PUT' });
      if (!res.ok) throw new Error(`Chrome /json/new failed: ${res.status}`);
      const target = await res.json();
      wsUrl = target.webSocketDebuggerUrl;
    }
    const page = new PageSession(wsUrl);
    await page.connect();
    await page.enable();
    await page.setViewport(width, height);
    if (reducedMotion) await page.setReducedMotion();
    await page.send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
    try { await page.send('Page.bringToFront', {}, 4000); } catch { /* ignore */ }
    this.pages.push(page);
    return page;
  }

  async close() {
    for (const p of this.pages) {
      try {
        await p.closeTarget();
      } catch {
        /* ignore */
      }
    }
    try {
      this.proc.kill('SIGKILL');
    } catch {
      /* ignore */
    }
    await sleep(120);
    try {
      rmSync(this.profile, { recursive: true, force: true, maxRetries: 3 });
    } catch {
      /* ignore */
    }
  }
}

export async function launchChrome(opts = {}) {
  const width = opts.width || 1440;
  const height = opts.height || 900;
  const port = await findFreePort();
  const profile = mkdtempSync(join(tmpdir(), `chrome-verify-${process.pid}-${++launchCount}-`));
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    `--window-size=${width},${height}`,
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-component-update',
    '--disable-sync',
    '--disable-default-apps',
    '--mute-audio',
    '--metrics-recording-only',
    '--allow-file-access-from-files',
    '--disable-features=Translate,OptimizationHints,MediaRouter,IsolateOrigins,site-per-process',
    ...(opts.args || []),
    'about:blank',
  ];
  const proc = spawn(CHROME, args, { stdio: ['ignore', 'ignore', 'ignore'] });
  const deadline = Date.now() + 25000;
  let version = null;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) {
        version = await r.json();
        break;
      }
    } catch {
      /* retry */
    }
    if (proc.exitCode != null) break;
    await sleep(120);
  }
  if (!version) {
    try {
      proc.kill('SIGKILL');
    } catch {
      /* ignore */
    }
    throw new Error('Chrome failed to start (check CHROME_BIN / flags)');
  }
  let initialTarget = null;
  try {
    const listRes = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (listRes.ok) {
      const list = await listRes.json();
      initialTarget = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl) || null;
    }
  } catch {
    /* ignore */
  }
  return new ChromeBrowser(proc, port, profile, width, height, initialTarget);
}

// Convenience: open a page, navigate, collect errors, return page handle.
export async function openPage(browser, url, { width, height, reducedMotion = false } = {}) {
  const page = await browser.newPage({ width, height, reducedMotion });
  await page.navigate(url);
  return page;
}
