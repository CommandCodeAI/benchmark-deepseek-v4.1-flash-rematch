const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const desktop=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});
 const errors=[]; desktop.on('pageerror',e=>errors.push(e.message)); desktop.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await desktop.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await desktop.waitForTimeout(400);
 // zero mutation reset test
 await desktop.evaluate(()=>{const e=document.querySelector('#mutationInput'); e.value='0'; e.dispatchEvent(new Event('input',{bubbles:true})); const r=document.querySelector('#restartBtn'); r.click();});
 await desktop.waitForTimeout(250);
 console.log('zeroMut', await desktop.evaluate(()=>({mutation:window.VivariumUI.simulation.mutation,input:document.querySelector('#mutationInput').value,output:document.querySelector('#mutationValue').textContent})));
 // fast run to report
 await desktop.evaluate(()=>{window.VivariumUI.setSpeed(32); const e=document.querySelector('#generationsInput'); e.value='120'; e.dispatchEvent(new Event('input',{bubbles:true}));});
 await desktop.waitForFunction(()=>document.querySelector('#dashboard').classList.contains('is-open'),null,{timeout:10000});
 await desktop.waitForTimeout(900);
 console.log('report', await desktop.evaluate(()=>({focus:document.activeElement.id, vis:getComputedStyle(document.querySelector('#dashboard')).visibility, h:document.querySelector('#populationChart').getBoundingClientRect().height, traitTop:document.querySelector('.trait-card').getBoundingClientRect().top, scrollH:document.querySelector('#dashboard').scrollHeight})));
 await desktop.screenshot({path:'/tmp/report-new.png'});
 console.log('errors',errors);
 await desktop.close();
 const mobile=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await mobile.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await mobile.waitForTimeout(400);
 await mobile.evaluate(()=>{window.VivariumUI.setSpeed(32); const e=document.querySelector('#generationsInput'); e.value='80'; e.dispatchEvent(new Event('input',{bubbles:true}));});
 await mobile.waitForFunction(()=>document.querySelector('#dashboard').classList.contains('is-open'),null,{timeout:8000});
 await mobile.waitForTimeout(700);
 await mobile.screenshot({path:'/tmp/mobile-report-new.png'});
 console.log('mobile header', await mobile.evaluate(()=>({topline:document.querySelector('.dash-topline').getBoundingClientRect().toJSON(),brand:document.querySelector('.dash-brand').getBoundingClientRect().toJSON(),controls:document.querySelector('.dash-controls').getBoundingClientRect().toJSON(),print:getComputedStyle(document.querySelector('#dashPrint')).display})));
 await browser.close();
})();
