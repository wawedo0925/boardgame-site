"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type GameReview = {
  id: string;
  game_id: string;
  author_name: string;
  rating: number;
  content: string;
  created_at: string;
  updated_at: string;
};

type ReviewSectionProps = {
  gameId: string;
};

type MessageState = {
  type: "success" | "error";
  text: string;
} | null;

const MAX_AUTHOR_LENGTH = 20;
const MAX_CONTENT_LENGTH = 500;

function formatReviewDate(dateValue: string) {
  const date = new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return "날짜 미정";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(date);
}

function renderStars(rating: number) {
  return Array.from({ length: 5 }, (_, index) =>
    index < rating ? "★" : "☆"
  ).join("");
}

export default function ReviewSection({
  gameId,
}: ReviewSectionProps) {
  const supabase = useMemo(() => createClient(), []);

  const [reviews, setReviews] = useState<GameReview[]>([]);
  const [authorName, setAuthorName] = useState("");
  const [rating, setRating] = useState(5);
  const [content, setContent] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<MessageState>(null);

  const loadReviews = useCallback(async () => {
    setIsLoading(true);

    const { data, error } = await supabase
      .from("game_reviews")
      .select(
        "id, game_id, author_name, rating, content, created_at, updated_at"
      )
      .eq("game_id", gameId)
      .order("created_at", { ascending: false });

    if (error) {
      setReviews([]);
      setMessage({
        type: "error",
        text: `리뷰를 불러오지 못했습니다: ${error.message}`,
      });
      setIsLoading(false);
      return;
    }

    setReviews((data ?? []) as GameReview[]);
    setIsLoading(false);
  }, [gameId, supabase]);

  useEffect(() => {
    void loadReviews();
  }, [loadReviews]);

  const averageRating = useMemo(() => {
    if (reviews.length === 0) {
      return null;
    }

    const ratingTotal = reviews.reduce(
      (total, review) => total + review.rating,
      0
    );

    return ratingTotal / reviews.length;
  }, [reviews]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedAuthorName = authorName.trim();
    const trimmedContent = content.trim();

    setMessage(null);

    if (
      trimmedAuthorName.length < 1 ||
      trimmedAuthorName.length > MAX_AUTHOR_LENGTH
    ) {
      setMessage({
        type: "error",
        text: `작성자 이름은 1자 이상 ${MAX_AUTHOR_LENGTH}자 이하로 입력해주세요.`,
      });
      return;
    }

    if (rating < 1 || rating > 5) {
      setMessage({
        type: "error",
        text: "평점은 1점부터 5점 사이로 선택해주세요.",
      });
      return;
    }

    if (
      trimmedContent.length < 1 ||
      trimmedContent.length > MAX_CONTENT_LENGTH
    ) {
      setMessage({
        type: "error",
        text: `리뷰는 1자 이상 ${MAX_CONTENT_LENGTH}자 이하로 입력해주세요.`,
      });
      return;
    }

    setIsSubmitting(true);

    const { error } = await supabase.from("game_reviews").insert({
      game_id: gameId,
      author_name: trimmedAuthorName,
      rating,
      content: trimmedContent,
    });

    if (error) {
      setMessage({
        type: "error",
        text: `리뷰를 등록하지 못했습니다: ${error.message}`,
      });
      setIsSubmitting(false);
      return;
    }

    setContent("");
    setRating(5);

    setMessage({
      type: "success",
      text: "리뷰가 등록되었습니다.",
    });

    await loadReviews();
    setIsSubmitting(false);
  }

  return (
    <section className="mt-12 border-t border-white/10 pt-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold tracking-[0.25em] text-amber-400">
            REVIEWS
          </p>

          <h2 className="mt-2 text-3xl font-bold text-zinc-100">
            게임 평가
          </h2>

          <p className="mt-3 text-sm leading-6 text-zinc-500">
            게임을 플레이한 경험과 평점을 남겨보세요.
          </p>
        </div>

        <div className="flex gap-3">
          <div className="min-w-28 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
            <p className="text-xs text-zinc-500">평균 평점</p>

            <p className="mt-1 text-xl font-bold text-amber-400">
              {averageRating !== null
                ? averageRating.toFixed(1)
                : "-"}
              <span className="ml-1 text-xs font-normal text-zinc-600">
                / 5
              </span>
            </p>
          </div>

          <div className="min-w-28 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-center">
            <p className="text-xs text-zinc-500">등록 리뷰</p>

            <p className="mt-1 text-xl font-bold text-zinc-100">
              {reviews.length}
              <span className="ml-1 text-xs font-normal text-zinc-600">
                개
              </span>
            </p>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-7"
      >
        <div className="grid gap-5 sm:grid-cols-[1fr_220px]">
          <div>
            <label
              htmlFor="review-author"
              className="text-sm font-semibold text-zinc-300"
            >
              작성자 이름
            </label>

            <input
              id="review-author"
              type="text"
              value={authorName}
              onChange={(event) => setAuthorName(event.target.value)}
              maxLength={MAX_AUTHOR_LENGTH}
              disabled={isSubmitting}
              placeholder="이름 또는 닉네임"
              className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400/50 disabled:cursor-not-allowed disabled:opacity-60"
            />

            <p className="mt-2 text-right text-xs text-zinc-600">
              {authorName.length} / {MAX_AUTHOR_LENGTH}
            </p>
          </div>

          <div>
            <label
              htmlFor="review-rating"
              className="text-sm font-semibold text-zinc-300"
            >
              평점
            </label>

            <select
              id="review-rating"
              value={rating}
              onChange={(event) =>
                setRating(Number(event.target.value))
              }
              disabled={isSubmitting}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm text-zinc-100 outline-none transition focus:border-amber-400/50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <option value={5}>★★★★★ 5점</option>
              <option value={4}>★★★★☆ 4점</option>
              <option value={3}>★★★☆☆ 3점</option>
              <option value={2}>★★☆☆☆ 2점</option>
              <option value={1}>★☆☆☆☆ 1점</option>
            </select>
          </div>
        </div>

        <div className="mt-5">
          <label
            htmlFor="review-content"
            className="text-sm font-semibold text-zinc-300"
          >
            한줄평
          </label>

          <textarea
            id="review-content"
            value={content}
            onChange={(event) => setContent(event.target.value)}
            maxLength={MAX_CONTENT_LENGTH}
            disabled={isSubmitting}
            rows={5}
            placeholder="게임을 플레이한 소감을 남겨주세요."
            className="mt-2 w-full resize-none rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-sm leading-6 text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-amber-400/50 disabled:cursor-not-allowed disabled:opacity-60"
          />

          <p className="mt-2 text-right text-xs text-zinc-600">
            {content.length} / {MAX_CONTENT_LENGTH}
          </p>
        </div>

        {message && (
          <div
            className={
              message.type === "success"
                ? "mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300"
                : "mt-5 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300"
            }
          >
            {message.text}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex min-w-32 items-center justify-center rounded-2xl bg-amber-400 px-5 py-3 text-sm font-bold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "등록 중..." : "리뷰 등록"}
          </button>
        </div>
      </form>

      <div className="mt-8">
        {isLoading ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-14 text-center">
            <p className="text-sm text-zinc-500">
              리뷰를 불러오는 중입니다...
            </p>
          </div>
        ) : reviews.length === 0 ? (
          <div className="rounded-3xl border border-white/10 bg-white/[0.02] px-6 py-14 text-center">
            <div className="text-4xl">💬</div>

            <h3 className="mt-4 text-lg font-semibold text-zinc-200">
              아직 등록된 리뷰가 없습니다.
            </h3>

            <p className="mt-2 text-sm text-zinc-500">
              이 게임의 첫 번째 리뷰를 남겨보세요.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {reviews.map((review) => (
              <article
                key={review.id}
                className="rounded-3xl border border-white/10 bg-white/[0.02] p-5 sm:p-6"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-semibold text-zinc-100">
                        {review.author_name}
                      </h3>

                      <span
                        className="text-sm tracking-wider text-amber-400"
                        aria-label={`${review.rating}점`}
                      >
                        {renderStars(review.rating)}
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-zinc-600">
                      {formatReviewDate(review.created_at)}
                    </p>
                  </div>

                  <span className="inline-flex w-fit rounded-full bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-300">
                    {review.rating}.0점
                  </span>
                </div>

                <p className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-zinc-300">
                  {review.content}
                </p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}