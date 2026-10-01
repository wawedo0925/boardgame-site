const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(require('fs').readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, f);
const { DICTATOR_ROLES, isDictator, dictatorResults } = require('../lib/dictator.ts');
assert(isDictator('이리하여 나는 독재자가 되었다 (In this way I become a DICTATOR)'));
assert(!isDictator('데스 스테이션'));
for (const winner of DICTATOR_ROLES) {
  const players = [...DICTATOR_ROLES, winner].map((role, i) => ({ userId: String(i), role }));
  const results = dictatorResults(players, winner);
  assert.equal(results.filter(p => p.isWinner).length, 2);
  assert(results.every(p => p.isWinner === (p.role === winner)));
}
assert.throws(() => dictatorResults([{ userId: '1', role: '' }], '독재자'));
assert.throws(() => dictatorResults([{ userId: '1', role: '독재자' }], '광대'));
assert.throws(() => dictatorResults([{ userId: '1', role: '독재자' }], ''));
assert.throws(() => dictatorResults([], '독재자'));
console.log('Passed all seven winning roles, duplicate-role winners, missing roles and invalid winners.');
