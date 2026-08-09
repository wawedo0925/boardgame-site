"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props = { eventId: string; mysteryId: string; canManage: boolean; isClosed: boolean };
type Work = { title: string; cover_url: string | null; min_players: number | null; max_players: number | null; play_time: number | null; host_requirement: string | null };
type Person = { id: string; activity_name: string | null; site_role?: string; played_before?: boolean };

export default function MurderMysteryEventPanel({ eventId, mysteryId, canManage, isClosed }: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [work,setWork]=useState<Work|null>(null); const [people,setPeople]=useState<Person[]>([]);
  const [selected,setSelected]=useState(""); const [role,setRole]=useState<"PLAYER"|"GM">("PLAYER");
  const [allowRepeat,setAllowRepeat]=useState(false); const [busy,setBusy]=useState(false);

  useEffect(()=>{ void (async()=>{
    const [{data:w},{data:p}] = await Promise.all([
      supabase.from("murder_mysteries").select("title,cover_url,min_players,max_players,play_time,host_requirement").eq("id",mysteryId).maybeSingle(),
      canManage ? supabase.rpc("murder_mystery_event_candidates", { p_event_id: eventId }) : Promise.resolve({data:[]}),
    ]);
    setWork(w as Work|null);
    setPeople(((p??[]) as Array<{user_id:string;activity_name:string|null;site_role:string;played_before:boolean}>).map(x=>({id:x.user_id,activity_name:x.activity_name,site_role:x.site_role,played_before:x.played_before})));
  })();},[supabase,mysteryId,canManage]);

  async function assign(){
    if(!selected) return; setBusy(true);
    const {error}=await supabase.rpc("assign_murder_mystery_member",{p_event_id:eventId,p_user_id:selected,p_role:role,p_allow_repeat:allowRepeat});
    setBusy(false); if(error){alert(error.message);return;} alert(role==="GM"?"GM을 배정했습니다.":"플레이어를 배정했습니다."); window.location.reload();
  }
  if(!work) return null;
  return <section className="rounded-3xl border border-red-400/25 bg-red-400/[0.04] p-5 sm:p-7">
    <p className="text-sm font-semibold text-red-300">MURDER MYSTERY EVENT</p>
    <div className="mt-3 flex gap-4">{work.cover_url&&<img src={work.cover_url} alt="" className="h-28 w-20 rounded-xl object-cover"/>}<div><h2 className="text-2xl font-bold">{work.title}</h2><p className="mt-2 text-sm text-zinc-400">{work.min_players??"?"}~{work.max_players??"?"}명 · 약 {work.play_time??"?"}분</p><p className="mt-1 text-sm text-red-200">진행자 {work.host_requirement==="REQUIRED"?"필요":work.host_requirement==="RECOMMENDED"?"권장":"불필요"}</p></div></div>
    {canManage&&!isClosed&&<div className="mt-5 grid gap-2 border-t border-white/10 pt-5 sm:grid-cols-[1fr_130px_auto_auto]">
      <select value={selected} onChange={e=>setSelected(e.target.value)} className="rounded-xl border border-white/10 bg-zinc-900 px-3 py-3"><option value="">멤버 선택</option>{people.filter(p=>role==="PLAYER"||["MAIN_ADMIN","ADMIN","RULE_MASTER"].includes(p.site_role??"")).map(p=><option key={p.id} value={p.id}>{p.activity_name??"이름 미정"}{p.played_before?" · 플레이 이력 있음":""}</option>)}</select>
      <select value={role} onChange={e=>setRole(e.target.value as "PLAYER"|"GM")} className="rounded-xl border border-white/10 bg-zinc-900 px-3"><option value="PLAYER">플레이어</option><option value="GM">GM</option></select>
      <label className="flex items-center gap-2 rounded-xl border border-white/10 px-3 text-sm"><input type="checkbox" checked={allowRepeat} onChange={e=>setAllowRepeat(e.target.checked)}/>재참가 허용</label>
      <button type="button" disabled={busy||!selected} onClick={assign} className="rounded-xl bg-red-400 px-4 font-bold text-zinc-950 disabled:opacity-40">배정</button>
    </div>}
  </section>;
}
