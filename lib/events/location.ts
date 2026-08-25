export const DEFAULT_EVENT_LOCATION = "잠원동 22-15 지하1층 와위두(옥된장건물)";

export function formatEventLocation(location: string | null | undefined) {
  const value = location?.trim();
  if (!value) return "장소 미정";
  if (value === "와위두") return DEFAULT_EVENT_LOCATION;
  return value;
}
