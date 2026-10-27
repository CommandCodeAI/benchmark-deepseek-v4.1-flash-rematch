// Workspace helpers: stable snapshot of the evolving deliverable, hashes, paths.
import { readFileSync, writeFileSync, statSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const VERIFY = join(ROOT, 'verify');
export const SNAP_DIR = join(VERIFY, 'snapshots');
export const SHOTS = join(ROOT, 'shots');
export const DELIVERABLE = join(ROOT, 'round 1', 'index.html');

export const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function ensureDirs() {
  for (const d of [VERIFY, SNAP_DIR, SHOTS]) mkdirSync(d, { recursive: true });
}

// Poll the deliverable until two consecutive reads are byte-identical (or timeout),
// then save a stable snapshot under verify/snapshots. Returns metadata.
export async function snapshotDeliverable({ label = 'current', timeoutMs = 8000, interval = 120 } = {}) {
  ensureDirs();
  const deadline = Date.now() + timeoutMs;
  let prev = null;
  let stable = null;
  while (Date.now() < deadline) {
    let buf = null;
    try {
      buf = readFileSync(DELIVERABLE);
    } catch {
      await sleep(interval);
      continue;
    }
    if (prev && Buffer.compare(prev, buf) === 0) {
      stable = buf;
      break;
    }
    prev = buf;
    await sleep(interval);
  }
  const buf = stable || readFileSync(DELIVERABLE);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = join(SNAP_DIR, `${label}-${stamp}.html`);
  writeFileSync(file, buf);
  // prune old snapshots, keep 12 newest
  try {
    const olds = readdirSync(SNAP_DIR)
      .filter((f) => f.endsWith('.html'))
      .map((f) => ({ f, t: statSync(join(SNAP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    for (const { f } of olds.slice(12)) {
      try {
        unlinkSync(join(SNAP_DIR, f));
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return {
    path: file,
    url: 'file://' + file.split('/').map(encodeURIComponent).join('/'),
    bytes: buf.length,
    hash: sha256(buf),
    stable: !!stable,
    sourceMtime: statSync(DELIVERABLE).mtimeMs,
    at: new Date().toISOString(),
  };
}

export function readDeliverable() {
  return readFileSync(DELIVERABLE, 'utf8');
}

export function fileSize(p) {
  return statSync(p).size;
}

export function exists(p) {
  return existsSync(p);
}
