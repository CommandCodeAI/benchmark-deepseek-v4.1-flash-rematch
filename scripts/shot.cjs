const { chromium } = require('playwright')
const [file, prefix] = process.argv.slice(2)
;(async () => {
  const b = await chromium.launch()
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } })
  const errs = []
  p.on('pageerror', (e) => errs.push(e.message))
  p.on('console', (m) => m.type() === 'error' && errs.push(m.text()))
  p.on('request', (r) => !r.url().startsWith('file:') && !r.url().startsWith('data:') && errs.push('NETWORK ' + r.url()))
  await p.goto('file://' + file)
  for (const s of [3, 30, 120]) {
    await p.waitForTimeout((s - (s === 3 ? 0 : s === 30 ? 3 : 30)) * 1000)
    await p.screenshot({ path: `${prefix}-${s}s.png` })
  }
  console.log('errors:', JSON.stringify(errs.slice(0, 10)))
  await b.close()
})()
