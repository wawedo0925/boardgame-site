"use client";
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { LiveMember } from '@/lib/clocktower/live';
import { ClocktowerName } from './ClocktowerSeating';

export function activityDelay(id:string, seconds?:number) {
  if (seconds !== undefined && Number.isFinite(seconds)) return Math.max(1,Math.min(5,Math.round(seconds)));
  return 1+[...id].reduce((hash,c)=>(hash+c.charCodeAt(0))%5,0);
}

// Real requests and cover activities deliberately share every interactive control.
export default function ClocktowerNightActivity({id,prompt,message,members,count,busy,seconds,onConfirm,children}:{
  id:string;prompt:string;message?:string;members:LiveMember[];count:number;busy:boolean;seconds?:number;
  onConfirm:(targets:string[])=>Promise<unknown>;children?:ReactNode;
}) {
  const [picked,setPicked]=useState<string[]>([]);
  const [remaining,setRemaining]=useState(()=>activityDelay(id,seconds));
  useEffect(()=>{
    const deadline=Date.now()+activityDelay(id,seconds)*1000;
    const timer=setInterval(()=>setRemaining(Math.max(0,Math.ceil((deadline-Date.now())/1000))),100);
    return ()=>clearInterval(timer);
  },[id,seconds]);
  const ready=remaining===0&&picked.length===count&&!busy;
  return <div className="space-y-4">
    <p className="whitespace-pre-wrap text-lg leading-8">{prompt}</p>
    {children}
    {message!==undefined&&<p className="whitespace-pre-wrap rounded-2xl bg-violet-400/10 p-5 text-2xl font-bold leading-relaxed">{message}</p>}
    {count>0&&<><p className="text-sm text-violet-200">{count}명 선택 · {picked.length}/{count}</p>
      <div className="grid grid-cols-2 gap-2">{members.map(m=><button key={m.user_id} aria-pressed={picked.includes(m.user_id)} disabled={busy} className={`min-h-16 rounded-xl border p-3 text-left ${picked.includes(m.user_id)?'border-violet-300 bg-violet-400/20':'border-white/15'}`} onClick={()=>setPicked(p=>p.includes(m.user_id)?p.filter(id=>id!==m.user_id):p.length<count?[...p,m.user_id]:count===1?[m.user_id]:p)}>{m.seat}. <ClocktowerName member={m}/>{picked.includes(m.user_id)&&<span aria-hidden="true" className="ml-2 text-violet-200">✓</span>}</button>)}</div>
    </>}
    <p className="text-sm text-violet-200" role="status">{remaining>0?`${remaining}초 뒤 확인 버튼이 활성화됩니다.`:'확인 버튼을 눌러 주세요.'}</p>
    <button disabled={!ready} className="min-h-12 w-full rounded-xl bg-violet-400 px-5 py-3 font-bold text-zinc-950 disabled:opacity-40" onClick={()=>{if(ready)void onConfirm(picked);}}>확인</button>
  </div>;
}
