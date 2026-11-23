const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const {startBmr,advanceBmr}=require('../lib/clocktower/bmr-engine.ts');
function setup(){
 const e=startBmr(['평화주의자','푸카','암살자','교수','어릿광대'].map((role,i)=>({user_id:String(i),name:'P'+i,seat:i+1,alive:true,actual_role:role,shown_role:role})));
 e.phase='DAY';e.night=2;return e;
}
for(const mode of ['drunk','poison','both','pukka']){
 let e=setup();
 if(mode==='pukka')e.effects.push({source:'1',role:'푸카',target:'0',kind:'poison',until:Number.MAX_SAFE_INTEGER});
 else e.manual['0']={drunk:mode!=='poison',poisoned:mode!=='drunk',protected:false};
 const before=structuredClone(e);
 e=advanceBmr(e,{type:'execution',target:'3'});
 assert.deepEqual(before.players,e.players,'must wait before killing');
 assert.equal(e.phase,'DAY');assert.equal(e.pending.decision.key,'pacifist-impaired:3');
 assert.match(e.pending.decision.description,/P0.*평화주의자/);
 assert.match(e.pending.decision.description,mode==='drunk'?/취함/:/중독/);
 assert.deepEqual(e.pending.decision.options,[{value:'acknowledge',label:'확인 · 처형 판정 계속'}]);
 assert.deepEqual(e.out.notices,[]);assert.equal(e.out.request,undefined);
 assert.throws(()=>advanceBmr(e,{type:'choice',key:'pacifist-impaired:3',value:'save'}));
 e=advanceBmr(JSON.parse(JSON.stringify(e)),{type:'choice',key:'pacifist-impaired:3',value:'acknowledge'});
 assert.equal(e.players[3].life,'DEAD');assert.equal(e.phase,'NIGHT');assert.equal(e.night,3);
 assert.deepEqual(e.out.notices,[]);
 assert.throws(()=>advanceBmr(e,{type:'choice',key:'pacifist-impaired:3',value:'acknowledge'}));
}
for(const value of ['save','die']){
 let e=advanceBmr(setup(),{type:'execution',target:'3'});
 assert.equal(e.pending.decision.key,'pacifist:3');
 e=advanceBmr(e,{type:'choice',key:'pacifist:3',value});
 assert.equal(e.players[3].life,value==='save'?'ALIVE':'DEAD');
}
let e=setup();e.manual['0']={drunk:true,poisoned:false,protected:false};
e=advanceBmr(e,{type:'execution',target:'4'});
e=advanceBmr(e,{type:'choice',key:'pacifist-impaired:4',value:'acknowledge'});
assert.equal(e.players[4].life,'ALIVE');assert.equal(e.players[4].spent,true,'Fool still protects itself');
e=setup();e.players[0].life='DEAD';assert.equal(advanceBmr(e,{type:'execution',target:'3'}).pending,undefined);
e=setup();e.manual['0']={drunk:true,poisoned:false,protected:false};assert.equal(advanceBmr(e,{type:'execution',target:'2'}).pending,undefined,'evil execution is not eligible');
e=setup();e.effects.push({source:'1',role:'푸카',target:'0',kind:'poison',until:99});e.manual['1']={drunk:true,poisoned:false,protected:false};
assert.equal(advanceBmr(e,{type:'execution',target:'3'}).pending.decision.key,'pacifist:3','inactive poison source must not suppress ability');
console.log('PASS impaired Pacifist host-only acknowledgment, Pukka, replay, normal choices, protection and eligibility');
