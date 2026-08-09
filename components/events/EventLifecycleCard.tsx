"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = {
  eventId: string;
  isClosed: boolean;
  canManage: boolean;
  closedAt?: string | null;
  onChanged: (isClosed: boolean, closedAt: string | null) => void;
};

export default function EventLifecycleCard({ eventId, isClosed, canManage, closedAt, onChanged }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);

  async function changeStatus(nextClosed: boolean) {
    const message = nextClosed
      ? "이벤트를 마감할까요? 마감 후에는 조 편성, 판 추가와 결과 수정이 잠깁니다."
      : "이벤트를 다시 열까요? 관리 기능을 다시 사용할 수 있습니다.";
    if (!window.confirm(message)) return;

    try {
      setBusy(true);
      const nextClosedAt = nextClosed ? new Date().toISOString() : null;
      const { error } = await supabase
        .from("events")
        .update({ event_status: nextClosed ? "CLOSED" : "OPEN", closed_at: nextClosedAt })
        .eq("id", eventId);
      if (error) throw error;
      onChanged(nextClosed, nextClosedAt);
      alert(nextClosed ? "이벤트가 마감되었습니다." : "이벤트를 다시 열었습니다.");
    } catch (error) {
      console.error("이벤트 상태 변경 오류:", error);
      alert(error instanceof Error ? error.message : "이벤트 상태를 변경하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`rounded-3xl border p-5 sm:p-7 ${isClosed ? "border-emerald-400/30 bg-emerald-400/[0.06]" : "border-white/10 bg-white/[0.03]"}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className={`text-sm font-semibold ${isClosed ? "text-emerald-300" : "text-amber-300"}`}>EVENT STATUS</p>
          <h2 className="mt-1 text-2xl font-bold">{isClosed ? "이벤트 마감 완료" : "이벤트 진행 중"}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            {isClosed
              ? `최종 기록이 확정되었습니다.${closedAt ? ` · ${new Date(closedAt).toLocaleString("ko-KR")}` : ""}`
              : "조 편성, 게임 판 추가와 결과 입력을 진행할 수 있습니다."}
          </p>
        </div>
        {canManage && (
          <button
            type="button"
            disabled={busy}
            onClick={() => changeStatus(!isClosed)}
            className={`h-12 shrink-0 rounded-xl px-5 font-bold disabled:opacity-50 ${isClosed ? "border border-white/15 text-zinc-200" : "bg-amber-400 text-zinc-950"}`}
          >
            {busy ? "처리 중..." : isClosed ? "이벤트 다시 열기" : "이벤트 마감"}
          </button>
        )}
      </div>
      {isClosed && (
        <p className="mt-4 rounded-xl bg-black/20 px-4 py-3 text-sm text-emerald-200">
          마감된 이벤트는 기록을 볼 수만 있습니다. 수정하려면 생성자가 이벤트를 다시 열어야 합니다.
        </p>
      )}
    </section>
  );
}
