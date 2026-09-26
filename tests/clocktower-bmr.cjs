const assert=require('node:assert/strict'),fs=require('fs'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const {BMR_ROLES,BMR_FIRST,BMR_OTHER,bmrPreset,bmrRandomRoles,bmrSetupErrors,bmrExecutionCandidate,bmrInformationDraft}=require('../lib/clocktower/bmr.ts');
assert.deepEqual(['주민','외지인','하수인','악마'].map(t=>BMR_ROLES.filter(r=>r.type===t).length),[13,4,4,4]);
assert.deepEqual(BMR_FIRST,['황혼','하수인 정보','미치광이','악마 정보','선원','궁정대신','대부','악마의 변호사','푸카','할머니','객실 청소부','새벽']);
assert.ok(BMR_OTHER.indexOf('미치광이')<BMR_OTHER.indexOf('구마사제'));
assert.ok(BMR_OTHER.indexOf('교수')<BMR_OTHER.indexOf('객실 청소부'));
for(let n=5;n<=15;n++)for(let i=0;i<100;i++){
 const draft=bmrRandomRoles(Array.from({length:n},(_,j)=>({user_id:String(j),name:'P'+j,seat:j+1,alive:true})));
 assert.deepEqual(bmrSetupErrors(draft),[],`invalid random ${n}`);
 const draftInfo=bmrInformationDraft('악마 정보',draft);
 assert.ok(!draftInfo.includes('undefined'));
}
assert.equal(bmrPreset('포',2,true).count,3);assert.equal(bmrPreset('포',2,true).options.pass,false);
assert.equal(bmrPreset('포',2,false).options.pass,true);
assert.equal(bmrPreset('궁정대신',1).options.character,true);assert.equal(bmrPreset('도박사',2).options.character,true);
assert.equal(bmrPreset('객실 청소부',1).self,false);
assert.equal(bmrExecutionCandidate([{nominee:'a',status:'DONE',threshold:2,ballots:{a:true,b:true}},{nominee:'b',status:'DONE',threshold:2,ballots:{a:true,b:true}}]),null);
assert.equal(bmrExecutionCandidate([{nominee:'a',status:'DONE',threshold:2,ballots:{a:true,b:false}}]),null);
assert.equal(bmrExecutionCandidate([{nominee:'a',status:'DONE',threshold:2,ballots:{a:true,b:true}}]),'a');
console.log('PASS: 25 roles, photo night order, 1100 random rosters, Godfather composition, Po/Courtier/Gambler requests, tied executions');
