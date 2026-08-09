"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type GameType = "보드게임" | "머더미스터리";
type SortOption = "latest" | "rating-desc" | "rating-asc";

type GameRow = {
  id: string;
  name: string;
  type: string | null;
};

type PlayRecordGameRow = {
  id: string;
  game_id: string;
  play_count: number;
  memo: string | null;
  games: GameRow | GameRow[] | null;
};

type PlayRecordRow = {
  id: string;
  user_id: string;
  played_at: string;
  title: string | null;
  location: string | null;
  created_at: string;
  play_record_games: PlayRecordGameRow[] | null;
};

type GameReviewRow = {
  id: string;
  game_id: string;
  author_name: string | null;
  rating: number;
  content: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  nickname: string | null;
};

type RoundRecord = {
  score?: string;
};

type Review = {
  id: string;
  userName: string;
  gameType: GameType;
  gameId: string;
  gameName: string;
  eventName: string;
  playedAt: string;
  playedAtRaw: string;
  rating: number | null;
  score: number | null;
  comment: string;
  createdAt: string;
};

function getSingleGame(value: GameRow | GameRow[] | null) {
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function formatDate(value: string) {
  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .replaceAll(". ", ".")
    .replace(/\.$/, "");
}

function parseScore(memo: string | null) {
  if (!memo) return null;

  try {
    const rounds = JSON.parse(memo) as RoundRecord[];
    const score = rounds.find((round) => round.score?.trim())?.score;

    if (!score) return null;

    const numericScore = Number(score);
    return Number.isFinite(numericScore) ? numericScore : null;
  } catch {
    return null;
  }
}

function determineGameType(gameType: string | null): GameType {
  const normalized = gameType?.toUpperCase() ?? "";

  if (normalized.includes("MURDER") || normalized.includes("MYSTERY")) {
    return "머더미스터리";
  }

  return "보드게임";
}

function RatingStars({ rating }: { rating: number | null }) {
  if (rating === null) {
    return <span className="text-sm text-zinc-600">미입력</span>;
  }

  return (
    <div className="flex gap-0.5" aria-label={`5점 만점에 ${rating}점`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <span
          key={index}
          className={index < rating ? "text-amber-400" : "text-zinc-700"}
        >
          ★
        </span>
      ))}
    </div>
  );
}

