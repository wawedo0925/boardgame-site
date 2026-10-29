/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test harness. */
const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText,f);
const {startBmr,advanceBmr}=require('../lib/clocktower/bmr-engine.ts');
const fixture=roles=>startBmr(roles.map((role,i)=>({user_id:String(i),name:'P'+i,seat:i+1,alive:true,actual_role:role,shown_role:role})));
function task(e,role){e.phase='NIGHT';e.night=2;e.tasks=[{actor:e.players.find(p=>p.role===role).id,role,key:'test'}];e.cursor=0;e.finished=false;return advanceBmr(e,{type:'tick'});}
for(const review of [false,true])for(const demon of ['샤발로스','포'])for(const order of (demon==='포'?[['1','2','3'],['2','1','3'],['2','3','1']]:[['1','2'],['2','1']])){
 let e=fixture([demon,'건달','구마사제','교수','객실 청소부','암살자','선원']);
 e.reviewEnabled=review;if(demon==='포')e.charged['0']=true;e=task(e,demon);
 e=advanceBmr(e,{type:'answer',id:'request',targets:order});
 if(review){assert.ok(e.review);assert.ok(e.players.every(p=>p.life==='ALIVE'));e=advanceBmr(e,{type:'approve'});}
 order.forEach((id,i)=>assert.equal(e.players.find(p=>p.id===id).life,i<order.indexOf('1')?'DEAD':'ALIVE'));
 assert.equal(e.players[1].faction,'EVIL');
}
console.log('PASS: Shabaloth and charged Po Goon target order, including storyteller approval (10 cases)');
// Mastermind can keep play going with fewer than three living players. A
// Zombuul registering dead is not a living target for the Chambermaid either.
for(const zombie of [false,true])for(const livingOthers of [0,1,2]){
 let e=fixture(['객실 청소부','주모자','좀비얼','교수','선원']);
 e.players.forEach(p=>{p.life=p.id==='0'||Number(p.id)<=livingOthers?'ALIVE':'DEAD';});
 if(zombie)e.players[2].life='ZOMBIE';
 e.mastermind={source:'1',day:2};e.awake=['1'];
 const available=e.players.filter(p=>p.id!=='0'&&p.life==='ALIVE').length;
 e=task(e,'객실 청소부');
 if(available<2){assert.equal(e.waiting,undefined);assert.equal(e.out.request,undefined);assert.equal(e.finished,true);assert.ok(!e.awake.includes('0'));}
 else{assert.equal(e.waiting.spec.target_count,2);assert.ok(e.awake.includes('0'));e=advanceBmr(e,{type:'answer',id:'maid',targets:['1','2']});assert.equal(e.out.resolved.result,'1명');}
}
console.log('PASS: Chambermaid skips unavailable targets, excludes Zombuul, still acts with two eligible players');
