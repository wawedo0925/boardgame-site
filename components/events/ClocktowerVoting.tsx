"use client";
import {useEffect,useState} from 'react';
import type {LiveState} from '@/lib/clocktower/live';
import {voteOutcome,voteSlot} from '@/lib/clocktower/voting';
import ClocktowerPopup from './ClocktowerPopup';
import {ClocktowerName} from './ClocktowerSeating';
const button='rounded-xl border border-white/20 px-4 py-3 disabled:opacity-40';
const field='mt-2 w-full rounded-xl border border-white/20 bg-zinc-900 p-3';
export default function ClocktowerVoting({state,run,busy,error}:{state:LiveState;run:(action:string,data?:Record<string,unknown>)=>Promise<boolean>;busy:boolean;error:string}){
 const [nominator,setNominator]=useState('');const [nominee,setNominee]=useState('');
 const [now,setNow]=useState(0);const [dismissed,setDismissed]=useState('');const [sent,setSent]=useState('');
 const votes=state.votes??[];const members=state.members??[];const active=votes.find(v=>v.status==='WAITING'||v.status==='RUNNING');
 const offset=state.clock_offset??0;
 useEffect(()=>{const tick=()=>setNow(Date.now()+offset);const timer=setInterval(tick,50);return()=>clearInterval(timer);},[offset]);
 const slot=active?voteSlot(active,now):null;
 const me=members.find(m=>m.user_id===state.my_id);
 const mine=state.is_host?nominator:state.my_id;
 const alreadyNominated=votes.some(v=>v.nominator===mine);
 const mayNominate=!!mine&&!alreadyNominated&&members.some(m=>m.user_id===mine&&m.alive);
 const popup=active?.status==='RUNNING'&&slot?.userId===state.my_id&&!(state.my_id! in active.ballots)&&sent!==active.id;
 const outcome=voteOutcome(votes);
 const name=(id:string)=>{const m=members.find(m=>m.user_id===id);return m?<ClocktowerName member={m}/>:<span>참가자</span>;};
 if(state.room?.phase!=='DAY')return null;
 const submit=async(yes:boolean)=>{if(active&&await run('vote_cast',{vote_id:active.id,yes}))setSent(active.id);};
 return <section className="space-y-4 rounded-3xl border border-violet-400/30 p-5">
  <h2 className="text-xl font-bold">지목·투표</h2>
  <p className="text-sm leading-6 text-zinc-400">하루에 한 번 지목하고, 한 번만 지목받습니다. 지목된 사람의 다음 자리부터 자리 번호 순서로 진행하며 본인은 마지막입니다. 각자 3초, 미응답은 기권입니다.</p>
  {state.room.day_stage==='PRIVATE'&&<p>밀담 시간입니다. 이야기꾼이 다음 페이즈로 넘기면 전체 토론·지목을 시작합니다.</p>}
  {!active&&state.room.day_stage==='NOMINATIONS'&&<form className="space-y-3" onSubmit={async e=>{e.preventDefault();if(await run('vote_nominate',{nominator:mine,nominee})){setNominee('');setNominator('');}}}>
   {state.is_host&&<label className="block">지목한 사람<select required value={nominator} onChange={e=>setNominator(e.target.value)} className={field}><option value="">현장에서 지목한 생존자 선택</option>{members.filter(m=>m.alive&&!votes.some(v=>v.nominator===m.user_id)).map(m=><option key={m.user_id} value={m.user_id}>{m.seat}. {m.name}</option>)}</select></label>}
   {(state.is_host||mayNominate)&&<><label className="block">지목받을 사람<select required value={nominee} onChange={e=>setNominee(e.target.value)} className={field}><option value="">참가자 선택</option>{members.filter(m=>!votes.some(v=>v.nominee===m.user_id)).map(m=><option key={m.user_id} value={m.user_id}>{m.seat}. {m.name}</option>)}</select></label><button disabled={busy||!mayNominate||!nominee} className={button}>지목하기</button></>}
   {!state.is_host&&!mayNominate&&<p className="text-sm text-zinc-400">{!me?.alive?'사망한 참가자는 지목할 수 없습니다.':'오늘 지목을 이미 사용했습니다.'}</p>}
  </form>}
  {active&&<div className="space-y-3 rounded-2xl bg-violet-400/10 p-4"><p className="text-lg">{name(active.nominator)} → <strong>{name(active.nominee)}</strong> 지목</p>
   {active.status==='WAITING'?<><p>변론을 마치면 이야기꾼이 투표를 시작합니다.</p><p className="text-sm text-zinc-400">순서: {[...members].sort((a,b)=>{const seat=members.find(m=>m.user_id===active.nominee)?.seat??0;return (a.seat>seat?0:1)-(b.seat>seat?0:1)||a.seat-b.seat;}).map(m=>m.name).join(' → ')}</p>{state.is_host&&<button disabled={busy} className={button} onClick={()=>void run('vote_start',{vote_id:active.id})}>투표 시작 · 5초 준비 후 각자 3초</button>}</>:<p aria-live="polite">{slot?.preparing?`투표 준비 · ${slot.remaining}초 뒤 시작`:slot?.finished?'집계 중입니다…':<>현재 {slot?.userId&&name(slot.userId)} · {slot?.remaining}초</>}</p>}
   {state.my_id&&state.my_id in active.ballots&&<p className="text-sm text-emerald-300">내 선택: {active.ballots[state.my_id]?'O 찬성':'X 기권'} · 접수 완료</p>}
   {popup&&dismissed===active.id&&<button className={button} onClick={()=>setDismissed('')}>내 투표 팝업 다시 열기</button>}
   {state.is_host&&<button disabled={busy} className={`${button} text-sm`} onClick={()=>{if(confirm('현재 지목·투표를 취소할까요? 오늘 사용한 지목과 이미 쓴 사망자 투표권은 되돌리지 않습니다. '))void run('vote_cancel',{vote_id:active.id});}}>특수 판정·투표 취소</button>}
  </div>}
  {active&&slot?.preparing&&dismissed!==`${active.id}:prepare`&&<ClocktowerPopup key={`${active.id}:prepare`} title="투표가 시작됩니다" subtitle={`${slot.remaining}초 뒤 첫 번째 차례`} onClose={()=>setDismissed(`${active.id}:prepare`)}><p className="text-xl">{name(active.nominee)}님에 대한 투표입니다.</p><p className="mt-4 leading-7">화면을 계속 보고 계세요. 내 차례에 O/X 팝업이 3초 동안 표시됩니다.</p></ClocktowerPopup>}
  {popup&&dismissed!==active!.id&&<ClocktowerPopup key={active!.id} title="투표하시겠습니까?" subtitle={`남은 시간 ${slot?.remaining}초`} busy={busy} onClose={()=>setDismissed(active!.id)}>
   <p className="mb-5 text-center text-xl">{name(active!.nominee)}님의 처형에 찬성하시겠습니까?</p>
   {error&&<p role="alert" className="mb-3 text-red-300">{error}</p>}
   {!me?.alive&&<p className="mb-4 text-amber-200">{state.ghost_vote_used?'사망 후 한 표를 이미 사용했습니다.':'O를 누르면 사망 후 남은 한 표를 사용합니다.'}</p>}
   <div className="grid grid-cols-2 gap-4"><button disabled={busy||(!me?.alive&&state.ghost_vote_used)} className="rounded-2xl bg-violet-400 p-6 text-4xl font-bold text-zinc-950 disabled:opacity-40" onClick={()=>void submit(true)}>O<span className="mt-2 block text-sm">찬성</span></button><button disabled={busy} className="rounded-2xl border border-white/25 p-6 text-4xl font-bold" onClick={()=>void submit(false)}>X<span className="mt-2 block text-sm">기권</span></button></div>
   <p className="mt-4 text-sm text-zinc-400">3초 안에 서버에 접수되지 않으면 기권입니다. 집사 등 능력에 따른 투표 조건은 현장에서 확인해 주세요.</p>
  </ClocktowerPopup>}
  <p className="text-sm text-violet-200">현재 처형 후보: {outcome?<>{name(outcome.vote.nominee)} · {outcome.count}표</>:'없음 (최다 동률 또는 필요 표 미달)'}</p>
  <p className="text-xs text-zinc-500">필요 표는 생존자 수의 절반 이상입니다. 이야기꾼이 다음 페이즈로 넘기면 단독 최다 후보를 처형합니다. 자유 배치의 자리 번호가 실제 시계방향과 일치하는지 시작 전에 확인하세요.</p>
  <div className="space-y-2">{votes.filter(v=>v.status==='DONE'||v.status==='CANCELLED').map(v=><details key={v.id} className="rounded-xl border border-white/10 p-3"><summary>{name(v.nominee)} · {v.status==='CANCELLED'?'취소':`${Object.values(v.ballots).filter(Boolean).length}표 / 필요 ${v.threshold}표`}</summary><p className="mt-2 text-sm">{v.voter_order.map(id=><span key={id} className="mr-3 inline-block">{name(id)}: {v.ballots[id]===true?'O':v.ballots[id]===false?'X':'시간 초과'}</span>)}</p></details>)}</div>
 </section>;
}
