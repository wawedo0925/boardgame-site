export type PersonalEvent = { id: string; summary: string; start: string; end: string | null };

export async function readGoogleCalendar(token: string, from: string, until: string, signal?: AbortSignal): Promise<PersonalEvent[]> {
  const events: PersonalEvent[] = [];
  let pageToken = "";
  do {
    const query = new URLSearchParams({ timeMin: `${from}T00:00:00+09:00`, timeMax: `${until}T00:00:00+09:00`, singleEvents: "true", orderBy: "startTime", maxResults: "2500", timeZone: "Asia/Seoul", fields: "nextPageToken,items(id,status,summary,start,end)", ...(pageToken ? { pageToken } : {}) });
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${query}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal });
    if (!response.ok) throw new Error(response.status === 401 ? "구글 연결이 만료됐어요. 연결을 끄고 다시 연결해 주세요." : response.status === 403 ? "구글 캘린더 읽기 권한을 확인해 주세요. 테스트 계정만 사용할 수 있는 상태일 수도 있어요." : "개인 일정을 불러오지 못했어요. 다시 시도해 주세요.");
    const data = await response.json() as { nextPageToken?: string; items?: { id: string; status?: string; summary?: string; start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string } }[] };
    for (const item of data.items ?? []) {
      const start = item.start?.dateTime ?? item.start?.date;
      if (start && item.status !== "cancelled") events.push({ id: item.id, summary: item.summary || "개인 일정", start, end: item.end?.dateTime ?? item.end?.date ?? null });
    }
    pageToken = data.nextPageToken ?? "";
  } while (pageToken);
  return events;
}
