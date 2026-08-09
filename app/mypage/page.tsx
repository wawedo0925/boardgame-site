"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import EventPlayHistory from "@/components/mypage/EventPlayHistory";
import Achievements from "@/components/mypage/Achievements";
import MurderMysteryHistory from "@/components/mypage/MurderMysteryHistory";

type Profile = {
  id: string;
  activity_name: string | null;
  birth_year: string | null;
  region: string | null;
  gender: string | null;
  created_at: string;
  updated_at: string;
};



type GameInfo = {
  id: string;
  name: string;
};

type PlayRecordGame = {
  id: string;
  game_id: string;
  play_count: number | null;
  memo: string | null;
  games: GameInfo | GameInfo[] | null;
};

type PlayRecord = {
  id: string;
  played_at: string;
  title: string | null;
  location: string | null;
  created_at: string;
  play_record_games: PlayRecordGame[] | null;
};

type ReviewRow = {
  id: string;
  game_id: string;
  author_name: string | null;
  rating: number;
  content: string | null;
  created_at: string;
  games: GameInfo | GameInfo[] | null;
};

type GameRanking = {
  gameId: string;
  gameName: string;
  playCount: number;
};

type RecentPlay = {
  id: string;
  playedAt: string;
  eventName: string;
  games: { name: string; playCount: number }[];
};

type PlayerGrade = {
  emoji: string;
  name: string;
  description: string;
};

type ProfileForm = {
  activityName: string;
  birthYear: string;
  region: string;
  gender: string;
};

const initialForm: ProfileForm = {
  activityName: "",
  birthYear: "",
  region: "",
  gender: "",
};

function formatDate(dateString: string | undefined) {
  if (!dateString) {
    return "확인할 수 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(dateString));
}

function getKakaoNickname(user: User) {
  return (
    user.user_metadata?.name ??
    user.user_metadata?.full_name ??
    user.user_metadata?.user_name ??
    user.user_metadata?.preferred_username ??
    user.user_metadata?.nickname ??
    "보드라운지 회원"
  );
}

function getAvatarUrl(user: User) {
  return (
    user.user_metadata?.avatar_url ??
    user.user_metadata?.picture ??
    user.user_metadata?.profile_image_url ??
    null
  );
}

function makeDisplayName(profile: Profile | null) {
  if (!profile?.activity_name) {
    return null;
  }

  const parts = [
    profile.activity_name,
    profile.birth_year,
    profile.region,
    profile.gender,
  ].filter(Boolean);

  return parts.join(" / ");
}



function getSingleGame(value: GameInfo | GameInfo[] | null) {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }

  return value;
}

function getPlayerGrade(totalPlays: number): PlayerGrade {
  if (totalPlays >= 50) {
    return { emoji: "👑", name: "마스터", description: "50판 이상 플레이" };
  }

  if (totalPlays >= 20) {
    return { emoji: "🏅", name: "숙련자", description: "20~49판 플레이" };
  }

  if (totalPlays >= 5) {
    return { emoji: "🎯", name: "플레이어", description: "5~19판 플레이" };
  }

  return { emoji: "🌱", name: "새싹", description: "0~4판 플레이" };
}

function formatShortDate(dateString: string) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`5점 만점에 ${rating}점`}>
      {Array.from({ length: 5 }).map((_, index) => (
        <span
          key={index}
          className={index < Math.round(rating) ? "text-amber-400" : "text-zinc-700"}
        >
          ★
        </span>
      ))}
    </div>
  );
}

