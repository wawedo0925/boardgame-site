import { calendarFile, calendarTimes, type CalendarEvent } from "@/lib/events/calendar";

// A real HTTPS calendar response lets Safari hand the event to its calendar
// preview. No account tokens, member information or subscriptions are involved.
export function GET(request: Request) {
  const url = new URL(request.url);
  const p = url.searchParams;
  const event: CalendarEvent = { id: p.get("id") ?? "", event_kind: p.get("kind") ?? "GENERAL", started_at: p.get("start") ?? "", ended_at: p.get("end") || null, location: p.get("location") };
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(event.id) || (event.location?.length ?? 0) > 1000 || !calendarTimes(event)) {
    return new Response("유효한 일정 정보가 필요합니다.", { status: 400 });
  }
  return new Response(calendarFile(event, url.origin), { headers: {
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": 'inline; filename="boardlounge-event.ics"',
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
