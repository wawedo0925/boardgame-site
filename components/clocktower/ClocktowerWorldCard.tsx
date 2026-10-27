'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function ClocktowerWorldCard(){
 const client=useMemo(()=>createClient(),[]),[enabled,setEnabled]=useState(false);
 useEffect(()=>{let active=true;const check=async()=>{const {data,error}=await client.rpc('clocktower_world_enabled');if(active&&!error)setEnabled(data===true);};void check();const timer=setInterval(()=>{if(document.visibilityState==='visible')void check();},15000);const focus=()=>void check();window.addEventListener('focus',focus);return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',focus);};},[client]);
 if(!enabled)return null;
 return <Link href="/clocktower" className="group relative flex min-h-[23rem] flex-col overflow-hidden rounded-[2rem] border border-violet-300/25 bg-gradient-to-br from-violet-950 via-[#101312] to-[#101312] p-6 shadow-2xl transition hover:-translate-y-1 hover:border-violet-300 sm:p-8"><div className="flex items-start justify-between gap-4"><div><p className="text-[11px] font-black tracking-[0.28em] text-violet-300">BLOOD ON THE CLOCKTOWER</p><h2 className="mt-2 text-3xl font-black">시계탑에 흐른 피</h2></div><span className="text-5xl" aria-hidden="true">🕰️</span></div><p className="mt-6 leading-7 text-zinc-300">이야기꾼이 방을 만들고, 멤버들과 함께 진실을 찾아보세요.</p><div className="mt-5 flex flex-wrap gap-2">{['이야기꾼 + 5~15명','점철되는 혼란','피로 물든 달'].map(t=><span key={t} className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-zinc-300">{t}</span>)}</div><span className="mt-auto flex min-h-14 items-center justify-center rounded-2xl bg-violet-300 font-black text-zinc-950">시계탑 대기실 입장 →</span></Link>;
}
