"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function NotificationBell({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [count, setCount] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadCount() {
      const { count: unread, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .eq("is_read", false);

      if (!active) return;
      if (error) {
        console.error("알림 개수 조회 오류:", error);
        return;
      }
      setCount(unread ?? 0);
    }

    void loadCount();

    const refresh = () => void loadCount();
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);

    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
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
