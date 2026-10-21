import { formatEventLocation } from "./location";

export type CalendarEvent = {
  id: string;
  event_kind: string;
  started_at: string;
  ended_at: string | null;
  location: string | null;
};

export function calendarTitle(kind: string) {
  return ({ BOARDGAME: "보겜", MURDER_MYSTERY: "머미", CLOCKTOWER: "시계탑", HOLDEM: "홀덤" } as Record<string, string>)[kind] ?? "모임";
}

function stamp(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function calendarTimes(event: CalendarEvent) {
  const start = new Date(event.started_at).getTime();
  const end = event.ended_at ? new Date(event.ended_at).getTime() : NaN;
  if (!Number.isFinite(start)) return null;
  return { start: stamp(event.started_at), end: Number.isFinite(end) && end > start ? stamp(event.ended_at!) : null };
}

function details(event: CalendarEvent, origin: string) {
  return `보드라운지 모임\n${new URL(`/events/${encodeURIComponent(event.id)}`, origin).href}\n${calendarTimes(event)?.end ? "" : "종료 시간 미정. 저장 전에 종료 시간을 확인해 주세요.\n"}일정 변경·참가 취소는 캘린더에 자동 반영되지 않습니다.`;
}

export function googleCalendarUrl(event: CalendarEvent, origin: string) {
  const times = calendarTimes(event);
  if (!times) return null;
  const params = new URLSearchParams({ action: "TEMPLATE", text: calendarTitle(event.event_kind), dates: `${times.start}/${times.end ?? times.start}`, ctz: "Asia/Seoul", location: formatEventLocation(event.location), details: details(event, origin) });
  return `https://calendar.google.com/calendar/render?${params}`;
}

function escapeText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
}

// RFC 5545 limits content lines to 75 octets, not 75 characters.
function fold(line: string) {
  const encoder = new TextEncoder();
  let result = "", bytes = 0;
  for (const character of line) {
    const size = encoder.encode(character).length;
    if (bytes + size > 75) { result += "\r\n "; bytes = 1; }
    result += character; bytes += size;
  }
  return result;
}

export function calendarFile(event: CalendarEvent, origin: string, now = new Date()) {
  const times = calendarTimes(event);
  if (!times) return null;
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BoardLounge//Events//KO", "CALSCALE:GREGORIAN", "BEGIN:VEVENT", `UID:${encodeURIComponent(event.id)}@boardlounge.kr`, `DTSTAMP:${stamp(now.toISOString())}`, `DTSTART:${times.start}`, ...(times.end ? [`DTEND:${times.end}`] : []), `SUMMARY:${escapeText(calendarTitle(event.event_kind))}`, `LOCATION:${escapeText(formatEventLocation(event.location))}`, `DESCRIPTION:${escapeText(details(event, origin))}`, "END:VEVENT", "END:VCALENDAR"].map(fold).join("\r\n") + "\r\n";
}
