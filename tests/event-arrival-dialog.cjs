const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function compile(path,req){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:req,Date,Intl,Number});return exports;}
const helpers=compile('lib/event-arrival.ts',()=>{});
function fixture(kind){let slots=[],index=0,tree,calls=[];const jsx=(type,props)=>({type,props});
 const mod=compile('components/events/EventJoinPaymentDialog.tsx',id=>id==='react'?{useState:v=>{const i=index++;if(!(i in slots))slots[i]=v;return[slots[i],x=>slots[i]=x];}}:id==='react/jsx-runtime'?{jsx,jsxs:jsx}:helpers);
 const render=()=>{index=0;tree=mod.default({eventTitle:'모임',eventKind:kind,startedAt:'2026-09-21T09:00:00Z',endedAt:'2026-09-21T14:00:00Z',participationFee:10000,busy:false,waitlisted:false,onClose:()=>{},onConfirm:async x=>calls.push(x)});};
 const find=(test,node=tree)=>{if(!node)return null;if(Array.isArray(node)){for(const child of node){const result=find(test,child);if(result)return result;}return null;}return test(node)?node:find(test,node.props?.children ?? null);};
 const click=label=>{const node=find(n=>n.type==='button'&&n.props.children===label);assert.ok(node,label);node.props.onClick();render();};
 const submit=()=>{find(n=>n.type==='form').props.onSubmit({preventDefault(){}});render();};render();return{find,click,render,submit,calls};
}
const regular=fixture('BOARDGAME');assert.match(regular.find(n=>n.props?.children==='입완! 정참').props.className,/col-span-2/);
regular.click('입완! 늦참');let input=regular.find(n=>n.type==='input');input.props.onChange({target:{value:'2026-09-21T20:00'}});regular.render();regular.submit();assert.equal(regular.calls[0].arrivalAt,'2026-09-21T11:00:00.000Z');
const normal=fixture('GENERAL');normal.click('입완! 정참');assert.equal(normal.calls[0].arrivalAt,null);
const murder=fixture('MURDER_MYSTERY');murder.click('입완! 늦참');assert.equal(murder.calls.length,0);murder.click('확인');assert.equal(murder.find(n=>n.type==='input').props.max,'2026-09-21T18:10');murder.submit();assert.equal(murder.calls.length,0);murder.click('인지했습니다');assert.ok(murder.calls[0].arrivalAt);
const clock=fixture('CLOCKTOWER');clock.click('입완! 늦참');clock.click('예');assert.equal(clock.find(n=>n.type==='input').props.value,'2026-09-21T18:40');clock.click('뒤로가기');clock.click('아니요');clock.click('확인');assert.equal(clock.find(n=>n.type==='input').props.max,'2026-09-21T18:05');clock.submit();assert.equal(clock.calls[0].mode,'CLOCKTOWER_NEW');
const invalid=fixture('HOLDEM');invalid.click('입완! 늦참');invalid.find(n=>n.type==='input').props.onChange({target:{value:'2026-09-21T23:30'}});invalid.render();invalid.submit();assert.equal(invalid.calls.length,0);assert.ok(invalid.find(n=>n.props?.role==='alert'));
console.log('PASS dialog: button layout, regular time, normal join, murder notice and confirmation, clocktower branches/default/edit, invalid time');

