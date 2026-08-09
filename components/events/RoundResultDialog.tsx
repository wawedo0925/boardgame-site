"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearRoundResults, saveRoundResults } from "@/lib/services/rounds";
import type { EventGameRound, ResultType } from "@/types/event";

type Props = { round: EventGameRound; resultType: ResultType; onClose: () => void; onSaved: () => Promise<void> | void };

function playerName(player: EventGameRound["players"][number]) {
  return player.profile?.activity_name?.trim() || "회원";
}

export default function RoundResultDialog({ round, resultType, onClose, onSaved }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [ranks, setRanks] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setScores(Object.fromEntries(round.players.map((player) => [player.user_id, player.score?.toString() ?? ""])));
    setRanks(Object.fromEntries(round.players.map((player) => [player.user_id, player.rank])));
  }, [round]);

  async function submit() {
    try {
      setBusy(true);
      await saveRoundResults(supabase, round.id, resultType, round.players.map((player) => ({
        userId: player.user_id,
        score: scores[player.user_id]?.trim() === "" ? null : Number(scores[player.user_id]),
        rank: ranks[player.user_id] ?? null,
      })));
      await onSaved();
      onClose();
    } catch (error) {
      const message=error instanceof Error?error.message:typeof error==="object"&&error&&"message" in error?String(error.message):"결과 저장에 실패했습니다.";
      console.error("결과 저장 오류:",error);
      alert(message);
    } finally { setBusy(false); }
  }

  async function clear() {
    if (!window.confirm("이 판의 입력 결과를 모두 삭제할까요? 참가자와 판은 유지됩니다.")) return;
    try {
      setBusy(true);
      await clearRoundResults(supabase, round.id);
      await onSaved();
      onClose();
    } catch (error) { const message=error instanceof Error?error.message:typeof error==="object"&&error&&"message" in error?String(error.message):"결과 삭제에 실패했습니다.";console.error("결과 삭제 오류:",error);alert(message); }
    finally { setBusy(false); }
  }

  const hasResult = round.players.some((player) => player.score !== null || player.rank !== null);

  return <div className="fixed inset-0 z-[100] flex items-end bg-black/70 sm:items-center sm:justify-center" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-5 text-white shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-7">
      <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-zinc-700 sm:hidden" />
      <div className="flex items-start justify-between gap-4"><div><p className="text-sm text-amber-300">{round.round_number}판</p><h2 className="mt-1 text-xl font-bold">{resultType === "SCORE" ? "점수 입력" : "등수 입력"}</h2></div><button onClick={onClose} className="min-h-11 min-w-11 rounded-full bg-white/5 text-xl" aria-label="닫기">×</button></div>
      <div className="mt-6 space-y-3">
        {round.players.map((player) => <div key={player.user_id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <p className="mb-3 font-semibold">{playerName(player)}</p>
          {resultType === "SCORE" ? <input type="number" inputMode="numeric" step="1" value={scores[player.user_id] ?? ""} onChange={(event) => setScores((current) => ({ ...current, [player.user_id]: event.target.value }))} placeholder="점수 입력" className="h-14 w-full rounded-xl border border-white/10 bg-zinc-900 px-4 text-right text-2xl font-bold outline-none focus:border-amber-400" /> : <div className="grid grid-cols-4 gap-2">{round.players.map((_, index) => { const rank=index+1; const selected=ranks[player.user_id]===rank; const used=Object.entries(ranks).some(([id,value])=>id!==player.user_id&&value===rank); return <button key={rank} type="button" disabled={used} onClick={()=>setRanks((current)=>({...current,[player.user_id]:rank}))} className={`min-h-12 rounded-xl font-bold ${selected ? "bg-amber-400 text-zinc-950" : used ? "bg-white/[0.02] text-zinc-700" : "bg-white/10 text-white"}`}>{rank}등</button>; })}</div>}
        </div>)}
      </div>
      <div className="sticky bottom-0 mt-6 grid grid-cols-2 gap-3 bg-zinc-950 pb-[max(0px,env(safe-area-inset-bottom))] pt-3">
        {hasResult ? <button disabled={busy} onClick={clear} className="min-h-12 rounded-xl border border-red-400/30 text-red-300 disabled:opacity-50">결과 삭제</button> : <button onClick={onClose} className="min-h-12 rounded-xl border border-white/10 text-zinc-300">취소</button>}
        <button disabled={busy} onClick={submit} className="min-h-12 rounded-xl bg-amber-400 font-bold text-zinc-950 disabled:opacity-50">{busy ? "저장 중..." : hasResult ? "수정 저장" : "결과 저장"}</button>
      </div>
    </section>
  </div>;
}
