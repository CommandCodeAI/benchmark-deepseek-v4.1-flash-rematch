// One status line across all runs: node status.mjs <bench-dir> <run>...
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
const [dir, ...runs] = process.argv.slice(2)
const parts = runs.map((r) => {
	const d = JSON.parse(execFileSync('node', [`${dir}/analyze-proxy.mjs`, `${dir}/${r}`]).toString())
	const files = fs.readdirSync(`${dir}/${r}/work`).filter((f) => f !== '.git').length
	const state = d.finished ? `exit ${d.exit}` : 'running'
	return `${r}: ${Math.floor(d.totalSec / 60)}m ${state}, ${d.requests} req, ${d.failedRequests} failed, ${files} files`
})
console.log(parts.join(' | '))
