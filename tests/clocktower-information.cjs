const assert=require('node:assert/strict');const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(require('fs').readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const {randomAssignments}=require('../lib/clocktower/setup.ts');
const {randomInformation,informationErrors,rosterKey}=require('../lib/clocktower/information.ts');
const {beginNight,propose,emptyEngine}=require('../lib/clocktower/night.ts');
const make=roles=>roles.map((role,i)=>({user_id:String(i),name:`P${i}`,seat:i+1,actual_role:role,shown_role:role,alive:true}));
let cases=0;
for(let n=5;n<=15;n++)for(const baron of ['random','include','exclude'])for(let repeat=0;repeat<40;repeat++){
 const members=randomAssignments(Array.from({length:n},(_,i)=>String(i)),baron).map((row,i)=>({...row,name:`P${i}`,seat:i+1,alive:true}));
 const draft=randomInformation(members);
 assert.deepEqual(informationErrors(draft.information,draft.red_herring,members),[],JSON.stringify({members,draft}));cases++;
}
let members=make(['세탁부','사서','수사관','주정뱅이','은둔자','첩자','임프','초공감자','점쟁이']);members[3].shown_role='군인';
let draft=randomInformation(members);draft.information.registrations={'4':'독살범','5':'시장'};
draft.information.clues={'0':{role:'시장',correct:'5',decoy:'6'},'1':{role:'주정뱅이',correct:'3',decoy:'7'},'2':{role:'독살범',correct:'4',decoy:'8'}};
assert.deepEqual(informationErrors(draft.information,draft.red_herring,members),[]);
const snapshot=structuredClone(draft);let engine={...emptyEngine(),...draft};engine=beginNight(engine,1,members);
for(const [id,role] of [['0','시장'],['1','주정뱅이'],['2','독살범']]){
 const result=propose({user_id:id,role:members[Number(id)].shown_role,key:id},[],engine,members).result;
 assert.ok(result.includes(role));assert.ok(!result.includes('정답'));assert.ok(!result.includes('오인'));
}
assert.deepEqual(draft,snapshot,'preparing a night must not mutate saved choices');
let bad=structuredClone(draft);bad.information.bluffs[0]='군인';assert.ok(informationErrors(bad.information,bad.red_herring,members).length);
bad=structuredClone(draft);bad.information.clues['0'].decoy='5';assert.ok(informationErrors(bad.information,bad.red_herring,members).length);
assert.ok(informationErrors(draft.information,'6',members).length);
assert.ok(informationErrors(draft.information,draft.red_herring,members.map(m=>m.user_id==='7'?{...m,actual_role:'요리사',shown_role:'요리사'}:m)).length);
const demon=propose({user_id:'6',role:'악마 정보',key:'demon'},[],engine,members);for(const role of draft.information.bluffs)assert.ok(demon.result.includes(role));
engine.conditions['5']={poisoned:true};assert.ok(propose({user_id:'0',role:'세탁부',key:'washer'},[],engine,members).requiresChoice,'poisoned Spy invalidates prepared disguise');
members=make(['초공감자','은둔자','점쟁이','임프','첩자']);engine={...emptyEngine(),night:2,red_herring:'0',information:{roster:rosterKey(members),bluffs:[],clues:{},registrations:{'1':'임프','4':'시장'}}};
assert.equal(propose({user_id:'0',role:'초공감자',key:'empath'},[],engine,members).result,'1');
assert.equal(propose({user_id:'2',role:'점쟁이',key:'ft'},['1','4'],engine,members).result,'악마가 있습니다.');
engine.conditions['1']={poisoned:true};assert.equal(propose({user_id:'2',role:'점쟁이',key:'ft'},['1','4'],engine,members).result,'악마가 없습니다.');
engine.conditions={};members[1].alive=false;assert.equal(propose({user_id:'2',role:'점쟁이',key:'ft'},['1','4'],engine,members).result,'악마가 있습니다.','dead Recluse retains registration ability');
console.log(`Passed ${cases} random preparation cases, stored clues/bluffs, decoy privacy, stale roster, Drunk exclusion and impaired/dead registrations.`);
