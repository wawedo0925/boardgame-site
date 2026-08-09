"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function EventNoticeCard({
  eventId,
  canManage,
}: {
  eventId: string;
  canManage: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  if (!canManage) return null;

  async function sendNotice() {
    if (!message.trim()) {
      alert("공지 내용을 입력해 주세요.");
      return;
    }
    if (!window.confirm("이벤트 참가자에게 이 공지를 보낼까요?")) return;

    try {
      setBusy(true);
      const { data, error } = await supabase.rpc("send_event_notice", {
        p_event_id: eventId,
        p_message: message.trim(),
      });
      if (error) throw error;
      alert(`${Number(data ?? 0)}명에게 공지를 보냈습니다.`);
      setMessage("");
      setOpen(false);
    } catch (error) {
      console.error("이벤트 공지 발송 오류:", error);
      alert(error instanceof Error ? error.message : "공지를 보내지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-sky-400/20 bg-sky-400/[0.04] p-5 sm:p-7">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-sky-300">EVENT NOTICE</p>
          <h2 className="mt-1 text-xl font-bold">참가자 공지</h2>
          <p className="mt-2 text-sm text-zinc-500">이벤트 참가자에게만 사이트 알림을 보냅니다.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="shrink-0 rounded-xl bg-sky-400 px-4 py-3 text-sm font-bold text-zinc-950"
        >
          {open ? "닫기" : "공지 보내기"}
        </button>
      </div>

      {open && (
        <div className="mt-5 border-t border-white/10 pt-5">
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={300}
            rows={4}
            placeholder="시간 변경, 준비물 등 참가자에게 전달할 내용을 입력하세요."
            className="w-full resize-none rounded-2xl border border-white/10 bg-zinc-950 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-700 focus:border-sky-400/50"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-zinc-600">{message.length} / 300</span>
            <button
              type="button"
              onClick={sendNotice}
              disabled={busy || !message.trim()}
              className="rounded-xl bg-sky-400 px-5 py-3 text-sm font-bold text-zinc-950 disabled:opacity-40"
            >
              {busy ? "보내는 중..." : "참가자에게 보내기"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
