const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/clocktower/seating-view.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:m.exports,module:m});
const layout={a:{x:100,y:100},b:{x:900,y:600},c:{x:500,y:350}};const original=JSON.stringify(layout);
for(const angle of [0,45,90,180,270,360]){const g=m.exports.seatingView(layout,angle);assert.ok(Math.abs(Math.min(...Object.values(g.positions).map(p=>p.y))-150)<0.001);for(const p of Object.values(g.positions)){assert.ok(p.y+72<=g.height);assert.ok(p.x+72<=g.width);}assert.ok(Math.abs(Math.hypot(g.positions.a.x-g.positions.b.x,g.positions.a.y-g.positions.b.y)-Math.hypot(480,750))<0.001);}
assert.equal(JSON.stringify(layout),original);assert.equal(m.exports.seatingView(layout,0).height,980);
console.log('PASS: rotation preserves distances, top gap, bounds, and saved layout');
