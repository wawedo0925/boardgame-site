import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NoticeActions from "../[id]/NoticeActions";

function date(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric" }).format(new Date(value));
}

export default async function UpdatesPage({ searchParams }: { searchParams: Promise<{ id?: string; page?: string }> }) {
  const query = await searchParams;
  const page = Math.max(1, Math.min(100000, Number.parseInt(query.page ?? "1", 10) || 1));
  if (query.id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query.id)) notFound();
  const supabase = await createClient();
  let selectedQuery = supabase.from("notices").select("id,title,content,important,created_at").eq("is_update", true);
  if (query.id) selectedQuery = selectedQuery.eq("id", query.id);
  const [selected, history, permission, role] = await Promise.all([
    selectedQuery.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("notices").select("id,title,created_at", { count: "exact" }).eq("is_update", true).order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * 20, page * 20 - 1),
    supabase.rpc("can_manage_notices"),
    supabase.rpc("current_site_role"),
  ]);
  if (selected.error || history.error) throw new Error("업데이트 글을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
  const notice = selected.data;
  if (query.id && !notice) notFound();
  const rows = history.data ?? [];
  const ids = [...new Set([...rows.map(row => row.id), ...(notice ? [notice.id] : [])])];
  const { data: authors } = ids.length ? await supabase.rpc("get_notice_authors", { notice_ids: ids }) : { data: [] };
  const names = new Map<string, string>((authors ?? []).map((row: { notice_id: string; author_name: string }) => [row.notice_id, row.author_name]));
  const totalPages = Math.ceil((history.count ?? 0) / 20);
  const pageHref = (next: number) => `/notice/updates?${new URLSearchParams({ ...(query.id ? { id: query.id } : {}), page: String(next) })}#history`;
  return <main className="min-h-screen bg-zinc-950 text-white">
    <section className="border-b border-white/10"><div className="mx-auto max-w-5xl px-6 py-16">
      <Link href="/notice" className="text-sm text-zinc-400 hover:text-amber-300">← 공지사항 목록</Link>
      <p className="mt-8 text-sm font-semibold tracking-[0.3em] text-amber-400">UPDATES</p>
      <h1 className="mt-3 text-3xl font-bold sm:text-5xl">최신업데이트 확인하기</h1>
      <p className="mt-5 text-zinc-400">보드라운지의 새로운 기능과 변경 사항을 모았습니다.</p>
      {permission.data && <Link href="/notice/new?type=update" className="mt-6 inline-flex rounded-xl bg-amber-400 px-5 py-3 font-bold text-zinc-950">업데이트 작성</Link>}
    </div></section>
    <section className="mx-auto max-w-5xl px-6 py-12">
      {notice ? <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-10">
        <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-amber-300">{query.id ? "업데이트 내용" : "최신 업데이트"}</p>{query.id && <Link href="/notice/updates" className="text-sm text-zinc-400 hover:text-amber-300">최신 글 보기 →</Link>}</div>
        <h2 className="mt-4 break-words text-2xl font-bold sm:text-3xl">{notice.title}</h2>
        <p className="mt-3 text-sm text-zinc-400">{date(notice.created_at)} · 작성자 {names.get(notice.id) || "작성자 정보 없음"}</p>
        {permission.data && <NoticeActions id={notice.id} title={notice.title} canDelete={role.data === "MAIN_ADMIN"} />}
        <p className="mt-8 whitespace-pre-wrap break-words leading-8 text-zinc-300">{notice.content}</p>
      </article> : <p className="rounded-3xl border border-dashed border-white/15 p-10 text-center text-zinc-400">아직 등록된 업데이트가 없습니다.</p>}
      <section id="history" className="mt-12 scroll-mt-8">
        <h2 className="mb-5 text-xl font-bold">작성된 업데이트 <span className="text-amber-300">{history.count ?? 0}</span></h2>
        <div className="overflow-hidden rounded-2xl border border-white/10">
          {rows.map(row => <Link key={row.id} href={`/notice/updates?id=${row.id}&page=${page}`} aria-current={notice?.id === row.id ? "page" : undefined} className={`block border-b border-white/10 p-5 last:border-b-0 hover:bg-white/5 ${notice?.id === row.id ? "bg-amber-400/5" : ""}`}>
            <p className="break-words font-semibold">{row.title}{notice?.id === row.id && <span className="ml-3 text-xs text-amber-300">읽는 중</span>}</p>
            <p className="mt-2 text-sm text-zinc-400">{date(row.created_at)} · {names.get(row.id) || "작성자 정보 없음"}</p>
          </Link>)}
        </div>
        {totalPages > 1 && <nav aria-label="업데이트 목록 페이지" className="mt-6 flex items-center justify-center gap-6">{page > 1 && <Link href={pageHref(page - 1)}>이전</Link>}<span className="text-sm text-zinc-400">{page} / {totalPages}</span>{page < totalPages && <Link href={pageHref(page + 1)}>다음</Link>}</nav>}
      </section>
    </section>
  </main>;
}
