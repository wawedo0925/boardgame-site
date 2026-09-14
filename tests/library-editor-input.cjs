const assert=require('node:assert/strict'),vm=require('vm'),fs=require('fs'),ts=require('typescript');
const source=ts.transpileModule(fs.readFileSync('app/admin/library/ExistingLibraryEditor.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
const states=['BOARDGAME',[],'',{id:'test'},{name:''},false,false,''];let cursor=0;
const exportsObject={};
const jsx=(type,props)=>({type,props});
vm.runInNewContext(source,{exports:exportsObject,require:id=>{
  if(id==='react')return {useEffect:()=>{},useMemo:f=>f(),useState:initial=>{const i=cursor++;if(!(i in states))states[i]=initial;return [states[i],value=>{states[i]=typeof value==='function'?value(states[i]):value;}];}};
  if(id==='react/jsx-runtime')return {jsx,jsxs:jsx};
  if(id.endsWith('supabase/client'))return {createClient:()=>({})};
  throw Error(id);
}});
function find(node,predicate){if(!node)return;if(Array.isArray(node))return node.map(n=>find(n,predicate)).find(Boolean);if(predicate(node))return node;return find(node.props?.children,predicate);}
function renderField(){cursor=0;return find(exportsObject.default(),n=>typeof n.type==='function'&&n.props.name==='name');}
let field=renderField();const stableType=field.type;
for(const value of ['ㅎ','하','한','한ㄱ','한글','한글 게임']){
  const input=find(field.type(field.props),n=>n.type==='input');
  input.props.onChange({target:{value}});
  field=renderField();
  assert.equal(field.type,stableType,'Typing must not replace the field component and lose IME composition/focus');
  assert.equal(find(field.type(field.props),n=>n.type==='input').props.value,value);
}
console.log('PASS: input identity and text preserved through consecutive Korean composition updates');
