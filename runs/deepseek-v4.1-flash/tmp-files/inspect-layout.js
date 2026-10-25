const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}, deviceScaleFactor:1.5});
 await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await page.evaluate(()=>window.VivariumUI.setSpeed(32));
 await page.waitForTimeout(6400);
 const data=await page.evaluate(()=>{
  const rect=s=>{const e=document.querySelector(s); if(!e)return null; const r=e.getBoundingClientRect(); return {top:r.top,left:r.left,width:r.width,height:r.height,bottom:r.bottom}};
  const dash=document.querySelector('#dashboard');
  const inner=document.querySelector('.dashboard-inner');
  const inst=document.querySelector('#instrumentScroll');
  const styles=[...document.querySelectorAll('.control-section')].map(e=>({cls:e.className, top:e.getBoundingClientRect().top, h:e.getBoundingClientRect().height, pad:getComputedStyle(e).padding}));
  return {
    dash:{scrollHeight:dash.scrollHeight,clientHeight:dash.clientHeight, scrollTop:dash.scrollTop},
    inner:rect('.dashboard-inner'),
    top:rect('.dash-topline'), hero:rect('.dash-hero'), grid:rect('.dash-grid'), pop:rect('.chart-panel'), dossier:rect('.dossier'), trait:rect('.trait-section'), traiteHead:rect('.trait-section-head'), traitCard:rect('.trait-card'), bottom:rect('.dash-bottom'),
    traitGrid:rect('#traitGrid'),
    sections:styles,
    inst:{scrollHeight:inst.scrollHeight,clientHeight:inst.clientHeight, top:inst.getBoundingClientRect().top, bottom:inst.getBoundingClientRect().bottom},
    toggle: rect('.toggle-block'),
    consoleFooter: rect('.console-footer'),
    canvas: rect('#populationChart'),
    cards: [...document.querySelectorAll('.trait-card')].slice(0,2).map(e=>({rect:e.getBoundingClientRect().toJSON(), canvas:e.querySelector('canvas').getBoundingClientRect().toJSON()}))
  };
 });
 console.log(JSON.stringify(data,null,2));
 await page.screenshot({path:'/tmp/dash-top.png'});
 await page.evaluate(()=>{document.querySelector('#dashboard').scrollTop=570});
 await page.waitForTimeout(300);
 await page.screenshot({path:'/tmp/dash-traits.png'});
 await browser.close();
})();
