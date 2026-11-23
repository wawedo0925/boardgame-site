const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
const {startBmr,advanceBmr}=require('../lib/clocktower/bmr-engine.ts');
const {bmrNightPlayback,setBmrNightPlayback}=require('../lib/clocktower/bmr-night-control.ts');
const members=['푸카','주모자','객실 청소부','교수','평화주의자'].map((role,i)=>({user_id:String(i),name:'P'+i,seat:i+1,alive:true,actual_role:role,shown_role:role}));
let engine=startBmr(members);
assert.equal(bmrNightPlayback(engine,1),'waiting');
engine=setBmrNightPlayback(engine,'running');
assert.equal(bmrNightPlayback(JSON.parse(JSON.stringify(engine)),1),'running');
engine.players[3].spent=true;engine.phase='DAY';engine=advanceBmr(engine,{type:'execution',target:'0'});
assert(engine.mastermind);assert.equal(engine.phase,'NIGHT');assert.equal(engine.night,2);
assert.equal(bmrNightPlayback(engine,2),'waiting','Mastermind night must wait despite prior night start');
engine=setBmrNightPlayback(engine,'running');
engine=advanceBmr(engine,{type:'tick'});
assert.equal(engine.waiting.task.role,'객실 청소부');
const pending=structuredClone(engine.waiting),before=structuredClone(engine.players);
engine=setBmrNightPlayback(engine,'paused');
assert.deepEqual(engine.out,{notices:[]});assert.deepEqual(engine.waiting,pending);assert.deepEqual(engine.players,before);
assert.equal(bmrNightPlayback(JSON.parse(JSON.stringify(engine)),2),'paused');
engine=setBmrNightPlayback(engine,'running');assert.deepEqual(engine.waiting,pending);
assert.throws(()=>setBmrNightPlayback({...engine,finished:true},'running'));
assert.throws(()=>setBmrNightPlayback({...engine,phase:'DAY'},'running'));

// Render the real controller and run its effects: no automatic commit before host starts.
let values=[],cursor=0,effects=[],calls=[];
const react={useState:initial=>{const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],v=>values[i]=typeof v==='function'?v(values[i]):v];},useEffect:f=>effects.push(f)};
react.useRef=initial=>{const [v]=react.useState({current:initial});return v;};
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/events/ClocktowerBmrAutomatic.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,{module:mod,exports:mod.exports,require:n=>n==='react'?react:n==='@/lib/clocktower/flow'?{nextFlowLabel:()=> '밀담 시작'}:n.startsWith('./Clocktower')?{default:n}:n.startsWith('@/lib/')?require('../'+n.slice(2)+'.ts'):require(n),confirm:()=>true});
const nodes=x=>!x||typeof x!=='object'?[]:Array.isArray(x)?x.flatMap(nodes):[x,...nodes(x.props?.children)];
const text=x=>typeof x==='string'||typeof x==='number'?String(x):Array.isArray(x)?x.map(text).join(''):x?.props?text(x.props.children):'';
const run=async(action,data)=>{calls.push({action,data});return true;};
const base={room:{id:'room',phase:'NIGHT',night:1,flow_revision:1},members,requests:[],bmr:{information:{}},bmr_revision:1};
function render(state){cursor=0;effects=[];const tree=mod.exports.default({state,run,busy:false,error:'',allowPopup:true});effects.forEach(f=>f());return tree;}
const flush=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
 let tree=render(base);await flush();assert.equal(calls.length,0);
 const start=nodes(tree).find(n=>n.type==='button'&&text(n)==='밤 능력 진행 시작');assert(start);
 start.props.onClick();await flush();assert.equal(calls.length,1);
 let e=calls[0].data.auto;assert.equal(e.nightPlayback.status,'running');assert.deepEqual(e.out,{notices:[]});
 render({...base,bmr:{auto:e},bmr_revision:2});await flush();assert.equal(calls.length,2,'start enables automatic first task');
 // Reload during persisted pause must not issue or consume an already submitted request.
 e=setBmrNightPlayback(engine,'paused');values=[];calls=[];
 const state={...base,room:{...base.room,night:2},bmr:{auto:e},requests:[{id:'r',night:2,status:'SUBMITTED',targets:['2','3'],bmr_options:{engine_key:e.waiting.task.key}}]};
 tree=render(state);await flush();assert.equal(calls.length,0);assert(text(tree).includes('밤 능력 진행 재개'));
 nodes(tree).find(n=>n.type==='button'&&text(n)==='밤 능력 진행 재개').props.onClick();await flush();
 assert.equal(calls.length,1);assert.equal(calls[0].data.auto.out.request,undefined);
 assert.equal(calls[0].data.auto.nightPlayback.status,'running');
 // Every new night waits, including a legacy snapshot without playback metadata.
 for(const legacy of [false,true]){
  values=[];calls=[];let e=startBmr(members);e.night=2;
  if(!legacy)e.nightPlayback={night:1,status:'running'};
  tree=render({...base,room:{...base.room,night:2},bmr:{auto:e}});await flush();
  assert.equal(calls.length,0);assert(text(tree).includes('밤 능력 진행 시작'));
 }
 console.log('PASS manual night start, Mastermind/Pukka/Chambermaid timing, persisted pause/reload, no duplicate delivery, real controller gating and old-room compatibility');
})().catch(e=>{console.error(e);process.exitCode=1;});
