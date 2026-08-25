import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";

async function createNotice(formData: FormData) {
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
    throw new Error("제목과 내용을 모두 입력해야 합니다.");
  }

  const { data, error } = await supabase
    .from("notices")
    .insert({
      title,
      content,
      important,
      author_id: user.id,
    })
    .select("id")
    .single();

  if (error) {
    console.error("공지사항 작성 오류:", error);
    throw new Error(`공지사항을 저장하지 못했습니다: ${error.message}`);
  }

  revalidatePath("/");
  revalidatePath("/notice");
  redirect(`/notice/${data.id}`);
}

export default async function NewNoticePage() {
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
        <form
          action={createNotice}
          className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8"
        >
          <label className="block">
            <span className="mb-2 block text-sm font-semibold text-zinc-300">
              제목
            </span>

            <input
              type="text"
              name="title"
              required
              maxLength={150}
              placeholder="공지사항 제목을 입력하세요."
              className="h-14 w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 text-white outline-none placeholder:text-zinc-600 focus:border-amber-400/60"
            />
          </label>

          <label className="mt-6 block">
            <span className="mb-2 block text-sm font-semibold text-zinc-300">
              내용
            </span>

            <textarea
              name="content"
              required
              rows={14}
              maxLength={10000}
              placeholder="공지사항 내용을 입력하세요."
              className="w-full resize-y rounded-2xl border border-white/10 bg-zinc-900 px-4 py-4 leading-7 text-white outline-none placeholder:text-zinc-600 focus:border-amber-400/60"
            />
          </label>

          <label className="mt-5 flex cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-zinc-900 px-4 py-4">
            <input
              type="checkbox"
              name="important"
              className="h-5 w-5 accent-amber-400"
            />

            <span className="font-semibold text-zinc-300">
              중요 공지로 표시
            </span>
          </label>

          <div className="mt-8 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Link
              href="/notice"
              className="inline-flex justify-center rounded-xl border border-white/15 px-6 py-3 font-semibold text-zinc-300"
            >
              취소
            </Link>

            <button
              type="submit"
              className="rounded-xl bg-amber-400 px-7 py-3 font-bold text-zinc-950 transition hover:bg-amber-300"
            >
              공지 등록
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}