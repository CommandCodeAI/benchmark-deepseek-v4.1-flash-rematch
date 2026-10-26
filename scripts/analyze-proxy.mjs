// Computes metrics from a run's proxy log (calls.ndjson), using the same
// definitions as analyze.mjs for the Command Code CLI runs.
// Usage: node analyze-proxy.mjs <run-dir>
import fs from 'node:fs'
import path from 'node:path'

const dir = process.argv[2]
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8').trim()
const start = Number(read('start'))
const done = fs.existsSync(path.join(dir, 'end'))
const calls = fs.existsSync(path.join(dir, 'proxy/calls.ndjson'))
	? read('proxy/calls.ndjson').split('\n').filter(Boolean).map((l) => JSON.parse(l))
	: []
const end = done ? Number(read('end')) : Date.now()

const failureOf = (c) => {
	if (c.error) return 'transport'
	// Some clients close the socket right after the final chunk; that is only a
	// failure when the response never completed (no usage block arrived).
	if (c.clientAborted && !c.usage) return 'client_abort'
	if (c.status >= 500) return 'server'
	if (c.status >= 400) return `http_${c.status}`
	// A 200 whose stream stopped before the usage block: cut off mid-generation.
	if (!c.usage) return 'truncated_stream'
	return null
}
const ok = calls.filter((c) => !failureOf(c) && c.usage)
const failed = calls.filter((c) => failureOf(c))
const byKind = {}
for (const c of failed) byKind[failureOf(c)] = (byKind[failureOf(c)] || 0) + 1

const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0)
const cachedOf = (u) => Math.max(u.prompt_tokens_details?.cached_tokens ?? 0, u.prompt_tokens_details?.cache_read_input_tokens ?? 0)
const input = sum(ok, (c) => c.usage.prompt_tokens)
const cached = sum(ok, (c) => cachedOf(c.usage))
const output = sum(ok, (c) => c.usage.completion_tokens)
const ttfts = ok.filter((c) => c.tFirst).map((c) => (c.tFirst - c.tStart) / 1000).sort((a, b) => a - b)
const pct = (p) => ttfts[Math.min(ttfts.length - 1, Math.floor(p * ttfts.length))]
const genSec = sum(ok.filter((c) => c.tFirst), (c) => (c.tEnd - c.tFirst) / 1000)

console.log(JSON.stringify({
	totalSec: (end - start) / 1000,
	finished: done,
	exit: fs.existsSync(path.join(dir, 'exit')) ? Number(read('exit')) : null,
	requests: calls.length,
	succeeded: ok.length,
	failedRequests: failed.length,
	failuresByKind: byKind,
	failureSamples: failed.slice(0, 5).map((c) => ({ id: c.id, status: c.status, error: c.error, clientAborted: c.clientAborted, body: c.errorBody?.slice(0, 300) })),
	throughputTokS: output / genSec,
	ttftAvg: sum(ttfts, (x) => x) / ttfts.length,
	ttftP50: pct(0.5),
	ttftP95: pct(0.95),
	cacheHit: cached / input,
	uncachedInput: input - cached,
	cachedInput: cached,
	output,
}, null, 2))
