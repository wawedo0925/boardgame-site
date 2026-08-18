import Link from "next/link";

import BoardgameList from "./BoardgameList";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 10;
const MANAGER_ROLES = new Set([
  "MAIN_ADMIN",
  "ADMIN",
  "RULEMASTER",
  "MASTER",
  "MANAGER",
]);

type SearchParams = {
  page?: string;
  q?: string;
  genre?: string;
};

function normalizePage(value?: string) {
  const page = Number(value ?? "1");
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function normalizeRole(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

function safeSearch(value: string) {
  return value.replace(/[,%()]/g, " ").trim();
}

export default async function BoardgamesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const requestedPage = normalizePage(params.page);
  const query = String(params.q ?? "").trim();
  const genre = String(params.genre ?? "전체 장르").trim() || "전체 장르";
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let canManage = false;
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    const role = normalizeRole(profile?.site_role ?? profile?.role);
    canManage = MANAGER_ROLES.has(role);
  }

  let countQuery = supabase
    .from("games")
    .select("id", { count: "exact", head: true })
    .or("type.is.null,type.neq.MURDER_MYSTERY");

  const cleanedQuery = safeSearch(query);
  if (cleanedQuery) {
    countQuery = countQuery.or(
      `name.ilike.%${cleanedQuery}%,publisher.ilike.%${cleanedQuery}%`,
    );
  }
  if (genre !== "전체 장르") {
    countQuery = countQuery.eq("genre", genre);
  }

  const { count } = await countQuery;
  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(requestedPage, totalPages);
  const from = (page - 1) * PAGE_SIZE;

  let gamesQuery = supabase
    .from("games")
    .select("*")
    .or("type.is.null,type.neq.MURDER_MYSTERY");

  if (cleanedQuery) {
    gamesQuery = gamesQuery.or(
      `name.ilike.%${cleanedQuery}%,publisher.ilike.%${cleanedQuery}%`,
    );
  }
  if (genre !== "전체 장르") {
    gamesQuery = gamesQuery.eq("genre", genre);
  }

  const { data: games, error } = await gamesQuery
    .order("name", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  const { data: genreRows } = await supabase
    .from("games")
    .select("genre")
    .or("type.is.null,type.neq.MURDER_MYSTERY")
    .not("genre", "is", null)
    .limit(1000);

  const genres = Array.from(
    new Set(
      (genreRows ?? [])
        .map((row) => String(row.genre ?? "").trim())
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, "ko"));

  return (
    <main className="boardgamesPage">
      <section className="boardgamesHero">
        <div>
          <p className="eyebrow">BOARD GAMES</p>
          <h1>보드게임</h1>
          <p className="description">
            보드라운지가 보유한 게임을 확인하고, 인원과 장르에 맞는 게임을
            찾아보세요.
          </p>
        </div>

        {canManage && (
          <Link className="libraryButton" href="/admin/library">
            게임 등록·관리
          </Link>
        )}
      </section>

      {error ? (
        <section className="errorBox">
          보드게임을 불러오지 못했습니다. {error.message}
        </section>
      ) : (
        <BoardgameList
          games={games ?? []}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          query={query}
          genre={genre}
          genres={genres}
          canManage={canManage}
        />
      )}

      <style>{`
        .boardgamesPage { min-height: 100vh; background: #090a0b; color: #fff; padding-bottom: 96px; }
        .boardgamesHero { width: min(1232px, calc(100% - 40px)); margin: 0 auto; padding: 88px 0 68px; display: flex; align-items: flex-end; justify-content: space-between; gap: 32px; }
        .eyebrow { margin: 0 0 16px; color: #ffbd00; font-size: 14px; font-weight: 900; letter-spacing: .32em; }
        h1 { margin: 0; font-size: clamp(42px, 6vw, 64px); line-height: 1; }
        .description { max-width: 680px; margin: 24px 0 0; color: #91a0ba; font-size: 18px; line-height: 1.8; }
        .libraryButton { flex: none; border: 1px solid #7045a5; border-radius: 16px; padding: 16px 22px; color: #d7c5ff; background: #15101d; text-decoration: none; font-weight: 900; }
        .libraryButton:hover { border-color: #9d70d7; background: #1d1429; }
        .errorBox { width: min(1232px, calc(100% - 40px)); margin: 0 auto; border: 1px solid #8d2932; border-radius: 16px; padding: 24px; color: #ff8d96; background: #1a0d10; }
        @media (max-width: 700px) {
          .boardgamesHero { width: calc(100% - 32px); padding: 48px 0 40px; align-items: flex-start; flex-direction: column; }
          .description { font-size: 16px; }
          .libraryButton { align-self: stretch; text-align: center; }
          .errorBox { width: calc(100% - 32px); }
        }
      `}</style>
    </main>
  );
}
