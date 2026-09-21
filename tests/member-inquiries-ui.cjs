const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const code=ts.transpileModule(fs.readFileSync('components/inquiries/InquiryBoard.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
async function fixture(admin=false){let slots=[],index=0,effects=[],tree,calls=[],filters=[];const jsx=(type,props)=>({type,props}),exports={};
 const row={id:'item',user_id:'user',author_name:'멤버',is_anonymous:true,body:'내 문의',status:'RECEIVED',reply:null,created_at:'2026-09-21T00:00:00Z'};
 const q={select(){return this;},order(){return this;},range(){return this;},eq(k,v){filters.push([k,v]);return this;},then(resolve){return Promise.resolve({data:[row]}).then(resolve);}};
 const client={from:()=>q,rpc:async(name,args)=>{calls.push({name,args});return {error:null};}};
 const slot=f=>{const i=index++;if(!(i in slots))slots[i]=f();return[i,slots[i]];};
 vm.runInNewContext(code,{exports,Date,crypto:{randomUUID:()=> 'request-id'},require:id=>{
 if(id==='react/jsx-runtime')return{jsx,jsxs:jsx};if(id==='next/link')return{default:'a'};if(id.includes('supabase/client'))return{createClient:()=>client};
 if(id==='react')return{useState:v=>{const[i,x]=slot(()=>v);return[x,y=>slots[i]=typeof y==='function'?y(slots[i]):y];},useRef:v=>slot(()=>({current:v===null?{showModal(){},close(){}}:v}))[1],useMemo:f=>slot(f)[1],useCallback:f=>f,useEffect:f=>{const[i]=slot(()=>false);if(!slots[i]){slots[i]=true;effects.push(f);}}};throw Error(id);}});
 const render=()=>{index=0;tree=exports.default({userId:'user',admin});const pending=effects;effects=[];pending.forEach(f=>f());};
 const find=(test,node=tree)=>{if(!node)return null;if(Array.isArray(node)){for(const x of node){const r=find(test,x??null);if(r)return r;}return null;}return test(node)?node:find(test,node.props?.children??null);};
 render();await new Promise(setImmediate);render();return{render,find,calls,filters};
}
(async()=>{
 const member=await fixture();assert.deepEqual(member.filters[0],['user_id','user']);member.find(n=>n.props?.children==='문의/제보하기'&&n.type==='button').props.onClick();member.render();
 assert.equal(member.find(n=>n.type==='input'&&n.props.checked===true).props.name,'inquiry-mode');assert.ok(member.find(n=>typeof n.props?.children==='string'&&n.props.children.includes('메인 관리자는 작성자를')));
 member.find(n=>n.type==='input'&&n.props.checked===false).props.onChange();member.render();assert.ok(member.find(n=>typeof n.props?.children==='string'&&n.props.children.includes('카톡 1대1')));
 member.find(n=>n.type==='textarea').props.onChange({target:{value:'테스트 제보'}});member.render();const form=member.find(n=>n.type==='form');form.props.onSubmit({preventDefault(){}});form.props.onSubmit({preventDefault(){}});await new Promise(setImmediate);
 assert.equal(member.calls.length,1);assert.equal(member.calls[0].args.p_anonymous,false);
 const admin=await fixture(true);assert.equal(admin.filters.length,0);admin.find(n=>n.type==='li').props.children.props.onClick();admin.render();admin.find(n=>n.props?.children==='답변 없이 확인 완료').props.onClick();await new Promise(setImmediate);assert.equal(admin.calls[0].args.p_status,'CHECKED');
 console.log('PASS inquiry UI: own list filter, anonymous default, identity notice, named notice, submit double-click guard, admin acknowledgement');
})().catch(e=>{console.error(e);process.exitCode=1;});

