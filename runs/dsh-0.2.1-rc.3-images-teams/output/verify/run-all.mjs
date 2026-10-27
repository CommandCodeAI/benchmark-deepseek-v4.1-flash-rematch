#!/usr/bin/env node
// QA ORCHESTRATOR — runs engine + static + browser suites, then builds REPORT.md.
// Usage: node verify/run-all.mjs [--only=engine,static,browser] [--no-report]
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const onlyArg = args.find((a) => a.startsWith('--only='));
const only = onlyArg ? onlyArg.split('=')[1].split(',') : ['engine', 'static', 'browser'];
const skipReport = args.includes('--no-report');

const suites = {
  engine: join(HERE, 'engine.test.mjs'),
  static: join(HERE, 'static.test.mjs'),
  browser: join(HERE, 'browser.test.mjs'),
};

const results = {};
for (const name of only) {
  if (!suites[name]) continue;
  console.log(`\n######## RUN ${name.toUpperCase()} ########`);
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [suites[name]], { stdio: 'inherit', cwd: join(HERE, '..') });
  results[name] = { exitCode: r.status, ms: Date.now() - t0 };
}
console.log('\nSUITE SUMMARY', JSON.stringify(results));

if (!skipReport) {
  const r = spawnSync(process.execPath, [join(HERE, 'report.mjs'), '--write'], { stdio: 'inherit', cwd: join(HERE, '..') });
  if (r.status) process.exitCode = 1;
}
process.exitCode = Object.values(results).some((r) => r.exitCode) ? 1 : 0;
