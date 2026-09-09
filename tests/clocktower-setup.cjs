const assert=require('node:assert/strict');
const ts=require('typescript');
require.extensions['.ts']=(module,file)=>module._compile(ts.transpileModule(require('fs').readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,file);
const {composition,randomAssignments,validateAssignments,changeRole}=require('../lib/clocktower/setup.ts');
for(let n=5;n<=15;n++) for(const mode of ['random','include','exclude']) for(let run=0;run<100;run++){
 const rows=randomAssignments(Array.from({length:n},(_,i)=>String(i)),mode);
 assert.deepEqual(validateAssignments(rows),[],`${n}/${mode}`);
 assert.equal(new Set(rows.map(r=>r.user_id)).size,n);
 if(mode!=='random') assert.equal(rows.some(r=>r.actual_role==='남작'),mode==='include');
}
assert.deepEqual(composition(7,true),[3,2,1,1]);
assert.equal(composition(16,false),null);
let rows=randomAssignments(['1','2','3','4','5','6','7'],'exclude');
const minion=rows.find(r=>['독살범','첩자','탕녀'].includes(r.actual_role));
rows=changeRole(rows,minion.user_id,'남작');assert.deepEqual(validateAssignments(rows),[]);
rows=changeRole(rows,minion.user_id,'독살범');assert.deepEqual(validateAssignments(rows),[]);
rows[0]={...rows[1],user_id:rows[0].user_id};assert.ok(validateAssignments(rows).length);
console.log('Passed: 3,300 random setups, Baron transitions, invalid counts and duplicate roles.');
