import { calendarTimes, calendarTitle, type CalendarEvent } from "./calendar";
import { formatEventLocation } from "./location";

export async function saveGoogleCalendarEvent(event: CalendarEvent, origin: string, token: string) {
  if (!calendarTimes(event)?.end) throw new Error("종료 시간이 없는 모임은 바로 저장할 수 없어요. 운영진에게 종료 시간 설정을 요청해 주세요.");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`boardlounge:${origin}:${event.id}`));
  const id = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
  const base = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const response = await fetch(base, { method: "POST", headers, body: JSON.stringify({
    id, summary: calendarTitle(event.event_kind), location: formatEventLocation(event.location),
    description: `보드라운지 모임\n${new URL(`/events/${encodeURIComponent(event.id)}`, origin).href}\n일정 변경·참가 취소는 자동 반영되지 않습니다.`,
    start: { dateTime: new Date(event.started_at).toISOString(), timeZone: "Asia/Seoul" },
    end: { dateTime: new Date(event.ended_at!).toISOString(), timeZone: "Asia/Seoul" },
  }) });
  if (response.status === 401) throw new Error("구글 연결이 만료됐어요. 다시 저장을 눌러 연결해 주세요.");
  if (response.status === 403) throw new Error("캘린더 저장 권한을 확인해 주세요. 계속 실패하면 운영진에게 문의해 주세요.");
  if (response.status === 409) {
    const existing = await fetch(`${base}/${id}`, { headers });
    if (existing.ok && (await existing.json()).status !== "cancelled") return "이미 저장된 모임이에요. 변경된 내용은 캘린더에서 확인해 주세요.";
    throw new Error("이전에 삭제한 일정이거나 기존 일정을 확인할 수 없어요. 다른 저장 방법을 이용해 주세요.");
  }
  if (!response.ok) throw new Error("일정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  return "구글 캘린더에 저장했어요.";
}
