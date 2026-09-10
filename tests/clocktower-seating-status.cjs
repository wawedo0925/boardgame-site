const assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(require('fs').readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const {seatingStatus}=require('../lib/clocktower/seating-status.ts');const {emptyEngine}=require('../lib/clocktower/night.ts');
const target={user_id:'a',name:'A',alive:true,actual_role:'군인'},poisoner={user_id:'p',name:'P',alive:true,actual_role:'독살범'},monk={user_id:'m',name:'M',alive:true,actual_role:'수도사'};
const members=[target,poisoner,monk];const e={...emptyEngine(),night:1,poison:{source:'p',target:'a',night:1},protection:{source:'m',target:'a',night:1}};
for(const saved of [undefined,null,{}, {information:{},red_herring:'a'}, {conditions:null,masters:null}]) {
 assert(seatingStatus(target,members,saved,'SETUP',0).includes('악마로부터 안전'));
 assert.deepEqual(seatingStatus({...target,actual_role:'집사'},members,saved,'SETUP',0),saved?.red_herring==='a'?['점쟁이 허상']:[]);
}
assert.deepEqual(seatingStatus(target,members,e,'NIGHT',1),['중독','수도사 보호']);
assert.deepEqual(seatingStatus(target,members,e,'DAY',1),['중독']);
assert.deepEqual(seatingStatus(target,members,e,'NIGHT',2),['악마로부터 안전']);
assert(!seatingStatus(target,[target,{...poisoner,alive:false},monk],e,'DAY',1).includes('중독'));
assert(!seatingStatus(target,members,{...e,conditions:{m:{drunk:true}}},'NIGHT',1).includes('수도사 보호'));
assert(seatingStatus({...target,actual_role:'주정뱅이'},members,emptyEngine(),'DAY',1).includes('취함'));
console.log('Passed active poison, expired poison, dead source, impaired monk, day protection expiry and Drunk badges.');
