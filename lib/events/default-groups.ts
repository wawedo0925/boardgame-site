import type { GroupDraft, GroupParticipant } from "@/types/group";

const owners = ["우영", "아라", "병준"];
const normalizeName = (name: string) => name.replace(/\s/g, "");

// A self-service GM group can exist before an operator first opens grouping.
// Keep those groups and assignments while supplying missing default drafts.
export function withDefaultGroups(
  groups: GroupDraft[], participants: GroupParticipant[], createId: () => string,
): GroupDraft[] {
  const assigned = new Set(groups.flatMap(group => group.userIds));
  const defaults: GroupDraft[] = [];
  for (const name of owners) {
    if (groups.some(group => normalizeName(group.name) === `${name}조`)) continue;
    const owner = participants.find(participant => participant.attendance_status === "PRESENT"
      && participant.profile?.activity_name?.split("/")[0].trim() === name
      && !assigned.has(participant.user_id));
    if (owner) assigned.add(owner.user_id);
    defaults.push({ id: createId(), name: `${name} 조`, sessionId: null,
      ruleMasterUserId: null, userIds: owner ? [owner.user_id] : [] });
  }
  if (!groups.length) defaults.push({ id: createId(), name: "1조", sessionId: null, ruleMasterUserId: null, userIds: [] });
  return [...defaults, ...groups];
}
