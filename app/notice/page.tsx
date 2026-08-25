import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

type Notice = {
  id: string;
  title: string;
  important: boolean;
  created_at: string;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(value))
    .replaceAll(". ", ".")
    .replace(/\.$/, "");
}

export default async function NoticePage() {
  const supabase = await createClient();

  const [
    { data: notices, error },
    { data: canManage },
  ] = await Promise.all([
    supabase
      .from("notices")
      .select("id, title, important, created_at")
      .order("important", { ascending: false })
      .order("created_at", { ascending: false }),

    supabase.rpc("can_manage_notices"),
  ]);

  const rows = (notices ?? []) as Notice[];

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-20 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold tracking-[0.3em] text-amber-400">
              NOTICE
            </p>

            <h1 className="mt-3 text-4xl font-bold sm:text-5xl">
              공지사항
            </h1>

            <p className="mt-5 text-lg text-zinc-400">
              보드라운지의 중요한 소식과 운영 안내를 확인하세요.
            </p>
          </div>

          {Boolean(canManage) && (
            <Link
              href="/notice/new"
              className="inline-flex justify-center rounded-2xl bg-amber-400 px-6 py-3 font-bold text-zinc-950 transition hover:bg-amber-300"
            >
              공지 작성
            </Link>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16">
        {error ? (
          <div className="rounded-3xl border border-red-400/20 bg-red-400/5 px-6 py-12 text-center text-red-300">
            공지사항을 불러오지 못했습니다.
            <br />
            {error.message}
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-white/15 px-6 py-16 text-center">
            <p className="text-lg font-semibold text-zinc-300">
              등록된 공지사항이 없습니다.
            </p>

            {Boolean(canManage) && (
              <Link
                href="/notice/new"
                className="mt-5 inline-flex rounded-xl bg-amber-400 px-5 py-3 font-bold text-zinc-950"
              >
                첫 공지 작성하기
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-white/10">
            <div className="hidden grid-cols-[100px_1fr_140px] border-b border-white/10 bg-white/[0.04] px-6 py-4 text-sm text-zinc-400 sm:grid">
              <p>번호</p>
              <p>제목</p>
              <p className="text-right">작성일</p>
            </div>

            <div>
              {rows.map((notice, index) => (
                <Link
                  key={notice.id}
                  href={`/notice/${notice.id}`}
                  className="grid gap-3 border-b border-white/10 px-6 py-5 transition last:border-b-0 hover:bg-white/[0.05] sm:grid-cols-[100px_1fr_140px] sm:items-center"
                >
                  <p className="text-sm text-zinc-500">
                    {String(rows.length - index).padStart(2, "0")}
                  </p>

                  <div className="flex min-w-0 flex-wrap items-center gap-3">
                    {notice.important && (
                      <span className="rounded-full bg-amber-400/15 px-3 py-1 text-xs font-semibold text-amber-300">
                        중요
                      </span>
                    )}

                    <h2 className="truncate font-medium text-zinc-100">
                      {notice.title}
                    </h2>
                  </div>

                  <p className="text-sm text-zinc-500 sm:text-right">
                    {formatDate(notice.created_at)}
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}