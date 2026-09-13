const assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(require('fs').readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const {beginNight,propose,approveEffects,emptyEngine}=require('../lib/clocktower/night.ts');
const make=()=>['주정뱅이','남작','군인','성자','임프'].map((r,i)=>({user_id:String(i),seat:i+1,name:`P${i}`,alive:true,actual_role:r,shown_role:i===0?'점쟁이':r}));
let members=make(),e=beginNight(undefined,1,members);e.red_herring='3';let task={user_id:'0',role:'점쟁이',key:'test'};
let p=propose(task,['1','4'],e,members),baseline=p.falseResult;
assert.equal(baseline,'악마가 없습니다.');
// Even choosing truth on the first encounter must save the false baseline, not truth.
e=approveEffects(task,['1','4'],e,members,{...p,result:p.truthResult}).state;
e=beginNight(JSON.parse(JSON.stringify(e)),2,members);
p=propose(task,['4','1'],e,members);assert.equal(p.result,baseline);assert.equal(p.truthResult,'악마가 있습니다.');
e=approveEffects(task,['4','1'],e,members,{...p,result:'이야기꾼 수정 문구'}).state;
e=beginNight(e,3,members);assert.equal(propose(task,['1','4'],e,members).result,baseline);
const priorKey=p.drunkMemoryKey;assert.notEqual(propose(task,['1','2'],e,members).drunkMemoryKey,priorKey);
members[4].actual_role='군인';p=propose(task,['1','4'],e,members);assert.equal(p.result,baseline);assert.equal(p.truthResult,baseline);assert.ok(p.reason.some(r=>r.includes('상황 변화')));
assert.equal(emptyEngine().drunkFalseAnswers,undefined);
// Empath remembers a neighbour pair even if its roles change; death produces a new key.
members=make();members[0].shown_role='초공감자';task={...task,role:'초공감자'};e=beginNight(undefined,1,members);p=propose(task,[],e,members);baseline=p.falseResult;const neighbourKey=p.drunkMemoryKey;
e=approveEffects(task,[],e,members,p).state;members[1].actual_role='군인';e=beginNight(e,2,members);assert.equal(propose(task,[],e,members).result,baseline);
members[1].alive=false;assert.notEqual(propose(task,[],e,members).drunkMemoryKey,neighbourKey);
assert.equal(members[0].actual_role,'주정뱅이');
console.log('PASS: persistent false baseline, reversed targets, truth/custom overrides expire, role changes warning, neighbour change, fresh game');
