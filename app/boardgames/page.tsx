import Header from "@/app/components/Header";
import AdminLibraryButton from "@/app/components/AdminLibraryButton";
import { createClient } from "@/lib/supabase/server";
import BoardgameList from "./BoardgameList";

export default async function BoardgamesPage() {
  const supabase = await createClient();
  const [{ data: boardgames, error }, { data: isMainAdmin }] = await Promise.all([
    supabase
      .from("games")
      .select("id,name,type,min_players,max_players,best_players,play_time,difficulty,genre,weight,publisher,icon,min_age,year_published,bgg_url,description,thumbnail")
      .eq("library_section", "BOARDGAME")
      .order("name"),
    supabase.rpc("is_main_admin"),
  ]);

  return (
    <main className="min-h-screen bg-[#08090b] text-white">
      <Header />
      <section className="border-b border-white/10 px-5 py-16">
        <div className="mx-auto flex max-w-6xl items-end justify-between gap-6">
          <div>
            <p className="text-xs font-bold tracking-[0.25em] text-amber-400">BOARD GAMES</p>
            <h1 className="mt-3 text-4xl font-black">보드게임</h1>
            <p className="mt-5 text-slate-400">보드라운지가 보유한 게임을 확인하고, 인원과 장르에 맞는 게임을 찾아보세요.</p>
          </div>
          <AdminLibraryButton />
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-5 py-12">
        {error ? <p className="rounded-xl border border-red-500/40 p-5 text-red-300">게임 정보를 불러오지 못했습니다.</p> : null}
        <BoardgameList boardgames={boardgames ?? []} isAdmin={Boolean(isMainAdmin)} />
      </div>
    </main>
  );
}
