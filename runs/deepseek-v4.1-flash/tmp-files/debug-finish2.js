const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[]; page.on('pageerror',e=>errors.push('ERR '+e.message+'\n'+e.stack)); page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE '+m.text())});
 await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await page.waitForTimeout(500);
 await page.evaluate(()=>{const e=document.querySelector('#regrowthInput');e.value='0.07';e.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('#trailsToggle').click(); await page.locator('#gridToggle').click();
 await page.locator('[data-step-target="generationsInput"][data-step="20"]').click();
 await page.locator('#seedInput').fill('777'); await page.locator('#seedInput').press('Enter');
 await page.waitForTimeout(250);
 console.log('state1', await page.evaluate(()=>({gen:window.VivariumUI.simulation.generation,target:window.VivariumUI.simulation.target,state:document.querySelector('#headerState').textContent,horizon:document.querySelector('#generationsInput').value,speed:window.VivariumUI.speed, dash:document.querySelector('#dashboard').className, finishVisible:document.querySelector('#viewReportBtn').className, paused:document.querySelector('#pauseLabel').textContent})));
 await page.evaluate(()=>{window.VivariumUI.setSpeed(32);const e=document.querySelector('#generationsInput');e.value='50';e.dispatchEvent(new Event('input',{bubbles:true}));});
 for (let i=0;i<8;i++) {
   await page.waitForTimeout(400);
   console.log('tick',i,await page.evaluate(()=>({gen:window.VivariumUI.simulation?.generation,target:window.VivariumUI.simulation?.target,state:document.querySelector('#headerState').textContent,horizon:document.querySelector('#generationsInput').value,dash:document.querySelector('#dashboard').className,finishVisible:document.querySelector('#viewReportBtn').className, pause:document.querySelector('#pauseLabel').textContent, flash:document.querySelector('#footerStatus').textContent})));
   if(i===0) console.log('errors', errors);
 }
 console.log('final errors', errors);
 await browser.close();
})();
