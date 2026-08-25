"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { createClient } from "@/lib/supabase/client";

type Props = {
  eventId: string;
  eventTitle: string;
  isCancelled: boolean;
  canCancel: boolean;
  canDelete: boolean;
  onChanged: (cancelled: boolean) => void;
};

export default function EventCancellationCard({
  eventId,
  eventTitle,
  isCancelled,
  canCancel,
  canDelete,
  onChanged,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  if (!canCancel && !canDelete) return null;

  async function cancelEvent() {
    if (isCancelled) return;
    const message = "이 이벤트를 취소할까요? 참가자와 대기자에게 알림을 보낸 뒤 참가·대기·조 편성·플레이 기록을 삭제합니다. 이 작업은 되돌릴 수 없습니다.";
    if (!window.confirm(message)) return;

    setBusy(true);
    const { error } = await supabase.rpc("set_event_cancelled", {
      p_event_id: eventId,
      p_cancelled: true,
    });
    setBusy(false);

    if (error) {
      alert(`처리에 실패했습니다: ${error.message}`);
      return;
    }

    onChanged(true);
    setOpen(false);
  }

  async function hardDelete() {
    const typed = window.prompt(
      `이벤트와 연결된 참가자, 조, 판, 결과 기록이 모두 영구 삭제됩니다.\n계속하려면 이벤트 제목을 정확히 입력하세요.\n\n${eventTitle}`,
    );
    if (typed !== eventTitle) {
      if (typed !== null) alert("이벤트 제목이 일치하지 않아 삭제하지 않았습니다.");
      return;
    }
    if (!window.confirm("정말 영구 삭제할까요? 이 작업은 되돌릴 수 없습니다.")) return;

    setBusy(true);
    const { error } = await supabase.rpc("hard_delete_event", { p_event_id: eventId });
    setBusy(false);
    if (error) {
      alert(`영구 삭제에 실패했습니다: ${error.message}`);
      return;
    }

    alert("이벤트가 영구 삭제되었습니다.");
    router.replace("/events");
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="inline-flex items-center rounded-2xl border border-red-400/30 bg-red-400/5 px-5 py-3 text-sm font-semibold text-red-300 transition hover:bg-red-400/10"
      >
        이벤트 관리
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-red-400/25 bg-zinc-950 p-4 shadow-2xl shadow-black/60">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-red-300">EVENT MANAGEMENT</p>
              <p className="mt-2 text-sm font-semibold text-white">
                {isCancelled ? "취소된 이벤트 관리" : "이벤트 취소·삭제"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-2 py-1 text-zinc-500 hover:bg-white/5 hover:text-white"
              aria-label="이벤트 관리 메뉴 닫기"
            >
              ×
            </button>
          </div>

          <p className="mt-2 text-xs leading-5 text-zinc-400">
            시작 전 이벤트만 취소할 수 있습니다. 취소하면 관련 운영 기록이 삭제되고 반복 일정의 이후 Vol 번호가 당겨집니다.
          </p>

          <div className="mt-4 grid gap-2">
            {canCancel && (
              <Link
                href={`/events/${eventId}/edit`}
                onClick={() => setOpen(false)}
                className="rounded-xl border border-sky-400/35 bg-sky-400/5 px-4 py-2.5 text-center text-sm font-semibold text-sky-300 transition hover:bg-sky-400/10"
              >
                이벤트 정보 수정
              </Link>
            )}
            {canCancel && (
              <button
                type="button"
                onClick={cancelEvent}
                disabled={busy}
                className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
                  "border border-red-400/40 text-red-300 hover:bg-red-400/10"
                }`}
              >
                {busy ? "처리 중..." : "이벤트 취소"}
              </button>
            )}
            {canDelete && (
              <button
                type="button"
                onClick={hardDelete}
                disabled={busy}
                className="rounded-xl border border-red-500/50 bg-red-500/10 px-4 py-2.5 text-sm font-semibold text-red-300 transition hover:bg-red-500/20 disabled:opacity-50"
              >
                영구 삭제
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
