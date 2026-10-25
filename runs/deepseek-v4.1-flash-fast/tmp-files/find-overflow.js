const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  for (const vp of [{w:390,h:844},{w:1280,h:800}]) {
    const page = await browser.newPage({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1 });
    await page.goto('http://127.0.0.1:8123/index.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const list = await page.evaluate(() => {
      const w = innerWidth;
      return [...document.querySelectorAll('body *')].map(el => {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { tag: el.tagName, id: el.id, cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '', right: +r.right.toFixed(1), left: +r.left.toFixed(1), w: +r.width.toFixed(1), pos: cs.position, vis: cs.visibility, disp: cs.display };
      }).filter(x => x.right > w + 1 && x.disp !== 'none').slice(0, 25);
    });
    console.log('VIEW', vp, list);
    if (vp.w === 390) {
      await page.evaluate(() => { window.__vitrine.finish(); });
      await page.waitForTimeout(1800);
      const list2 = await page.evaluate(() => {
        const w = innerWidth;
        return [...document.querySelectorAll('#archive *')].map(el => {
          const r = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return { tag: el.tagName, id: el.id, cls: (el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className) || '', right: +r.right.toFixed(1), left: +r.left.toFixed(1), w: +r.width.toFixed(1), pos: cs.position, vis: cs.visibility, disp: cs.display };
        }).filter(x => x.right > w + 1 && x.disp !== 'none').slice(0, 30);
      });
      console.log('ARCHIVE overflow', list2);
      await page.evaluate(() => { document.getElementById('archive').scrollTop = 99999; });
      await page.waitForTimeout(300);
      await page.screenshot({ path: '/tmp/shot11-mobile-archive-bottom.png' });
    }
    await page.close();
  }
  await browser.close();
})();
