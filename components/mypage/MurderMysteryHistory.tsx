"use client";
import { useEffect,useMemo,useState } from "react";
import { createClient } from "@/lib/supabase/client";
type Row={title:string;participation_role:"PLAYER"|"GM";play_count:number;last_completed_at:string};
export default function MurderMysteryHistory(){const supabase=useMemo(()=>createClient(),[]);const [rows,setRows]=useState<Row[]>([]);
useEffect(()=>{void supabase.rpc("my_murder_mystery_history").then(({data})=>setRows((data??[]) as Row[]));},[supabase]);
if(!rows.length)return null;const plays=rows.filter(x=>x.participation_role==="PLAYER"),gms=rows.filter(x=>x.participation_role==="GM");
return <section className="mt-8 rounded-3xl border border-red-400/25 bg-red-400/[0.035] p-6"><p className="text-sm font-semibold text-red-300">MURDER MYSTERY HISTORY</p><h2 className="mt-1 text-2xl font-bold">머더미스터리 이력</h2><div className="mt-5 grid gap-5 md:grid-cols-2">{[["플레이",plays],["GM 진행",gms]].map(([label,list])=><div key={label as string} className="rounded-2xl border border-white/10 p-4"><h3 className="font-bold">{label as string} · {(list as Row[]).reduce((n,x)=>n+Number(x.play_count),0)}회</h3><div className="mt-3 space-y-2">{(list as Row[]).length?(list as Row[]).map(x=><div key={`${x.title}-${x.participation_role}`} className="flex justify-between rounded-xl bg-white/[0.04] px-3 py-2"><span>{x.title}</span><b className="text-red-300">{x.play_count}회</b></div>):<p className="text-sm text-zinc-600">아직 기록이 없습니다.</p>}</div></div>)}</div></section>}
