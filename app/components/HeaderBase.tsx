"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import NotificationBell from "@/components/notifications/NotificationBell";

const menuItems = [
  { name: "공지사항", href: "/notice" },
  { name: "보드게임", href: "/boardgames" },
  { name: "머더미스터리", href: "/murder-mystery" },
  { name: "게임 평가", href: "/reviews" },
  { name: "이벤트 일정", href: "/events" },
  { name: "게임 랭킹", href: "/rankings" },
  { name: "마이페이지", href: "/mypage" },
];

type Profile = {
  activity_name: string | null;
  birth_year: string | null;
  region: string | null;
  gender: string | null;
};

type SiteRole = "MAIN_ADMIN" | "ADMIN" | "RULE_MASTER" | "MEMBER";

type PlayRecordRow = {
  play_record_games:
    | {
        play_count: number | null;
      }[]
    | null;
};

type PlayerLevel = {
  emoji: string;
  name: string;
  description: string;
};

function makeDisplayName(profile: Profile | null) {
  if (!profile?.activity_name) {
    return null;
  }

  return [
    profile.activity_name,
    profile.birth_year,
    profile.region,
    profile.gender,
  ]
    .filter(Boolean)
    .join(" / ");
}

function getKakaoNickname(user: User | null) {
  return (
    user?.user_metadata?.name ??
    user?.user_metadata?.full_name ??
    user?.user_metadata?.user_name ??
    user?.user_metadata?.preferred_username ??
    user?.user_metadata?.nickname ??
    "회원"
  );
}

function getAvatarUrl(user: User | null) {
  return (
    user?.user_metadata?.avatar_url ??
    user?.user_metadata?.picture ??
    user?.user_metadata?.profile_image_url ??
    null
  );
}

function getPlayerLevel(totalPlayCount: number): PlayerLevel {
  if (totalPlayCount >= 50) {
    return {
      emoji: "👑",
      name: "마스터",
      description: "50판 이상",
    };
  }

  if (totalPlayCount >= 20) {
    return {
      emoji: "🏅",
      name: "숙련자",
      description: "20~49판",
    };
  }

  if (totalPlayCount >= 5) {
    return {
      emoji: "🎯",
      name: "플레이어",
      description: "5~19판",
    };
  }

  return {
    emoji: "🌱",
    name: "새싹",
    description: "0~4판",
  };
}

