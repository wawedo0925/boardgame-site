/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test harness. */
const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText,f);
const {startBmr,advanceBmr}=require('../lib/clocktower/bmr-engine.ts');
function setup(){
 const e=startBmr(['땜장이','포','암살자','선원','교수'].map((role,i)=>({user_id:String(i),name:'P'+i,seat:i+1,alive:true,actual_role:role,shown_role:role})));
 e.night=2;e.reviewEnabled=true;e.tasks=[{actor:'0',role:'땜장이',key:'tinker'}];return e;
}
for(const mode of ['drunk','poison','both','effect']){
 let e=setup();
 if(mode==='effect')e.effects.push({source:'1',role:'포',target:'0',kind:'poison',until:3});
 else e.manual={'0':{drunk:mode!=='poison',poisoned:mode!=='drunk',protected:false}};
 e=advanceBmr(e,{type:'tick'});
 assert.equal(e.pending.decision.key,'tinker-impaired');
 assert.match(e.pending.decision.description,mode==='poison'||mode==='effect'?/중독된/:/취한/);
 assert.equal(e.cursor,0);assert.equal(e.players[0].life,'ALIVE');assert.equal(e.pending.decision.options.length,1);
 assert.deepEqual(e.out.notices,[]);assert.equal(e.out.request,undefined);
 e=advanceBmr(JSON.parse(JSON.stringify(e)),{type:'choice',key:'tinker-impaired',value:'acknowledge'});
 assert.ok(e.review);assert.deepEqual(e.review.notices,[]);
 assert.equal(advanceBmr(e,{type:'revise'}).pending.decision.key,'tinker-impaired');
 e=advanceBmr(e,{type:'approve'});
 assert.equal(e.players[0].life,'ALIVE');assert.equal(e.cursor,1);assert.deepEqual(e.out.notices,[]);assert.equal(e.out.resolved,undefined);
 // Intoxication does not protect the Tinker from a demon attack.
 e.tasks.push({actor:'1',role:'포',key:'po'});e=advanceBmr(e,{type:'tick'});
 e=advanceBmr(e,{type:'answer',id:'attack',targets:['0']});e=advanceBmr(e,{type:'approve'});
 assert.equal(e.players[0].life,'DEAD');
}
for(const value of ['no','yes']){
 let e=advanceBmr(setup(),{type:'tick'});assert.equal(e.pending.decision.key,'tinker');
 e=advanceBmr(e,{type:'choice',key:'tinker',value});e=advanceBmr(e,{type:'approve'});
 assert.equal(e.players[0].life,value==='yes'?'DEAD':'ALIVE');
}
let dead=setup();dead.players[0].life='DEAD';dead=advanceBmr(dead,{type:'tick'});
assert.equal(dead.pending,undefined);assert.equal(dead.finished,true);
console.log('PASS: impaired Tinker host acknowledgment, replay, private state, normal death choices, demon death and dead actor skip');
