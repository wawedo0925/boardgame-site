"use client";
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { GroupDraft, GroupParticipant } from '@/types/group';

type Review={id:string;game_id:string;user_id:string;author_name:string|null;rating:number;games:{name:string}|null};
export default function GameAvoidanceDialog({group,participants,onClose}:{group:GroupDraft;participants:GroupParticipant[];onClose:()=>void}) {
  const supabase=useMemo(()=>createClient(),[]);
  const [rows,setRows]=useState<Review[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{
    let cancelled=false;
    async function load(){
      try {
        const result:Review[]=[];
        if(group.userIds.length)for(let offset=0;;offset+=500){
          const {data,error}=await supabase.from('game_reviews').select('id,game_id,user_id,author_name,rating,games(name)').in('user_id',group.userIds).in('rating',[1,2]).order('id').range(offset,offset+499);
          if(error)throw error;
          result.push(...(data as unknown as Review[]));
          if(!data||data.length<500)break;
        }
        if(!cancelled)setRows(result);
      }catch(e){if(!cancelled)setError(e instanceof Error?e.message:'평점을 불러오지 못했습니다. 닫고 다시 시도해 주세요.');}
      finally{if(!cancelled)setLoading(false);}
    }
    void load();return()=>{cancelled=true;};
  },[group.userIds,supabase]);
  const games=[...new Set(rows.map(row=>row.game_id))].map(id=>({id,name:rows.find(row=>row.game_id===id)?.games?.name??'삭제된 게임',reviews:rows.filter(row=>row.game_id===id)})).sort((a,b)=>a.name.localeCompare(b.name,'ko'));
  return <div className="fixed inset-0 z-[120] flex items-end bg-black/75 sm:items-center sm:justify-center" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-labelledby="game-avoidance-title" className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-zinc-950 p-5 text-white sm:max-w-xl sm:rounded-3xl" onClick={e=>e.stopPropagation()}>
      <div className="flex items-center justify-between gap-3"><h2 id="game-avoidance-title" className="text-xl font-bold">{group.name} · 게임 비추천</h2><button autoFocus onClick={onClose} className="min-h-11 shrink-0 rounded-xl bg-white/10 px-4">닫기</button></div>
      <p className="mt-3 text-sm text-zinc-400">확정된 조원들이 1점 또는 2점을 준 게임입니다.</p>
      {loading?<p className="py-8">평점을 불러오는 중…</p>:error?<p role="alert" className="py-8 text-red-300">{error}</p>:games.length===0?<p className="py-8">아무도 낮은 평점을 주지 않았습니다.</p>:<div className="mt-5 space-y-3">{games.map(game=><article key={game.id} className="rounded-xl border border-white/15 p-4"><h3 className="font-bold">{game.name}</h3>{game.reviews.map(row=><p key={row.id} className="mt-2 text-sm text-zinc-300">{participants.find(p=>p.user_id===row.user_id)?.profile?.activity_name||row.author_name||'회원'} · <strong className="text-amber-300">{row.rating}점</strong></p>)}</article>)}</div>}
    </section>
  </div>;
}
