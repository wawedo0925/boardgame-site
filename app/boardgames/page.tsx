import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

import BoardgameList from "./BoardgameList";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 10;

type PageSearchParams = Promise<{
  page?: string | string[];
  q?: string | string[];
  genre?: string | string[];
}>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function roleIsManager(value: unknown) {
  return ["MAIN_ADMIN", "ADMIN", "RULEMASTER", "MASTER", "MANAGER"].includes(
    String(value ?? "").toUpperCase(),
  );
}

export default async function BoardgamesPage({
  searchParams,
}: {
  searchParams: PageSearchParams;
}) {
  const params = await searchParams;
  const query = first(params.q).trim();
  const selectedGenre = first(params.genre).trim();
  const requestedPage = Number.parseInt(first(params.page), 10);
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const from = (currentPage - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  let gamesQuery = supabase
    .from("games")
    .select("*", { count: "exact" })
    .order("name", { ascending: true });

  if (query) {
    const safeQuery = query.replace(/[%_,()]/g, " ").trim();
    if (safeQuery) {
      gamesQuery = gamesQuery.or(
        `name.ilike.%${safeQuery}%,publisher.ilike.%${safeQuery}%`,
      );
    }
  }

  if (selectedGenre) {
    gamesQuery = gamesQuery.eq("genre", selectedGenre);
  }

  const [gamesResult, genreResult, userResult] = await Promise.all([
    gamesQuery.range(from, to),
    supabase.from("games").select("genre").not("genre", "is", null).limit(1000),
    supabase.auth.getUser(),
  ]);

  let canManage = false;
  const user = userResult.data.user;

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("site_role, role")
      .eq("id", user.id)
      .maybeSingle();

    canManage = roleIsManager(profile?.site_role) || roleIsManager(profile?.role);
  }

  const genres = Array.from(
    new Set(
      (genreResult.data ?? [])
        .map((row) => String(row.genre ?? "").trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "ko"));

  return (
    <main className="boardgames-page">
      <section className="boardgames-hero">
        <div>
          <p className="eyebrow">BOARD GAMES</p>
          <h1>보드게임</h1>
          <p className="description">
            보드라운지가 보유한 게임을 확인하고, 인원과 장르에 맞는 게임을 찾아보세요.
          </p>
        </div>

        {canManage ? (
          <Link className="library-link" href="/admin/library">
            게임 등록·관리
          </Link>
        ) : null}
      </section>

      <BoardgameList
        games={gamesResult.data ?? []}
        totalCount={gamesResult.count ?? 0}
        currentPage={currentPage}
        pageSize={PAGE_SIZE}
        query={query}
        selectedGenre={selectedGenre}
        genres={genres}
        canManage={canManage}
      />

      <style>{`
        .boardgames-page{min-height:100vh;background:#090a0b;color:#fff;padding-bottom:80px}
        .boardgames-hero{max-width:1232px;margin:0 auto;padding:88px 20px 72px;display:flex;align-items:flex-end;justify-content:space-between;gap:28px}
        .eyebrow{margin:0 0 14px;color:#ffbd00;font-size:13px;font-weight:900;letter-spacing:5px}
        .boardgames-hero h1{margin:0;font-size:52px;line-height:1.1}
        .description{max-width:700px;margin:24px 0 0;color:#9ba7bd;font-size:18px;line-height:1.8}
        .library-link{flex:none;border:1px solid #7555a7;border-radius:16px;padding:16px 22px;color:#dfd2ff;text-decoration:none;font-weight:900}
        @media(max-width:700px){
          .boardgames-hero{padding:56px 20px 44px;align-items:flex-start;flex-direction:column}
          .boardgames-hero h1{font-size:42px}
          .description{font-size:16px;line-height:1.7}
          .library-link{align-self:flex-end}
        }
      `}</style>
    </main>
  );
}
