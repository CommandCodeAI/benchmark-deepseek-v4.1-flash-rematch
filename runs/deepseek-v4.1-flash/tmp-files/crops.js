const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
 await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await page.waitForTimeout(3000);
 await page.screenshot({path:'/tmp/crop-world.png',clip:{x:377,y:138,width:778,height:627}});
 await page.screenshot({path:'/tmp/crop-panel.png',clip:{x:17,y:97,width:342,height:756}});
 await page.evaluate(()=>window.VivariumUI.setSpeed(32));
 await page.waitForTimeout(6800);
 await page.screenshot({path:'/tmp/crop-dashhero.png',clip:{x:0,y:0,width:1440,height:400}});
 await page.screenshot({path:'/tmp/crop-traitrow.png',clip:{x:32,y:690,width:1376,height:210}});
 await browser.close();
})();
