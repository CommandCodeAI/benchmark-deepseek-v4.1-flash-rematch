const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') errors.push(msg.type()+': '+msg.text()); });
  page.on('pageerror', err => errors.push('pageerror: ' + err.message));
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8500);
  console.log('gen/event', await page.evaluate(() => ({gen: window.__vitrine.app.sim.gen, events: window.__vitrine.app.sim.events.length, banner: document.getElementById('eventBanner').className})));
  await page.screenshot({ path: '/tmp/shot7-event.png' });
  const metrics = await page.evaluate(() => {
    const r = sel => { const el=document.querySelector(sel); const b=el.getBoundingClientRect(); return {y:+b.y.toFixed(0),bottom:+b.bottom.toFixed(0),h:+b.height.toFixed(0)}; };
    return { scrollH: document.documentElement.scrollHeight, apparatus: r('.apparatus'), timeline: r('.timeline'), console: r('.console'), chamber: r('.chamber') };
  });
  console.log(metrics);
  await page.evaluate(() => window.__vitrine.finish());
  await page.waitForTimeout(2300);
  await page.screenshot({ path: '/tmp/shot7-archive.png' });
  await page.screenshot({ path: '/tmp/shot7-archive-full.png', fullPage: true });
  console.log('errors', errors);
  await browser.close();
})();
