"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function NotificationBell({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let failures = 0;
    let nextRefresh = 0;
    let timer: number | undefined;
    let controller: AbortController | undefined;

    async function refresh() {
      if (!active || document.hidden || inFlight || Date.now() < nextRefresh) return;
      inFlight = true;
      controller = new AbortController();
      const deadline = window.setTimeout(() => controller?.abort(), 8_000);
      try {
        const { count: unread, error } = await supabase
          .from("notifications")
          .select("id", { count: "exact", head: true })
          .eq("recipient_id", userId)
          .eq("is_read", false)
          .abortSignal(controller.signal);
        if (!active) return;
        if (error) {
          failures += 1;
        } else {
          failures = 0;
          setCount(unread ?? 0);
        }
      } catch {
        failures += 1;
      } finally {
        window.clearTimeout(deadline);
        inFlight = false;
        if (active) {
          const delay = Math.min(30_000 * 2 ** Math.min(failures, 3), 240_000);
          nextRefresh = Date.now() + delay;
          window.clearTimeout(timer);
          timer = window.setTimeout(() => void refresh(), delay);
        }
      }
    }

    const onVisible = () => void refresh();
    void refresh();
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      active = false;
      controller?.abort();
      window.clearTimeout(timer);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [supabase, userId]);

  return (
    <Link
      href="/notifications"
      className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg transition hover:border-amber-400/40 hover:bg-white/10"
      aria-label={`알림${count > 0 ? ` ${count}개` : ""}`}
      title="알림"
    >
      🔔
      {count > 0 && (
        <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-black text-white shadow-[0_0_0_2px_#09090b]">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
