const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('components/events/CooperativeResultDialog.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
function find(n,p){if(!n)return null;if(Array.isArray(n)){for(const v of n){const r=find(v,p);if(r)return r;}return null;}return p(n)?n:find(n.props?.children,p);}
function fixture(players){let states=[],i=0,tree,payload,closed=false;const exports={};const jsx=(type,props)=>({type,props});vm.runInNewContext(code,{exports,require:id=>{
 if(id==='react')return {useMemo:f=>f(),useState:v=>{const x=i++;if(!(x in states))states[x]=v;return [states[x],s=>states[x]=typeof s==='function'?s(states[x]):s];}};
 if(id==='react/jsx-runtime')return {jsx,jsxs:jsx};if(id.endsWith('supabase/client'))return {createClient:()=>({from:()=>({upsert:async value=>{payload=value;return {error:null};}})})};if(id.endsWith('services/rounds'))return {};throw Error(id);
}});
const render=()=>{i=0;tree=exports.default({round:{id:'round',players},onClose:()=>closed=true,onSaved:async()=>{}});};render();return {button:label=>find(tree,n=>n.type==='button'&&n.props.children===label),click:label=>{const b=find(tree,n=>n.type==='button'&&n.props.children===label);assert.ok(b,label);b.props.onClick();render();},render,get payload(){return payload;},get closed(){return closed;}};}
const base=[{user_id:'a',score:null,is_winner:null},{user_id:'b',score:null,is_winner:null},{user_id:'gm',score:null,is_winner:null,is_gm:true}];
(async()=>{
 for(const playerWins of [true,false]){
  const f=fixture(base);f.click('반 협력 모드');f.click('배신자');assert.equal(f.button('결과 저장').props.disabled,true);
  f.click(playerWins?'플레이어 승리':'배신자 승리');f.click('결과 저장');await new Promise(setImmediate);
  assert.equal(f.payload[0].team_name,'반협력 배신자');assert.equal(f.payload[0].is_winner,!playerWins);
  assert.equal(f.payload[1].team_name,'반협력 플레이어');assert.equal(f.payload[1].is_winner,playerWins);
  assert.equal(f.payload[2].is_gm,true);assert.equal(f.payload[2].team_name,null);assert.equal(f.payload[2].is_winner,null);
  assert.equal(f.closed,true);
  const reopened=fixture(f.payload);assert.equal(reopened.button(playerWins?'플레이어 승리':'배신자 승리').props['aria-pressed'],true);
  assert.ok(reopened.button('✓ 반 협력 모드 · 누르면 일반 협력으로'));
  reopened.click('✓ 반 협력 모드 · 누르면 일반 협력으로');reopened.click('팀 승리');reopened.click('결과 저장');await new Promise(setImmediate);
  assert.equal(reopened.payload[0].team_name,'협력 팀');assert.equal(reopened.payload[0].role_name,null);assert.equal(reopened.payload[0].is_winner,true);
 }
 for(const win of [true,false]){const f=fixture(base);f.click('반 협력 모드');assert.equal(f.button('배신자 승리'),null);f.click(win?'플레이어 승리':'플레이어 패배');f.click('결과 저장');await new Promise(setImmediate);for(const p of f.payload.slice(0,2)){assert.equal(p.team_name,'반협력 플레이어');assert.equal(p.is_winner,win);}}
 const output={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/cooperative.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:output});
 assert.equal(output.cooperativeResultLabel({team_name:'반협력 배신자',is_winner:true,score:null}),'반협력 · 배신자 · 승리');
 assert.equal(output.cooperativeResultLabel({team_name:'반협력 플레이어',is_winner:false,score:5}),'반협력 · 플레이어 · 패배 · 5점');
 console.log('PASS: both factions win, no-traitor victory/defeat, GM exclusion, saved mode/role/outcome restore, switching back clears roles, shared result labels');
})().catch(e=>{console.error(e);process.exitCode=1;});
