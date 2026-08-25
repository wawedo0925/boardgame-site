import Link from "next/link";
import { notFound } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type NoticeRow = {
  id: string;
  title: string;
  content: string | null;
  important: boolean | null;
  created_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export default async function NoticeDetailPage({
  params,
}: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("notices")
    .select("id, title, content, important, created_at")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("공지사항 상세 조회 오류:", error);
  }

  if (!data) {
    notFound();
  }

  const notice = data as NoticeRow;

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
          <Link
            href="/notice"
            className="text-sm font-semibold text-zinc-500 transition hover:text-amber-300"
          >
            ← 공지사항 목록
          </Link>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            {notice.important && (
              <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-300">
                중요
              </span>
            )}

            <span className="text-sm text-zinc-500">
              {formatDate(notice.created_at)}
            </span>
          </div>

          <h1 className="mt-5 text-3xl font-bold leading-tight sm:text-5xl">
            {notice.title}
          </h1>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
        <article className="min-h-72 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-10">
          <p className="whitespace-pre-wrap break-words leading-8 text-zinc-300">
            {notice.content?.trim() || "등록된 공지 내용이 없습니다."}
          </p>
        </article>

        <div className="mt-8">
          <Link
            href="/notice"
            className="inline-flex rounded-xl border border-white/15 px-5 py-3 font-semibold text-zinc-300 transition hover:border-amber-400/40 hover:text-amber-300"
          >
            목록으로 돌아가기
          </Link>
        </div>
      </section>
    </main>
  );
}