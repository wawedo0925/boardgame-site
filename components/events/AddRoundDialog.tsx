"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { createRound } from "@/lib/services/rounds";
import type { EventGame, EventParticipant } from "@/types/event";

type Props = { eventGame: EventGame; participants: EventParticipant[]; onClose: () => void; onSaved: () => Promise<void> | void };
const displayName=(participant:EventParticipant)=>participant.profile?.activity_name?.trim()||"회원";

export default function AddRoundDialog({ eventGame, participants, onClose, onSaved }: Props) {
  const supabase=useMemo(()=>createClient(),[]); const [selected,setSelected]=useState<string[]>(participants.map((p)=>p.user_id)); const [busy,setBusy]=useState(false);
  function toggle(userId:string){setSelected((current)=>current.includes(userId)?current.filter((id)=>id!==userId):[...current,userId]);}
  async function submit(){try{setBusy(true);await createRound(supabase,eventGame.id,selected);await onSaved();onClose();}catch(error){const message=error instanceof Error?error.message:typeof error==="object"&&error&&"message" in error?String(error.message):"판 저장에 실패했습니다.";console.error("판 저장 오류:",error);alert(message);}finally{setBusy(false);}}
  return <div className="fixed inset-0 z-[100] flex items-end bg-black/70 sm:items-center sm:justify-center"><section className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 p-5 text-white sm:max-w-lg sm:rounded-3xl sm:p-7">
    <div className="flex items-start justify-between gap-4"><div><p className="text-sm text-amber-300">{eventGame.game?.name}</p><h2 className="mt-1 text-xl font-bold">{eventGame.rounds.length+1}판 참가자</h2></div><button onClick={onClose} className="min-h-11 min-w-11 rounded-full bg-white/5 text-xl">×</button></div>
    <div className="mt-5 flex gap-2"><button onClick={()=>setSelected(participants.map((p)=>p.user_id))} className="min-h-10 rounded-lg bg-white/10 px-3 text-sm">전체 선택</button><button onClick={()=>setSelected([])} className="min-h-10 rounded-lg bg-white/10 px-3 text-sm">전체 해제</button></div>
    <div className="mt-4 space-y-2">{participants.map((participant)=><label key={participant.user_id} className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4"><input type="checkbox" checked={selected.includes(participant.user_id)} onChange={()=>toggle(participant.user_id)} className="h-5 w-5 accent-amber-400"/><span className="font-medium">{displayName(participant)}</span></label>)}</div>
    <div className="sticky bottom-0 mt-6 grid grid-cols-2 gap-3 bg-zinc-950 pb-[max(0px,env(safe-area-inset-bottom))] pt-3"><button onClick={onClose} className="min-h-12 rounded-xl border border-white/10">취소</button><button disabled={busy||selected.length===0} onClick={submit} className="min-h-12 rounded-xl bg-amber-400 font-bold text-zinc-950 disabled:opacity-50">{busy?"저장 중...":`${selected.length}명으로 판 만들기`}</button></div>
  </section></div>;
}
