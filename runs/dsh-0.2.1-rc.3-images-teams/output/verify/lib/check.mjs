// Tiny result recorder used by all verification suites.
// Each check carries an id, area, severity and human-readable evidence.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const SEVERITY = {
  BLOCKER: 'blocker',
  MAJOR: 'major',
  MINOR: 'minor',
  INFO: 'info',
};

export class Recorder {
  constructor(name) {
    this.name = name;
    this.results = [];
    this.startedAt = Date.now();
  }

  async check(id, description, fn, { area = '', severity = SEVERITY.MAJOR, optional = false } = {}) {
    const t0 = Date.now();
    try {
      const value = await fn();
      const detail =
        value == null
          ? ''
          : typeof value === 'string'
            ? value
            : JSON.stringify(value).slice(0, 900);
      this.results.push({
        id,
        area,
        description,
        status: 'PASS',
        severity,
        optional,
        detail,
        ms: Date.now() - t0,
      });
      return { ok: true, value };
    } catch (e) {
      const detail = (e && (e.stack || e.message)) || String(e);
      this.results.push({
        id,
        area,
        description,
        status: 'FAIL',
        severity,
        optional,
        detail: detail.split('\n').slice(0, 6).join(' | '),
        error: detail,
        ms: Date.now() - t0,
      });
      return { ok: false, error: e };
    }
  }

  note(id, description, detail, { area = '', severity = SEVERITY.INFO } = {}) {
    this.results.push({ id, area, description, status: 'NOTE', severity, detail, ms: 0 });
  }

  skip(id, description, reason, { area = '' } = {}) {
    this.results.push({ id, area, description, status: 'SKIP', severity: 'info', detail: reason, ms: 0 });
  }

  get summary() {
    const counts = { PASS: 0, FAIL: 0, NOTE: 0, SKIP: 0 };
    for (const r of this.results) counts[r.status] = (counts[r.status] || 0) + 1;
    const bySeverity = {};
    for (const r of this.results.filter((x) => x.status === 'FAIL')) {
      bySeverity[r.severity] = (bySeverity[r.severity] || 0) + 1;
    }
    return { ...counts, bySeverity, total: this.results.length, durationMs: Date.now() - this.startedAt };
  }

  failures() {
    return this.results.filter((r) => r.status === 'FAIL');
  }

  print() {
    const s = this.summary;
    console.log(`\n=== ${this.name} ===`);
    for (const r of this.results) {
      const mark = r.status === 'PASS' ? 'ok  ' : r.status === 'FAIL' ? 'FAIL' : r.status.toLowerCase();
      console.log(`[${mark}] ${r.id} ${r.description}${r.detail ? ` — ${String(r.detail).slice(0, 220)}` : ''}`);
    }
    console.log(
      `--- ${this.name}: ${s.PASS} pass, ${s.FAIL} fail, ${s.NOTE} note, ${s.SKIP} skip (${s.durationMs}ms)`
    );
    return s;
  }

  save(path) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({ suite: this.name, summary: this.summary, results: this.results, at: new Date().toISOString() }, null, 2)
    );
  }
}

export function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

export function assertEqual(actual, expected, msg) {
  if (actual !== expected) {
    throw new Error(`${msg || 'assertEqual'}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertClose(actual, expected, tol, msg) {
  if (!Number.isFinite(actual) || Math.abs(actual - expected) > tol) {
    throw new Error(`${msg || 'assertClose'}: expected ${expected}±${tol}, got ${actual}`);
  }
}

export function assertFiniteNumber(v, msg) {
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    throw new Error(`${msg || 'expected finite number'}: got ${JSON.stringify(v)}`);
  }
}
