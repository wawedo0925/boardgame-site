/* eslint-disable @typescript-eslint/no-require-imports -- Node CommonJS test harness. */
const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2017}}).outputText,f);
const {startBmr,advanceBmr}=require('../lib/clocktower/bmr-engine.ts');
function setup(){
 const e=startBmr(['여관 주인','포','건달','선원','교수'].map((role,i)=>({user_id:String(i),name:'P'+i,seat:i+1,alive:true,actual_role:role,shown_role:role})));
 e.night=2;e.reviewEnabled=true;e.tasks=[{actor:'0',role:'여관 주인',key:'innkeeper'}];return e;
}
for(const mode of ['drunk','poison','both','goon']){
 let e=setup();
 if(mode!=='goon')e.manual={'0':{drunk:mode!=='poison',poisoned:mode!=='drunk',protected:false}};
 e=advanceBmr(e,{type:'tick'});
 e=advanceBmr(e,{type:'answer',id:'request',targets:mode==='goon'?['2','4']:['3','4']});
 assert.equal(e.pending.decision.key,'innkeeper-impaired');
 assert.match(e.pending.decision.description,/밤 사망 보호가 적용되지 않/);
 assert.match(e.pending.decision.description,mode==='poison'?/중독된/:/취한/);
 assert.equal(e.pending.decision.options.length,1);
 assert.equal(e.out.resolved,undefined);assert.deepEqual(e.out.notices,[]);
 e=advanceBmr(JSON.parse(JSON.stringify(e)),{type:'choice',key:'innkeeper-impaired',value:'acknowledge'});
 assert.ok(e.review);assert.equal(e.review.result,'선택을 확인했습니다.');assert.deepEqual(e.review.notices,[]);
 assert.equal(advanceBmr(e,{type:'revise'}).pending.decision.key,'innkeeper-impaired');
 e=advanceBmr(e,{type:'approve'});
 assert.equal(e.out.resolved.result,'선택을 확인했습니다.');assert.deepEqual(e.out.notices,[]);
 assert.ok(!e.effects.some(f=>f.source==='0'),'impaired Innkeeper creates neither protection nor drunkenness');
 if(mode==='goon')assert.ok(e.effects.some(f=>f.source==='2'&&f.target==='0'&&f.kind==='drunk'));
}
let healthy=advanceBmr(setup(),{type:'tick'});
healthy=advanceBmr(healthy,{type:'answer',id:'healthy',targets:['3','4']});
assert.equal(healthy.pending.decision.key,'drink');
healthy=advanceBmr(healthy,{type:'choice',key:'drink',value:'4'});
healthy=advanceBmr(healthy,{type:'approve'});
assert.equal(healthy.effects.filter(f=>f.source==='0'&&f.kind==='safe').length,2);
assert.ok(healthy.effects.some(f=>f.source==='0'&&f.target==='4'&&f.kind==='drunk'));
console.log('PASS: host-only Innkeeper impairment acknowledgment, poison/drunk/Goon, persistence, review, no private-state leak, healthy effects');
