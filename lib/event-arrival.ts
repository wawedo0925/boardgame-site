export type ArrivalMode = "NORMAL" | "CLOCKTOWER_EXPERIENCED" | "CLOCKTOWER_NEW";
export type ArrivalChoice = { arrivalAt: string | null; mode: ArrivalMode };
export function arrivalLimits(startedAt: string, endedAt: string | null, kind: string, mode: ArrivalMode) {
  const start = new Date(startedAt).getTime();
  const cap = kind === "MURDER_MYSTERY" ? start + 10 * 60000
    : kind === "CLOCKTOWER" && mode !== "CLOCKTOWER_EXPERIENCED" ? start + 5 * 60000 : Infinity;
  const end = Math.min(endedAt ? new Date(endedAt).getTime() : Infinity, cap);
  return { start, end, initial: Math.min(start + (mode === "CLOCKTOWER_EXPERIENCED" ? 40 : 5) * 60000, end) };
}
export function seoulDateTime(value: number) { return new Date(value + 9 * 3600000).toISOString().slice(0, 16); }
export function arrivalTimeLabel(value?: string | null) {
  return value ? new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit", hourCycle: "h23" }).format(new Date(value)) : "";
}
