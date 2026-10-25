const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', m => { if (m.type()==='error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  // tooltip
  await page.hover('#mutation');
  await page.waitForTimeout(350);
  console.log('tooltip', await page.evaluate(() => {
    const tip = document.querySelector('#mutationTip');
    const cs = getComputedStyle(tip);
    return {vis: cs.visibility, op: cs.opacity};
  }));
  await page.screenshot({ path: '/tmp/shot9-tooltip.png' });

  // loupe over a creature
  const pt = await page.evaluate(() => {
    const app = window.__vitrine.app;
    const r = app.renderer;
    const glass = document.getElementById('glass').getBoundingClientRect();
    const a = app.sim.prey.find(x => x.alive);
    return { x: glass.left + r.offX + a.x * r.scale, y: glass.top + r.offY + a.y * r.scale };
  });
  await page.mouse.move(pt.x, pt.y);
  await page.waitForTimeout(300);
  console.log('spec', await page.evaluate(() => {
    const c = document.getElementById('specCard');
    return { hidden: c.hidden, name: document.getElementById('specName').textContent, role: document.getElementById('specRole').textContent, pos: {left:c.style.left, top:c.style.top} };
  }));
  await page.screenshot({ path: '/tmp/shot9-loupe.png' });

  // headless
  await page.click('#renderToggle');
  await page.waitForTimeout(900);
  console.log('headless', await page.evaluate(() => ({panel: !document.getElementById('headlessPanel').hidden, tick: window.__vitrine.app.sim.tick, checked: document.getElementById('renderToggle').getAttribute('aria-checked')})));
  await page.screenshot({ path: '/tmp/shot9-headless.png' });
  await page.click('#renderToggle');

  // pause
  await page.click('#pauseBtn');
  const t1 = await page.evaluate(() => window.__vitrine.app.sim.tick);
  await page.waitForTimeout(700);
  const t2 = await page.evaluate(() => window.__vitrine.app.sim.tick);
  console.log('pause', { t1, t2, state: await page.evaluate(() => document.getElementById('runState').textContent) });
  await page.click('#pauseBtn');

  // focus and slider
  await page.focus('#mutation');
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(150);
  console.log('slider keyboard', await page.evaluate(() => ({value: document.getElementById('mutation').value, out: document.getElementById('mutationOut').textContent, sim: window.__vitrine.app.sim.mutation})));
  await page.keyboard.press('Tab');
  await page.screenshot({ path: '/tmp/shot9-focus.png' });
  console.log('errors', errors);
  await browser.close();
})();