function GameTypeBadge({ gameType }: { gameType: GameType }) {
  const style =
    gameType === "보드게임"
      ? "bg-amber-400/10 text-amber-300"
      : "bg-red-400/10 text-red-300";

  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${style}`}
    >
      {gameType}
    </span>
  );
}

export default function ReviewsPage() {
  const supabase = useMemo(() => createClient(), []);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const [sortOption, setSortOption] = useState<SortOption>("latest");
  const [gameTypeFilter, setGameTypeFilter] = useState("all");
  const [gameFilter, setGameFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [eventFilter, setEventFilter] = useState("all");

  useEffect(() => {
    let isMounted = true;

    async function loadReviews() {
      setIsLoading(true);
      setErrorMessage("");

      const { data: recordData, error: recordError } = await supabase
        .from("play_records")
        .select(
          `
            id,
            user_id,
            played_at,
            title,
            location,
            created_at,
            play_record_games (
              id,
              game_id,
              play_count,
              memo,
              games (
                id,
                name,
                type
              )
            )
          `,
        )
        .order("played_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (recordError) {
        if (isMounted) {
          setErrorMessage(`플레이 기록을 불러오지 못했습니다: ${recordError.message}`);
          setIsLoading(false);
        }
        return;
      }

      const records = (recordData ?? []) as unknown as PlayRecordRow[];
      const userIds = [...new Set(records.map((record) => record.user_id))];
      const gameIds = [
        ...new Set(
          records.flatMap((record) =>
            (record.play_record_games ?? []).map((item) => item.game_id),
          ),
        ),
      ];

      const [profileResponse, reviewResponse] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("id, nickname").in("id", userIds)
          : Promise.resolve({ data: [], error: null }),
        gameIds.length
          ? supabase
              .from("game_reviews")
              .select("id, game_id, author_name, rating, content, created_at")
              .in("game_id", gameIds)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      const profiles = (profileResponse.data ?? []) as ProfileRow[];
      const gameReviews = (reviewResponse.data ?? []) as GameReviewRow[];

      const profileMap = new Map(
        profiles.map((profile) => [
          profile.id,
          profile.nickname?.trim() || "보드라운지 회원",
        ]),
      );

      const usedReviewIds = new Set<string>();

      const mappedReviews: Review[] = records.flatMap((record) =>
        (record.play_record_games ?? []).flatMap((recordGame) => {
          const game = getSingleGame(recordGame.games);
          if (!game) return [];

          const matchingReview = gameReviews.find(
            (review) =>
              review.game_id === game.id &&
              !usedReviewIds.has(review.id) &&
              Math.abs(
                new Date(review.created_at).getTime() -
                  new Date(record.created_at).getTime(),
              ) <
                10 * 60 * 1000,
          );

          if (matchingReview) usedReviewIds.add(matchingReview.id);

          return [
            {
              id: recordGame.id,
              userName:
                profileMap.get(record.user_id) ??
                matchingReview?.author_name?.trim() ??
                "보드라운지 회원",
              gameType: determineGameType(game.type),
              gameId: game.id,
              gameName: game.name,
              eventName:
                record.location?.trim() ||
                record.title?.trim() ||
                "개인 플레이",
              playedAt: formatDate(record.played_at),
              playedAtRaw: record.played_at,
              rating: matchingReview?.rating ?? null,
              score: parseScore(recordGame.memo),
              comment:
                matchingReview?.content?.trim() || "아직 한줄평이 없습니다.",
              createdAt: record.created_at,
            },
          ];
        }),
      );

      if (isMounted) {
        setReviews(mappedReviews);
        setIsLoading(false);
      }
    }

    void loadReviews();

    return () => {
      isMounted = false;
    };
  }, [supabase]);

  const gameOptions = useMemo(
    () => [...new Set(reviews.map((review) => review.gameName))].sort(),
    [reviews],
  );

  const eventOptions = useMemo(
    () => [...new Set(reviews.map((review) => review.eventName))].sort(),
    [reviews],
  );

  const filteredReviews = useMemo(() => {
    const result = reviews.filter((review) => {
      if (gameTypeFilter !== "all" && review.gameType !== gameTypeFilter) {
        return false;
      }

      if (gameFilter !== "all" && review.gameName !== gameFilter) {
        return false;
      }

      if (eventFilter !== "all" && review.eventName !== eventFilter) {
        return false;
      }

      if (ratingFilter === "5" && review.rating !== 5) return false;
      if (ratingFilter === "4" && (review.rating ?? 0) < 4) return false;
      if (ratingFilter === "3" && (review.rating ?? 0) < 3) return false;

      return true;
    });

    return [...result].sort((a, b) => {
      if (sortOption === "rating-desc") {
        return (b.rating ?? 0) - (a.rating ?? 0);
      }

      if (sortOption === "rating-asc") {
        return (a.rating ?? 0) - (b.rating ?? 0);
      }

      return (
        new Date(b.playedAtRaw).getTime() - new Date(a.playedAtRaw).getTime() ||
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    });
  }, [
    eventFilter,
    gameFilter,
    gameTypeFilter,
    ratingFilter,
    reviews,
    sortOption,
  ]);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <p className="text-sm font-semibold tracking-[0.3em] text-amber-400">
            GAME REVIEWS
          </p>

          <div className="mt-3 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-4xl font-bold sm:text-5xl">게임 평가</h1>

              <p className="mt-5 max-w-2xl text-lg leading-8 text-zinc-400">
                보드라운지에서 플레이한 게임의 평가와 한줄평을 확인하세요.
              </p>
            </div>

            <Link
              href="/reviews/new"
              className="rounded-2xl bg-amber-400 px-6 py-3 text-center font-semibold text-zinc-950 transition hover:bg-amber-300"
            >
              평가 작성하기
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="mb-8 grid gap-4 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:grid-cols-2 xl:grid-cols-5">
          <select
            value={sortOption}
            onChange={(event) => setSortOption(event.target.value as SortOption)}
            className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-300 outline-none"
          >
            <option value="latest">최신 평가순</option>
            <option value="rating-desc">별점 높은 순</option>
            <option value="rating-asc">별점 낮은 순</option>
          </select>

          <select
            value={gameTypeFilter}
            onChange={(event) => setGameTypeFilter(event.target.value)}
            className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-300 outline-none"
          >
            <option value="all">전체 게임 종류</option>
            <option value="보드게임">보드게임</option>
            <option value="머더미스터리">머더미스터리</option>
          </select>

          <select
            value={gameFilter}
            onChange={(event) => setGameFilter(event.target.value)}
            className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-300 outline-none"
          >
            <option value="all">전체 게임</option>
            {gameOptions.map((gameName) => (
              <option key={gameName} value={gameName}>
                {gameName}
              </option>
            ))}
          </select>

          <select
            value={ratingFilter}
            onChange={(event) => setRatingFilter(event.target.value)}
            className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-300 outline-none"
          >
            <option value="all">전체 별점</option>
            <option value="5">5점</option>
            <option value="4">4점 이상</option>
            <option value="3">3점 이상</option>
          </select>

          <select
            value={eventFilter}
            onChange={(event) => setEventFilter(event.target.value)}
            className="rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-300 outline-none"
          >
            <option value="all">전체 이벤트</option>
            {eventOptions.map((eventName) => (
              <option key={eventName} value={eventName}>
                {eventName}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-5 flex items-center justify-between">
          <p className="text-sm text-zinc-400">
            총{" "}
            <span className="font-semibold text-amber-400">
              {filteredReviews.length}
            </span>
            개의 평가
          </p>
        </div>

        {isLoading ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-20 text-center text-zinc-500">
            플레이 기록을 불러오는 중입니다.
          </div>
        ) : errorMessage ? (
          <div className="rounded-3xl border border-red-400/20 bg-red-400/[0.05] px-6 py-12 text-center text-red-300">
            {errorMessage}
          </div>
        ) : filteredReviews.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-20 text-center">
            <p className="text-lg font-semibold text-zinc-300">
              표시할 플레이 기록이 없습니다.
            </p>
            <p className="mt-3 text-sm text-zinc-600">
              첫 플레이 기록을 작성해 보세요.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl border border-white/10">
            <div className="hidden grid-cols-[105px_110px_1fr_1.1fr_105px_85px_2fr_90px] items-center gap-4 border-b border-white/10 bg-white/[0.04] px-6 py-4 text-sm text-zinc-500 2xl:grid">
              <p>플레이 날짜</p>
              <p>게임 종류</p>
              <p>게임</p>
              <p>이벤트</p>
              <p>별점</p>
              <p>점수</p>
              <p>한줄평</p>
              <p>작성자</p>
            </div>

            <div>
              {filteredReviews.map((review) => (
                <article
                  key={review.id}
                  className="grid gap-5 border-b border-white/10 px-5 py-6 transition last:border-b-0 hover:bg-white/[0.04] 2xl:grid-cols-[105px_110px_1fr_1.1fr_105px_85px_2fr_90px] 2xl:items-center 2xl:gap-4 2xl:px-6"
                >
                  <div>
                    <p className="mb-1 text-xs text-zinc-500 2xl:hidden">
                      플레이 날짜
                    </p>
                    <p className="text-sm text-zinc-300">{review.playedAt}</p>
                  </div>

                  <div>
                    <p className="mb-2 text-xs text-zinc-500 2xl:hidden">
                      게임 종류
                    </p>
                    <GameTypeBadge gameType={review.gameType} />
                  </div>

                  <div>
                    <p className="mb-1 text-xs text-zinc-500 2xl:hidden">게임</p>
                    <Link
                      href={`/boardgames/${review.gameId}`}
                      className="font-semibold text-zinc-100 transition hover:text-amber-300"
                    >
                      {review.gameName}
                    </Link>
                  </div>

                  <div>
                    <p className="mb-1 text-xs text-zinc-500 2xl:hidden">
                      이벤트
                    </p>
                    <p className="text-sm text-zinc-300">{review.eventName}</p>
                  </div>

                  <div>
                    <p className="mb-1 text-xs text-zinc-500 2xl:hidden">별점</p>
                    <RatingStars rating={review.rating} />
                  </div>

                  <div>
                    <p className="mb-1 text-xs text-zinc-500 2xl:hidden">점수</p>
                    <p className="text-sm text-zinc-300">
                      {review.gameType === "머더미스터리"
                        ? "해당 없음"
                        : review.score !== null
                          ? `${review.score}점`
                          : "미입력"}
                    </p>
                  </div>

                  <div>
                    <p className="mb-1 text-xs text-zinc-500 2xl:hidden">
                      한줄평
                    </p>
                    <p className="text-sm leading-6 text-zinc-400">
                      {review.comment}
                    </p>
                  </div>

                  <div>
                    <p className="mb-1 text-xs text-zinc-500 2xl:hidden">
                      작성자
                    </p>
                    <p className="text-sm text-zinc-300">{review.userName}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}

        <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.02] px-5 py-4 text-sm leading-6 text-zinc-400">
          보드게임의 점수는 선택적으로 기록할 수 있습니다. 머더미스터리는
          일반적으로 개인 점수를 사용하지 않기 때문에 점수 항목이{" "}
          <span className="font-semibold text-zinc-200">해당 없음</span>으로
          표시됩니다.
        </div>
      </section>
    </main>
  );
}
