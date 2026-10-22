const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path, fetch) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports, Date, Intl, URLSearchParams, fetch });
  return exports;
}
const { koreanDay, monthDays, occursOn, shiftMonth, koreanTime } = load('lib/events/month-calendar.ts');
assert.equal(koreanDay('2026-10-21T16:00:00Z'), '2026-10-22');
assert.equal(koreanTime('2026-10-28T10:20:00Z'), '19:20');
assert.equal(shiftMonth('2026-12', 1), '2027-01');
assert.equal(shiftMonth('2026-01', -1), '2025-12');
const leap = monthDays('2028-02');
assert.ok(leap.includes('2028-02-29'));
assert.equal(leap.length % 7, 0);
assert.equal(new Date(leap[0]).getUTCDay(), 0);
assert.equal(occursOn('2026-10-28T23:00:00+09:00', '2026-10-29T02:00:00+09:00', '2026-10-29'), true);
assert.equal(occursOn('2026-10-28', '2026-10-29', '2026-10-29'), false);
assert.equal(occursOn('2026-10-28', '2026-10-29', '2026-10-28'), true);
assert.equal(occursOn('2026-10-28T23:00:00+09:00', null, '2026-10-29'), false);
const { holidayOn, hasHolidayYear } = load('lib/events/korean-holidays.ts');
assert.equal(holidayOn('2026-10-05'), '대체공휴일');
assert.equal(holidayOn('2027-02-07'), '설날');
assert.equal(holidayOn('2027-05-13'), '부처님오신날');
assert.equal(hasHolidayYear('2028'), false);
(async () => {
  let calls = 0;
  const { readGoogleCalendar } = load('lib/events/read-google-calendar.ts', async (url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, 'Bearer test');
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get('timeMin'), '2026-10-01T00:00:00+09:00');
    if (calls === 1) return { ok: true, json: async () => ({ nextPageToken: 'next', items: [{ id: 'a', start: { date: '2026-10-02' }, end: { date: '2026-10-03' } }, { id: 'deleted', status: 'cancelled', start: { date: '2026-10-02' } }] }) };
    assert.equal(parsed.searchParams.get('pageToken'), 'next');
    return { ok: true, json: async () => ({ items: [{ id: 'b', summary: 'Repeated event', start: { dateTime: '2026-10-03T10:00:00+09:00' } }] }) };
  });
  const rows = await readGoogleCalendar('test', '2026-10-01', '2026-11-01');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].summary, '개인 일정');
  assert.equal(calls, 2);
  for (const status of [401,403,500]) {
    const api = load('lib/events/read-google-calendar.ts', async () => ({ ok: false, status }));
    await assert.rejects(api.readGoogleCalendar('test','2026-10-01','2026-11-01'));
  }
  console.log('PASS: Korea dates, month rollover, leap year, overnight/all-day boundaries, holidays, Google pagination/cancellation/errors');
})().catch(error => { console.error(error); process.exitCode = 1; });
