const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(path) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  vm.runInNewContext(code, { exports, URL, URLSearchParams, TextEncoder, Response, require: name => load(name.includes('calendar') ? 'lib/events/calendar.ts' : 'lib/events/location.ts') });
  return exports;
}
const { calendarTitle, calendarTimes, calendarFile, googleCalendarUrl } = load('lib/events/calendar.ts');
const event = { id: 'test-event', event_kind: 'BOARDGAME', started_at: '2026-10-21T23:00:00+09:00', ended_at: '2026-10-22T02:00:00+09:00', location: '와위두' };
const origin = 'https://boardlounge.kr';
for (const [kind, title] of [['BOARDGAME','보겜'],['MURDER_MYSTERY','머미'],['CLOCKTOWER','시계탑'],['HOLDEM','홀덤'],['GENERAL','모임']]) {
  assert.equal(calendarTitle(kind), title);
  const url = new URL(googleCalendarUrl({ ...event, event_kind: kind }, origin));
  assert.equal(url.searchParams.get('text'), title);
  assert.equal(url.searchParams.get('dates'), '20261021T140000Z/20261021T170000Z');
  assert.equal(url.searchParams.get('ctz'), 'Asia/Seoul');
  assert.match(url.searchParams.get('location'), /잠원동/);
}
const unfold = text => text.replace(/\r\n /g, '');
const file = calendarFile(event, origin, new Date('2026-10-21T00:00:00Z'));
assert.match(file, /DTSTART:20261021T140000Z\r\nDTEND:20261021T170000Z/);
assert.match(file, /SUMMARY:보겜\r\n/);
assert.match(unfold(file), /https:\/\/boardlounge.kr\/events\/test-event/);
assert.ok(file.endsWith('END:VCALENDAR\r\n'));
for (const line of file.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
const escaped = unfold(calendarFile({ ...event, location: '한글'.repeat(60) + ',;\\\nBEGIN:VEVENT' }, origin));
assert.ok(escaped.includes('\\,\\;\\\\\\nBEGIN:VEVENT'));
assert.equal(escaped.split('\r\nBEGIN:VEVENT').length, 2);
const noEnd = { ...event, ended_at: null, location: null };
assert.ok(!calendarFile(noEnd, origin).includes('DTEND:'));
assert.match(unfold(calendarFile(noEnd, origin)), /종료 시간 미정/);
assert.equal(new URL(googleCalendarUrl(noEnd, origin)).searchParams.get('location'), '장소 미정');
assert.equal(calendarTimes({ ...event, ended_at: event.started_at }).end, null);
assert.equal(calendarFile({ ...event, started_at: 'invalid' }, origin), null);
assert.equal(googleCalendarUrl({ ...event, started_at: 'invalid' }, origin), null);
console.log('PASS: short titles, Korean timezone/overnight event, location, Google fields, ICS escaping/folding, unknown end and invalid dates');
const { calendarPlatform, androidCalendarUrl, appleCalendarUrl } = load('lib/events/calendar.ts');
for (const [ua, platform, touch, expected] of [
  ['Mozilla iPhone', 'iPhone', 5, 'apple'], ['Mozilla iPad', 'iPad', 5, 'apple'],
  ['Mozilla Macintosh', 'MacIntel', 5, 'apple'], ['Mozilla Macintosh', 'MacIntel', 0, 'apple'],
  ['Mozilla Android', 'Linux arm', 5, 'android'], ['Mozilla Windows', 'Win32', 0, 'google'],
  ['Mozilla Linux', 'Linux', 0, 'google'], ['', '', 0, 'google'],
]) assert.equal(calendarPlatform(ua, platform, touch), expected);
const intent = androidCalendarUrl(event, origin);
assert.ok(intent.startsWith('intent://com.android.calendar/events#Intent;'));
assert.match(intent, /package=com.google.android.calendar;/);
assert.ok(intent.includes(`l.beginTime=${Date.parse(event.started_at)};`));
assert.ok(intent.includes(`S.title=${encodeURIComponent('보겜')};`));
const fallback = decodeURIComponent(intent.split('S.browser_fallback_url=')[1].split(';')[0]);
assert.equal(fallback, googleCalendarUrl(event, origin));
assert.equal(androidCalendarUrl({ ...event, started_at: 'invalid' }, origin), null);
const { GET } = load('app/calendar/event.ics/route.ts');
(async () => {
  const response = GET({ url: new URL(appleCalendarUrl(event), origin).href });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('Content-Type'), /text\/calendar/);
  assert.match(response.headers.get('Content-Disposition'), /inline/);
  const body = unfold(await response.text());
  assert.match(body, /SUMMARY:보겜/);
  assert.match(body, /DTSTART:20261021T140000Z/);
  assert.match(body, /LOCATION:잠원동/);
  assert.equal(GET({ url: `${origin}/calendar/event.ics` }).status, 400);
  assert.equal(GET({ url: new URL(appleCalendarUrl({ ...event, location: 'x'.repeat(1001) }), origin).href }).status, 400);
  console.log('PASS: Apple/Android/desktop detection, app intent extras and fallback, HTTPS ICS response and input validation');
})().catch(error => { console.error(error); process.exitCode = 1; });
