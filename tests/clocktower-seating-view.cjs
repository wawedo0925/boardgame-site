const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/clocktower/seating-view.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:m.exports,module:m});
const layout={a:{x:100,y:100},b:{x:900,y:600},c:{x:500,y:350}};const original=JSON.stringify(layout);
const dx=800*m.exports.SEATING_X_SCALE,dy=500*m.exports.SEATING_Y_SCALE,minY=(100-40)*m.exports.SEATING_Y_SCALE;
for(const angle of [0,45,90,180,270,360]){const g=m.exports.seatingView(layout,angle);assert.ok(Math.abs(Math.min(...Object.values(g.positions).map(p=>p.y))-minY)<0.001);for(const p of Object.values(g.positions)){assert.ok(p.y<=g.height+0.001);assert.ok(p.x<=g.width+0.001);}assert.ok(Math.abs(Math.hypot(g.positions.a.x-g.positions.b.x,g.positions.a.y-g.positions.b.y)-Math.hypot(dx,dy))<0.001);}
assert.equal(JSON.stringify(layout),original);assert.equal(m.exports.seatingView(layout,0).height,m.exports.SEATING_EDIT_HEIGHT);
console.log('PASS: rotation preserves distances, top gap, bounds, and saved layout');

for(const x of [60,100,500,900,940])for(const y of [40,100,350,600,660]) {
 const g=m.exports.seatingView({a:{x,y}},0), p=m.exports.seatingPoint(g.positions.a.x,g.positions.a.y);
 assert.ok(Math.abs(p.x-x)<1e-9 && Math.abs(p.y-y)<1e-9);
}
const edges=m.exports.seatingView({a:{x:60,y:40},b:{x:940,y:660}},0);
assert.equal(edges.positions.a.x,0);assert.equal(edges.positions.b.x,edges.width);
assert.equal(edges.positions.a.y,0);assert.equal(edges.positions.b.y,edges.height);
console.log('PASS: every visible grid edge maps to a valid persisted seat coordinate');
