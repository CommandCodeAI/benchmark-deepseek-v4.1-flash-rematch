const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 for(const [w,h] of [[1440,900],[1024,768],[390,844]]){
  const page=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:1,isMobile:w<880,hasTouch:w<880});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
  await page.waitForTimeout(700);
  console.log(w,h,await page.evaluate(()=>{
   const s=document.querySelector('#instrumentScroll');
   return {gen:window.VivariumUI.simulation.generation, scroll:{sh:s.scrollHeight,ch:s.clientHeight,top:s.scrollTop}, scrollCue:document.querySelector('#instruments').className, cueOpacity:getComputedStyle(document.querySelector('#scrollCue')).opacity,
   footer:document.querySelector('.console-footer').getBoundingClientRect().top,
   toggle:document.querySelector('.toggle-block').getBoundingClientRect().top};
  }));
  if(w===1440) await page.screenshot({path:'/tmp/initial-finalcheck.png'});
  if(w===1024) await page.screenshot({path:'/tmp/tablet-1024b.png'});
  console.log('errors',errors);
  await page.close();
 }
 await browser.close();
})();
