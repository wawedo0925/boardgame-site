import type { SupabaseClient } from "@supabase/supabase-js";

export const NAME_TAG_LOAD_ERROR = "이름표 정보를 불러오지 못했습니다. 이름표 저장 설정과 연결 상태를 확인해 주세요.";

export async function loadNameTags(supabase: SupabaseClient, userIds: string[]) {
  if (!userIds.length) return new Map<string, boolean>();
  const { data, error } = await supabase.from("member_name_tags")
    .select("user_id, has_name_tag").in("user_id", userIds);
  if (error) throw error;
  return new Map<string, boolean>((data ?? []).map(row => [row.user_id, row.has_name_tag]));
}

export function attendanceBirthYear(value: string | null | undefined) {
  const year = value?.trim().replace(/년생$/, "").trim();
  if (!year || !/^(\d{2}|\d{4})$/.test(year)) return "";
  return year.slice(-2);
}
