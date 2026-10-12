const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, f);
const { sampleTichuClock, tichuSecondsLeft } = require('../lib/tichu-clock.ts');
const originalNow = Date.now;
try {
  const clock = sampleTichuClock('2026-10-13T01:00:00+09:00', 1000);
  const deadline = '2026-10-13T01:00:15+09:00';
  for (const offset of [-86400000, 0, 86400000]) {
    Date.now = () => Date.parse('2026-10-13T01:00:00+09:00') + offset;
    assert.equal(tichuSecondsLeft(deadline, clock, 1000), 15);
    assert.equal(tichuSecondsLeft(deadline, clock, 6000), 10);
    assert.equal(tichuSecondsLeft(deadline, clock, 16000), 0);
    assert.equal(tichuSecondsLeft(deadline, clock, 61000), 0);
  }
  const refreshed = sampleTichuClock('2026-10-13T01:00:20+09:00', 21000);
  assert.equal(tichuSecondsLeft('2026-10-13T01:00:35+09:00', refreshed, 21000), 15);
  assert.equal(tichuSecondsLeft(deadline, null, 1000), null);
  assert.equal(tichuSecondsLeft('invalid', clock, 1000), null);
  assert.equal(sampleTichuClock(undefined, 1000), null);
} finally { Date.now = originalNow; }
console.log('PASS: device clocks +/-24h, ticking, expiration, resumed tabs, next turn and unavailable server clock');
