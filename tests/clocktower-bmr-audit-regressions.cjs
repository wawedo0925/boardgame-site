const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const {startBmr,advanceBmr,bmrImpaired,bmrProjection}=require('../lib/clocktower/bmr-engine.ts');
const roster=roles=>roles.map((role,i)=>({user_id:String(i),name:`P${i}`,seat:i+1,alive:true,actual_role:role,shown_role:role}));
const fixture=roles=>startBmr(roster(roles));
function task(e,role,night=2){e=structuredClone(e);e.phase='NIGHT';e.night=night;e.tasks=[{actor:e.players.find(p=>p.role===role).id,role,key:role+night}];e.cursor=0;e.finished=false;delete e.pending;delete e.review;delete e.waiting;return advanceBmr(e,{type:'tick'});}
const answer=(e,targets)=>advanceBmr(e,{type:'answer',id:'request',targets});
const endNight=e=>{e.tasks=[];e.cursor=0;e.finished=false;return advanceBmr(e,{type:'tick'});};
// A registered-dead Zombuul still counts toward the actual victory threshold.
for(const life of ['ALIVE','ZOMBIE'])for(const livingOthers of [1,2,3]){
 let e=fixture(['좀비얼','암살자','교수','객실 청소부','할머니']);e.players[0].life=life;
 e.players.slice(1).forEach((p,i)=>p.life=i<livingOthers?'ALIVE':'DEAD');
 e=endNight(e);assert.equal(e.winner,livingOthers===1?'EVIL':undefined);
 if(life==='ZOMBIE')assert.equal(bmrProjection(e)[0].bmr.life,'ZOMBIE','private victory counting must not reveal the demon');
}
let e=fixture(['좀비얼','암살자','교수','객실 청소부','할머니']);e.players[0].life='ZOMBIE';e.players[1].life='DEAD';e.players[4].life='DEAD';e.phase='DAY';
assert.equal(advanceBmr(e,{type:'execution',target:'0'}).winner,'GOOD','second execution kills actual demon');
e=fixture(['좀비얼','주모자','교수','객실 청소부','할머니']);e.players[0].life='ZOMBIE';e.phase='DAY';
e=advanceBmr(e,{type:'execution',target:'0'});assert.equal(e.winner,undefined);assert(e.mastermind,'Mastermind still delays victory');
// Saved manual flags survive first-night initialization, serialization and projection.
for(const drunk of [false,true])for(const poisoned of [false,true])for(const protectedFlag of [false,true]){
 const members=roster(['선원','푸카','교수','암살자','객실 청소부']);
 members[0].bmr={life:'ALIVE',faction:'GOOD',spent:false,drunk,poisoned,protected:protectedFlag};
 const saved=structuredClone(members);e=JSON.parse(JSON.stringify(startBmr(members)));
 assert.equal(bmrImpaired(e,'0'),drunk||poisoned);assert.deepEqual(members,saved);
 const status=bmrProjection(e)[0].bmr;assert.equal(status.drunk,drunk);assert.equal(status.poisoned,poisoned);
 assert.equal(status.protected,protectedFlag||!(drunk||poisoned));
}
// Only an alignment change wakes the Goon; same alignment, impairment and subsequent picks do not.
for(const sameTeam of [false,true])for(const impaired of [false,true]){
 e=fixture(['샤발로스','건달','객실 청소부','교수','암살자','할머니','어릿광대']);
 e.players[1].faction=sameTeam?'EVIL':'GOOD';e.manual['1']={drunk:impaired,poisoned:false,protected:false};
 e=answer(task(e,'샤발로스'),['1','3']);
 assert.equal(e.awake.includes('1'),!sameTeam&&!impaired);
 if(!impaired){
  e=answer(task(e,'객실 청소부'),['1','3']);assert.equal(e.out.resolved.result,sameTeam?'0명':'1명');
 }
}
e=fixture(['샤발로스','건달','객실 청소부','교수','암살자','할머니','어릿광대']);e.reviewEnabled=true;
e=answer(task(e,'샤발로스'),['1','3']);assert(e.review);assert(!e.awake.includes('1'),'review must not apply the wake early');
e=advanceBmr(JSON.parse(JSON.stringify(e)),{type:'approve'});assert.equal(e.awake.filter(id=>id==='1').length,1);
e.reviewEnabled=false;e=answer(task(e,'객실 청소부'),['1','3']);assert.equal(e.out.resolved.result,'1명');
e.phase='DAY';e=advanceBmr(e,{type:'execution',target:null});assert.deepEqual(e.awake,[],'new night resets wake history');
console.log('PASS Zombuul actual/public life, victory and Mastermind; all manual flag combinations; Goon wake, impairment, approval and night reset');
