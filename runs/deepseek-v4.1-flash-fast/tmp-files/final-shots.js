const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(8800);
  await page.screenshot({ path: '/tmp/final-desktop-event.png' });
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__vitrine.finish());
  await page.waitForTimeout(1900);
  await page.screenshot({ path: '/tmp/final-archive-top.png' });
  await page.evaluate(() => { document.getElementById('archive').scrollTop = 620; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/final-archive-drift.png' });
  await page.evaluate(() => { document.getElementById('archive').scrollTop = 99999; });
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/final-archive-bottom.png' });
  await page.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true });
  await mobile.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(8800);
  await mobile.screenshot({ path: '/tmp/final-mobile-event.png' });
  await mobile.evaluate(() => window.__vitrine.finish());
  await mobile.waitForTimeout(1900);
  await mobile.screenshot({ path: '/tmp/final-mobile-archive-top.png' });
  await mobile.evaluate(() => { document.getElementById('archive').scrollTop = 1500; });
  await mobile.waitForTimeout(300);
  await mobile.screenshot({ path: '/tmp/final-mobile-archive-drift.png' });
  await mobile.close();

  await browser.close();
})();
