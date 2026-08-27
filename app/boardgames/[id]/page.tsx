"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import GameGuideSection from "@/components/boardgames/GameGuideSection";
import GameReviewAction from "@/components/boardgames/GameReviewAction";
import CommentSection from "./CommentSection";

type GameRow = {
  id: string;
  name: string;
  type: string | null;
  min_players: number | null;
  max_players: number | null;
  play_time: number | null;
  difficulty: number | null;
  publisher: string | null;
};

type ReviewRow = {
  id: string;
  game_id: string;
  author_name: string | null;
  rating: number;
  content: string | null;
  created_at: string;
};

type PlayRecordGameRow = {
  play_count: number | null;
};

function formatGameType(type: string | null) {
  switch (type) {
    case "SCORE": return "점수형";
    case "ROLE": return "역할 추리";
    case "SIMPLE_SCORE": return "간단 점수형";
    case "COOP": return "협력형";
    default: return type?.trim() || "보드게임";
  }
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function difficultyLabel(value: number | null) {
  if (value === null) return "미입력";
  const description = value < 1.5 ? "매우 쉬움" : value < 2.5 ? "쉬움" : value < 3.5 ? "보통" : value < 4.5 ? "어려움" : "매우 어려움";
  return `${Number(value.toFixed(2))} / 5 · ${description}`;
}

function RatingStars({ rating, size = "normal" }: { rating: number; size?: "normal" | "large" }) {
  const roundedRating = Math.round(rating);
  return (
    <div className={`flex items-center gap-1 ${size === "large" ? "text-2xl" : "text-base"}`} aria-label={`5점 만점에 ${rating.toFixed(1)}점`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <span key={index} className={index < roundedRating ? "text-amber-400" : "text-zinc-700"}>★</span>
      ))}
    </div>
  );
}

function InformationCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.025] p-5">
      <p className="text-xs font-semibold tracking-[0.15em] text-zinc-600">{label}</p>
      <p className="mt-2 font-semibold text-zinc-200">{value}</p>
    </div>
  );
}

