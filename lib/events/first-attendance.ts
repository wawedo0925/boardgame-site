import type { SupabaseClient } from "@supabase/supabase-js";

export function firstAttendanceDayStart(startedAt: string) {
  const date = new Date(startedAt);
  if (!Number.isFinite(date.getTime())) throw new Error("이벤트 날짜가 올바르지 않습니다.");
  const seoulDay = new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return `${seoulDay}T00:00:00+09:00`;
}

// Compare event dates, not signup dates. Same-day sessions share the first-day mark.
export async function loadFirstAttendanceIds(supabase: SupabaseClient, userIds: string[], startedAt: string) {
  const ids = [...new Set(userIds)];
  const cutoff = firstAttendanceDayStart(startedAt);
  const previous = new Set<string>();
  for (let batch = 0; batch < ids.length; batch += 100) {
    const selected = ids.slice(batch, batch + 100);
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("event_participants")
        .select("id,user_id,events!inner(started_at,event_status)")
        .in("user_id", selected).eq("attendance_status", "PRESENT")
        .lt("events.started_at", cutoff)
        .or("event_status.is.null,event_status.neq.CANCELLED", { referencedTable: "events" })
        .order("id").range(offset, offset + 999);
      if (error) throw error;
      for (const row of data ?? []) previous.add(row.user_id);
      if ((data?.length ?? 0) < 1000 || selected.every(id => previous.has(id))) break;
    }
  }
  return new Set(ids.filter(id => !previous.has(id)));
}
