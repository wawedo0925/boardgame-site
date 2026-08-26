import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import MurderMysteryList from "./MurderMysteryList";

export type MurderMystery = { id:string; title:string; cover_url:string|null; cover_path:string|null; min_players:number|null; max_players:number|null; play_time:number|null; difficulty:number|null; host_required:boolean; host_requirement:"REQUIRED"|"RECOMMENDED"|"NOT_REQUIRED"; replayable:boolean; theme:string|null; synopsis:string|null };

export default async function MurderMysteryPage() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const userId = authData.user?.id;
  const [{ data, error }, adminResult, mainAdminResult, interestResult] = await Promise.all([
    supabase.from("murder_mysteries").select("id, title, cover_url, cover_path, min_players, max_players, play_time, difficulty, host_required, host_requirement, replayable, theme, synopsis").order("title", { ascending:true }),
    userId ? supabase.from("site_admins").select("user_id").eq("user_id", userId).maybeSingle() : Promise.resolve({ data:null }),
    userId ? supabase.rpc("is_main_admin") : Promise.resolve({ data:false }),
    supabase.from("murder_mystery_interests").select("murder_mystery_id"),
  ]);
  const isAdmin = Boolean(adminResult.data);
  const isMainAdmin = Boolean(mainAdminResult.data);
  const interestCounts = (interestResult.data ?? []).reduce<Record<string, number>>((counts, row) => {
    counts[row.murder_mystery_id] = (counts[row.murder_mystery_id] ?? 0) + 1;
    return counts;
  }, {});
  return <main className="min-h-screen bg-zinc-950 text-white">
    <section className="border-b border-white/10"><div className="mx-auto flex max-w-7xl flex-col gap-6 px-6 py-20 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-sm font-semibold tracking-[0.3em] text-red-400">MURDER MYSTERY</p><h1 className="mt-3 text-4xl font-bold sm:text-5xl">머더미스터리</h1><p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-400">각자의 역할을 맡아 사건의 진상과 범인을 추리하는 스토리 게임입니다.</p>{isAdmin && <p className="mt-4 inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-300">관리자 표지 편집 모드</p>}</div>
      {isMainAdmin && <Link href="/admin/library" className="inline-flex shrink-0 items-center justify-center rounded-xl border border-violet-400/40 bg-violet-400/10 px-4 py-2.5 text-sm font-bold text-violet-200 transition hover:bg-violet-400/20">게임 등록·관리</Link>}
    </div></section>
    <section className="mx-auto max-w-7xl px-6 py-16">
      {error ? <div className="rounded-3xl border border-red-500/20 bg-red-500/10 p-6 text-red-200">머더미스터리 목록을 불러오지 못했습니다. {error.message}</div> : <MurderMysteryList mysteries={(data ?? []) as MurderMystery[]} isAdmin={isAdmin} interestCounts={interestCounts} />}
      <div className="mt-5 rounded-2xl border border-red-400/20 bg-red-400/[0.04] px-5 py-4 text-sm leading-6 text-zinc-400"><span className="font-semibold text-red-300">스포일러 주의</span> 상세 정보에는 사건의 정답이나 범인을 표시하지 않습니다.</div>
    </section>
  </main>;
}
