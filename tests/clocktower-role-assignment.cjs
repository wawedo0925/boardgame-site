const assert=require('node:assert/strict'),ts=require('typescript'),fs=require('fs');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const {assignBmrDraft,assignedRoleLabel}=require('../lib/clocktower/role-assignment.ts');
const {bmrRandomRoles,bmrSetupErrors}=require('../lib/clocktower/bmr.ts');
let members=[{user_id:'a',name:'우영',actual_role:'할머니',shown_role:'할머니'},{user_id:'b',name:'아라',actual_role:'도박사',shown_role:'도박사'},{user_id:'c',name:'병준',actual_role:'',shown_role:''}];
assert.equal(assignedRoleLabel('할머니',members),'할머니 (우영)');assert.equal(assignedRoleLabel('도박사',members),'도박사 (아라)');
const before=structuredClone(members);members=assignBmrDraft(members,'c','도박사');
assert.equal(members[1].actual_role,'');assert.equal(members[1].shown_role,'');assert.equal(members[2].actual_role,'도박사');
assert.equal(before[1].actual_role,'도박사');assert.equal(assignedRoleLabel('도박사',members),'도박사 (병준)');
assert.deepEqual(assignBmrDraft(members,'c','도박사'),members);
const lunatic=[{user_id:'l',name:'L',actual_role:'미치광이',shown_role:'포'},{user_id:'d',name:'D',actual_role:'포',shown_role:'포'}];
assert.equal(assignedRoleLabel('포',lunatic),'포 (D)');assert.equal(assignBmrDraft(lunatic,'d','포')[0].shown_role,'포');
for(let n=5;n<=15;n++){
 const random=bmrRandomRoles(Array.from({length:n},(_,i)=>({user_id:String(i),name:`P${i}`,seat:i+1,alive:true})));
 const changed=assignBmrDraft(random,'0',random[1].actual_role);
 assert.equal(changed[1].actual_role,'');assert(bmrSetupErrors(changed).length);
 assert.equal(changed.filter(m=>m.actual_role===random[1].actual_role).length,1);
}
console.log('PASS ownership labels, transfer, old owner clearing, no mutation, Lunatic disguise and random draft transfer');
