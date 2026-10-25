const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const results={};
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[], requests=[];
 page.on('pageerror',e=>errors.push('ERR '+e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push('CONSOLE '+m.text())});
 page.on('request',r=>{if(!r.url().startsWith('file:')&&!r.url().startsWith('data:'))requests.push(r.url())});
 await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await page.waitForTimeout(500);
 results.initial=await page.evaluate(()=>({gen:window.VivariumUI.simulation.generation, state:document.querySelector('#headerState').textContent, seed:document.querySelector('#headerSeed').textContent, instOverflow:document.querySelector('#instrumentScroll').scrollHeight>document.querySelector('#instrumentScroll').clientHeight+2}));
 // food regrowth live
 await page.evaluate(()=>{const e=document.querySelector('#regrowthInput');e.value='0.07';e.dispatchEvent(new Event('input',{bubbles:true}));});
 results.regrowth=await page.evaluate(()=>({sim:window.VivariumUI.simulation.plantRegrowth,out:document.querySelector('#regrowthValue').textContent}));
 // toggle
 await page.locator('#trailsToggle').click();
 await page.locator('#gridToggle').click();
 results.toggles=await page.evaluate(()=>({trails:document.querySelector('#trailsToggle').checked,grid:document.querySelector('#gridToggle').checked}));
 // horizon step
 const horizonBefore=await page.locator('#generationsInput').inputValue();
 await page.locator('[data-step-target="generationsInput"][data-step="20"]').click();
 results.horizon={before:horizonBefore,after:await page.locator('#generationsInput').inputValue(),simTarget:await page.evaluate(()=>window.VivariumUI.simulation.target)};
 // seed via input+enter
 await page.locator('#seedInput').fill('777');
 await page.locator('#seedInput').press('Enter');
 await page.waitForTimeout(250);
 results.seed=await page.evaluate(()=>({seed:window.VivariumUI.simulation.seed, header:document.querySelector('#headerSeed').textContent, footer:document.querySelector('#footerSeed').textContent, run:document.querySelector('#runCode').textContent, gen:window.VivariumUI.simulation.generation}));
 // speed via UI API, finish run
 await page.evaluate(()=>{window.VivariumUI.setSpeed(32);const e=document.querySelector('#generationsInput');e.value=String(window.VivariumUI.simulation.generation+25);e.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.waitForFunction(()=>document.querySelector('#dashboard').classList.contains('is-open'),null,{timeout:8000});
 await page.waitForTimeout(850);
 results.report=await page.evaluate(()=>({open:true,focus:document.activeElement.id,meta:document.querySelector('.dash-meta').getBoundingClientRect().toJSON(),toplineScroll:document.querySelector('.dash-topline').scrollWidth,toplineWidth:document.querySelector('.dash-topline').clientWidth,cards:document.querySelectorAll('.trait-card').length,events:document.querySelectorAll('.event-ledger-row').length,scrollH:document.querySelector('#dashboard').scrollHeight,sh:document.querySelector('#shell').inert}));
 results.errors=errors; results.requests=requests;
 console.log(JSON.stringify(results,null,2));
 await page.screenshot({path:'/tmp/final-final.png'});
 // 900 width report meta
 await page.setViewportSize({width:900,height:800});
 await page.waitForTimeout(600);
 console.log('900',await page.evaluate(()=>({toplineScroll:document.querySelector('.dash-topline').scrollWidth,toplineWidth:document.querySelector('.dash-topline').clientWidth,bodySW:document.body.scrollWidth,innerW:innerWidth,dashSW:document.querySelector('#dashboard').scrollWidth,dashCW:document.querySelector('#dashboard').clientWidth,metaDisp:getComputedStyle(document.querySelector('.dash-meta')).display})));
 await page.screenshot({path:'/tmp/final-final-900.png'});
 await browser.close();
})();
