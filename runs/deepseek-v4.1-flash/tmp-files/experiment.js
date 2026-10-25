const fs=require('fs'), Module=require('module'), path=require('path');
const base=fs.readFileSync('/tmp/sim-core.js','utf8');
function load(src){
  const m=new Module(); m._compile(src, '/tmp/sim-exp.js'); return m.exports;
}
function metrics(sim, N){
  let preyMax=0, predMax=0, capGens=0, preyMin=9999, predMin=9999, bothAlive=0, firstExtinct=null;
  const events=[];
  for(let g=1; g<=N; g++){
    sim.step();
    const l=sim.latest;
    preyMax=Math.max(preyMax,l.prey); predMax=Math.max(predMax,l.predators);
    if(l.prey>=sim.maxPreyWatermark) capGens++;
    preyMin=Math.min(preyMin,l.prey); predMin=Math.min(predMin,l.predators);
    if(l.prey>0 && l.predators>0) bothAlive++;
    if(!firstExtinct && (l.prey===0||l.predators===0)) firstExtinct=g;
  }
  const l=sim.latest;
  return {endPrey:l.prey,endPred:l.predators,preyMax,predMax,preyMin,predMin,bothAlive,firstExtinct,events:sim.eventLog.length,cov:+l.plants.toFixed(0), births:sim.totals.births};
}
const variants=[];
for(const cap of [330,500,700]) for(const pred of [18,26,34]) for(const preyN of [70,104]) {
  variants.push({cap,pred,preyN});
}
for(const v of variants){
  let src=base.replace('const MAX_PREY = 330;',`const MAX_PREY = ${v.cap};`).replace('const predatorCount = 18;',`const predatorCount = ${v.pred};`).replace('const preyCount = 104;',`const preyCount = ${v.preyN};`);
  const V=load(src);
  const rows=[];
  for(const seed of [417,1884,5312]){
    const sim=new V.Simulation({seed,generations:240});
    sim.maxPreyWatermark=v.cap*0.985;
    rows.push(metrics(sim,240));
  }
  console.log(JSON.stringify({...v,rows}));
}
