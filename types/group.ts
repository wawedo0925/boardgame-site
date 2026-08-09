import type { EventParticipant } from "@/types/event";

export type EventGroupMember={id:string;group_id:string;user_id:string;position:number};
export type EventGroup={id:string;event_id:string;name:string;position:number;session_id:string|null;rule_master_user_id:string|null;members:EventGroupMember[]};
export type GroupDraft={id:string;name:string;sessionId:string|null;ruleMasterUserId?:string|null;userIds:string[]};
export type GroupParticipant=EventParticipant;
export type GroupGame={id:string;game_id:string;game:{id:string;name:string}|null};
