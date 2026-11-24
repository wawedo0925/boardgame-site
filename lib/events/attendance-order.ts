import type { EventParticipant } from "@/types/event";

const staffPriority: Record<string, number> = { MAIN_ADMIN: 0, ADMIN: 1, RULE_MASTER: 2 };

export function sortAttendanceParticipants(participants: EventParticipant[], roles: ReadonlyMap<string, string>) {
  return [...participants].sort((a, b) => {
    const priority = (staffPriority[roles.get(a.user_id) ?? ""] ?? 3)
      - (staffPriority[roles.get(b.user_id) ?? ""] ?? 3);
    const aName = a.profile?.activity_name?.trim() || "";
    const bName = b.profile?.activity_name?.trim() || "";
    return priority || Number(!aName) - Number(!bName)
      || aName.localeCompare(bName, "ko") || a.user_id.localeCompare(b.user_id);
  });
}
