// Renders a results card from a layout config.
// Usage: node card.mjs <layout.json> <out.png>
// layout: { title, sub, foot, columns: [{ title, model, tag, metrics }] }
// metrics is a path to a metrics.json (relative to the layout file).
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
const { chromium } = createRequire(import.meta.url)('playwright')

const [layoutFile, out] = process.argv.slice(2)
const layout = JSON.parse(fs.readFileSync(layoutFile, 'utf8'))
const cols = layout.columns.map((c) => ({
	...c,
	m: JSON.parse(fs.readFileSync(path.resolve(path.dirname(layoutFile), c.metrics), 'utf8')),
}))

const fmtTime = (s) => {
	const h = Math.floor(s / 3600)
	const mm = Math.floor((s % 3600) / 60)
	const ss = String(Math.round(s % 60)).padStart(2, '0')
	if (!h) return `${mm}m ${ss}s`
	return `${h}h ${mm}m ${ss}s`
}
const n = (x) => Math.round(x).toLocaleString('en-US')
const failed = (m) => m.failedRequests + Object.values(m.errorEvents).reduce((a, b) => a + b, 0)

// [label, value for display, number to rank by or null, lower is better]
const rows = [
	['Result', (m) => (m.result?.subtype === 'success' ? 'Success' : 'Failed'), null],
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

const isBad = (label, m) =>
	(label === 'Result' && m.result?.subtype !== 'success') || (label === 'Failed calls' && failed(m) > 0)

const cell = ([label, show, rank, lower], c) => {
	const vals = rank ? cols.map((x) => rank(x.m)) : []
	const best = lower ? Math.min(...vals) : Math.max(...vals)
	const cls = [rank && rank(c.m) === best ? 'best' : '', isBad(label, c.m) ? 'bad' : ''].join(' ')
	return `<td class="${cls}">${show(c.m)}</td>`
}

const width = Math.max(1000, 260 + cols.length * 230)
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
.foot{color:#6f6f6f;font-size:14px;line-height:1.7;margin-top:32px;border-top:1px solid #262626;padding-top:16px}
</style></head><body>
<h1>${layout.title}</h1>
<div class="sub">${layout.sub}</div>
<table>
<tr><th></th>${cols.map((c) => `<th><span class="t">${c.title}</span><span class="m">${c.model}</span><span class="g">${c.tag}</span></th>`).join('')}</tr>
${rows.map((r) => `<tr><td>${r[0]}</td>${cols.map((c) => cell(r, c)).join('')}</tr>`).join('\n')}
</table>
<div class="foot">${layout.foot}</div>
</body></html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width, height: 600 }, deviceScaleFactor: 2 })
await page.setContent(html)
await page.screenshot({ path: out, fullPage: true })
await browser.close()
