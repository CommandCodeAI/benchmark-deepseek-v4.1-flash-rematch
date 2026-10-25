const { chromium } = require('/opt/node22/lib/node_modules/playwright');
(async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 const errors=[]; page.on('pageerror',e=>errors.push(e.message)); page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('file:///work/bench/deepseek-v4.1-flash/work/index.html');
 await page.waitForTimeout(500);
 const audit=await page.evaluate(()=>{
  const ids=[...document.querySelectorAll('[id]')].map(e=>e.id); const dup=ids.filter((x,i)=>ids.indexOf(x)!==i);
  const inputs=[...document.querySelectorAll('input, [role=slider]')].map(e=>({id:e.id, type:e.type||e.getAttribute('role'), aria:e.getAttribute('aria-label'), labelled:e.labels?[...e.labels].map(l=>l.textContent.trim().slice(0,30)):null, tabindex:e.tabIndex}));
  const buttons=[...document.querySelectorAll('button')].map(e=>({id:e.id, txt:e.textContent.trim().slice(0,35), aria:e.getAttribute('aria-label'), title:e.title, visible:!!(e.offsetWidth||e.offsetHeight)}));
  const canv=[...document.querySelectorAll('canvas')].map(e=>({id:e.id, aria:e.getAttribute('aria-label'), role:e.getAttribute('role')}));
  return {dup, inputs, buttons, canv, language:document.documentElement.lang, title:document.title};
 });
 console.log(JSON.stringify(audit,null,2));
 console.log('errors',errors);
 await browser.close();
})();
