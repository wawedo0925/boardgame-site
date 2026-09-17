"use client";
import {useMemo,useState} from 'react';
import {createClient} from '@/lib/supabase/client';
import {clearRoundResults} from '@/lib/services/rounds';
import type {EventGameRound} from '@/types/event';

export default function CooperativeResultDialog({round,onClose,onSaved}:{round:EventGameRound;onClose:()=>void;onSaved:()=>Promise<void>|void}) {
  const supabase=useMemo(()=>createClient(),[]);
  const previous=round.players.filter(p=>!p.is_gm);
  const wasSemi=previous.some(p=>p.team_name==='반협력 플레이어'||p.team_name==='반협력 배신자');
  const previousPlayerOutcome=previous.map(p=>p.is_winner===null?null:p.team_name==='반협력 배신자'?!p.is_winner:p.is_winner);
  const [won,setWon]=useState<boolean|null>(previousPlayerOutcome.length&&previousPlayerOutcome.every(v=>v===previousPlayerOutcome[0])?previousPlayerOutcome[0]:null);
  const [score,setScore]=useState(previous.length&&previous.every(p=>p.score===previous[0].score)?previous[0].score?.toString()??'':'');
  const [gm,setGm]=useState(round.players.filter(p=>p.is_gm).map(p=>p.user_id));
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [semi,setSemi]=useState(wasSemi);
  const [traitors,setTraitors]=useState(previous.filter(p=>p.team_name==='반협력 배신자').map(p=>p.user_id));
  const activeTraitors=round.players.filter(p=>!gm.includes(p.user_id)&&traitors.includes(p.user_id));
  const noPlayers=semi&&round.players.every(p=>gm.includes(p.user_id)||traitors.includes(p.user_id));
  async function save(){
    if(busy||won===null||gm.length===round.players.length||noPlayers)return;
    const points=score.trim()?Number(score):null;
    if(points!==null&&!Number.isFinite(points)){setError('점수를 확인해 주세요.');return;}
    setBusy(true);setError('');
    try{
      const {error}=await supabase.from('event_round_players').upsert(round.players.map(p=>({round_id:round.id,user_id:p.user_id,is_gm:gm.includes(p.user_id),score:gm.includes(p.user_id)?null:points,rank:null,role_name:gm.includes(p.user_id)||!semi?null:traitors.includes(p.user_id)?'배신자':'플레이어',team_name:gm.includes(p.user_id)?null:semi?(traitors.includes(p.user_id)?'반협력 배신자':'반협력 플레이어'):'협력 팀',is_winner:gm.includes(p.user_id)?null:semi&&traitors.includes(p.user_id)?!won:won,updated_at:new Date().toISOString()})),{onConflict:'round_id,user_id'});
      if(error)throw error;await onSaved();onClose();
    }catch(e){setError(typeof e==='object'&&e&&'message'in e?String(e.message):'결과 저장에 실패했습니다.');}finally{setBusy(false);}
  }
  return <div className="fixed inset-0 z-[120] flex items-end bg-black/75 sm:items-center sm:justify-center"><section role="dialog" aria-modal="true" aria-labelledby="coop-title" className="max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-zinc-950 p-5 text-white sm:max-w-lg sm:rounded-3xl">
    <div className="flex items-center justify-between"><h2 id="coop-title" className="text-xl font-bold">{semi?'반협력게임 결과':'협력게임 결과'}</h2><button disabled={busy} onClick={onClose} className="min-h-11 px-3">닫기</button></div>
    <p className="mt-3 text-sm text-zinc-400">{semi?'멤버별 플레이어·배신자를 지정하고 승리 진영을 선택하세요. GM은 결과에서 제외됩니다.':'팀의 승리·패배를 선택하면 GM을 제외한 참가자 모두에게 같은 결과가 저장됩니다.'}</p>
    <button disabled={busy} aria-pressed={semi} onClick={()=>{setSemi(v=>!v);setWon(null);setError('');}} className={`mt-4 min-h-12 w-full rounded-xl border font-bold ${semi?'border-purple-400 bg-purple-400/15 text-purple-300':'border-white/20 text-zinc-300'}`}>{semi?'✓ 반 협력 모드 · 누르면 일반 협력으로':'반 협력 모드'}</button>
    <div className="my-5 grid grid-cols-2 gap-3">{[true,false].map(value=><button key={String(value)} disabled={busy} aria-pressed={won===value} onClick={()=>setWon(value)} className={`min-h-14 rounded-xl border font-bold ${won===value?'border-amber-300 bg-amber-400 text-black':'border-white/20'}`}>{semi?(value?'플레이어 승리':activeTraitors.length?'배신자 승리':'플레이어 패배'):(value?'팀 승리':'팀 패배')}</button>)}</div>
    <label className="block text-sm">{semi?'공통 점수 (선택)':'팀 점수 (선택)'}<input type="number" value={score} disabled={busy} onChange={e=>setScore(e.target.value)} placeholder="점수가 없는 게임은 비워 두세요" className="mt-2 h-12 w-full rounded-xl bg-zinc-900 px-3"/></label>
    <div className="my-5 space-y-3">{round.players.map(p=><div key={p.user_id} className="rounded-xl border border-white/10 p-3"><div className="flex items-center justify-between gap-2"><span>{p.profile?.activity_name||'회원'}</span><button disabled={busy} aria-pressed={gm.includes(p.user_id)} onClick={()=>{setGm(ids=>ids.includes(p.user_id)?ids.filter(id=>id!==p.user_id):[...ids,p.user_id]);setWon(null);}} className="min-h-11 rounded-xl border border-white/20 px-3">{gm.includes(p.user_id)?'✓ GM':'GM 지정'}</button></div>{semi&&!gm.includes(p.user_id)&&<div className="mt-2 grid grid-cols-2 gap-2">{[false,true].map(traitor=><button key={String(traitor)} disabled={busy} aria-pressed={traitors.includes(p.user_id)===traitor} onClick={()=>{setTraitors(ids=>traitor?[...ids.filter(id=>id!==p.user_id),p.user_id]:ids.filter(id=>id!==p.user_id));setWon(null);}} className={`min-h-11 rounded-xl border text-sm font-bold ${traitors.includes(p.user_id)===traitor?'border-purple-400 bg-purple-400/15 text-purple-300':'border-white/15 text-zinc-400'}`}>{traitor?'배신자':'플레이어'}</button>)}</div>}</div>)}</div>
    {noPlayers&&<p className="mb-3 text-sm text-red-300">GM 외에 플레이어를 한 명 이상 지정해 주세요.</p>}
    {error&&<p role="alert" className="mb-3 text-red-300">{error}</p>}
    <div className="flex gap-3"><button disabled={busy} className="min-h-12 rounded-xl border border-white/20 px-3" onClick={async()=>{if(!confirm('이 판의 결과를 삭제할까요?'))return;setBusy(true);try{await clearRoundResults(supabase,round.id);await onSaved();onClose();}catch{setError('결과 삭제에 실패했습니다.');}finally{setBusy(false);}}}>결과 삭제</button><button disabled={busy||won===null||gm.length===round.players.length||noPlayers} onClick={()=>void save()} className="min-h-12 flex-1 rounded-xl bg-amber-400 font-bold text-black disabled:opacity-40">결과 저장</button></div>
  </section></div>;
}
