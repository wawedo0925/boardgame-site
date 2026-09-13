const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync('components/events/CooperativeResultDialog.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
async function check(won,score){
  let payload,saved=false;
  const exports={};
  const client={from:()=>({upsert:async values=>{payload=values;return {error:null};}})};
  const jsx=(type,props)=>({type,props});
  vm.runInNewContext(source,{exports,require:id=>{
    if(id==='react')return {useMemo:f=>f(),useState:v=>[v,()=>{}]};
    if(id==='react/jsx-runtime')return {jsx,jsxs:jsx};
    if(id==='@/lib/supabase/client')return {createClient:()=>client};
    if(id==='@/lib/services/rounds')return {};
    throw Error(id);
  }});
  const tree=exports.default({round:{id:'round',players:[{user_id:'a',is_winner:won,score,profile:{activity_name:'A'}},{user_id:'b',is_winner:won,score},{user_id:'gm',is_gm:true,is_winner:null,score:null}]},onClose:()=>{},onSaved:()=>{saved=true;}});
  function find(node){if(!node)return;if(Array.isArray(node))return node.map(find).find(Boolean);if(node.props?.children==='결과 저장')return node;return find(node.props?.children);}
  const button=find(tree);assert.equal(button.props.disabled,won===null);
  if(won===null)return;
  button.props.onClick();await new Promise(setImmediate);
  assert.equal(saved,true);assert.equal(payload.length,3);
  for(const row of payload.slice(0,2)){assert.equal(row.is_winner,won);assert.equal(row.score,score);assert.equal(row.rank,null);assert.equal(row.team_name,'협력 팀');}
  assert.equal(payload[2].is_gm,true);assert.equal(payload[2].is_winner,null);assert.equal(payload[2].score,null);
}
(async()=>{await check(true,null);await check(false,null);await check(true,42);await check(null,null);console.log('PASS: cooperative victory/defeat without scores, optional team score, GM exclusion, missing outcome guard');})().catch(e=>{console.error(e);process.exitCode=1;});
