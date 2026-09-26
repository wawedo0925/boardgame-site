const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const {BMR_ROLES,bmrSetupErrors}=require('../lib/clocktower/bmr.ts');
const groups=Object.fromEntries(['주민','외지인','하수인','악마'].map(t=>[t,BMR_ROLES.filter(r=>r.type===t).map(r=>r.name)]));
const printed=[[3,0,1],[3,1,1],[5,0,1],[5,1,1],[5,2,1],[7,0,2],[7,1,2],[7,2,2],[9,0,3],[9,1,3],[9,2,3]];
function choose(xs,k){if(k<0||k>xs.length)return [];if(!k)return [[]];return xs.flatMap((x,i)=>choose(xs.slice(i+1),k-1).map(t=>[x,...t]));}
const cache=new Map();function combos(xs,k){const key=xs.join(',')+k;if(!cache.has(key))cache.set(key,choose(xs,k));return cache.get(key);}
let setups=0;
for(let n=5;n<=15;n++){
 let count=0;const [nt,no,nm]=printed[n-5];
 for(const minions of combos(groups['하수인'],nm))for(const delta of minions.includes('대부')?[-1,1]:[0]){
  for(const outsiders of combos(groups['외지인'],no+delta))for(const towns of combos(groups['주민'],nt-delta))for(const demon of groups['악마']){
   for(const shown of outsiders.includes('미치광이')?groups['악마']:['']){
    const roles=[...towns,...outsiders,...minions,demon];
    const rows=roles.map((r,i)=>({user_id:String(i),actual_role:r,shown_role:r==='미치광이'?shown:r}));
    assert.equal(bmrSetupErrors(rows).length,0,JSON.stringify(rows));count++;setups++;
   }
  }
 }
 console.log(`${n} players: ${count} legal role sets / Lunatic display assignments`);
}
console.log(JSON.stringify({setups,scope:'All legal role sets and Lunatic display roles; seat permutations and manual adjudication outcomes excluded'}));
