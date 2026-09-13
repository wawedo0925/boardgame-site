const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
let values=[],cursor=0,effects=[],now=0,tick,submitted;
const react={useState:initial=>{const i=cursor++;if(!(i in values))values[i]=typeof initial==='function'?initial():initial;return [values[i],v=>values[i]=typeof v==='function'?v(values[i]):v];},useEffect:fn=>effects.push(fn)};
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/events/ClocktowerNightActivity.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,{module:mod,exports:mod.exports,require:n=>n==='react'?react:n==='./ClocktowerSeating'?{ClocktowerName:()=>null}:require(n),Date:{now:()=>now},setInterval:fn=>(tick=fn,1),clearInterval:()=>{}});
const props={id:'test',prompt:'선택',members:[{user_id:'a',seat:1,name:'A'},{user_id:'b',seat:2,name:'B'}],count:1,busy:false,seconds:3,onConfirm:p=>submitted=p};
function render(p=props){cursor=0;effects=[];return mod.exports.default(p);}
function nodes(x){if(!x||typeof x!=='object')return [];if(Array.isArray(x))return x.flatMap(nodes);return [x,...nodes(x.props?.children)];}
const buttons=tree=>nodes(tree).filter(n=>n.type==='button');
let tree=render();effects[0]();let all=buttons(tree);
assert.equal(all.at(-1).props.disabled,true);
assert.equal(all[0].props.disabled,true);
all[0].props.onClick();all=buttons(render());assert.equal(all[0].props['aria-pressed'],false);
now=3000;tick();all=buttons(render());assert.equal(all[0].props.disabled,false);assert.equal(all.at(-1).props.disabled,true);
all[0].props.onClick();all=buttons(render());assert.equal(all.at(-1).props.disabled,false);
all.at(-1).props.onClick();assert.equal(submitted.join(','),'a');
// A single choice can be corrected directly by tapping someone else.
all[1].props.onClick();buttons(render()).at(-1).props.onClick();assert.equal(submitted.join(','),'b');
assert.equal(buttons(render({...props,busy:true})).at(-1).props.disabled,true);
values=[];now=0;tree=render({...props,count:0,message:'안내'});effects[0]();assert.equal(buttons(tree).at(-1).props.disabled,true);now=3000;tick();assert.equal(buttons(render({...props,count:0,message:'안내'})).at(-1).props.disabled,false);
for(let i=0;i<100;i++)assert.ok(mod.exports.activityDelay(String(i))>=1&&mod.exports.activityDelay(String(i))<=5);
assert.equal(mod.exports.activityDelay('x',99),5);
console.log('PASS: countdown gates selection and notice, choice required, change selection, busy lock, delay range');
