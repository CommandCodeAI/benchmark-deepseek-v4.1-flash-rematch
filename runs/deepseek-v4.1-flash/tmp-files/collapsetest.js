const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await page.waitForTimeout(500);
 await page.locator('#instrumentsToggle').click();
 await page.waitForTimeout(500);
 console.log('collapsed', await page.evaluate(()=>({
  cls:document.querySelector('.tableau').className, inert:document.querySelector('#instruments').inert,
  aria:document.querySelector('#instrumentsToggle').getAttribute('aria-expanded'),
  stage:document.querySelector('.stage').getBoundingClientRect().toJSON(), canvas:document.querySelector('#world').getBoundingClientRect().toJSON(),
  active:document.activeElement.id
 })));
 await page.screenshot({path:'/tmp/collapsed.png'});
 await page.locator('#instrumentsToggle').click();
 await page.waitForTimeout(500);
 console.log('opened',await page.evaluate(()=>({cls:document.querySelector('.tableau').className,inert:document.querySelector('#instruments').inert,stage:document.querySelector('.stage').getBoundingClientRect().toJSON()})));
 await browser.close();
})();
