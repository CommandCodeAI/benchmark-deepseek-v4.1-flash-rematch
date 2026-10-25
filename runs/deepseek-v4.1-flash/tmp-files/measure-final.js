const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await page.evaluate(()=>window.VivariumUI.setSpeed(32));
 await page.waitForFunction(()=>document.querySelector('#dashboard').classList.contains('is-open'),null,{timeout:12000});
 await page.waitForTimeout(500);
 console.log(await page.evaluate(()=>{
  const q=s=>{const e=document.querySelector(s); if(!e)return null; const r=e.getBoundingClientRect(); return {top:+r.top.toFixed(1),bottom:+r.bottom.toFixed(1),h:+r.height.toFixed(1),w:+r.width.toFixed(1)}};
  return {top:q('.dash-topline'),hero:q('.dash-hero'),grid:q('.dash-grid'),chart:q('.chart-panel'),chartHead:q('.chart-panel-head'),canvas:q('#populationChart'),legend:q('.pop-legend'),dossier:q('.dossier'),trait:q('.trait-section'),traitHead:q('.trait-section-head'),traitGrid:q('#traitGrid'),card:q('.trait-card'),bottom:q('.dash-bottom'),dashScroll:document.querySelector('#dashboard').scrollHeight,focus:document.activeElement.id};
 }));
 await browser.close();
})();
