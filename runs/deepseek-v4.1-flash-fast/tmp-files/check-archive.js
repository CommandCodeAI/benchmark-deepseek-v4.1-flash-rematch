const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') errors.push(msg.type()+': '+msg.text()); });
  page.on('pageerror', err => errors.push('pageerror: ' + err.message));
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.__vitrine.finish());
  await page.waitForTimeout(2200);
  console.log('archive open:', await page.evaluate(() => !document.getElementById('archive').hidden && document.getElementById('archive').classList.contains('is-open')));
  console.log('errors:', errors);
  const m = await page.evaluate(() => {
    const r = sel => { const el = document.querySelector(sel); const b = el.getBoundingClientRect(); return {x:+b.x.toFixed(0),y:+b.y.toFixed(0),w:+b.width.toFixed(0),h:+b.height.toFixed(0)}; };
    return {
      scrollH: document.getElementById('archive').scrollHeight,
      census: r('#censusChart'), drift: r('#driftChart'), snapshot: r('#archiveWorld'),
      title: document.getElementById('archiveTitle').textContent,
      dek: document.getElementById('archiveDek').textContent,
      verdict: document.getElementById('verdictLine').textContent,
      events: document.getElementById('eventLog').textContent.trim().slice(0,200),
      meta: document.getElementById('metaChecksum').textContent
    };
  });
  console.log(JSON.stringify(m, null, 2));
  await page.screenshot({ path: '/tmp/shot-archive.png', fullPage: false });
  await page.screenshot({ path: '/tmp/shot-archive-full.png', fullPage: true });
  await browser.close();
})();
