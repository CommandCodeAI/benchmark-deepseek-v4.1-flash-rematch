#!/usr/bin/env node
/* chart-cdp.mjs — throwaway CDP driver for dashboard development.
   Usage: node shots/chart-cdp.mjs --url file://... --out shots/chart-x.png [--wait 1200]
          [--width 1440] [--height 900] [--eval "expr"] [--dpr 1]
   Prints console logs / page errors / exceptions. No npm packages. */
import { spawn } from 'node:child_process';
import { writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);
function arg(name, def) {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
}
const url = arg('url');
const out = arg('out');
const width = Number(arg('width', '1440'));
const height = Number(arg('height', '900'));
const dpr = Number(arg('dpr', '1'));
const waitMs = Number(arg('wait', '1200'));
const evalExpr = arg('eval');
const afterWait = Number(arg('afterwait', '400'));
const resizeAfter = arg('resize-after');
const port = Number(arg('port', String(9300 + Math.floor(Math.random() * 600))));
if (!url) { console.error('missing --url'); process.exit(2); }

const CHROME = process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = await mkdtemp(join(tmpdir(), 'chart-cdp-'));
const child = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
  '--disable-background-networking', '--disable-extensions', '--mute-audio',
  '--disable-crash-reporter', '--disable-breakpad',
  `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  `--window-size=${width},${height}`, `--force-device-scale-factor=${dpr}`,
  'about:blank'
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(path) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method: path.startsWith('/json/new') ? 'PUT' : 'GET' });
  return res.json();
}
let ws;
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { await getJson('/json/version'); ready = true; break; } catch { await sleep(100); }
  }
  if (!ready) throw new Error('chrome devtools did not start');
  const target = await getJson('/json/new?about:blank');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const logs = [];
  const errors = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args || []).map((a) => a.value !== undefined ? String(a.value) : (a.description || a.type)).join(' ');
      logs.push(`[console.${msg.params.type}] ${text}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      errors.push(`[exception] ${d.text} ${d.exception?.description || ''}`.trim());
    } else if (msg.method === 'Log.entryAdded') {
      const e = msg.params.entry;
      if (e.level === 'error' || e.level === 'warning') logs.push(`[log.${e.level}] ${e.text}`);
    }
  };
  const send = (method, params = {}) => new Promise((res) => {
    const mid = ++id;
    pending.set(mid, res);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: dpr, mobile: false });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await send('Page.navigate', { url });
  await sleep(waitMs);
  if (evalExpr) {
    const r = await send('Runtime.evaluate', { expression: evalExpr, awaitPromise: true, returnByValue: true });
    if (r.result?.result) console.log('eval:', JSON.stringify(r.result.result.value ?? r.result.result.description));
    if (r.result?.exceptionDetails) console.log('eval error:', r.result.exceptionDetails.text);
    await sleep(afterWait);
  }
  if (resizeAfter) {
    const [rw, rh] = resizeAfter.split('x').map(Number);
    await send('Emulation.setDeviceMetricsOverride', { width: rw, height: rh, deviceScaleFactor: dpr, mobile: false });
    await sleep(900);
    const m2 = await send('Runtime.evaluate', {
      expression: `JSON.stringify({w:innerWidth,h:innerHeight,pop:[document.getElementById('chart-pop').width,document.getElementById('chart-pop').height],popRect:[document.getElementById('chart-pop').getBoundingClientRect().width,document.getElementById('chart-pop').getBoundingClientRect().height],traits:[document.getElementById('chart-traits').width,document.getElementById('chart-traits').height],traitsRect:[document.getElementById('chart-traits').getBoundingClientRect().width,document.getElementById('chart-traits').getBoundingClientRect().height]})`,
      returnByValue: true
    });
    console.log('after-resize:', m2.result?.result?.value);
  }
  if (out) {
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    await writeFile(resolve(out), Buffer.from(shot.result.data, 'base64'));
    console.log('wrote', out);
  }
  const metrics = await send('Runtime.evaluate', {
    expression: `JSON.stringify({w:innerWidth,h:innerHeight,dpr:devicePixelRatio,scrollH:document.documentElement.scrollHeight,scrollW:document.documentElement.scrollWidth, title:document.title})`,
    returnByValue: true
  });
  console.log('page:', metrics.result?.result?.value);
  for (const l of logs) console.log(l);
  for (const e of errors) console.log(e);
} finally {
  try { ws && ws.close(); } catch {}
  try { child.kill('SIGKILL'); } catch {}
  await sleep(200);
  try { await rm(profile, { recursive: true, force: true }); } catch {}
}
