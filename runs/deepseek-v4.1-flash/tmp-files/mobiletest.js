const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:2, isMobile:true, hasTouch:true});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await page.waitForTimeout(1800);
 console.log('mobile', await page.evaluate(()=>({
   body:[document.body.scrollWidth,document.body.scrollHeight], view:[innerWidth,innerHeight],
   shell:document.querySelector('#shell').getBoundingClientRect().toJSON(), stage:document.querySelector('.stage').getBoundingClientRect().toJSON(), vitrine:document.querySelector('#vitrine').getBoundingClientRect().toJSON(),
   title:document.querySelector('h1').getBoundingClientRect().toJSON(),
   inst:[document.querySelector('#instruments').getBoundingClientRect().toJSON(), document.querySelector('#instruments').inert],
   scrollY
 })));
 await page.screenshot({path:'/tmp/mobile-main.png'});
 await page.locator('#instrumentsToggle').click();
 await page.waitForTimeout(500);
 console.log('drawer', await page.evaluate(()=>({open:document.querySelector('#instruments').classList.contains('is-open'),inert:document.querySelector('#instruments').inert,rect:document.querySelector('#instruments').getBoundingClientRect().toJSON(),scrim:document.querySelector('#mobileScrim').className,aria:document.querySelector('#instrumentsToggle').getAttribute('aria-expanded')})));
 await page.screenshot({path:'/tmp/mobile-drawer.png'});
 await page.locator('#mutationInput').focus();
 await page.screenshot({path:'/tmp/mobile-drawer-focus.png'});
 await page.locator('#drawerClose').click();
 await page.waitForTimeout(400);
 // finish quickly
 await page.evaluate(()=>{window.VivariumUI.setSpeed(32); const e=document.querySelector('#generationsInput'); e.value=String(Math.min(800,window.VivariumUI.simulation.generation+20)); e.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForFunction(()=>document.querySelector('#dashboard').classList.contains('is-open'),null,{timeout:8000}).catch(()=>console.log('dash timeout'));
 await page.waitForTimeout(300);
 console.log('dash', await page.evaluate(()=>({open:document.querySelector('#dashboard').classList.contains('is-open'), scrollH:document.querySelector('#dashboard').scrollHeight, dashW:document.querySelector('.dashboard-inner').getBoundingClientRect().width, cards:document.querySelectorAll('.trait-card').length, gridCols:getComputedStyle(document.querySelector('#traitGrid')).gridTemplateColumns, title:document.querySelector('.dash-title').getBoundingClientRect().toJSON()})));
 await page.screenshot({path:'/tmp/mobile-dash.png'});
 console.log('errors',errors);
 await browser.close();
})();
