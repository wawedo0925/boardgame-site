import { createClient } from "@/lib/supabase/server";

export default async function SupabaseTestPage() {
  const supabase = await createClient();

  const { data: games, error } = await supabase
    .from("games")
    .select("id, name, type, min_players, max_players")
    .order("name");

  if (error) {
    return (
      <main className="min-h-screen bg-zinc-950 p-8 text-white">
        <h1 className="text-2xl font-bold">Supabase 연결 오류</h1>

        <pre className="mt-6 whitespace-pre-wrap rounded-xl bg-red-950 p-4 text-red-200">
          {error.message}
        </pre>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 p-8 text-white">
      <div className="mx-auto max-w-3xl">
        <h1 className="text-3xl font-bold">Supabase 연결 테스트</h1>

        <p className="mt-2 text-zinc-400">
          데이터베이스에서 {games?.length ?? 0}개의 게임을 불러왔습니다.
        </p>

        <div className="mt-8 space-y-3">
          {games?.map((game) => (
            <article
              key={game.id}
              className="rounded-2xl border border-white/10 bg-white/5 p-5"
            >
              <h2 className="text-xl font-semibold">{game.name}</h2>

              <p className="mt-2 text-sm text-zinc-400">
                유형: {game.type}
              </p>

              <p className="mt-1 text-sm text-zinc-400">
                인원: {game.min_players ?? "-"}명 ~{" "}
                {game.max_players ?? "-"}명
              </p>
            </article>
          ))}
        </div>
      </div>
    </main>
  );
}