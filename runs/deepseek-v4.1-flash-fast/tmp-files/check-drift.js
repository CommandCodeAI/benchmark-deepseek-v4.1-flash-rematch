const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.evaluate(() => window.__vitrine.finish());
  await page.waitForTimeout(1800);
  await page.evaluate(() => { document.getElementById('archive').scrollTop = 760; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: '/tmp/shot8-drift.png' });
  const info = await page.evaluate(() => ({
    archiveScroll: document.getElementById('archive').scrollTop,
    archiveHeight: document.getElementById('archive').scrollHeight,
    rescue: document.getElementById('rescueNote').textContent,
    driftHeight: document.getElementById('driftWrap').getBoundingClientRect().height,
    driftText: document.getElementById('driftSummary').textContent.slice(0,300),
    censusText: document.getElementById('censusSummary').textContent.slice(0,300)
  }));
  console.log(JSON.stringify(info, null, 2));
  console.log('errors', errors);
  await browser.close();
})();
