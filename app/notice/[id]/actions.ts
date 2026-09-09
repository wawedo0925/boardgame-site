"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function deleteNotice(id: string, _state: { error: string }, _form: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: allowed, error: permissionError } = await supabase.rpc("current_site_role");
  if (permissionError || allowed !== "MAIN_ADMIN") return { error: "공지사항을 삭제할 권한이 없습니다." };
  const { data, error } = await supabase.from("notices").delete().eq("id", id).select("id").maybeSingle();
  if (error || !data) {
    console.error("공지사항 삭제 오류:", error);
    return { error: "공지를 삭제하지 못했습니다. 이미 삭제되었거나 권한이 변경되었는지 확인해 주세요." };
  }
  revalidatePath("/");
  revalidatePath("/notice");
  revalidatePath(`/notice/${id}`);
  revalidatePath(`/notice/${id}/edit`);
  redirect("/notice");
}
