const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/clocktower/seat-order.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports});
const {clickedSeatOrder,seatOrderSwaps}=m.exports;
for(let size=2;size<=15;size++)for(let trial=0;trial<50;trial++){
 const members=Array.from({length:size},(_,i)=>({user_id:String(i),seat:i+1}));
 const ids=members.map(m=>m.user_id);for(let i=ids.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[ids[i],ids[j]]=[ids[j],ids[i]];}
 const base=Object.fromEntries(members.map(m=>[m.user_id,m.seat]));const desired=clickedSeatOrder(base,ids);
 ids.forEach((id,i)=>assert.equal(desired[id],i+1));
 const plan=seatOrderSwaps(members,desired),current=structuredClone(members);
 for(const [a,b] of plan){const x=current.find(m=>m.user_id===a.user_id),y=current.find(m=>m.user_id===b.user_id);assert.equal(x.seat,a.seat);assert.equal(y.seat,b.seat);[x.seat,y.seat]=[y.seat,x.seat];}
 current.forEach(m=>assert.equal(m.seat,desired[m.user_id]));assert.equal(seatOrderSwaps(current,desired).length,0);
 const partial=clickedSeatOrder(base,ids.slice(0,2));assert.equal(new Set(Object.values(partial)).size,size);
 const pair={...base,[ids[0]]:base[ids[1]],[ids[1]]:base[ids[0]]};assert.equal(seatOrderSwaps(members,pair).length,1);
}
console.log('PASS: 700 full orders, partial previews, pair swaps, expected server seat values, saved-order retry');
