const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 for(const [w,h] of [[1024,768],[920,800],[900,700],[820,760]]){
  const page=await browser.newPage({viewport:{width:w,height:h}, deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
  await page.waitForTimeout(500);
  const info=await page.evaluate(()=>({
    body:[document.body.scrollWidth,document.body.clientWidth,document.body.scrollHeight,innerHeight], topbar:document.querySelector('.topbar').getBoundingClientRect().toJSON(),
    identity:document.querySelector('.identity').getBoundingClientRect().toJSON(), runmeta:document.querySelector('.runmeta').getBoundingClientRect().toJSON(), actions:document.querySelector('.top-actions').getBoundingClientRect().toJSON(),
    instScroll:[document.querySelector('#instrumentScroll').scrollHeight, document.querySelector('#instrumentScroll').clientHeight],
    instVisible:document.querySelector('#instruments').getBoundingClientRect().left,
    stage:document.querySelector('.stage').getBoundingClientRect().toJSON(),
    drawerOpen:document.querySelector('#instruments').classList.contains('is-open')
  }));
  console.log(w,h,JSON.stringify(info));
  await page.screenshot({path:`/tmp/tablet-${w}.png`});
  await page.close();
 }
 await browser.close();
})();
