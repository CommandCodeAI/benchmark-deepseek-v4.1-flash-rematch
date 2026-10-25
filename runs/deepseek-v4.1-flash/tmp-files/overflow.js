const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
 await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await page.waitForTimeout(500);
 console.log(await page.evaluate(()=>{
  const base={body:{sw:document.body.scrollWidth,sh:document.body.scrollHeight,cw:document.body.clientWidth,ch:document.body.clientHeight},html:{sw:document.documentElement.scrollWidth,sh:document.documentElement.scrollHeight}};
  const d=document.querySelector('#dashboard'); d.style.display='none';
  const afterDash={body:{sw:document.body.scrollWidth,sh:document.body.scrollHeight}};
  d.style.display='';
  const t=document.querySelector('#tooltip'); t.style.display='none';
  const afterTip={body:{sw:document.body.scrollWidth,sh:document.body.scrollHeight}};
  const rects=[...document.body.children].map(e=>({tag:e.tagName,id:e.id,cls:e.className,r:e.getBoundingClientRect().toJSON()}));
  return {base,afterDash,afterTip,rects};
 }));
 await browser.close();
})();
