"use client";
import {useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {clearRoundResults} from '@/lib/services/rounds';
import type {EventGameRound} from '@/types/event';

export default function CooperativeResultDialog({round,onClose,onSaved}:{round:EventGameRound;onClose:()=>void;onSaved:()=>Promise<void>|void}) {
  const supabase=useMemo(()=>createClient(),[]);
  const previous=round.players.filter(p=>!p.is_gm);
  const [won,setWon]=useState<boolean|null>(previous.length&&previous.every(p=>p.is_winner===previous[0].is_winner)?previous[0].is_winner:null);
  const [score,setScore]=useState(previous.length&&previous.every(p=>p.score===previous[0].score)?previous[0].score?.toString()??'':'');
  const [gm,setGm]=useState(round.players.filter(p=>p.is_gm).map(p=>p.user_id));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  async function save(){
    if(won===null||gm.length===round.players.length)return;
    const points=score.trim()?Number(score):null;
    if(points!==null&&!Number.isFinite(points)){setError('점수를 확인해 주세요.');return;}
    setBusy(true);setError('');
    try{
      const {error}=await supabase.from('event_round_players').upsert(round.players.map(p=>({round_id:round.id,user_id:p.user_id,is_gm:gm.includes(p.user_id),score:gm.includes(p.user_id)?null:points,rank:null,role_name:null,team_name:gm.includes(p.user_id)?null:'협력 팀',is_winner:gm.includes(p.user_id)?null:won,updated_at:new Date().toISOString()})),{onConflict:'round_id,user_id'});
      if(error)throw error;await onSaved();onClose();
    }catch(e){setError(typeof e==='object'&&e&&'message'in e?String(e.message):'결과 저장에 실패했습니다.');}finally{setBusy(false);}
  }
  return <div className="fixed inset-0 z-[120] flex items-end bg-black/75 sm:items-center sm:justify-center"><section role="dialog" aria-modal="true" aria-labelledby="coop-title" className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-zinc-950 p-5 text-white sm:max-w-lg sm:rounded-3xl">
    <div className="flex items-center justify-between"><h2 id="coop-title" className="text-xl font-bold">협력게임 결과</h2><button disabled={busy} onClick={onClose} className="min-h-11 px-3">닫기</button></div>
    <p className="mt-3 text-sm text-zinc-400">팀의 승리·패배를 선택하면 GM을 제외한 참가자 모두에게 같은 결과가 저장됩니다.</p>
    <div className="my-5 grid grid-cols-2 gap-3">{[true,false].map(value=><button key={String(value)} disabled={busy} aria-pressed={won===value} onClick={()=>setWon(value)} className={`min-h-14 rounded-xl border font-bold ${won===value?'border-amber-300 bg-amber-400 text-black':'border-white/20'}`}>{value?'팀 승리':'팀 패배'}</button>)}</div>
    <label className="block text-sm">팀 점수 (선택)<input type="number" value={score} disabled={busy} onChange={e=>setScore(e.target.value)} placeholder="점수가 없는 게임은 비워 두세요" className="mt-2 h-12 w-full rounded-xl bg-zinc-900 px-3"/></label>
    <div className="my-5 space-y-2">{round.players.map(p=><div key={p.user_id} className="flex items-center justify-between gap-2"><span>{p.profile?.activity_name||'회원'}</span><button disabled={busy} aria-pressed={gm.includes(p.user_id)} onClick={()=>setGm(ids=>ids.includes(p.user_id)?ids.filter(id=>id!==p.user_id):[...ids,p.user_id])} className="min-h-11 rounded-xl border border-white/20 px-3">{gm.includes(p.user_id)?'✓ GM':'GM 지정'}</button></div>)}</div>
    {error&&<p role="alert" className="mb-3 text-red-300">{error}</p>}
    <div className="flex gap-3"><button disabled={busy} className="min-h-12 rounded-xl border border-white/20 px-3" onClick={async()=>{if(!confirm('이 판의 결과를 삭제할까요?'))return;setBusy(true);try{await clearRoundResults(supabase,round.id);await onSaved();onClose();}catch{setError('결과 삭제에 실패했습니다.');}finally{setBusy(false);}}}>결과 삭제</button><button disabled={busy||won===null||gm.length===round.players.length} onClick={()=>void save()} className="min-h-12 flex-1 rounded-xl bg-amber-400 font-bold text-black disabled:opacity-40">결과 저장</button></div>
  </section></div>;
}
