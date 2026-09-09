import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import EditNoticeForm from "./EditNoticeForm";

async function updateNotice(id: string, _state: { error: string }, formData: FormData) {
  "use server";
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: allowed, error: permissionError } = await supabase.rpc("can_manage_notices");
  if (permissionError || !allowed) return { error: "공지사항을 수정할 권한이 없습니다." };
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!title || !content) return { error: "제목과 내용을 모두 입력해 주세요." };
  if (title.length > 150 || content.length > 10000) return { error: "제목은 150자, 내용은 10,000자까지 입력할 수 있습니다." };
  const { data, error } = await supabase.from("notices")
    .update({ title, content, important: formData.get("important") === "on" })
    .eq("id", id).select("id").maybeSingle();
  if (error || !data) {
    console.error("공지사항 수정 오류:", error);
    return { error: "공지사항을 저장하지 못했습니다. 글이 삭제되었거나 수정 권한이 변경되었는지 확인해 주세요." };
  }
  revalidatePath("/");
  revalidatePath("/notice");
  revalidatePath(`/notice/${id}`);
  revalidatePath(`/notice/${id}/edit`);
  redirect(`/notice/${id}`);
}

export default async function EditNoticePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: allowed, error: permissionError } = await supabase.rpc("can_manage_notices");
  if (permissionError || !allowed) redirect("/notice");
  const { data: notice, error } = await supabase.from("notices").select("id,title,content,important").eq("id", id).maybeSingle();
  if (error) throw new Error("공지사항을 불러오지 못했습니다.");
  if (!notice) notFound();
  return <main className="min-h-screen bg-zinc-950 text-white">
    <section className="border-b border-white/10"><div className="mx-auto max-w-4xl px-6 py-16"><Link href={`/notice/${id}`} className="text-sm text-zinc-400 hover:text-amber-300">← 공지사항으로 돌아가기</Link><h1 className="mt-8 text-4xl font-bold">공지사항 수정</h1></div></section>
    <section className="mx-auto max-w-4xl px-6 py-14"><EditNoticeForm notice={notice} action={updateNotice.bind(null, id)} /></section>
  </main>;
}
