const assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(require('fs').readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const {beginNight,propose,approveEffects}=require('../lib/clocktower/night.ts');
const {registeredRole}=require('../lib/clocktower/information.ts');
const make=roles=>roles.map((r,i)=>({user_id:String(i),seat:i+1,name:`P${i}`,alive:true,actual_role:r,shown_role:r}));
for(const role of ['수사관','세탁부','사서'])for(let i=0;i<50;i++){
 const members=make(['주정뱅이','남작','군인','성자','임프','첩자','은둔자']);members[0].shown_role=role;
 const e=beginNight(undefined,1,members);e.information={roster:'',bluffs:[],registrations:{'5':i%2?'군인':'','6':i%3?'남작':''},clues:{'0':{role:role==='수사관'?'남작':role==='세탁부'?'군인':'성자',correct:'1',decoy:'2'}}};
 const t={user_id:'0',role,key:'test'};const p=propose(t,[],e,members);
 assert.equal(p.result,p.falseResult);assert.ok(p.truthResult);assert.notEqual(p.result,p.truthResult);assert.ok(!p.requiresChoice);
 for(const [text,expected] of [[p.falseResult,false],[p.truthResult,true]]){
  const ids=[...text.matchAll(/번 P(\d+)/g)].map(x=>x[1]);const r=text.match(/중 한 명은 (.+)입니다/)[1];
  assert.equal(ids.some(id=>registeredRole(members[Number(id)],e.information)===r),expected,text);
 }
 assert.equal(members[0].actual_role,'주정뱅이');
}
for(const role of ['초공감자','요리사','점쟁이','장의사','까마귀지기']){
 const members=make(['주정뱅이','남작','군인','성자','임프']);members[0].shown_role=role;
 const e=beginNight(undefined,2,members);e.red_herring='2';e.execution={night:1,user_id:'1',role:'남작'};
 const t={user_id:'0',role,key:'test'},p=propose(t,role==='점쟁이'?['2','4']:['1'],e,members);
 assert.ok(p.truthResult);assert.equal(p.falseResult,p.result);assert.notEqual(p.truthResult,p.falseResult);
 const before=JSON.stringify(members);const effect=approveEffects(t,[],e,members,{...p,result:p.truthResult});assert.equal(JSON.stringify(members),before);assert.equal(effect.changes.length,0);
}
console.log('PASS: 150 Drunk clue combinations, false/true validity with registrations, five information roles, no restored ability effects');
