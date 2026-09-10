"use client";
import {useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {clearRoundResults} from '@/lib/services/rounds';
import {WOLF_BUCKETS,wolfResults,wolfBucketLabel,type WolfMode} from '@/lib/wolfstreet';
import type {EventGameRound} from '@/types/event';
const button='min-h-11 rounded-xl border border-white/20 px-4 py-2 disabled:opacity-40';
export default function WolfStreetResultDialog({round,onSaved,onClose}:{round:EventGameRound;onSaved:()=>void|Promise<void>;onClose:()=>void}) {
 const supabase=useMemo(()=>createClient(),[]);
 const [mode,setMode]=useState<WolfMode>(round.players.some(p=>p.role_name===WOLF_BUCKETS[2])?'COMBINED':'SPLIT');
 const [scores,setScores]=useState(()=>Object.fromEntries(round.players.map(p=>[p.user_id,p.score?.toString()??''])));
 const [categories,setCategories]=useState(()=>Object.fromEntries(round.players.map(p=>[p.user_id,p.role_name??''])));
 const [gms,setGms]=useState(()=>Object.fromEntries(round.players.map(p=>[p.user_id,!!p.is_gm])));
 const [busy,setBusy]=useState(false);const [error,setError]=useState('');
 const input=round.players.map(p=>({userId:p.user_id,isGm:gms[p.user_id],score:scores[p.user_id].trim()===''?null:Number(scores[p.user_id]),category:categories[p.user_id]}));
 let preview:ReturnType<typeof wolfResults>|null=null;let validation='';
 try{preview=wolfResults(mode,input);}catch(e){validation=e instanceof Error?e.message:'입력 내용을 확인해 주세요.';}
 async function save(){setBusy(true);setError('');try{wolfResults(mode,input);const {error}=await supabase.rpc('save_wolfstreet_results',{p_round_id:round.id,p_mode:mode,p_players:input});if(error)throw error;await onSaved();onClose();}catch(e){setError(typeof e==='object'&&e&&'message'in e?String(e.message):'저장하지 못했습니다.');}finally{setBusy(false);}}
 async function clear(){if(!confirm('이 판의 금액·역할·승패를 삭제할까요?'))return;setBusy(true);try{await clearRoundResults(supabase,round.id);await onSaved();onClose();}catch(e){setError(typeof e==='object'&&e&&'message'in e?String(e.message):'삭제하지 못했습니다.');}finally{setBusy(false);}}
 return <div className="fixed inset-0 z-[100] flex items-end bg-black/75 sm:items-center sm:justify-center"><section role="dialog" aria-modal="true" aria-label="울프스트리트 기록" className="max-h-[92dvh] w-full overflow-y-auto rounded-3xl bg-zinc-950 p-5 text-white sm:max-w-xl"><div className="flex justify-between"><h2 className="text-xl font-bold">울프스트리트 · {round.round_number}판</h2><button disabled={busy} onClick={onClose} className={button}>닫기</button></div>
 <div className="my-5 grid grid-cols-2 gap-2">{(['SPLIT','COMBINED'] as const).map(m=><button key={m} disabled={busy} aria-pressed={mode===m} className={`${button} ${mode===m?'bg-amber-400 text-black':''}`} onClick={()=>setMode(m)}>{m==='SPLIT'?'5~11인 · 역할별 경쟁':'3~4인 · 총액 경쟁'}</button>)}</div>
 <p className="text-sm text-zinc-400">{mode==='SPLIT'?'투자자끼리, 중개인끼리 최종 금액을 비교합니다.':'각자 투자자·중개인으로 번 돈을 합산한 최종 총액을 입력하세요.'} 동점 최고 금액은 공동 승리입니다.</p>
 {round.players.some(p=>p.score!==null&&!WOLF_BUCKETS.includes(p.role_name as typeof WOLF_BUCKETS[number]))&&<p className="my-3 text-amber-200">기존 미분류 기록입니다. 버전·역할을 확인하고 저장하면 해당 기록으로 분류됩니다.</p>}
 <div className="my-5 space-y-3">{round.players.map(p=><div key={p.user_id} className="rounded-xl border border-white/15 p-4"><div className="flex items-center justify-between"><strong>{p.profile?.activity_name||'회원'}</strong><button disabled={busy} className={button} aria-pressed={gms[p.user_id]} onClick={()=>setGms({...gms,[p.user_id]:!gms[p.user_id]})}>{gms[p.user_id]?'✓ GM':'GM 지정'}</button></div>{!gms[p.user_id]&&<>{mode==='SPLIT'&&<div className="my-3 grid grid-cols-2 gap-2">{WOLF_BUCKETS.slice(0,2).map(c=><button key={c} disabled={busy} aria-pressed={categories[p.user_id]===c} className={`${button} ${categories[p.user_id]===c?'bg-amber-400 text-black':''}`} onClick={()=>setCategories({...categories,[p.user_id]:c})}>{c.split('/')[1]}</button>)}</div>}<label className="mt-3 block text-sm">{mode==='SPLIT'?'최종 보유 금액':'최종 총액'}<input disabled={busy} type="number" inputMode="numeric" step="1" value={scores[p.user_id]} onChange={e=>setScores({...scores,[p.user_id]:e.target.value})} className="mt-2 w-full rounded-xl bg-zinc-900 p-3 text-right text-xl"/></label></>}</div>)}</div>
 {preview&&<div className="my-4 rounded-xl bg-amber-400/10 p-3">{(mode==='SPLIT'?WOLF_BUCKETS.slice(0,2):[WOLF_BUCKETS[2]]).map(c=><p key={c}>{wolfBucketLabel(c)} 우승: {preview!.filter(p=>p.category===c&&p.isWinner).map(p=>round.players.find(x=>x.user_id===p.userId)?.profile?.activity_name||'회원').join(', ')}</p>)}</div>}
 {validation&&<p className="my-3 text-amber-200">{validation}</p>}{error&&<p role="alert" className="my-3 text-red-300">{error}</p>}
 <div className="sticky bottom-0 flex gap-3 bg-zinc-950 py-3"><button disabled={busy} className={button} onClick={()=>void clear()}>결과 삭제</button><button disabled={busy||!preview} className={`${button} flex-1 bg-amber-400 font-bold text-black`} onClick={()=>void save()}>{busy?'저장 중…':'결과 저장'}</button></div></section></div>;
}
