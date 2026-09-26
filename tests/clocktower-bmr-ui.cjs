const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,f);
let values=[],cursor=0,calls=[];
const react={useState:initial=>{const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],v=>values[i]=typeof v==='function'?v(values[i]):v];}};
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/events/ClocktowerBmrHost.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,{module:mod,exports:mod.exports,require:n=>n==='react'?react:n==='@/lib/clocktower/bmr'?require('../lib/clocktower/bmr.ts'):n==='@/lib/clocktower/flow'?{nextFlowLabel:()=>''}:n.startsWith('./Clocktower')?{default:n}:require(n),confirm:()=>true});
function nodes(x){if(!x||typeof x!=='object')return [];if(Array.isArray(x))return x.flatMap(nodes);return [x,...nodes(x.props?.children)];}
function text(x){if(typeof x==='string'||typeof x==='number')return String(x);if(Array.isArray(x))return x.map(text).join('');return x?.props?text(x.props.children):'';}
const base={room:{id:'room',phase:'NIGHT',night:2,flow_revision:3},bmr_revision:7,bmr:{cursor:0,notes:'old'},members:[{user_id:'u',name:'Alice',seat:1,alive:true,actual_role:'선원',shown_role:'선원'}],requests:[]};
const run=async(action,data)=>{calls.push({action,data});return true;};
function render(state=base){cursor=0;return mod.exports.default({state,run,busy:false,error:''});}
(async()=>{
 let tree=render();nodes(tree).find(n=>n.type==='button'&&text(n).includes('Alice')).props.onClick();
 tree=render({...base,bmr_revision:8});const editor=nodes(tree).find(n=>typeof n.type==='function'&&n.type.name==='BmrMemberEditor');
 assert.equal(editor.props.revision,7,'member editor must retain opening revision across polling');
 values=[];tree=render();nodes(tree).find(n=>n.type==='button'&&text(n)==='진행 메모').props.onClick();
 tree=render({...base,bmr_revision:8});await nodes(tree).find(n=>typeof n.type==='function'&&n.type.name==='Notes').props.save('edited');
 assert.equal(calls.at(-1).data.bmr_revision,7,'notes save must reject stale draft');
 values=[];tree=render({...base,room:{...base.room,phase:'ENDED'}});nodes(tree).find(n=>n.type==='button'&&text(n)==='진행 메모').props.onClick();tree=render({...base,room:{...base.room,phase:'ENDED'}});
 assert.equal(nodes(tree).find(n=>typeof n.type==='function'&&n.type.name==='Notes').props.readOnly,true,'ended notes are read-only');
 console.log('PASS: polling preserves draft revisions; completed game notes cannot submit');
})().catch(e=>{console.error(e.message);process.exit(1)});
