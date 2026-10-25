const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await page.waitForTimeout(300);
 console.log(await page.evaluate(()=>{
  const vh=innerHeight;
  const list=[];
  for(const e of document.querySelectorAll('body *')){
    const r=e.getBoundingClientRect();
    if(r.height>0 && r.bottom>vh+0.5) list.push({tag:e.tagName,id:e.id,cls:typeof e.className==='string'?e.className:'',top:+r.top.toFixed(1),bottom:+r.bottom.toFixed(1),h:+r.height.toFixed(1),pos:getComputedStyle(e).position});
  }
  return {vh, scrollH:document.body.scrollHeight, list:list.slice(0,30)};
 }));
 await browser.close();
})();
