"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function EventLeaveRefundDialog({ eventId, userId, onClose, onLeft }: {
  eventId: string; userId: string; onClose: () => void; onLeft: () => Promise<void>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [refund, setRefund] = useState(false);
  const [method, setMethod] = useState<"KAKAOPAY" | "BANK" | null>(null);
  const [bank, setBank] = useState("");
  const [account, setAccount] = useState("");
  const [presetLoading, setPresetLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    void (async () => {
      try {
        const { data, error } = await supabase.from("refund_account_presets")
          .select("bank, account_number").eq("user_id", userId).maybeSingle();
        if (!active) return;
        if (error) setError("저장된 계좌를 불러오지 못했습니다. 이번 계좌를 직접 입력해 주세요.");
        else if (data) { setBank(data.bank); setAccount(data.account_number); }
      } catch { if (active) setError("저장된 계좌를 불러오지 못했습니다. 직접 입력해 주세요."); }
      finally { if (active) setPresetLoading(false); }
    })();
    return () => { active = false; };
  }, [supabase, userId]);

  async function submit(choice: "NONE" | "KAKAOPAY" | "BANK") {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    try {
      const { error } = await supabase.rpc("leave_event_with_refund", {
        p_event_id: eventId, p_method: choice,
        p_bank: choice === "BANK" ? bank.trim() : null,
        p_account_number: choice === "BANK" ? account.trim() : null,
      });
      if (error) throw error;
    } catch (cause) {
      setError(cause && typeof cause === "object" && "message" in cause ? String(cause.message) : "요청을 완료하지 못했습니다. 다시 시도해 주세요.");
      submitting.current = false; setBusy(false); return;
    }
    try { await onLeft(); } finally { onClose(); }
  }

  return <dialog ref={dialog} onCancel={(e) => { e.preventDefault(); if (!busy) onClose(); }}
    aria-labelledby="leave-refund-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-3xl border border-white/15 bg-zinc-950 p-6 text-white shadow-2xl backdrop:bg-black/75">
    <div className="flex items-center justify-between gap-3">
      <h2 id="leave-refund-title" className="text-xl font-bold">{refund ? "환불 방법을 선택해 주세요" : "환불 받으시겠습니까?"}</h2>
      <button aria-label="닫기" onClick={onClose} disabled={busy} className="h-11 w-11 shrink-0 rounded-full bg-white/10 text-xl">×</button>
    </div>
    {!refund ? <>
      <p className="mt-4 text-sm text-zinc-400">환불을 원하지 않으면 ‘놉!혜택참여’를 눌러 바로 나갈 수 있어요.</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        <button disabled={busy} onClick={() => setRefund(true)} className="min-h-12 rounded-xl bg-amber-400 font-bold text-black disabled:opacity-50">응!</button>
        <button disabled={busy} onClick={() => void submit("NONE")} className="min-h-12 rounded-xl border border-white/20 font-bold disabled:opacity-50">{busy ? "처리 중..." : "놉!혜택참여"}</button>
      </div>
    </> : <form onSubmit={(e) => { e.preventDefault(); if (method) void submit(method); }}>
      <fieldset disabled={busy} className="mt-5 space-y-3">
        {([['KAKAOPAY', '카카오페이로 받으시겠습니까?'], ['BANK', '계좌로 받겠습니까?']] as const).map(([value, label]) =>
          <label key={value} className="flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border border-white/15 p-3">
            <input type="checkbox" checked={method === value} onChange={() => setMethod(method === value ? null : value)} className="h-5 w-5 accent-amber-400" />{label}
          </label>)}
        <label className="block text-sm">계좌번호
          <input disabled={method !== "BANK" || presetLoading} required={method === "BANK"} value={account} onChange={(e) => setAccount(e.target.value)}
            inputMode="numeric" maxLength={40} pattern="[0-9 \-]{5,40}" placeholder="계좌번호를 입력해 주세요" className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 disabled:opacity-35" />
        </label>
        <label className="block text-sm">은행
          <input disabled={method !== "BANK" || presetLoading} required={method === "BANK"} value={bank} onChange={(e) => setBank(e.target.value)}
            maxLength={50} placeholder="은행 이름을 입력해 주세요" className="mt-2 min-h-12 w-full rounded-xl border border-white/15 bg-zinc-900 px-3 disabled:opacity-35" />
        </label>
      </fieldset>
      <p className="mt-4 text-sm leading-6 text-zinc-400">{presetLoading ? "저장된 계좌 확인 중..." : "계좌로 요청하면 다음 요청에도 사용할 수 있도록 계좌가 저장됩니다. 언제든 수정해서 보낼 수 있어요."}<br />제출하면 참가가 취소되고 관리자에게 환불 요청이 전달됩니다. 실제 환불은 관리자 확인 후 진행됩니다.</p>
      <div className="mt-5 flex gap-3">
        <button type="button" disabled={busy} onClick={() => setRefund(false)} className="min-h-12 rounded-xl border border-white/20 px-4">이전</button>
        <button type="submit" disabled={busy || !method || (method === "BANK" && (presetLoading || !bank.trim() || !account.trim()))} className="min-h-12 flex-1 rounded-xl bg-amber-400 font-bold text-black disabled:opacity-40">{busy ? "요청 중..." : "환불 요청하고 나가기"}</button>
      </div>
    </form>}
    {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
  </dialog>;
}
