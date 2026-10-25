const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await page.evaluate(()=>{window.VivariumUI.setSpeed(32);const e=document.querySelector('#generationsInput');e.value='100';e.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForFunction(()=>document.querySelector('#dashboard').classList.contains('is-open'),null,{timeout:8000});
 await page.waitForTimeout(500);
 console.log('open',await page.evaluate(()=>({inert:document.querySelector('#dashboard').inert,focus:document.activeElement.id,aria:document.querySelector('#dashboard').getAttribute('aria-hidden')})));
 await page.screenshot({path:'/tmp/report-inert.png'});
 await page.keyboard.press('Escape');
 await page.waitForTimeout(100);
 console.log('closed',await page.evaluate(()=>({inert:document.querySelector('#dashboard').inert,focus:document.activeElement.id,aria:document.querySelector('#dashboard').getAttribute('aria-hidden'),shellInert:document.querySelector('#shell').inert})));
 // resume after close by extending horizon
 await page.evaluate(()=>{const e=document.querySelector('#generationsInput'); e.value='160'; e.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForTimeout(300);
 console.log('resumed',await page.evaluate(()=>({gen:window.VivariumUI.simulation.generation,target:window.VivariumUI.simulation.target,state:document.querySelector('#headerState').textContent,reportVisible:document.querySelector('#viewReportBtn').classList.contains('is-visible')})));
 console.log('errors',errors);
 await browser.close();
})();
