const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function find(node,predicate){if(!node)return null;if(Array.isArray(node)){for(const n of node){const found=find(n,predicate);if(found)return found;}return null;}return predicate(node)?node:find(node.props?.children,predicate);}
const source=ts.transpileModule(fs.readFileSync('components/events/GroupPlaySection.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const group={id:'g',name:'우영 조',sessionId:null,ruleMasterUserId:'a',userIds:['a','b']};
const signature=JSON.stringify([group.name,['a','b'],'a']);
const states=[[group],[],[],null,[],null,null,[],{g:signature},false],refs=[];
let cursor=0,refCursor=0,calls=[],tree;const jsx=(type,props)=>({type,props}),exportsObject={};
vm.runInNewContext(source,{exports:exportsObject,alert:()=>{},window:{setTimeout:()=>{}},require:id=>{
 if(id==='react/jsx-runtime')return {jsx,jsxs:jsx};
 if(id==='react')return {useEffect:()=>{},useMemo:f=>f(),useCallback:f=>f,useRef:v=>{const i=refCursor++;return refs[i]??(refs[i]={current:v});},useState:v=>{const i=cursor++;if(!(i in states))states[i]=v;return[states[i],x=>states[i]=typeof x==='function'?x(states[i]):x];}};
 if(id.endsWith('supabase/client'))return {createClient:()=>({})};
 if(id.endsWith('services/groups'))return {getEventGroups:async()=>[{id:'g',members:[{user_id:'b'},{user_id:'c'}]}]};
 if(id.endsWith('services/events'))return {getEventGames:async()=>[]};
 if(id.endsWith('services/rounds'))return {createRound:async(...args)=>{calls.push(args);}};
 return {default:()=>null};
}});
function render(){cursor=0;refCursor=0;tree=exportsObject.default({eventId:'event',currentUserId:'admin',canManage:true,participants:['a','b','c'].map(user_id=>({user_id,attendance_status:'PRESENT',profile:{activity_name:user_id}}))});return tree;}
(async()=>{
 render();const history=find(tree,n=>typeof n.props?.onRepeat==='function');
 assert.equal(history.props.repeatDisabled,false);
 const game={id:'session'};await Promise.all([history.props.onRepeat(game),history.props.onRepeat(game)]);
 assert.equal(calls.length,1,'double click creates one round');
 assert.equal(calls[0][1],'session');assert.deepEqual(Array.from(calls[0][2]),['b','c'],'use current confirmed server membership, not previous players or unsaved draft');assert.equal(calls[0][3],'g');
 render();find(tree,n=>n.props?.children==='인원 추가').props.onClick();render();
 find(tree,n=>n.props?.title==='눌러서 미배정으로 이동').props.onClick();render();
 assert.deepEqual(Array.from(states[0][0].userIds),['b']);assert.equal(states[0][0].ruleMasterUserId,null);
 assert.equal(find(tree,n=>typeof n.props?.onRepeat==='function').props.repeatDisabled,true,'confirm group changes before repeat');
 assert.equal(states[1].length,0,'removal does not modify previous results');
 console.log('PASS: repeat latest confirmed membership, double-click guard, removal to unassigned, rule master cleared, unsaved group repeat disabled');
})().catch(e=>{console.error(e);process.exitCode=1;});
