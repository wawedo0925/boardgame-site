const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const React=require('react');
const {renderToStaticMarkup}=require('react-dom/server');
function load(path,resolve){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require:resolve});return m.exports.default;}
const Slayer=load('components/events/ClocktowerSlayer.tsx',name=>{
 if(name==='@/lib/clocktower/night')return {emptyEngine:()=>({}),impaired:m=>m.drunk===true};
 if(name==='./ClocktowerPopup')return {default:({children})=>React.createElement('div',null,children)};
 if(name==='./ClocktowerSlayerAlert')return {default:({actor,target,children})=>React.createElement('aside',{'data-alert':'slayer'},actor+' → '+target,children)};
 return require(name);
});
const members=[{user_id:'a',name:'선언자',alive:true,actual_role:'처단자'},{user_id:'b',name:'대상자',alive:true,actual_role:'임프'}];
const pending={id:'shot-1',actor:'a',target:'b',status:'PENDING'};
function render(state,props={}){return renderToStaticMarkup(React.createElement(Slayer,{state,run:async()=>true,busy:false,...props}));}
const base={my_id:'a',members,shots:[],votes:[]};
let html=render({...base,is_host:true,shots:[pending]});assert.match(html,/data-alert="slayer"/);assert.match(html,/선언자 → 대상자/);assert.match(html,/정상 처단자 능력/);
assert.doesNotMatch(render({...base,is_host:false,shots:[pending]}),/data-alert|정상 처단자 능력|판정 제안/);
assert.doesNotMatch(render({...base,is_host:true,shots:[pending]},{allowPopup:false}),/data-alert/);
assert.doesNotMatch(render({...base,is_host:true,shots:[{...pending,status:'DONE'}]}),/data-alert/);
html=render({...base,is_host:false,members:members.map(m=>m.user_id==='a'?{...m,alive:false}:m)});assert.match(html,/<button[^>]*disabled=""[^>]*>처단자 능력 사용 선언/);assert.match(html,/사망한 참가자는/);
html=render({...base,is_host:false,members:members.map(m=>({...m,actual_role:'주민'}))});assert.doesNotMatch(html,/<button[^>]*disabled=""[^>]*>처단자 능력 사용 선언/);
console.log('PASS: host alert, selected names, phase popup gating, player privacy, dead button, living bluff');
