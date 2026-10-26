// Renders a results card from a layout config.
// Usage: node card.mjs <layout.json> <out.png>
// layout: { title, sub, foot, orientation?: 'rows', columns: [{ title, model, tag, metrics, result?, unverified? }] }
// metrics is a path to a metrics.json (relative to the layout file). `result`
// overrides the Result cell for runs whose metrics carry no CLI result.
// orientation 'rows' puts one run per row, for tables with many runs.
// unverified runs are shown muted: never bold, never red, never counted as best.
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')

const [layoutFile, out] = process.argv.slice(2)
const layout = JSON.parse(fs.readFileSync(layoutFile, 'utf8'))
const resultOf = (c, m) => c.result ?? (m.result?.subtype === 'success' ? 'Success' : 'Failed')
const cols = layout.columns.map((c) => {
	const m = JSON.parse(fs.readFileSync(path.resolve(path.dirname(layoutFile), c.metrics), 'utf8'))
	return { ...c, m: { ...m, resultText: resultOf(c, m) } }
})

const fmtTime = (s) => {
	const h = Math.floor(s / 3600)
	const mm = Math.floor((s % 3600) / 60)
	const ss = String(Math.round(s % 60)).padStart(2, '0')
	if (!h) return `${mm}m ${ss}s`
	return `${h}h ${mm}m ${ss}s`
}
const n = (x) => Math.round(x).toLocaleString('en-US')
const failed = (m) => m.failedRequests + Object.values(m.errorEvents ?? {}).reduce((a, b) => a + b, 0)

// [label, value for display, number to rank by or null, lower is better]
const rows = [
	['Result', (m) => m.resultText, null],
	['Total time', (m) => fmtTime(m.totalSec), (m) => m.totalSec, true],
	['Failed calls', (m) => String(failed(m)), (m) => failed(m), true],
	['Avg TTFT', (m) => `${m.ttftAvg.toFixed(2)}s`, (m) => m.ttftAvg, true],
	['TTFT P50', (m) => `${m.ttftP50.toFixed(2)}s`, (m) => m.ttftP50, true],
	['TTFT P95', (m) => `${m.ttftP95.toFixed(2)}s`, (m) => m.ttftP95, true],
	['Throughput', (m) => `${Math.round(m.throughputTokS)} tok/s`, (m) => m.throughputTokS, false],
	['Cache hit', (m) => `${(m.cacheHit * 100).toFixed(1)}%`, null],
	['Output tokens', (m) => n(m.output), null],
	['Model requests', (m) => (m.requests == null ? '–' : n(m.requests)), null],
]

const isBad = (label, c) =>
	!c.unverified && ((label === 'Result' && c.m.resultText !== 'Success') || (label === 'Failed calls' && failed(c.m) > 0))
const canRank = (c) => !c.unverified && c.m.resultText === 'Success'

const cell = ([label, show, rank, lower], c) => {
	// Only verified runs that finished cleanly can be best: a run that died early is not the fastest.
	const vals = rank ? cols.filter(canRank).map((x) => rank(x.m)) : []
	const best = lower ? Math.min(...vals) : Math.max(...vals)
	const cls = [
		rank && canRank(c) && rank(c.m) === best ? 'best' : '',
		isBad(label, c) ? 'bad' : '',
		c.unverified ? 'unv' : '',
	].join(' ')
	return `<td class="${cls}">${show(c.m)}</td>`
}

const byRow = layout.orientation === 'rows'
const width = byRow ? 2000 : Math.max(1000, 260 + cols.length * 230)
const badge = (c) => (c.unverified ? ' <span class="u">unverified</span>' : '')
const runHead = (c) => `<span class="t">${c.title}${badge(c)}</span><span class="m">${c.model}</span><span class="g">${c.tag}</span>`
const table = byRow
	? `<tr><th>Run</th>${rows.map((r) => `<th>${r[0]}</th>`).join('')}</tr>
${cols.map((c) => `<tr><td class="run${c.unverified ? ' unv' : ''}">${runHead(c)}</td>${rows.map((r) => cell(r, c)).join('')}</tr>`).join('\n')}`
	: `<tr><th></th>${cols.map((c) => `<th class="${c.unverified ? 'unv' : ''}">${runHead(c)}</th>`).join('')}</tr>
${rows.map((r) => `<tr><td>${r[0]}</td>${cols.map((c) => cell(r, c)).join('')}</tr>`).join('\n')}`
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
*{box-sizing:border-box;margin:0}
body{width:${width}px;background:#0e0e0e;color:#e6e6e6;font-family:'DejaVu Sans',Arial,sans-serif;padding:56px 56px 44px}
h1{font-size:34px;font-weight:700;letter-spacing:-0.5px}
.sub{color:#8c8c8c;font-size:18px;margin:10px 0 40px}
table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th{text-align:right;vertical-align:bottom;padding:0 0 16px 16px;font-weight:400}
th:first-child,td:first-child{text-align:left;padding-left:0}
th .t{display:block;font-size:17px;font-weight:700;color:#fff}
th .m{display:block;font-size:15px;color:#cfcfcf;margin-top:3px}
th .g{display:block;font-size:13px;color:#7a7a7a;margin-top:3px}
td{text-align:right;padding:13px 0 13px 16px;border-top:1px solid #262626;font-size:19px;color:#a8a8a8}
td:first-child{color:#8c8c8c;font-size:17px}
td.best{color:#fff;font-weight:700}
td.bad{color:#ff6b6b}
td.unv,td.unv .t,td.unv .m,th.unv .t,th.unv .m{color:#5f5f5f}
.u{font-size:11px;font-weight:700;letter-spacing:0.5px;text-transform:uppercase;color:#d9a441;border:1px solid #6b5420;border-radius:3px;padding:1px 5px;vertical-align:2px}
td.run .t{display:block;font-size:16px;font-weight:700;color:#fff}
td.run .m{display:block;font-size:14px;color:#cfcfcf;margin-top:2px}
td.run .g{display:block;font-size:12px;color:#7a7a7a;margin-top:2px}
${byRow ? 'th{font-size:15px;color:#8c8c8c}td{font-size:17px;padding:11px 0 11px 14px}' : ''}
.foot{color:#6f6f6f;font-size:14px;line-height:1.7;margin-top:32px;border-top:1px solid #262626;padding-top:16px}
</style></head><body>
<h1>${layout.title}</h1>
<div class="sub">${layout.sub}</div>
<table>
${table}
</table>
<div class="foot">${layout.foot}</div>
</body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width, height: 600 }, deviceScaleFactor: 2 })
await page.setContent(html)
await page.screenshot({ path: out, fullPage: true })
await browser.close()
