const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await page.waitForTimeout(300);
 console.log(await page.evaluate(()=>{
   const out={};
   out.initial={ch:document.body.clientHeight,sh:document.body.scrollHeight,ih:innerHeight,vh:visualViewport.height,svh:getComputedStyle(document.documentElement).getPropertyValue('--dummy')};
   document.body.style.minHeight='0px'; out.minHeight0={ch:document.body.clientHeight,sh:document.body.scrollHeight};
   document.documentElement.style.height='100%'; document.body.style.height='100%'; out.h100={ch:document.body.clientHeight,sh:document.body.scrollHeight};
   document.body.style.overflow='hidden'; out.hidden={ch:document.body.clientHeight,sh:document.body.scrollHeight};
   return out;
 }));
 await browser.close();
})();
