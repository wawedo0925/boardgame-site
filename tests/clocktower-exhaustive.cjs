const assert=require('node:assert/strict');const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(require('fs').readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const {setupRoles,validateAssignments}=require('../lib/clocktower/setup.ts');
const {randomInformation,informationErrors}=require('../lib/clocktower/information.ts');
const {beginNight,propose,eligible}=require('../lib/clocktower/night.ts');
function choose(xs,k){if(!k)return [[]];if(k>xs.length)return [];return xs.flatMap((x,i)=>choose(xs.slice(i+1),k-1).map(t=>[x,...t]));}
const towns=setupRoles.filter(x=>x.type==='주민').map(x=>x.name),outs=setupRoles.filter(x=>x.type==='외지인').map(x=>x.name),mins=setupRoles.filter(x=>x.type==='하수인').map(x=>x.name);
// Independent printed player-count table. Enumerate role sets, not seat permutations.
const printed=[[3,0,1],[3,1,1],[5,0,1],[5,1,1],[5,2,1],[7,0,2],[7,1,2],[7,2,2],[9,0,3],[9,1,3],[9,2,3]];
const cache=new Map();const combinations=(xs,k)=>{const key=xs.join(',')+k;if(!cache.has(key))cache.set(key,choose(xs,k));return cache.get(key);};
let setups=0,drafts=0,seed=20260911;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let n=5;n<=15;n++){
 let count=0;const [nt,no,nm]=printed[n-5];
 for(const minions of combinations(mins,nm)){
  const baron=minions.includes('남작');
  for(const outsiders of combinations(outs,no+(baron?2:0)))for(const villagers of combinations(towns,nt-(baron?2:0))){
   const roles=[...villagers,...outsiders,...minions,'임프'];
   const shown=outsiders.includes('주정뱅이')?towns.filter(t=>!villagers.includes(t)):[''];
   for(const drunkRole of shown){
    const members=roles.map((r,i)=>({user_id:String(i),actual_role:r,shown_role:r==='주정뱅이'?drunkRole:r,name:`P${i}`,seat:i+1,alive:true}));
    assert.deepEqual(validateAssignments(members),[]);setups++;count++;
    const draft=randomInformation(members,random);assert.deepEqual(informationErrors(draft.information,draft.red_herring,members),[]);drafts++;
    // First and subsequent night tasks must follow the supplied sheet, including Drunk display roles.
    for(const night of [1,2]){
     const e=beginNight(undefined,night,members);
     const printedOrder=night===1?['하수인 정보','악마 정보','독살범','첩자','세탁부','사서','수사관','요리사','초공감자','점쟁이','집사']:['독살범','수도사','첩자','역할 변경','임프','까마귀지기','장의사','초공감자','점쟁이','집사'];
     for(let i=1;i<e.tasks.length;i++)assert.ok(printedOrder.indexOf(e.tasks[i-1].role)<=printedOrder.indexOf(e.tasks[i].role));
     if(night===1)assert.equal(e.tasks.some(t=>['임프','수도사','장의사'].includes(t.role)),false);
     else assert.equal(e.tasks.some(t=>['세탁부','사서','수사관','요리사'].includes(t.role)),false);
     for(const t of e.tasks)if(['까마귀지기','장의사'].includes(t.role))assert.equal(eligible(t,e,members),false);
    }
   }
  }
 }
 console.log(`${n} players: ${count} role/display assignments passed`);
}
let adjacency=0;
// Every alive/evil/dead seat state for 5–9 seats, at least three survivors.
for(let n=5;n<=9;n++)for(let mask=0;mask<3**(n-1);mask++){
 let value=mask;const members=Array.from({length:n},(_,i)=>{const state=i?value%3:0;if(i)value=Math.floor(value/3);return {user_id:String(i),seat:i+1,name:`P${i}`,alive:state!==2,actual_role:i?(state===1?'독살범':'세탁부'):'초공감자',shown_role:i?(state===1?'독살범':'세탁부'):'초공감자'};});
 const alive=members.filter(x=>x.alive);if(alive.length<3)continue;
 const expected=[alive[1],alive.at(-1)].filter(x=>x.actual_role==='독살범').length;
 const e=beginNight(undefined,2,members);assert.equal(propose({user_id:'0',role:'초공감자'},[],e,members).result,String(expected));adjacency++;
}
console.log(JSON.stringify({setups,informationDrafts:drafts,nightSchedules:setups*2,adjacency},null,2));
