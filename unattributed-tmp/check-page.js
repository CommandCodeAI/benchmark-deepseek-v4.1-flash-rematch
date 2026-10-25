const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error' || msg.type() === 'warning') errors.push(msg.type()+': '+msg.text()); });
  page.on('pageerror', err => errors.push('pageerror: ' + err.message));
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2500);
  const metrics = await page.evaluate(() => {
    const r = (sel) => { const el = document.querySelector(sel); if (!el) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), bottom: +b.bottom.toFixed(1) }; };
    const c = document.querySelector('#consoleBody');
    return {
      viewport: { w: innerWidth, h: innerHeight, scrollH: document.documentElement.scrollHeight },
      masthead: r('.masthead'), apparatus: r('.apparatus'), chamber: r('.chamber'), glass: r('.glass'), console: r('.console'), consoleBody: r('#consoleBody'), consoleFoot: r('.console-foot'),
      legend: r('.legend'), fontLoaded: document.fonts.check('16px "Bitstream Charter"') + '/' + document.fonts.check('12px "JetBrains Mono"'),
      sim: { gen: window.__vitrine.app.sim.gen, tick: window.__vitrine.app.sim.tick, prey: window.__vitrine.app.sim.preyAlive, pred: window.__vitrine.app.sim.predAlive },
      simFont: getComputedStyle(document.querySelector('.control-label')).fontFamily,
      simSize: getComputedStyle(document.querySelector('.control-label')).fontSize,
    };
  });
  console.log(JSON.stringify(metrics, null, 2));
  console.log('ERRORS', errors);
  await page.screenshot({ path: '/tmp/shot-desktop-full.png', fullPage: true });
  await browser.close();
})();
