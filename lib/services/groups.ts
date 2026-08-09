import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventGroup,GroupDraft,GroupGame } from "@/types/group";

export async function getEventGroups(supabase:SupabaseClient,eventId:string):Promise<EventGroup[]>{
 const {data:groups,error}=await supabase.from("event_groups").select("id,event_id,name,position,session_id,rule_master_user_id").eq("event_id",eventId).order("position");if(error)throw error;if(!groups?.length)return[];
 const {data:members,error:memberError}=await supabase.from("event_group_members").select("id,group_id,user_id,position").in("group_id",groups.map(g=>g.id)).order("position");if(memberError)throw memberError;
 return groups.map(group=>({...group,members:(members??[]).filter(member=>member.group_id===group.id)})) as EventGroup[];
}

export async function getGroupGames(supabase:SupabaseClient,eventId:string):Promise<GroupGame[]>{const {data,error}=await supabase.from("event_game_sessions").select("id,game_id,game:games(id,name)").eq("event_id",eventId).order("created_at");if(error)throw error;return (data??[]).map(row=>({...row,game:Array.isArray(row.game)?row.game[0]??null:row.game})) as GroupGame[];}

export async function saveGroups(supabase:SupabaseClient,eventId:string,userId:string,drafts:GroupDraft[]){
 const {data:old,error:oldError}=await supabase.from("event_groups").select("id").eq("event_id",eventId);if(oldError)throw oldError;const keep:string[]=[];
 for(let index=0;index<drafts.length;index++){const draft=drafts[index];const ruleMasterUserId=draft.ruleMasterUserId&&draft.userIds.includes(draft.ruleMasterUserId)?draft.ruleMasterUserId:null;let groupId=draft.id;if(draft.id.startsWith("draft-")){const created=await supabase.from("event_groups").insert({event_id:eventId,name:draft.name.trim()||`${index+1}조`,position:index,rule_master_user_id:ruleMasterUserId,created_by:userId}).select("id").single();if(created.error)throw created.error;groupId=created.data.id;}else{const updated=await supabase.from("event_groups").update({name:draft.name.trim()||`${index+1}조`,position:index,rule_master_user_id:ruleMasterUserId}).eq("id",groupId);if(updated.error)throw updated.error;}keep.push(groupId);const removed=await supabase.from("event_group_members").delete().eq("group_id",groupId);if(removed.error)throw removed.error;if(draft.userIds.length){const inserted=await supabase.from("event_group_members").insert(draft.userIds.map((memberId,position)=>({group_id:groupId,user_id:memberId,position})));if(inserted.error)throw inserted.error;}}
 const removeIds=(old??[]).map(row=>row.id).filter(id=>!keep.includes(id));if(removeIds.length){const removed=await supabase.from("event_groups").delete().in("id",removeIds);if(removed.error)throw removed.error;}
}

export async function clearGroups(supabase:SupabaseClient,eventId:string){const {error}=await supabase.from("event_groups").delete().eq("event_id",eventId);if(error)throw error;}
