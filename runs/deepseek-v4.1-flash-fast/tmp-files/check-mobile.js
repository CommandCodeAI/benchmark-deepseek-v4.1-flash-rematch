const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const errors = [];

  // 1280x800
  const p1 = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  p1.on('pageerror', e => errors.push('1280: '+e.message));
  await p1.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle' });
  await p1.waitForTimeout(2200);
  await p1.screenshot({ path: '/tmp/shot10-1280.png' });
  console.log('1280', await p1.evaluate(() => ({scrollH: document.documentElement.scrollHeight, scrollW: document.documentElement.scrollWidth, innerW: innerWidth, appBottom: document.querySelector('.apparatus').getBoundingClientRect().bottom})));
  await p1.close();

  // mobile
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  page.on('pageerror', e => errors.push('mobile: '+e.message));
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  console.log('mobile', await page.evaluate(() => ({
    scrollH: document.documentElement.scrollHeight, scrollW: document.documentElement.scrollWidth, innerW: innerWidth,
    collapsed: document.getElementById('console').classList.contains('is-collapsed'),
    glass: document.getElementById('glass').getBoundingClientRect().toJSON(),
    masthead: document.querySelector('.masthead').getBoundingClientRect().toJSON(),
    apparatus: document.querySelector('.apparatus').getBoundingClientRect().toJSON(),
    consoleToggle: document.getElementById('consoleToggle').getBoundingClientRect().toJSON()
  })));
  await page.screenshot({ path: '/tmp/shot10-mobile-top.png' });
  await page.click('#consoleToggle');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/shot10-mobile-expanded.png' });
  await page.evaluate(() => window.scrollTo(0, 600));
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/shot10-mobile-controls.png' });

  await page.evaluate(() => { window.scrollTo(0,0); window.__vitrine.finish(); });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/tmp/shot10-mobile-archive.png' });
  const arch = await page.evaluate(() => ({scrollH: document.getElementById('archive').scrollHeight, driftH: document.getElementById('driftWrap').getBoundingClientRect().height, scrollW: document.documentElement.scrollWidth, innerW: innerWidth}));
  console.log('archive', arch);
  await page.evaluate(() => { document.getElementById('archive').scrollTop = 500; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/shot10-mobile-archive2.png' });
  await page.evaluate(() => { document.getElementById('archive').scrollTop = 1300; });
  await page.waitForTimeout(300);
  await page.screenshot({ path: '/tmp/shot10-mobile-archive3.png' });
  console.log('errors', errors);
  await browser.close();
})();
