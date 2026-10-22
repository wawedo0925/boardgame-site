export function koreanDay(value: string | Date) {
  const date = new Date(value);
  return new Date(date.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function monthDays(month: string) {
  const [year, number] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, number - 1, 1));
  const length = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((first.getUTCDay() + length) / 7) * 7 }, (_, i) =>
    new Date(Date.UTC(year, number - 1, 1 - first.getUTCDay() + i)).toISOString().slice(0, 10));
}

export function shiftMonth(month: string, delta: number) {
  const [year, number] = month.split("-").map(Number);
  return new Date(Date.UTC(year, number - 1 + delta, 1)).toISOString().slice(0, 7);
}

// End is exclusive, including Google's all-day end dates.
export function occursOn(start: string, end: string | null, day: string) {
  const from = Date.parse(start.length === 10 ? `${start}T00:00:00+09:00` : start);
  const until = end ? Date.parse(end.length === 10 ? `${end}T00:00:00+09:00` : end) : from;
  const dayStart = Date.parse(`${day}T00:00:00+09:00`);
  return from < dayStart + 86400000 && (from >= dayStart || until > dayStart);
}

export function koreanTime(value: string) {
  if (value.length === 10) return "종일";
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
