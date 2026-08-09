"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { deleteRound } from "@/lib/services/rounds";
import { deleteEventGame } from "@/lib/services/events";
import type { EventGame, EventGameRound } from "@/types/event";
import RoundResultDialog from "./RoundResultDialog";
import RoleResultDialog from "./RoleResultDialog";

type Props = { eventGame: EventGame; canManage: boolean; onChanged: () => Promise<void> | void; onAddRound?: (eventGame: EventGame) => void };
const name = (player: EventGameRound["players"][number]) => player.profile?.activity_name?.trim() || "회원";

export default function GameCard({ eventGame, canManage, onChanged, onAddRound }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [editing, setEditing] = useState<EventGameRound | null>(null);
  const [editingRole,setEditingRole]=useState<EventGameRound|null>(null);

  async function removeRound(round: EventGameRound) {
    if (!window.confirm(`${round.round_number}판과 참가자/결과를 모두 삭제할까요?`)) return;
    try { await deleteRound(supabase, round.id); await onChanged(); }
    catch (error) { alert(error instanceof Error ? error.message : "판 삭제에 실패했습니다."); }
  }
  async function removeGame(){if(!window.confirm("이 게임과 모든 판을 삭제할까요?"))return;try{await deleteEventGame(supabase,eventGame.id);await onChanged();}catch(error){alert(error instanceof Error?error.message:"게임 삭제에 실패했습니다.");}}

  const typeLabel=eventGame.result_type==="ROLE"?"역할형":eventGame.result_type==="SIMPLE_SCORE"?"등수형":"점수형";
  return <article className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
    <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-amber-300">{typeLabel}</p><h3 className="mt-1 text-xl font-bold text-white">{eventGame.game?.name ?? "게임"}</h3><p className="mt-1 text-sm text-zinc-500">{eventGame.game?.publisher ?? "출판사 정보 없음"}</p></div>{canManage&&<div className="flex gap-2"><button onClick={removeGame} className="min-h-11 rounded-xl border border-red-400/20 px-3 text-sm text-red-300">게임 삭제</button>{onAddRound&&<button onClick={()=>onAddRound(eventGame)} className="min-h-11 shrink-0 rounded-xl bg-amber-400 px-4 font-bold text-zinc-950">+ 1판 추가</button>}</div>}</div>
    <div className="mt-5 space-y-3">{eventGame.rounds.length === 0 ? <p className="rounded-2xl border border-dashed border-white/10 px-4 py-7 text-center text-sm text-zinc-500">아직 생성된 판이 없습니다.</p> : eventGame.rounds.map((round) => {
      const hasResult=round.players.some((player)=>player.score!==null||player.rank!==null||player.role_name!==null);
      const sorted=[...round.players].sort((a,b)=>eventGame.result_type==="SIMPLE_SCORE"?(a.rank??999)-(b.rank??999):(b.score??-Infinity)-(a.score??-Infinity));
      return <section key={round.id} className="rounded-2xl border border-white/10 bg-zinc-950/70 p-4"><div className="flex items-center justify-between gap-3"><p className="font-bold text-white">{round.round_number}판</p>{canManage&&<div className="flex gap-2">{eventGame.result_type==="ROLE"?<button onClick={()=>setEditingRole(round)} className="min-h-10 rounded-lg bg-white/10 px-3 text-sm font-semibold">{hasResult?"역할 수정":"역할 입력"}</button>:<button onClick={()=>setEditing(round)} className="min-h-10 rounded-lg bg-white/10 px-3 text-sm font-semibold">{hasResult?"결과 수정":"결과 입력"}</button>}<button onClick={()=>removeRound(round)} className="min-h-10 rounded-lg border border-red-400/20 px-3 text-sm text-red-300">판 삭제</button></div>}</div>
        <div className="mt-3 space-y-2">{sorted.map((player)=><div key={player.user_id} className="flex min-h-10 items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-3"><span className="truncate text-sm text-zinc-300">{name(player)}</span><strong className="shrink-0 text-amber-300">{eventGame.result_type==="ROLE"?(player.role_name?`${player.role_name} · ${player.is_winner?"승리":"패배"}`:"역할 미입력"):eventGame.result_type==="SCORE"?(player.score===null?"미입력":`${player.score.toLocaleString()}점`):(player.rank===null?"미입력":`${player.rank}등`)}</strong></div>)}</div>
      </section>})}</div>
    {editing&&<RoundResultDialog round={editing} resultType={eventGame.result_type} onClose={()=>setEditing(null)} onSaved={onChanged}/>} 
    {editingRole&&eventGame.game&&<RoleResultDialog round={editingRole} gameId={eventGame.game.id} onClose={()=>setEditingRole(null)} onSaved={onChanged}/>} 
  </article>;
}
