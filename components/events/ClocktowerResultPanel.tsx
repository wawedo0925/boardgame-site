"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { CLOCKTOWER_CHARACTERS, clocktowerDifficultyFromTitle } from "@/lib/clocktower/characters";
import type { EventParticipant } from "@/types/event";

type Props = { eventId: string; title: string; participants: EventParticipant[]; canManage: boolean; isClosed: boolean };
type SavedPlayer = { user_id:string; role_name:string|null; team_name:string|null; is_winner:boolean|null };
const nameOf=(p:EventParticipant)=>p.profile?.activity_name?.trim()||"회원";

export default function ClocktowerResultPanel({eventId,title,participants,canManage,isClosed}:Props){
  const supabase=useMemo(()=>createClient(),[]);
  const difficulty=clocktowerDifficultyFromTitle(title);
  const characters=difficulty?CLOCKTOWER_CHARACTERS[difficulty]:[];
  const [characterByUser,setCharacterByUser]=useState<Record<string,string>>({});
  const [winningFaction,setWinningFaction]=useState<"선"|"악"|"">("");
  const [busy,setBusy]=useState(false);
  const [saved,setSaved]=useState(false);
  const eligible=participants.filter(p=>p.attendance_status==="PRESENT");

  const load=useCallback(async()=>{
    const {data:sessions}=await supabase.from("event_game_sessions").select("id").eq("event_id",eventId).eq("result_type","ROLE");
    const sessionIds=(sessions??[]).map(row=>row.id); if(!sessionIds.length)return;
    const {data:rounds}=await supabase.from("event_game_rounds").select("id").in("session_id",sessionIds).order("round_number").limit(1);
    const roundId=rounds?.[0]?.id; if(!roundId)return;
    const {data}=await supabase.from("event_round_players").select("user_id,role_name,team_name,is_winner").eq("round_id",roundId);
    const rows=(data??[]) as SavedPlayer[]; if(!rows.length)return;
    setCharacterByUser(Object.fromEntries(rows.map(row=>[row.user_id,row.role_name??""])));
    const winner=rows.find(row=>row.is_winner); if(winner?.team_name)setWinningFaction(winner.team_name.endsWith(" · 악")?"악":"선");
    setSaved(true);
  },[eventId,supabase]);
  useEffect(()=>{void load()},[load]);

  async function save(){
    if(!difficulty){alert("시계탑 난이도를 확인하지 못했습니다.");return}
    if(!winningFaction){alert("승리 진영을 선택해 주세요.");return}
    const missing=eligible.find(p=>!characterByUser[p.user_id]); if(missing){alert(`${nameOf(missing)}님의 캐릭터를 선택해 주세요.`);return}
    const selectedCharacters=eligible.map(p=>characterByUser[p.user_id]).filter(Boolean);
    if(new Set(selectedCharacters).size!==selectedCharacters.length){alert("같은 캐릭터를 두 명에게 배정할 수 없습니다.");return}
    const assignments=eligible.map(p=>{const character=characters.find(c=>c.name===characterByUser[p.user_id]);return{user_id:p.user_id,character_name:character?.name,character_type:character?.type,faction:character?.faction}});
    try{setBusy(true);const{error}=await supabase.rpc("save_clocktower_event_results",{p_event_id:eventId,p_difficulty:difficulty,p_winning_faction:winningFaction,p_assignments:assignments});if(error)throw error;setSaved(true);alert("캐릭터와 승리 진영을 저장했습니다.");}
    catch(error){alert(error instanceof Error?error.message:"결과를 저장하지 못했습니다.")}
    finally{setBusy(false)}
  }

  if(!canManage)return null;
  return <section className="rounded-3xl border border-violet-400/25 bg-violet-400/[0.035] p-5 text-white sm:p-7">
    <p className="text-sm font-semibold tracking-[.18em] text-violet-300">CLOCKTOWER RESULT</p><div className="mt-1 flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-2xl font-bold">캐릭터·승리 진영 기록</h2><p className="mt-2 text-sm text-zinc-400">출석 멤버의 캐릭터를 기록하면 플레이 이력과 평가 작성에 자동 연결됩니다.</p></div>{saved&&<span className="rounded-full bg-emerald-400/10 px-3 py-1 text-sm text-emerald-300">저장된 결과</span>}</div>
    {!difficulty?<p className="mt-5 text-red-300">이벤트 제목에서 난이도를 확인할 수 없습니다.</p>:characters.length===0?<p className="mt-5 rounded-2xl border border-white/10 p-5 text-zinc-400">캐러셀 캐릭터 목록은 추후 업데이트됩니다.</p>:<>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">{eligible.map(member=>{
        const currentCharacter=characterByUser[member.user_id]??"";
        const selectedByOthers=new Set(Object.entries(characterByUser).filter(([userId])=>userId!==member.user_id).map(([,character])=>character).filter(Boolean));
        return <label key={member.user_id} className="rounded-2xl border border-white/10 bg-black/20 p-4"><span className="font-bold">{nameOf(member)}</span><select disabled={isClosed} value={currentCharacter} onChange={e=>setCharacterByUser(current=>({...current,[member.user_id]:e.target.value}))} className="mt-3 h-12 w-full rounded-xl border border-white/10 bg-zinc-900 px-3"><option value="">캐릭터 선택</option>{(["주민","외지인","하수인","악마"] as const).map(type=><optgroup key={type} label={type}>{characters.filter(c=>c.type===type).map(c=><option key={c.name} value={c.name} disabled={selectedByOthers.has(c.name)}>{c.name} · {c.faction}{selectedByOthers.has(c.name)?" · 배정됨":""}</option>)}</optgroup>)}</select></label>
      })}</div>
      {!eligible.length&&<p className="mt-5 text-sm text-zinc-500">먼저 참가자의 출석 상태를 출석으로 변경해 주세요.</p>}
      <div className="mt-6"><p className="font-bold">승리 진영</p><div className="mt-2 grid grid-cols-2 gap-3"><button disabled={isClosed} onClick={()=>setWinningFaction("선")} className={`h-12 rounded-xl font-bold ${winningFaction==="선"?"bg-sky-400 text-zinc-950":"bg-sky-400/10 text-sky-200"}`}>선 진영</button><button disabled={isClosed} onClick={()=>setWinningFaction("악")} className={`h-12 rounded-xl font-bold ${winningFaction==="악"?"bg-red-400 text-zinc-950":"bg-red-400/10 text-red-200"}`}>악 진영</button></div></div>
      {!isClosed&&<button disabled={busy||!eligible.length} onClick={()=>void save()} className="mt-5 h-13 w-full rounded-xl bg-violet-400 font-bold text-zinc-950 disabled:opacity-40">{busy?"저장 중...":"캐릭터·결과 저장"}</button>}
    </>}
  </section>
}
