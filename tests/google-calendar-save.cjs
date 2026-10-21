const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let calls = [], responses = [];
function load(file) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, URL, URLSearchParams, TextEncoder, crypto: require('node:crypto').webcrypto,
    fetch: async (url, options) => { calls.push({ url, options }); return responses.shift(); },
    require: name => load(`lib/events/${name.replace('./', '')}.ts`),
  });
  return exports;
}
const { saveGoogleCalendarEvent } = load('lib/events/google-calendar.ts');
const event = { id: 'test', event_kind: 'CLOCKTOWER', started_at: '2026-10-22T20:00:00+09:00', ended_at: '2026-10-23T01:00:00+09:00', location: '와위두' };
const save = () => saveGoogleCalendarEvent(event, 'https://boardlounge.kr', 'test-token');
(async () => {
  responses = [{ ok: true, status: 200 }];
  assert.match(await save(), /저장했어요/);
  const payload = JSON.parse(calls[0].options.body);
  assert.equal(payload.summary, '시계탑');
  assert.equal(payload.start.dateTime, '2026-10-22T11:00:00.000Z');
  assert.equal(payload.end.dateTime, '2026-10-22T16:00:00.000Z');
  assert.match(payload.id, /^[a-f0-9]{64}$/);
  assert.match(payload.location, /잠원동/);
  responses = [{ status: 409 }, { ok: true, json: async () => ({ status: 'confirmed' }) }];
  assert.match(await save(), /이미 저장/);
  assert.equal(JSON.parse(calls[1].options.body).id, payload.id);
  responses = [{ status: 409 }, { ok: true, json: async () => ({ status: 'cancelled' }) }];
  await assert.rejects(save, /삭제한 일정/);
  for (const [status, text] of [[401, /만료/], [403, /권한/], [500, /저장하지 못/]]) {
    responses = [{ status, ok: false }]; await assert.rejects(save, text);
  }
  const count = calls.length;
  await assert.rejects(() => saveGoogleCalendarEvent({ ...event, ended_at: null }, 'https://boardlounge.kr', 'test-token'), /종료 시간/);
  assert.equal(calls.length, count);
  console.log('PASS: direct API payload, timezone, idempotent retries, duplicate/deleted events, expired/denied/server errors, missing end blocked');
})().catch(error => { console.error(error); process.exitCode = 1; });
