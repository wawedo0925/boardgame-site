const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/events/participation-count.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:m.exports,module:m,Intl,Date,Set});
const events=[
 {id:'clock-1',event_kind:'CLOCKTOWER',started_at:'2026-09-27T01:00:00Z',attendance_status:'PRESENT'},
 {id:'clock-2',event_kind:'CLOCKTOWER',started_at:'2026-09-27T09:00:00Z',attendance_status:'PRESENT'},
 {id:'clock-3',event_kind:'CLOCKTOWER',started_at:'2026-09-27T14:59:00Z',attendance_status:'PRESENT'},
 {id:'board-1',event_kind:'BOARDGAME',started_at:'2026-09-27T10:00:00Z',attendance_status:'PRESENT'},
];
assert.equal(m.exports.participationEventCount(events),2);
assert.equal(m.exports.participationEventCount([...events,{id:'clock-next',event_kind:'CLOCKTOWER',started_at:'2026-09-27T15:01:00Z',attendance_status:'PRESENT'}]),3);
assert.equal(m.exports.participationEventCount([...events,{id:'absent',event_kind:'BOARDGAME',started_at:'2026-09-28T10:00:00Z',attendance_status:'ABSENT'}]),2);
console.log('PASS: same-day Clocktower attendance counts once while other events remain separate');
