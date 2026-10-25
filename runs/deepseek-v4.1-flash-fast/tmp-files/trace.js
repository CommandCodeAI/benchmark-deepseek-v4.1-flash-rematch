const fs=require('fs');
let src=fs.readFileSync('sim-prototype.js','utf8');
src=src.replace(/trial\(0x7A3F09C1\);.*$/s,'');
eval(src);
const sim=new Sim({seed:0x7A3F09C1,targetGenerations:40});
let plant=()=>{let s=0;for(let i=0;i<N;i++)s+=sim.plants[i];return s/N};
for(let t=1;t<=900;t++){
  const beforeP=sim.prey.length;
  sim.step();
  if(t%30===0){
    const p=sim.prey.filter(a=>a.alive), d=sim.pred.filter(a=>a.alive);
    const avgE=p.reduce((s,a)=>s+a.energy,0)/Math.max(1,p.length);
    const avgD=d.reduce((s,a)=>s+a.energy,0)/Math.max(1,d.length);
    const youngP=p.filter(a=>a.cooldown>40).length;
    console.log(t,'plant',plant().toFixed(3),'prey',p.length,'pred',d.length,'eP',avgE.toFixed(2),'eD',avgD.toFixed(2),'newP',youngP,'lastMealGen',p.filter(a=>a.lastMeal===sim.gen).length);
  }
  if(sim.prey.length===0&&sim.pred.length===0) break;
}
console.log('gen',sim.gen,'tick',sim.tick);
