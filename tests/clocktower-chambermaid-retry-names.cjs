const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const {startBmr,advanceBmr}=require('../lib/clocktower/bmr-engine.ts');
function setup(){
 const roles=['객실 청소부','푸카','암살자','교수','도박사','할머니','평화주의자'];
 const e=startBmr(roles.map((role,i)=>({user_id:String(i),name:['청소부','악마','하수인','아라','우영','민수','정민'][i],seat:i+1,alive:true,actual_role:role,shown_role:role})));
 e.night=2;e.tasks=[{actor:'0',role:'객실 청소부',key:'maid'}];return e;
}
for(const deadIds of [['3'],['4'],['3','4']])for(const impaired of [false,true]){
 let e=setup();deadIds.forEach(id=>e.players.find(p=>p.id===id).life='DEAD');
 e.manual={'0':{drunk:impaired,poisoned:false,protected:false}};
 e=advanceBmr(e,{type:'tick'});assert(e.waiting);
 const before=structuredClone(e.players);
 e=advanceBmr(e,{type:'answer',id:'request',targets:['3','4']});
 const names=deadIds.map(id=>e.players.find(p=>p.id===id).name).join(', ');
 assert.equal(e.out.retry.split('\n')[0],`선택할 수 없는 참가자: ${names}`);
 assert.match(e.out.retry,/생존자 2명/);
 assert(!e.out.retry.includes('푸카'));assert(!e.out.retry.includes('교수'));assert(!e.out.retry.includes('도박사'));assert(!e.out.retry.includes('중독'));
 assert.deepEqual(e.players,before);assert.equal(e.cursor,0);assert.equal(e.out.resolved,undefined);assert.deepEqual(e.out.notices,[]);
 e=advanceBmr(JSON.parse(JSON.stringify(e)),{type:'answer',id:'request',targets:['5','6']});
 assert.equal(e.out.retry,undefined);
 if(impaired)assert.equal(e.pending.decision.key,'false-chambermaid');else assert.equal(e.out.resolved.result,'0명');
}
// A publicly dead Zombuul must be rejected without revealing its actual role.
let e=setup();e.players[1].role='좀비얼';e.players[1].life='ZOMBIE';e=advanceBmr(e,{type:'tick'});
e=advanceBmr(e,{type:'answer',id:'request',targets:['1','3']});assert.match(e.out.retry,/선택할 수 없는 참가자: 악마\n/);assert(!e.out.retry.includes('좀비얼'));
console.log('PASS named Chambermaid retries for either/both invalid targets, impaired actor, reselection, hidden roles and Zombuul');
