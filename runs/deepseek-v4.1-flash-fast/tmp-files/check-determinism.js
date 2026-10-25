const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = []; const requests = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('request', r => requests.push(r.url()));
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.__vitrine.finish());
  await page.waitForTimeout(1800);
  const first = await page.evaluate(() => ({
    checksum: document.getElementById('metaChecksum').textContent,
    seed: document.getElementById('metaSeed').textContent,
    title: document.getElementById('archiveTitle').textContent,
    events: document.getElementById('metaEvents').textContent,
    gen: document.getElementById('metaHorizon').textContent,
    simChecksum: window.__vitrine.app.sim.checksum().toString(16)
  }));
  console.log('first', first);
  await page.click('#repeatBtn');
  await page.waitForTimeout(800);
  const state2 = await page.evaluate(() => ({gen: window.__vitrine.app.sim.gen, seed: window.__vitrine.app.sim.seed, archiveOpen: window.__vitrine.app.archiveOpen}));
  console.log('after repeat', state2);
  await page.evaluate(() => window.__vitrine.finish());
  await page.waitForTimeout(1800);
  const second = await page.evaluate(() => ({
    checksum: document.getElementById('metaChecksum').textContent,
    seed: document.getElementById('metaSeed').textContent,
    simChecksum: window.__vitrine.app.sim.checksum().toString(16)
  }));
  console.log('second', second, 'MATCH', first.simChecksum === second.simChecksum && first.checksum === second.checksum);
  console.log('requests', [...new Set(requests)]);
  console.log('errors', errors);
  // copy seed
  await page.evaluate(() => { document.getElementById('archive').scrollTop = 99999; });
  await page.click('#copySeed');
  await page.waitForTimeout(200);
  console.log('copy text', await page.evaluate(() => document.getElementById('copySeed').textContent));
  await browser.close();
})();
