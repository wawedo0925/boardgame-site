"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { clearRoundResults, saveRoundResults } from "@/lib/services/rounds";
import type { EventGameRound, ResultType } from "@/types/event";
import { isTichu, TICHU_TEAMS, tichuResult } from "@/lib/tichu";

import {isWolfStreet} from "@/lib/wolfstreet";
import WolfStreetResultDialog from "./WolfStreetResultDialog";

type Props = { round: EventGameRound; resultType: ResultType; gameName?: string; onClose: () => void; onSaved: () => Promise<void> | void };

function playerName(player: EventGameRound["players"][number]) {
  return player.profile?.activity_name?.trim() || "회원";
}

export default function RoundResultDialog(props:Props) { return isWolfStreet(props.gameName)?<WolfStreetResultDialog round={props.round} onClose={props.onClose} onSaved={props.onSaved}/>:<DefaultRoundResultDialog {...props}/>; }
function DefaultRoundResultDialog({ round, resultType, gameName, onClose, onSaved }: Props) {
  const teamScore = isTichu(gameName);
  const supabase = useMemo(() => createClient(), []);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [ranks, setRanks] = useState<Record<string, number | null>>({});
  const [gmByUser, setGmByUser] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [teams, setTeams] = useState<Record<string, string>>({});

  useEffect(() => {
    setTeams(Object.fromEntries(round.players.map(player => [player.user_id, player.team_name ?? ""])));
    setGmByUser(Object.fromEntries(round.players.map(player => [player.user_id, player.is_gm === true])));
    setScores(Object.fromEntries(round.players.map((player) => [player.user_id, player.score?.toString() ?? ""])));
    setRanks(Object.fromEntries(round.players.map((player) => [player.user_id, player.rank])));
  }, [round]);

  async function submit() {
    try {
      setBusy(true);
      await saveRoundResults(supabase, round.id, teamScore ? "SCORE" : resultType, round.players.map((player) => ({
        teamName: teams[player.user_id] || null,
        userId: player.user_id,
        isGm: gmByUser[player.user_id] === true,
        score: (scores[player.user_id] ?? "").trim() === "" ? null : Number(scores[player.user_id]),
        rank: ranks[player.user_id] ?? null,
      })), teamScore);
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

  const activePlayers = round.players.filter(player => !gmByUser[player.user_id]);
  let preview: ReturnType<typeof tichuResult> | null = null;
  if (teamScore) {
    try { preview = tichuResult(activePlayers.map(player => ({ teamName: teams[player.user_id], score: (scores[player.user_id] ?? "").trim() === "" ? null : Number(scores[player.user_id]) }))); }
    catch { /* A result is shown once both teams and all scores are complete. */ }
  }
  function toggleGm(userId: string) {
    const next = !gmByUser[userId];
    setGmByUser(current => ({ ...current, [userId]: next }));
    setScores(current => ({ ...current, [userId]: "" }));
    const count = round.players.filter(player => player.user_id === userId ? !next : !gmByUser[player.user_id]).length;
    setRanks(current => Object.fromEntries(Object.entries(current).map(([id, rank]) => [id, id === userId || (rank !== null && rank > count) ? null : rank])));
  }
  const hasResult = round.players.some((player) => player.is_gm || player.score !== null || player.rank !== null);

  return <div className="fixed inset-0 z-[100] flex items-end bg-black/70 sm:items-center sm:justify-center" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-5 text-white shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-7">
      <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-zinc-700 sm:hidden" />
      <div className="flex items-start justify-between gap-4"><div><p className="text-sm text-amber-300">{round.round_number}판</p><h2 className="mt-1 text-xl font-bold">{teamScore ? "티츄 팀 점수 입력" : resultType === "SCORE" ? "점수 입력" : "등수 입력"}</h2></div><button onClick={onClose} className="min-h-11 min-w-11 rounded-full bg-white/5 text-xl" aria-label="닫기">×</button></div>
      {teamScore && <div className="mt-5 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4"><p className="text-sm text-zinc-300">A팀·B팀을 각각 2명씩 지정해 주세요. 팀원 2명의 점수 합계로 승패를 기록합니다.</p>{preview ? <><div className="mt-3 grid grid-cols-2 gap-3">{TICHU_TEAMS.map(team => <div key={team} className="rounded-xl bg-white/5 p-3"><p className="text-sm">{team}</p><strong className="text-xl text-amber-300">{preview.totals[team]}점</strong></div>)}</div><p role="status" className="mt-3 font-bold text-amber-300">{preview.winner ? preview.winner + " 승리" : "무승부"}</p></> : <p className="mt-3 text-sm text-zinc-500">팀과 점수를 모두 입력하면 합계와 승패가 표시됩니다.</p>}</div>}
      <div className="mt-6 space-y-3">
        {round.players.map((player) => <div key={player.user_id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="mb-3 flex items-center justify-between gap-3"><p className="font-semibold">{playerName(player)}</p><button type="button" aria-pressed={gmByUser[player.user_id] === true} onClick={() => toggleGm(player.user_id)} className={`min-h-11 rounded-xl border px-4 font-bold ${gmByUser[player.user_id] ? "border-violet-300 bg-violet-500/20 text-violet-200" : "border-white/15 text-zinc-400"}`}>{gmByUser[player.user_id] ? "✓ GM" : "GM 지정"}</button></div>
          {teamScore && !gmByUser[player.user_id] && <div className="mb-3 grid grid-cols-2 gap-2">{TICHU_TEAMS.map(team => <button key={team} type="button" aria-pressed={teams[player.user_id] === team} onClick={() => setTeams(current => ({ ...current, [player.user_id]: team }))} className={"min-h-11 rounded-xl border font-bold " + (teams[player.user_id] === team ? (team === "A팀" ? "border-sky-300 bg-sky-500/25 text-sky-200" : "border-red-300 bg-red-500/25 text-red-200") : "border-white/10 bg-white/5 text-zinc-400")}>{teams[player.user_id] === team ? "✓ " : ""}{team}</button>)}</div>}
          {gmByUser[player.user_id] ? <p className="rounded-xl bg-violet-400/10 p-4 text-sm text-violet-200">GM 진행으로 기록합니다. 점수·등수는 저장하지 않습니다.</p> : (teamScore || resultType === "SCORE") ? <input type="number" inputMode="numeric" step="1" value={scores[player.user_id] ?? ""} onChange={(event) => setScores((current) => ({ ...current, [player.user_id]: event.target.value }))} placeholder="점수 입력" className="h-14 w-full rounded-xl border border-white/10 bg-zinc-900 px-4 text-right text-2xl font-bold outline-none focus:border-amber-400" /> : <div className="grid grid-cols-4 gap-2">{activePlayers.map((_, index) => { const rank=index+1; const selected=ranks[player.user_id]===rank; const used=Object.entries(ranks).some(([id,value])=>id!==player.user_id&&!gmByUser[id]&&value===rank); return <button key={rank} type="button" disabled={used} onClick={()=>setRanks((current)=>({...current,[player.user_id]:rank}))} className={`min-h-12 rounded-xl font-bold ${selected ? "bg-amber-400 text-zinc-950" : used ? "bg-white/[0.02] text-zinc-700" : "bg-white/10 text-white"}`}>{rank}등</button>; })}</div>}
        </div>)}
      </div>
      <div className="sticky bottom-0 mt-6 grid grid-cols-2 gap-3 bg-zinc-950 pb-[max(0px,env(safe-area-inset-bottom))] pt-3">
        {hasResult ? <button disabled={busy} onClick={clear} className="min-h-12 rounded-xl border border-red-400/30 text-red-300 disabled:opacity-50">결과 삭제</button> : <button onClick={onClose} className="min-h-12 rounded-xl border border-white/10 text-zinc-300">취소</button>}
        <button disabled={busy} onClick={submit} className="min-h-12 rounded-xl bg-amber-400 font-bold text-zinc-950 disabled:opacity-50">{busy ? "저장 중..." : hasResult ? "수정 저장" : "결과 저장"}</button>
      </div>
    </section>
  </div>;
}
