const assert=require('node:assert/strict');const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(require('fs').readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const {beginNight,propose,approveEffects,eligible,impaired}=require('../lib/clocktower/night.ts');
const make=roles=>roles.map((role,i)=>({user_id:String(i),name:`P${i}`,seat:i+1,actual_role:role,shown_role:role,alive:true}));
const task=(m,role=m.shown_role)=>({user_id:m.user_id,role,key:`test:${m.user_id}:${role}`});
let checks=0;
for(const role of ['군인','시장','초공감자']) {
 const m=make(['임프',role,'수도사','독살범','까마귀지기']);let e=beginNight(undefined,2,m);
 e.protection={source:'2',target:'1',night:2};
 assert.equal(propose(task(m[0]),['1'],e,m,{victim:'4'}).victim,undefined,`Cannot redirect protected ${role}`);checks++;
}
{
 const m=make(['임프','초공감자','수도사','독살범','까마귀지기']);let e=beginNight(undefined,2,m);
 assert.equal(propose(task(m[0]),['1'],e,m,{victim:'4'}).victim,'1','Only Mayor can redirect');checks++;
}
const roles=require('../lib/clocktower/setup.ts').setupRoles.map(r=>r.name);
// Cross every target role with attacker/target impairment and protection state.
for(const role of roles.filter(r=>r!=='임프'))for(const actorBad of [false,true])for(const targetState of ['normal','drunk','poisoned','dead'])for(const monkState of ['none','healthy','drunk','dead']){
 const m=make(['임프',role,'수도사','독살범','세탁부']);const e=beginNight(undefined,2,m);
 if(actorBad)e.conditions['0']={drunk:true};
 if(targetState==='dead')m[1].alive=false;
 if(['drunk','poisoned'].includes(targetState))e.conditions['1']={[targetState]:true};
 if(monkState!=='none')e.protection={source:'2',target:'1',night:2};
 if(monkState==='drunk')e.conditions['2']={drunk:true};if(monkState==='dead')m[2].alive=false;
 const p=propose(task(m[0]),['1'],e,m);
 const dies=!actorBad&&targetState!=='dead'&&monkState!=='healthy'&&!(role==='군인'&&targetState==='normal');
 assert.equal(p.victim,dies?'1':undefined,JSON.stringify({role,actorBad,targetState,monkState}));
 const effect=approveEffects(task(m[0]),['1'],e,m,p);
 assert.equal(effect.changes.filter(x=>!x.alive).length,dies?1:0);checks++;
}
// Imp succession: before-death player count, healthy Scarlet priority, poisoner expiry.
for(let n=4;n<=15;n++)for(const scarletBad of [false,true])for(const impBad of [false,true])for(const protect of [false,true]){
 const m=make(['임프','탕녀','독살범',...Array(n-3).fill('세탁부')]);const e=beginNight(undefined,2,m);
 if(scarletBad)e.poison={source:'2',target:'1',night:2};if(impBad)e.conditions['0']={drunk:true};
 if(protect){m[3].actual_role=m[3].shown_role='수도사';e.protection={source:'3',target:'0',night:2};}
 const p=propose(task(m[0]),['0'],e,m,{successor:'2'});
 assert.equal(p.victim,!impBad&&!protect?'0':undefined);
 assert.equal(p.successor,impBad||protect?undefined:n>=5&&!scarletBad?'1':'2');
 const changed=approveEffects(task(m[0]),['0'],e,m,p);const after=m.map(x=>({...x,...changed.changes.find(c=>c.user_id===x.user_id)}));
 if(p.successor==='2')assert.equal(impaired(after[1],changed.state,after),false,'Poison ends when source becomes Imp');
 if(p.successor)assert.equal(changed.state.tasks.filter(t=>t.role==='임프'&&t.user_id===p.successor).length,0,'New Imp does not attack again');checks++;
}
// Night death cancels later living abilities; Ravenkeeper still wakes only that night.
for(const role of ['초공감자','점쟁이','장의사','집사','까마귀지기'])for(const bad of [false,true]){
 const m=make(['임프',role,'군인','독살범','세탁부']);const e=beginNight(undefined,2,m);e.execution={night:1,user_id:'2',role:'군인'};
 if(bad)e.conditions['1']={poisoned:true};const p=propose(task(m[0]),['1'],e,m);const effect=approveEffects(task(m[0]),['1'],e,m,p);
 const after=m.map(x=>({...x,...effect.changes.find(c=>c.user_id===x.user_id)}));
 assert.equal(eligible(task(after[1]),effect.state,after),role==='까마귀지기');checks++;
}
console.log(`Passed ${checks} independent interaction cases (attack, redirects, protection, death, impairment, succession).`);
// Exercise actual proposals and state changes across consecutive nights in legal setups.
const {randomAssignments}=require('../lib/clocktower/setup.ts');const {randomInformation}=require('../lib/clocktower/information.ts');
const {nextTask,taskRequest}=require('../lib/clocktower/night.ts');let actions=0,nights=0,seed=911;
const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
for(let run=0;run<1100;run++){
 const size=5+run%11;let members=randomAssignments(Array.from({length:size},(_,i)=>String(i)),'random',random).map((x,i)=>({...x,seat:i+1,name:`P${i}`,alive:true}));let engine={...randomInformation(members,random)};
 for(let night=1;night<=4;night++){
  if(night>1&&(!members.some(m=>m.alive&&m.actual_role==='임프')||members.filter(m=>m.alive).length<=2))break;
  engine=beginNight(engine,night,members);nights++;let safety=0;
  while(!(engine=nextTask(engine,members)).finished){
   assert.ok(++safety<60,'Night always terminates');const t=engine.tasks[engine.cursor];const request=taskRequest(t);
   const choices=members.filter(m=>request.allow_self||m.user_id!==t.user_id).map(x=>x.user_id);const targets=[];
   for(let i=0;i<request.target_count;i++)targets.push(choices.splice(Math.floor(random()*choices.length),1)[0]);
   let p=propose(t,targets,engine,members);
   if(t.role==='임프'&&p.requiresChoice)p=propose(t,targets,engine,members,{victim:p.canRedirect?targets[0]:undefined,successor:p.choices?.[0]?.user_id});
   assert.ok(typeof p.result==='string'&&p.result.length>0);assert.ok(!p.result.includes('undefined'));
   const before=JSON.stringify({engine,members});const applied=approveEffects(t,targets,engine,members,p);assert.equal(JSON.stringify({engine,members}),before,'Proposal application does not mutate snapshots');
   members=members.map(m=>({...m,...applied.changes.find(x=>x.user_id===m.user_id)}));engine=applied.state;engine.cursor++;actions++;
  }
 }
}
console.log(`Passed ${nights} consecutive simulated nights / ${actions} ability resolutions across 1,100 seeded legal setups.`);
