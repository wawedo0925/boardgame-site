import Link from "next/link";

import { createClient } from "@/lib/supabase/server";
import BoardgameList from "./BoardgameList";

const PAGE_SIZE = 10;
const MANAGER_ROLES = ["MAIN_ADMIN", "ADMIN", "RULEMASTER", "MASTER", "MANAGER"];

type SearchParams = {
  q?: string;
  genre?: string;
  page?: string;
};

export default async function BoardgamesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const selectedGenre = (params.genre ?? "").trim();
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? "1", 10) || 1);
  const supabase = await createClient();

  let gamesQuery = supabase
    .from("games")
    .select(
      "id,name,type,min_players,max_players,best_players,play_time,difficulty,publisher,thumbnail,description,genre,weight,icon,min_age,year_published,bgg_url,bgg_id",
      { count: "exact" },
    )
    .or("genre.is.null,genre.neq.머더미스터리")
    .order("name", { ascending: true });

  if (query) {
    const safeQuery = query.replace(/[,%]/g, " ");
    gamesQuery = gamesQuery.or(
      `name.ilike.%${safeQuery}%,publisher.ilike.%${safeQuery}%`,
    );
  }

  if (selectedGenre) {
    gamesQuery = gamesQuery.eq("genre", selectedGenre);
  }

  const countResult = await gamesQuery.range(0, 0);
  const totalCount = countResult.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(requestedPage, totalPages);
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let pageQuery = supabase
    .from("games")
    .select(
      "id,name,type,min_players,max_players,best_players,play_time,difficulty,publisher,thumbnail,description,genre,weight,icon,min_age,year_published,bgg_url,bgg_id",
    )
    .or("genre.is.null,genre.neq.머더미스터리")
    .order("name", { ascending: true })
    .range(from, to);

  if (query) {
    const safeQuery = query.replace(/[,%]/g, " ");
    pageQuery = pageQuery.or(
      `name.ilike.%${safeQuery}%,publisher.ilike.%${safeQuery}%`,
    );
  }

  if (selectedGenre) {
    pageQuery = pageQuery.eq("genre", selectedGenre);
  }

  const [{ data: games, error: gamesError }, { data: genreRows }, authResult] =
    await Promise.all([
      pageQuery,
      supabase
        .from("games")
        .select("genre")
        .not("genre", "is", null)
        .neq("genre", "머더미스터리")
        .limit(1000),
      supabase.auth.getUser(),
    ]);

  if (gamesError) {
    console.error("보드게임 목록 조회 오류:", gamesError);
  }

  const genres = Array.from(
    new Set(
      (genreRows ?? [])
        .map((row) => (typeof row.genre === "string" ? row.genre.trim() : ""))
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "ko"));

  let canManage = false;
  const user = authResult.data.user;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("site_role,role")
      .eq("id", user.id)
      .maybeSingle();

    const role = String(profile?.site_role ?? profile?.role ?? "").toUpperCase();
    canManage = MANAGER_ROLES.includes(role);
  }

  return (
    <main className="boardgamesPage">
      <section className="hero">
        <div>
          <p>BOARD GAMES</p>
          <h1>보드게임</h1>
          <span>보드라운지가 보유한 게임을 확인하고, 인원과 장르에 맞는 게임을 찾아보세요.</span>
        </div>
        {canManage && (
          <Link className="manageLink" href="/admin/library?type=boardgame">
            게임 등록·관리
          </Link>
        )}
      </section>

      <section className="content">
        <BoardgameList
          initialGames={games ?? []}
          totalCount={totalCount}
          currentPage={currentPage}
          pageSize={PAGE_SIZE}
          query={query}
          selectedGenre={selectedGenre}
          genres={genres}
          canManage={canManage}
        />
      </section>

      <style>{`
        .boardgamesPage { min-height: 100vh; background: #08090b; color: #fff; }
        .hero { max-width: 1232px; margin: 0 auto; padding: 88px 20px 68px; display: flex; align-items: end; justify-content: space-between; gap: 28px; }
        .hero p { margin: 0 0 18px; color: #ffbd00; font-size: 14px; font-weight: 900; letter-spacing: .28em; }
        .hero h1 { margin: 0 0 20px; font-size: clamp(42px, 6vw, 68px); line-height: 1; }
        .hero span { color: #9aa7bd; font-size: 17px; line-height: 1.8; }
        .manageLink { flex: none; padding: 15px 22px; border: 1px solid #7651b7; border-radius: 16px; color: #d8c6ff; text-decoration: none; font-weight: 900; }
        .content { max-width: 1232px; margin: 0 auto; padding: 0 20px 100px; }
        @media (max-width: 700px) {
          .hero { padding: 52px 20px 42px; align-items: flex-start; flex-direction: column; }
          .hero h1 { font-size: 46px; }
          .hero span { font-size: 15px; }
          .manageLink { align-self: flex-start; }
          .content { padding-inline: 14px; }
        }
      `}</style>
    </main>
  );
}
