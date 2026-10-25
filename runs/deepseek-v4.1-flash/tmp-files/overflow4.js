const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 for(const [w,h,mobile] of [[1440,900,false],[390,844,true]]){
  const page=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:1,isMobile:mobile,hasTouch:mobile});
  await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
  await page.waitForTimeout(300);
  console.log(w,h, await page.evaluate(()=>({sh:document.body.scrollHeight,ch:document.body.clientHeight,sw:document.body.scrollWidth,cw:document.body.clientWidth})));
  await page.close();
 }
 await browser.close();
})();
