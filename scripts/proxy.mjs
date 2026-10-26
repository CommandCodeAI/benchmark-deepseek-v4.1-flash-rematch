// Logging pass-through proxy for an OpenAI-compatible API.
// Usage: node proxy.mjs <port> <run-dir>
// Forwards every request to https://api.commandcode.ai unchanged, streams the
// response back unchanged, and records per request: timings, status, usage,
// errors (calls.ndjson) plus the full request and response bodies (bodies/).
import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import zlib from 'node:zlib'
import { createRequire } from 'node:module'
const { fetch, EnvHttpProxyAgent } = createRequire(import.meta.url)('undici')

const UPSTREAM = 'https://api.commandcode.ai'
const [port, dir] = process.argv.slice(2)
fs.mkdirSync(path.join(dir, 'bodies'), { recursive: true })
const log = fs.createWriteStream(path.join(dir, 'calls.ndjson'), { flags: 'a' })
const dispatcher = new EnvHttpProxyAgent({ bodyTimeout: 0, headersTimeout: 0 })
let seq = 0

const readBody = (req) =>
	new Promise((resolve, reject) => {
		const chunks = []
		req.on('data', (c) => chunks.push(c))
		req.on('end', () => resolve(Buffer.concat(chunks)))
		req.on('error', reject)
	})

const hasContent = (line) => {
	if (!line.startsWith('data:') || line.includes('[DONE]')) return false
	try {
		const d = JSON.parse(line.slice(5)).choices?.[0]?.delta
		return Boolean(d && (d.content || d.reasoning_content || d.reasoning || d.tool_calls))
	} catch {
		return false
	}
}

const usageOf = (line) => {
	if (!line.startsWith('data:') || line.includes('[DONE]')) return null
	try {
		return JSON.parse(line.slice(5)).usage ?? null
	} catch {
		return null
	}
}

const server = http.createServer(async (req, res) => {
	const id = String(++seq).padStart(5, '0')
	const rec = { id, tStart: Date.now(), method: req.method, path: req.url }
	const body = await readBody(req)
	fs.writeFileSync(path.join(dir, 'bodies', `${id}.req.gz`), zlib.gzipSync(body))
	try {
		const j = JSON.parse(body.toString() || '{}')
		Object.assign(rec, { model: j.model, stream: j.stream, effort: j.reasoning_effort, thinking: j.thinking, messages: j.messages?.length, reqBytes: body.length })
	} catch {}
	let clientGone = false
	res.on('close', () => {
		if (!res.writableFinished) clientGone = true
	})
	const headers = { ...req.headers }
	delete headers.host
	delete headers['content-length']
	delete headers['accept-encoding']
	const resChunks = []
	try {
		const up = await fetch(UPSTREAM + req.url, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body, dispatcher })
		rec.status = up.status
		rec.tHeaders = Date.now()
		const outHeaders = Object.fromEntries([...up.headers].filter(([k]) => !['content-encoding', 'content-length', 'transfer-encoding', 'connection'].includes(k)))
		res.writeHead(up.status, outHeaders)
		let tail = ''
		for await (const chunk of up.body) {
			const buf = Buffer.from(chunk)
			resChunks.push(buf)
			if (!clientGone) res.write(buf)
			const text = tail + buf.toString()
			const lines = text.split('\n')
			tail = lines.pop()
			for (const line of lines) {
				if (!rec.tFirst && hasContent(line)) rec.tFirst = Date.now()
				const u = usageOf(line)
				if (u) rec.usage = u
			}
		}
		if (tail && !rec.usage) {
			try { rec.usage = JSON.parse(tail).usage } catch {}
		}
		res.end()
	} catch (e) {
		rec.error = String(e?.cause?.code || e?.code || e?.message || e)
		if (!res.headersSent) res.writeHead(502, { 'content-type': 'application/json' })
		res.end(JSON.stringify({ error: { message: `proxy: ${rec.error}` } }))
	}
	rec.tEnd = Date.now()
	if (clientGone) rec.clientAborted = true
	const all = Buffer.concat(resChunks)
	rec.resBytes = all.length
	if (rec.status >= 400) rec.errorBody = all.toString().slice(0, 2000)
	fs.writeFileSync(path.join(dir, 'bodies', `${id}.res.gz`), zlib.gzipSync(all))
	log.write(JSON.stringify(rec) + '\n')
})
server.requestTimeout = 0
server.headersTimeout = 0
server.listen(Number(port), '127.0.0.1', () => console.log(`proxy ${port} -> ${UPSTREAM}`))
