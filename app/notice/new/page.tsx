import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import NewNoticeForm from "./NewNoticeForm";

import { createClient } from "@/lib/supabase/server";

async function createNotice(_state: { error: string }, formData: FormData) {
  "use server";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: canManage, error: permissionError } =
    await supabase.rpc("can_manage_notices");

  if (permissionError || !canManage) {
    redirect("/notice");
  }

  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const important = formData.get("important") === "on";

  if (!title || !content) {
    return { error: "제목과 내용을 모두 입력해야 합니다." };
  }

  if (title.length > 150 || content.length > 10000) {
    return { error: "제목은 150자, 내용은 10,000자까지 입력할 수 있습니다." };
  }

  const { data, error } = await supabase
    .from("notices")
    .insert({
      title,
      content,
      important,
      is_update: formData.get("is_update") === "on",
      author_id: user.id,
    })
    .select("id")
    .single();

  if (error) {
    console.error("공지사항 작성 오류:", error);
    return { error: "공지사항을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }

  revalidatePath("/");
  revalidatePath("/notice");
  revalidatePath("/notice/updates");
  redirect(formData.get("is_update") === "on" ? `/notice/updates?id=${data.id}` : `/notice/${data.id}`);
}

export default async function NewNoticePage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const isUpdate = (await searchParams).type === "update";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: canManage } = await supabase.rpc(
    "can_manage_notices",
  );

  if (!canManage) {
    redirect("/notice");
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-4xl px-6 py-16">
          <Link
            href="/notice"
            className="text-sm text-zinc-500 transition hover:text-amber-300"
          >
            ← 공지사항 목록
          </Link>

          <p className="mt-8 text-sm font-semibold tracking-[0.3em] text-amber-400">
            NEW NOTICE
          </p>

          <h1 className="mt-3 text-4xl font-bold">
            공지사항 작성
          </h1>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-14">
        <NewNoticeForm action={createNotice} initialIsUpdate={isUpdate} />
      </section>
    </main>
  );
}