export default function BoardGameDetailPage() {
  const params = useParams<{ id: string }>();
  const gameId = Array.isArray(params.id) ? params.id[0] : params.id;
  const supabase = useMemo(() => createClient(), []);

  const [game, setGame] = useState<GameRow | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [totalPlayCount, setTotalPlayCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function loadGameDetail() {
      if (!gameId) {
        if (isMounted) {
          setErrorMessage("게임 주소가 올바르지 않습니다.");
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setErrorMessage("");

      const [gameResponse, reviewResponse, playResponse] = await Promise.all([
        supabase.from("games").select("id, name, type, min_players, max_players, play_time, difficulty, publisher").eq("id", gameId).single(),
        supabase.from("game_reviews").select("id, game_id, author_name, rating, content, created_at").eq("game_id", gameId).order("created_at", { ascending: false }),
        supabase.from("play_record_games").select("play_count").eq("game_id", gameId),
      ]);

      if (!isMounted) return;

      if (gameResponse.error || !gameResponse.data) {
        setErrorMessage(gameResponse.error?.message ? `게임 정보를 불러오지 못했습니다: ${gameResponse.error.message}` : "등록된 게임을 찾을 수 없습니다.");
        setIsLoading(false);
        return;
      }

      if (reviewResponse.error) {
        setErrorMessage(`평가를 불러오지 못했습니다: ${reviewResponse.error.message}`);
        setIsLoading(false);
        return;
      }

      if (playResponse.error) {
        setErrorMessage(`플레이 기록을 불러오지 못했습니다: ${playResponse.error.message}`);
        setIsLoading(false);
        return;
      }

      setGame(gameResponse.data as GameRow);
      setReviews((reviewResponse.data ?? []) as ReviewRow[]);
      setTotalPlayCount(((playResponse.data ?? []) as PlayRecordGameRow[]).reduce((sum, row) => sum + (row.play_count ?? 0), 0));
      setIsLoading(false);
    }

    void loadGameDetail();
    return () => { isMounted = false; };
  }, [gameId, supabase]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) return 0;
    return reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;
  }, [reviews]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white">
        <div className="mx-auto flex min-h-[70vh] max-w-7xl items-center justify-center px-6">
          <div className="text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-amber-400" />
            <p className="mt-5 text-sm text-zinc-500">게임 정보를 불러오는 중입니다.</p>
          </div>
        </div>
      </main>
    );
  }

  if (errorMessage || !game) {
    return (
      <main className="min-h-screen bg-zinc-950 text-white">
        <div className="mx-auto flex min-h-[70vh] max-w-3xl items-center justify-center px-6">
          <section className="w-full rounded-3xl border border-red-400/20 bg-red-400/[0.04] p-8 text-center">
            <p className="text-sm font-semibold tracking-[0.2em] text-red-300">GAME NOT FOUND</p>
            <h1 className="mt-3 text-2xl font-bold">게임 상세 페이지를 열 수 없습니다</h1>
            <p className="mt-4 break-words text-sm leading-7 text-zinc-400">{errorMessage || "게임 정보가 없습니다."}</p>
            <Link href="/boardgames" className="mt-7 inline-flex rounded-2xl bg-amber-400 px-6 py-3 font-bold text-zinc-950 transition hover:bg-amber-300">보드게임 목록으로</Link>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-6 py-16 sm:py-20">
          <Link href="/boardgames" className="inline-flex items-center gap-2 text-sm font-semibold text-zinc-500 transition hover:text-amber-300">← 보드게임 목록</Link>

          <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-full bg-amber-400/10 px-3 py-1.5 text-xs font-bold text-amber-300">{formatGameType(game.type)}</span>
                <span className="text-sm text-zinc-600">GAME DETAIL</span>
              </div>
              <h1 className="mt-5 text-4xl font-bold sm:text-5xl">{game.name}</h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-zinc-400">게임 정보와 보드라운지 회원들의 실제 플레이 평가를 확인하세요.</p>
            </div>

            <div className="rounded-3xl border border-amber-400/20 bg-amber-400/[0.04] p-6">
              <p className="text-xs font-semibold tracking-[0.2em] text-zinc-500">COMMUNITY RATING</p>
              {reviews.length > 0 ? (
                <>
                  <div className="mt-4 flex items-end gap-3">
                    <strong className="text-5xl font-bold text-amber-300">{averageRating.toFixed(1)}</strong>
                    <span className="pb-1 text-zinc-600">/ 5.0</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    <RatingStars rating={averageRating} size="large" />
                    <span className="text-sm text-zinc-500">평가 {reviews.length}개</span>
                  </div>
                </>
              ) : (
                <div className="mt-4">
                  <p className="text-2xl font-bold text-zinc-300">평가 없음</p>
                  <p className="mt-2 text-sm text-zinc-600">첫 번째 평가를 남겨보세요.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-14 sm:py-16">
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
          <InformationCard label="PLAYER" value={game.min_players !== null && game.max_players !== null ? `${game.min_players}~${game.max_players}명` : "미입력"} />
          <InformationCard label="PLAY TIME" value={game.play_time !== null ? `약 ${game.play_time}분` : "미입력"} />
          <InformationCard label="DIFFICULTY" value={difficultyLabel(game.difficulty)} />
          <InformationCard label="PUBLISHER" value={game.publisher?.trim() || "미입력"} />
          <InformationCard label="TOTAL PLAYS" value={`${totalPlayCount}판`} />
        </div>

        <GameGuideSection gameId={gameId} />

        <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px]">
          <section>
            <div className="flex flex-col gap-5 border-b border-white/10 pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold tracking-[0.25em] text-amber-400">PLAYER REVIEWS</p>
                <h2 className="mt-2 text-3xl font-bold">회원 평가</h2>
                <p className="mt-3 text-sm text-zinc-500">실제 플레이 후 남긴 별점과 한줄평입니다.</p>
              </div>
              <GameReviewAction gameId={gameId} />
            </div>

            {reviews.length > 0 ? (
              <div className="divide-y divide-white/10">
                {reviews.map((review) => (
                  <article key={review.id} className="py-7">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-bold text-zinc-200">{review.author_name?.trim() || "보드라운지 회원"}</p>
                        <div className="mt-2"><RatingStars rating={review.rating} /></div>
                      </div>
                      <time dateTime={review.created_at} className="text-sm text-zinc-600">{formatDate(review.created_at)}</time>
                    </div>
                    <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-400">{review.content?.trim() || "한줄평이 없습니다."}</p>
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-7 rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-16 text-center">
                <p className="font-bold text-zinc-300">아직 등록된 평가가 없습니다.</p>
                <p className="mt-3 text-sm text-zinc-600">이 게임을 플레이했다면 첫 번째 평가를 남겨보세요.</p>
              </div>
            )}
          </section>

          <aside className="space-y-5">
            <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6">
              <p className="text-xs font-semibold tracking-[0.2em] text-amber-400">PLAY RECORD</p>
              <h2 className="mt-3 text-xl font-bold">플레이 기록은 자동 저장됩니다</h2>
              <p className="mt-3 text-sm leading-7 text-zinc-500">이벤트 관리자 또는 조 룰마스터가 판과 결과를 입력하면 참가 멤버의 기록과 통계에 자동으로 반영됩니다.</p>
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.025] p-6">
              <p className="text-xs font-semibold tracking-[0.2em] text-zinc-600">REVIEW SUMMARY</p>
              <dl className="mt-5 space-y-4 text-sm">
                <div className="flex items-center justify-between gap-4"><dt className="text-zinc-500">평균 별점</dt><dd className="font-bold text-zinc-200">{reviews.length > 0 ? `${averageRating.toFixed(1)}점` : "평가 없음"}</dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-zinc-500">평가 수</dt><dd className="font-bold text-zinc-200">{reviews.length}개</dd></div>
                <div className="flex items-center justify-between gap-4"><dt className="text-zinc-500">기록된 플레이</dt><dd className="font-bold text-zinc-200">{totalPlayCount}판</dd></div>
              </dl>
            </section>
          </aside>
        </div>

        <CommentSection gameId={gameId} />
      </section>
    </main>
  );
}
