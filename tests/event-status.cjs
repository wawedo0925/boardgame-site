const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
for (const [path, name] of [['app/events/page.tsx', 'getStatus'], ['app/events/[id]/page.tsx', 'getEventStatus']]) {
  const source = fs.readFileSync(path, 'utf8');
  const body = source.match(new RegExp(`function ${name}\\(event: EventRow\\)[\\s\\S]*?\\n}`))[0];
  const js = ts.transpileModule(body, {compilerOptions: {target: ts.ScriptTarget.ES2020}}).outputText;
  const status = new Function(`${js}; return ${name};`)();
  const past = '2026-10-21T10:20:00+00:00';
  const future = '2099-01-01T00:00:00Z';
  assert.equal(status({started_at:past, ended_at:null, event_status:'CLOSED'}), '종료', 'manually closed event without end time');
  assert.equal(status({started_at:past, ended_at:future, event_status:'CLOSED'}), '종료', 'manual closure precedes scheduled end');
  assert.equal(status({started_at:past, ended_at:past, event_status:'OPEN'}), '종료');
  assert.equal(status({started_at:past, ended_at:null, event_status:'OPEN'}), '진행 중', 'no invented end time for open events');
  assert.equal(status({started_at:future, ended_at:null, event_status:'OPEN'}), '예정');
  assert.equal(status({started_at:past, ended_at:past, event_status:'CANCELLED'}), '취소됨');
}
console.log('PASS event status: closed without end, early closure, timed end, ongoing, future, cancelled');
