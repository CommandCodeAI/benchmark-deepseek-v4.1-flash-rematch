// Computes Round-1-style metrics from a timestamped Command Code NDJSON stream.
// Usage: node analyze.mjs <run-dir>
import fs from 'node:fs'
import path from 'node:path'

const dir = process.argv[2]
const start = Number(fs.readFileSync(path.join(dir, 'start'), 'utf8'))
const endFile = path.join(dir, 'end')
const lines = fs.readFileSync(path.join(dir, 'events.ndjson'), 'utf8').trim().split('\n').map((x) => JSON.parse(x))
const end = fs.existsSync(endFile) ? Number(fs.readFileSync(endFile, 'utf8')) : lines.at(-1).t

const CONTENT = new Set(['text_delta', 'thinking_delta', 'tool_call_delta', 'tool_input_delta', 'tool_queued', 'message_update'])
const reqs = []
const other = {}
let cur = null
let result = null
for (const { t, l } of lines) {
	let j
	try { j = JSON.parse(l) } catch { continue }
	if (j.type === 'result') { result = j; continue }
	const e = j.type === 'event' ? j.event : j
	if (e.type === 'model_request_start') {
		if (cur) reqs.push({ ...cur, failed: true })
		cur = { start: t, first: null, end: null }
	} else if (cur && !cur.first && (CONTENT.has(e.type) || e.type.endsWith('_delta'))) {
		cur.first = t
	} else if (e.type === 'model_request_end' && cur) {
		reqs.push({ ...cur, end: t, usage: e.usage, stop: e.stopReason })
		cur = null
	} else if (/error|retry|notice|fail/i.test(e.type) && !e.type.startsWith('tool_')) {
		other[e.type] = other[e.type] || []
		other[e.type].push(e)
	}
}
// An open request at the end only counts as failed once the run has exited.
if (cur && fs.existsSync(endFile)) reqs.push({ ...cur, failed: true })

const ok = reqs.filter((r) => !r.failed)
const sum = (xs, f) => xs.reduce((a, x) => a + f(x), 0)
const input = sum(ok, (r) => r.usage.inputTokens)
const cacheRead = sum(ok, (r) => r.usage.cacheReadTokens)
const cacheWrite = sum(ok, (r) => r.usage.cacheWriteTokens)
const output = sum(ok, (r) => r.usage.outputTokens)
const ttfts = ok.filter((r) => r.first).map((r) => (r.first - r.start) / 1000).sort((a, b) => a - b)
const pct = (p) => ttfts[Math.min(ttfts.length - 1, Math.floor(p * ttfts.length))]
const genSec = sum(ok.filter((r) => r.first), (r) => (r.end - r.first) / 1000)

const report = {
	totalSec: (end - start) / 1000,
	result: result ? { subtype: result.subtype, stopReason: result.stopReason } : null,
	requests: reqs.length,
	toolErrors: lines.filter(({ l }) => l.includes('"tool_errored"')).length,
	failedRequests: reqs.filter((r) => r.failed).length,
	errorEvents: Object.fromEntries(Object.entries(other).map(([k, v]) => [k, v.length])),
	errorSamples: Object.fromEntries(Object.entries(other).map(([k, v]) => [k, v.slice(0, 3)])),
	throughputTokS: output / genSec,
	ttftAvg: sum(ttfts, (x) => x) / ttfts.length,
	ttftP50: pct(0.5),
	ttftP95: pct(0.95),
	cacheHit: cacheRead / input,
	uncachedInput: input - cacheRead - cacheWrite,
	cachedInput: cacheRead,
	cacheWrite,
	output,
}
console.log(JSON.stringify(report, null, 2))
