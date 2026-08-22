import Link from "next/link";

import { createClient } from "@/lib/supabase/server";

import BoardgameList from "./BoardgameList";

const PAGE_SIZE = 10;

type SearchParams = Promise<{
  page?: string;
  q?: string;
  genre?: string;
}>;

function normalizeRole(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function hasManagementRole(value: unknown) {
  const role = normalizeRole(value);

  return [
    "MAIN_ADMIN",
    "ADMIN",
    "RULEMASTER",
    "MASTER",
    "MANAGER",
    "메인_관리자",
    "관리자",
    "룰마",
  ].includes(role);
}

export default async function BoardgamesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;

  const requestedPage = Number(params.page ?? "1");
  const page =
    Number.isInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;

  const query = String(params.q ?? "").trim();
  const genre = String(params.genre ?? "").trim();

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const supabase = await createClient();

  let gameRequest = supabase
    .from("games")
    .select(
      `
        id,
        name,
        genre,
        min_players,
        max_players,
        best_players,
        play_time,
        publisher,
        thumbnail
      `,
      { count: "exact" },
    )
    .order("name", { ascending: true })
    .range(from, to);

  if (query) {
    const safeQuery = query.replace(/[,%()]/g, " ");

    gameRequest = gameRequest.or(
      `name.ilike.%${safeQuery}%,publisher.ilike.%${safeQuery}%`,
    );
  }

  if (genre) {
    gameRequest = gameRequest.eq("genre", genre);
  }

  const [
    { data: games, count, error },
    { data: genreRows },
    {
      data: { user },
    },
  ] = await Promise.all([
    gameRequest,
    supabase
      .from("games")
      .select("genre")
      .not("genre", "is", null)
      .order("genre", { ascending: true }),
    supabase.auth.getUser(),
  ]);

  let boardgameCanManage = false;

  if (user) {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      console.error("보드게임 관리 권한 조회 오류:", profileError);
    }

    const profileRecord = profile as Record<string, unknown> | null;

    boardgameCanManage =
      hasManagementRole(profileRecord?.site_role) ||
      hasManagementRole(profileRecord?.role) ||
      profileRecord?.is_admin === true;
  }

  const genres = Array.from(
    new Set(
      (genreRows ?? [])
        .map((row) => String(row.genre ?? "").trim())
        .filter(Boolean),
    ),
  );

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

        {boardgameCanManage && (
          <Link href="/admin/library" className="libraryButton">
            게임 등록·관리
          </Link>
        )}
      </section>

      {error ? (
        <section className="errorBox">
          보드게임을 불러오지 못했습니다.
          <br />
          {error.message}
        </section>
      ) : (
        <BoardgameList
          games={games ?? []}
          total={count ?? 0}
          page={page}
          pageSize={PAGE_SIZE}
          query={query}
          genre={genre}
          genres={genres}
          canManage={boardgameCanManage}
        />
      )}

      <style>{`
        .boardgamesPage {
          min-height: 100vh;
          padding-bottom: 96px;
          background: #090a0b;
          color: #ffffff;
        }

        .boardgamesHero {
          width: min(1232px, calc(100% - 40px));
          min-height: 310px;
          margin: 0 auto;
          padding: 88px 0 68px;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 36px;
        }

        .eyebrow {
          margin: 0 0 16px;
          color: #ffbd00;
          font-size: 14px;
          font-weight: 900;
          letter-spacing: 0.32em;
        }

        h1 {
          margin: 0;
          font-size: clamp(42px, 6vw, 64px);
          line-height: 1;
        }

        .description {
          max-width: 680px;
          margin: 24px 0 0;
          color: #91a0ba;
          font-size: 18px;
          line-height: 1.8;
        }

        .libraryButton {
          flex: none;
          border: 1px solid #7045a5;
          border-radius: 16px;
          padding: 16px 22px;
          color: #d7c5ff;
          background: #15101d;
          text-decoration: none;
          font-weight: 800;
        }

        .libraryButton:hover {
          border-color: #9d70d7;
          background: #1d1429;
        }

        .errorBox {
          width: min(1232px, calc(100% - 40px));
          margin: 0 auto;
          border: 1px solid #8d2932;
          border-radius: 16px;
          padding: 24px;
          color: #ff8f98;
          background: #1b0d10;
          line-height: 1.7;
        }

        @media (max-width: 700px) {
          .boardgamesHero {
            width: calc(100% - 32px);
            min-height: auto;
            padding: 48px 0 40px;
            align-items: flex-start;
            flex-direction: column;
          }

          .description {
            font-size: 16px;
          }

          .libraryButton {
            width: 100%;
            text-align: center;
          }

          .errorBox {
            width: calc(100% - 32px);
          }
        }
      `}</style>
    </main>
  );
}