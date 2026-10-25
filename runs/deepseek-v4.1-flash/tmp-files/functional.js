const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}, deviceScaleFactor:1});
 const errors=[]; const requests=[];
 page.on('pageerror',e=>errors.push('PAGEERROR '+e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE '+m.text())});
 page.on('request',r=>{if(!r.url().startsWith('file:')) requests.push(r.url())});
 await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await page.waitForTimeout(700);
 console.log('initial', await page.evaluate(()=>({
  gen:window.VivariumUI.simulation.generation,
  aria:document.querySelector('#tempoDial').getAttribute('aria-valuenow'),
  instScroll:[document.querySelector('#instrumentScroll').scrollHeight,document.querySelector('#instrumentScroll').clientHeight],
  footerBottom:document.querySelector('.console-footer').getBoundingClientRect().bottom,
  instBottom:document.querySelector('#instruments').getBoundingClientRect().bottom,
  srStart:document.querySelector('#headerState').textContent,
  traceCanvas:[document.querySelector('#liveTrace').width, document.querySelector('#liveTrace').height]
 })));
 // dial keyboard
 await page.locator('#tempoDial').focus();
 await page.keyboard.press('End');
 console.log('speed end', await page.locator('#tempoDial').getAttribute('aria-valuenow'), await page.locator('#tempoReadout').textContent());
 await page.keyboard.press('ArrowDown');
 console.log('speed down', await page.locator('#tempoDial').getAttribute('aria-valuenow'));
 // tooltip
 await page.locator('.section-hint').first().hover();
 await page.waitForTimeout(200);
 console.log('tooltip', await page.evaluate(()=>({text:document.querySelector('#tooltip').textContent.slice(0,30), vis:document.querySelector('#tooltip').classList.contains('is-visible')})));
 // mutation slider
 await page.evaluate(()=>{const e=document.querySelector('#mutationInput'); e.value='12'; e.dispatchEvent(new Event('input',{bubbles:true}));});
 console.log('mutation', await page.evaluate(()=>({sim:window.VivariumUI.simulation.mutation, output:document.querySelector('#mutationValue').textContent, fill:document.querySelector('#mutationInput').closest('.range-shell').style.getPropertyValue('--fill')})));
 // interval
 await page.evaluate(()=>{const e=document.querySelector('#droughtInput'); e.value='20'; e.dispatchEvent(new Event('input',{bubbles:true}));});
 console.log('interval', await page.evaluate(()=>({int:window.VivariumUI.simulation.intervals.drought,next:window.VivariumUI.simulation.nextEvent.drought,gen:window.VivariumUI.simulation.generation,label:document.querySelector('#droughtNext').textContent, output:document.querySelector('#droughtValue').textContent})));
 // pause
 await page.locator('#topPause').click();
 console.log('paused', await page.evaluate(()=>({paused:document.querySelector('#headerState').textContent, label:document.querySelector('#pauseLabel').textContent, simGen:window.VivariumUI.simulation.generation})));
 await page.waitForTimeout(300);
 console.log('paused gen2', await page.evaluate(()=>window.VivariumUI.simulation.generation));
 await page.locator('#topPause').click();
 // test event by setting surge interval 10, speed 32
 await page.evaluate(()=>{window.VivariumUI.setSpeed(32); const e=document.querySelector('#surgeInput'); e.value='10'; e.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForFunction(()=>document.querySelector('.event-banner').classList.contains('is-visible'), null, {timeout:5000}).catch(e=>console.log('event timeout'));
 console.log('event visible', await page.evaluate(()=>({banner:document.querySelector('#eventBanner').className, title:document.querySelector('#eventTitle').textContent, kicker:document.querySelector('#eventKicker').textContent, gen:window.VivariumUI.simulation.generation, events:window.VivariumUI.simulation.eventLog.length, tint:document.querySelector('#vitrine').className})));
 await page.screenshot({path:'/tmp/event.png'});
 // pause to hold vignette? screenshot already
 await page.locator('#topPause').click();
 // set horizon low to finish
 await page.evaluate(()=>{const e=document.querySelector('#generationsInput'); e.value=String(Math.min(800,window.VivariumUI.simulation.generation+1)); e.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForFunction(()=>document.querySelector('#dashboard').classList.contains('is-open'), null, {timeout:6000}).catch(()=>console.log('dash timeout'));
 console.log('dashboard', await page.evaluate(()=>({open:document.querySelector('#dashboard').classList.contains('is-open'), gen:window.VivariumUI.simulation.generation, target:window.VivariumUI.simulation.target, cards:document.querySelectorAll('.trait-card').length, popW:document.querySelector('#populationChart').getBoundingClientRect().width, popH:document.querySelector('#populationChart').getBoundingClientRect().height, scrollH:document.querySelector('#dashboard').scrollHeight, focused:document.activeElement.id, inert:document.querySelector('#shell').inert })));
 // chart hover
 const pop=page.locator('#populationChart'); const bb=await pop.boundingBox();
 await page.mouse.move(bb.x+bb.width*0.55,bb.y+bb.height*0.4);
 await page.waitForTimeout(150);
 console.log('hover', await page.locator('#popReadout').textContent());
 await page.screenshot({path:'/tmp/dashboard-hover.png'});
 await page.locator('#dashClose').click();
 await page.waitForTimeout(200);
 console.log('closed', await page.evaluate(()=>({open:document.querySelector('#dashboard').classList.contains('is-open'), inert:document.querySelector('#shell').inert, active:document.activeElement.id, reportVisible:document.querySelector('#viewReportBtn').classList.contains('is-visible')})));
 console.log('requests', requests);
 console.log('errors', errors);
 await browser.close();
})();
