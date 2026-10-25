const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await page.waitForTimeout(300);
 await page.evaluate(()=>{
   const set=(id,v)=>{const e=document.querySelector(id);e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}));};
   set('#droughtInput',30); set('#plagueInput',60); set('#surgeInput',90); set('#generationsInput',120);
   window.VivariumUI.setSpeed(12);
 });
 await page.waitForFunction(()=>window.VivariumUI.simulation.eventLog.some(e=>e.type==='plague'),null,{timeout:10000});
 await page.evaluate(()=>window.VivariumUI.pause());
 await page.waitForTimeout(250);
 console.log('banner', await page.evaluate(()=>({title:document.querySelector('#eventTitle').textContent, vis:document.querySelector('#eventBanner').classList.contains('is-visible'), aria:document.querySelector('#eventBanner').getAttribute('aria-hidden'), color:getComputedStyle(document.querySelector('#vitrine')).getPropertyValue('--event-color'), eventTypes:window.VivariumUI.simulation.eventLog.map(e=>e.type), gen:window.VivariumUI.simulation.generation})));
 await page.screenshot({path:'/tmp/event-plague.png'});
 // resume & finish
 await page.evaluate(()=>{window.VivariumUI.play(); window.VivariumUI.setSpeed(32);});
 await page.waitForFunction(()=>document.querySelector('#dashboard').classList.contains('is-open'),null,{timeout:10000});
 await page.waitForTimeout(500);
 console.log('report',await page.evaluate(()=>({events:window.VivariumUI.simulation.eventLog.map(e=>e.type+':'+e.generation), ledger:document.querySelectorAll('.event-ledger-row').length, traitCards:document.querySelectorAll('.trait-card').length, focus:document.activeElement.id, dashboardScroll:document.querySelector('#dashboard').scrollHeight})));
 await page.screenshot({path:'/tmp/report-events.png'});
 // print emulation screenshot
 await page.emulateMedia({media:'print'});
 await page.screenshot({path:'/tmp/print-preview.png',fullPage:false});
 console.log('errors', errors);
 await browser.close();
})();
