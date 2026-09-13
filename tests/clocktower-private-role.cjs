const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
let held=false;const listeners={};const react={useState:()=>[held,v=>held=v],useEffect:fn=>fn()};
const m={exports:{}};
const windowMock={addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener:()=>{}};
const documentMock={visibilityState:'visible',...windowMock};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/events/ClocktowerPrivateRole.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,{module:m,exports:m.exports,require:name=>name==='react'?react:require(name),window:windowMock,document:documentMock});
const render=()=>m.exports.default({role:'임프'});
const event={isPrimary:true,button:0,pointerId:1,currentTarget:{setPointerCapture(){},getBoundingClientRect:()=>({left:0,right:100,top:0,bottom:100})}};
assert.ok(!JSON.stringify(render()).includes('임프'));
render().props.onPointerDown(event);assert.ok(JSON.stringify(render()).includes('임프'));
for(const name of ['onPointerUp','onPointerCancel','onLostPointerCapture','onPointerLeave','onBlur']){held=true;render().props[name]();assert.equal(held,false,name);}
held=true;render().props.onPointerMove({...event,clientX:101,clientY:50});assert.equal(held,false);
held=true;listeners.blur();assert.equal(held,false);
held=true;documentMock.visibilityState='hidden';listeners.visibilitychange();assert.equal(held,false);
render().props.onKeyDown({key:' ',repeat:false,preventDefault(){}});assert.equal(held,true);render().props.onKeyUp({key:' ',preventDefault(){}});assert.equal(held,false);
assert.equal(m.exports.default({role:null}).props.disabled,true);
console.log('PASS: hidden by default, hold reveal, release/cancel/leave/blur conceal, app switch, keyboard, unassigned');
