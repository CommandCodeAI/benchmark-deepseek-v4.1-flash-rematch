const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const errors=[], req=[];
 page.on('pageerror',e=>errors.push('ERR '+e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE '+m.text())});
 page.on('request',r=>{if(!r.url().startsWith('file:')&&!r.url().startsWith('data:'))req.push(r.url())});
 await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 const t0=Date.now();
 await page.waitForTimeout(600);
 await page.evaluate(()=>window.VivariumUI.setSpeed(32));
 await page.waitForFunction(()=>document.querySelector('#dashboard').classList.contains('is-open'),null,{timeout:10000});
 await page.waitForTimeout(1000);
 console.log('elapsed',Date.now()-t0,'errors',errors,'requests',req);
 console.log(await page.evaluate(()=>({
   gen:window.VivariumUI.simulation.generation,
   final:[window.VivariumUI.simulation.latest.prey,window.VivariumUI.simulation.latest.predators,window.VivariumUI.simulation.latest.plants.toFixed(1)],
   events:window.VivariumUI.simulation.eventLog.map(e=>e.type+':'+e.generation),
   focus:document.activeElement.id,
   meta:[...document.querySelectorAll('.dash-meta div')].map(e=>e.innerText),
   traitCards:document.querySelectorAll('.trait-card').length,
   scrollH:document.querySelector('#dashboard').scrollHeight,
   body:[document.body.scrollWidth,document.body.clientWidth,document.body.scrollHeight,document.body.clientHeight],
   stats:[document.querySelector('#dashFinalPrey').textContent,document.querySelector('#dashFinalPred').textContent,document.querySelector('#dashBirths').textContent],
   allCanvas: [...document.querySelectorAll('canvas')].every(c=>{const r=c.getBoundingClientRect(); return r.width===0 || c.width>0})
 })));
 // tab focus order in dialog
 await page.keyboard.press('Tab');
 console.log('tab1', await page.evaluate(()=>({id:document.activeElement.id,text:document.activeElement.textContent.trim().slice(0,20)})));
 await page.keyboard.press('Shift+Tab'); await page.keyboard.press('Shift+Tab');
 console.log('shift-tab', await page.evaluate(()=>({id:document.activeElement.id,text:document.activeElement.textContent.trim().slice(0,20)})));
 // hover chart
 const bb=await page.locator('#populationChart').boundingBox();
 await page.mouse.move(bb.x+bb.width*0.7,bb.y+bb.height*0.5);
 await page.waitForTimeout(200);
 console.log('hover', await page.locator('#popReadout').textContent());
 await page.screenshot({path:'/tmp/final-report-240.png'});
 await browser.close();
})();
