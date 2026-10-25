const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const vp of [{w:320,h:568,name:'320'},{w:720,h:450,name:'zoom200'}]) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, hasTouch: true });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1800);
    const info = await page.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
      collapsed: document.getElementById('console').classList.contains('is-collapsed'),
      app: document.querySelector('.apparatus').getBoundingClientRect().toJSON(),
      glass: document.getElementById('glass').getBoundingClientRect().toJSON(),
      titleSize: getComputedStyle(document.querySelector('h1')).fontSize,
      legend: document.querySelector('.legend').getBoundingClientRect().height
    }));
    console.log(vp.name, info, errors);
    await page.screenshot({ path: `/tmp/shot13-${vp.name}.png` });
    await page.evaluate(() => window.__vitrine.finish());
    await page.waitForTimeout(1800);
    await page.screenshot({ path: `/tmp/shot13-${vp.name}-archive.png` });
    await page.close();
  }
  // reduced motion
  const rm = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
  const errs = []; rm.on('pageerror', e => errs.push(e.message));
  await rm.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle' });
  await rm.waitForTimeout(1200);
  console.log('reduced motion', await rm.evaluate(() => ({sheen: getComputedStyle(document.querySelector('.glass-sheen'), '::after').display, tick: window.__vitrine.app.sim.tick})), errs);
  await rm.close();
  await browser.close();
})();
