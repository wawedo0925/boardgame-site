"use client";
import {useState} from 'react';
import type {LiveState} from '@/lib/clocktower/live';
import {voteOutcome} from '@/lib/clocktower/voting';
import ClocktowerPopup from './ClocktowerPopup';
import ClocktowerNominationAlert, { vibrateNomination } from './ClocktowerNominationAlert';
import {ClocktowerName} from './ClocktowerSeating';
const button='rounded-xl border border-white/20 px-4 py-3 disabled:opacity-40';
const field='mt-2 w-full rounded-xl border border-white/20 bg-zinc-900 p-3';
export default function ClocktowerVoting({state,run,busy,error,allowPopup=true}:{allowPopup?:boolean;state:LiveState;run:(action:string,data?:Record<string,unknown>)=>Promise<boolean>;busy:boolean;error:string}){
 const [nominator,setNominator]=useState('');const [nominee,setNominee]=useState('');
 const [seenVote,setSeenVote]=useState('');
 const [seenNomination,setSeenNomination]=useState('');
 const [vibrationHint,setVibrationHint]=useState('');
 const [butlerChecked,setButlerChecked]=useState('');
 const votes=state.votes??[];const members=state.members??[];const active=votes.find(v=>v.status==='WAITING'||v.status==='RUNNING');
 const me=members.find(m=>m.user_id===state.my_id);
 const mine=state.is_host?nominator:state.my_id;
 const alreadyNominated=votes.some(v=>v.nominator===mine);
 const mayNominate=!!mine&&!alreadyNominated&&members.some(m=>m.user_id===mine&&m.alive);
 const outcome=voteOutcome(votes);
 const name=(id:string)=>{const m=members.find(m=>m.user_id===id);return m?<ClocktowerName member={m}/>:<span>참가자</span>;};
 if(state.room?.phase!=='DAY')return null;
 return <section className="space-y-4 rounded-3xl border border-violet-400/30 p-5">
  <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">지목·투표</h2>{state.is_host&&<button className={button} onClick={()=>setVibrationHint(vibrateNomination()?'진동을 요청했습니다. 실제로 울리는지 확인해 주세요.':'이 기기 또는 브라우저에서는 진동을 사용할 수 없습니다. 팝업으로 알려드릴게요.')}>진동 테스트</button>}</div>
  {state.is_host&&<p className="text-xs leading-6 text-zinc-400">지목이 오면 팝업과 진동으로 알려드립니다. 진행 화면을 켜 두고 진동 테스트를 한 번 눌러 주세요. 기기·브라우저 설정에 따라 진동은 지원되지 않을 수 있습니다.</p>}
  {state.is_host&&vibrationHint&&<p role="status" className="text-sm text-violet-200">{vibrationHint}</p>}
  {state.is_host&&allowPopup&&state.room.day_stage==='NOMINATIONS'&&active?.status==='WAITING'&&seenNomination!==active.id&&<ClocktowerNominationAlert key={active.id} nominator={members.find(m=>m.user_id===active.nominator)?.name??'참가자'} nominee={members.find(m=>m.user_id===active.nominee)?.name??'참가자'} onClose={()=>setSeenNomination(active.id)}/>}
  {!state.is_host&&active?.status==='RUNNING'&&seenVote!==active.id&&<ClocktowerPopup title="투표가 시작되었습니다" onClose={()=>setSeenVote(active.id)}><p className="text-xl">{name(active.nominee)}님의 처형에 찬성하면 현장에서 손을 들어 주세요.</p><p className="my-4">이야기꾼이 돌아가며 확인하고 기록합니다. 휴대폰에서 투표 버튼을 누르지 않아도 됩니다.</p><button className={button} onClick={()=>setSeenVote(active.id)}>확인</button></ClocktowerPopup>}

  <p className="text-sm leading-6 text-zinc-400">하루에 한 번 지목하고, 한 번만 지목받습니다. 지목된 사람의 다음 자리부터 자리 번호 순서로 진행하며 본인은 마지막입니다. 현장에서 손을 들면 이야기꾼이 누릅니다. 선택하지 않은 사람은 기권입니다.</p>
  {state.room.day_stage==='PRIVATE'&&<p>밀담 시간입니다. 이야기꾼이 다음 페이즈로 넘기면 전체 토론·지목을 시작합니다.</p>}
  {!active&&state.room.day_stage==='NOMINATIONS'&&<form className="space-y-3" onSubmit={async e=>{e.preventDefault();if(await run('vote_nominate',{nominator:mine,nominee})){setNominee('');setNominator('');}}}>
   {state.is_host&&<label className="block">지목한 사람<select required value={nominator} onChange={e=>setNominator(e.target.value)} className={field}><option value="">현장에서 지목한 생존자 선택</option>{members.filter(m=>m.alive&&!votes.some(v=>v.nominator===m.user_id)).map(m=><option key={m.user_id} value={m.user_id}>{m.seat}. {m.name}</option>)}</select></label>}
   {(state.is_host||mayNominate)&&<><label className="block">지목받을 사람<select required value={nominee} onChange={e=>setNominee(e.target.value)} className={field}><option value="">참가자 선택</option>{members.filter(m=>!votes.some(v=>v.nominee===m.user_id)).map(m=><option key={m.user_id} value={m.user_id}>{m.seat}. {m.name}</option>)}</select></label><button disabled={busy||!mayNominate||!nominee} className={button}>지목하기</button></>}
   {!state.is_host&&!mayNominate&&<p className="text-sm text-zinc-400">{!me?.alive?'사망한 참가자는 지목할 수 없습니다.':'오늘 지목을 이미 사용했습니다.'}</p>}
  </form>}
  {active&&<div className="space-y-3 rounded-2xl bg-violet-400/10 p-4"><p className="text-lg">{name(active.nominator)} → <strong>{name(active.nominee)}</strong> 지목</p>
   {active.status==='WAITING'?<><p>변론을 마치면 이야기꾼이 투표를 시작합니다.</p><p className="text-sm text-zinc-400">순서: {[...members].sort((a,b)=>{const seat=members.find(m=>m.user_id===active.nominee)?.seat??0;return (a.seat>seat?0:1)-(b.seat>seat?0:1)||a.seat-b.seat;}).map(m=>m.name).join(' → ')}</p>{state.is_host&&<button disabled={busy} className={button} onClick={()=>void (async()=>{setButlerChecked('');await run('vote_start',{vote_id:active.id});})()}>투표 시작 · 현장 수동 집계</button>}</>:<div className="space-y-3"><p>이야기꾼이 손 든 사람을 확인하고 집계하고 있습니다.</p>{state.is_host&&<><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{active.voter_order.map(id=>{const m=members.find(x=>x.user_id===id);const yes=active.ballots[id]===true;return <button key={id} disabled={busy||(!m?.alive&&m?.ghost_vote_used&&!yes)} aria-pressed={yes} className={`${button} ${yes?'bg-violet-400 text-black':'bg-white/5'}`} onClick={()=>{setButlerChecked('');void run('vote_record',{vote_id:active.id,user_id:id,yes:!yes});}}>{name(id)} · {yes?'O 찬성':'기권'}{!m?.alive&&<span className="block text-xs">{m?.ghost_vote_used?'투표권 없음':'마지막 한 표'}</span>}</button>;})}</div><p>찬성 {Object.values(active.ballots).filter(Boolean).length}표 · 필요 {active.threshold}표</p>{members.filter(m=>m.alive&&m.actual_role==='집사').map(m=><p key={m.user_id} className="text-amber-200">{m.name}의 주인: {members.find(x=>x.user_id===state.engine?.masters?.[m.user_id])?.name??'미지정'} · 건강한 집사는 주인이 손을 들었거나 먼저 집계된 경우에만 찬성할 수 있습니다.</p>)}<label className="flex gap-2"><input type="checkbox" checked={butlerChecked===(active.id+JSON.stringify(active.ballots))} onChange={e=>setButlerChecked(e.target.checked?(active.id+JSON.stringify(active.ballots)):'')}/>집사 등 현장 투표 조건 확인</label><button disabled={busy} className={button} onClick={()=>{if(confirm('현재 표시된 찬성표로 확정할까요? 사망자의 투표권이 차감됩니다.'))void run('vote_finish',{vote_id:active.id,butler_checked:butlerChecked===(active.id+JSON.stringify(active.ballots))});}}>집계 완료</button></>}</div>}
   {state.is_host&&<button disabled={busy} className={`${button} text-sm`} onClick={()=>{if(confirm('현재 지목·투표를 취소할까요? 오늘 사용한 지목은 되돌리지 않으며, 확정 전 찬성 표시는 취소됩니다. '))void run('vote_cancel',{vote_id:active.id});}}>특수 판정·투표 취소</button>}
  </div>}
  {error&&<p role="alert" className="text-red-300">{error}</p>}
  <p className="text-sm text-violet-200">현재 처형 후보: {outcome?<>{name(outcome.vote.nominee)} · {outcome.count}표</>:'없음 (최다 동률 또는 필요 표 미달)'}</p>
  <p className="text-xs text-zinc-500">필요 표는 생존자 수의 절반 이상입니다. 이야기꾼이 다음 페이즈로 넘기면 단독 최다 후보를 처형합니다. 자유 배치의 자리 번호가 실제 시계방향과 일치하는지 시작 전에 확인하세요.</p>
  <div className="space-y-2">{votes.filter(v=>v.status==='DONE'||v.status==='CANCELLED').map(v=><details key={v.id} className="rounded-xl border border-white/10 p-3"><summary>{name(v.nominee)} · {v.status==='CANCELLED'?'취소':`${Object.values(v.ballots).filter(Boolean).length}표 / 필요 ${v.threshold}표`}</summary><p className="mt-2 text-sm">{v.voter_order.map(id=><span key={id} className="mr-3 inline-block">{name(id)}: {v.ballots[id]===true?'O':'기권'}</span>)}</p></details>)}</div>
 </section>;
}
