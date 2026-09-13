const assert=require('node:assert/strict'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(require('fs').readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const {beginNight,propose,approveEffects}=require('../lib/clocktower/night.ts');
const task={user_id:'0',role:'초공감자',key:'test'};
for(const mode of ['healthy','drunk-role','drunk-condition','poison-condition','poisoner']){
 for(let count=0;count<=2;count++){
  const roles=['초공감자',count>=1?'남작':'군인','독살범',count===2?'임프':'성자'];
  const members=roles.map((r,i)=>({user_id:String(i),seat:i+1,name:'P'+i,alive:true,actual_role:r,shown_role:r}));
  if(mode==='drunk-role')members[0].actual_role='주정뱅이';
  let e=beginNight(undefined,1,members);
  if(mode==='drunk-condition')e.conditions['0']={drunk:true};
  if(mode==='poison-condition')e.conditions['0']={poisoned:true};
  if(mode==='poisoner')e.poison={source:'2',target:'0',night:1};
  let p=propose(task,[],e,members);
  assert.equal(p.result,String(mode==='healthy'?count:count>0?0:1),mode+' '+count);
  if(mode==='drunk-role'){
   // A previously cached "2" must not bypass the new default.
   e.drunkFalseAnswers={[JSON.stringify(['0','초공감자',['1','3']])]:'2'};
   p=propose(task,[],e,members);
   assert.equal(p.result,count>0?'0':'1');
   e=approveEffects(task,[],e,members,{...p,result:p.truthResult}).state;
   e=beginNight(JSON.parse(JSON.stringify(e)),2,members);
   assert.equal(propose(task,[],e,members).result,count>0?'0':'1');
  }
  if(mode==='poisoner'){
   members[2].alive=false;
   assert.equal(propose(task,[],e,members).result,String(count));
  }
 }
}
// Skip dead seats when finding the two living neighbours.
const members=['주정뱅이','군인','남작','성자'].map((r,i)=>({user_id:String(i),seat:i+1,name:'P'+i,alive:i!==1,actual_role:r,shown_role:i===0?'초공감자':r}));
assert.equal(propose(task,[],beginNight(undefined,1,members),members).result,'0');
console.log('PASS: Empath 0/1/2 counts, Drunk/manual/Poisoner states, legacy memory, truth override, poison removal, dead neighbour skip');
