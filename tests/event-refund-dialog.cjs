const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('components/events/EventLeaveRefundDialog.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const tick=()=>new Promise(setImmediate);
async function fixture(result={error:null}) {
 let index=0,slots=[],effects=[],calls=[],closed=0,left=0,resolve;
 const jsx=(type,props)=>({type,props}),exports={};
 const client={from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{bank:'저장은행',account_number:'123456789'},error:null})})})}),rpc:async(name,args)=>{calls.push({name,args});return await new Promise(r=>{resolve=()=>r(result);});}};
 const slot=f=>{const i=index++; if(!(i in slots))slots[i]=f(); return [i,slots[i]];};
 vm.runInNewContext(code,{exports,require:id=>{
  if(id==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(id==='react')return {useState:v=>{const[i,x]=slot(()=>v);return [x,y=>slots[i]=y];},useRef:v=>slot(()=>({current:v}))[1],useMemo:f=>slot(f)[1],useEffect:f=>{const[i]=slot(()=>false);if(!slots[i]){slots[i]=true;effects.push(f);}}};
  if(id==='@/lib/supabase/client')return {createClient:()=>client};throw Error(id);
 }});
 let tree;
 const render=()=>{index=0;tree=exports.default({eventId:'event',userId:'member',onClose:()=>closed++,onLeft:async()=>left++});const next=effects;effects=[];next.forEach(f=>f());return tree;};
 const find=(predicate,node=tree)=>{if(!node)return null;if(Array.isArray(node)){for(const n of node){const r=find(predicate,n);if(r)return r;}return null;}return predicate(node)?node:find(predicate,node.props?.children ?? null);};
 render(); await tick();render();
 return {render,find,calls,finish:async()=>{resolve();await tick();render();},get closed(){return closed;},get left(){return left;}};
}
(async()=>{
 const f=await fixture();
 f.find(n=>n.props?.children==='응!').props.onClick();f.render();
 const choices=f.find(n=>n.type==='fieldset').props.children[0];
 const bankCheckbox=choices[1].props.children[0];bankCheckbox.props.onChange();f.render();
 assert.equal(f.find(n=>n.type==='input'&&n.props.inputMode==='numeric').props.value,'123456789');
 assert.equal(f.find(n=>n.type==='input'&&n.props.placeholder==='은행 이름을 입력해 주세요').props.value,'저장은행');
 const submit=f.find(n=>n.type==='form').props.onSubmit;
 submit({preventDefault(){}});submit({preventDefault(){}});await tick();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].args.p_method,'BANK');assert.equal(f.calls[0].args.p_account_number,'123456789');
 await f.finish();assert.equal(f.closed,1);assert.equal(f.left,1);
 const fail=await fixture({error:{message:'저장 실패'}});
 fail.find(n=>n.props?.children==='놉!혜택참여').props.onClick();await tick();await fail.finish();
 assert.equal(fail.closed,0);assert.equal(fail.left,0);assert.equal(fail.find(n=>n.props?.role==='alert').props.children,'저장 실패');
 assert.equal(fail.calls[0].args.p_method,'NONE');assert.equal(fail.calls[0].args.p_account_number,null);
 const k=await fixture();k.find(n=>n.props?.children==='응!').props.onClick();k.render();
 k.find(n=>n.type==='fieldset').props.children[0][0].props.children[0].props.onChange();k.render();
 assert.equal(k.find(n=>n.type==='input'&&n.props.inputMode==='numeric').props.disabled,true);
 k.find(n=>n.type==='form').props.onSubmit({preventDefault(){}});await tick();await k.finish();
 assert.equal(k.calls[0].args.p_method,'KAKAOPAY');assert.equal(k.calls[0].args.p_bank,null);assert.equal(k.closed,1);
 console.log('PASS: actual dialog preset loading, mutually exclusive methods, disabled account inputs, duplicate click guard, failure retention, BANK/KAKAOPAY/NONE payloads');
})().catch(e=>{console.error(e);process.exitCode=1;});
