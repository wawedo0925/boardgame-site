const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const exportsObject={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/events/GameResultStats.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:exportsObject,require:id=>id==='react/jsx-runtime'?{jsx:(type,props)=>({type,props})}:id==='react'?{}:id.includes('supabase')?{}:require('../'+id.replace('@/','')+'.ts')});
const stats={average_score:8.9,high_score:18,score_count:12,good_rate:60,evil_rate:40,role_count:5,success_rate:75,coop_count:4};
const render=(name,result_type='ROLE',type='ROLE',data=stats)=>exportsObject.default({game:{result_type,game:{name,type}},stats:data});
for(const name of ['데스 스테이션 (Death Station)','데스스테이션','Death Station','울프스트리트'])assert.equal(render(name).props.children,'평균 8.9 · 최고 18');
assert.equal(render('아발론').props.children,'선 60% · 악 40%');assert.equal(render('협력 게임','ROLE','COOP').props.children,'성공 75%');assert.equal(render('점수 게임','SCORE','SCORE').props.children,'평균 8.9 · 최고 18');
assert.equal(render('데스 스테이션','ROLE','ROLE',{...stats,score_count:0}).props.children,'기록 없음');assert.ok(render('데스 스테이션').props.title.endsWith('12건'));
console.log('PASS: score-based role games, localized names, true role win rates, cooperative success and empty records');
