// Engine loading + shared engine assertions (DOM-free, vm sandbox).
// Works for src/engine.js now and for any extracted copy of the engine.
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

export function loadEngineSource(code, { filename = 'engine.js' } = {}) {
  const win = {};
  const sandbox = {
    console,
    window: win,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    performance: { now: () => Number(process.hrtime.bigint() / 1000000n) },
  };
  sandbox.globalThis = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(code, ctx, { filename, timeout: 30000 });
  const Engine = win.VIVARIUM_ENGINE || sandbox.VIVARIUM_ENGINE;
  return { Engine, sandbox, win, ctx };
}

export function loadEngineFromFile(path) {
  const code = readFileSync(path, 'utf8');
  return { code, ...loadEngineSource(code, { filename: path }) };
}

// Deep-clone a config so tests cannot share object identity.
export const cfg = (over = {}) => ({ ...over });

export function requireFns(E, names) {
  const missing = names.filter((n) => typeof E[n] !== 'function');
  if (missing.length) throw new Error(`engine missing functions: ${missing.join(', ')}`);
}

export function validateHistoryEntry(entry, geneKeys, speciesKeys, where) {
  if (!entry || typeof entry !== 'object') throw new Error(`${where}: entry not object`);
  if (!Number.isInteger(entry.gen) || entry.gen < 0) throw new Error(`${where}: bad gen ${entry.gen}`);
  if (!entry.counts) throw new Error(`${where}: missing counts`);
  for (const sp of speciesKeys) {
    const c = entry.counts[sp];
    if (!Number.isInteger(c) || c < 0) throw new Error(`${where}: counts.${sp}=${c} not a non-negative integer`);
  }
  if (!entry.traits) throw new Error(`${where}: missing traits`);
  for (const sp of speciesKeys) {
    const t = entry.traits[sp];
    // Extinction is legal: an absent species has no trait distribution, so
    // null (or all-null gene stats) is acceptable exactly when count === 0.
    const extinct = entry.counts[sp] === 0;
    if (t == null) {
      if (!extinct) throw new Error(`${where}: traits.${sp} missing while count>0`);
      continue;
    }
    for (const g of geneKeys) {
      const s = t[g];
      if (s == null) {
        if (!extinct) throw new Error(`${where}: traits.${sp}.${g} missing while count>0`);
        continue;
      }
      if (s.mean == null && extinct) continue; // empty species: all-null gene stats tolerated
      for (const f of ['mean', 'sd', 'min', 'max']) {
        if (!Number.isFinite(s[f])) throw new Error(`${where}: traits.${sp}.${g}.${f}=${s[f]} not finite`);
      }
      if (s.sd < -1e-9) throw new Error(`${where}: negative sd ${s.sd}`);
      if (s.min > s.max + 1e-9) throw new Error(`${where}: min>max for ${sp}.${g}`);
      if (s.mean < s.min - 1e-6 || s.mean > s.max + 1e-6) {
        // tolerate tiny float drift only
        const slack = Math.max(1e-6, (s.max - s.min) * 1e-6);
        if (s.mean < s.min - slack || s.mean > s.max + slack) {
          throw new Error(`${where}: mean ${s.mean} outside [${s.min},${s.max}] for ${sp}.${g}`);
        }
      }
    }
  }
  if (!Number.isInteger(entry.mutations) || entry.mutations < 0) {
    throw new Error(`${where}: mutations=${entry.mutations} not a non-negative integer`);
  }
  if (!Number.isFinite(entry.diversity) || entry.diversity < 0) {
    throw new Error(`${where}: diversity=${entry.diversity} not finite >=0`);
  }
  if (entry.event != null && !['drought', 'plague', 'wildfire'].includes(entry.event)) {
    throw new Error(`${where}: bad event ${entry.event}`);
  }
}

export function validateSnapshot(snap, where = 'snapshot') {
  if (!snap || typeof snap !== 'object') throw new Error(`${where}: not an object`);
  const json = JSON.stringify(snap);
  if (json.length < 10) throw new Error(`${where}: suspiciously empty`);
  if (json.includes('function')) throw new Error(`${where}: snapshot leaks functions (not plain state)`);
  return snap;
}
