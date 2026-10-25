const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; const reqs = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => reqs.push(r.url()));
  const path = 'file:///work/bench/deepseek-v4.1-flash-fast/work/index.html';
  await page.goto(path, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  console.log('file load', await page.evaluate(() => ({gen: window.__vitrine.app.sim.gen, prey: window.__vitrine.app.sim.preyAlive, tick: window.__vitrine.app.sim.tick})));
  await page.evaluate(() => window.__vitrine.finish());
  await page.waitForTimeout(1800);
  console.log('archive', await page.evaluate(() => ({open: !document.getElementById('archive').hidden, title: document.getElementById('archiveTitle').textContent, checksum: document.getElementById('metaChecksum').textContent})));
  console.log('requests', [...new Set(reqs)]); console.log('errors', errors);
  await browser.close();
})();
