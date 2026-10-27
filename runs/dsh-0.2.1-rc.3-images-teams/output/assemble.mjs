#!/usr/bin/env node
// Assembles the single-file deliverable from src/ modules.
// Usage: node assemble.mjs [--out path/to/index.html] [--quiet]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const quiet = args.includes('--quiet');
const out = outIdx >= 0 ? args[outIdx + 1] : 'round 1/index.html';

const root = resolve('.');
const read = (p) => readFile(resolve(root, p), 'utf8');

const [shell, designCss, dashboardCss, engine, render, controls, dashboard, boot] = await Promise.all([
  read('src/shell.html'),
  read('src/design.css').catch(() => ''),
  read('src/dashboard.css').catch(() => ''),
  read('src/engine.js').catch(() => '/* engine pending */'),
  read('src/render.js').catch(() => '/* renderer pending */'),
  read('src/controls.js').catch(() => '/* controls pending */'),
  read('src/dashboard.js').catch(() => '/* dashboard pending */'),
  read('src/boot.js').catch(() => '/* boot pending */'),
]);

const replacements = {
  '/* @@DESIGN_CSS@@ */': designCss,
  '/* @@DASHBOARD_CSS@@ */': dashboardCss,
  '/* @@ENGINE_JS@@ */': engine,
  '/* @@RENDER_JS@@ */': render,
  '/* @@CONTROLS_JS@@ */': controls,
  '/* @@DASHBOARD_JS@@ */': dashboard,
  '/* @@BOOT_JS@@ */': boot,
};

let html = shell;
for (const [marker, code] of Object.entries(replacements)) {
  if (!html.includes(marker)) throw new Error(`Marker missing from shell: ${marker}`);
  html = html.split(marker).join(code.replace(/<\/script>/gi, '<\\/script>'));
}

const leftovers = html.match(/@@[A-Z_]+@@/g);
if (leftovers) throw new Error(`Unreplaced markers: ${[...new Set(leftovers)].join(', ')}`);

await mkdir(dirname(resolve(root, out)), { recursive: true });
await writeFile(resolve(root, out), html, 'utf8');
if (!quiet) {
  const bytes = Buffer.byteLength(html);
  console.log(`assembled ${out} — ${(bytes / 1024).toFixed(1)} KB (${html.split('\n').length} lines)`);
}
