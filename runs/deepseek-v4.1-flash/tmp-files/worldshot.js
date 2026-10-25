const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:2});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await page.waitForTimeout(5000);
 await page.screenshot({path:'/tmp/world-final.png',clip:{x:377,y:138,width:778,height:627}});
 await page.evaluate(()=>window.VivariumUI.pause());
 await page.screenshot({path:'/tmp/whole-final.png'});
 console.log('gen', await page.evaluate(()=>window.VivariumUI.simulation.generation),'errors',errors);
 await browser.close();
})();
