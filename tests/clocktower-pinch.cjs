const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const refs = []; let cursor = 0; let effects = []; let scale = 1; let next = 1; let cancelled = 0;
const react = {useRef(value) {const i=cursor++;return refs[i]??(refs[i]={current:value});},useLayoutEffect(fn){effects.push(fn);}};
const moduleStub={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/events/useClocktowerPinch.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module:moduleStub,exports:moduleStub.exports,require:()=>react,Element:class {}});
const hook=moduleStub.exports.default;
const captured=new Set();
const element={scrollLeft:200,scrollTop:150,getBoundingClientRect:()=>({left:0,top:0}),scrollTo(p){this.scrollLeft=p.left;this.scrollTop=p.top;},setPointerCapture(id){captured.add(id);},hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id)};
const viewport={current:element};
function render(){cursor=0;effects=[];const h=hook(viewport,scale,v=>next=v,false,()=>cancelled++);effects.forEach(f=>f());return h;}
function event(id,x,y){return {pointerType:'touch',pointerId:id,clientX:x,clientY:y,currentTarget:element,target:{},preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}};}
let h=render();
h.onPointerDownCapture(event(1,100,100));h.onPointerDownCapture(event(2,200,100));
h.onPointerMoveCapture(event(2,300,100));assert.equal(next,2);
scale=next;h=render();assert.equal(element.scrollLeft,500);assert.equal(element.scrollTop,400);
h.onPointerUpCapture(event(1,100,100));h.onPointerUpCapture(event(2,300,100));
let click={detail:1,preventDefault(){this.prevented=true;},stopPropagation(){}};h.onClickCapture(click);assert.equal(click.prevented,true);
h.onPointerDownCapture(event(3,50,50));h.onPointerUpCapture(event(3,50,50));click={...click,prevented:false};h.onClickCapture(click);assert.equal(click.prevented,false);
h.onPointerDownCapture(event(4,100,100));h.onPointerMoveCapture(event(4,70,60));assert.equal(element.scrollLeft,530);assert.equal(element.scrollTop,440);h.onPointerCancelCapture(event(4,70,60));
h.onPointerDownCapture(event(5,0,0));h.onPointerDownCapture(event(6,100,0));h.onPointerMoveCapture(event(6,1000,0));assert.equal(next,2.5);h.onPointerMoveCapture(event(6,1,0));assert.equal(next,0.25);
assert.ok(cancelled>0);
console.log('PASS: pinch anchor, zoom limits, pan, tap, click suppression, cancellation');
