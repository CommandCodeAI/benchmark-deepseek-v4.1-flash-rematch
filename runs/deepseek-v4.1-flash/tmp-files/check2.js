const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}, deviceScaleFactor:1});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await page.waitForTimeout(2600);
 await page.screenshot({path:'/tmp/initial2.png'});
 const ui=await page.evaluate(()=>({gen:window.VivariumUI.simulation.generation,
   inst:{sh:document.querySelector('#instrumentScroll').scrollHeight,ch:document.querySelector('#instrumentScroll').clientHeight, scrollTop:document.querySelector('#instrumentScroll').scrollTop},
   toggle:document.querySelector('.toggle-block').getBoundingClientRect().toJSON(),
   footer:document.querySelector('.console-footer').getBoundingClientRect().toJSON(),
   panels:[...document.querySelectorAll('.control-section')].map(e=>({h:e.getBoundingClientRect().height,top:e.getBoundingClientRect().top}))
 }));
 console.log(ui);
 await page.evaluate(()=>window.VivariumUI.setSpeed(32));
 await page.waitForTimeout(7600);
 const dash=await page.evaluate(()=>{
   const q=s=>{const e=document.querySelector(s);if(!e)return null;const r=e.getBoundingClientRect();return {top:r.top,bottom:r.bottom,w:r.width,h:r.height}};
   return {open:document.querySelector('#dashboard').classList.contains('is-open'), scrollH:document.querySelector('#dashboard').scrollHeight,
    top:q('.dash-topline'),hero:q('.dash-hero'),grid:q('.dash-grid'),chart:q('.chart-panel'),traitHead:q('.trait-section-head'),traitCard:q('.trait-card'),bottom:q('.dash-bottom'), cards:document.querySelectorAll('.trait-card').length};
 });
 console.log(JSON.stringify(dash,null,2));
 await page.screenshot({path:'/tmp/dashboard2.png'});
 await page.evaluate(()=>document.querySelector('#dashboard').scrollTop=620);
 await page.waitForTimeout(250);
 await page.screenshot({path:'/tmp/dashboard-traits2.png'});
 console.log('errors', errors);
 await browser.close();
})();
