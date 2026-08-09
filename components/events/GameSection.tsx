"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getEventGames } from "@/lib/services/events";
import type { EventGame, EventParticipant } from "@/types/event";
import GameCard from "./GameCard";
import AddRoundDialog from "./AddRoundDialog";
import AddGameDialog from "./AddGameDialog";

type Props = { eventId: string; currentUserId?: string | null; isEventCreator?: boolean; participants: EventParticipant[] };

export default function GameSection({ eventId, currentUserId, isEventCreator, participants }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [games,setGames]=useState<EventGame[]>([]); const [loading,setLoading]=useState(true); const [error,setError]=useState("");
  const [roundGame,setRoundGame]=useState<EventGame|null>(null);
  const [addingGame,setAddingGame]=useState(false);
  const [resolvedUserId,setResolvedUserId]=useState<string|null>(currentUserId??null);
  const [canManage,setCanManage]=useState(Boolean(isEventCreator));
  const load=useCallback(async()=>{try{setError("");setGames(await getEventGames(supabase,eventId));}catch(e){const message=e instanceof Error?e.message:typeof e==="object"&&e&&"message" in e?String(e.message):"알 수 없는 조회 오류";console.error("게임과 판 조회 오류:",message,e);setError(`게임과 판 정보를 불러오지 못했습니다: ${message}`);}finally{setLoading(false);}},[eventId,supabase]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{let active=true;async function resolveManager(){const [{data:{user}},{data:eventRow}]=await Promise.all([supabase.auth.getUser(),supabase.from("events").select("created_by").eq("id",eventId).maybeSingle()]);if(!active)return;const userId=currentUserId??user?.id??null;setResolvedUserId(userId);setCanManage(Boolean(isEventCreator||(userId&&eventRow?.created_by===userId)));}void resolveManager();return()=>{active=false;};},[currentUserId,eventId,isEventCreator,supabase]);

  return <section className="mt-10"><div className="flex items-end justify-between gap-4"><div><p className="text-sm font-semibold text-amber-300">GAME TABLES</p><h2 className="mt-1 text-2xl font-bold text-white">게임과 판 결과</h2></div>{canManage&&resolvedUserId&&<button onClick={()=>setAddingGame(true)} className="min-h-11 rounded-xl bg-amber-400 px-4 font-bold text-zinc-950">+ 게임 추가</button>}</div>
    {loading?<div className="mt-5 h-48 animate-pulse rounded-3xl bg-white/[0.03]"/>:error?<p className="mt-5 rounded-2xl border border-red-400/20 p-5 text-red-300">{error}</p>:games.length===0?<p className="mt-5 rounded-3xl border border-dashed border-white/10 p-10 text-center text-zinc-500">등록된 게임이 없습니다.</p>:<div className="mt-5 grid gap-5 lg:grid-cols-2">{games.map((game)=><GameCard key={game.id} eventGame={game} canManage={canManage} onChanged={load} onAddRound={setRoundGame}/>)}</div>}
    {roundGame&&<AddRoundDialog eventGame={roundGame} participants={participants} onClose={()=>setRoundGame(null)} onSaved={load}/>} 
    {addingGame&&resolvedUserId&&<AddGameDialog eventId={eventId} currentUserId={resolvedUserId} registeredGameIds={games.map((game)=>game.game_id)} onClose={()=>setAddingGame(false)} onSaved={load}/>} 
  </section>;
}
