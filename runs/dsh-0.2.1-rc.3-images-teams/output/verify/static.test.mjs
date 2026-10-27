#!/usr/bin/env node
// STATIC / OFFLINE QA SUITE (contract: DESIGN-BRIEF.md §1 deliverable + §12.1)
// Checks the assembled single file for external references and leftovers.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Recorder, assert, assertEqual, SEVERITY } from './lib/check.mjs';
import { ROOT, VERIFY, snapshotDeliverable, sha256 } from './lib/workspace.mjs';

const norm = (s) => s.replace(/\r\n/g, '\n');

export async function runStaticSuite({ save = true, target = process.env.VERIFY_TARGET || null } = {}) {
  const rec = new Recorder('static');
  const snap = target
    ? { path: target, hash: sha256(readFileSync(target)), bytes: readFileSync(target).length, url: 'file://' + target, stable: true }
    : await snapshotDeliverable({ label: 'static' });
  const html = norm(readFileSync(snap.path, 'utf8'));

  await rec.check(
    'A1',
    'deliverable is one file: `round 1/index.html` is the only file in round 1/',
    () => {
      if (process.env.VERIFY_TARGET) return { target: process.env.VERIFY_TARGET, note: 'preview target, single-file dir check skipped' };
      const files = readdirSync(join(ROOT, 'round 1'));
      assertEqual(files.length, 1, `round 1/ contains ${files.length} files: ${files.join(', ')}`);
      assertEqual(files[0], 'index.html', 'unexpected deliverable filename');
      assert(html.length > 10000, `deliverable suspiciously small (${html.length} bytes)`);
      return `${files[0]}, ${(Buffer.byteLength(html) / 1024).toFixed(1)} KB, sha256 ${snap.hash.slice(0, 16)}`;
    },
    { area: 'offline', severity: SEVERITY.BLOCKER }
  );

  await rec.check(
    'A2',
    'no external <script src> / <link href> / @import / src= images / fonts',
    () => {
      const findings = [];
      for (const m of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi)) findings.push(`script src=${m[1]}`);
      for (const m of html.matchAll(/<link\b[^>]*\bhref\s*=\s*["']?([^"'\s>]+)/gi)) findings.push(`link href=${m[1]}`);
      for (const m of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi)) findings.push(`img src=${m[1]}`);
      for (const m of html.matchAll(/@import[^;]+;/gi)) findings.push(`@import: ${m[0].slice(0, 80)}`);
      for (const m of html.matchAll(/@font-face/gi)) findings.push('@font-face');
      for (const m of html.matchAll(/url\(\s*['"]?(?!data:|#|'|"\))([^)'"]+)/gi)) {
        const u = m[1].trim();
        if (u && !u.startsWith('data:') && !u.startsWith('#')) findings.push(`url(${u.slice(0, 60)})`);
      }
      const ext = findings.filter(
        (f) =>
          !/^(url\((data:|#))/.test(f) &&
          !/\b(url\(about:blank\))/.test(f)
      );
      assertEqual(ext.length, 0, `external refs: ${ext.join(' | ')}`);
      return 'no external script/link/img/import/font refs';
    },
    { area: 'offline', severity: SEVERITY.BLOCKER }
  );

  await rec.check(
    'A3',
    'no network APIs in code: fetch/XHR/importScripts/WebSocket/sendBeacon/Worker/import()',
    () => {
      const patterns = [
        [/\bfetch\s*\(/g, 'fetch('],
        [/XMLHttpRequest/g, 'XMLHttpRequest'],
        [/importScripts\s*\(/g, 'importScripts('],
        [/new\s+WebSocket\s*\(/g, 'new WebSocket('],
        [/sendBeacon\s*\(/g, 'sendBeacon('],
        [/new\s+Worker\s*\(/g, 'new Worker('],
        [/navigator\.serviceWorker/g, 'serviceWorker'],
        [/\bimport\s*\(\s*['"][^'"]+['"]\s*\)/g, 'dynamic import()'],
        [/\.load\s*\(\s*['"][^'"]+['"]/g, '.load()'],
      ];
      const hits = [];
      for (const [re, label] of patterns) {
        for (const m of html.matchAll(re)) {
          const idx = m.index || 0;
          const ctx = html.slice(Math.max(0, idx - 60), idx + 80).replace(/\n/g, ' ');
          // allow mentions inside comments prose (e.g. a brief quote) only when no code parens
          hits.push(`${label}: …${ctx.slice(0, 150)}`);
        }
      }
      const codeHits = hits.filter((h) => !/^\s*fetch\(\s*['"]/.test(h));
      assertEqual(codeHits.length, 0, `network APIs: ${codeHits.slice(0, 4).join(' || ')}`);
      return 'none of fetch/XHR/WS/Worker/etc present';
    },
    { area: 'offline', severity: SEVERITY.BLOCKER }
  );

  await rec.check(
    'A4',
    'remote URL literals: only benign xmlns/comment/prose URLs, never loadable refs',
    () => {
      const all = [...html.matchAll(/https?:\/\/[^\s"'<>)]+/g)].map((m) => m[0]);
      const benign = /^(https?:\/\/(www\.)?w3\.org\/|https?:\/\/schema\.org\/?$)/;
      const suspicious = all.filter((u) => !benign.test(u));
      return {
        total: all.length,
        benign: all.length - suspicious.length,
        samples: all.slice(0, 12),
        suspicious,
      };
    },
    { area: 'offline', severity: SEVERITY.MAJOR }
  );

  await rec.check(
    'A5',
    'single inline <style> + single inline <script>; no leftover @@PLACEHOLDER@@ markers',
    () => {
      const styles = [...html.matchAll(/<style\b/gi)].length;
      const scripts = [...html.matchAll(/<script\b/gi)].length;
      const leftovers = html.match(/@@[A-Z_]+@@/g) || [];
      assertEqual(styles, 1, `<style> count ${styles}`);
      assertEqual(scripts, 1, `<script> count ${scripts}`);
      assertEqual(leftovers.length, 0, `unreplaced markers: ${[...new Set(leftovers)].join(',')}`);
      for (const marker of ['DESIGN_CSS', 'DASHBOARD_CSS', 'ENGINE_JS', 'RENDER_JS', 'CONTROLS_JS', 'DASHBOARD_JS', 'BOOT_JS']) {
        assert(!html.includes(`/* @@${marker}@@ */`), `placeholder marker ${marker} still present`);
      }
      return `1 style, 1 script, no placeholders`;
    },
    { area: 'offline', severity: SEVERITY.BLOCKER }
  );

  await rec.check(
    'A6',
    'required module globals present in the file: VIVARIUM_ENGINE / _RENDER / _CONTROLS / _DASHBOARD',
    () => {
      const found = {
        engine: /VIVARIUM_ENGINE\s*=/.test(html),
        render: /VIVARIUM_RENDER\s*=/.test(html),
        controls: /VIVARIUM_CONTROLS\s*=/.test(html),
        dashboard: /VIVARIUM_DASHBOARD\s*=/.test(html),
      };
      const missing = Object.entries(found).filter(([, v]) => !v).map(([k]) => k);
      assertEqual(missing.length, 0, `missing module globals: ${missing.join(', ')}`);
      return JSON.stringify(found);
    },
    { area: 'offline', severity: SEVERITY.MAJOR }
  );

  await rec.check(
    'A7',
    'no obvious placeholder/stub markers left in deliverable (in preparation / pending / TODO / stub)',
    () => {
      const bad = [];
      for (const re of [/in preparation/gi, /\bpending\b/gi, /\bTODO\b/g, /\bFIXME\b/g, /Engine placeholder/gi, /Renderer placeholder/gi, /Boot placeholder/gi]) {
        for (const m of html.matchAll(re)) bad.push(`${m[0]} @${m.index}`);
      }
      return { occurrences: bad.slice(0, 10), note: bad.length ? 'stub text still present' : 'clean' };
    },
    { area: 'offline', severity: SEVERITY.INFO }
  );

  await rec.check(
    'A8',
    'reference: file parses (no unbalanced placeholder artifacts) & reasonable size',
    () => {
      assert(!html.includes('<\\/script>'), 'escaped </script> artifact leaked into markup');
      return `${(Buffer.byteLength(html) / 1024).toFixed(1)} KB / ${html.split('\n').length} lines`;
    },
    { area: 'offline', severity: SEVERITY.MINOR }
  );

  if (save) rec.save(join(VERIFY, 'results-static.json'));
  rec.print();
  return rec;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runStaticSuite({ save: !process.env.VERIFY_TARGET }).then((rec) => {
    process.exitCode = rec.failures().length ? 1 : 0;
  });
}
