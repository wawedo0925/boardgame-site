"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { validateHomeContent } from "@/lib/home-content";

export type SaveHomeState = { error: string; success: boolean };

export async function saveHomeContent(_previous: SaveHomeState, formData: FormData): Promise<SaveHomeState> {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return { error: "로그인이 필요합니다.", success: false };
  const { data: role, error: roleError } = await supabase.rpc("current_site_role");
  if (roleError || role !== "MAIN_ADMIN") return { error: "메인 관리자만 수정할 수 있습니다.", success: false };

  const content = {
    eyebrow: String(formData.get("eyebrow") ?? "").trim(),
    title: String(formData.get("title") ?? "").trim(),
    description: String(formData.get("description") ?? "").trim(),
  };
  const validationError = validateHomeContent(content);
  if (validationError) return { error: validationError, success: false };

  const { error } = await supabase.from("home_content").update(content).eq("id", true).select("id").single();
  if (error) {
    console.error("메인 문구 저장 오류:", error);
    return { error: "저장하지 못했습니다. 잠시 후 다시 시도해 주세요.", success: false };
  }
  revalidatePath("/");
  revalidatePath("/admin/home");
  return { error: "", success: true };
}
