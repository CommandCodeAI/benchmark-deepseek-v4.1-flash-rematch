// Breaks a Provider API run down by agent and by screenshots in context, using
// the same failure and TTFT definitions as analyze-proxy.mjs.
// Usage: node images-in-context.mjs <run-dir>
// Needs <run-dir>/proxy/calls.ndjson and the request bodies extracted to
// <run-dir>/proxy/requests/ (zstd -d --long=31 requests.tar.zst; tar -xf requests.tar -C requests).
import fs from 'node:fs'
import path from 'node:path'

const dir = process.argv[2]
const read = (f) => fs.readFileSync(path.join(dir, f), 'utf8').trim()
const start = Number(read('start'))
const calls = read('proxy/calls.ndjson').split('\n').filter(Boolean).map((l) => JSON.parse(l))

const failed = (c) => Boolean(c.error) || c.status >= 400 || !c.usage
const ttftOf = (c) => (c.tFirst ? (c.tFirst - c.tStart) / 1000 : null)
const pct = (xs, p) => {
	const s = [...xs].sort((a, b) => a - b)
	return s.length ? s[Math.min(s.length - 1, Math.floor(p * s.length))] : null
}

// One agent per distinct first user message: the prompt for the lead, the
// spawn task for each teammate, the title prompt for the session-title call.
const agents = new Map()
const rows = calls.map((c) => {
	const body = JSON.parse(read(`proxy/requests/${c.id}.req.json`))
	const first = body.messages.find((m) => m.role === 'user')
	const key = JSON.stringify(first?.content ?? null).slice(0, 400)
	if (!agents.has(key)) agents.set(key, { name: `A${agents.size}`, startMin: (c.tStart - start) / 60000, prompt: key.slice(0, 100) })
	const images = body.messages.reduce(
		(n, m) => n + (Array.isArray(m.content) ? m.content.filter((p) => p.type === 'image_url').length : 0),
		0,
	)
	return { id: c.id, agent: agents.get(key).name, min: (c.tStart - start) / 60000, images, mb: c.reqBytes / 1e6, failed: failed(c), ttft: ttftOf(c), status: c.status, error: c.error }
})

const max = (xs) => xs.reduce((a, x) => Math.max(a, x), 0)
const buckets = [[0, 0, '0'], [1, 5, '1-5'], [6, 10, '6-10'], [11, 20, '11-20'], [21, Infinity, '21+']]

console.log(JSON.stringify({
	requests: rows.length,
	failed: rows.filter((r) => r.failed).length,
	maxImagesPerRequest: max(rows.map((r) => r.images)),
	maxRequestMB: Number(max(rows.map((r) => r.mb)).toFixed(1)),
	agents: [...agents.values()].map((a) => {
		const rs = rows.filter((r) => r.agent === a.name)
		return {
			...a,
			startMin: Number(a.startMin.toFixed(1)),
			requests: rs.length,
			failed: rs.filter((r) => r.failed).length,
			maxImages: max(rs.map((r) => r.images)),
			maxMB: Number(max(rs.map((r) => r.mb)).toFixed(1)),
		}
	}),
	byImagesInContext: buckets.map(([lo, hi, label]) => {
		const rs = rows.filter((r) => r.images >= lo && r.images <= hi)
		const ttfts = rs.filter((r) => !r.failed && r.ttft !== null).map((r) => r.ttft)
		return { images: label, requests: rs.length, failed: rs.filter((r) => r.failed).length, ttftP50: pct(ttfts, 0.5), ttftP95: pct(ttfts, 0.95) }
	}),
	failures: rows.filter((r) => r.failed).map((r) => ({ id: r.id, min: Number(r.min.toFixed(1)), agent: r.agent, images: r.images, mb: Number(r.mb.toFixed(1)), status: r.status, error: r.error })),
}, null, 2))
