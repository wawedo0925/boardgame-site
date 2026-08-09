"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type NotificationRow = {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  is_read: boolean;
  created_at: string;
};

const ICONS: Record<string, string> = {
  EVENT_JOINED: "🙋",
  EVENT_LEFT: "↩️",
  GROUP_ASSIGNED: "👥",
  ROUND_RESULT: "🎲",
  ACHIEVEMENT: "🏅",
  EVENT_NOTICE: "📢",
  ATTENDANCE: "✅",
};

function timeLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export default function NotificationsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadNotifications(userId: string) {
    const { data, error: loadError } = await supabase
      .from("notifications")
      .select("id, type, title, message, link, is_read, created_at")
      .eq("recipient_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (loadError) throw loadError;
    setItems((data ?? []) as NotificationRow[]);
  }

  useEffect(() => {
    let active = true;
    let currentUserId: string | null = null;

    const refresh = () => {
      if (currentUserId) void loadNotifications(currentUserId);
    };

    async function load() {
      try {
        setLoading(true);
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!active) return;
        setUser(authData.user);

        if (authData.user) {
          currentUserId = authData.user.id;
          await loadNotifications(authData.user.id);
        }
      } catch (loadError) {
        console.error("알림 목록 조회 오류:", loadError);
        if (active) setError("알림을 불러오지 못했습니다.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.removeEventListener("focus", refresh);
    };
  }, [supabase]);

  async function markRead(item: NotificationRow) {
    if (!item.is_read) {
      const { error: updateError } = await supabase
        .from("notifications")
        .update({ is_read: true, updated_at: new Date().toISOString() })
        .eq("id", item.id);
      if (!updateError) {
        setItems((current) =>
          current.map((row) => (row.id === item.id ? { ...row, is_read: true } : row)),
        );
      }
    }
  }

  async function markAllRead() {
    if (!user) return;
    const { error: updateError } = await supabase
      .from("notifications")
      .update({ is_read: true, updated_at: new Date().toISOString() })
      .eq("recipient_id", user.id)
      .eq("is_read", false);
    if (updateError) {
      alert("전체 읽음 처리에 실패했습니다.");
      return;
    }
    setItems((current) => current.map((item) => ({ ...item, is_read: true })));
  }

  const unreadCount = items.filter((item) => !item.is_read).length;

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="mx-auto max-w-3xl px-5 py-10 sm:px-6 sm:py-14">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold tracking-[0.25em] text-amber-400">
              NOTIFICATIONS
            </p>
            <h1 className="mt-2 text-3xl font-bold sm:text-4xl">알림</h1>
            <p className="mt-3 text-sm text-zinc-500">
              나와 관련된 이벤트 활동만 모아서 보여줍니다.
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllRead}
              className="shrink-0 rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-300 transition hover:border-amber-400/40 hover:text-amber-300"
            >
              전체 읽음
            </button>
          )}
        </div>

        {loading ? (
          <div className="mt-8 space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-2xl bg-white/[0.04]" />
            ))}
          </div>
        ) : !user ? (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.03] p-10 text-center">
            <p className="text-zinc-400">알림을 확인하려면 로그인이 필요합니다.</p>
            <Link href="/login" className="mt-5 inline-flex rounded-full bg-amber-400 px-6 py-3 font-semibold text-zinc-950">
              로그인
            </Link>
          </div>
        ) : error ? (
          <p className="mt-8 rounded-2xl border border-red-400/20 bg-red-400/[0.05] p-5 text-red-300">{error}</p>
        ) : items.length === 0 ? (
          <div className="mt-8 rounded-3xl border border-dashed border-white/10 p-14 text-center">
            <div className="text-4xl">🔔</div>
            <p className="mt-4 font-semibold text-zinc-300">아직 받은 알림이 없습니다.</p>
            <p className="mt-2 text-sm text-zinc-600">새로운 이벤트 활동이 생기면 이곳에 표시됩니다.</p>
          </div>
        ) : (
          <div className="mt-8 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.025]">
            {items.map((item) => {
              const body = (
                <div className="flex gap-4 p-5 sm:p-6">
                  <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-xl ${item.is_read ? "bg-white/[0.04] grayscale" : "bg-amber-400/15"}`}>
                    {ICONS[item.type] ?? "🔔"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className={`font-bold ${item.is_read ? "text-zinc-400" : "text-white"}`}>{item.title}</h2>
                      <time className="shrink-0 text-xs text-zinc-600">{timeLabel(item.created_at)}</time>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-zinc-500">{item.message}</p>
                  </div>
                  {!item.is_read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-amber-400" />}
                </div>
              );

              return item.link ? (
                <Link
                  key={item.id}
                  href={item.link}
                  onClick={() => void markRead(item)}
                  className="block border-b border-white/[0.06] transition last:border-0 hover:bg-white/[0.03]"
                >
                  {body}
                </Link>
              ) : (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void markRead(item)}
                  className="block w-full border-b border-white/[0.06] text-left transition last:border-0 hover:bg-white/[0.03]"
                >
                  {body}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