export default function MyPage() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<ProfileForm>(initialForm);

  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const [playRecords, setPlayRecords] = useState<PlayRecord[]>([]);
  const [myReviews, setMyReviews] = useState<ReviewRow[]>([]);
  const [isStatsLoading, setIsStatsLoading] = useState(false);

  useEffect(() => {
    const supabase = createClient();

    async function loadMyPage() {
      setIsLoading(true);

      const {
        data: { user: currentUser },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("사용자 정보를 불러오지 못했습니다.", userError);
        setErrorMessage("회원 정보를 불러오지 못했습니다.");
        setIsLoading(false);
        return;
      }

      setUser(currentUser);

      if (!currentUser) {
        setIsLoading(false);
        return;
      }

      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select(
          "id, activity_name, birth_year, region, gender, created_at, updated_at",
        )
        .eq("id", currentUser.id)
        .maybeSingle();

      if (profileError) {
        console.error("활동 프로필을 불러오지 못했습니다.", profileError);
        setErrorMessage("활동 프로필을 불러오지 못했습니다.");
        setIsLoading(false);
        return;
      }

      const loadedProfile = profileData ? (profileData as Profile) : null;

      if (loadedProfile) {
        setProfile(loadedProfile);
        setForm({
          activityName: loadedProfile.activity_name ?? "",
          birthYear: loadedProfile.birth_year ?? "",
          region: loadedProfile.region ?? "",
          gender: loadedProfile.gender ?? "",
        });
        setIsEditing(false);
      } else {
        setProfile(null);
        setForm(initialForm);
        setIsEditing(true);
      }

      setIsStatsLoading(true);

      const reviewAuthorName =
        loadedProfile?.activity_name?.trim() || getKakaoNickname(currentUser);

      const [recordResponse, reviewResponse] = await Promise.all([
        supabase
          .from("play_records")
          .select(
            `
              id,
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
                  name
                )
              )
            `,
          )
          .eq("user_id", currentUser.id)
          .order("played_at", { ascending: false })
          .order("created_at", { ascending: false }),
        supabase
          .from("game_reviews")
          .select(
            `
              id,
              game_id,
              author_name,
              rating,
              content,
              created_at,
              games (
                id,
                name
              )
            `,
          )
          .eq("author_name", reviewAuthorName)
          .order("created_at", { ascending: false }),
      ]);

      if (recordResponse.error) {
        console.error("플레이 통계를 불러오지 못했습니다.", recordResponse.error);
      } else {
        setPlayRecords((recordResponse.data ?? []) as unknown as PlayRecord[]);
      }

      if (reviewResponse.error) {
        console.error("내 평가를 불러오지 못했습니다.", reviewResponse.error);
      } else {
        setMyReviews((reviewResponse.data ?? []) as unknown as ReviewRow[]);
      }

      setIsStatsLoading(false);
      setIsLoading(false);
    }

    loadMyPage();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) {
      setErrorMessage("로그인 정보가 없습니다.");
      return;
    }

    const activityName = form.activityName.trim();
    const birthYear = form.birthYear.trim();
    const region = form.region.trim();
    const gender = form.gender;

    if (!activityName) {
      setErrorMessage("활동명을 입력해주세요.");
      return;
    }

    if (!birthYear) {
      setErrorMessage("출생연도를 입력해주세요.");
      return;
    }

    if (!/^\d{2}$/.test(birthYear)) {
      setErrorMessage("출생연도는 89처럼 숫자 두 자리로 입력해주세요.");
      return;
    }

    if (!region) {
      setErrorMessage("활동 지역을 입력해주세요.");
      return;
    }

    if (!gender) {
      setErrorMessage("성별을 선택해주세요.");
      return;
    }

    setIsSaving(true);
    setMessage("");
    setErrorMessage("");

    const supabase = createClient();
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          activity_name: activityName,
          birth_year: birthYear,
          region,
          gender,
          updated_at: now,
        },
        {
          onConflict: "id",
        },
      )
      .select(
        "id, activity_name, birth_year, region, gender, created_at, updated_at",
      )
      .single();

    if (error) {
      console.error("프로필 저장 오류:", error);
      setErrorMessage("프로필을 저장하지 못했습니다. 다시 시도해주세요.");
      setIsSaving(false);
      return;
    }

    const savedProfile = data as Profile;

    setProfile(savedProfile);
    setForm({
      activityName: savedProfile.activity_name ?? "",
      birthYear: savedProfile.birth_year ?? "",
      region: savedProfile.region ?? "",
      gender: savedProfile.gender ?? "",
    });

    setMessage("활동 프로필이 저장되었습니다.");
    setIsEditing(false);
    setIsSaving(false);
  }

  function handleCancel() {
    if (!profile) {
      return;
    }

    setForm({
      activityName: profile.activity_name ?? "",
      birthYear: profile.birth_year ?? "",
      region: profile.region ?? "",
      gender: profile.gender ?? "",
    });

    setMessage("");
    setErrorMessage("");
    setIsEditing(false);
  }

  if (isLoading) {
    return (
      <main className="flex min-h-[calc(100vh-89px)] items-center justify-center bg-zinc-950 px-6 text-white">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-2 border-white/10 border-t-amber-400" />

          <p className="mt-5 text-sm text-zinc-500">
            회원 정보를 불러오고 있습니다.
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-[calc(100vh-89px)] items-center justify-center bg-zinc-950 px-6 py-20 text-white">
        <section className="w-full max-w-lg rounded-[2rem] border border-white/10 bg-white/[0.03] p-8 text-center sm:p-10">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-400/10 text-3xl">
            🔒
          </div>

          <p className="mt-7 text-sm font-semibold tracking-[0.3em] text-amber-400">
            MY PAGE
          </p>

          <h1 className="mt-3 text-3xl font-bold">로그인이 필요합니다</h1>

          <p className="mt-5 leading-7 text-zinc-500">
            활동 프로필과 내 활동을 확인하려면 먼저 로그인해주세요.
          </p>

          <Link
            href="/login"
            className="mt-8 inline-flex rounded-full bg-amber-400 px-7 py-3 font-semibold text-zinc-950 transition hover:bg-amber-300"
          >
            카카오로 로그인
          </Link>
        </section>
      </main>
    );
  }

  const kakaoNickname = getKakaoNickname(user);
  const avatarUrl = getAvatarUrl(user);
  const displayName = makeDisplayName(profile);

  const flattenedGames = playRecords.flatMap((record) =>
    (record.play_record_games ?? []).flatMap((recordGame) => {
      const game = getSingleGame(recordGame.games);
      if (!game) return [];

      return [
        {
          gameId: game.id,
          gameName: game.name,
          playCount: recordGame.play_count ?? 0,
        },
      ];
    }),
  );

  const totalPlayCount = flattenedGames.reduce(
    (sum, game) => sum + game.playCount,
    0,
  );
  const uniqueGameCount = new Set(flattenedGames.map((game) => game.gameId)).size;
  const averageRating =
    myReviews.length > 0
      ? myReviews.reduce((sum, review) => sum + review.rating, 0) /
        myReviews.length
      : 0;

  const ranking = new Map<string, GameRanking>();

  flattenedGames.forEach((game) => {
    const current = ranking.get(game.gameId);
    ranking.set(game.gameId, {
      gameId: game.gameId,
      gameName: game.gameName,
      playCount: (current?.playCount ?? 0) + game.playCount,
    });
  });

  const topGames = [...ranking.values()]
    .sort(
      (a, b) =>
        b.playCount - a.playCount ||
        a.gameName.localeCompare(b.gameName, "ko"),
    )
    .slice(0, 5);

  const recentPlays: RecentPlay[] = playRecords.slice(0, 5).map((record) => ({
    id: record.id,
    playedAt: record.played_at,
    eventName:
      record.location?.trim() || record.title?.trim() || "개인 플레이",
    games: (record.play_record_games ?? []).flatMap((recordGame) => {
      const game = getSingleGame(recordGame.games);
      return game
        ? [{ name: game.name, playCount: recordGame.play_count ?? 0 }]
        : [];
    }),
  }));

  const grade = getPlayerGrade(totalPlayCount);

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="border-b border-white/10">
        <div className="mx-auto max-w-7xl px-6 py-14 sm:py-16">
          <p className="text-sm font-semibold tracking-[0.3em] text-amber-400">
            MY PAGE
          </p>

          <div className="mt-7 flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt="카카오 프로필 이미지"
                  width={112}
                  height={112}
                  className="h-24 w-24 rounded-full border border-white/10 object-cover sm:h-28 sm:w-28"
                  unoptimized
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-full border border-amber-400/20 bg-amber-400/10 text-4xl font-bold text-amber-300 sm:h-28 sm:w-28">
                  {(profile?.activity_name ?? kakaoNickname).slice(0, 1)}
                </div>
              )}

              <div>
                <p className="text-sm text-zinc-500">보드라운지 활동 프로필</p>

                <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-5xl">
                  {displayName ?? "활동 프로필을 등록해주세요"}
                </h1>

                <p className="mt-4 max-w-2xl leading-7 text-zinc-400">
                  이 활동명은 앞으로 리뷰와 댓글 등 보드라운지 활동에
                  사용됩니다.
                </p>
              </div>
            </div>

            {profile && !isEditing && (
              <button
                type="button"
                onClick={() => {
                  setMessage("");
                  setErrorMessage("");
                  setIsEditing(true);
                }}
                className="w-fit rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-semibold text-zinc-300 transition hover:border-amber-400/40 hover:text-amber-300"
              >
                프로필 수정
              </button>
            )}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-12 sm:py-14">
        <div className="grid gap-6 lg:grid-cols-[1.15fr_1.85fr]">
          <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <p className="text-sm font-semibold tracking-[0.2em] text-amber-400">
              ACCOUNT
            </p>

            <h2 className="mt-2 text-2xl font-bold">계정 정보</h2>

            <dl className="mt-8 space-y-6">
              <div>
                <dt className="text-sm text-zinc-500">카카오 계정 이름</dt>
                <dd className="mt-2 font-semibold text-zinc-200">
                  {kakaoNickname}
                </dd>
              </div>

              <div className="border-t border-white/10 pt-6">
                <dt className="text-sm text-zinc-500">이메일</dt>
                <dd className="mt-2 break-all font-medium text-zinc-300">
                  {user.email ?? "이메일 정보 없음"}
                </dd>
              </div>

              <div className="border-t border-white/10 pt-6">
                <dt className="text-sm text-zinc-500">가입일</dt>
                <dd className="mt-2 font-medium text-zinc-300">
                  {formatDate(user.created_at)}
                </dd>
              </div>
            </dl>

            <p className="mt-8 rounded-2xl bg-white/[0.03] p-4 text-sm leading-6 text-zinc-500">
              카카오 계정 정보는 로그인 확인에 사용되며, 다른 회원에게 보여줄
              사이트 표시 프로필과는 별도로 관리됩니다.
            </p>
          </article>

          <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
            <p className="text-sm font-semibold tracking-[0.2em] text-amber-400">
              COMMUNITY PROFILE
            </p>

            <h2 className="mt-2 text-2xl font-bold">
              {isEditing ? "활동 프로필 입력" : "내 활동 프로필"}
            </h2>

            {isEditing ? (
              <form onSubmit={handleSubmit} className="mt-8 space-y-6">
                <div>
                  <label
                    htmlFor="activityName"
                    className="block text-sm font-semibold text-zinc-300"
                  >
                    이름
                  </label>

                  <p className="mt-1 text-sm text-zinc-600">
                    홈페이지에서 사용할 본인 이름을 작성해주세요.
                  </p>

                  <input
                    id="activityName"
                    type="text"
                    value={form.activityName}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        activityName: event.target.value,
                      }))
                    }
                    maxLength={20}
                    placeholder="예: 이우영"
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-white outline-none transition placeholder:text-zinc-700 focus:border-amber-400/60"
                  />
                </div>

                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="birthYear"
                      className="block text-sm font-semibold text-zinc-300"
                    >
                      출생연도
                    </label>

                    <p className="mt-1 text-sm text-zinc-600">
                      연도 뒤 두 자리만 입력합니다.
                    </p>

                    <input
                      id="birthYear"
                      type="text"
                      inputMode="numeric"
                      value={form.birthYear}
                      onChange={(event) => {
                        const numbersOnly = event.target.value
                          .replace(/\D/g, "")
                          .slice(0, 2);

                        setForm((previous) => ({
                          ...previous,
                          birthYear: numbersOnly,
                        }));
                      }}
                      maxLength={2}
                      placeholder="예: 01"
                      className="mt-3 w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-white outline-none transition placeholder:text-zinc-700 focus:border-amber-400/60"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="region"
                      className="block text-sm font-semibold text-zinc-300"
                    >
                      활동 지역
                    </label>

                    <p className="mt-1 text-sm text-zinc-600">
                      구 또는 역을 입력합니다.
                    </p>

                    <input
                      id="region"
                      type="text"
                      value={form.region}
                      onChange={(event) =>
                        setForm((previous) => ({
                          ...previous,
                          region: event.target.value,
                        }))
                      }
                      maxLength={20}
                      placeholder="예: 강남"
                      className="mt-3 w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-white outline-none transition placeholder:text-zinc-700 focus:border-amber-400/60"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="gender"
                    className="block text-sm font-semibold text-zinc-300"
                  >
                    성별
                  </label>

                  <select
                    id="gender"
                    value={form.gender}
                    onChange={(event) =>
                      setForm((previous) => ({
                        ...previous,
                        gender: event.target.value,
                      }))
                    }
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-zinc-900 px-4 py-3 text-white outline-none transition focus:border-amber-400/60"
                  >
                    <option value="">선택해주세요</option>
                    <option value="남">남</option>
                    <option value="여">여</option>
                  </select>
                </div>

                <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.05] p-5">
                  <p className="text-sm text-zinc-500">표시 예시</p>

                  <p className="mt-2 text-lg font-bold text-amber-300">
                    {[
                      form.activityName.trim() || "이우영",
                      form.birthYear || "89",
                      form.region.trim() || "광진",
                      form.gender || "남",
                    ].join(" / ")}
                  </p>
                </div>

                {errorMessage && (
                  <p className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-sm text-red-300">
                    {errorMessage}
                  </p>
                )}

                <div className="flex flex-wrap gap-3">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="rounded-full bg-amber-400 px-7 py-3 font-semibold text-zinc-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSaving ? "저장 중..." : "프로필 저장"}
                  </button>

                  {profile && (
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={isSaving}
                      className="rounded-full border border-white/10 px-7 py-3 font-semibold text-zinc-400 transition hover:border-white/30 hover:text-white disabled:opacity-50"
                    >
                      취소
                    </button>
                  )}
                </div>
              </form>
            ) : (
              <div className="mt-8">
                <div className="rounded-3xl border border-amber-400/20 bg-amber-400/[0.05] p-6">
                  <p className="text-sm text-zinc-500">사이트 표시 이름</p>

                  <p className="mt-3 text-2xl font-bold text-amber-300">
                    {displayName}
                  </p>
                </div>

                <dl className="mt-8 grid gap-5 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 p-5">
                    <dt className="text-sm text-zinc-500">이름</dt>
                    <dd className="mt-2 font-semibold text-zinc-200">
                      {profile?.activity_name}
                    </dd>
                  </div>

                  <div className="rounded-2xl border border-white/10 p-5">
                    <dt className="text-sm text-zinc-500">출생연도</dt>
                    <dd className="mt-2 font-semibold text-zinc-200">
                      {profile?.birth_year}
                    </dd>
                  </div>

                  <div className="rounded-2xl border border-white/10 p-5">
                    <dt className="text-sm text-zinc-500">활동 지역</dt>
                    <dd className="mt-2 font-semibold text-zinc-200">
                      {profile?.region}
                    </dd>
                  </div>

                  <div className="rounded-2xl border border-white/10 p-5">
                    <dt className="text-sm text-zinc-500">성별</dt>
                    <dd className="mt-2 font-semibold text-zinc-200">
                      {profile?.gender}
                    </dd>
                  </div>
                </dl>
              </div>
            )}

            {message && (
              <p className="mt-6 rounded-2xl border border-green-400/20 bg-green-400/10 px-4 py-3 text-sm text-green-300">
                {message}
              </p>
            )}
          </article>
        </div>

        <EventPlayHistory />
        <MurderMysteryHistory />
        <Achievements userId={user.id} />

        <section className="mt-8 rounded-3xl border border-amber-400/20 bg-amber-400/[0.04] p-6 sm:p-8">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold tracking-[0.2em] text-amber-400">
                PLAYER LEVEL
              </p>
              <div className="mt-3 flex items-center gap-4">
                <span className="text-5xl">{grade.emoji}</span>
                <div>
                  <h2 className="text-3xl font-bold">{grade.name}</h2>
                  <p className="mt-1 text-sm text-zinc-500">{grade.description}</p>
                </div>
              </div>
            </div>

            <p className="max-w-xl text-sm leading-7 text-zinc-500">
              플레이 판수에 따라 등급이 자동으로 올라갑니다. 5판부터 플레이어,
              20판부터 숙련자, 50판부터 마스터 등급이 적용됩니다.
            </p>
          </div>
        </section>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-5">
          {[
            ["총 이벤트", `${playRecords.length}회`, "📅"],
            ["플레이한 게임", `${uniqueGameCount}종`, "🎲"],
            ["총 플레이 판수", `${totalPlayCount}판`, "🏁"],
            ["평균 별점", myReviews.length ? averageRating.toFixed(1) : "-", "⭐"],
            ["작성한 평가", `${myReviews.length}개`, "📝"],
          ].map(([label, count, icon]) => (
            <article
              key={label}
              className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"
            >
              <div className="flex items-center justify-between">
                <p className="text-sm text-zinc-500">{label}</p>
                <span className="text-xl">{icon}</span>
              </div>
              <p className="mt-4 text-3xl font-bold text-amber-400">{count}</p>
            </article>
          ))}
        </div>

        {isStatsLoading ? (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.02] p-12 text-center text-sm text-zinc-500">
            플레이 통계를 불러오는 중입니다.
          </div>
        ) : (
          <div className="mt-8 grid gap-6 xl:grid-cols-3">
            <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
              <p className="text-sm font-semibold tracking-[0.2em] text-amber-400">
                TOP GAMES
              </p>
              <h2 className="mt-2 text-2xl font-bold">많이 플레이한 게임</h2>

              {topGames.length > 0 ? (
                <ol className="mt-7 space-y-3">
                  {topGames.map((game, index) => (
                    <li
                      key={game.gameId}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 px-4 py-4"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-400/10 text-sm font-bold text-amber-300">
                          {index + 1}
                        </span>
                        <Link
                          href={`/boardgames/${game.gameId}`}
                          className="truncate font-semibold text-zinc-200 transition hover:text-amber-300"
                        >
                          {game.gameName}
                        </Link>
                      </div>
                      <strong className="shrink-0 text-amber-300">
                        {game.playCount}판
                      </strong>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-8 text-sm text-zinc-600">
                  아직 플레이 기록이 없습니다.
                </p>
              )}
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
              <p className="text-sm font-semibold tracking-[0.2em] text-amber-400">
                RECENT PLAYS
              </p>
              <h2 className="mt-2 text-2xl font-bold">최근 플레이</h2>

              {recentPlays.length > 0 ? (
                <div className="mt-7 space-y-4">
                  {recentPlays.map((record) => (
                    <article
                      key={record.id}
                      className="rounded-2xl border border-white/10 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-semibold text-zinc-200">
                          {record.eventName}
                        </p>
                        <time className="shrink-0 text-xs text-zinc-600">
                          {formatShortDate(record.playedAt)}
                        </time>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {record.games.map((game) => (
                          <span
                            key={`${record.id}-${game.name}`}
                            className="rounded-full bg-white/5 px-3 py-1.5 text-xs text-zinc-400"
                          >
                            {game.name} · {game.playCount}판
                          </span>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="mt-8 text-sm text-zinc-600">
                  아직 플레이 기록이 없습니다.
                </p>
              )}
            </section>

            <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
              <p className="text-sm font-semibold tracking-[0.2em] text-amber-400">
                RECENT REVIEWS
              </p>
              <h2 className="mt-2 text-2xl font-bold">최근 평가</h2>

              {myReviews.length > 0 ? (
                <div className="mt-7 divide-y divide-white/10">
                  {myReviews.slice(0, 5).map((review) => {
                    const game = getSingleGame(review.games);

                    return (
                      <article key={review.id} className="py-4 first:pt-0">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold text-zinc-200">
                              {game?.name ?? "등록 게임"}
                            </p>
                            <div className="mt-2">
                              <RatingStars rating={review.rating} />
                            </div>
                          </div>
                          <time className="shrink-0 text-xs text-zinc-600">
                            {formatShortDate(review.created_at)}
                          </time>
                        </div>
                        <p className="mt-3 line-clamp-2 text-sm leading-6 text-zinc-500">
                          {review.content?.trim() || "한줄평이 없습니다."}
                        </p>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-8 text-sm text-zinc-600">
                  아직 작성한 평가가 없습니다.
                </p>
              )}
            </section>
          </div>
        )}
      </section>
    </main>
  );
}
