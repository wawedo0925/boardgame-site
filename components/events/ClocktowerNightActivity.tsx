"use client";
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { LiveMember } from '@/lib/clocktower/live';
import { BMR_ROLES, type BmrRequestOptions } from '@/lib/clocktower/bmr';
import { ClocktowerName } from './ClocktowerSeating';

export function activityDelay(id:string, seconds?:number) {
  if (seconds !== undefined && Number.isFinite(seconds)) return Math.max(1,Math.min(5,Math.round(seconds)));
  return 1+[...id].reduce((hash,c)=>(hash+c.charCodeAt(0))%5,0);
}

// Real requests and cover activities deliberately share every interactive control.
export default function ClocktowerNightActivity({id,prompt,message,members,count,busy,seconds,onConfirm,children,options}:{
  id:string;prompt:string;message?:string;members:LiveMember[];count:number;busy:boolean;seconds?:number;
  onConfirm:(targets:string[],answer?:{character?:string;pass?:boolean})=>Promise<unknown>;children?:ReactNode;options?:BmrRequestOptions;
}) {
  const [character,setCharacter]=useState('');
  const [pass,setPass]=useState(false);
  const [picked,setPicked]=useState<string[]>([]);
  const [remaining,setRemaining]=useState(()=>activityDelay(id,seconds));
  useEffect(()=>{
    const deadline=Date.now()+activityDelay(id,seconds)*1000;
    const timer=setInterval(()=>setRemaining(Math.max(0,Math.ceil((deadline-Date.now())/1000))),100);
    return ()=>clearInterval(timer);
  },[id,seconds]);
  const ready=remaining===0&&(pass||picked.length===count&&(!options?.character||!!character))&&!busy;
  return <div className="space-y-4">
    <p className="whitespace-pre-wrap text-lg leading-8">{prompt}</p>
    {children}
    {message!==undefined&&<p className="whitespace-pre-wrap rounded-2xl bg-violet-400/10 p-5 text-2xl font-bold leading-relaxed">{message}</p>}
    {options?.pass&&<label className="flex items-center gap-3"><input type="checkbox" disabled={busy||remaining>0} checked={pass} onChange={e=>{setPass(e.target.checked);setPicked([]);}}/>이번에는 능력을 사용하지 않기</label>}
    {options?.character&&!pass&&<label className="block">캐릭터 선택<select className="mt-2 w-full rounded-xl border border-white/20 bg-zinc-900 p-3" disabled={busy||remaining>0} value={character} onChange={e=>setCharacter(e.target.value)}><option value="">선택해 주세요</option>{BMR_ROLES.map(r=><option key={r.name}>{r.name}</option>)}</select></label>}
    {count>0&&!pass&&<><p className="text-sm text-violet-200">{count}명 선택 · {picked.length}/{count}</p>
      <div className="grid grid-cols-2 gap-2">{members.map(m=><button key={m.user_id} aria-pressed={picked.includes(m.user_id)} disabled={busy||remaining>0} className={`min-h-16 rounded-xl border p-3 text-left disabled:opacity-40 ${picked.includes(m.user_id)?'border-violet-300 bg-violet-400/20':'border-white/15'}`} onClick={()=>{if(busy||remaining>0)return;setPicked(p=>p.includes(m.user_id)?p.filter(id=>id!==m.user_id):p.length<count?[...p,m.user_id]:count===1?[m.user_id]:p);}}>{m.seat}. <ClocktowerName member={m}/>{picked.includes(m.user_id)&&<span aria-hidden="true" className="ml-2 text-violet-200">✓</span>}</button>)}</div>
    </>}
    <p className="text-sm text-violet-200" role="status">{remaining>0?count>0?`${remaining}초 뒤 멤버를 선택할 수 있습니다.`:`${remaining}초 뒤 확인 버튼이 활성화됩니다.`:!pass&&count>0&&picked.length!==count?'멤버를 선택해 주세요.':!pass&&options?.character&&!character?'캐릭터를 선택해 주세요.':'확인 버튼을 눌러 주세요.'}</p>
    <button disabled={!ready} className="min-h-12 w-full rounded-xl bg-violet-400 px-5 py-3 font-bold text-zinc-950 disabled:opacity-40" onClick={()=>{if(ready)void onConfirm(pass?[]:picked,{character:pass?undefined:character||undefined,pass});}}>확인</button>
  </div>;
}
