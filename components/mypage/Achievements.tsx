"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Achievement = {
  badge_code: string;
  badge_title: string;
  badge_description: string;
  current_value: number;
  target_value: number;
  earned: boolean;
  earned_at: string | null;
};

const BADGE_ICONS: Record<string, string> = {
  FIRST_PLAY: "🎲",
  PLAY_5: "🌱",
  PLAY_20: "🔥",
  PLAY_50: "🏆",
  GAME_5: "🧭",
  GAME_10: "🗃️",
  FIRST_WIN: "👑",
  ROLE_WIN: "🎭",
  GAME_EXPERT: "⭐",
  EVENT_5: "📅",
};

export default function Achievements({
  userId,
  publicView = false,
}: {
  userId: string;
  publicView?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Achievement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");
      const { data, error: loadError } = await supabase.rpc(
        "get_member_achievements",
        {
          p_member_id: userId,
          p_include_progress: !publicView,
        },
      );

      if (!active) return;

      if (loadError) {
        console.error("업적 조회 오류:", loadError);
        setError("업적을 불러오지 못했습니다.");
        setItems([]);
      } else {
        setItems(
          ((data ?? []) as Achievement[]).map((item) => ({
            ...item,
            current_value: Number(item.current_value ?? 0),
            target_value: Number(item.target_value ?? 1),
          })),
        );
      }
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [publicView, supabase, userId]);

  const earnedCount = items.filter((item) => item.earned).length;

  return (
    <section className="mt-8 rounded-3xl border border-amber-400/20 bg-amber-400/[0.035] p-6 sm:p-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold tracking-[0.2em] text-amber-400">
            ACHIEVEMENTS
          </p>
          <h2 className="mt-2 text-2xl font-bold">업적 배지</h2>
          <p className="mt-2 text-sm text-zinc-500">
            {publicView
              ? "플레이 기록으로 획득한 배지입니다."
              : "이벤트 결과가 쌓이면 자동으로 획득합니다."}
          </p>
        </div>
        {!loading && !error && (
          <span className="shrink-0 rounded-full bg-amber-400/10 px-3 py-1.5 text-sm font-semibold text-amber-300">
            {earnedCount}개 획득
          </span>
        )}
      </div>

      {loading ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-32 animate-pulse rounded-2xl bg-white/[0.04]" />
          ))}
        </div>
      ) : error ? (
        <p className="mt-6 rounded-2xl border border-red-400/20 bg-red-400/[0.05] p-4 text-sm text-red-300">
          {error}
        </p>
      ) : items.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-white/10 p-8 text-center text-sm text-zinc-600">
          아직 획득한 배지가 없습니다.
        </p>
      ) : (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const progress = Math.min(
              100,
              Math.round((item.current_value / Math.max(item.target_value, 1)) * 100),
            );

            return (
              <article
                key={item.badge_code}
                className={`rounded-2xl border p-4 ${
                  item.earned
                    ? "border-amber-400/30 bg-amber-400/[0.07]"
                    : "border-white/10 bg-black/10 opacity-70"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-2xl ${
                      item.earned ? "bg-amber-400/15" : "bg-white/[0.04] grayscale"
                    }`}
                  >
                    {BADGE_ICONS[item.badge_code] ?? "🏅"}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-zinc-100">{item.badge_title}</h3>
                      {item.earned && (
                        <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold text-zinc-950">
                          획득
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">
                      {item.badge_description}
                    </p>
                  </div>
                </div>

                {!publicView && !item.earned && (
                  <div className="mt-4">
                    <div className="flex justify-between text-[11px] text-zinc-500">
                      <span>진행도</span>
                      <span>
                        {Math.min(item.current_value, item.target_value)} / {item.target_value}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                      <div
                        className="h-full rounded-full bg-amber-400 transition-all"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