export default function Header() {
  const supabase = useMemo(() => createClient(), []);

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [totalPlayCount, setTotalPlayCount] = useState(0);
  const [hasConfirmedAttendance, setHasConfirmedAttendance] = useState(false);
  const [siteRole, setSiteRole] = useState<SiteRole>("MEMBER");
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isLogoutLoading, setIsLogoutLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadMemberData(userId: string) {
      const [profileResponse, playResponse, roleResponse, attendanceResponse] = await Promise.all([
        supabase
          .from("profiles")
          .select("activity_name, birth_year, region, gender")
          .eq("id", userId)
          .maybeSingle(),
        supabase
          .from("play_records")
          .select(
            `
              play_record_games (
                play_count
              )
            `,
          )
          .eq("user_id", userId),
        supabase.rpc("current_site_role"),
        supabase.rpc("has_confirmed_event_attendance"),
      ]);

      if (!isMounted) return;

      if (profileResponse.error) {
        console.error("Profile Error:", profileResponse.error);
        console.log("Profile Response:", profileResponse);
        
        setProfile(null);
      } else {
        setProfile(profileResponse.data as Profile | null);
      }

      if (playResponse.error) {
        console.error("Header 플레이 기록 조회 오류:", playResponse.error);
        setTotalPlayCount(0);
      } else {
        const records = (playResponse.data ?? []) as PlayRecordRow[];
        const total = records.reduce(
          (recordSum, record) =>
            recordSum +
            (record.play_record_games ?? []).reduce(
              (gameSum, game) => gameSum + (game.play_count ?? 0),
              0,
            ),
          0,
        );

        setTotalPlayCount(total);
      }

      if (roleResponse.error) {
        console.error("Header 직위 조회 오류:", roleResponse.error);
        setSiteRole("MEMBER");
      } else {
        setSiteRole((roleResponse.data as SiteRole | null) ?? "MEMBER");
      }

      if (attendanceResponse.error) {
        console.error("Header 출석 이력 조회 오류:", attendanceResponse.error);
        setHasConfirmedAttendance(false);
      } else {
        setHasConfirmedAttendance(Boolean(attendanceResponse.data));
      }
    }

    async function loadUser() {
      const {
        data: { user: currentUser },
        error,
      } = await supabase.auth.getUser();

      if (!isMounted) return;

      if (error) {
        console.error("Header 사용자 조회 오류:", error);
      }

      setUser(currentUser);

      if (currentUser) {
        await loadMemberData(currentUser.id);
      } else {
        setProfile(null);
        setTotalPlayCount(0);
        setHasConfirmedAttendance(false);
        setSiteRole("MEMBER");
      }

      if (isMounted) {
        setIsAuthLoading(false);
      }
    }

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;

      setUser(currentUser);

      if (currentUser) {
        void loadMemberData(currentUser.id);
      } else {
        setProfile(null);
        setTotalPlayCount(0);
        setHasConfirmedAttendance(false);
        setSiteRole("MEMBER");
      }

      setIsAuthLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  async function handleLogout() {
    setIsLogoutLoading(true);

    const { error } = await supabase.auth.signOut();

    if (error) {
      alert(`로그아웃에 실패했습니다: ${error.message}`);
      setIsLogoutLoading(false);
      return;
    }

    setUser(null);
    setProfile(null);
    setTotalPlayCount(0);
    setHasConfirmedAttendance(false);
    setSiteRole("MEMBER");
    setIsLogoutLoading(false);
    window.location.href = "/";
  }

  const kakaoNickname = getKakaoNickname(user);
  const displayName = makeDisplayName(profile) ?? kakaoNickname;
  const avatarUrl = getAvatarUrl(user);
  const playerLevel = getPlayerLevel(totalPlayCount);

  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-zinc-950/90 text-white backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-5">
        <Link href="/" className="shrink-0">
          <p className="text-xs tracking-[0.35em] text-amber-400">WAWEDO</p>
          <p className="mt-1 text-2xl font-bold">보드라운지</p>
        </Link>

        <nav className="hidden items-center gap-6 lg:flex">
          {menuItems.map((menu) => (
            <Link
              key={menu.href}
              href={menu.href}
              className="whitespace-nowrap text-sm text-zinc-300 transition hover:text-amber-400"
            >
              {menu.name}
            </Link>
          ))}
        </nav>

        <div className="flex min-w-[120px] shrink-0 justify-end">
          {isAuthLoading ? (
            <div className="h-10 w-32 animate-pulse rounded-full bg-white/10" />
          ) : user ? (
            <div className="flex items-center gap-2 sm:gap-3">
              {siteRole === "MAIN_ADMIN" && (
                <Link
                  href="/admin"
                  className="flex h-10 items-center justify-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-3 text-sm font-semibold text-amber-300 transition hover:border-amber-300 hover:bg-amber-400 hover:text-zinc-950"
                  title="관리자 페이지"
                  aria-label="관리자 페이지"
                >
                  <span aria-hidden="true">⚙</span>
                  <span className="hidden xl:inline">관리자</span>
                </Link>
              )}
              <NotificationBell userId={user.id} />
              <Link
                href="/mypage"
                className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1.5 pl-1.5 pr-3 transition hover:border-amber-400/40 hover:bg-white/10"
                title={hasConfirmedAttendance ? `${playerLevel.name} · ${totalPlayCount}판` : "신규 회원 · 첫 출석 전"}
              >
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={`${displayName} 프로필 이미지`}
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full object-cover"
                    unoptimized
                  />
                ) : (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-zinc-950">
                    {displayName.slice(0, 1)}
                  </div>
                )}

                {hasConfirmedAttendance ? (
                  <span className="text-base" aria-label={`${playerLevel.name} 등급`}>
                    {playerLevel.emoji}
                  </span>
                ) : (
                  <span className="text-[10px] font-black tracking-[0.08em] text-red-400" aria-label="첫 출석 전 신규 회원">
                    NEW
                  </span>
                )}

                <span
                  className="max-w-48 truncate text-sm font-medium text-zinc-200"
                  title={displayName}
                >
                  {displayName}
                </span>
              </Link>

              <button
                type="button"
                onClick={handleLogout}
                disabled={isLogoutLoading}
                className="whitespace-nowrap text-sm text-zinc-500 transition hover:text-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isLogoutLoading ? "처리 중..." : "로그아웃"}
              </button>
            </div>
          ) : (
            <Link
              href="/login"
              className="whitespace-nowrap rounded-full border border-amber-400/60 px-5 py-2 text-sm text-amber-300 transition hover:bg-amber-400 hover:text-zinc-950"
            >
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
