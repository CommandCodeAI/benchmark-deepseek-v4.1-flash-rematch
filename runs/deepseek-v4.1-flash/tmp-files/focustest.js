const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await page.evaluate(()=>{window.VivariumUI.setSpeed(32);const e=document.querySelector('#generationsInput');e.value='60';e.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForFunction(()=>document.querySelector('#dashboard').classList.contains('is-open'),null,{timeout:8000});
 await page.waitForTimeout(300);
 console.log('focus300', await page.evaluate(()=>({tag:document.activeElement.tagName,id:document.activeElement.id,vis:getComputedStyle(document.querySelector('#dashboard')).visibility,open:document.querySelector('#dashboard').classList.contains('is-open')})));
 await page.waitForTimeout(500);
 console.log('focus800', await page.evaluate(()=>({tag:document.activeElement.tagName,id:document.activeElement.id})));
 await page.keyboard.press('Tab');
 console.log('tab', await page.evaluate(()=>({tag:document.activeElement.tagName,id:document.activeElement.id,text:document.activeElement.textContent.trim().slice(0,20)})));
 await page.keyboard.press('Escape');
 await page.waitForTimeout(100);
 console.log('escaped', await page.evaluate(()=>({open:document.querySelector('#dashboard').classList.contains('is-open'),id:document.activeElement.id})));
 await browser.close();
})();
