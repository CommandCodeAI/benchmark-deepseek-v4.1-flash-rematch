const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1.5});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await page.waitForTimeout(500);
 await page.evaluate(()=>window.VivariumUI.setSpeed(32));
 await page.waitForFunction(()=>document.querySelector('#dashboard').classList.contains('is-open'),null,{timeout:12000});
 await page.waitForTimeout(400);
 const info=await page.evaluate(()=>({
  gen:window.VivariumUI.simulation.generation,
  final:{prey:window.VivariumUI.simulation.latest.prey,pred:window.VivariumUI.simulation.latest.predators,plants:window.VivariumUI.simulation.latest.plants},
  events:window.VivariumUI.simulation.eventLog.map(e=>({type:e.type,gen:e.generation,detail:e.detail})),
  totals:window.VivariumUI.simulation.totals,
  focus:document.activeElement.id,
  scrollH:document.querySelector('#dashboard').scrollHeight,
  chartRect:document.querySelector('#populationChart').getBoundingClientRect().toJSON(),
  cards:document.querySelectorAll('.trait-card').length,
  aria:document.querySelector('#dashboard').getAttribute('aria-hidden'),
  inert:document.querySelector('#shell').inert,
  network:[...performance.getEntriesByType('resource')].map(r=>r.name)
 }));
 console.log(JSON.stringify(info,null,2));
 await page.screenshot({path:'/tmp/final-top.png'});
 await page.evaluate(()=>document.querySelector('#dashboard').scrollTop=740);
 await page.waitForTimeout(250);
 await page.screenshot({path:'/tmp/final-bottom.png'});
 // test new specimen from report
 await page.evaluate(()=>document.querySelector('#dashboard').scrollTop=0);
 await page.locator('#dashNewSeed').click();
 await page.waitForTimeout(700);
 console.log('new', await page.evaluate(()=>({seed:window.VivariumUI.simulation.seed, gen:window.VivariumUI.simulation.generation, dashboard:document.querySelector('#dashboard').classList.contains('is-open'), seedInput:document.querySelector('#seedInput').value, run:document.querySelector('#runCode').textContent, state:document.querySelector('#headerState').textContent})));
 console.log('errors',errors);
 await browser.close();
})();
